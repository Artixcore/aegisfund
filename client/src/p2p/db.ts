import type {
  P2pGroupMemberRecord,
  P2pGroupOutboxRecord,
  P2pGroupRecord,
  P2pGroupStoredMessage,
  P2pIdentityRecord,
  P2pOutboxRecord,
  P2pPeerRecord,
  P2pStoredMessage,
} from "./types";

const DB_NAME = "aegis-p2p-v1";
/** v2: groups + group outbox; v1: peers/messages/outbox/meta */
const DB_VER = 2;

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
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const old = ev.oldVersion;
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
      if (old < 2) {
        if (!db.objectStoreNames.contains("groups")) db.createObjectStore("groups", { keyPath: "groupId" });
        if (!db.objectStoreNames.contains("groupMembers")) {
          const gm = db.createObjectStore("groupMembers", { keyPath: ["groupId", "userId"] });
          gm.createIndex("byGroup", "groupId", { unique: false });
        }
        if (!db.objectStoreNames.contains("groupMessages")) {
          const gmsg = db.createObjectStore("groupMessages", { keyPath: "id" });
          gmsg.createIndex("byGroup", "groupId", { unique: false });
        }
        if (!db.objectStoreNames.contains("groupOutbox")) {
          const go = db.createObjectStore("groupOutbox", { keyPath: "id" });
          go.createIndex("byGroup", "groupId", { unique: false });
        }
      }
    };
  });
}

type MetaKey = "identity" | "blocked" | "mutedPeers";

type MetaRow = { key: MetaKey; value: unknown };

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

export async function getMutedPeerIds(db: IDBDatabase): Promise<Set<string>> {
  const tx = db.transaction("meta", "readonly");
  const row = (await reqToPromise(tx.objectStore("meta").get("mutedPeers"))) as MetaRow | undefined;
  await txDone(tx);
  const list = (row?.value as string[] | undefined) ?? [];
  return new Set(list);
}

export async function setMutedPeerIds(db: IDBDatabase, ids: string[]): Promise<void> {
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "mutedPeers", value: ids });
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

export async function patchMessage(
  db: IDBDatabase,
  id: string,
  patch: Partial<Pick<P2pStoredMessage, "deliveredAt" | "seenAt" | "expiresAt">>,
): Promise<void> {
  const tx = db.transaction("messages", "readwrite");
  const st = tx.objectStore("messages");
  const cur = (await reqToPromise(st.get(id))) as P2pStoredMessage | undefined;
  if (!cur) {
    await txDone(tx);
    return;
  }
  st.put({ ...cur, ...patch });
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

export async function bumpOutboxAttempt(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction("outbox", "readwrite");
  const st = tx.objectStore("outbox");
  const row = (await reqToPromise(st.get(id))) as P2pOutboxRecord | undefined;
  if (!row) {
    await txDone(tx);
    return;
  }
  st.put({ ...row, attempts: row.attempts + 1 });
  await txDone(tx);
}

/** Wipe user-generated P2P state (identity must be replaced separately). */
export async function clearP2pStores(db: IDBDatabase): Promise<void> {
  const storeNames = [...db.objectStoreNames];
  const tx = db.transaction(storeNames, "readwrite");
  for (const name of storeNames) {
    const st = tx.objectStore(name);
    await reqToPromise(st.clear());
  }
  await txDone(tx);
}

// --- Groups ---

export async function putGroup(db: IDBDatabase, g: P2pGroupRecord): Promise<void> {
  const tx = db.transaction("groups", "readwrite");
  tx.objectStore("groups").put(g);
  await txDone(tx);
}

export async function listGroups(db: IDBDatabase): Promise<P2pGroupRecord[]> {
  const tx = db.transaction("groups", "readonly");
  const all = await reqToPromise(tx.objectStore("groups").getAll());
  await txDone(tx);
  return all as P2pGroupRecord[];
}

export async function getGroup(db: IDBDatabase, groupId: string): Promise<P2pGroupRecord | null> {
  const tx = db.transaction("groups", "readonly");
  const row = await reqToPromise(tx.objectStore("groups").get(groupId));
  await txDone(tx);
  return (row as P2pGroupRecord) ?? null;
}

export async function deleteGroup(db: IDBDatabase, groupId: string): Promise<void> {
  const members = await listGroupMembers(db, groupId);
  const msgs = await listGroupMessages(db, groupId);
  const out = await listGroupOutboxForGroup(db, groupId);
  const tx = db.transaction(["groups", "groupMembers", "groupMessages", "groupOutbox"], "readwrite");
  tx.objectStore("groups").delete(groupId);
  const mst = tx.objectStore("groupMembers");
  for (const m of members) mst.delete([m.groupId, m.userId]);
  const msgSt = tx.objectStore("groupMessages");
  for (const m of msgs) msgSt.delete(m.id);
  const ob = tx.objectStore("groupOutbox");
  for (const o of out) ob.delete(o.id);
  await txDone(tx);
}

export async function putGroupMember(db: IDBDatabase, m: P2pGroupMemberRecord): Promise<void> {
  const tx = db.transaction("groupMembers", "readwrite");
  tx.objectStore("groupMembers").put(m);
  await txDone(tx);
}

export async function listGroupMembers(db: IDBDatabase, groupId: string): Promise<P2pGroupMemberRecord[]> {
  const tx = db.transaction("groupMembers", "readonly");
  const idx = tx.objectStore("groupMembers").index("byGroup");
  const rows = (await reqToPromise(idx.getAll(groupId))) as P2pGroupMemberRecord[];
  await txDone(tx);
  return rows;
}

export async function listGroupMessages(db: IDBDatabase, groupId: string): Promise<P2pGroupStoredMessage[]> {
  const tx = db.transaction("groupMessages", "readonly");
  const idx = tx.objectStore("groupMessages").index("byGroup");
  const rows = (await reqToPromise(idx.getAll(groupId))) as P2pGroupStoredMessage[];
  await txDone(tx);
  return rows.sort((a, b) => a.ts - b.ts);
}

export async function putGroupMessage(db: IDBDatabase, m: P2pGroupStoredMessage): Promise<void> {
  const tx = db.transaction("groupMessages", "readwrite");
  tx.objectStore("groupMessages").put(m);
  await txDone(tx);
}

export async function putGroupOutbox(db: IDBDatabase, row: P2pGroupOutboxRecord): Promise<void> {
  const tx = db.transaction("groupOutbox", "readwrite");
  tx.objectStore("groupOutbox").put(row);
  await txDone(tx);
}

export async function listGroupOutboxForGroup(db: IDBDatabase, groupId: string): Promise<P2pGroupOutboxRecord[]> {
  const tx = db.transaction("groupOutbox", "readonly");
  const idx = tx.objectStore("groupOutbox").index("byGroup");
  const rows = (await reqToPromise(idx.getAll(groupId))) as P2pGroupOutboxRecord[];
  await txDone(tx);
  return rows;
}

export async function deleteGroupOutbox(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction("groupOutbox", "readwrite");
  tx.objectStore("groupOutbox").delete(id);
  await txDone(tx);
}
