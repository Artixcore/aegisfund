import { fetchBtcBalance, fetchEthBalance, fetchSolBalance } from "../blockchain";
import { callDataApi } from "../_core/dataApi";
import { ENV } from "../_core/env";
import { buildTradeWatchAgentBook } from "../market/agentMarketBundle";
import type { TradeWatchAgentBook, TwAgentInstrument } from "../market/agentMarketBundle";
import {
  getLatestPortfolioSnapshot,
  getPortfolioHistory,
  getPriceAlertsByUserId,
  getWalletsByUserId,
} from "../db";

export const DATASET_VERSION = "aegis-features-2026-04-16.6";

export type AgentFeatureKey =
  | "market_analysis"
  | "crypto_monitoring"
  | "forex_monitoring"
  | "futures_commodities"
  | "historical_research"
  | "executive_briefing";

export type FeatureCitation = {
  id: string;
  label: string;
  /** URI or logical ref (e.g. self-hosted Yahoo mirror path). */
  source: string;
  retrievedAt: string;
};

/** Live + stored user context for exposure-aware agent output (optional). */
export type AgentPortfolioBook = {
  asOf: string;
  /** BTC/ETH/SOL USD marks used to value native balances (same route as agent benchmark prices). */
  spotMarkPrices: { BTC?: number; ETH?: number; SOL?: number };
  positions: Array<{
    chain: "BTC" | "ETH" | "SOL";
    walletLabel: string | null;
    addressDisplay: string;
    balanceNative: number;
    valueUsd: number;
    balanceError?: string;
  }>;
  totalsByChain: Record<string, { native: number; usd: number }>;
  totalValueUsd: number;
  lastStoredSnapshot: null | {
    totalValueUsd: number;
    snapshotAt: string;
    ageHoursApprox: number;
  };
  /** Ascending time order, up to 6 recent hourly (or best-effort) NAV samples from DB. */
  recentNavSamples: Array<{ totalValueUsd: number; snapshotAt: string }>;
  activePriceAlerts: Array<{
    symbol: string;
    condition: "above" | "below";
    threshold: string;
  }>;
  /** `live` = on-chain balances fetched; `light` = scheduled run, stored NAV only (no RPC). */
  bookMode?: "live" | "light";
  /** Saved wallet rows for this user (same for live and light). */
  walletRowsTracked?: number;
};

export type AgentFeatureSnapshot = {
  datasetVersion: string;
  agentType: AgentFeatureKey;
  prices: Record<string, { usd: number; changePct24h?: number }>;
  citations: FeatureCitation[];
  notes: string[];
  portfolioBook?: AgentPortfolioBook;
  /** TradeWatch REST snapshot (quotes + daily OHLC summaries). Optional when key missing or fetch failed. */
  tradeWatchBook?: TradeWatchAgentBook;
};

export type BuildFeatureSnapshotOptions = {
  userId?: number;
  /** `light` skips live chain RPC (for scheduled runs); uses last hourly NAV + alerts. */
  portfolioBookMode?: "live" | "light";
};

type YahooSpec = { yahoo: string; key: string };

const CRYPTO_TRIO: YahooSpec[] = [
  { yahoo: "BTC-USD", key: "BTC" },
  { yahoo: "ETH-USD", key: "ETH" },
  { yahoo: "SOL-USD", key: "SOL" },
];

const MACRO_RISK: YahooSpec[] = [
  { yahoo: "^GSPC", key: "SPX" },
  { yahoo: "^VIX", key: "VIX" },
];

/** Per-agent Yahoo symbols; DXY uses ICE continuous (DX-Y.NYB) — may be null if the mirror omits it. */
const AGENT_YAHOO_SPECS: Record<AgentFeatureKey, YahooSpec[]> = {
  crypto_monitoring: [...CRYPTO_TRIO],
  market_analysis: [...CRYPTO_TRIO, ...MACRO_RISK],
  forex_monitoring: [
    { yahoo: "EURUSD=X", key: "EURUSD" },
    { yahoo: "GBPUSD=X", key: "GBPUSD" },
    { yahoo: "USDJPY=X", key: "USDJPY" },
    { yahoo: "DX-Y.NYB", key: "DXY" },
  ],
  futures_commodities: [
    { yahoo: "CL=F", key: "WTI" },
    { yahoo: "GC=F", key: "GC" },
    { yahoo: "ES=F", key: "ES" },
  ],
  historical_research: [...CRYPTO_TRIO, ...MACRO_RISK],
  /** Same benchmark bundle as market desk; desk JSON is supplied separately for synthesis. */
  executive_briefing: [...CRYPTO_TRIO, ...MACRO_RISK],
};

/** TradeWatch REST symbols per desk; adjust tickers to match your subscription. */
const TRADEWATCH_AGENT_SPECS: Record<AgentFeatureKey, TwAgentInstrument[]> = {
  crypto_monitoring: [
    { category: "crypto", symbol: "BTCUSD", label: "Bitcoin" },
    { category: "crypto", symbol: "ETHUSD", label: "Ethereum" },
    { category: "crypto", symbol: "SOLUSD", label: "Solana" },
  ],
  forex_monitoring: [
    { category: "currencies", symbol: "EURUSD", label: "EUR/USD" },
    { category: "currencies", symbol: "GBPUSD", label: "GBP/USD" },
    { category: "currencies", symbol: "USDJPY", label: "USD/JPY" },
    { category: "indices", symbol: "USDX", label: "USD index (DXY-style proxy)" },
  ],
  futures_commodities: [
    { category: "commodities", symbol: "XAUUSD", label: "Gold" },
    { category: "commodities", symbol: "USOIL", label: "Crude oil (WTI-style proxy)" },
    { category: "indices", symbol: "US500", label: "S&P 500 (index CFD proxy)" },
  ],
  market_analysis: [
    { category: "crypto", symbol: "BTCUSD", label: "Bitcoin" },
    { category: "crypto", symbol: "ETHUSD", label: "Ethereum" },
    { category: "crypto", symbol: "SOLUSD", label: "Solana" },
    { category: "currencies", symbol: "EURUSD", label: "EUR/USD" },
    { category: "indices", symbol: "US500", label: "S&P 500 (proxy)" },
    { category: "commodities", symbol: "XAUUSD", label: "Gold" },
    { category: "stocks", symbol: "AAPL", label: "Apple" },
  ],
  historical_research: [
    { category: "crypto", symbol: "BTCUSD", label: "Bitcoin" },
    { category: "crypto", symbol: "ETHUSD", label: "Ethereum" },
    { category: "crypto", symbol: "SOLUSD", label: "Solana" },
    { category: "currencies", symbol: "EURUSD", label: "EUR/USD" },
    { category: "indices", symbol: "US500", label: "S&P 500 (proxy)" },
    { category: "commodities", symbol: "XAUUSD", label: "Gold" },
  ],
  executive_briefing: [
    { category: "crypto", symbol: "BTCUSD", label: "Bitcoin" },
    { category: "crypto", symbol: "ETHUSD", label: "Ethereum" },
    { category: "currencies", symbol: "EURUSD", label: "EUR/USD" },
    { category: "indices", symbol: "US500", label: "S&P 500 (proxy)" },
    { category: "commodities", symbol: "XAUUSD", label: "Gold" },
  ],
};

async function yahooSpot(symbol: string): Promise<{ price: number; changePct24h: number } | null> {
  try {
    const response = (await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol, interval: "1h", range: "2d" },
    })) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
        }>;
      };
    };
    const meta = response?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? 0;
    const prev = meta?.chartPreviousClose ?? price;
    if (!price) return null;
    const changePct24h = prev !== 0 ? ((price - prev) / prev) * 100 : 0;
    return { price, changePct24h };
  } catch {
    return null;
  }
}

async function fetchSpecs(specs: YahooSpec[]): Promise<AgentFeatureSnapshot["prices"]> {
  const entries = await Promise.all(
    specs.map(async ({ yahoo, key }) => {
      const row = await yahooSpot(yahoo);
      return row ? ([key, { usd: row.price, changePct24h: row.changePct24h }] as const) : null;
    }),
  );
  const prices: AgentFeatureSnapshot["prices"] = {};
  for (const e of entries) {
    if (e) prices[e[0]] = e[1];
  }
  return prices;
}

function maskAddressDisplay(address: string): string {
  const a = address.trim();
  if (a.length <= 14) return a;
  return `${a.slice(0, 8)}…${a.slice(-4)}`;
}

async function fetchBalanceForChain(
  chain: "BTC" | "ETH" | "SOL",
  address: string,
): Promise<{ balanceNative: number; balanceError?: string }> {
  try {
    if (chain === "BTC") {
      const r = await fetchBtcBalance(address);
      return r.error ? { balanceNative: r.balance, balanceError: r.error } : { balanceNative: r.balance };
    }
    if (chain === "ETH") {
      const r = await fetchEthBalance(address);
      return r.error ? { balanceNative: r.balance, balanceError: r.error } : { balanceNative: r.balance };
    }
    const r = await fetchSolBalance(address);
    return r.error ? { balanceNative: r.balance, balanceError: r.error } : { balanceNative: r.balance };
  } catch (e) {
    return { balanceNative: 0, balanceError: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * User book: live native balances × spot marks, stored NAV trail, active alerts.
 * Does not invent prices — uses `navMarks` from the same Yahoo mirror as crypto benchmarks.
 */
async function buildPortfolioBook(
  userId: number,
  navMarks: Record<string, { usd: number }>,
): Promise<AgentPortfolioBook> {
  const asOf = new Date().toISOString();
  const spotMarkPrices: AgentPortfolioBook["spotMarkPrices"] = {
    BTC: navMarks.BTC?.usd,
    ETH: navMarks.ETH?.usd,
    SOL: navMarks.SOL?.usd,
  };

  const [walletRows, latestSnap, history, alerts] = await Promise.all([
    getWalletsByUserId(userId),
    getLatestPortfolioSnapshot(userId),
    getPortfolioHistory(userId, 14),
    getPriceAlertsByUserId(userId),
  ]);

  const positions: AgentPortfolioBook["positions"] = await Promise.all(
    walletRows.map(async (w) => {
      const { balanceNative, balanceError } = await fetchBalanceForChain(w.chain, w.address);
      const px = navMarks[w.chain]?.usd ?? 0;
      const valueUsd = px > 0 ? balanceNative * px : 0;
      return {
        chain: w.chain,
        walletLabel: w.label ?? null,
        addressDisplay: maskAddressDisplay(w.address),
        balanceNative,
        valueUsd,
        ...(balanceError ? { balanceError } : {}),
      };
    }),
  );

  const totalsByChain: AgentPortfolioBook["totalsByChain"] = {
    BTC: { native: 0, usd: 0 },
    ETH: { native: 0, usd: 0 },
    SOL: { native: 0, usd: 0 },
  };
  for (const p of positions) {
    const slot = totalsByChain[p.chain] ?? { native: 0, usd: 0 };
    slot.native += p.balanceNative;
    slot.usd += p.valueUsd;
    totalsByChain[p.chain] = slot;
  }
  const totalValueUsd = positions.reduce((s, p) => s + p.valueUsd, 0);

  let lastStoredSnapshot: AgentPortfolioBook["lastStoredSnapshot"] = null;
  if (latestSnap?.snapshotAt) {
    const t = new Date(latestSnap.snapshotAt).getTime();
    const ageMs = Date.now() - t;
    lastStoredSnapshot = {
      totalValueUsd: Number(latestSnap.totalValueUsd ?? 0),
      snapshotAt: new Date(latestSnap.snapshotAt).toISOString(),
      ageHoursApprox: Math.max(0, Math.round(ageMs / 3600_000)),
    };
  }

  const tail = history.slice(-6);
  const recentNavSamples = tail.map((row) => ({
    totalValueUsd: Number(row.totalValueUsd ?? 0),
    snapshotAt: new Date(row.snapshotAt).toISOString(),
  }));

  const activePriceAlerts = alerts
    .filter((a) => a.isActive)
    .slice(0, 20)
    .map((a) => ({
      symbol: a.symbol,
      condition: a.condition,
      threshold: String(a.threshold),
    }));

  return {
    asOf,
    spotMarkPrices,
    positions,
    totalsByChain,
    totalValueUsd,
    lastStoredSnapshot,
    recentNavSamples,
    activePriceAlerts,
    bookMode: "live",
    walletRowsTracked: walletRows.length,
  };
}

/** Scheduled runs: no chain RPC; NAV from last `portfolio_snapshots` row + alert context. */
async function buildPortfolioBookLight(
  userId: number,
  navMarks: Record<string, { usd: number }>,
): Promise<AgentPortfolioBook> {
  const asOf = new Date().toISOString();
  const spotMarkPrices: AgentPortfolioBook["spotMarkPrices"] = {
    BTC: navMarks.BTC?.usd,
    ETH: navMarks.ETH?.usd,
    SOL: navMarks.SOL?.usd,
  };

  const [walletRows, latestSnap, history, alerts] = await Promise.all([
    getWalletsByUserId(userId),
    getLatestPortfolioSnapshot(userId),
    getPortfolioHistory(userId, 14),
    getPriceAlertsByUserId(userId),
  ]);

  const totalsByChain: AgentPortfolioBook["totalsByChain"] = {
    BTC: { native: 0, usd: 0 },
    ETH: { native: 0, usd: 0 },
    SOL: { native: 0, usd: 0 },
  };

  let lastStoredSnapshot: AgentPortfolioBook["lastStoredSnapshot"] = null;
  if (latestSnap?.snapshotAt) {
    const t = new Date(latestSnap.snapshotAt).getTime();
    const ageMs = Date.now() - t;
    lastStoredSnapshot = {
      totalValueUsd: Number(latestSnap.totalValueUsd ?? 0),
      snapshotAt: new Date(latestSnap.snapshotAt).toISOString(),
      ageHoursApprox: Math.max(0, Math.round(ageMs / 3600_000)),
    };
  }

  const tail = history.slice(-6);
  const recentNavSamples = tail.map((row) => ({
    totalValueUsd: Number(row.totalValueUsd ?? 0),
    snapshotAt: new Date(row.snapshotAt).toISOString(),
  }));

  const activePriceAlerts = alerts
    .filter((a) => a.isActive)
    .slice(0, 20)
    .map((a) => ({
      symbol: a.symbol,
      condition: a.condition,
      threshold: String(a.threshold),
    }));

  const totalValueUsd = lastStoredSnapshot?.totalValueUsd ?? 0;

  return {
    asOf,
    spotMarkPrices,
    positions: [],
    totalsByChain,
    totalValueUsd,
    lastStoredSnapshot,
    recentNavSamples,
    activePriceAlerts,
    bookMode: "light",
    walletRowsTracked: walletRows.length,
  };
}

/**
 * Pulls a small, versioned feature snapshot for agent grounding.
 * Wire your self-hosted indexers here as you replace Yahoo/data mirrors.
 */
export async function buildFeatureSnapshot(
  agentType: AgentFeatureKey,
  options?: BuildFeatureSnapshotOptions,
): Promise<AgentFeatureSnapshot> {
  const retrievedAt = new Date().toISOString();
  const citations: FeatureCitation[] = [
    {
      id: "yf-mirror",
      label: "Configured market data API (Yahoo chart route)",
      source: "internal:dataApi/YahooFinance/get_stock_chart",
      retrievedAt,
    },
  ];

  const specs = AGENT_YAHOO_SPECS[agentType];
  const prices = await fetchSpecs(specs);

  const notes: string[] = [];

  let tradeWatchBook: TradeWatchAgentBook | undefined;
  if (ENV.tradewatchApiKey.trim()) {
    try {
      const twSpecs = TRADEWATCH_AGENT_SPECS[agentType];
      tradeWatchBook = await buildTradeWatchAgentBook(twSpecs);
      citations.push({
        id: "tradewatch-rest",
        label: "TradeWatch REST: last quote + daily OHLC bundle for this agent",
        source: "internal:tradewatch/agentMarketBundle",
        retrievedAt: new Date().toISOString(),
      });
      const ok = tradeWatchBook.assets.filter((a) => !a.dataError).length;
      const bad = tradeWatchBook.assets.length - ok;
      if (bad > 0) {
        notes.push(
          `TradeWatch: ${ok}/${tradeWatchBook.assets.length} instruments returned clean quotes/OHLC; others include dataError - cite carefully.`,
        );
      }
      if (ok === 0 && tradeWatchBook.assets.length > 0) {
        notes.push("TradeWatch bundle returned only errors; rely on Yahoo prices and avoid inventing levels.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[TradeWatch][agents] bundle failed:", msg);
      tradeWatchBook = {
        enabled: false,
        retrievedAt: new Date().toISOString(),
        assets: [],
        reason: msg,
      };
      notes.push("TradeWatch bundle failed; using Yahoo snapshot only for numeric marks.");
    }
  } else {
    tradeWatchBook = {
      enabled: false,
      retrievedAt: new Date().toISOString(),
      assets: [],
      reason: "TRADEWATCH_API_KEY not configured",
    };
    notes.push("TradeWatch not configured; tradeWatchBook.disabled - use Yahoo prices only.");
  }


  if (Object.keys(prices).length === 0) {
    notes.push("Spot prices unavailable; downstream model must avoid fabricating levels.");
  }

  const fxKeys = ["EURUSD", "GBPUSD", "USDJPY", "DXY"] as const;
  if (agentType === "forex_monitoring" && !fxKeys.some((k) => prices[k] != null)) {
    notes.push("No FX or DXY quotes returned for this snapshot; avoid citing specific spot levels.");
  }

  const futKeys = ["WTI", "GC", "ES"] as const;
  if (agentType === "futures_commodities" && !futKeys.some((k) => prices[k] != null)) {
    notes.push("No futures quotes returned; cite missing contract data in output.");
  }

  if (
    (agentType === "market_analysis" || agentType === "historical_research" || agentType === "executive_briefing") &&
    !prices.SPX &&
    !prices.VIX &&
    !prices.BTC
  ) {
    notes.push("Macro and crypto benchmarks unavailable in this snapshot.");
  }

  let portfolioBook: AgentPortfolioBook | undefined;
  if (options?.userId != null) {
    const navMarks: Record<string, { usd: number; changePct24h?: number }> = {};
    for (const sym of ["BTC", "ETH", "SOL"] as const) {
      const row = prices[sym];
      if (row?.usd) navMarks[sym] = row;
    }
    if (!navMarks.BTC?.usd || !navMarks.ETH?.usd || !navMarks.SOL?.usd) {
      const trio = await fetchSpecs(CRYPTO_TRIO);
      for (const sym of ["BTC", "ETH", "SOL"] as const) {
        if (!navMarks[sym]?.usd && trio[sym]) navMarks[sym] = trio[sym];
      }
    }
    if (!navMarks.BTC && !navMarks.ETH && !navMarks.SOL) {
      notes.push("NAV marks unavailable; portfolioBook USD figures may be zero — do not fabricate marks.");
    }
    const bookMode = options.portfolioBookMode ?? "live";
    if (bookMode === "light") {
      portfolioBook = await buildPortfolioBookLight(options.userId, navMarks);
      citations.push({
        id: "scheduled-stored-nav-book",
        label: "Scheduled run: book uses stored NAV + alerts only (no live chain balance fetch)",
        source: "internal:db/portfolio_snapshots+price_alerts",
        retrievedAt: new Date().toISOString(),
      });
      citations.push({
        id: "db-portfolio-snapshots",
        label: "Stored portfolio_snapshots NAV trail for this user",
        source: "internal:db/portfolio_snapshots",
        retrievedAt: new Date().toISOString(),
      });
      if (portfolioBook.activePriceAlerts.length > 0) {
        citations.push({
          id: "db-price-alerts",
          label: "Active user price_alerts rows",
          source: "internal:db/price_alerts",
          retrievedAt: new Date().toISOString(),
        });
      }
      notes.push(
        "Scheduled agent run: on-chain balances were not refreshed; use portfolioBook.totalValueUsd, lastStoredSnapshot, and recentNavSamples for exposure context.",
      );
      if ((portfolioBook.walletRowsTracked ?? 0) === 0) {
        notes.push("User has no saved wallet rows; book is NAV and alerts only.");
      }
    } else {
      portfolioBook = await buildPortfolioBook(options.userId, navMarks);
      citations.push({
        id: "user-chain-balances",
        label: "Live on-chain balances for user wallet rows (Esplora / eth_getBalance / getBalance)",
        source: "internal:blockchain/balance-fetch",
        retrievedAt: new Date().toISOString(),
      });
      citations.push({
        id: "db-portfolio-snapshots",
        label: "Stored portfolio_snapshots NAV trail for this user",
        source: "internal:db/portfolio_snapshots",
        retrievedAt: new Date().toISOString(),
      });
      if (portfolioBook.activePriceAlerts.length > 0) {
        citations.push({
          id: "db-price-alerts",
          label: "Active user price_alerts rows",
          source: "internal:db/price_alerts",
          retrievedAt: new Date().toISOString(),
        });
      }
      if (portfolioBook.positions.length === 0) {
        notes.push("User has no saved wallet rows; portfolioBook exposure is empty.");
      }
    }
  }

  return {
    datasetVersion: DATASET_VERSION,
    agentType,
    prices,
    citations,
    notes,
    ...(tradeWatchBook ? { tradeWatchBook } : {}),
    ...(portfolioBook ? { portfolioBook } : {}),
  };
}
