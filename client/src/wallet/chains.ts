import type { Chain } from "viem";
import { mainnet, sepolia } from "viem/chains";
import type { EthNetworkId } from "./types";

export function chainFromEthNetwork(id: EthNetworkId): Chain {
  return id === "sepolia" ? sepolia : mainnet;
}
