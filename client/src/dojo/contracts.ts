// -- Contagion System Call Wrappers --
// Each function maps to a #[dojo::contract] entry point in contagion_actions.cairo.

import type { DojoProvider } from "@dojoengine/core";
import type { Account, AccountInterface } from "starknet";

export function setupWorld(provider: DojoProvider) {
  const createRoom = async (
    account: Account | AccountInterface,
    roomId: bigint,
    mapSize: number,
    infectionRadius: number,
    maxPlayers: number,
    cureTarget: number
  ) => {
    return await provider.execute(
      account,
      {
        contractName: "contagion_actions",
        entrypoint: "create_room",
        calldata: [roomId, mapSize, infectionRadius, maxPlayers, cureTarget],
      },
      "contagion",
      { tip: 0 }
    );
  };

  const joinRoom = async (
    account: Account | AccountInterface,
    roomId: bigint,
    x: number,
    y: number
  ) => {
    return await provider.execute(
      account,
      {
        contractName: "contagion_actions",
        entrypoint: "join_room",
        calldata: [roomId, x, y],
      },
      "contagion",
      { tip: 0 }
    );
  };

  const startGame = async (
    account: Account | AccountInterface,
    roomId: bigint,
    patientZeroHash: bigint
  ) => {
    return await provider.execute(
      account,
      {
        contractName: "contagion_actions",
        entrypoint: "start_game",
        calldata: [roomId, patientZeroHash],
      },
      "contagion",
      { tip: 0 }
    );
  };

  const movePlayer = async (
    account: Account | AccountInterface,
    roomId: bigint,
    newX: number,
    newY: number
  ) => {
    return await provider.execute(
      account,
      {
        contractName: "contagion_actions",
        entrypoint: "move_player",
        calldata: [roomId, newX, newY],
      },
      "contagion",
      { tip: 0 }
    );
  };

  const infect = async (
    account: Account | AccountInterface,
    roomId: bigint,
    target: string
  ) => {
    return await provider.execute(
      account,
      {
        contractName: "contagion_actions",
        entrypoint: "infect",
        calldata: [roomId, target],
      },
      "contagion",
      { tip: 0 }
    );
  };

  const accuse = async (
    account: Account | AccountInterface,
    roomId: bigint,
    target: string
  ) => {
    return await provider.execute(
      account,
      {
        contractName: "contagion_actions",
        entrypoint: "accuse",
        calldata: [roomId, target],
      },
      "contagion",
      { tip: 0 }
    );
  };

  const collectCure = async (
    account: Account | AccountInterface,
    roomId: bigint
  ) => {
    return await provider.execute(
      account,
      {
        contractName: "contagion_actions",
        entrypoint: "collect_cure",
        calldata: [roomId],
      },
      "contagion",
      { tip: 0 }
    );
  };

  const takeDamage = async (
    account: Account | AccountInterface,
    roomId: bigint,
    amount: number
  ) => {
    return await provider.execute(
      account,
      {
        contractName: "contagion_actions",
        entrypoint: "take_damage",
        calldata: [roomId, amount],
      },
      "contagion",
      { tip: 0 }
    );
  };

  return {
    contagion: {
      createRoom,
      joinRoom,
      startGame,
      movePlayer,
      infect,
      accuse,
      collectCure,
      takeDamage,
    },
  };
}
