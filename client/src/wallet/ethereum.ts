import { mnemonicToAccount } from "viem/accounts";
import { formatEther, parseEther } from "viem/utils";
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

export const ethereumAdapter: ChainAdapter = {
  id: "ethereum",

  async getReceiveAddress(mnemonic, accountIndex) {
    const acc = mnemonicToAccount(mnemonic, { path: ethDerivationPath(accountIndex) });
    return acc.address;
  },

  async getBalance(mnemonic, accountIndex, settings) {
    const url = settings.ethRpcUrl.trim();
    if (!url) throw new Error("Set an Ethereum JSON-RPC URL (must allow browser CORS).");
    const acc = mnemonicToAccount(mnemonic, { path: ethDerivationPath(accountIndex) });
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
    const acc = mnemonicToAccount(mnemonic, { path: ethDerivationPath(accountIndex) });
    const valueWei = parseEther(amountEthDecimal);
    const from = acc.address;
    const gasHex = await ethJsonRpc<string>(url, "eth_estimateGas", [
      { from, to, value: `0x${valueWei.toString(16)}` },
    ]);
    const gas = BigInt(gasHex);
    let maxFeePerGas: bigint;
    try {
      const block = await ethJsonRpc<{ baseFeePerGas?: string } | null>(url, "eth_getBlockByNumber", ["latest", false]);
      const base = block?.baseFeePerGas ? BigInt(block.baseFeePerGas) : 0n;
      let priority = 1_000_000_000n;
      try {
        priority = BigInt(await ethJsonRpc<string>(url, "eth_maxPriorityFeePerGas", []));
      } catch {
        /* legacy */
      }
      maxFeePerGas = base === 0n ? BigInt(await ethJsonRpc<string>(url, "eth_gasPrice", [])) : base * 2n + priority;
    } catch {
      maxFeePerGas = BigInt(await ethJsonRpc<string>(url, "eth_gasPrice", []));
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
    const account = mnemonicToAccount(mnemonic, { path: ethDerivationPath(accountIndex) });
    const from = account.address;
    const valueWei = parseEther(amountEthDecimal);
    const nonceHex = await ethJsonRpc<string>(url, "eth_getTransactionCount", [from, "latest"]);
    const nonce = BigInt(nonceHex);
    const gasHex = await ethJsonRpc<string>(url, "eth_estimateGas", [
      { from, to, value: `0x${valueWei.toString(16)}` },
    ]);
    const gas = BigInt(gasHex);

    let rawSigned: `0x${string}`;
    const block = await ethJsonRpc<{ baseFeePerGas?: string } | null>(url, "eth_getBlockByNumber", ["latest", false]);
    const baseFee = block?.baseFeePerGas ? BigInt(block.baseFeePerGas) : 0n;

    if (baseFee > 0n) {
      let maxPriorityFeePerGas = 1_000_000_000n;
      try {
        maxPriorityFeePerGas = BigInt(await ethJsonRpc<string>(url, "eth_maxPriorityFeePerGas", []));
      } catch {
        /* use default */
      }
      const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;
      rawSigned = await account.signTransaction({
        type: "eip1559",
        chainId: chain.id,
        nonce: Number(nonce),
        to: to as `0x${string}`,
        value: valueWei,
        gas,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
    } else {
      const gasPrice = BigInt(await ethJsonRpc<string>(url, "eth_gasPrice", []));
      rawSigned = await account.signTransaction({
        type: "legacy",
        chainId: chain.id,
        nonce: Number(nonce),
        to: to as `0x${string}`,
        value: valueWei,
        gas,
        gasPrice,
      });
    }

    const hash = await ethJsonRpc<string>(url, "eth_sendRawTransaction", [rawSigned]);
    return { txHash: hash, chain: "ethereum" };
  },
};
