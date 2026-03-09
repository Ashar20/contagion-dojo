/**
 * Hook that wraps Contagion Dojo contract actions.
 * Uses DojoProvider from @dojoengine/core to submit transactions to the on-chain world.
 *
 * Actions mirror the actual Contagion game mechanics:
 * - join_room: register player on-chain when entering a game room
 * - move_player: validated movement (max 5 tiles, bounds check, alive check)
 * - infect: proximity-validated infection spread (only infected can call)
 * - accuse: accuse another player of being Patient Zero
 * - collect_cure: collect cure fragment (only healthy players)
 * - take_damage: record damage from mobs/hazards
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { DojoProvider } from "@dojoengine/core";
import { dojoConfig, RPC_URL } from "../dojo/config";
import { setupWorld } from "../dojo/contracts";

export interface DojoPlayerState {
  roomId: bigint;
  x: number;
  y: number;
  isInfected: boolean;
  health: number;
  score: number;
  cureFragments: number;
  isAlive: boolean;
}

export function useDojoActions() {
  const { account } = useAccount();
  const [ready, setReady] = useState(false);
  const [playerState, setPlayerState] = useState<DojoPlayerState | null>(null);
  const worldRef = useRef<ReturnType<typeof setupWorld> | null>(null);
  const joinedRef = useRef(false);

  // Initialize DojoProvider and setup world
  useEffect(() => {
    try {
      const provider = new DojoProvider(dojoConfig.manifest, RPC_URL);
      worldRef.current = setupWorld(provider);
      setReady(true);
    } catch (err) {
      console.warn("[Dojo] Failed to initialize provider:", err);
    }
  }, []);

  /** Convert a room code string to a felt252-compatible bigint */
  const roomIdFromCode = useCallback((code: string): bigint => {
    let hash = BigInt(0);
    for (let i = 0; i < code.length; i++) {
      hash = (hash * BigInt(256) + BigInt(code.charCodeAt(i))) % (BigInt(2) ** BigInt(251));
    }
    return hash || BigInt(1);
  }, []);

  const joinRoom = useCallback(
    (roomCode: string, x: number, y: number) => {
      if (!account || !worldRef.current || joinedRef.current) return;
      joinedRef.current = true;
      const roomId = roomIdFromCode(roomCode);
      worldRef.current.contagion
        .joinRoom(account, roomId, x, y)
        .then(() => {
          console.log("[Dojo] join_room tx submitted");
          setPlayerState({
            roomId,
            x,
            y,
            isInfected: false,
            health: 100,
            score: 0,
            cureFragments: 0,
            isAlive: true,
          });
        })
        .catch((err) => {
          console.warn("[Dojo] join_room failed:", err);
          joinedRef.current = false;
        });
    },
    [account, roomIdFromCode]
  );

  const movePlayer = useCallback(
    (roomCode: string, newX: number, newY: number) => {
      if (!account || !worldRef.current) return;
      const roomId = roomIdFromCode(roomCode);
      worldRef.current.contagion
        .movePlayer(account, roomId, newX, newY)
        .then(() => {
          setPlayerState((prev) =>
            prev ? { ...prev, x: newX, y: newY } : prev
          );
        })
        .catch((err) => console.warn("[Dojo] move_player failed:", err));
    },
    [account, roomIdFromCode]
  );

  const infect = useCallback(
    (roomCode: string, targetAddress: string) => {
      if (!account || !worldRef.current) return;
      const roomId = roomIdFromCode(roomCode);
      worldRef.current.contagion
        .infect(account, roomId, targetAddress)
        .then(() => {
          console.log("[Dojo] infect tx submitted");
          setPlayerState((prev) =>
            prev ? { ...prev, score: prev.score + 50 } : prev
          );
        })
        .catch((err) => console.warn("[Dojo] infect failed:", err));
    },
    [account, roomIdFromCode]
  );

  const accuse = useCallback(
    (roomCode: string, targetAddress: string) => {
      if (!account || !worldRef.current) return;
      const roomId = roomIdFromCode(roomCode);
      worldRef.current.contagion
        .accuse(account, roomId, targetAddress)
        .then(() => console.log("[Dojo] accuse tx submitted"))
        .catch((err) => console.warn("[Dojo] accuse failed:", err));
    },
    [account, roomIdFromCode]
  );

  const collectCure = useCallback(
    (roomCode: string) => {
      if (!account || !worldRef.current) return;
      const roomId = roomIdFromCode(roomCode);
      worldRef.current.contagion
        .collectCure(account, roomId)
        .then(() => {
          console.log("[Dojo] collect_cure tx submitted");
          setPlayerState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              cureFragments: prev.cureFragments + 1,
              score: prev.score + 100,
            };
          });
        })
        .catch((err) => console.warn("[Dojo] collect_cure failed:", err));
    },
    [account, roomIdFromCode]
  );

  const takeDamage = useCallback(
    (roomCode: string, amount: number) => {
      if (!account || !worldRef.current) return;
      const roomId = roomIdFromCode(roomCode);
      worldRef.current.contagion
        .takeDamage(account, roomId, amount)
        .then(() => {
          setPlayerState((prev) => {
            if (!prev) return prev;
            const newHealth = Math.max(0, prev.health - amount);
            return {
              ...prev,
              health: newHealth,
              isAlive: newHealth > 0,
            };
          });
        })
        .catch((err) => console.warn("[Dojo] take_damage failed:", err));
    },
    [account, roomIdFromCode]
  );

  /** Reset join state (e.g. when leaving a room) */
  const reset = useCallback(() => {
    joinedRef.current = false;
    setPlayerState(null);
  }, []);

  return {
    ready,
    playerState,
    joinRoom,
    movePlayer,
    infect,
    accuse,
    collectCure,
    takeDamage,
    reset,
  };
}
