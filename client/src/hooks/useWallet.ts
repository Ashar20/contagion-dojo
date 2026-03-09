/**
 * Starknet wallet hook — wraps @starknet-react/core for Contagion.
 * Uses Cartridge Controller with Google/Discord auth (no passkeys).
 */
import { useAccount, useConnect, useDisconnect } from '@starknet-react/core';
import { ControllerConnector } from '@cartridge/connector';

const ACTIONS_ADDRESS = "0x050aa714156b7fc942f0782d50d7323a0fb84fcffa8128a3d84f782c98df8e20";
const EGS_CONTRACT_ADDRESS = "0x00afdc03274b847d6a006272632464b66fe6ac217879e3c3fdec53578e5145a0";

export function useWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const publicKey = address ?? null;
  const walletType = 'starknet' as const;

  const connectWallet = async () => {
    const ctrl = connectors[0] as ControllerConnector;
    if (!ctrl) return;

    // Pre-approve session policies so in-game transactions auto-accept.
    await ctrl.connect({
      signupOptions: ["google", "discord"],
      policies: {
        contracts: {
          [EGS_CONTRACT_ADDRESS]: {
            methods: [{ name: "report_result", entrypoint: "report_result" }],
          },
          [ACTIONS_ADDRESS]: {
            methods: [
              { name: "spawn", entrypoint: "spawn" },
              { name: "move", entrypoint: "move" },
              { name: "dig", entrypoint: "dig" },
            ],
          },
        },
      },
    });

    // Sync starknet-react state after direct controller connection
    connect({ connector: ctrl });
  };

  return {
    publicKey,
    isConnected: !!isConnected,
    connectWallet,
    disconnect,
    connectors,
    getContractSigner: () => null,
    walletType,
  };
}
