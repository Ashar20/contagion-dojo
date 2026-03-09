/**
 * Contagion — Dojo Hackathon
 * Same home page as zk-plague. Connect with Starknet, play over WebSocket.
 */
import { lazy, Suspense, Component, useRef, useEffect, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { LobbyPage } from './pages/LobbyPage';
import { useWallet } from './hooks/useWallet';
const ContagionGameDojo = lazy(() =>
  import('./games/contagion/ContagionGameDojo').then((m) => ({ default: m.ContagionGameDojo }))
);

class GameErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="card pixel-card" style={{ padding: '2rem', maxWidth: 480 }}>
          <h3 style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>Game failed to load</h3>
          <p
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: '0.8rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function PlayRoute() {
  const { publicKey, isConnected } = useWallet();
  const userAddress = publicKey ?? '';
  if (!isConnected) return <Navigate to="/lobby" replace />;
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '3rem' }}>Loading game…</div>}>
      <ContagionGameDojo userAddress={userAddress} />
    </Suspense>
  );
}

function RoomRoute() {
  const { code } = useParams<{ code: string }>();
  const { publicKey, isConnected, connectWallet } = useWallet();
  const userAddress = publicKey ?? '';
  const connectAttempted = useRef(false);

  useEffect(() => {
    if (!isConnected && !connectAttempted.current) {
      connectAttempted.current = true;
      connectWallet().catch(() => {});
    }
  }, [isConnected, connectWallet]);

  if (!isConnected) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.6)' }}>
        Connecting wallet…
      </div>
    );
  }

  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '3rem' }}>Loading game…</div>}>
      <ContagionGameDojo userAddress={userAddress} roomCode={code} />
    </Suspense>
  );
}

function AppLayout() {
  const location = useLocation();
  const isLanding = location.pathname === '/';
  return (
    <Layout
      title="Contagion"
      subtitle="Trust No One — Social deduction on Starknet"
      variant="dark"
      mainClassName={isLanding ? 'studio-main studio-main-full' : undefined}
    >
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/room/:code" element={<RoomRoute />} />
        <Route path="/play" element={<PlayRoute />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <GameErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppLayout />
      </HashRouter>
    </GameErrorBoundary>
  );
}
