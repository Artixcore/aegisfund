/** Merged into `agent_runs.output` alongside LLM fields (server-only key). */
export const AGENT_RUN_GROUNDING_KEY = "_aegisGrounding" as const;

/** Compact grounding metadata for UI (no full portfolio book). */
export type AgentRunGroundingMeta = {
  datasetVersion: string;
  portfolioBook?: {
    asOf: string;
    positionCount: number;
    activeAlertCount: number;
    totalValueUsd: number;
  };
};
