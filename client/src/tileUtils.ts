import { hash } from "starknet";

export const TILE_EMPTY = 0;
export const TILE_GOLD = 1;
export const TILE_MINE = 2;

// Mirrors Cairo's has_content(player, level, x, y) — 20% of tiles have content.
export function hasContent(
  player: string,
  level: number,
  x: number,
  y: number
): boolean {
  const h = hash.computePoseidonHashOnElements([
    BigInt(player),
    BigInt(level),
    BigInt(x),
    BigInt(y),
  ]);
  const bucket = Number(BigInt(h) & 0xffn);
  return bucket < 51; // 51/256 ≈ 20%
}

export function isDug(dug: string, x: number, y: number): boolean {
  const idx = BigInt(y * 10 + x);
  const mask = BigInt(dug);
  return ((mask >> idx) & 1n) === 1n;
}
