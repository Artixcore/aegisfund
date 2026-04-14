type RelayIncoming =
  | { t: "rtc"; sessionId: string; payload: string }
  | { t: "groupBroadcast"; groupId: string; payloadB64: string }
  | { t: "mbox"; blobB64: string }
  | { t: "error"; message: string };

/** WebSocket helper for optional self-hosted P2P relay (signaling + group fan-out + mailbox hints). */
export class P2pRelayClient {
  private ws: WebSocket | null = null;
  private queue: string[] = [];

  constructor(private readonly baseUrl: string) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(opts: {
    onRtc?: (sessionId: string, payload: string) => void;
    onGroup?: (groupId: string, payloadB64: string) => void;
    onMailbox?: (blobB64: string) => void;
    onError?: (m: string) => void;
  }): Promise<void> {
    const url = this.baseUrl.replace(/\/$/, "");
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        this.ws = ws;
        ws.onopen = () => {
          for (const q of this.queue) ws.send(q);
          this.queue = [];
          resolve();
        };
        ws.onerror = () => reject(new Error("WebSocket error"));
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as RelayIncoming;
            if (msg.t === "rtc") opts.onRtc?.(msg.sessionId, msg.payload);
            else if (msg.t === "groupBroadcast") opts.onGroup?.(msg.groupId, msg.payloadB64);
            else if (msg.t === "mbox") opts.onMailbox?.(msg.blobB64);
            else if (msg.t === "error") opts.onError?.(msg.message);
          } catch {
            /* ignore */
          }
        };
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  sendRaw(obj: unknown) {
    const s = JSON.stringify(obj);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(s);
    else this.queue.push(s);
  }

  joinRtcSession(sessionId: string, role: "init" | "ans", userId?: string) {
    this.sendRaw({ t: "join", sessionId, role, userId });
  }

  sendRtc(sessionId: string, payload: string) {
    this.sendRaw({ t: "rtc", sessionId, payload });
  }

  joinGroup(groupId: string) {
    this.sendRaw({ t: "groupJoin", groupId });
  }

  broadcastGroup(groupId: string, payloadB64: string) {
    this.sendRaw({ t: "groupBroadcast", groupId, payloadB64 });
  }

  putMailbox(toUserId: string, blobB64: string, ttlSec: number) {
    this.sendRaw({ t: "mboxPut", toUserId, blobB64, ttlSec });
  }

  fetchMailbox(forUserId: string) {
    this.sendRaw({ t: "mboxFetch", forUserId });
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* */
    }
    this.ws = null;
    this.queue = [];
  }
}
