/**
 * ICE servers from Vite env. Set `VITE_P2P_ICE_SERVERS` to a JSON array of RTCIceServer objects, e.g.
 * `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]`
 */
import { DEFAULT_RTC_CONFIG } from "./webrtc";

function parseIceServersJson(raw: string | undefined): RTCIceServer[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: RTCIceServer[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const urls = o.urls;
      if (typeof urls === "string") {
        out.push({
          urls,
          username: typeof o.username === "string" ? o.username : undefined,
          credential: typeof o.credential === "string" ? o.credential : undefined,
        });
      } else if (Array.isArray(urls) && urls.every((u) => typeof u === "string")) {
        out.push({
          urls: urls as string[],
          username: typeof o.username === "string" ? o.username : undefined,
          credential: typeof o.credential === "string" ? o.credential : undefined,
        });
      }
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** RTCConfiguration for P2P sessions; merges env ICE with default STUN if env is empty. */
export function getP2pRtcConfiguration(): RTCConfiguration {
  const fromEnv = parseIceServersJson(import.meta.env.VITE_P2P_ICE_SERVERS as string | undefined);
  const iceServers = fromEnv?.length ? fromEnv : DEFAULT_RTC_CONFIG.iceServers;
  return { ...DEFAULT_RTC_CONFIG, iceServers };
}
