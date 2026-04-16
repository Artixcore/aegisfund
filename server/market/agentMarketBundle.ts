import { TradeWatchHttpError } from "../tradewatch/client";
import { getMarketDataProvider } from "./marketDataService";
import type { MarketCandle } from "./types";
import type { MarketCategory } from "./types";

export type TwAgentInstrument = {
  category: MarketCategory;
  symbol: string;
  /** Human-readable asset name for reports. */
  label: string;
};

export type TradeWatchAgentAsset = {
  category: MarketCategory;
  symbol: string;
  label: string;
  timestamp: string;
  currentPrice: number | null;
  bid: number | null;
  ask: number | null;
  /** Close-to-close % change over the loaded OHLC window (null if insufficient data). */
  changePctWindow: number | null;
  trendSummary: string;
  historicalOverview: string;
  marketObservations: string[];
  candleCount: number;
  dataError?: string;
};

export type TradeWatchAgentBook = {
  enabled: boolean;
  retrievedAt: string;
  assets: TradeWatchAgentAsset[];
  /** Set when TradeWatch was skipped or the bundle failed before per-asset fetch. */
  reason?: string;
};

function summarizeTrend(firstClose: number, lastClose: number): string {
  if (!(firstClose > 0) || !(lastClose > 0)) return "Insufficient data for trend.";
  const r = lastClose / firstClose;
  if (r > 1.03) return "Upward over the analysis window.";
  if (r < 0.97) return "Downward over the analysis window.";
  return "Range-bound / sideways over the analysis window.";
}

function buildHistoricalOverview(candles: MarketCandle[], changePctWindow: number | null): string {
  if (candles.length === 0) return "No historical candles returned for this window.";
  const first = candles[0];
  const last = candles[candles.length - 1];
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of candles) {
    hi = Math.max(hi, c.high);
    lo = Math.min(lo, c.low);
  }
  const chg =
    changePctWindow != null && Number.isFinite(changePctWindow)
      ? `${changePctWindow >= 0 ? "+" : ""}${changePctWindow.toFixed(2)}%`
      : "n/a";
  return (
    `${candles.length} daily bars (time field is bar open epoch): close ${first.close.toFixed(6)} -> ${last.close.toFixed(6)} ` +
    `(${chg} window return); range ${lo.toFixed(6)}-${hi.toFixed(6)}.`
  );
}

function observationsFromQuoteAndCandles(
  mid: number | null,
  bid: number | null,
  ask: number | null,
  candles: MarketCandle[],
): string[] {
  const obs: string[] = [];
  if (mid != null && bid != null && ask != null && ask > 0 && bid > 0) {
    const spread = ask - bid;
    const rel = mid > 0 ? (spread / mid) * 100 : 0;
    obs.push(`Bid ${bid.toFixed(6)} / Ask ${ask.toFixed(6)}; mid ${mid.toFixed(6)} (spread ~ ${rel.toFixed(4)}% of mid).`);
  } else if (mid != null) {
    obs.push(`Mid / last ${mid.toFixed(6)}.`);
  }
  if (candles.length >= 2) {
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (prev.close > 0) {
      const d = ((last.close - prev.close) / prev.close) * 100;
      obs.push(`Latest daily vs prior close: ${d >= 0 ? "+" : ""}${d.toFixed(2)}%.`);
    }
  }
  return obs;
}

async function fetchOneAsset(instrument: TwAgentInstrument): Promise<TradeWatchAgentAsset> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 20 * 86_400;
  const provider = getMarketDataProvider();
  const { category, symbol, label } = instrument;

  try {
    const [quote, ohlc] = await Promise.all([
      provider.getLastQuote({ category, symbol, precision: 8 }),
      provider.getHistoricalOhlc({
        category,
        symbol,
        resolution: "86400",
        start,
        end,
      }),
    ]);

    const candles = ohlc.candles ?? [];
    let changePctWindow: number | null = null;
    if (candles.length >= 2) {
      const firstC = candles[0].close;
      const lastC = candles[candles.length - 1].close;
      if (firstC > 0) changePctWindow = ((lastC - firstC) / firstC) * 100;
    }

    const trendSummary =
      candles.length >= 2
        ? summarizeTrend(candles[0].close, candles[candles.length - 1].close)
        : "Trend requires at least two daily closes.";

    const historicalOverview = buildHistoricalOverview(candles, changePctWindow);
    const marketObservations = observationsFromQuoteAndCandles(
      quote.mid,
      quote.bid,
      quote.ask,
      candles,
    );

    return {
      category,
      symbol,
      label,
      timestamp: new Date(quote.timestamp * 1000).toISOString(),
      currentPrice: quote.mid,
      bid: quote.bid,
      ask: quote.ask,
      changePctWindow,
      trendSummary,
      historicalOverview,
      marketObservations,
      candleCount: candles.length,
    };
  } catch (e) {
    const msg =
      e instanceof TradeWatchHttpError
        ? `HTTP ${e.status}`
        : e instanceof Error
          ? e.message
          : String(e);
    console.warn(`[TradeWatch][agents] ${category}/${symbol}: ${msg}`);
    return {
      category,
      symbol,
      label,
      timestamp: new Date().toISOString(),
      currentPrice: null,
      bid: null,
      ask: null,
      changePctWindow: null,
      trendSummary: "Unavailable (data fetch failed).",
      historicalOverview: "Historical series unavailable for this symbol.",
      marketObservations: [`Upstream error: ${msg}`],
      candleCount: 0,
      dataError: msg,
    };
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

/**
 * Fetches TradeWatch last quotes + daily OHLC for agent grounding. Caller must ensure API key is configured.
 */
export async function buildTradeWatchAgentBook(instruments: TwAgentInstrument[]): Promise<TradeWatchAgentBook> {
  const retrievedAt = new Date().toISOString();
  if (instruments.length === 0) {
    return { enabled: true, retrievedAt, assets: [] };
  }
  const assets = await mapPool(instruments, 4, (inst) => fetchOneAsset(inst));
  return { enabled: true, retrievedAt, assets };
}
