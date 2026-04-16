import { notifyOwner } from "../_core/notification";

const AGENT_LABELS: Record<string, string> = {
  market_analysis: "Market Analysis",
  crypto_monitoring: "Crypto Monitoring",
  forex_monitoring: "Forex Monitoring",
  futures_commodities: "Futures & Commodities",
  historical_research: "Historical Research",
  executive_briefing: "Executive Briefing",
};

function excerptFromOutput(output: Record<string, unknown>): string {
  const exec = output.executive_summary;
  if (typeof exec === "string" && exec.trim()) return exec.trim().slice(0, 500);
  const sum = output.summary;
  if (typeof sum === "string" && sum.trim()) return sum.trim().slice(0, 500);
  return "Output stored — open **AI Agents** for the full report.";
}

/** Owner webhook (same channel as price alerts / KYC). */
export async function notifyScheduledAgentOutcome(params: {
  userId: number;
  agentType: string;
  ok: boolean;
  runId?: number;
  output?: Record<string, unknown>;
  errorMessage?: string;
}): Promise<void> {
  const label = AGENT_LABELS[params.agentType] ?? params.agentType;
  const runLine = params.runId != null ? `**Run ID:** ${params.runId}` : "**Run ID:** —";

  if (params.ok && params.output) {
    const body = excerptFromOutput(params.output);
    await notifyOwner({
      title: `Aegis · Scheduled ${label} complete · user ${params.userId}`,
      content: [
        `**Agent:** ${label}`,
        `**User ID:** ${params.userId}`,
        runLine,
        "",
        "**Preview:**",
        body,
        "",
        "_Next run is scheduled per the user’s interval on the AI Agents page._",
      ].join("\n"),
    }).catch(() => {});
    return;
  }

  await notifyOwner({
    title: `Aegis · Scheduled ${label} failed · user ${params.userId}`,
    content: [
      `**Agent:** ${label}`,
      `**User ID:** ${params.userId}`,
      runLine,
      "",
      "**Error:**",
      (params.errorMessage ?? "Unknown error").slice(0, 1500),
      "",
      "_The schedule was advanced; check logs and LLM configuration._",
    ].join("\n"),
  }).catch(() => {});
}
