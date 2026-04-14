import { AGENT_OUTPUT_GUARDRAIL } from "./guardrails";
import { AGENT_PROMPTS } from "./prompts";
import { buildFeatureSnapshot, type AgentFeatureKey } from "./featureStore";

export type AgentLlmMessage = { role: "system" | "user"; content: string };

export type AgentRunInput = {
  messages: AgentLlmMessage[];
  responseSchemaName: string;
};

/**
 * Builds LLM messages: base prompt + versioned feature snapshot JSON + guardrails.
 */
export async function prepareAgentRun(agentType: AgentFeatureKey): Promise<AgentRunInput> {
  const prompt = AGENT_PROMPTS[agentType];
  const features = await buildFeatureSnapshot(agentType);

  const userBlock = [
    "Use the following FEATURE_SNAPSHOT as the only authoritative numeric market context.",
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
  };
}
