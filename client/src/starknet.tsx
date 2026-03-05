// -- Cartridge Controller --
// Configures the Controller wallet connector with session key policies,
// so players don't have to manually sign every transaction.

import type { PropsWithChildren } from "react";
import type { Connector } from "@starknet-react/core";
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

// Custom chain definition for local Katana devnet. In production, use a chain from @starknet-react/chains.
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

// Look up the deployed contract address from the manifest — policies are per-contract.
const actionsAddress =
  manifest.contracts.find((c) => c.tag === "starter-actions")?.address ?? "0x0";

const connector = new ControllerConnector({
  chains: [{ rpcUrl: RPC_URL }],
  defaultChainId: KATANA_CHAIN_ID,
  // Session key policies: whitelist which methods the Controller can auto-sign.
  // Without these, the player would have to approve every transaction manually.
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

type StarknetProviderProps = PropsWithChildren<{
  connectors?: Connector[];
}>;

// StarknetConfig provides hooks like useAccount, useConnect. autoConnect resumes the previous session.
export default function StarknetProvider({ children, connectors: externalConnectors }: StarknetProviderProps) {
  return (
    <StarknetConfig
      chains={[katana]}
      provider={provider}
      connectors={externalConnectors ?? [connector]}
      explorer={cartridge}
      defaultChainId={katana.id}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
