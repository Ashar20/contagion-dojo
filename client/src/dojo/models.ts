export interface Player {
  fieldOrder: string[];
  player: string;
  x: number;
  y: number;
  health: number;
  gold: number;
  level: number;
  dug: string; // felt252 bitmap as hex string
  best: number;
}

export interface SchemaType {
  [namespace: string]: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [model: string]: { [field: string]: any };
  };
  starter: {
    Player: Player;
  };
}

export const schema: SchemaType = {
  starter: {
    Player: {
      fieldOrder: ["player", "x", "y", "health", "gold", "level", "dug", "best"],
      player: "",
      x: 0,
      y: 0,
      health: 0,
      gold: 0,
      level: 0,
      dug: "0x0",
      best: 0,
    },
  },
};

export enum ModelsMapping {
  Player = "starter-Player",
  Moved = "starter-Moved",
  Dug = "starter-Dug",
  LevelUp = "starter-LevelUp",
  GameOver = "starter-GameOver",
}
