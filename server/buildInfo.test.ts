import { describe, expect, it } from "vitest";
import { getServerBuildInfo } from "./_core/buildInfo";

describe("getServerBuildInfo", () => {
  it("includes a stable marker for dapp unknown-account HTTP semantics", () => {
    const info = getServerBuildInfo();
    expect(info.dappLoginUnknownAccountHttpStatus).toBe(400);
    expect(info.name).toBeTruthy();
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
