import type { Wallet } from "../../drizzle/schema";

export type WalletChain = "BTC" | "ETH" | "SOL";

/**
 * Pick the address used for on-chain balance / portfolio for a chain.
 * Prefer `isDefault`; if multiple defaults or none, use lowest `id` (stable).
 */
export function pickPrimaryAddressForChain(wallets: Wallet[], chain: WalletChain): string | null {
  const rows = wallets.filter((w) => w.chain === chain);
  if (rows.length === 0) return null;
  const defaults = rows.filter((w) => w.isDefault);
  const pool = defaults.length > 0 ? defaults : rows;
  return pool.reduce((a, b) => (a.id < b.id ? a : b)).address;
}
