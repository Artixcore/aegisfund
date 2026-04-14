import { ENV } from "../_core/env";

/** Default public Esplora-compatible API (override with self-hosted BTC_REST_API_BASE). */
const DEFAULT_BTC_REST = "https://blockstream.info/api";

/** Default Solana RPC (override with self-hosted SOL_RPC_URL). */
const DEFAULT_SOL_RPC = "https://api.mainnet-beta.solana.com";

export function getBtcRestApiBase(): string {
  const base = ENV.btcRestApiBase?.replace(/\/$/, "") ?? "";
  return base || DEFAULT_BTC_REST;
}

export function getSolRpcUrl(): string {
  return ENV.solRpcUrl?.trim() || DEFAULT_SOL_RPC;
}

export function getEthRpcUrl(): string | null {
  const u = ENV.ethRpcUrl?.trim();
  return u ? u : null;
}
