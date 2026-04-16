import * as btc from "@scure/btc-signer";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { Keypair } from "@solana/web3.js";
import { mnemonicToAccount } from "viem/accounts";
import type { BtcNetworkId, WalletSettings } from "./types";

/** SLIP-0010 Ed25519 (same algorithm as `ed25519-hd-key`, without Node `Buffer`). */
const ED25519_SEED = new TextEncoder().encode("ed25519 seed");
const SLIP10_ED25519_PATH = /^m(\/[0-9]+')+$/;
const HARDENED = 0x80000000;

function slip10Ed25519Master(seedBytes: Uint8Array): { key: Uint8Array; chainCode: Uint8Array } {
  const I = hmac(sha512, ED25519_SEED, seedBytes);
  return { key: I.subarray(0, 32), chainCode: I.subarray(32, 64) };
}

function slip10Ed25519Child(
  parent: { key: Uint8Array; chainCode: Uint8Array },
  index: number
): { key: Uint8Array; chainCode: Uint8Array } {
  const indexBytes = new Uint8Array(4);
  new DataView(indexBytes.buffer).setUint32(0, index, false);
  const data = new Uint8Array(1 + parent.key.length + 4);
  data[0] = 0;
  data.set(parent.key, 1);
  data.set(indexBytes, 1 + parent.key.length);
  const I = hmac(sha512, parent.chainCode, data);
  return { key: I.subarray(0, 32), chainCode: I.subarray(32, 64) };
}

/** BIP39 seed bytes → 32-byte Ed25519 seed at hardened-only path (e.g. Ledger SOL). */
function slip10Ed25519DerivePath(path: string, seedBytes: Uint8Array): Uint8Array {
  if (!SLIP10_ED25519_PATH.test(path)) {
    throw new Error("Invalid Ed25519 derivation path");
  }
  const segments = path
    .split("/")
    .slice(1)
    .map((p) => parseInt(p.replace("'", ""), 10));
  let keys = slip10Ed25519Master(seedBytes);
  for (const seg of segments) {
    keys = slip10Ed25519Child(keys, seg + HARDENED);
  }
  return keys.key;
}

export function ethDerivationPath(accountIndex: number): `m/44'/60'/0'/0/${number}` {
  return `m/44'/60'/0'/0/${accountIndex}` as `m/44'/60'/0'/0/${number}`;
}

export function btcDerivationPath(accountIndex: number, btcNetwork: BtcNetworkId): string {
  const coin = btcNetwork === "mainnet" ? 0 : 1;
  return `m/84'/${coin}'/0'/0/${accountIndex}`;
}

/** Ledger-style Solana path: `m/44'/501'/0'/{accountIndex}'` */
export function solDerivationPath(accountIndex: number): string {
  return `m/44'/501'/0'/${accountIndex}'`;
}

export function getEthAccount(mnemonic: string, accountIndex: number) {
  return mnemonicToAccount(mnemonic, { path: ethDerivationPath(accountIndex) });
}

export function getBtcAddress(mnemonic: string, accountIndex: number, btcNetwork: BtcNetworkId): string {
  const seed = mnemonicToSeedSync(mnemonic, "");
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(btcDerivationPath(accountIndex, btcNetwork));
  if (!child.privateKey) throw new Error("BTC derive failed");
  const pub = secp256k1.getPublicKey(child.privateKey, true);
  const net = btcNetwork === "testnet" ? btc.TEST_NETWORK : btc.NETWORK;
  return btc.p2wpkh(pub, net).address!;
}

export function getBtcPrivateKeyBytes(mnemonic: string, accountIndex: number, btcNetwork: BtcNetworkId): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic, "");
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(btcDerivationPath(accountIndex, btcNetwork));
  if (!child.privateKey) throw new Error("BTC derive failed");
  return child.privateKey;
}

export function getEthAddress(mnemonic: string, accountIndex: number): `0x${string}` {
  return getEthAccount(mnemonic, accountIndex).address;
}

/** Ed25519 keypair derived from mnemonic (Ledger-style path). */
export function getSolKeypair(mnemonic: string, accountIndex: number): Keypair {
  const seed = mnemonicToSeedSync(mnemonic, "");
  const seed32 = slip10Ed25519DerivePath(solDerivationPath(accountIndex), seed);
  return Keypair.fromSeed(seed32);
}

export function getSolAddress(mnemonic: string, accountIndex: number): string {
  return getSolKeypair(mnemonic, accountIndex).publicKey.toBase58();
}

export async function addressesForSettings(
  mnemonic: string,
  settings: Pick<WalletSettings, "accountIndex" | "btcNetwork">,
): Promise<{
  ethereum: `0x${string}`;
  bitcoin: string;
  solana: string;
}> {
  return {
    ethereum: getEthAddress(mnemonic, settings.accountIndex),
    bitcoin: getBtcAddress(mnemonic, settings.accountIndex, settings.btcNetwork),
    solana: getSolAddress(mnemonic, settings.accountIndex),
  };
}
