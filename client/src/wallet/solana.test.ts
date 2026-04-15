import { describe, expect, it } from "vitest";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { parseSolDecimalToLamports } from "./solana";

describe("parseSolDecimalToLamports", () => {
  it("parses whole SOL", () => {
    expect(parseSolDecimalToLamports("1")).toBe(BigInt(LAMPORTS_PER_SOL));
  });

  it("parses fractional SOL up to 9 decimals", () => {
    expect(parseSolDecimalToLamports("0.000000001")).toBe(1n);
    expect(parseSolDecimalToLamports("1.5")).toBe(BigInt(LAMPORTS_PER_SOL) * 3n / 2n);
  });

  it("rejects invalid input", () => {
    expect(() => parseSolDecimalToLamports("")).toThrow();
    expect(() => parseSolDecimalToLamports("-1")).toThrow();
    expect(() => parseSolDecimalToLamports("x")).toThrow();
  });
});
