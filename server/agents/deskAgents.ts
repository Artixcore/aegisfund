/** The five specialist desks whose latest complete outputs feed the executive briefing. */
export const DESK_AGENT_TYPES = [
  "market_analysis",
  "crypto_monitoring",
  "forex_monitoring",
  "futures_commodities",
  "historical_research",
] as const;

export type DeskAgentType = (typeof DESK_AGENT_TYPES)[number];
