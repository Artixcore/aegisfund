import { createPublicClient, createWalletClient, http, parseEther, formatEther, type PublicClient } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import type { ChainAdapter, ChainBalanceResult, NativeSendParams, NativeSendResult, WalletSettings } from "./types";
import { chainFromEthNetwork } from "./chains";
import { ethDerivationPath } from "./derive";

export async function ethJsonRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

function publicClientFor(settings: WalletSettings): PublicClient {
  const chain = chainFromEthNetwork(settings.ethNetwork);
  return createPublicClient({ chain, transport: http(settings.ethRpcUrl.trim()) });
}

export const ethereumAdapter: ChainAdapter = {
  id: "ethereum",

  async getReceiveAddress(mnemonic, accountIndex) {
    const acc = mnemonicToAccount({ mnemonic, path: ethDerivationPath(accountIndex) });
    return acc.address;
  },

  async getBalance(mnemonic, accountIndex, settings) {
    const url = settings.ethRpcUrl.trim();
    if (!url) throw new Error("Set an Ethereum JSON-RPC URL (must allow browser CORS).");
    const acc = mnemonicToAccount({ mnemonic, path: ethDerivationPath(accountIndex) });
    const hex = await ethJsonRpc<string>(url, "eth_getBalance", [acc.address, "latest"]);
    const wei = BigInt(hex);
    return {
      raw: wei,
      formatted: `${formatEther(wei)} ETH`,
    } satisfies ChainBalanceResult;
  },

  async estimateNativeSendFee(mnemonic, accountIndex, settings, to, amountEthDecimal) {
    const url = settings.ethRpcUrl.trim();
    if (!url) throw new Error("Set an Ethereum JSON-RPC URL.");
    const chain = chainFromEthNetwork(settings.ethNetwork);
    const account = mnemonicToAccount({ mnemonic, path: ethDerivationPath(accountIndex) });
    const pc = publicClientFor(settings);
    const value = parseEther(amountEthDecimal);
    const gas = await pc.estimateGas({ account, to: to as `0x${string}`, value });
    let maxFeePerGas: bigint;
    try {
      const block = await ethJsonRpc<{ baseFeePerGas?: string } | null>(url, "eth_getBlockByNumber", ["latest", false]);
      const base = block?.baseFeePerGas ? BigInt(block.baseFeePerGas) : 0n;
      let priority = 1_000_000_000n;
      try {
        priority = BigInt(await ethJsonRpc<string>(url, "eth_maxPriorityFeePerGas", []));
      } catch {
        /* legacy chain */
      }
      maxFeePerGas = base === 0n ? (await pc.getGasPrice()) : base * 2n + priority;
    } catch {
      maxFeePerGas = await pc.getGasPrice();
    }
    const wei = gas * maxFeePerGas;
    return { wei, display: `~${formatEther(wei)} ETH fee` };
  },

  async signAndBroadcastNativeSend(params: NativeSendParams): Promise<NativeSendResult> {
    const { mnemonic, accountIndex, to, amountEthDecimal, ethRpcUrl, ethNetwork } = params;
    const url = ethRpcUrl.trim();
    if (!url) throw new Error("Missing ETH RPC URL.");
    if (!amountEthDecimal) throw new Error("Missing amount.");
    const chain = chainFromEthNetwork(ethNetwork);
    const account = mnemonicToAccount({ mnemonic, path: ethDerivationPath(accountIndex) });
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(url),
    });
    const hash = await walletClient.sendTransaction({
      to: to as `0x${string}`,
      value: parseEther(amountEthDecimal),
      chain,
    });
    return { txHash: hash, chain: "ethereum" };
  },
};
