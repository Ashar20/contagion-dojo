import type { PropsWithChildren } from "react";
import type { Connector } from "@starknet-react/core";
import { Chain } from "@starknet-react/chains";
import {
  jsonRpcProvider,
  StarknetConfig,
  cartridge,
} from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";

const RPC_URL = import.meta.env.VITE_RPC_URL ?? "https://api.cartridge.gg/x/starknet/sepolia";
const CHAIN_ID = "0x534e5f5345504f4c4941"; // SN_SEPOLIA

const WORLD_ADDRESS = "0x056e42d1a8638411797a6dac30816d7f31949c6f5ba5c502e8e8b269afc8ac61";
const ACTIONS_ADDRESS = "0x050aa714156b7fc942f0782d50d7323a0fb84fcffa8128a3d84f782c98df8e20";

const sepolia: Chain = {
  id: BigInt(CHAIN_ID),
  name: "Sepolia",
  network: "sepolia",
  testnet: true,
  nativeCurrency: {
    address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    name: "Stark",
    symbol: "STRK",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  paymasterRpcUrls: {
    avnu: { http: [RPC_URL] },
  },
};

const connector = new ControllerConnector({
  chains: [{ rpcUrl: RPC_URL }],
  defaultChainId: CHAIN_ID,
  policies: { contracts: {} },
  signupOptions: ["google", "discord"],
});

const provider = jsonRpcProvider({
  rpc: () => ({ nodeUrl: RPC_URL }),
});

export { WORLD_ADDRESS, ACTIONS_ADDRESS, RPC_URL };

type StarknetProviderProps = PropsWithChildren<{
  connectors?: Connector[];
}>;

export default function StarknetProvider({ children, connectors: externalConnectors }: StarknetProviderProps) {
  return (
    <StarknetConfig
      chains={[sepolia]}
      provider={provider}
      connectors={externalConnectors ?? [connector]}
      explorer={cartridge}
      defaultChainId={sepolia.id}
    >
      {children}
    </StarknetConfig>
  );
}
