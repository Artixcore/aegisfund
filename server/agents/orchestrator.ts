import type { AgentRunGroundingMeta } from "@shared/agentGrounding";
import { AGENT_OUTPUT_GUARDRAIL } from "./guardrails";
import { AGENT_PROMPTS } from "./prompts";
import {
  buildFeatureSnapshot,
  type AgentFeatureKey,
  type AgentFeatureSnapshot,
  type BuildFeatureSnapshotOptions,
} from "./featureStore";

export type AgentLlmMessage = { role: "system" | "user"; content: string };

export type AgentRunPrepared = {
  messages: AgentLlmMessage[];
  responseSchemaName: string;
  groundingMeta: AgentRunGroundingMeta;
};

export function groundingMetaFromFeatures(features: AgentFeatureSnapshot): AgentRunGroundingMeta {
  const pb = features.portfolioBook;
  return {
    datasetVersion: features.datasetVersion,
    portfolioBook: pb
      ? {
          asOf: pb.asOf,
          positionCount: pb.walletRowsTracked ?? pb.positions.length,
          activeAlertCount: pb.activePriceAlerts.length,
          totalValueUsd: pb.totalValueUsd,
          bookMode: pb.bookMode ?? "live",
          walletRowsTracked: pb.walletRowsTracked,
        }
      : undefined,
  };
}

/**
 * Builds LLM messages: base prompt + versioned feature snapshot JSON + guardrails.
 * Pass `userId` so the snapshot includes portfolioBook (live balances, NAV trail, alerts).
 */
export async function prepareAgentRun(
  agentType: AgentFeatureKey,
  snapshotOptions?: BuildFeatureSnapshotOptions,
): Promise<AgentRunPrepared> {
  const prompt = AGENT_PROMPTS[agentType];
  const features = await buildFeatureSnapshot(agentType, snapshotOptions);

  const userBlock = [
    "Use the following FEATURE_SNAPSHOT as the only authoritative numeric market context.",
    "When `portfolioBook` is present, it is authoritative for this user's exposure context. If `portfolioBook.bookMode` is `light`, chain balances were not fetched this run — use totalValueUsd, lastStoredSnapshot, recentNavSamples, and alerts only; if `live`, use positions and totals.",
    "When `tradeWatchBook` exists with `enabled: true`, each entry in `tradeWatchBook.assets` is authoritative for that symbol's TradeWatch marks (currentPrice, bid/ask), deterministic `trendSummary`, `historicalOverview`, `changePctWindow`, and `marketObservations`. When `enabled: false`, read `reason` and fall back to Yahoo `prices` only.",
    "If both Yahoo `prices` and TradeWatch rows exist for a loosely related benchmark, prefer TradeWatch for that symbol's row and Yahoo for legacy keys (BTC, SPX, etc.); cite `tradewatch-rest` and `yf-mirror` as appropriate.",
    "Include a top-level JSON field `citations` repeating the snapshot citation ids you relied on.",
    "FEATURE_SNAPSHOT:",
    JSON.stringify(features, null, 2),
    "",
    "TASK:",
    prompt.task,
  ].join("\n");

  const messages: AgentLlmMessage[] = [
    {
      role: "system",
      content: `${prompt.system}\n\n${AGENT_OUTPUT_GUARDRAIL}`,
    },
    { role: "user", content: userBlock },
  ];

  return {
    messages,
    responseSchemaName: `${agentType}_report`,
    groundingMeta: groundingMetaFromFeatures(features),
  };
}
