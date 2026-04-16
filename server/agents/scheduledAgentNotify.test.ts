import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyScheduledAgentOutcome } from "./scheduledAgentNotify";

vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { notifyOwner } from "../_core/notification";

describe("notifyScheduledAgentOutcome", () => {
  beforeEach(() => {
    vi.mocked(notifyOwner).mockClear();
  });

  it("posts a success payload with summary excerpt", async () => {
    await notifyScheduledAgentOutcome({
      userId: 7,
      agentType: "market_analysis",
      ok: true,
      runId: 42,
      output: { summary: "Macro risk-on bias persists." },
    });
    expect(notifyOwner).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(notifyOwner).mock.calls[0]![0];
    expect(arg.title).toContain("Market Analysis");
    expect(arg.title).toContain("user 7");
    expect(arg.content).toContain("Macro risk-on");
    expect(arg.content).toContain("Run ID:** 42");
  });

  it("posts failure payload with error text", async () => {
    await notifyScheduledAgentOutcome({
      userId: 3,
      agentType: "executive_briefing",
      ok: false,
      runId: 99,
      errorMessage: "LLM timeout",
    });
    expect(notifyOwner).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(notifyOwner).mock.calls[0]![0];
    expect(arg.title).toContain("failed");
    expect(arg.content).toContain("LLM timeout");
  });
});
