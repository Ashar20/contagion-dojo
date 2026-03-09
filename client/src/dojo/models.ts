// -- Client Models --
// TypeScript mirror of the Cairo models for Contagion.
// Must match the on-chain schema exactly.

export interface ContagionPlayer {
  fieldOrder: string[];
  player: string;
  room_id: string;
  x: number;
  y: number;
  is_infected: boolean;
  health: number;
  score: number;
  cure_fragments: number;
  is_alive: boolean;
}

export interface GameRoom {
  fieldOrder: string[];
  room_id: string;
  host: string;
  patient_zero_hash: string;
  player_count: number;
  max_players: number;
  started: boolean;
  ended: boolean;
  infection_radius: number;
  map_size: number;
  cure_target: number;
}

export interface SchemaType {
  [namespace: string]: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [model: string]: { [field: string]: any };
  };
  contagion: {
    ContagionPlayer: ContagionPlayer;
    GameRoom: GameRoom;
  };
}

export const schema: SchemaType = {
  contagion: {
    ContagionPlayer: {
      fieldOrder: [
        "player",
        "room_id",
        "x",
        "y",
        "is_infected",
        "health",
        "score",
        "cure_fragments",
        "is_alive",
      ],
      player: "",
      room_id: "0x0",
      x: 0,
      y: 0,
      is_infected: false,
      health: 0,
      score: 0,
      cure_fragments: 0,
      is_alive: false,
    },
    GameRoom: {
      fieldOrder: [
        "room_id",
        "host",
        "patient_zero_hash",
        "player_count",
        "max_players",
        "started",
        "ended",
        "infection_radius",
        "map_size",
        "cure_target",
      ],
      room_id: "0x0",
      host: "",
      patient_zero_hash: "0x0",
      player_count: 0,
      max_players: 0,
      started: false,
      ended: false,
      infection_radius: 0,
      map_size: 0,
      cure_target: 0,
    },
  },
};

export enum ModelsMapping {
  ContagionPlayer = "contagion-ContagionPlayer",
  GameRoom = "contagion-GameRoom",
  PlayerJoined = "contagion-PlayerJoined",
  PlayerMoved = "contagion-PlayerMoved",
  Infected = "contagion-Infected",
  Accused = "contagion-Accused",
  CureCollected = "contagion-CureCollected",
  PlayerDied = "contagion-PlayerDied",
}
