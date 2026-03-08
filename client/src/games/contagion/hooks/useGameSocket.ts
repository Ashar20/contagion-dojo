import { useState, useEffect, useRef, useCallback } from 'react';
import type { ZKProofResult, ZKProofInputs } from '../../../utils/zkProver';

// ── Types ────────────────────────────────────────────────────────────

export interface RemotePlayer {
  id: string;
  name: string;
  color: string;
  gridX: number;
  gridY: number;
  proximityLog?: string[]; // last 6 names seen nearby
}

export interface CureFragmentPos {
  id: number;
  gridX: number;
  gridY: number;
}

export interface BuriedGemPos {
  id: number;
  gridX: number;
  gridY: number;
  gemType: string;
  points: number;
  state?: 'buried' | 'dug'; // from server: buried = sparkle, dug = popped
}

export interface DugGem {
  id: number;
  gridX: number;
  gridY: number;
  gemType: string;
  points: number;
  dugAt: number; // timestamp for animation timing
}

export interface ActiveAccusation {
  id: number;
  accuserId: string;
  accuserName: string;
  targetId: string;
  targetName: string;
  votesFor: number;
  votesAgainst: number;
  totalPlayers: number;
  ticksRemaining: number;
}

export interface FlashedProof {
  playerId: string;
  playerName: string;
  status: 'HEALTHY' | 'INFECTED';
  testedAt: number;
  currentTick: number;
  receivedAt: number; // Date.now() for auto-dismiss
  // ZK proof fields (present when proof was generated)
  proof?: string;
  publicInputs?: string[];
  zkCommitment?: string;
  zkVerified?: boolean | null; // null = pending, true = valid, false = invalid
}

export interface VoteResult {
  accusationId: number;
  targetId: string;
  targetName: string;
  revealed: boolean;
  infected: boolean;
  passed: boolean;
  receivedAt: number;
  targetProof?: { result: 'infected' | 'healthy'; tick: number; ageSeconds: number } | null;
}

export interface GameOverInfo {
  reason: 'cure' | 'timer' | 'allInfected';
  winners: { id: string; name: string }[];
  curedBy?: { id: string; name: string };
}

export interface UseGameSocketReturn {
  connected: boolean;
  /** Unique player ID for this tab (address + session suffix). */
  playerId: string;
  players: RemotePlayer[];
  cureFragments: CureFragmentPos[];
  buriedGems: BuriedGemPos[];
  dugGems: DugGem[];
  timer: number;
  tick: number;
  mapSize: number;
  myStatus: 'unknown' | 'healthy' | 'infected';
  isPatientZero: boolean;
  testCooldown: number;
  lastTestResult: { infected: boolean } | null;
  myCureFragments: number;
  fragmentsToWin: number;
  accusations: ActiveAccusation[];
  flashedProofs: FlashedProof[];
  voteResults: VoteResult[];
  gameOver: GameOverInfo | null;
  gameStarted: boolean;

  // Wave defense
  waveNumber: number;
  waveCountdown: number; // 5, 4, 3, 2, 1, 0 (0 = active)
  farmPatches: Array<{ id: string; gridX: number; gridY: number; width: number; height: number; vegetableType: string; health: number; maxHealth: number }>;
  enemies: Array<{ id: string; gridX: number; gridY: number; health: number; maxHealth: number; mobType?: string }>;
  myScore: number;
  leaderboard: Array<{ id: string; name: string; score: number }>;
  testCamps: Array<{ x: number; y: number }>;
  deadNames: Record<string, boolean>; // name → wasInfected
  deathTrigger: number;
  myHealth: number;
  myMaxHealth: number;
  myGemInventory: Record<string, number>; // gemType → count
  infectedPlayerIds: string[]; // only populated for patient zero

  inspectedPlayer: RemotePlayer | null;
  inspectPlayer(playerId: string | null): void;

  // ZK proof state
  myProof: ZKProofResult | null;
  isGeneratingProof: boolean;

  sendMove(gridX: number, gridY: number): void;
  testSelf(): void;
  flashProof(): void;
  accuse(targetId: string): void;
  vote(accusationId: number, yes: boolean): void;
  collectFragment(gridX: number, gridY: number): void;
  digGem(gemId: number, gridX: number, gridY: number): void;
  collectGem(gemId: number, gridX: number, gridY: number): void;
  restart(): void;
  attackEnemy(enemyId: string, damage: number): void;
  testInfection(gridX: number, gridY: number): void;
  notifyDeath(): void;
  infectNearby(): void;
  /** Report that local player took damage from a mob — server deducts points by enemy type. */
  reportDamage(enemyType: string): void;
}

// ── Hook ─────────────────────────────────────────────────────────────

// Use same-origin /ws in dev (proxied to game server); fallback for production
function getWsUrl(): string {
  const envUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_CONTAGION_WS_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return 'ws://localhost:3001';
}
const WS_URL = getWsUrl();

/** Generate a unique tab ID so the same wallet can open multiple tabs as different players. */
function getTabSessionId(): string {
  let id = sessionStorage.getItem('contagion-tab-id');
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('contagion-tab-id', id);
  }
  return id;
}

export function useGameSocket(
  address: string,
  color: string,
  roomCode?: string,
): UseGameSocketReturn {
  // Each tab gets a unique player ID so the same wallet can spawn multiple players
  const tabId = useRef(getTabSessionId());
  const playerId = `${address}-${tabId.current}`;

  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [players, setPlayers] = useState<RemotePlayer[]>([]);
  const [cureFragments, setCureFragments] = useState<CureFragmentPos[]>([]);
  const [buriedGems, setBuriedGems] = useState<BuriedGemPos[]>([]);
  const [dugGems, setDugGems] = useState<DugGem[]>([]);
  const [timer, setTimer] = useState(0);
  const [tick, setTick] = useState(0);
  const [myStatus, setMyStatus] = useState<'unknown' | 'healthy' | 'infected'>('unknown');
  const [isPatientZero, setIsPatientZero] = useState(false);
  const [deathTrigger, setDeathTrigger] = useState(0);
  const [lastTestResult, setLastTestResult] = useState<{ infected: boolean } | null>(null);
  const [testCooldown, setTestCooldown] = useState(0);
  const [myCureFragments, setMyCureFragments] = useState(0);
  const [fragmentsToWin, setFragmentsToWin] = useState(5);
  const [accusations, setAccusations] = useState<ActiveAccusation[]>([]);
  const [flashedProofs, setFlashedProofs] = useState<FlashedProof[]>([]);
  const [voteResults, setVoteResults] = useState<VoteResult[]>([]);
  const [gameOver, setGameOver] = useState<GameOverInfo | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [mapSize, setMapSize] = useState(200);

  // Wave defense state
  const [waveNumber, setWaveNumber] = useState(0);
  const [waveCountdown, setWaveCountdown] = useState(0);
  const [farmPatches, setFarmPatches] = useState<Array<{ id: string; gridX: number; gridY: number; width: number; height: number; vegetableType: string; health: number; maxHealth: number }>>([]);
  const [enemies, setEnemies] = useState<Array<{ id: string; gridX: number; gridY: number; health: number; maxHealth: number }>>([]);
  const [myScore, setMyScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<Array<{ id: string; name: string; score: number }>>([]);
  const [testCamps, setTestCamps] = useState<Array<{ x: number; y: number }>>([]);
  const [deadNames, setDeadNames] = useState<Record<string, boolean>>({});
  const [myHealth, setMyHealth] = useState(100);
  const [myMaxHealth] = useState(100);
  const [myGemInventory, setMyGemInventory] = useState<Record<string, number>>({});
  const [infectedPlayerIds, setInfectedPlayerIds] = useState<string[]>([]);
  const [inspectedPlayer, setInspectedPlayer] = useState<RemotePlayer | null>(null);

  // ZK proof state
  const [myProof, setMyProof] = useState<ZKProofResult | null>(null);
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  // Store pending ZK inputs from server (to pass to generateHealthProof)
  const pendingZKInputs = useRef<ZKProofInputs | null>(null);

  // Decrement test cooldown locally
  useEffect(() => {
    if (testCooldown <= 0) return;
    const interval = setInterval(() => {
      setTestCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [testCooldown]);

  // Auto-dismiss flashed proofs after 8 seconds
  useEffect(() => {
    if (flashedProofs.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setFlashedProofs(prev => prev.filter(p => now - p.receivedAt < 8000));
    }, 1000);
    return () => clearInterval(interval);
  }, [flashedProofs.length]);

  // Auto-dismiss vote results after 5 seconds
  useEffect(() => {
    if (voteResults.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setVoteResults(prev => prev.filter(r => now - r.receivedAt < 5000));
    }, 1000);
    return () => clearInterval(interval);
  }, [voteResults.length]);

  // WebSocket connection
  useEffect(() => {
    if (!address) {
      console.log('[WS] Skipping connect — no wallet address');
      return;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    /** Throttle 'state' message handling to avoid "Maximum update depth exceeded" from rapid setState bursts. */
    let lastStateApplyTime = 0;
    const STATE_THROTTLE_MS = 120;

    const connect = () => {
      if (disposed) return;
      console.log(`[WS] Connecting to ${WS_URL} (${playerId.slice(0, 12)}...)...`);
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        console.log('[WS] Connected');
        setConnected(true);
        ws.send(JSON.stringify({ type: 'join', address: playerId, color, roomId: roomCode || '' }));
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        let msg: { type: string; [key: string]: unknown };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'welcome':
            setFragmentsToWin(msg.fragmentsToWin as number);
            if (msg.mapSize) setMapSize(msg.mapSize as number);
            if (msg.gameStarted) {
              setGameStarted(true);
            }
            if (msg.isPatientZero === true) setIsPatientZero(true);
            // Infection status is hidden until the player tests at a test camp
            if (Array.isArray(msg.testCamps)) setTestCamps(msg.testCamps as Array<{ x: number; y: number }>);
            break;

          case 'gameStarted':
            setGameStarted(true);
            setGameOver(null);
            setMyCureFragments(0);
            setFlashedProofs([]);
            setVoteResults([]);
            setIsPatientZero(false); // Reset; new patient zero will receive 'infected' message
            break;

          case 'state': {
            const now = Date.now();
            if (now - lastStateApplyTime < STATE_THROTTLE_MS) {
              break;
            }
            lastStateApplyTime = now;

            const serverPlayers = msg.players as (RemotePlayer & { infected?: boolean })[];
            setPlayers(serverPlayers);
            setCureFragments(msg.cureFragments as CureFragmentPos[]);
            setTimer(msg.timer as number);
            setTick(msg.tick as number);
            setAccusations((msg.accusations as ActiveAccusation[]) || []);
            if (msg.mapSize) setMapSize(msg.mapSize as number);
            if (Array.isArray(msg.leaderboard)) setLeaderboard(msg.leaderboard as Array<{ id: string; name: string; score: number }>);
            if (Array.isArray(msg.testCamps)) setTestCamps(msg.testCamps as Array<{ x: number; y: number }>);
            if (msg.deadNames && typeof msg.deadNames === 'object') setDeadNames(msg.deadNames as Record<string, boolean>);
            if (Array.isArray(msg.buriedGems)) {
              const gems = msg.buriedGems as (BuriedGemPos & { state?: 'buried' | 'dug' })[];
              const buried = gems.filter(g => (g.state ?? 'buried') === 'buried');
              const dug = gems.filter(g => g.state === 'dug');
              setBuriedGems(buried);
              setDugGems(prev => {
                return dug.map(g => {
                  const existing = prev.find(p => p.id === g.id);
                  return {
                    id: g.id,
                    gridX: g.gridX,
                    gridY: g.gridY,
                    gemType: g.gemType,
                    points: g.points,
                    dugAt: existing?.dugAt ?? 0,
                  };
                });
              });
            }
            break;
          }

          case 'mapExpanded':
            setMapSize(msg.mapSize as number);
            console.log(`[Map] Expanded to ${msg.mapSize}×${msg.mapSize}`);
            break;

          case 'lobby': {
            // Pre-game lobby state: shows connected players before game starts
            const lobbyPlayers = msg.players as RemotePlayer[];
            setPlayers(lobbyPlayers);
            break;
          }

          case 'infected': {
            // Reveal patient zero role to that player only — infection status stays hidden until tested
            const pz = (msg.message as string)?.includes('patient zero');
            if (pz) setIsPatientZero(true);
            break;
          }

          case 'testResult':
            setMyStatus((msg.infected as boolean) ? 'infected' : 'healthy');
            setTestCooldown(60);
            break;

          case 'testCooldown':
            setTestCooldown(msg.remaining as number);
            break;

          case 'proofFlashed': {
            const incomingProof = msg.proof as string | undefined;
            const incomingPublicInputs = msg.publicInputs as string[] | undefined;
            const incomingCommitment = msg.zkCommitment as string | undefined;

            const flashEntry: FlashedProof = {
              playerId: msg.playerId as string,
              playerName: msg.playerName as string,
              status: msg.status as 'HEALTHY' | 'INFECTED',
              testedAt: msg.testedAt as number,
              currentTick: msg.currentTick as number,
              receivedAt: Date.now(),
              proof: incomingProof,
              publicInputs: incomingPublicInputs,
              zkCommitment: incomingCommitment,
              zkVerified: incomingProof ? null : undefined,
            };

            setFlashedProofs(prev => [...prev, flashEntry]);

            // Verify incoming ZK proof asynchronously (lazy load verifier)
            if (incomingProof && incomingPublicInputs) {
              const pid = msg.playerId as string;
              import('../../../utils/zkVerifier').then(({ verifyHealthProof }) =>
                verifyHealthProof({ proof: incomingProof, publicInputs: incomingPublicInputs })
              ).then(valid => {
                  setFlashedProofs(prev =>
                    prev.map(p =>
                      p.playerId === pid && p.proof === incomingProof
                        ? { ...p, zkVerified: valid }
                        : p
                    )
                  );
                  console.log(`[ZK] Proof from ${msg.playerName as string}: ${valid ? 'VALID' : 'INVALID'}`);
                })
                .catch(err => {
                  console.warn('[ZK] Verification error:', err);
                  setFlashedProofs(prev =>
                    prev.map(p =>
                      p.playerId === pid && p.proof === incomingProof
                        ? { ...p, zkVerified: false }
                        : p
                    )
                  );
                });
            }
            break;
          }

          case 'accusation':
            // Already handled via state broadcasts with accusations array
            break;

          case 'voteResult':
            setVoteResults(prev => [
              ...prev,
              {
                accusationId: msg.accusationId as number,
                targetId: msg.targetId as string,
                targetName: msg.targetName as string,
                revealed: msg.revealed as boolean,
                infected: msg.infected as boolean,
                passed: msg.passed as boolean,
                receivedAt: Date.now(),
                targetProof: msg.targetProof as VoteResult['targetProof'] ?? null,
              },
            ]);
            break;

          case 'fragmentCollected':
            if ((msg.playerId as string) === playerId) {
              setMyCureFragments(msg.playerFragments as number);
            }
            break;

          case 'playerEliminated':
            // Player was eliminated but will respawn immediately
            // Just log it, don't remove from players list
            console.log(`[Elimination] ${msg.playerName} was eliminated (infected: ${msg.wasInfected})`);
            break;

          case 'playerRespawned': {
            const { playerId, oldName, newName, gridX, gridY } = msg;

            setPlayers(prev => prev.map(p =>
              p.id === playerId
                ? { ...p, name: newName as string, gridX: gridX as number, gridY: gridY as number }
                : p
            ));

            console.log(`[Respawn] ${oldName} respawned as ${newName} at (${gridX}, ${gridY})`);
            break;
          }

          case 'respawned': {
            // This client was respawned — trigger death animation first, then reset state
            const { newName, infected } = msg;
            setDeathTrigger(prev => prev + 1);
            setMyStatus((infected as boolean) ? 'infected' : 'healthy');
            setIsPatientZero(false);
            console.log(`[Respawn] You respawned as ${newName}`);
            break;
          }

          case 'gameOver':
            setGameOver({
              reason: msg.reason as GameOverInfo['reason'],
              winners: msg.winners as { id: string; name: string }[],
              curedBy: msg.curedBy as { id: string; name: string } | undefined,
            });
            break;

          case 'wave_countdown':
            setWaveNumber(msg.wave as number);
            setWaveCountdown(msg.countdown as number);
            console.log(`[Wave] Wave ${msg.wave} countdown: ${msg.countdown}`);
            break;

          case 'wave_start':
            setWaveNumber(msg.wave as number);
            setWaveCountdown(0); // Active
            setFarmPatches((msg.farms as any[]) || []);
            setEnemies((msg.enemies as any[]) || []);
            console.log(`[Wave] Wave ${msg.wave} started with ${(msg.farms as any[])?.length || 0} patches`);
            break;

          case 'wave_complete':
            console.log(`[Wave] Wave complete! Next in ${msg.nextWaveIn}s`);
            break;

          case 'wave_failed':
            setFarmPatches([]);
            console.log('[Wave] All farms destroyed - wave failed');
            break;

          case 'farm_health':
            setFarmPatches(prev => prev.map(f =>
              f.id === (msg.farmId as string)
                ? { ...f, health: msg.health as number, maxHealth: msg.maxHealth as number }
                : f
            ));
            break;

          case 'farm_destroyed':
            setFarmPatches(prev => prev.filter(f => f.id !== (msg.farmId as string)));
            console.log(`[Wave] Farm ${msg.farmId} destroyed`);
            break;

          case 'enemy_killed':
            setEnemies(prev => prev.filter(e => e.id !== msg.enemyId));
            if ((msg.killerId as string) === playerId) {
              setMyScore(msg.score as number);
            }
            break;

          case 'enemies_update':
            setEnemies((msg.enemies as any[]) || []);
            break;

          case 'enemy_damaged':
            setEnemies(prev => prev.map(e =>
              e.id === msg.enemyId
                ? { ...e, health: msg.health as number, maxHealth: msg.maxHealth as number }
                : e
            ));
            break;

          case 'score_update':
            if ((msg.playerId as string) === playerId) {
              setMyScore(msg.score as number);
            }
            break;

          case 'gem_dug': {
            const { gemId, gridX, gridY, gemType, points, dugBy } = msg;

            setDugGems(prev => [...prev, {
              id: gemId as number,
              gridX: gridX as number,
              gridY: gridY as number,
              gemType: gemType as string,
              points: (points as number) ?? 0,
              dugAt: performance.now(), // Match RAF time for bounce animation
            }]);

            setBuriedGems(prev => prev.filter(g => g.id !== gemId));

            console.log('[gem_dug] Gem dug by', dugBy, 'at', gridX, gridY);
            break;
          }

          case 'gem_collected': {
            const { gemId, playerId: collectorId } = msg;

            setDugGems(prev => prev.filter(g => g.id !== (gemId as number)));

            if ((collectorId as string) === playerId) {
              // Server will send inventory_update; optimistically track it
              setDugGems(prev => prev.filter(g => g.id !== (gemId as number)));
            }

            console.log('[gem_collected] Gem collected by', collectorId);
            break;
          }

          case 'test_result': {
            const infected = msg.infected as boolean;
            setMyStatus(infected ? 'infected' : 'healthy');
            setLastTestResult({ infected }); // Stays until user tests again
            console.log(`[Test] Result: ${infected ? 'INFECTED' : 'HEALTHY'}`);

            // Extract ZK inputs from server and start proof generation in background
            const zkNonce = msg.zkNonce as string | undefined;
            const zkPlayerIdHash = msg.zkPlayerIdHash as string | undefined;
            const zkTick = msg.zkTick as string | undefined;
            const zkStatus = msg.zkStatus as string | undefined;

            if (zkNonce && zkPlayerIdHash && zkTick && zkStatus !== undefined) {
              const inputs: ZKProofInputs = {
                status: zkStatus,
                nonce: zkNonce,
                playerIdHash: zkPlayerIdHash,
                tick: zkTick,
              };
              pendingZKInputs.current = inputs;
              setIsGeneratingProof(true);
              setMyProof(null);
              console.log('[ZK] Starting proof generation (tick=%s, status=%s)', zkTick, zkStatus);

              import('../../../utils/zkProver').then(({ generateHealthProof }) => generateHealthProof(inputs))
                .then(proof => {
                  setMyProof(proof);
                  console.log('[ZK] Proof generated successfully. commitment=%s proofLen=%d', proof.commitment?.slice(0, 18) + '...', proof.proof?.length ?? 0);
                })
                .catch(err => {
                  console.error('[ZK] Proof generation failed:', err);
                })
                .finally(() => {
                  setIsGeneratingProof(false);
                });
            } else {
              console.warn('[ZK] test_result missing ZK inputs — proof not generated. zkNonce=%s zkPlayerIdHash=%s zkTick=%s zkStatus=%s',
                !!zkNonce, !!zkPlayerIdHash, !!zkTick, zkStatus);
            }
            break;
          }

          case 'test_error':
          case 'test_cooldown':
            console.warn('[Test]', msg.message || `Cooldown: ${msg.remaining}s`);
            break;

          case 'player_died':
            console.log(`[Death] ${msg.playerName} died`);
            // If it's us, trigger death animation
            if ((msg.playerId as string) === playerId) {
              setDeathTrigger(prev => prev + 1);
              setMyGemInventory({});
            }
            break;

          case 'infected_players':
            setInfectedPlayerIds(msg.infectedIds as string[]);
            break;

          case 'player_health':
            setMyHealth(msg.health as number);
            break;

          case 'player_respawned_health':
            setMyHealth(msg.health as number);
            setMyGemInventory({});
            break;

          case 'gem_dropped': {
            const { gemId, gridX, gridY, gemType, points } = msg;
            setDugGems(prev => {
              if (prev.find(g => g.id === gemId)) return prev;
              return [...prev, {
                id: gemId as number,
                gridX: gridX as number,
                gridY: gridY as number,
                gemType: gemType as string,
                points: (points as number) ?? 0,
                dugAt: performance.now(),
              }];
            });
            break;
          }

          case 'inventory_update':
            setMyGemInventory((msg.gems as Record<string, number>) ?? {});
            break;

          case 'error':
            console.warn('[Server]', msg.message);
            break;
        }
      };

      ws.onclose = (event) => {
        console.log('[WS] Disconnected', { code: event.code, reason: event.reason || '(none)' });
        setConnected(false);
        // Only reconnect if this effect hasn't been cleaned up
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        console.error('[WS] Error — check that the game server is running (bun run dev:server) and reachable at', WS_URL);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [address, color, roomCode]);

  // ── Actions ──────────────────────────────────────────────────────
  // Guard: only send when WebSocket is OPEN to avoid "Still in CONNECTING state" errors
  const safeSend = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendMove = useCallback((gridX: number, gridY: number) => {
    safeSend({ type: 'move', gridX, gridY });
  }, [safeSend]);

  const testSelf = useCallback(() => {
    safeSend({ type: 'test' });
  }, [safeSend]);

  const flashProof = useCallback(() => {
    const msg: Record<string, unknown> = { type: 'flashProof' };
    // Attach ZK proof data if available
    if (myProof) {
      msg.proof = myProof.proof;
      msg.publicInputs = myProof.publicInputs;
      msg.zkCommitment = myProof.commitment;
    }
    safeSend(msg);
  }, [myProof, safeSend]);

  const accuse = useCallback((targetId: string) => {
    safeSend({ type: 'accuse', targetId });
  }, [safeSend]);

  const vote = useCallback((accusationId: number, yes: boolean) => {
    safeSend({ type: 'vote', accusationId, yes });
  }, [safeSend]);

  const collectFragment = useCallback((gridX: number, gridY: number) => {
    safeSend({ type: 'collectFragment', gridX, gridY });
  }, [safeSend]);

  const digGem = useCallback((gemId: number, gridX: number, gridY: number) => {
    safeSend({ type: 'dig_gem', gemId, gridX, gridY });
  }, [safeSend]);

  const collectGem = useCallback((gemId: number, gridX: number, gridY: number) => {
    safeSend({ type: 'collect_gem', gemId, gridX, gridY });
  }, [safeSend]);

  const restart = useCallback(() => {
    safeSend({ type: 'restart' });
  }, [safeSend]);

  const attackEnemy = useCallback((enemyId: string, damage: number = 10) => {
    safeSend({ type: 'attack_enemy', enemyId, damage });
  }, [safeSend]);

  const testInfection = useCallback((gridX: number, gridY: number) => {
    safeSend({ type: 'test_infection', gridX, gridY });
  }, [safeSend]);

  const notifyDeath = useCallback(() => {
    safeSend({ type: 'player_died' });
  }, [safeSend]);

  const infectNearby = useCallback(() => {
    safeSend({ type: 'infect_nearby' });
  }, [safeSend]);

  const reportDamage = useCallback((enemyType: string) => {
    safeSend({ type: 'player_damaged', enemyType });
  }, [safeSend]);

  return {
    connected,
    playerId,
    players,
    cureFragments,
    buriedGems,
    dugGems,
    timer,
    tick,
    mapSize,
    myStatus,
    isPatientZero,
    testCooldown,
    myCureFragments,
    fragmentsToWin,
    accusations,
    flashedProofs,
    voteResults,
    gameOver,
    gameStarted,
    waveNumber,
    waveCountdown,
    farmPatches,
    enemies,
    myScore,
    leaderboard,
    testCamps,
    deadNames,
    deathTrigger,
    myHealth,
    myMaxHealth,
    myGemInventory,
    infectedPlayerIds,
    lastTestResult,
    inspectedPlayer,
    inspectPlayer: useCallback((id: string | null) => {
      if (!id) { setInspectedPlayer(null); return; }
      const p = players.find(pl => pl.id === id) ?? null;
      setInspectedPlayer(p);
    }, [players]),
    myProof,
    isGeneratingProof,
    sendMove,
    testSelf,
    flashProof,
    accuse,
    vote,
    collectFragment,
    digGem,
    collectGem,
    restart,
    attackEnemy,
    testInfection,
    notifyDeath,
    infectNearby,
    reportDamage,
  };
}
