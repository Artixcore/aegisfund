import * as btc from "@scure/btc-signer";
import { hex } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import type { ChainAdapter, ChainBalanceResult, NativeSendParams, NativeSendResult, WalletSettings } from "./types";
import { getBtcAddress, getBtcPrivateKeyBytes } from "./derive";

const DUST_SATS = 546n;

async function esploraJson<T>(base: string, path: string): Promise<T> {
  const root = base.replace(/\/$/, "");
  const res = await fetch(`${root}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "AegisFund-LocalWallet/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Esplora ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

type EsploraUtxo = {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
};

/** Rough vbytes for P2WPKH (approximation for fee estimate). */
function estimateVSize(inputCount: number, outputCount: number): number {
  return 10 + inputCount * 68 + outputCount * 31;
}

export async function fetchBtcFeeRateSatPerVb(base: string): Promise<number> {
  try {
    const est = await esploraJson<Record<string, number>>(base, "/fee-estimates");
    const v = est["6"] ?? est["12"] ?? est["25"] ?? est["144"];
    if (typeof v === "number" && v >= 1) return Math.ceil(v);
  } catch {
    /* ignore */
  }
  return 10;
}

export type BtcSpendPlan = {
  picked: EsploraUtxo[];
  satsOut: bigint;
  fee: bigint;
  change: bigint;
  twoOutputs: boolean;
};

export function planBtcSpend(utxos: EsploraUtxo[], satsOut: bigint, rate: number): BtcSpendPlan {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const picked: EsploraUtxo[] = [];
  let sum = 0n;
  for (const u of sorted) {
    picked.push(u);
    sum += BigInt(u.value);
    const fee2 = BigInt(Math.ceil(estimateVSize(picked.length, 2) * rate));
    const change2 = sum - satsOut - fee2;
    if (change2 > DUST_SATS) {
      return { picked, satsOut, fee: fee2, change: change2, twoOutputs: true };
    }
    const fee1min = BigInt(Math.ceil(estimateVSize(picked.length, 1) * rate));
    const feeImplicit = sum - satsOut;
    if (sum >= satsOut && feeImplicit >= fee1min) {
      return { picked, satsOut, fee: feeImplicit, change: 0n, twoOutputs: false };
    }
  }
  throw new Error("Insufficient confirmed balance for amount + fee.");
}

export const bitcoinAdapter: ChainAdapter = {
  id: "bitcoin",

  async getReceiveAddress(mnemonic, accountIndex, settings) {
    return getBtcAddress(mnemonic, accountIndex, settings.btcNetwork);
  },

  async getBalance(mnemonic, accountIndex, settings) {
    const base = settings.btcEsploraBase.trim();
    if (!base) throw new Error("Set a BTC Esplora-compatible REST base URL.");
    const addr = getBtcAddress(mnemonic, accountIndex, settings.btcNetwork);
    const data = await esploraJson<{
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
      mempool_stats?: { funded_txo_sum: number; spent_txo_sum: number };
    }>(base, `/address/${encodeURIComponent(addr)}`);
    const chainBal = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
    const mp = data.mempool_stats;
    const mempoolBal = mp ? mp.funded_txo_sum - mp.spent_txo_sum : 0;
    const sats = BigInt(chainBal + mempoolBal);
    const btcAmt = Number(sats) / 1e8;
    return {
      raw: sats,
      formatted: `${btcAmt.toFixed(8)} BTC`,
    } satisfies ChainBalanceResult;
  },

  async estimateNativeSendFee(mnemonic, accountIndex, settings, _to, amountBtcDecimal) {
    const base = settings.btcEsploraBase.trim();
    if (!base) throw new Error("Set BTC Esplora base.");
    const satsOut = BigInt(Math.round(Number(amountBtcDecimal) * 1e8));
    if (satsOut <= 0n) throw new Error("Invalid amount.");
    const addr = getBtcAddress(mnemonic, accountIndex, settings.btcNetwork);
    const utxos = (await esploraJson<EsploraUtxo[]>(base, `/address/${encodeURIComponent(addr)}/utxo`)).filter((u) => u.status.confirmed);
    const rate = await fetchBtcFeeRateSatPerVb(base);
    const { fee } = planBtcSpend(utxos, satsOut, rate);
    return { sats: fee, display: `~${Number(fee) / 1e8} BTC fee (${rate} sat/vB est.)` };
  },

  async signAndBroadcastNativeSend(params: NativeSendParams): Promise<NativeSendResult> {
    const { mnemonic, accountIndex, to, amountSats, btcEsploraBase, btcNetwork } = params;
    const base = btcEsploraBase.trim();
    if (!base) throw new Error("Missing BTC Esplora base.");
    if (!amountSats) throw new Error("Missing amount (sats).");
    const satsOut = BigInt(amountSats);
    if (satsOut <= 0n) throw new Error("Invalid amount.");

    const net = btcNetwork === "testnet" ? btc.TEST_NETWORK : btc.NETWORK;
    const priv = getBtcPrivateKeyBytes(mnemonic, accountIndex, btcNetwork);
    const pub = secp256k1.getPublicKey(priv, true);
    const pay = btc.p2wpkh(pub, net);

    const fromAddr = getBtcAddress(mnemonic, accountIndex, btcNetwork);
    const utxos = (await esploraJson<EsploraUtxo[]>(base, `/address/${encodeURIComponent(fromAddr)}/utxo`)).filter((u) => u.status.confirmed);
    const rate = await fetchBtcFeeRateSatPerVb(base);
    const plan = planBtcSpend(utxos, satsOut, rate);

    const tx = new btc.Transaction();
    for (const p of plan.picked) {
      tx.addInput({
        txid: hex.decode(p.txid),
        index: p.vout,
        witnessUtxo: {
          script: pay.script,
          amount: BigInt(p.value),
        },
      });
    }
    tx.addOutputAddress(to, satsOut, net);
    if (plan.twoOutputs && plan.change > 0n) {
      tx.addOutputAddress(fromAddr, plan.change, net);
    }

    tx.sign(priv);
    tx.finalize();
    const rawHex = tx.hex;
    const res = await fetch(`${base}/tx`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: rawHex,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      throw new Error(`Broadcast failed: ${res.status} ${errTxt}`);
    }
    const txidText = (await res.text()).trim();
    return { txHash: txidText || tx.id, chain: "bitcoin" };
  },
};
