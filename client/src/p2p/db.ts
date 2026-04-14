import type { P2pIdentityRecord, P2pOutboxRecord, P2pPeerRecord, P2pStoredMessage } from "./types";

const DB_NAME = "aegis-p2p-v1";
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

export function openP2pDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("peers")) db.createObjectStore("peers", { keyPath: "peerId" });
      if (!db.objectStoreNames.contains("messages")) {
        const m = db.createObjectStore("messages", { keyPath: "id" });
        m.createIndex("byPeer", "peerId", { unique: false });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const o = db.createObjectStore("outbox", { keyPath: "id" });
        o.createIndex("byPeer", "peerId", { unique: false });
      }
    };
  });
}

type MetaRow = { key: "identity" | "blocked"; value: unknown };

export async function getIdentity(db: IDBDatabase): Promise<P2pIdentityRecord | null> {
  const tx = db.transaction("meta", "readonly");
  const row = (await reqToPromise(tx.objectStore("meta").get("identity"))) as MetaRow | undefined;
  await txDone(tx);
  return (row?.value as P2pIdentityRecord) ?? null;
}

export async function putIdentity(db: IDBDatabase, id: P2pIdentityRecord): Promise<void> {
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "identity", value: id });
  await txDone(tx);
}

export async function getBlockedPeerIds(db: IDBDatabase): Promise<Set<string>> {
  const tx = db.transaction("meta", "readonly");
  const row = (await reqToPromise(tx.objectStore("meta").get("blocked"))) as MetaRow | undefined;
  await txDone(tx);
  const list = (row?.value as string[] | undefined) ?? [];
  return new Set(list);
}

export async function setBlockedPeerIds(db: IDBDatabase, ids: string[]): Promise<void> {
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "blocked", value: ids });
  await txDone(tx);
}

export async function listPeers(db: IDBDatabase): Promise<P2pPeerRecord[]> {
  const tx = db.transaction("peers", "readonly");
  const all = await reqToPromise(tx.objectStore("peers").getAll());
  await txDone(tx);
  return all as P2pPeerRecord[];
}

export async function putPeer(db: IDBDatabase, peer: P2pPeerRecord): Promise<void> {
  const tx = db.transaction("peers", "readwrite");
  tx.objectStore("peers").put(peer);
  await txDone(tx);
}

export async function getPeer(db: IDBDatabase, peerId: string): Promise<P2pPeerRecord | null> {
  const tx = db.transaction("peers", "readonly");
  const row = await reqToPromise(tx.objectStore("peers").get(peerId));
  await txDone(tx);
  return (row as P2pPeerRecord) ?? null;
}

export async function deletePeer(db: IDBDatabase, peerId: string): Promise<void> {
  const msgs = await listMessagesForPeer(db, peerId);
  const out = await listOutboxForPeer(db, peerId);
  const tx = db.transaction(["peers", "messages", "outbox"], "readwrite");
  tx.objectStore("peers").delete(peerId);
  const msgSt = tx.objectStore("messages");
  for (const m of msgs) msgSt.delete(m.id);
  const obSt = tx.objectStore("outbox");
  for (const o of out) obSt.delete(o.id);
  await txDone(tx);
}

export async function listMessagesForPeer(db: IDBDatabase, peerId: string): Promise<P2pStoredMessage[]> {
  const tx = db.transaction("messages", "readonly");
  const idx = tx.objectStore("messages").index("byPeer");
  const list = (await reqToPromise(idx.getAll(peerId))) as P2pStoredMessage[];
  await txDone(tx);
  return list.sort((a, b) => a.ts - b.ts);
}

export async function putMessage(db: IDBDatabase, msg: P2pStoredMessage): Promise<void> {
  const tx = db.transaction("messages", "readwrite");
  tx.objectStore("messages").put(msg);
  await txDone(tx);
}

export async function listOutbox(db: IDBDatabase): Promise<P2pOutboxRecord[]> {
  const tx = db.transaction("outbox", "readonly");
  const all = await reqToPromise(tx.objectStore("outbox").getAll());
  await txDone(tx);
  return all as P2pOutboxRecord[];
}

export async function listOutboxForPeer(db: IDBDatabase, peerId: string): Promise<P2pOutboxRecord[]> {
  const tx = db.transaction("outbox", "readonly");
  const idx = tx.objectStore("outbox").index("byPeer");
  const rows = (await reqToPromise(idx.getAll(peerId))) as P2pOutboxRecord[];
  await txDone(tx);
  return rows;
}

export async function putOutbox(db: IDBDatabase, row: P2pOutboxRecord): Promise<void> {
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").put(row);
  await txDone(tx);
}

export async function deleteOutbox(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").delete(id);
  await txDone(tx);
}
