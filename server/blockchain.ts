import { ENV } from "./_core/env";
import { getBtcRestApiBase, getEthRpcUrl, getSolRpcUrl } from "./wallet/chainEndpoints";

// ============================================================
// BLOCKCHAIN BALANCE SERVICE
// Prefers self-hosted RPC / REST (see server/_core/env.ts).
// BTC: Esplora-compatible REST (default Blockstream if unset)
// ETH: JSON-RPC eth_getBalance if ETH_RPC_URL, else Etherscan if key set
// SOL: JSON-RPC getBalance
// ============================================================

export interface ChainBalance {
  address: string;
  balance: number;
  balanceRaw: number;
  usdValue?: number;
  error?: string;
}

export async function fetchBtcBalance(address: string): Promise<ChainBalance> {
  try {
    const base = getBtcRestApiBase();
    const url = `${base}/address/${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AegisFund/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`BTC REST error: ${res.status}`);
    const data = (await res.json()) as {
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
    };
    const balanceSats = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
    const balance = balanceSats / 1e8;
    return { address, balance, balanceRaw: balanceSats };
  } catch (err) {
    console.error("[Blockchain] BTC balance error:", err);
    return { address, balance: 0, balanceRaw: 0, error: String(err) };
  }
}

async function fetchEthBalanceJsonRpc(rpcUrl: string, address: string): Promise<ChainBalance> {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBalance",
    params: [address, "latest"],
  };
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`ETH RPC HTTP ${res.status}`);
  const data = (await res.json()) as { result?: string; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  const hex = data.result;
  if (!hex || !hex.startsWith("0x")) throw new Error("Invalid eth_getBalance result");
  const balanceWei = BigInt(hex);
  const balance = Number(balanceWei) / 1e18;
  return { address, balance, balanceRaw: Number(balanceWei) };
}

export async function fetchEthBalance(address: string): Promise<ChainBalance> {
  const rpcUrl = getEthRpcUrl();
  if (rpcUrl) {
    try {
      return await fetchEthBalanceJsonRpc(rpcUrl, address);
    } catch (err) {
      console.error("[Blockchain] ETH JSON-RPC error:", err);
      return { address, balance: 0, balanceRaw: 0, error: String(err) };
    }
  }
  try {
    const apiKey = ENV.etherscanApiKey;
    if (!apiKey) throw new Error("Configure ETH_RPC_URL (self-hosted) or ETHERSCAN_API_KEY (fallback)");
    const chainId = ENV.etherscanChainId.replace(/\D/g, "") || "1";
    const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=balance&address=${encodeURIComponent(address)}&tag=latest&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Etherscan API error: ${res.status}`);
    const data = (await res.json()) as { status: string; message: string; result: string };
    if (data.status !== "1") throw new Error(`Etherscan: ${data.message} — ${data.result}`);
    const balanceWei = BigInt(data.result);
    const balance = Number(balanceWei) / 1e18;
    return { address, balance, balanceRaw: Number(balanceWei) };
  } catch (err) {
    console.error("[Blockchain] ETH balance error:", err);
    return { address, balance: 0, balanceRaw: 0, error: String(err) };
  }
}

export async function fetchSolBalance(address: string): Promise<ChainBalance> {
  try {
    const rpc = getSolRpcUrl();
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address],
    });
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Solana RPC error: ${res.status}`);
    const data = (await res.json()) as { result?: { value: number }; error?: { message: string } };
    if (data.error) throw new Error(data.error.message);
    const lamports = data.result?.value ?? 0;
    const balance = lamports / 1e9;
    return { address, balance, balanceRaw: lamports };
  } catch (err) {
    console.error("[Blockchain] SOL balance error:", err);
    return { address, balance: 0, balanceRaw: 0, error: String(err) };
  }
}

export async function fetchAllBalances(addresses: {
  BTC?: string;
  ETH?: string;
  SOL?: string;
}): Promise<{
  BTC: ChainBalance | null;
  ETH: ChainBalance | null;
  SOL: ChainBalance | null;
}> {
  const [btc, eth, sol] = await Promise.all([
    addresses.BTC ? fetchBtcBalance(addresses.BTC) : Promise.resolve(null),
    addresses.ETH ? fetchEthBalance(addresses.ETH) : Promise.resolve(null),
    addresses.SOL ? fetchSolBalance(addresses.SOL) : Promise.resolve(null),
  ]);
  return { BTC: btc, ETH: eth, SOL: sol };
}
