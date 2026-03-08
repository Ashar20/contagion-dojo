import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import './LobbyPage.css';

function getWsUrl(): string {
  const envUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_CONTAGION_WS_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const port = window.location.port;
    const isDevOrigin =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '' ||
      port === '3000';
    if (isDevOrigin) return 'ws://localhost:3001';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return 'ws://localhost:3001';
}

interface RoomInfo {
  code: string;
  playerCount: number;
  gameStarted: boolean;
}

export function LobbyPage() {
  const navigate = useNavigate();
  const { isConnected, connectWallet } = useWallet();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const ensureConnected = useCallback(async () => {
    if (!isConnected) {
      try { await connectWallet(); } catch { return false; }
    }
    return true;
  }, [isConnected, connectWallet]);

  const getWs = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const existing = wsRef.current;
      if (existing?.readyState === WebSocket.OPEN) {
        resolve(existing);
        return;
      }
      if (existing?.readyState === WebSocket.CONNECTING) {
        existing.onopen = () => resolve(existing);
        existing.onerror = () => reject(new Error('Failed to connect to game server'));
        return;
      }
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;
      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error('Failed to connect to game server'));
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const ws = await getWs();
        if (disposed) return;
        ws.send(JSON.stringify({ type: 'list_rooms' }));
        ws.onmessage = (event) => {
          if (disposed) return;
          const msg = JSON.parse(event.data);
          if (msg.type === 'room_list') {
            setRooms(msg.rooms as RoomInfo[]);
          }
          if (msg.type === 'room_created') {
            setCreating(false);
            navigate(`/room/${msg.code}`);
          }
          if (msg.type === 'error') {
            setError(msg.message);
            setCreating(false);
          }
        };
      } catch {
        if (!disposed) setError('Cannot reach game server');
      }
    })();
    return () => {
      disposed = true;
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [getWs, navigate]);

  const handleCreate = async () => {
    if (!(await ensureConnected())) return;
    setCreating(true);
    setError('');
    try {
      const ws = await getWs();
      ws.send(JSON.stringify({ type: 'create_room' }));
    } catch {
      setError('Cannot reach game server');
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) { setError('Enter a room code'); return; }
    if (!(await ensureConnected())) return;
    setError('');
    navigate(`/room/${code}`);
  };

  const shareableUrl = (code: string) => {
    const base = window.location.origin + window.location.pathname;
    return `${base}#/room/${code}`;
  };

  const activeRooms = rooms.filter(r => r.playerCount > 0);

  return (
    <div className="lobby-wrapper">
      <div className="lobby-container">
        <h1 className="lobby-title">Game Lobby</h1>
        <p className="lobby-subtitle">Create a room and share the code, or join an existing game.</p>

        {error && <div className="lobby-error">{error}</div>}

        <div className="lobby-actions">
          <button
            className="pixel-btn pixel-btn-large pixel-btn-green lobby-create-btn"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create Room'}
          </button>

          <div className="lobby-divider">
            <span>or join with code</span>
          </div>

          <div className="lobby-join-row">
            <input
              className="lobby-code-input"
              type="text"
              maxLength={4}
              placeholder="ABCD"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button className="pixel-btn pixel-btn-green" onClick={handleJoin}>
              Join
            </button>
          </div>
        </div>

        {activeRooms.length > 0 && (
          <div className="lobby-rooms">
            <h3 className="lobby-rooms-title">Active Rooms</h3>
            <div className="lobby-rooms-list">
              {activeRooms.map((r) => (
                <div key={r.code} className="lobby-room-card pixel-card">
                  <div className="lobby-room-info">
                    <span className="lobby-room-code">{r.code}</span>
                    <span className="lobby-room-players">
                      {r.playerCount} player{r.playerCount !== 1 ? 's' : ''}
                    </span>
                    {r.gameStarted && <span className="lobby-room-live">LIVE</span>}
                  </div>
                  <div className="lobby-room-actions">
                    <button
                      className="pixel-btn pixel-btn-small"
                      onClick={() => {
                        navigator.clipboard.writeText(shareableUrl(r.code));
                      }}
                      title="Copy invite link"
                    >
                      Copy Link
                    </button>
                    <button
                      className="pixel-btn pixel-btn-small pixel-btn-green"
                      onClick={async () => {
                        if (await ensureConnected()) navigate(`/room/${r.code}`);
                      }}
                    >
                      Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
