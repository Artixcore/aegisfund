import { describe, expect, it } from "vitest";
import { brokerCoverageForMode, saveBrokerConnectionInputSchema } from "./brokerTypes";

describe("brokerCoverageForMode", () => {
  it("treats backtest as fully covered without connections", () => {
    const c = brokerCoverageForMode("backtest", []);
    expect(c.stock && c.forex && c.crypto && c.commodity).toBe(true);
  });

  it("requires paper connections for paper mode", () => {
    const c = brokerCoverageForMode("paper", [{ assetClass: "crypto", environment: "paper" }]);
    expect(c.crypto).toBe(true);
    expect(c.stock).toBe(false);
  });

  it("does not count live credentials for paper mode", () => {
    const c = brokerCoverageForMode("paper", [{ assetClass: "crypto", environment: "live" }]);
    expect(c.crypto).toBe(false);
  });
});

describe("saveBrokerConnectionInputSchema", () => {
  it("accepts valid stock + alpaca", () => {
    const r = saveBrokerConnectionInputSchema.safeParse({
      assetClass: "stock",
      venue: "alpaca",
      environment: "paper",
      credentials: { apiKey: "pk-test" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects venue not allowed for asset class", () => {
    const r = saveBrokerConnectionInputSchema.safeParse({
      assetClass: "stock",
      venue: "binance",
      environment: "paper",
      credentials: { apiKey: "x" },
    });
    expect(r.success).toBe(false);
  });

  it("allows custom venue for any class", () => {
    const r = saveBrokerConnectionInputSchema.safeParse({
      assetClass: "commodity",
      venue: "custom",
      environment: "live",
      credentials: { apiKey: "k", apiSecret: "s" },
    });
    expect(r.success).toBe(true);
  });
});
