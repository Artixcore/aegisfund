import { describe, expect, it } from "vitest";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { getBtcAddress, getEthAddress, getSolAddress } from "./derive";

describe("wallet derive", () => {
  it("produces stable Ethereum addresses for the same mnemonic", () => {
    const mnemonic = generateMnemonic(wordlist, 128);
    expect(validateMnemonic(mnemonic, wordlist)).toBe(true);
    const a = getEthAddress(mnemonic, 0);
    const b = getEthAddress(mnemonic, 0);
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("produces bc1 addresses on Bitcoin mainnet", () => {
    const mnemonic = generateMnemonic(wordlist, 128);
    const addr = getBtcAddress(mnemonic, 0, "mainnet");
    expect(addr).toMatch(/^bc1/);
  });

  it("produces stable Solana base58 addresses (Ledger-style path)", () => {
    const mnemonic = generateMnemonic(wordlist, 128);
    const a0 = getSolAddress(mnemonic, 0);
    const a0b = getSolAddress(mnemonic, 0);
    expect(a0).toBe(a0b);
    expect(a0).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(getSolAddress(mnemonic, 1)).not.toBe(a0);
  });
});
