/**
 * Optional self-hosted P2P relay: WebRTC signaling fan-out, group ciphertext broadcast, ephemeral mailbox blobs.
 * Run: `npm run relay` (set RELAY_PORT, optional RELAY_SHARED_SECRET for simple mailbox gating).
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket, type RawData } from "ws";

const PORT = Number(process.env.RELAY_PORT ?? "3456");
const MAX_PAYLOAD_CHARS = 512_000;
const MAX_MAILBOX_PER_USER = 50;
const MAX_MAILBOX_BLOB_CHARS = 256_000;
const MAILBOX_TTL_MS_MAX = 7 * 24 * 60 * 60 * 1000;
const RELAY_SHARED_SECRET = process.env.RELAY_SHARED_SECRET?.trim() ?? "";

type Client = {
  ws: WebSocket;
  ip: string;
  rtcSessions: Set<string>;
  groups: Set<string>;
  lastHits: number[];
};

const rtcRooms = new Map<string, { init?: WebSocket; ans?: WebSocket }>();
const groupSubs = new Map<string, Set<WebSocket>>();
const mailbox = new Map<string, { blobB64: string; exp: number }[]>();
const clients = new Map<WebSocket, Client>();

function rateAllow(c: Client, maxPerMinute: number): boolean {
  const now = Date.now();
  c.lastHits = c.lastHits.filter((t) => now - t < 60_000);
  if (c.lastHits.length >= maxPerMinute) return false;
  c.lastHits.push(now);
  return true;
}

function safeJsonParse(raw: RawData): unknown | null {
  try {
    const s = typeof raw === "string" ? raw : raw.toString("utf8");
    if (s.length > MAX_PAYLOAD_CHARS) return null;
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

function pruneMailbox() {
  const now = Date.now();
  for (const [uid, rows] of mailbox) {
    const next = rows.filter((r) => r.exp > now);
    if (next.length) mailbox.set(uid, next);
    else mailbox.delete(uid);
  }
}

setInterval(pruneMailbox, 60_000);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("aegis-p2p-relay ok\n");
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress ?? "unknown";
  const c: Client = { ws, ip, rtcSessions: new Set(), groups: new Set(), lastHits: [] };
  clients.set(ws, c);

  ws.on("message", (raw) => {
    const c2 = clients.get(ws);
    if (!c2) return;
    const msg = safeJsonParse(raw);
    if (!msg || typeof msg !== "object") return;
    const m = msg as Record<string, unknown>;
    const t = m.t;
    if (t === "join" && typeof m.sessionId === "string" && (m.role === "init" || m.role === "ans")) {
      if (!rateAllow(c2, 120)) return;
      const sessionId = m.sessionId;
      c2.rtcSessions.add(sessionId);
      let room = rtcRooms.get(sessionId);
      if (!room) {
        room = {};
        rtcRooms.set(sessionId, room);
      }
      if (m.role === "init") room.init = ws;
      else room.ans = ws;
      return;
    }
    if (t === "rtc" && typeof m.sessionId === "string" && typeof m.payload === "string") {
      if (!rateAllow(c2, 600)) return;
      if (m.payload.length > MAX_PAYLOAD_CHARS) return;
      const room = rtcRooms.get(m.sessionId);
      if (!room) return;
      const other = room.init === ws ? room.ans : room.init;
      try {
        other?.send(JSON.stringify({ t: "rtc", sessionId: m.sessionId, payload: m.payload }));
      } catch {
        /* */
      }
      return;
    }
    if (t === "groupJoin" && typeof m.groupId === "string") {
      if (!rateAllow(c2, 120)) return;
      c2.groups.add(m.groupId);
      let set = groupSubs.get(m.groupId);
      if (!set) {
        set = new Set();
        groupSubs.set(m.groupId, set);
      }
      set.add(ws);
      return;
    }
    if (t === "groupBroadcast" && typeof m.groupId === "string" && typeof m.payloadB64 === "string") {
      if (!rateAllow(c2, 300)) return;
      if (m.payloadB64.length > MAX_PAYLOAD_CHARS) return;
      const set = groupSubs.get(m.groupId);
      if (!set) return;
      const packet = JSON.stringify({ t: "groupBroadcast", groupId: m.groupId, payloadB64: m.payloadB64 });
      for (const peer of set) {
        if (peer !== ws && peer.readyState === peer.OPEN) {
          try {
            peer.send(packet);
          } catch {
            /* */
          }
        }
      }
      return;
    }
    if (t === "mboxPut" && typeof m.toUserId === "string" && typeof m.blobB64 === "string") {
      if (!rateAllow(c2, 60)) return;
      if (RELAY_SHARED_SECRET && m.secret !== RELAY_SHARED_SECRET) {
        ws.send(JSON.stringify({ t: "error", message: "mailbox forbidden" }));
        return;
      }
      if (m.blobB64.length > MAX_MAILBOX_BLOB_CHARS) return;
      const ttlMs = Math.min(
        MAILBOX_TTL_MS_MAX,
        typeof m.ttlSec === "number" && Number.isFinite(m.ttlSec) ? Math.max(1, m.ttlSec) * 1000 : 3600_000,
      );
      const exp = Date.now() + ttlMs;
      const rows = mailbox.get(m.toUserId) ?? [];
      rows.push({ blobB64: m.blobB64, exp });
      while (rows.length > MAX_MAILBOX_PER_USER) rows.shift();
      mailbox.set(m.toUserId, rows);
      return;
    }
    if (t === "mboxFetch" && typeof m.forUserId === "string") {
      if (!rateAllow(c2, 120)) return;
      if (RELAY_SHARED_SECRET && m.secret !== RELAY_SHARED_SECRET) {
        ws.send(JSON.stringify({ t: "error", message: "mailbox forbidden" }));
        return;
      }
      pruneMailbox();
      const rows = mailbox.get(m.forUserId) ?? [];
      mailbox.set(m.forUserId, []);
      for (const r of rows) {
        try {
          ws.send(JSON.stringify({ t: "mbox", blobB64: r.blobB64 }));
        } catch {
          /* */
        }
      }
      return;
    }
  });

  ws.on("close", () => {
    const c3 = clients.get(ws);
    clients.delete(ws);
    if (!c3) return;
    for (const sid of c3.rtcSessions) {
      const room = rtcRooms.get(sid);
      if (!room) continue;
      if (room.init === ws) delete room.init;
      if (room.ans === ws) delete room.ans;
      if (!room.init && !room.ans) rtcRooms.delete(sid);
    }
    for (const gid of c3.groups) {
      const set = groupSubs.get(gid);
      if (!set) continue;
      set.delete(ws);
      if (set.size === 0) groupSubs.delete(gid);
    }
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`aegis-p2p-relay listening on http://127.0.0.1:${PORT}/ws (HTTP GET /)`);
});
