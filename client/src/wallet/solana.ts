import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { ChainAdapter, ChainBalanceResult, NativeSendParams, NativeSendResult, WalletSettings } from "./types";
import { getSolKeypair } from "./derive";

const LAMPORTS_PER_SOL_BI = BigInt(LAMPORTS_PER_SOL);

export async function solJsonRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url.trim(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

function u8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Parse non-negative decimal SOL string to lamports (up to 9 fractional digits). */
export function parseSolDecimalToLamports(s: string): bigint {
  const t = s.trim();
  if (!t || t.startsWith("-")) throw new Error("Invalid SOL amount");
  const [intPart, fracRaw = ""] = t.split(".");
  if (!/^\d+$/.test(intPart || "0")) throw new Error("Invalid SOL amount");
  const frac = `${fracRaw}000000000`.slice(0, 9);
  if (!/^\d{9}$/.test(frac)) throw new Error("Invalid SOL amount");
  return BigInt(intPart || "0") * LAMPORTS_PER_SOL_BI + BigInt(frac);
}

function formatLamports(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL_BI;
  const frac = lamports % LAMPORTS_PER_SOL_BI;
  if (frac === 0n) return `${whole} SOL`;
  const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
  return `${whole}.${fracStr} SOL`;
}

/** Base signature fee + small headroom (no indexer; optional priority not included). */
const ESTIMATED_TRANSFER_FEE_LAMPORTS = 10_000n;

export const solanaAdapter: ChainAdapter = {
  id: "solana",

  async getReceiveAddress(mnemonic, accountIndex) {
    return getSolKeypair(mnemonic, accountIndex).publicKey.toBase58();
  },

  async getBalance(mnemonic, accountIndex, settings) {
    const url = settings.solRpcUrl.trim();
    if (!url) throw new Error("Set a Solana JSON-RPC URL (must allow browser CORS).");
    const pk = getSolKeypair(mnemonic, accountIndex).publicKey.toBase58();
    const lamports = await solJsonRpc<number>(url, "getBalance", [pk, { commitment: "confirmed" }]);
    const raw = BigInt(lamports);
    return { raw, formatted: formatLamports(raw) } satisfies ChainBalanceResult;
  },

  async estimateNativeSendFee(_mnemonic, _accountIndex, settings, _to, amount) {
    const url = settings.solRpcUrl.trim();
    if (!url) throw new Error("Set a Solana JSON-RPC URL.");
    parseSolDecimalToLamports(amount);
    let lamports = ESTIMATED_TRANSFER_FEE_LAMPORTS;
    try {
      const fees = await solJsonRpc<unknown>(url, "getRecentPrioritizationFees", []);
      const nums: number[] = [];
      if (Array.isArray(fees)) {
        for (const row of fees) {
          if (typeof row === "number") nums.push(row);
          else if (row && typeof row === "object" && "prioritizationFee" in row) {
            const v = (row as { prioritizationFee?: number }).prioritizationFee;
            if (typeof v === "number") nums.push(v);
          }
        }
      }
      if (nums.length > 0) {
        const sorted = [...nums].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
        const priority = BigInt(Math.min(Math.max(med, 0), 500_000));
        lamports = ESTIMATED_TRANSFER_FEE_LAMPORTS + priority;
      }
    } catch {
      /* optional RPC */
    }
    return { lamports, display: `~${formatLamports(lamports)} fee (incl. signatures)` };
  },

  async signAndBroadcastNativeSend(params: NativeSendParams): Promise<NativeSendResult> {
    const { mnemonic, accountIndex, to, amountSolDecimal, solRpcUrl } = params;
    const url = solRpcUrl.trim();
    if (!url) throw new Error("Missing Solana RPC URL.");
    if (!amountSolDecimal) throw new Error("Missing amount.");
    const lamports = parseSolDecimalToLamports(amountSolDecimal);
    const keypair = getSolKeypair(mnemonic, accountIndex);
    const fromPubkey = keypair.publicKey;
    let toPubkey: PublicKey;
    try {
      toPubkey = new PublicKey(to.trim());
    } catch {
      throw new Error("Invalid Solana recipient address");
    }
    if (toPubkey.equals(fromPubkey)) throw new Error("Cannot send to self");

    type LatestHash = { context: unknown; value: { blockhash: string; lastValidBlockHeight: number } };
    const latest = await solJsonRpc<LatestHash>(url, "getLatestBlockhash", [{ commitment: "finalized" }]);
    const blockhash = latest?.value?.blockhash;
    if (typeof blockhash !== "string") throw new Error("Invalid getLatestBlockhash result");

    if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount too large for this client build");
    const ix = SystemProgram.transfer({ fromPubkey, toPubkey, lamports: Number(lamports) });

    const messageV0 = new TransactionMessage({
      payerKey: fromPubkey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([keypair]);

    const wire = tx.serialize();
    const b64 = u8ToBase64(wire);

    const sig = await solJsonRpc<string>(url, "sendTransaction", [
      b64,
      { encoding: "base64", skipPreflight: false, maxRetries: 3, preflightCommitment: "confirmed" },
    ]);
    return { txHash: sig, chain: "solana" };
  },
};
