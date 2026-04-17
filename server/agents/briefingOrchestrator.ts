import { AGENT_PROMPTS } from "./prompts";
import { buildFeatureSnapshot, type BuildFeatureSnapshotOptions } from "./featureStore";
import { AGENT_OUTPUT_GUARDRAIL } from "./guardrails";
import { groundingMetaFromFeatures, type AgentLlmMessage, type AgentRunPrepared } from "./orchestrator";
import { getLatestCompleteDeskAgentRunsForBriefing } from "../db";

/**
 * One LLM pass: latest complete JSON from each specialist desk + fresh FEATURE_SNAPSHOT (incl. portfolio book).
 */
export async function prepareExecutiveBriefingRun(
  userId: number,
  options?: Pick<BuildFeatureSnapshotOptions, "portfolioBookMode">,
): Promise<AgentRunPrepared> {
  const deskRows = await getLatestCompleteDeskAgentRunsForBriefing(userId);
  const features = await buildFeatureSnapshot("executive_briefing", {
    userId,
    portfolioBookMode: options?.portfolioBookMode ?? "live",
  });

  const coverage = deskRows.filter((d) => d.output != null).length;
  const prompt = AGENT_PROMPTS.executive_briefing;

  const userBlock = [
    `DESK_COVERAGE: ${coverage}/5 specialist desks supplied a latest complete JSON output.`,
    "DESK_AGENT_OUTPUTS (newest complete run per desk; internal grounding keys stripped):",
    JSON.stringify(deskRows, null, 2),
    "",
    "Use FEATURE_SNAPSHOT for current market marks, `tradeWatchBook` (TradeWatch bundle when enabled), and portfolioBook (same authority rules as other agents).",
    "Include top-level JSON field `citations` listing snapshot citation ids and, when you relied on a desk row, strings like `desk:market_analysis:runId`.",
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
    responseSchemaName: "executive_briefing_report",
    groundingMeta: groundingMetaFromFeatures(features),
  };
}
