"use client";

import { MutationCache, QueryClient, onlineManager, useIsRestoring, useQuery, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { User as FirebaseUser } from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { setActiveRequester } from "../lib/active-requester";
import { ApiError, createRequester, type Requester } from "../lib/api";
import type { Profile } from "../lib/domain";
import {
  getPersistenceAccount,
  idbStorage,
  recordSyncIssue,
  resolveSyncIssue,
  setPersistenceAccount,
} from "../lib/idb-storage";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  dictionaries,
  isLanguage,
  type Language,
} from "../lib/i18n";
import { registerOfflineMutationDefaults } from "../lib/offline-mutations";
import { hasPersistableQueryData } from "../lib/query-persistence";
import { ToastProvider } from "./ui/toast";

// --- Language -------------------------------------------------------------------------------
// The stored preference is an external store, so it is read through useSyncExternalStore rather
// than copied into state by an effect. The server snapshot is always the default, which keeps
// hydration stable.

const languageListeners = new Set<() => void>();

function subscribeToLanguage(onChange: () => void) {
  languageListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    languageListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readLanguage(): Language {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
}

function readServerLanguage(): Language {
  return DEFAULT_LANGUAGE;
}

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (typeof dictionaries)[Language];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside <Providers>.");
  return context;
}

/** Convenience: the dictionary alone, which is what most components need. */
export function useT() {
  return useLanguage().t;
}

function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeToLanguage, readLanguage, readServerLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    languageListeners.forEach((listener) => listener());
  }, []);

  const value = useMemo(
    () => ({ language, setLanguage, t: dictionaries[language] }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// --- Authentication -------------------------------------------------------------------------

export type AuthStatus = "loading" | "signed-out" | "denied" | "unavailable" | "ready";

type AuthContextValue = {
  status: AuthStatus;
  profile: Profile | null;
  /** Email of the signed-in Firebase account, available even when access is denied. */
  email: string | null;
  /** Photo supplied by the Google account, so the profile screen never has to ask for a URL. */
  googlePhotoUrl: string | null;
  request: Requester;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Set when sign-in itself failed (bad configuration, popup blocked). */
  problem: string | null;
  retry: () => void;
  setProfile: (profile: Profile) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <Providers>.");
  return context;
}

/** The signed-in profile, or null. Most screens run behind the auth gate and can assume it. */
export function useProfile() {
  return useAuth().profile;
}

type AuthState = { resolved: boolean; user: FirebaseUser | null };

function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [{ resolved, user: firebaseUser }, setAuthState] = useState<AuthState>({
    resolved: false,
    user: null,
  });
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    void import("../lib/firebase-client")
      .then(({ getFirebaseAuth }) =>
        import("firebase/auth").then(({ onAuthStateChanged }) => {
          unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
            const persistedAccount = getPersistenceAccount();
            if (!user) {
              // Switch persistence scope before clearing so the previous account's offline copy
              // remains isolated and can be reused only after that same account signs in again.
              setPersistenceAccount(null);
              queryClient.clear();
            } else if (persistedAccount !== user.uid) {
              // A legacy unscoped cache may already contain this user's profile. Preserve it for
              // a seamless migration; otherwise clear generic keys before changing accounts.
              const belongsToUser = !!queryClient.getQueryData(["me", user.uid]);
              setPersistenceAccount(user.uid);
              if (!belongsToUser) queryClient.clear();
            }
            setAuthState({ resolved: true, user });
          });
        }),
      )
      .catch((reason: Error) => {
        setProblem(reason.message);
        setAuthState({ resolved: true, user: null });
      });
    return () => unsubscribe();
  }, [queryClient]);

  const request = useMemo<Requester>(
    () =>
      createRequester(async () => {
        if (!firebaseUser) throw new ApiError("unauthorized", 401, "Sign in required.");
        return firebaseUser.getIdToken();
      }),
    [firebaseUser],
  );

  const meQuery = useQuery({
    queryKey: ["me", firebaseUser?.uid ?? null],
    enabled: !!firebaseUser,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => (await request<{ data: Profile }>("/me")).data,
  });

  const signIn = useCallback(async () => {
    setProblem(null);
    try {
      const [{ getFirebaseAuth }, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([
        import("../lib/firebase-client"),
        import("firebase/auth"),
      ]);
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const signOut = useCallback(async () => {
    const [{ getFirebaseAuth }, { signOut: firebaseSignOut }] = await Promise.all([
      import("../lib/firebase-client"),
      import("firebase/auth"),
    ]);
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const setProfile = useCallback(
    (profile: Profile) => queryClient.setQueryData(["me", firebaseUser?.uid ?? null], profile),
    [queryClient, firebaseUser],
  );

  const failure = meQuery.error;
  const denied = failure instanceof ApiError && (failure.code === "access_denied" || failure.status === 403);
  const unavailable = !!failure && !denied;

  const status: AuthStatus = !resolved
    ? "loading"
    : !firebaseUser
      ? "signed-out"
      : denied
        ? "denied"
        : meQuery.data
          ? "ready"
          : unavailable
            ? "unavailable"
            : "loading";

  // Offline-queued mutations need the *current* requester, not the one captured when they were
  // first called (which no longer exists after a reload) — see lib/active-requester.ts.
  useEffect(() => {
    setActiveRequester(request);
  }, [request]);

  // Paused mutations already resume automatically the moment the browser comes back online (a
  // built-in QueryClient behaviour). This covers the one gap that doesn't: a reload that lands
  // already online, where no further "online" transition will ever fire to trigger it.
  //
  // Deliberately waits for `status === "ready"` rather than resuming as soon as the cache is
  // restored: a resumed mutation calls getActiveRequester(), so firing it before sign-in resolves
  // would throw, fail the mutation, and silently discard the queued offline write.
  const isRestoring = useIsRestoring();
  useEffect(() => {
    if (isRestoring || status !== "ready") return;
    void queryClient.resumePausedMutations();
  }, [isRestoring, status, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile: meQuery.data ?? null,
      email: firebaseUser?.email ?? null,
      googlePhotoUrl: firebaseUser?.photoURL ?? null,
      request,
      signIn,
      signOut,
      problem,
      retry: () => void meQuery.refetch(),
      setProfile,
    }),
    [status, meQuery, firebaseUser, request, signIn, signOut, problem, setProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// --- Composition ----------------------------------------------------------------------------

function ToastLayer({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <ToastProvider dismissLabel={t.dismiss} regionLabel={t.notifications}>
      {children}
    </ToastProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    // OnlineManager starts as `true`, even when the browser itself was launched offline. Seed it
    // before any child query mounts so an offline reload cannot immediately attempt (and fail) a
    // refresh before the connectivity probe has run.
    if (typeof navigator !== "undefined") onlineManager.setOnline(navigator.onLine);

    const client = new QueryClient({
      mutationCache: new MutationCache({
        onError: (error, variables, _context, mutation) => {
          const mutationKey = mutation.options.mutationKey;
          if (!mutationKey || mutationKey[0] !== "offline-mutation") return;
          if (error instanceof ApiError && error.code === "offline") return;
          void recordSyncIssue(mutationKey, variables, error);
        },
        onSuccess: (_data, variables, _context, mutation) => {
          const mutationKey = mutation.options.mutationKey;
          if (mutationKey?.[0] === "offline-mutation") void resolveSyncIssue(mutationKey, variables);
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          // IndexedDB is the offline copy. Inactive screens must not disappear from it merely
          // because they have not been opened during React Query's short default GC window.
          gcTime: Infinity,
          refetchOnWindowFocus: false,
          retry: (failureCount, error) => {
            // Never retry a decision the server already made.
            if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
            return failureCount < 2;
          },
        },
      },
    });
    // Registered before any restore can happen, so a mutation resumed from IndexedDB — its
    // original closure long gone — still knows how to execute.
    registerOfflineMutationDefaults(client);
    return client;
  });
  // Storage methods only touch indexedDB when called (never during SSR render), so building the
  // persister up front is safe.
  const [persister] = useState(() => createAsyncStoragePersister({ storage: idbStorage }));

  useEffect(() => {
    // Browser connectivity is only a hint. Probe the same-origin worker so a DNS/backend outage
    // can pause writes, persist them, and later resume even when no native `online` event fires.
    onlineManager.setEventListener((setOnline) => {
      let disposed = false;
      const probe = async () => {
        if (!navigator.onLine) {
          setOnline(false);
          return;
        }
        try {
          const response = await fetch("/api/health", { cache: "no-store" });
          if (!disposed) setOnline(response.ok);
        } catch {
          if (!disposed) setOnline(false);
        }
      };
      const onOffline = () => setOnline(false);
      const onOnline = () => void probe();
      window.addEventListener("offline", onOffline);
      window.addEventListener("online", onOnline);
      const interval = window.setInterval(() => void probe(), 30_000);
      void probe();
      return () => {
        disposed = true;
        window.clearInterval(interval);
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("online", onOnline);
      };
    });
  }, []);

  // Restores the cached queries and any offline-queued mutations from IndexedDB. Using the
  // provider rather than calling persistQueryClient() directly is what supplies React Query's
  // `isRestoring` flag, which suspends every query from fetching until the restore lands —
  // without it, queries fire against an empty cache first and race the restored data.
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: Infinity,
        buster: "v1",
        // Preserve last-known-good board data when a refresh fails. The default TanStack filter
        // only persists `success` queries, which silently dropped cached cards once their latest
        // network attempt moved them into the `error` state.
        dehydrateOptions: { shouldDehydrateQuery: hasPersistableQueryData },
      }}
    >
      <LanguageProvider>
        <ToastLayer>
          <AuthProvider>{children}</AuthProvider>
        </ToastLayer>
      </LanguageProvider>
    </PersistQueryClientProvider>
  );
}
