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

function groundingMetaFromFeatures(features: AgentFeatureSnapshot): AgentRunGroundingMeta {
  const pb = features.portfolioBook;
  return {
    datasetVersion: features.datasetVersion,
    portfolioBook: pb
      ? {
          asOf: pb.asOf,
          positionCount: pb.positions.length,
          activeAlertCount: pb.activePriceAlerts.length,
          totalValueUsd: pb.totalValueUsd,
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
    "When `portfolioBook` is present, it is authoritative for this user's tracked wallet balances (native + USD marks), stored NAV samples, and active price alerts — relate conclusions to that exposure when relevant; never infer holdings beyond it.",
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
