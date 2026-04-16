import type { AgentFeatureKey } from "./featureStore";

const citationsProp = {
  type: "array",
  items: { type: "string" },
  description: "Ids from FEATURE_SNAPSHOT.citations you relied on",
} as const;

/** OpenAI-compatible JSON schemas (strict: false for provider compatibility). */
export function getAgentResponseJsonSchema(agentType: AgentFeatureKey): {
  name: string;
  schema: Record<string, unknown>;
  strict: boolean;
} {
  const strict = false;

  const market = {
    name: "market_analysis_report",
    strict,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        macro_trends: { type: "string" },
        volatility_regime: { type: "string" },
        sentiment_score: { type: "number" },
        risk_factors: { type: "array", items: { type: "string" } },
        investment_thesis: { type: "string" },
        confidence_level: { type: "number" },
        citations: citationsProp,
      },
      required: [
        "summary",
        "macro_trends",
        "volatility_regime",
        "sentiment_score",
        "risk_factors",
        "investment_thesis",
        "confidence_level",
        "citations",
      ],
      additionalProperties: true,
    },
  };

  const crypto = {
    name: "crypto_monitoring_report",
    strict,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        btc_signal: { type: "string" },
        eth_signal: { type: "string" },
        sol_signal: { type: "string" },
        whale_activity: { type: "string" },
        narrative_trends: { type: "array", items: { type: "string" } },
        fear_greed_index: { type: "number" },
        watchlist: {
          type: "array",
          items: {
            type: "object",
            properties: {
              symbol: { type: "string" },
              thesis: { type: "string" },
              risk_level: { type: "string" },
            },
            required: ["symbol", "thesis", "risk_level"],
            additionalProperties: true,
          },
        },
        citations: citationsProp,
      },
      required: [
        "summary",
        "btc_signal",
        "eth_signal",
        "sol_signal",
        "whale_activity",
        "narrative_trends",
        "fear_greed_index",
        "watchlist",
        "citations",
      ],
      additionalProperties: true,
    },
  };

  const forex = {
    name: "forex_monitoring_report",
    strict,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        dxy_trend: { type: "string" },
        major_pairs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pair: { type: "string" },
              signal: { type: "string" },
              key_level: { type: "string" },
              trend: { type: "string" },
            },
            required: ["pair", "signal", "key_level", "trend"],
            additionalProperties: true,
          },
        },
        em_risk: { type: "string" },
        policy_divergence: { type: "string" },
        key_events: { type: "array", items: { type: "string" } },
        overall_usd_bias: { type: "string" },
        citations: citationsProp,
      },
      required: [
        "summary",
        "dxy_trend",
        "major_pairs",
        "em_risk",
        "policy_divergence",
        "key_events",
        "overall_usd_bias",
        "citations",
      ],
      additionalProperties: true,
    },
  };

  const futures = {
    name: "futures_commodities_report",
    strict,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        crude_oil: { type: "string" },
        gold_silver: { type: "string" },
        industrial_metals: { type: "string" },
        agricultural: { type: "string" },
        equity_futures: { type: "string" },
        overall_risk_tone: { type: "string" },
        citations: citationsProp,
      },
      required: [
        "summary",
        "crude_oil",
        "gold_silver",
        "industrial_metals",
        "agricultural",
        "equity_futures",
        "overall_risk_tone",
        "citations",
      ],
      additionalProperties: true,
    },
  };

  const historical = {
    name: "historical_research_report",
    strict,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        cycle_analog: { type: "string" },
        btc_cycle_position: { type: "string" },
        macro_regime: { type: "string" },
        active_patterns: { type: "array", items: { type: "string" } },
        long_range_outlook: { type: "string" },
        historical_confidence: { type: "number" },
        citations: citationsProp,
      },
      required: [
        "summary",
        "cycle_analog",
        "btc_cycle_position",
        "macro_regime",
        "active_patterns",
        "long_range_outlook",
        "historical_confidence",
        "citations",
      ],
      additionalProperties: true,
    },
  };

  const map: Record<AgentFeatureKey, { name: string; schema: Record<string, unknown>; strict: boolean }> = {
    market_analysis: market,
    crypto_monitoring: crypto,
    forex_monitoring: forex,
    futures_commodities: futures,
    historical_research: historical,
  };

  return map[agentType];
}
