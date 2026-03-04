import type { PropsWithChildren } from "react";
import { Chain } from "@starknet-react/chains";
import {
  jsonRpcProvider,
  StarknetConfig,
  cartridge,
} from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { RPC_URL } from "./dojo/config";
import manifest from "./dojo/manifest_dev.json";

const KATANA_CHAIN_ID = "0x4b4154414e41"; // "KATANA" hex-encoded

const katana: Chain = {
  id: BigInt(KATANA_CHAIN_ID),
  name: "Katana",
  network: "katana",
  testnet: true,
  nativeCurrency: {
    address:
      "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
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

const actionsAddress =
  manifest.contracts.find((c) => c.tag === "starter-actions")?.address ?? "0x0";

const connector = new ControllerConnector({
  chains: [{ rpcUrl: RPC_URL }],
  defaultChainId: KATANA_CHAIN_ID,
  policies: {
    contracts: {
      [actionsAddress]: {
        methods: [
          {
            name: "Spawn",
            entrypoint: "spawn",
            description: "Start or restart your adventure",
          },
          {
            name: "Move",
            entrypoint: "move",
            description: "Move your position on the grid",
          },
          {
            name: "Dig",
            entrypoint: "dig",
            description: "Dig the tile you are standing on",
          },
        ],
      },
    },
  },
});

const provider = jsonRpcProvider({
  rpc: () => ({ nodeUrl: RPC_URL }),
});

export default function StarknetProvider({ children }: PropsWithChildren) {
  return (
    <StarknetConfig
      chains={[katana]}
      provider={provider}
      connectors={[connector]}
      explorer={cartridge}
      defaultChainId={katana.id}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
