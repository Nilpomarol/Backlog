"use client";

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ApiError, createRequester, type Requester } from "../lib/api";
import type { Profile } from "../lib/domain";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  dictionaries,
  isLanguage,
  type Language,
} from "../lib/i18n";
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
            // Signing out must not leave another account's data in the cache.
            if (!user) queryClient.clear();
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
        : unavailable
          ? "unavailable"
          : meQuery.data
            ? "ready"
            : "loading";

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
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Never retry a decision the server already made.
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ToastLayer>
          <AuthProvider>{children}</AuthProvider>
        </ToastLayer>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
