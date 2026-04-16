import * as btc from "@scure/btc-signer";
import { PublicKey } from "@solana/web3.js";
import { isAddress } from "viem";
import type { DappRegisterReceiveBtcNetwork } from "@shared/dappAuth";

export function validateReceiveAddresses(params: {
  btc: string;
  eth: string;
  sol: string;
  btcNetwork: DappRegisterReceiveBtcNetwork;
}): { ok: true } | { ok: false; message: string } {
  const eth = params.eth.trim().toLowerCase();
  if (!isAddress(eth)) {
    return { ok: false, message: "Invalid ETH address" };
  }
  const net = params.btcNetwork === "testnet" ? btc.TEST_NETWORK : btc.NETWORK;
  try {
    btc.Address(net).decode(params.btc.trim());
  } catch {
    return { ok: false, message: "Invalid BTC address for selected network" };
  }
  try {
    new PublicKey(params.sol.trim());
  } catch {
    return { ok: false, message: "Invalid SOL address" };
  }
  return { ok: true };
}
