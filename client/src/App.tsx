// -- Game UI --
// Subscribes to on-chain state via Torii, dispatches system calls, and
// derives render state from the Player ECS model.

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeysClause, ToriiQueryBuilder } from "@dojoengine/sdk";
import {
  useDojoSDK,
  useEntityId,
  useEntityQuery,
  useModel,
} from "@dojoengine/sdk/react";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { addAddressPadding, CairoCustomEnum } from "starknet";
import { ModelsMapping } from "./dojo/models";
import { hasContent, isDug } from "./tiles";
import "./App.css";

type Direction = "Left" | "Right" | "Up" | "Down";

function TileGrid({
  playerAddr,
  px,
  py,
  level,
  dug,
}: {
  playerAddr: string;
  px: number;
  py: number;
  level: number;
  dug: string;
}) {
  const tiles = [];
  for (let row = 9; row >= 0; row--) {
    for (let col = 0; col <= 9; col++) {
      const isPlayer = col === px && row === py;
      // Layer-1 randomness on client: same Poseidon hash as the contract, no network round-trip.
      const content = hasContent(playerAddr, level, col, row);
      const wasDug = isDug(dug, col, row);

      let tileClass = "tile";
      if (isPlayer) tileClass += " tile-player";
      else if (wasDug) tileClass += " tile-dug";
      else if (content) tileClass += " tile-hidden";

      tiles.push(
        <div key={`${col},${row}`} className={tileClass}>
          {isPlayer && <span className="tile-player-marker" data-testid="player-marker">&#9670;</span>}
          {!isPlayer && !wasDug && content && (
            <span className="tile-icon">&#10007;</span>
          )}
        </div>
      );
    }
  }
  return (
    <div className="grid-container">
      <div className="tile-grid">{tiles}</div>
    </div>
  );
}

function HUD({
  health,
  gold,
  level,
  best,
}: {
  health: number;
  gold: number;
  level: number;
  best: number;
}) {
  return (
    <div className="hud">
      <span className="hud-stat" data-testid="hud-level">
        Level <strong>{level}</strong>
      </span>
      <span className="hud-stat" data-testid="hud-health">
        Health <strong>{health}</strong>
      </span>
      <span className="hud-stat" data-testid="hud-gold">
        Gold <strong>{gold}</strong>
      </span>
      <span className="hud-stat hud-highscore" data-testid="hud-best">
        Best <strong>{best}</strong>
      </span>
    </div>
  );
}

function CompassRose({
  onMove,
  onDig,
  disabled,
  canDig,
}: {
  onMove: (d: Direction) => void;
  onDig: () => void;
  disabled: boolean;
  canDig: boolean;
}) {
  return (
    <div className="compass">
      <button
        className="compass-btn compass-north"
        data-testid="move-up"
        onClick={() => onMove("Up")}
        disabled={disabled}
      >
        &#9650;
      </button>
      <button
        className="compass-btn compass-west"
        data-testid="move-west"
        onClick={() => onMove("Left")}
        disabled={disabled}
      >
        &#9664;
      </button>
      <button
        className="compass-btn compass-dig"
        data-testid="dig"
        onClick={onDig}
        disabled={disabled || !canDig}
      >
        🪏
      </button>
      <button
        className="compass-btn compass-east"
        data-testid="move-east"
        onClick={() => onMove("Right")}
        disabled={disabled}
      >
        &#9654;
      </button>
      <button
        className="compass-btn compass-south"
        data-testid="move-down"
        onClick={() => onMove("Down")}
        disabled={disabled}
      >
        &#9660;
      </button>
    </div>
  );
}

function App() {
  const { client } = useDojoSDK();
  const { account, address } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [pending, setPending] = useState(false);
  const [username, setUsername] = useState<string>();
  const [autoSpawn, setAutoSpawn] = useState(false);
  const [digHistory, setDigHistory] = useState<Array<"gold" | "bomb">>([]);
  useEffect(() => {
    if (!address || import.meta.env.VITE_E2E_TEST === "true") return;
    const controller = connectors[0] as ControllerConnector;
    controller.username()?.then(setUsername);
  }, [address, connectors]);

  const entityId = useEntityId(address ?? "0");

  // Build a Torii subscription: watch the Player model for this address.
  // KeysClause filters by model type and key values. FixedLen means exact key match.
  const playerQuery = useMemo(
    () =>
      new ToriiQueryBuilder()
        .withClause(
          KeysClause(
            [ModelsMapping.Player],
            [address ? addAddressPadding(address) : undefined],
            "FixedLen"
          ).build()
        )
        .includeHashedKeys(),
    [address]
  );

  // Starts a live subscription — Torii pushes updates whenever this player's on-chain state changes.
  useEntityQuery(playerQuery);

  // Reads the latest cached model data for this entity. Re-renders when Torii pushes an update.
  const player = useModel(entityId as string, ModelsMapping.Player);

  const spawn = useCallback(async () => {
    if (!account) return;
    setDigHistory([]);
    setPending(true);
    try {
      await client.actions.spawn(account);
    } finally {
      setPending(false);
    }
  }, [account, client.actions]);

  // Auto-spawn after connecting via "Start Digging"
  useEffect(() => {
    if (autoSpawn && account && !pending) {
      setAutoSpawn(false);
      spawn();
    }
  }, [autoSpawn, account, pending, spawn]);

  const move = async (direction: Direction) => {
    if (!account) return;
    setPending(true);
    try {
      await client.actions.move(
        account,
        new CairoCustomEnum({ [direction]: {} }) // Serializes Direction enum; key is variant name
      );
    } finally {
      setPending(false);
    }
  };

  // Dig result detection: snapshot state before digging, then compare after Torii syncs.
  // Layer-2 randomness means the client can't predict the outcome in advance.
  const [preDig, setPreDig] = useState<{ x: number; y: number; gold: number } | null>(null);

  const dig = async () => {
    if (!account) return;
    setPreDig({ x: player?.x ?? 0, y: player?.y ?? 0, gold: player?.gold ?? 0 });
    setPending(true);
    try {
      await client.actions.dig(account);
    } finally {
      setPending(false);
    }
  };

  // When Torii pushes the updated Player model, compare gold to the pre-dig snapshot.
  // If gold increased, it was gold; otherwise, a bomb.
  useEffect(() => {
    if (!preDig || !player) return;
    const dugNow = isDug(player.dug ?? "0x0", preDig.x, preDig.y);
    if (dugNow) {
      const result = (player.gold ?? 0) > preDig.gold ? "gold" as const : "bomb" as const;
      setDigHistory((prev) => [...prev, result].slice(-10));
      setPreDig(null);
    }
  }, [player?.dug, player?.gold, preDig]);

  const level = player?.level ?? 0;

  // Clear dig state on level change
  useEffect(() => {
    setDigHistory([]);
    setPreDig(null);
  }, [level]);

  if (!address) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-shovel">🪏</div>
          <h1 className="login-title">Treasure Hunt</h1>
          <p className="login-tagline">Dig for treasure, avoid bombs</p>
          <button
            className="btn-login"
            data-testid="start-digging"
            onClick={() => {
              setAutoSpawn(true);
              connect({ connector: connectors[0] });
            }}
          >
            Start Digging
          </button>
          <div className="login-ornament">&#9674; &#9674; &#9674;</div>
        </div>
      </div>
    );
  }

  const health = player?.health ?? 0;
  const gold = player?.gold ?? 0;
  const x = player?.x ?? 0;
  const y = player?.y ?? 0;
  const dug = player?.dug ?? "0x0";
  const best = player?.best ?? 0;
  const isGameOver = level > 0 && health === 0;
  const needsSpawn = level === 0;

  // Determine if current tile is diggable
  const currentHasContent = level > 0 && hasContent(address, level, x, y);
  const currentTileDug = level > 0 && isDug(dug, x, y);
  const canDig = !isGameOver && !needsSpawn && currentHasContent && !currentTileDug;

  if (needsSpawn) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-shovel">🪏</div>
          <h1 className="login-title">Treasure Hunt</h1>
          <p className="login-tagline">
            {pending ? "Preparing your expedition..." : "Dig for treasure, avoid bombs"}
          </p>
          <button className="btn-login" data-testid="new-game" onClick={spawn} disabled={pending}>
            {pending ? "Starting..." : "New Game"}
          </button>
          <div className="login-ornament">&#9674; &#9674; &#9674;</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="header">
        <span className="header-title">Treasure Hunt 🪏</span>
        <div className="header-right">
          <span className="header-username">
            {username ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
          </span>
          <button className="btn-logout" onClick={() => disconnect()}>
            Log out
          </button>
        </div>
      </header>
      <main className="main-content">
        <HUD health={health} gold={gold} level={level} best={best} />
        <TileGrid
          playerAddr={address}
          px={x}
          py={y}
          level={level}
          dug={dug}
        />
        <div className="dig-history">
          {Array.from({ length: 10 }).map((_, i) => {
            const result = digHistory[digHistory.length - 10 + i];
            return (
              <span key={i} className={`dig-history-slot${result ? ` dig-${result}` : ""}`}>
                {result === "gold" ? "💰" : result === "bomb" ? "💣" : ""}
              </span>
            );
          })}
        </div>
        <CompassRose
          onMove={move}
          onDig={dig}
          disabled={pending || isGameOver}
          canDig={canDig}
        />
        {pending && <span className="pending">...</span>}
        {isGameOver && (
          <div className="game-over">
            <div className="game-over-card">
              <h2>Game Over</h2>
              <p>You reached level {level} with {gold} gold</p>
              <button className="btn-login" onClick={spawn} disabled={pending}>
                {pending ? "Starting..." : "New Game"}
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default App;
