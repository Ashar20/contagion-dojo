import type { ActiveAccusation, VoteResult, GameOverInfo, FlashedProof } from '../hooks/useGameSocket';
import type { ZKProofResult } from '../../../utils/zkProver';

// ── Retro pixel button styles (pastel palette, dark outline, 3D effect) ────────────────

const pixelBtnBase: React.CSSProperties = {
  imageRendering: 'pixelated',
  fontFamily: '"Press Start 2P", monospace',
  fontSize: 10,
  fontWeight: 'bold',
  color: '#1a1a1a',
  border: '3px solid #2a2a2a',
  borderRadius: 8,
  padding: '6px 12px',
  letterSpacing: 1,
  textTransform: 'uppercase',
  lineHeight: 1.4,
  cursor: 'pointer',
};

const btnNormal: React.CSSProperties = {
  ...pixelBtnBase,
  background: 'linear-gradient(180deg, #c8b8e0 0%, #a090c8 100%)',
  boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -2px 0 rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.3)',
};

const btnDisabled: React.CSSProperties = {
  ...pixelBtnBase,
  background: 'linear-gradient(180deg, #888 0%, #666 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)',
  color: '#555',
  cursor: 'not-allowed',
};

const btnDanger: React.CSSProperties = {
  ...pixelBtnBase,
  background: 'linear-gradient(180deg, #f0b8c8 0%, #e090a8 100%)',
  boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -2px 0 rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.3)',
  color: '#2a1a1a',
  border: '3px solid #2a2a2a',
};

// ── Pill badge style ─────────────────────────────────────────────────

const pillBase: React.CSSProperties = {
  fontFamily: '"Press Start 2P", monospace',
  fontSize: 13,
  fontWeight: 'bold',
  padding: '5px 12px',
  borderRadius: 4,
  letterSpacing: 0.5,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

// ── Component ────────────────────────────────────────────────────────

interface GameHUDProps {
  myStatus: 'unknown' | 'healthy' | 'infected';
  accusations: ActiveAccusation[];
  voteResults: VoteResult[];
  flashedProofs: FlashedProof[];
  gameOver: GameOverInfo | null;
  gameStarted: boolean;
  connected: boolean;
  localPlayerId: string;
  accuseMode: boolean;
  playerCount: number;
  lastTestResult: { infected: boolean } | null;
  isPatientZero: boolean;
  myProof: ZKProofResult | null;
  isGeneratingProof: boolean;

  roomCode?: string;
  onToggleAccuseMode: () => void;
  onVote: (accusationId: number, yes: boolean) => void;
  onRestart: () => void;
  onFlashProof: () => void;
}

export function GameHUD({
  myStatus,
  accusations,
  voteResults,
  flashedProofs,
  gameOver,
  gameStarted,
  connected,
  localPlayerId,
  accuseMode,
  playerCount,
  lastTestResult,
  isPatientZero,
  myProof,
  isGeneratingProof,
  roomCode,
  onToggleAccuseMode,
  onVote,
  onRestart,
  onFlashProof,
}: GameHUDProps) {
  const singlePlayer = playerCount <= 1;

  return (
    <>
      {/* ── Connection indicator ─── */}
      {!connected && (
        <div
          style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
            zIndex: 20, ...pillBase,
            background: 'rgba(200, 50, 50, 0.85)', color: '#fff',
          }}
        >
          Connecting...
        </div>
      )}

      {/* ── Patient Zero badge (always visible when PZ, even with 2+ players) ─── */}
      {connected && gameStarted && !gameOver && isPatientZero && (
        <div
          style={{
            position: 'absolute', top: 12, left: 12, zIndex: 50,
            ...pillBase,
            background: 'rgba(180, 0, 0, 0.9)',
            color: '#fff',
            border: '2px solid #ff4444',
            padding: '6px 14px',
            boxShadow: '0 0 12px #ff000088',
          }}
        >
          ☣ PATIENT ZERO
        </div>
      )}

      {/* ── Waiting for players ─── */}
      {connected && !gameStarted && !gameOver && (
        <div
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', zIndex: 20,
            background: 'rgba(0, 0, 0, 0.85)', color: '#fff',
            padding: '24px 32px', borderRadius: 12, textAlign: 'center',
            display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center',
          }}
        >
          <div style={{ ...pillBase, fontSize: 14 }}>Waiting for players to join...</div>
          {roomCode && (
            <>
              <div style={{ ...pillBase, fontSize: 22, color: '#88e888', letterSpacing: '0.2em' }}>
                {roomCode}
              </div>
              <button
                style={{ ...btnNormal, fontSize: 10, padding: '8px 16px' }}
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}#/room/${roomCode}`;
                  navigator.clipboard.writeText(url);
                }}
              >
                Copy Invite Link
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Status badge — bottom left ─── */}
      {singlePlayer && connected && (
        <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 15 }}>
          <div style={{
            ...pillBase,
            fontSize: 16,
            padding: '12px 20px',
            background: myStatus === 'unknown' ? 'rgba(100, 100, 100, 0.9)'
              : myStatus === 'healthy' ? 'rgba(40, 140, 40, 0.9)'
              : 'rgba(180, 40, 40, 0.9)',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <div style={{ fontSize: 24 }}>
                {myStatus === 'unknown' ? '?' : myStatus === 'healthy' ? '♥' : '☠'}
              </div>
              <div style={{ fontWeight: 'bold', letterSpacing: 1 }}>
                {myStatus === 'unknown' ? 'UNKNOWN STATUS'
                  : myStatus === 'healthy' ? 'HEALTHY'
                  : 'INFECTED'}
              </div>
              {myStatus === 'infected' && (
                <div style={{ fontSize: 11, color: '#ffaaaa', marginTop: 4 }}>
                  {isPatientZero ? 'You are Patient Zero' : 'You are infected'}
                </div>
              )}
            </div>
          </div>
          {/* ── Infected player task ─── */}
          {myStatus === 'infected' && (
            <div style={{
              ...pillBase,
              marginTop: 8,
              fontSize: 12,
              padding: '8px 14px',
              background: 'rgba(120, 30, 30, 0.9)',
              color: '#ffcccc',
              border: '2px solid rgba(255, 150, 150, 0.5)',
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>☣ TASK</div>
              {isPatientZero
                ? <div>Spread infection — stay near healthy players</div>
                : <div>You are infected but cannot spread — avoid being accused</div>
              }
            </div>
          )}
        </div>
      )}


      {/* ── Action bar — bottom center (high z-index so always visible above notifications) ─── */}
      {connected && !gameOver && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 60, display: 'flex', gap: 8,
        }}>
          {/* Accuse */}
          <button
            onClick={onToggleAccuseMode}
            style={accuseMode ? btnDanger : btnNormal}
            title={accuseMode ? 'Cancel accusation' : 'Click a player to accuse them'}
          >
            {accuseMode ? '✕ CANCEL' : '👉 ACCUSE'}
          </button>

          {/* Flash Proof */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
            <button
              onClick={onFlashProof}
              disabled={!lastTestResult}
              style={lastTestResult ? {
                ...pixelBtnBase,
                background: lastTestResult.infected
                  ? 'linear-gradient(180deg, #f0b8c8 0%, #e090a8 100%)'
                  : 'linear-gradient(180deg, #88e888 0%, #5cc85c 100%)',
                boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -2px 0 rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.3)',
                color: lastTestResult.infected ? '#2a1a1a' : '#1a2a1a',
              } : btnDisabled}
              title={lastTestResult ? 'Flash your health proof to nearby players' : 'Test yourself first at the testing camp'}
            >
              🔬 FLASH PROOF
            </button>
            {/* ZK proof generation status */}
            {isGeneratingProof && (
              <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 9, color: '#aaffaa', letterSpacing: 0.5 }}>
                ⟳ generating ZK proof...
              </div>
            )}
            {!isGeneratingProof && myProof && (
              <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 9, color: '#aaffaa', letterSpacing: 0.5 }}>
                ✓ ZK proof ready
              </div>
            )}
          </div>

          {/* Collect (E key hint) */}
          <div style={{
            ...pillBase,
            background: 'rgba(0, 0, 0, 0.5)',
            color: '#aaa',
            fontSize: 11,
          }}>
            [E] Collect
          </div>
        </div>
      )}

      {/* ── Active accusations — top center ─── */}
      {accusations.length > 0 && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {accusations.map(acc => {
            const alreadyVoted = false; // Could track this, but server accepts duplicate votes gracefully
            const isTarget = acc.targetId === localPlayerId;
            const timeLeft = Math.ceil(acc.ticksRemaining / 5);

            return (
              <div key={acc.id} style={{
                background: 'rgba(0, 0, 0, 0.85)',
                borderRadius: 6,
                padding: '10px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                minWidth: 280,
              }}>
                <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 12, color: '#ff9', fontWeight: 'bold' }}>
                  ⚠ {acc.accuserName} accuses {acc.targetName}
                  {isTarget && <span style={{ color: '#f66' }}> (YOU)</span>}
                </div>
                <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 11, color: '#aaa', display: 'flex', justifyContent: 'space-between' }}>
                  <span>For: {acc.votesFor} | Against: {acc.votesAgainst}</span>
                  <span>{timeLeft}s</span>
                </div>
                {!isTarget && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onVote(acc.id, true)} style={{ ...btnDanger, fontSize: 10, padding: '4px 10px' }}>
                      GUILTY
                    </button>
                    <button onClick={() => onVote(acc.id, false)} style={{ ...btnNormal, fontSize: 10, padding: '4px 10px' }}>
                      INNOCENT
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Vote results ─── */}
      {voteResults.length > 0 && (
        <div style={{
          position: 'absolute', top: accusations.length > 0 ? 120 : 8,
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 19, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {voteResults.map((r, i) => (
            <div key={`vr-${i}`} style={{
              ...pillBase,
              fontSize: 12,
              background: r.passed
                ? (r.infected ? 'rgba(180, 40, 40, 0.9)' : 'rgba(40, 100, 180, 0.9)')
                : 'rgba(100, 100, 100, 0.85)',
              color: '#fff',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span>
                {r.passed
                  ? (r.infected
                    ? `☠ ${r.targetName} was INFECTED and eliminated!`
                    : `✓ ${r.targetName} was HEALTHY (accuser penalized)`)
                  : `Vote failed — ${r.targetName} not removed`
                }
              </span>
              {r.targetProof ? (
                <span style={{ fontSize: 10, opacity: 0.85 }}>
                  Last proof: {r.targetProof.result.toUpperCase()} ({r.targetProof.ageSeconds}s ago)
                </span>
              ) : r.passed ? (
                <span style={{ fontSize: 10, opacity: 0.85 }}>No health proof on record</span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* ── Flashed proofs (incoming) — top right ─── */}
      {flashedProofs.length > 0 && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          zIndex: 20, display: 'flex', flexDirection: 'column', gap: 4,
          maxWidth: 240,
        }}>
          {flashedProofs.map((fp, i) => {
            const hasZK = !!fp.proof;
            const zkPending = hasZK && fp.zkVerified === null;
            const zkValid = fp.zkVerified === true;
            const zkInvalid = fp.zkVerified === false;

            return (
              <div key={`fp-${i}`} style={{
                ...pillBase,
                fontSize: 11,
                padding: '6px 12px',
                background: fp.status === 'INFECTED'
                  ? 'rgba(180, 40, 40, 0.92)'
                  : 'rgba(40, 140, 40, 0.92)',
                color: '#fff',
                flexDirection: 'column',
                gap: 2,
                border: hasZK
                  ? (zkValid ? '2px solid #00ffaa' : zkInvalid ? '2px solid #ff4400' : '1px solid #aaa')
                  : (fp.status === 'INFECTED' ? '1px solid #f66' : '1px solid #6f6'),
              }}>
                <span style={{ fontWeight: 'bold' }}>🔬 {fp.playerName}</span>
                <span style={{ fontSize: 13 }}>
                  {fp.status === 'INFECTED' ? '☠ INFECTED' : '♥ HEALTHY'}
                </span>
                {/* ZK verification badge */}
                {hasZK && (
                  <span style={{
                    fontSize: 9,
                    fontFamily: '"Press Start 2P", monospace',
                    letterSpacing: 0.5,
                    color: zkPending ? '#aaaaaa' : zkValid ? '#00ffaa' : '#ff6644',
                  }}>
                    {zkPending ? '⟳ verifying ZK...' : zkValid ? '✓ ZK VERIFIED' : '✗ ZK INVALID'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Accuse mode indicator ─── */}
      {accuseMode && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 18, pointerEvents: 'none',
          ...pillBase, fontSize: 14,
          background: 'rgba(180, 40, 40, 0.75)', color: '#fff',
          padding: '8px 20px',
        }}>
          Click a player to accuse them
        </div>
      )}

    </>
  );
}
