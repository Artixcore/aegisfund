import * as btc from "@scure/btc-signer";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { Keypair } from "@solana/web3.js";
import { derivePath } from "ed25519-hd-key";
import { mnemonicToAccount } from "viem/accounts";
import type { BtcNetworkId, WalletSettings } from "./types";

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

function seedHexFromMnemonic(mnemonic: string): string {
  const seed = mnemonicToSeedSync(mnemonic, "");
  let hex = "";
  for (let i = 0; i < seed.length; i++) hex += seed[i]!.toString(16).padStart(2, "0");
  return hex;
}

/** Ed25519 keypair derived from mnemonic (Ledger-style path). */
export function getSolKeypair(mnemonic: string, accountIndex: number): Keypair {
  const { key } = derivePath(solDerivationPath(accountIndex), seedHexFromMnemonic(mnemonic));
  const seed32 = new Uint8Array(key.length);
  for (let i = 0; i < key.length; i++) seed32[i] = key[i]!;
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
