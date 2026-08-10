/**
 * Minimal AsyncStorage-shaped wrapper around IndexedDB (getItem/setItem/removeItem returning
 * promises), so @tanstack/query-async-storage-persister can persist the query cache without
 * pulling in an extra key-value library. Methods only touch `indexedDB` when called, so
 * constructing this object during SSR is safe.
 */

const DB_NAME = "backlog-cache";
const STORE_NAME = "kv";
const SYNC_ISSUES_STORE = "sync-issues";
const ACCOUNT_KEY = "backlog-persistence-account";

export type SyncIssue = {
  id: string;
  accountId: string;
  mutationKey: readonly unknown[];
  variables: unknown;
  code: string | null;
  message: string;
  createdAt: number;
};

const syncIssueListeners = new Set<() => void>();

/**
 * Query data is shared by many generic keys (for example `["apps"]`), so the persistence key
 * itself must be account-scoped. The last account is read synchronously during cache restoration;
 * AuthProvider verifies it as soon as Firebase resolves and clears memory on an account switch.
 */
export function getPersistenceAccount(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCOUNT_KEY);
}

export function setPersistenceAccount(accountId: string | null) {
  if (typeof window === "undefined") return;
  if (accountId) window.localStorage.setItem(ACCOUNT_KEY, accountId);
  else window.localStorage.removeItem(ACCOUNT_KEY);
}

function scopedKey(key: string) {
  const accountId = getPersistenceAccount();
  return accountId ? `account:${accountId}:${key}` : key;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      if (!request.result.objectStoreNames.contains(SYNC_ISSUES_STORE)) {
        request.result.createObjectStore(SYNC_ISSUES_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName = STORE_NAME,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export const idbStorage = {
  getItem: async (key: string) => {
    const accountKey = scopedKey(key);
    const value = await withStore<string | undefined>("readonly", (store) => store.get(accountKey));
    // One-time migration from the unscoped v1 cache. AuthProvider validates the embedded `me`
    // query before it allows generic data to survive an account change.
    if (value === undefined && accountKey !== key) {
      return withStore<string | undefined>("readonly", (store) => store.get(key));
    }
    return value;
  },
  setItem: (key: string, value: string) =>
    withStore("readwrite", (store) => store.put(value, scopedKey(key))).then(() => {}),
  removeItem: (key: string) => withStore("readwrite", (store) => store.delete(scopedKey(key))).then(() => {}),
};

function issueId(accountId: string, mutationKey: readonly unknown[], variables: unknown) {
  return `${accountId}:${JSON.stringify(mutationKey)}:${JSON.stringify(variables)}`;
}

export function subscribeSyncIssues(listener: () => void) {
  syncIssueListeners.add(listener);
  return () => {
    syncIssueListeners.delete(listener);
  };
}

function notifySyncIssues() {
  syncIssueListeners.forEach((listener) => listener());
}

export async function listSyncIssues(accountId: string): Promise<SyncIssue[]> {
  const issues = await withStore<SyncIssue[]>("readonly", (store) => store.getAll(), SYNC_ISSUES_STORE);
  return issues.filter((issue) => issue.accountId === accountId).sort((left, right) => left.createdAt - right.createdAt);
}

export async function recordSyncIssue(
  mutationKey: readonly unknown[],
  variables: unknown,
  error: unknown,
): Promise<void> {
  const accountId = getPersistenceAccount();
  if (!accountId) return;
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : null;
  const message = error instanceof Error ? error.message : String(error);
  const issue: SyncIssue = {
    id: issueId(accountId, mutationKey, variables),
    accountId,
    mutationKey,
    variables,
    code,
    message,
    createdAt: Date.now(),
  };
  await withStore("readwrite", (store) => store.put(issue), SYNC_ISSUES_STORE);
  notifySyncIssues();
}

export async function resolveSyncIssue(mutationKey: readonly unknown[], variables: unknown): Promise<void> {
  const accountId = getPersistenceAccount();
  if (!accountId) return;
  await removeSyncIssue(issueId(accountId, mutationKey, variables));
}

export async function removeSyncIssue(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id), SYNC_ISSUES_STORE);
  notifySyncIssues();
}

export async function clearSyncIssues(accountId: string): Promise<void> {
  const issues = await listSyncIssues(accountId);
  await Promise.all(issues.map((issue) => withStore("readwrite", (store) => store.delete(issue.id), SYNC_ISSUES_STORE)));
  notifySyncIssues();
}
