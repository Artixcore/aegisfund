import { callDataApi } from "../_core/dataApi";

export const DATASET_VERSION = "aegis-features-2026-04-15.1";

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

  const [btc, eth, sol] = await Promise.all([
    yahooSpot("BTC-USD"),
    yahooSpot("ETH-USD"),
    yahooSpot("SOL-USD"),
  ]);

  const prices: AgentFeatureSnapshot["prices"] = {};
  if (btc) prices.BTC = { usd: btc.price, changePct24h: btc.changePct24h };
  if (eth) prices.ETH = { usd: eth.price, changePct24h: eth.changePct24h };
  if (sol) prices.SOL = { usd: sol.price, changePct24h: sol.changePct24h };

  const notes: string[] = [];
  if (Object.keys(prices).length === 0) {
    notes.push("Spot prices unavailable; downstream model must avoid fabricating levels.");
  }
  if (agentType === "forex_monitoring") {
    notes.push("Forex spot series not wired to dedicated FX feeds in this snapshot — use macro reasoning cautiously.");
  }
  if (agentType === "futures_commodities") {
    notes.push("Commodity continuous futures not in snapshot; cite missing data in output.");
  }

  return {
    datasetVersion: DATASET_VERSION,
    agentType,
    prices,
    citations,
    notes,
  };
}
