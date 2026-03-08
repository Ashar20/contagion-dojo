/**
 * Simplified ContagionGame for Dojo hackathon.
 * Map-only view: connect and play. No Stellar, no lobby, no on-chain proof submission.
 */
import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useWallet } from '../../hooks/useWallet';
import type { OtherPlayer } from './components/IsometricMapCanvas';
import { FANTASY_TESTING_HOUSE_DOOR_X, FANTASY_TESTING_HOUSE_DOOR_Y } from './mapConstants';
import { InventoryOverlay } from './components/InventoryOverlay';
import { useGameSocket } from './hooks/useGameSocket';
import { GameHUD } from './components/GameHUD';
import type { PlaceableItemData } from './components/PlaceableItem';
import { Radar } from './components/Radar';
import { PatientZeroNotification } from './components/PatientZeroNotification';
import { warmupZKBackend } from '../../utils/zkProver';

const IsometricMapCanvasLazy = lazy(() =>
  import('./components/IsometricMapCanvas').then((m) => ({ default: m.IsometricMapCanvas }))
);

interface ContagionGameDojoProps {
  /** Starknet address. If omitted, uses address from useWallet. */
  userAddress?: string;
  /** Room code for multiplayer rooms. */
  roomCode?: string;
}

export function ContagionGameDojo({ userAddress = '', roomCode }: ContagionGameDojoProps) {
  const { publicKey } = useWallet();
  const effectiveAddress = (userAddress || (publicKey ?? '')) as string;

  const [showInventory, setShowInventory] = useState(false);
  const [showTestResultNotification, setShowTestResultNotification] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [accuseMode, setAccuseMode] = useState(false);
  const [showPatientZero, setShowPatientZero] = useState(false);
  const prevStatusRef = useRef<'unknown' | 'healthy' | 'infected'>('unknown');

  const [foodPositions, setFoodPositions] = useState<{ gridX: number; gridY: number }[]>([]);
  const [rareEntityPositions, setRareEntityPositions] = useState<{ gridX: number; gridY: number }[]>([]);
  const mapSize = 200;
  const mapCenter = Math.floor(mapSize / 2);

  const localColor = useMemo(() => {
    if (!effectiveAddress) return '#4CAF50';
    const hash = effectiveAddress.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const hue = (hash * 37) % 360;
    return `hsl(${hue}, 70%, 45%)`;
  }, [effectiveAddress]);

  const socket = useGameSocket(effectiveAddress, localColor, roomCode);

  const [localPlayerX, setLocalPlayerX] = useState(() => Math.floor((socket.mapSize || 200) / 2));
  const [localPlayerY, setLocalPlayerY] = useState(() => Math.floor((socket.mapSize || 200) / 2));
  const lastSyncedGridRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (socket.gameStarted) {
      warmupZKBackend().catch(() => { /* non-critical */ });
    }
  }, [socket.gameStarted]);

  useEffect(() => {
    if (socket.lastTestResult) {
      setShowTestResultNotification(true);
      const t = setTimeout(() => setShowTestResultNotification(false), 4000);
      return () => clearTimeout(t);
    } else {
      setShowTestResultNotification(false);
    }
  }, [socket.lastTestResult]);

  useEffect(() => {
    if (socket.myStatus === 'infected' && prevStatusRef.current !== 'infected') {
      setShowPatientZero(true);
    }
    prevStatusRef.current = socket.myStatus;
  }, [socket.myStatus]);

  useEffect(() => {
    if (socket.players.length === 0) return;
    const localPlayer = socket.players.find(p => p.id === socket.playerId);
    if (!localPlayer) return;
    const { gridX, gridY } = localPlayer;
    const last = lastSyncedGridRef.current;
    if (last && last.x === gridX && last.y === gridY) return;
    lastSyncedGridRef.current = { x: gridX, y: gridY };
    setLocalPlayerX(prev => (prev !== gridX ? gridX : prev));
    setLocalPlayerY(prev => (prev !== gridY ? gridY : prev));
  }, [socket.tick, socket.playerId]);

  const localName = useMemo(() => {
    const myPlayer = socket.players.find(p => p.id === socket.playerId);
    return myPlayer?.name || 'Player';
  }, [socket.players, socket.playerId]);

  const otherPlayers: OtherPlayer[] = useMemo(() => {
    return socket.players
      .filter(p => p.id !== socket.playerId)
      .map(p => ({
        id: p.id,
        address: p.id,
        name: p.name,
        color: p.color,
        gridX: p.gridX,
        gridY: p.gridY,
        infected: socket.infectedPlayerIds.includes(p.id),
      }));
  }, [socket.players, socket.playerId, socket.infectedPlayerIds]);

  const radarPlayers = useMemo(() => otherPlayers.filter(p => p.id != null) as { id: string; name: string; color: string; gridX: number; gridY: number }[], [otherPlayers]);

  const cureFragmentItems: PlaceableItemData[] = useMemo(
    () => socket.cureFragments.map(f => ({
      id: `fragment-${f.id}`,
      type: 'cure-fragment',
      gridX: f.gridX,
      gridY: f.gridY,
      image: '',
    })),
    [socket.cureFragments],
  );

  const radarTestCamps = useMemo(() => {
    const houseDoor = { x: FANTASY_TESTING_HOUSE_DOOR_X, y: FANTASY_TESTING_HOUSE_DOOR_Y };
    if (socket.testCamps.length > 0) return [...socket.testCamps, houseDoor];
    return [
      { x: mapCenter + 2, y: mapCenter + 1 },
      { x: mapCenter + 15, y: mapCenter },
      { x: mapCenter - 12, y: mapCenter + 18 },
      { x: mapCenter + 20, y: mapCenter - 15 },
      houseDoor,
    ];
  }, [socket.testCamps, mapCenter]);

  if (!effectiveAddress) {
    return (
      <div className="pixel-card rounded-xl p-8" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(12px)' }}>
        <p className="text-lg text-gray-600">Connect your Starknet wallet to play.</p>
      </div>
    );
  }

  return (
    <div className="pixel-card rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-orange-700">Game has begun!</h2>
      </div>
      <div
        className="relative w-full border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-100"
        style={{
          width: '100%',
          height: '800px',
          maxWidth: '1400px',
          margin: '0 auto',
        }}
      >
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-lg bg-black/50 px-3 py-1.5 text-xs font-mono text-white backdrop-blur-sm">
          {socket.connected ? `Players: ${socket.players.length}` : 'Connecting...'}
        </div>
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            className="pixel-btn pixel-btn-orange"
            onClick={() => setShowInventory(true)}
            title="Inventory"
          >
            Inventory
          </button>
          <button
            className="pixel-btn pixel-btn-purple"
            onClick={() => setShowLeaderboard(true)}
            title="Leaderboard"
          >
            Leaderboard
          </button>
        </div>

        {socket.waveCountdown > 0 && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
            <div className="font-mono text-9xl font-bold text-red-500 animate-pulse" style={{ textShadow: '0 0 30px rgba(255, 0, 0, 0.8)' }}>
              {socket.waveCountdown}
            </div>
            <div className="font-mono text-3xl font-bold text-white text-center mt-4">
              MOB WAVE INCOMING
            </div>
          </div>
        )}

        {socket.waveNumber > 0 && socket.waveCountdown === 0 && (
          <div className="absolute top-4 left-4 z-20 bg-black/70 px-4 py-2 rounded-lg border-2 border-orange-500">
            <div className="font-mono text-xl font-bold text-orange-400">
              WAVE {socket.waveNumber}
            </div>
            {socket.farmPatches.length > 0 && (
              <div className="mt-1 text-sm text-white">
                <div>Farms: {socket.farmPatches.length}</div>
                {(() => {
                  let nearestFarm = socket.farmPatches[0];
                  let minDist = Infinity;
                  for (const farm of socket.farmPatches) {
                    const dx = farm.gridX - localPlayerX;
                    const dy = farm.gridY - localPlayerY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < minDist) {
                      minDist = dist;
                      nearestFarm = farm;
                    }
                  }
                  const dx = nearestFarm.gridX - localPlayerX;
                  const dy = nearestFarm.gridY - localPlayerY;
                  const distance = Math.floor(Math.sqrt(dx * dx + dy * dy));
                  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                  return (
                    <div className="mt-1 flex items-center gap-2">
                      <div
                        className="text-xl"
                        style={{
                          transform: `rotate(${angle + 90}deg)`,
                          display: 'inline-block',
                          transition: 'transform 0.2s'
                        }}
                      >
                        ▼
                      </div>
                      <span className="text-cyan-400 font-mono text-xs">Nearest: {distance}t</span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {showTestResultNotification && socket.lastTestResult && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-black/90 px-6 py-4 rounded-lg border-4 pointer-events-none"
            style={{
              borderColor: socket.lastTestResult.infected ? '#ff0000' : '#00ff00',
              animation: 'testResultFadeOut 4s ease-out forwards',
            }}
          >
            <style>{`
              @keyframes testResultFadeOut {
                0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                60%  { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
              }
            `}</style>
            <div className="font-mono text-xl font-bold" style={{ color: socket.lastTestResult.infected ? '#ff0000' : '#00ff00' }}>
              {socket.lastTestResult.infected ? '☣️ INFECTED' : '✓ HEALTHY'}
            </div>
          </div>
        )}

        <GameHUD
          myStatus={socket.myStatus}
          accusations={socket.accusations}
          voteResults={socket.voteResults}
          flashedProofs={socket.flashedProofs}
          gameOver={socket.gameOver}
          gameStarted={socket.gameStarted}
          connected={socket.connected}
          localPlayerId={socket.playerId}
          accuseMode={accuseMode}
          playerCount={socket.players.length}
          lastTestResult={socket.lastTestResult}
          isPatientZero={socket.isPatientZero}
          myProof={socket.myProof}
          isGeneratingProof={socket.isGeneratingProof}
          roomCode={roomCode}
          onToggleAccuseMode={() => setAccuseMode(prev => !prev)}
          onVote={socket.vote}
          onRestart={socket.restart}
          onFlashProof={socket.flashProof}
        />

        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <Suspense fallback={<div className="flex items-center justify-center w-full h-full bg-black/80 text-white font-mono">Loading map…</div>}>
            <IsometricMapCanvasLazy
              width={1400}
              height={800}
              mapSize={socket.mapSize}
              otherPlayers={otherPlayers}
              placeableItems={cureFragmentItems}
              onFoodPositionsChange={setFoodPositions}
              onRareEntityPositionsChange={setRareEntityPositions}
              localPlayerName={localName}
              localPlayerColor={localColor}
              localPlayerInfected={socket.myStatus === 'infected'}
              isPatientZero={socket.isPatientZero}
              onInfectNearby={() => socket.infectNearby()}
              onPositionChange={(gridX, gridY) => {
                socket.sendMove(gridX, gridY);
                if (gridX !== localPlayerX || gridY !== localPlayerY) {
                  setLocalPlayerX(gridX);
                  setLocalPlayerY(gridY);
                }
              }}
              onHealthChange={() => {}}
              testCamps={radarTestCamps}
              deathTrigger={socket.deathTrigger}
              buriedGems={socket.buriedGems}
              dugGems={socket.dugGems}
              onDigGem={(gemId, gridX, gridY) => socket.digGem(gemId, gridX, gridY)}
              onCollectGem={(gemId, gridX, gridY) => socket.collectGem(gemId, gridX, gridY)}
              onTaskEvent={(ev) => {
                if (ev.type === 'damage_taken' && ev.enemyType) {
                  socket.reportDamage(ev.enemyType);
                }
              }}
              onKeyAction={(key, gridX, gridY) => {
                if (key === 't') {
                  const camps = radarTestCamps;
                  const nearTestCamp = camps.some(
                    c => Math.abs(gridX - c.x) <= 3 && Math.abs(gridY - c.y) <= 3
                  );
                  if (nearTestCamp) {
                    socket.testInfection(gridX, gridY);
                  }
                } else if (key === 'e') {
                  const nearbyFragment = socket.cureFragments.find(
                    f => Math.abs(f.gridX - gridX) <= 1 && Math.abs(f.gridY - gridY) <= 1
                  );
                  if (nearbyFragment) {
                    socket.collectFragment(nearbyFragment.gridX, nearbyFragment.gridY);
                  }
                }
              }}
              onTileClick={(gridX, gridY) => {
                const clickedPlayer = socket.players.find(
                  p => p.id !== socket.playerId && Math.abs(p.gridX - gridX) <= 1 && Math.abs(p.gridY - gridY) <= 1
                );
                if (accuseMode) {
                  if (clickedPlayer) {
                    socket.accuse(clickedPlayer.id);
                    setAccuseMode(false);
                  }
                } else if (clickedPlayer) {
                  socket.inspectPlayer(clickedPlayer.id);
                } else {
                  socket.inspectPlayer(null);
                }
              }}
            />
          </Suspense>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 100,
            pointerEvents: 'none',
            width: 150,
            height: 150,
          }}
        >
          <Radar
            localPlayerX={localPlayerX}
            localPlayerY={localPlayerY}
            players={radarPlayers}
            cureFragments={socket.cureFragments}
            buriedGems={socket.buriedGems}
            foodPositions={foodPositions}
            rareEntityPositions={rareEntityPositions}
            testingHousePosition={{ x: FANTASY_TESTING_HOUSE_DOOR_X, y: FANTASY_TESTING_HOUSE_DOOR_Y }}
            radarRange={15}
            size={150}
          />
        </div>
      </div>

      {showInventory && (
        <InventoryOverlay
          gemInventory={socket.myGemInventory}
          onClose={() => setShowInventory(false)}
        />
      )}

      {showLeaderboard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowLeaderboard(false)}
        >
          <div
            className="bg-black/90 border-2 border-amber-500 rounded-lg p-6 max-w-md w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-mono text-xl font-bold text-amber-400">LEADERBOARD</h3>
              <button
                className="pixel-btn pixel-btn-pink"
                style={{ padding: '4px 10px', fontSize: 14 }}
                onClick={() => setShowLeaderboard(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {socket.leaderboard.length === 0 ? (
                <p className="text-gray-400 font-mono text-sm">No scores yet</p>
              ) : (
                socket.leaderboard.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`flex justify-between items-center px-3 py-2 rounded font-mono ${entry.id === socket.playerId ? 'bg-amber-500/20 border border-amber-500/50' : 'bg-white/5'}`}
                  >
                    <span className="text-white">
                      {i + 1}. {entry.name}
                      {entry.id === socket.playerId && ' (you)'}
                    </span>
                    <span className="text-amber-400 font-bold">{entry.score}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {socket.inspectedPlayer && (
        <div
          className="fixed right-4 top-1/2 -translate-y-1/2 z-50 bg-black/90 border border-white/20 rounded-lg p-4 w-56"
          onClick={() => socket.inspectPlayer(null)}
        >
          <div className="flex justify-between items-center mb-3">
            <span className="font-mono text-sm font-bold text-white">{socket.inspectedPlayer.name}</span>
            <button className="text-white/60 hover:text-white text-lg leading-none">×</button>
          </div>
          <div className="text-xs text-gray-400 mb-2 font-mono uppercase">Recent proximity:</div>
          {(socket.inspectedPlayer.proximityLog ?? []).length === 0 ? (
            <div className="text-xs text-gray-500 italic">No nearby contacts recorded</div>
          ) : (
            <ul className="space-y-1">
              {(socket.inspectedPlayer.proximityLog ?? []).map((name, i) => {
                const isDead = name in socket.deadNames;
                const wasInfected = socket.deadNames[name];
                return (
                  <li key={i} className="text-xs font-mono flex items-center gap-1" style={{ color: isDead ? (wasInfected ? '#ff6666' : '#aaaaaa') : 'rgba(255,255,255,0.8)' }}>
                    <span className="text-gray-500">{i + 1}.</span>
                    {name}
                    {isDead && (
                      <span title={wasInfected ? 'Confirmed infected (eliminated)' : 'Was healthy (eliminated)'} style={{ fontSize: 10 }}>
                        {wasInfected ? ' ☠☣' : ' ☠'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 text-xs text-gray-600 italic">Click anywhere to close</div>
        </div>
      )}

      <PatientZeroNotification
        show={showPatientZero}
        onComplete={() => setShowPatientZero(false)}
      />

      <div className="mt-4 px-4 py-2 text-xs text-gray-600 space-y-1 bg-white/50 backdrop-blur-sm rounded">
        <p><strong>Controls:</strong></p>
        <p>• WASD to walk • Shift+WASD to run • E to collect valuables • T to test infection (at test camp)</p>
        <p>• L to dig gems • H to chop trees with axe (5–10 swings) • Q to infect nearby player (hold 2s when infected, within 3 tiles)</p>
      </div>
    </div>
  );
}
