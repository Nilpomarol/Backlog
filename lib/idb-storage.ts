/**
 * Minimal AsyncStorage-shaped wrapper around IndexedDB (getItem/setItem/removeItem returning
 * promises), so @tanstack/query-async-storage-persister can persist the query cache without
 * pulling in an extra key-value library. Methods only touch `indexedDB` when called, so
 * constructing this object during SSR is safe.
 */

const DB_NAME = "backlog-cache";
const STORE_NAME = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = run(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export const idbStorage = {
  getItem: (key: string) => withStore<string | undefined>("readonly", (store) => store.get(key)),
  setItem: (key: string, value: string) => withStore("readwrite", (store) => store.put(value, key)).then(() => {}),
  removeItem: (key: string) => withStore("readwrite", (store) => store.delete(key)).then(() => {}),
};
