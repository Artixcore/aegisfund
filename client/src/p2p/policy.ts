/** Sliding-window rate limits per peer key (in-memory). */

const WINDOW_MS = 60_000;

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly maxPerWindow: number) {}

  allow(key: string): boolean {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    let arr = this.hits.get(key);
    if (!arr) {
      arr = [];
      this.hits.set(key, arr);
    }
    while (arr.length && arr[0]! < cutoff) arr.shift();
    if (arr.length >= this.maxPerWindow) return false;
    arr.push(now);
    return true;
  }
}

/** Default caps: inbound chat frames / outbound sends per peer per minute. */
export const DEFAULT_INBOUND_CHAT_PER_MIN = 120;
export const DEFAULT_OUTBOUND_CHAT_PER_MIN = 60;
