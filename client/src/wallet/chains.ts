import { mainnet, sepolia } from "viem/chains";
import type { EthNetworkId } from "./types";

export function chainFromEthNetwork(id: EthNetworkId) {
  return id === "sepolia" ? sepolia : mainnet;
}
