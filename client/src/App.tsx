import { useCallback, useEffect, useState } from "react";
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
import { hasContent, isDug } from "./tileUtils";
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
      const content = hasContent(playerAddr, level, col, row);
      const wasDug = isDug(dug, col, row);

      let tileClass = "tile";
      if (isPlayer) tileClass += " tile-player";
      else if (wasDug) tileClass += " tile-dug";
      else if (content) tileClass += " tile-hidden";

      tiles.push(
        <div key={`${col},${row}`} className={tileClass} {...(isPlayer ? { id: "player-tile" } : {})}>
          {isPlayer && <span className="tile-player-marker">&#9670;</span>}
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
      <span className="hud-stat">
        Level <strong>{level}</strong>
      </span>
      <span className="hud-stat">
        Health <strong>{health}</strong>
      </span>
      <span className="hud-stat">
        Gold <strong>{gold}</strong>
      </span>
      <span className="hud-stat hud-highscore">
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
        onClick={() => onMove("Up")}
        disabled={disabled}
      >
        &#9650;
      </button>
      <button
        className="compass-btn compass-west"
        onClick={() => onMove("Left")}
        disabled={disabled}
      >
        &#9664;
      </button>
      <button
        className="compass-btn compass-dig"
        onClick={onDig}
        disabled={disabled || !canDig}
      >
        🪏
      </button>
      <button
        className="compass-btn compass-east"
        onClick={() => onMove("Right")}
        disabled={disabled}
      >
        &#9654;
      </button>
      <button
        className="compass-btn compass-south"
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
  const [digResults, setDigResults] = useState<Record<string, "gold" | "bomb">>({});
  const [digAnimation, setDigAnimation] = useState<"gold" | "bomb" | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [burstPos, setBurstPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const controller = connectors[0] as ControllerConnector;

  useEffect(() => {
    if (!address) return;
    controller.username()?.then(setUsername);
  }, [address, controller]);

  const entityId = useEntityId(address ?? "0");

  useEntityQuery(
    new ToriiQueryBuilder()
      .withClause(
        KeysClause(
          [ModelsMapping.Player],
          [address ? addAddressPadding(address) : undefined],
          "FixedLen"
        ).build()
      )
      .includeHashedKeys()
  );

  const player = useModel(entityId as string, ModelsMapping.Player);

  const spawn = useCallback(async () => {
    if (!account) return;
    setDigResults({});
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
        new CairoCustomEnum({ [direction]: {} })
      );
    } finally {
      setPending(false);
    }
  };

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

  // Detect dig result when model updates after dig
  useEffect(() => {
    if (!preDig || !player) return;
    const key = `${preDig.x},${preDig.y}`;
    const dugNow = isDug(player.dug ?? "0x0", preDig.x, preDig.y);
    if (dugNow) {
      const result = (player.gold ?? 0) > preDig.gold ? "gold" as const : "bomb" as const;
      setDigResults((prev) => ({ ...prev, [key]: result }));
      setPreDig(null);
      const el = document.getElementById("player-tile");
      if (el) {
        const rect = el.getBoundingClientRect();
        setBurstPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
      setDigAnimation(result);
      setBurstKey((k) => k + 1);
      const timer = setTimeout(() => setDigAnimation(null), 1000);
      return () => clearTimeout(timer);
    }
  }, [player?.dug, player?.gold, preDig]);

  const level = player?.level ?? 0;

  // Clear dig state on level change
  useEffect(() => {
    setDigResults({});
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
            onClick={() => {
              setAutoSpawn(true);
              connect({ connector: controller });
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
          <button className="btn-login" onClick={spawn} disabled={pending}>
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
        <CompassRose
          onMove={move}
          onDig={dig}
          disabled={pending || isGameOver}
          canDig={canDig}
        />
        {pending && <span className="pending">...</span>}
        {digAnimation && (
          <div className="dig-burst" key={burstKey} style={{ left: burstPos.x, top: burstPos.y }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className={`dig-particle dig-particle-${i}`}>
                {digAnimation === "gold" ? "💰" : "💣"}
              </span>
            ))}
          </div>
        )}
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
