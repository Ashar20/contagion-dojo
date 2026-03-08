/**
 * Contagion — Dojo Hackathon
 * Connect with Cartridge/Starknet, play over WebSocket. No Stellar.
 */
import { Suspense, lazy } from 'react';
import { useAccount, useConnect, useDisconnect } from '@starknet-react/core';
import './App.css';

const ContagionGameDojo = lazy(() =>
  import('./games/contagion/ContagionGameDojo').then((m) => ({ default: m.ContagionGameDojo }))
);

function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (!isConnected || !address) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-shovel">☣️</div>
          <h1 className="login-title">Contagion</h1>
          <p className="login-tagline">Trust No One — Social deduction on Starknet</p>
          <button
            className="btn-login"
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          >
            Connect & Play
          </button>
          <div className="login-ornament">&#9674; &#9674; &#9674;</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="header">
        <span className="header-title">Contagion ☣️</span>
        <div className="header-right">
          <span className="header-username">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <button className="btn-logout" onClick={() => disconnect()}>
            Log out
          </button>
        </div>
      </header>
      <main className="main-content">
        <Suspense fallback={<div className="loading">Loading game…</div>}>
          <ContagionGameDojo userAddress={address} />
        </Suspense>
      </main>
    </>
  );
}

export default App;
