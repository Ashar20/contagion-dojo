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

const WORLD_ADDRESS = "0x07d4ed8b03fba33979c1cebd8c4e8fafffdcc8a8ae40874b21082358158f58e8";
const ACTIONS_ADDRESS = "0x004d30ab23d312ef66ede7285181e39c0964fe52225427048f3d6cc5e9db86d6";
const EGS_CONTRACT_ADDRESS = "0x00afdc03274b847d6a006272632464b66fe6ac217879e3c3fdec53578e5145a0";

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
  policies: {
    contracts: {
      [EGS_CONTRACT_ADDRESS]: {
        methods: [{ name: "report_result", entrypoint: "report_result" }],
      },
      [ACTIONS_ADDRESS]: {
        methods: [
          { name: "create_room", entrypoint: "create_room" },
          { name: "join_room", entrypoint: "join_room" },
          { name: "start_game", entrypoint: "start_game" },
          { name: "move_player", entrypoint: "move_player" },
          { name: "infect", entrypoint: "infect" },
          { name: "accuse", entrypoint: "accuse" },
          { name: "collect_cure", entrypoint: "collect_cure" },
          { name: "take_damage", entrypoint: "take_damage" },
        ],
      },
    },
  },
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
