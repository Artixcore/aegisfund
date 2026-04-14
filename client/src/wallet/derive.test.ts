import { describe, expect, it } from "vitest";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { getBtcAddress, getEthAddress } from "./derive";

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
});
