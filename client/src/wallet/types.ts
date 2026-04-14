/** Local non-custodial wallet (browser-only chain I/O). */

export type EthNetworkId = "mainnet" | "sepolia";
export type BtcNetworkId = "mainnet" | "testnet";

export type LocalChainId = "ethereum" | "bitcoin";

export type WalletSettings = {
  ethRpcUrl: string;
  /** Esplora-compatible REST base, no trailing slash */
  btcEsploraBase: string;
  ethNetwork: EthNetworkId;
  btcNetwork: BtcNetworkId;
  /** BIP44 account index (ETH path m/44'/60'/0'/0/i) */
  accountIndex: number;
};

export const DEFAULT_WALLET_SETTINGS: WalletSettings = {
  ethRpcUrl: "",
  btcEsploraBase: "https://blockstream.info/api",
  ethNetwork: "mainnet",
  btcNetwork: "mainnet",
  accountIndex: 0,
};

export type WrappedVault = {
  saltB64: string;
  iv: string;
  ciphertext: string;
};

export type LocalTxRecord = {
  id: string;
  chain: LocalChainId;
  txHash: string;
  amountDisplay: string;
  to?: string;
  from?: string;
  status: "pending" | "confirmed" | "failed";
  ts: number;
};

export type ChainBalanceResult = {
  raw: bigint;
  /** Human-readable (approx) */
  formatted: string;
};

export type NativeSendParams = {
  mnemonic: string;
  accountIndex: number;
  to: string;
  /** ETH: wei string or decimal ether string with "0x" for wei — we use decimal ether from UI */
  amountEthDecimal?: string;
  /** BTC: satoshis as string */
  amountSats?: string;
  ethRpcUrl: string;
  ethNetwork: EthNetworkId;
  btcEsploraBase: string;
  btcNetwork: BtcNetworkId;
};

export type NativeSendResult = {
  txHash: string;
  chain: LocalChainId;
};

/** Extensible per-chain operations (keys never leave callers except for signing helpers). */
export interface ChainAdapter {
  readonly id: LocalChainId;
  getReceiveAddress(mnemonic: string, accountIndex: number, settings: WalletSettings): Promise<string>;
  getBalance(mnemonic: string, accountIndex: number, settings: WalletSettings): Promise<ChainBalanceResult>;
  estimateNativeSendFee(
    mnemonic: string,
    accountIndex: number,
    settings: WalletSettings,
    to: string,
    amount: string,
  ): Promise<{ wei?: bigint; sats?: bigint; display: string }>;
  signAndBroadcastNativeSend(params: NativeSendParams): Promise<NativeSendResult>;
}
