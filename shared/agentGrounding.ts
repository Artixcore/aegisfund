/** Merged into `agent_runs.output` alongside LLM fields (server-only key). */
export const AGENT_RUN_GROUNDING_KEY = "_aegisGrounding" as const;

/** Compact grounding metadata for UI (no full portfolio book). */
export type AgentRunGroundingMeta = {
  datasetVersion: string;
  portfolioBook?: {
    asOf: string;
    /** Tracked wallet rows (live) or rows on file (light schedule). */
    positionCount: number;
    activeAlertCount: number;
    totalValueUsd: number;
    bookMode?: "live" | "light";
    walletRowsTracked?: number;
  };
};

export function parseGrounding(output: unknown): AgentRunGroundingMeta | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  const g = o[AGENT_RUN_GROUNDING_KEY];
  if (!g || typeof g !== "object") return null;
  const rec = g as Record<string, unknown>;
  const dv = rec.datasetVersion;
  if (typeof dv !== "string") return null;
  const meta: AgentRunGroundingMeta = { datasetVersion: dv };
  const pb = rec.portfolioBook;
  if (pb && typeof pb === "object") {
    const p = pb as Record<string, unknown>;
    const bm = p.bookMode;
    meta.portfolioBook = {
      asOf: typeof p.asOf === "string" ? p.asOf : "",
      positionCount: typeof p.positionCount === "number" ? p.positionCount : 0,
      activeAlertCount: typeof p.activeAlertCount === "number" ? p.activeAlertCount : 0,
      totalValueUsd: typeof p.totalValueUsd === "number" ? p.totalValueUsd : 0,
      ...(bm === "light" || bm === "live" ? { bookMode: bm } : {}),
      ...(typeof p.walletRowsTracked === "number" ? { walletRowsTracked: p.walletRowsTracked } : {}),
    };
  }
  return meta;
}

export function stripGrounding(output: Record<string, unknown>): Record<string, unknown> {
  const { [AGENT_RUN_GROUNDING_KEY]: _, ...rest } = output;
  return rest;
}
