const DB_NAME = 'strata';
const DB_VERSION = 1;
export const STORES = ['worlds', 'chunks', 'packs', 'packfiles', 'kv'] as const;
export type StoreName = typeof STORES[number];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available in this browser.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('Could not open storage.'));
    req.onblocked = () => reject(new Error('Storage is blocked by another open tab. Close other Strata tabs and retry.'));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return wrap(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function dbPut(store: StoreName, key: IDBValidKey, value: unknown): Promise<void> {
  const db = await openDB();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).put(value, key));
}

export async function dbDelete(store: StoreName, key: IDBValidKey | IDBKeyRange): Promise<void> {
  const db = await openDB();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}

export async function dbKeys(store: StoreName, range?: IDBKeyRange): Promise<IDBValidKey[]> {
  const db = await openDB();
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAllKeys(range));
}

export async function dbAll<T>(store: StoreName, range?: IDBKeyRange): Promise<T[]> {
  const db = await openDB();
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAll(range)) as Promise<T[]>;
}

export async function dbPutMany(store: StoreName, entries: [IDBValidKey, unknown][]): Promise<void> {
  if (!entries.length) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const [k, v] of entries) os.put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted (storage may be full).'));
  });
}

export function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, prefix + '￿');
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
