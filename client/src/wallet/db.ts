import type { LocalTxRecord, WalletSettings, WrappedVault } from "./types";
import { DEFAULT_WALLET_SETTINGS } from "./types";

const DB_NAME = "aegis-chain-wallet-v1";
const DB_VER = 1;

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openChainWalletDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("vault")) db.createObjectStore("vault", { keyPath: "key" });
      if (!db.objectStoreNames.contains("transactions")) {
        const t = db.createObjectStore("transactions", { keyPath: "id" });
        t.createIndex("byTs", "ts", { unique: false });
      }
    };
  });
}

type MetaRow = { key: "settings"; value: WalletSettings };

export async function getWalletSettings(db: IDBDatabase): Promise<WalletSettings> {
  const tx = db.transaction("meta", "readonly");
  const row = (await reqToPromise(tx.objectStore("meta").get("settings"))) as MetaRow | undefined;
  await txDone(tx);
  return row?.value ? { ...DEFAULT_WALLET_SETTINGS, ...row.value } : { ...DEFAULT_WALLET_SETTINGS };
}

export async function putWalletSettings(db: IDBDatabase, s: WalletSettings): Promise<void> {
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "settings", value: s } satisfies MetaRow);
  await txDone(tx);
}

export async function getVaultWrapped(db: IDBDatabase): Promise<WrappedVault | null> {
  const tx = db.transaction("vault", "readonly");
  const row = (await reqToPromise(tx.objectStore("vault").get("default"))) as { key: string; wrapped: WrappedVault } | undefined;
  await txDone(tx);
  return row?.wrapped ?? null;
}

export async function putVaultWrapped(db: IDBDatabase, wrapped: WrappedVault): Promise<void> {
  const tx = db.transaction("vault", "readwrite");
  tx.objectStore("vault").put({ key: "default", wrapped });
  await txDone(tx);
}

export async function deleteVault(db: IDBDatabase): Promise<void> {
  const tx = db.transaction("vault", "readwrite");
  tx.objectStore("vault").delete("default");
  await txDone(tx);
}

export async function listLocalTxs(db: IDBDatabase, limit = 100): Promise<LocalTxRecord[]> {
  const tx = db.transaction("transactions", "readonly");
  const all = (await reqToPromise(tx.objectStore("transactions").getAll())) as LocalTxRecord[];
  await txDone(tx);
  return all.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export async function putLocalTx(db: IDBDatabase, row: LocalTxRecord): Promise<void> {
  const tx = db.transaction("transactions", "readwrite");
  tx.objectStore("transactions").put(row);
  await txDone(tx);
}

export async function updateLocalTxStatus(db: IDBDatabase, id: string, status: LocalTxRecord["status"]): Promise<void> {
  const tx = db.transaction("transactions", "readwrite");
  const st = tx.objectStore("transactions");
  const cur = (await reqToPromise(st.get(id))) as LocalTxRecord | undefined;
  if (cur) st.put({ ...cur, status });
  await txDone(tx);
}
