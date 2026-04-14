import { describe, expect, it } from "vitest";
import { planBtcSpend } from "./bitcoin";

describe("planBtcSpend", () => {
  it("prefers two outputs when change is above dust", () => {
    const utxos = [
      { txid: "a".repeat(64), vout: 0, value: 200_000, status: { confirmed: true } },
      { txid: "b".repeat(64), vout: 1, value: 200_000, status: { confirmed: true } },
    ];
    const plan = planBtcSpend(utxos, 100_000n, 5);
    expect(plan.twoOutputs).toBe(true);
    expect(plan.change).toBeGreaterThan(546n);
  });
});
