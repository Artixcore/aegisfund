import { describe, expect, it } from "vitest";
import { parseP2pChannelFrame } from "./types";

describe("parseP2pChannelFrame wallet frames", () => {
  it("accepts wallet_info", () => {
    const raw = {
      type: "wallet_info",
      payload: {
        v: 1,
        type: "wallet_info",
        chains: { ethereum: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0" },
      },
    };
    const f = parseP2pChannelFrame(raw);
    expect(f).not.toBeNull();
    if (f && f.type === "wallet_info") {
      expect(f.payload.chains.ethereum).toMatch(/^0x/);
    }
  });

  it("accepts payment_ack", () => {
    const raw = {
      type: "payment_ack",
      payload: {
        v: 1,
        type: "payment_ack",
        chain: "ethereum",
        txHash: "0x" + "a".repeat(64),
      },
    };
    const f = parseP2pChannelFrame(raw);
    expect(f).not.toBeNull();
    if (f && f.type === "payment_ack") {
      expect(f.payload.txHash).toContain("0x");
    }
  });
});
