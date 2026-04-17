import type { MarketCategory } from "./types";

/** How Finnhub routes historical candles for this logical category. */
export type FinnhubCandleKind = "stock" | "forex" | "crypto";

/**
 * Maps public `category` + logical `symbol` to Finnhub's symbol strings.
 * Pass-through if `symbol` already contains `:` (assumed Finnhub-native, e.g. `BINANCE:BTCUSDT`).
 */
export function resolveFinnhubSymbol(category: MarketCategory, symbol: string): { finnhub: string; candleKind: FinnhubCandleKind } {
  const s = symbol.trim();
  if (s.includes(":")) {
    const candleKind: FinnhubCandleKind = s.startsWith("BINANCE:") || s.startsWith("COINBASE:")
      ? "crypto"
      : s.startsWith("OANDA:")
        ? "forex"
        : "stock";
    return { finnhub: s, candleKind };
  }

  const u = s.toUpperCase().replace(/\s+/g, "");

  if (category === "crypto") {
    if (u.endsWith("USDT") || u.endsWith("USDC")) {
      return { finnhub: `BINANCE:${u}`, candleKind: "crypto" };
    }
    const map: Record<string, string> = {
      BTCUSD: "BINANCE:BTCUSDT",
      ETHUSD: "BINANCE:ETHUSDT",
      SOLUSD: "BINANCE:SOLUSDT",
      BTCUSDT: "BINANCE:BTCUSDT",
      ETHUSDT: "BINANCE:ETHUSDT",
      SOLUSDT: "BINANCE:SOLUSDT",
    };
    if (map[u]) return { finnhub: map[u], candleKind: "crypto" };
    return { finnhub: `BINANCE:${u}USDT`, candleKind: "crypto" };
  }

  if (category === "currencies") {
    if (u.length === 6 && /^[A-Z]{6}$/.test(u)) {
      const base = u.slice(0, 3);
      const quote = u.slice(3, 6);
      return { finnhub: `OANDA:${base}_${quote}`, candleKind: "forex" };
    }
    return { finnhub: `OANDA:${u}`, candleKind: "forex" };
  }

  return { finnhub: u, candleKind: "stock" };
}

/** Map second-based resolution strings to Finnhub resolution tokens (1, 5, 15, 60, D, …). */
export function finnhubResolutionFromSeconds(seconds: string): string {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "D";
  if (n >= 86400) return "D";
  if (n >= 3600) return "60";
  if (n >= 900) return "15";
  if (n >= 300) return "5";
  if (n >= 60) return "1";
  return "D";
}
