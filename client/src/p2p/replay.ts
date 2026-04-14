/** In-memory replay / duplicate guard per peer (fromUserId for inbound). */

const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_TRACKED_IDS = 400;

type PeerState = {
  seenIds: string[];
  seenNonces: string[];
  lastTs: number;
};

export class ReplayGuard {
  private byPeer = new Map<string, PeerState>();

  private pruneLists(st: PeerState) {
    while (st.seenIds.length > MAX_TRACKED_IDS) st.seenIds.shift();
    while (st.seenNonces.length > MAX_TRACKED_IDS) st.seenNonces.shift();
  }

  /**
   * @param peerKey — e.g. fromUserId for inbound messages
   */
  checkAndRecord(peerKey: string, id: string, ts: number, nonce: string): "ok" | "dup_id" | "replay_ts" | "dup_nonce" {
    const now = Date.now();
    if (ts > now + MAX_SKEW_MS) return "replay_ts";
    if (ts < now - MAX_SKEW_MS * 24) return "replay_ts";

    let st = this.byPeer.get(peerKey);
    if (!st) {
      st = { seenIds: [], seenNonces: [], lastTs: 0 };
      this.byPeer.set(peerKey, st);
    }

    if (st.seenIds.includes(id)) return "dup_id";
    if (st.seenNonces.includes(nonce)) return "dup_nonce";

    if (ts + MAX_SKEW_MS < st.lastTs) return "replay_ts";

    st.seenIds.push(id);
    st.seenNonces.push(nonce);
    st.lastTs = Math.max(st.lastTs, ts);
    this.pruneLists(st);
    return "ok";
  }
}
