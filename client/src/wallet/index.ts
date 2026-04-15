export * from "./types";
export * from "./db";
export * from "./vaultWrap";
export * from "./session";
export * from "./derive";
export * from "./chains";
export { ethereumAdapter, ethJsonRpc } from "./ethereum";
export { bitcoinAdapter, fetchBtcFeeRateSatPerVb, planBtcSpend } from "./bitcoin";
export { solanaAdapter, solJsonRpc, parseSolDecimalToLamports } from "./solana";
export type { BtcSpendPlan } from "./bitcoin";

import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export function generateWalletMnemonic12(): string {
  return generateMnemonic(wordlist, 128);
}

export function validateWalletMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim(), wordlist);
}
