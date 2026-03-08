import { useConnect, useDisconnect, useAccount } from '@starknet-react/core';

export function DojoWalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        type="button"
        className="pixel-btn pixel-btn-secondary"
        onClick={() => disconnect()}
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="pixel-btn pixel-btn-green"
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      Connect
    </button>
  );
}
