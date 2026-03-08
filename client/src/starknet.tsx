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
// Use Katana if running (./scripts/dev.sh), else public Sepolia for wallet-only
const RPC_URL = import.meta.env.VITE_RPC_URL ?? "http://localhost:5050";
const KATANA_CHAIN_ID = "0x4b4154414e41"; // "KATANA" hex-encoded

// Custom chain for Katana. For Contagion we only need wallet — game runs over WebSocket.
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

// Contagion runs over WebSocket — no on-chain game actions yet. Empty policies.
const connector = new ControllerConnector({
  chains: [{ rpcUrl: RPC_URL }],
  defaultChainId: KATANA_CHAIN_ID,
  policies: { contracts: {} },
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
