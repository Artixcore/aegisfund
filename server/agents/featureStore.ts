import { callDataApi } from "../_core/dataApi";

export const DATASET_VERSION = "aegis-features-2026-04-16.1";

export type AgentFeatureKey =
  | "market_analysis"
  | "crypto_monitoring"
  | "forex_monitoring"
  | "futures_commodities"
  | "historical_research";

export type FeatureCitation = {
  id: string;
  label: string;
  /** URI or logical ref (e.g. self-hosted Yahoo mirror path). */
  source: string;
  retrievedAt: string;
};

export type AgentFeatureSnapshot = {
  datasetVersion: string;
  agentType: AgentFeatureKey;
  prices: Record<string, { usd: number; changePct24h?: number }>;
  citations: FeatureCitation[];
  notes: string[];
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

/**
 * Pulls a small, versioned feature snapshot for agent grounding.
 * Wire your self-hosted indexers here as you replace Yahoo/data mirrors.
 */
export async function buildFeatureSnapshot(agentType: AgentFeatureKey): Promise<AgentFeatureSnapshot> {
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
    (agentType === "market_analysis" || agentType === "historical_research") &&
    !prices.SPX &&
    !prices.VIX &&
    !prices.BTC
  ) {
    notes.push("Macro and crypto benchmarks unavailable in this snapshot.");
  }

  return {
    datasetVersion: DATASET_VERSION,
    agentType,
    prices,
    citations,
    notes,
  };
}
