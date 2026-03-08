/**
 * Starknet wallet hook — wraps @starknet-react/core for Contagion.
 * Uses Cartridge Controller with Google/Discord auth (no passkeys).
 */
import { useAccount, useConnect, useDisconnect } from '@starknet-react/core';
import { ControllerConnector } from '@cartridge/connector';

export function useWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const publicKey = address ?? null;
  const walletType = 'starknet' as const;

  const connectWallet = async () => {
    const ctrl = connectors[0] as ControllerConnector;
    if (!ctrl) return;

    // Use direct controller.connect() with signupOptions to force
    // Google/Discord auth even for existing passkey accounts.
    await ctrl.connect({
      signupOptions: ["google", "discord"],
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
