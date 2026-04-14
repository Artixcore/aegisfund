import * as btc from "@scure/btc-signer";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { mnemonicToAccount } from "viem/accounts";
import type { BtcNetworkId, WalletSettings } from "./types";

export function ethDerivationPath(accountIndex: number): `m/44'/60'/0'/0/${number}` {
  return `m/44'/60'/0'/0/${accountIndex}` as `m/44'/60'/0'/0/${number}`;
}

export function btcDerivationPath(accountIndex: number, btcNetwork: BtcNetworkId): string {
  const coin = btcNetwork === "mainnet" ? 0 : 1;
  return `m/84'/${coin}'/0'/0/${accountIndex}`;
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

export async function addressesForSettings(mnemonic: string, settings: Pick<WalletSettings, "accountIndex" | "btcNetwork">): Promise<{
  ethereum: `0x${string}`;
  bitcoin: string;
}> {
  return {
    ethereum: getEthAddress(mnemonic, settings.accountIndex),
    bitcoin: getBtcAddress(mnemonic, settings.accountIndex, settings.btcNetwork),
  };
}
