/**
 * Contagion Game — WebSocket Server (Bun)
 *
 * Manages real-time multiplayer: position sync, infection spread,
 * cure fragments, self-testing, proof flashing, accusations & voting.
 *
 * Run: bun run contagion-frontend/server/index.ts
 */

import { createHash } from 'crypto';

// ── Types ────────────────────────────────────────────────────────────

interface ServerPlayer {
  id: string;
  name: string;
  color: string;
  gridX: number;
  gridY: number;
  infected: boolean;
  infectedAt: number;       // tick when infected (-1 if healthy)
  canSpread: boolean;       // false during incubation
  isPatientZero: boolean;   // true only for the original patient zero
  lastTestTick: number;     // last tick when player tested themselves
  lastTestResult: boolean | null; // result of last test (null = never tested)
  lastTestTick2: number;    // tick when last test was generated (for proof staleness)
  zkNonce: string | null;   // server-issued random nonce for ZK proof (hex string)
  incubationTicks: number;  // fixed incubation period assigned when infected
  cureFragments: number;
  eliminated: boolean;
  accuseCooldownUntil: number; // tick until player can accuse again
  proximityLog: string[];   // rolling list of last 6 names seen nearby
  ws: unknown;              // WebSocket reference
}

interface CureFragment {
  id: number;
  gridX: number;
  gridY: number;
  collected: boolean;
}

interface BuriedGem {
  id: number;
  gridX: number;
  gridY: number;
  gemType: string; // 'diamond' | 'ruby' | 'amethyst' | etc.
  points: number;
  state: 'buried' | 'dug' | 'collected';
  dugBy?: string;      // player ID who dug it
  dugAt?: number;      // timestamp
  collectedBy?: string; // player ID who collected it
  collectedAt?: number; // timestamp
}

interface Accusation {
  id: number;
  accuserId: string;
  targetId: string;
  votes: Map<string, boolean>;
  startTick: number;
  resolved: boolean;
}

type MobType = 'normal' | 'fast' | 'tank' | 'swarm';

interface MobTypeStats {
  health: number;
  speed: number; // Movement multiplier
  damage: number;
  color: string;
  size: number;
}

const MOB_TYPES: Record<MobType, MobTypeStats> = {
  normal: { health: 30, speed: 1, damage: 5, color: '#ff4444', size: 15 },
  fast: { health: 15, speed: 2, damage: 3, color: '#ffaa00', size: 12 },
  tank: { health: 60, speed: 0.5, damage: 10, color: '#8800ff', size: 20 },
  swarm: { health: 10, speed: 1.5, damage: 2, color: '#00ff88', size: 10 },
};

interface Enemy {
  id: string;
  gridX: number;
  gridY: number;
  health: number;
  maxHealth: number;
  targetId: string | null; // playerId or 'farm'
  lastAttackTick: number;
  lastHitBy: string | null; // playerId who last damaged it
  mobType: MobType;
}

interface FarmPatch {
  id: string;
  gridX: number; // Top-left corner of patch
  gridY: number; // Top-left corner of patch
  width: number; // Rows (e.g., 5)
  height: number; // Columns (e.g., 10)
  health: number;
  maxHealth: number;
  vegetableType: 'carrot' | 'cabbage' | 'onion' | 'pumpkin' | 'leek';
}

interface WaveState {
  waveNumber: number;
  active: boolean;
  countingDown: boolean;
  countdown: number; // 5, 4, 3, 2, 1
  mobsRemaining: number;
  farmPatches: FarmPatch[];
  currentTargetPatchIndex: number; // Attack one patch at a time
  nextWaveTime: number;
}

// ── Constants ────────────────────────────────────────────────────────

const PORT = Number(process.env.PLAGUE_WS_PORT) || 3001;
const TICK_MS = 200;                     // 5 ticks/sec
const INFECTION_RADIUS = 3;              // grid tiles
const INFECTION_TICKS = 25;              // 5 seconds of proximity required to infect
const INCUBATION_MIN = 25;               // 5 seconds before patient zero can spread
const INCUBATION_MAX = 50;               // 10 seconds max incubation
const TEST_COOLDOWN_TICKS = 300;         // 60 seconds
const ACCUSE_COOLDOWN_TICKS = 300;       // 60 seconds
const VOTE_DURATION_TICKS = 75;          // 15 seconds
const CURE_FRAGMENTS_TO_WIN = 5;
const CURE_FRAGMENT_COUNT = 10;          // spawned on map
const BURIED_GEM_COUNT = 40;             // gems spread across the map
const BURIED_GEM_TYPES = ['diamond', 'ruby', 'amethyst', 'emerald', 'amber'] as const;
const BURIED_GEM_POINTS: Record<string, number> = { diamond: 25, ruby: 20, amethyst: 15, emerald: 18, amber: 12 };

// Random name generation (Adjective + Animal format)
const ADJECTIVES = [
  'Crimson', 'Silent', 'Swift', 'Shadow', 'Golden', 'Brave', 'Dark', 'Bright',
  'Wild', 'Fierce', 'Clever', 'Noble', 'Mystic', 'Ancient', 'Wandering', 'Hidden',
  'Blazing', 'Frozen', 'Thunder', 'Storm', 'Lunar', 'Solar', 'Stellar', 'Cosmic',
  'Raging', 'Calm', 'Vigilant', 'Sneaky', 'Mighty', 'Gentle', 'Savage', 'Peaceful',
  'Shining', 'Faded', 'Bold', 'Shy', 'Lucky', 'Cursed', 'Sacred', 'Wicked',
  'Iron', 'Silver', 'Copper', 'Jade', 'Ruby', 'Amber', 'Onyx', 'Crystal'
];

const ANIMALS = [
  'Badger', 'Owl', 'Falcon', 'Wolf', 'Bear', 'Fox', 'Hawk', 'Eagle',
  'Raven', 'Lynx', 'Tiger', 'Lion', 'Panther', 'Leopard', 'Jaguar', 'Cheetah',
  'Dragon', 'Phoenix', 'Griffin', 'Sphinx', 'Hydra', 'Basilisk', 'Kraken', 'Serpent',
  'Elk', 'Stag', 'Moose', 'Bison', 'Mammoth', 'Rhino', 'Elephant', 'Hippo',
  'Shark', 'Orca', 'Dolphin', 'Whale', 'Squid', 'Octopus', 'Mantis', 'Scorpion',
  'Spider', 'Wasp', 'Hornet', 'Beetle', 'Moth', 'Butterfly', 'Dragonfly', 'Firefly'
];

const GAME_DURATION_TICKS = 1500;        // 5 minutes
const MIN_PLAYERS_FOR_PZ = 3;            // PRD: patient zero only after 3+ players (when all infected eliminated)
const MIN_PLAYERS_TO_START = 2;          // Game starts with 2 — first player sees lobby, can share link
const VOTE_THRESHOLD_PCT = 0.30;         // 30% of players needed to kick
const PROXIMITY_LOG_SIZE = 6;            // rolling list of last 6 names seen nearby
const POINTS_PER_TICK_HEALTHY = 1;       // healthy players earn 1pt/tick
const POINTS_PER_INFECTION = 15;         // infected earns for spreading
const POINTS_SUCCESSFUL_ACCUSE = 25;     // accuser earns for correct kick
const POINTS_FAILED_ACCUSE_PENALTY = 10; // accuser loses for wrong accusation

/** Points lost when mob hits player (by enemy type). */
const POINTS_LOST_PER_MOB_HIT: Record<string, number> = {
  slime: 2,
  goblin: 3,
  kobolt: 4,
  scorpion: 5,
  skeleton: 6,
  wolf: 8,
};
const BASE_MAP_SIZE = 200;              // Bigger maze-like map
const MAP_GROWTH_PER_PLAYER = 20;       // +20 tiles per dimension per extra player
const COLLECT_RADIUS = 1;               // must be within 1 tile
const TEST_CAMP_RADIUS = 3;             // must be within 3 tiles of test camp to test
const TEST_CAMP_COUNT = 3;             // number of test camps per game
let testCamps: { x: number; y: number }[] = [];

function calculateMapSize(playerCount: number): number {
  return BASE_MAP_SIZE + Math.max(0, playerCount - 2) * MAP_GROWTH_PER_PLAYER;
}
let currentMapSize = BASE_MAP_SIZE;

// ── Game State ───────────────────────────────────────────────────────

const players = new Map<string, ServerPlayer>();
const cureFragments: CureFragment[] = [];
const buriedGems: BuriedGem[] = [];
let nextBuriedGemId = 1;
const accusations: Accusation[] = [];
const proximityCounters = new Map<string, number>(); // "infectedId:healthyId" → tick count
const deadNames = new Map<string, boolean>(); // name → wasInfected (persists across respawns)
let tick = 0;
let gameTimer = GAME_DURATION_TICKS;
let patientZeroId: string | null = null;
let gameOver = false;
let nextAccusationId = 1;
let nextFragmentId = 1;

// Wave defense state
const enemies: Enemy[] = [];
let nextEnemyId = 1;
let waveState: WaveState = {
  waveNumber: 0,
  active: false,
  countingDown: false,
  countdown: 0,
  mobsRemaining: 0,
  farmPatches: [],
  currentTargetPatchIndex: 0,
  nextWaveTime: 0,
};
const playerScores = new Map<string, number>(); // playerId -> score
const playerTestCooldowns = new Map<string, number>(); // playerId -> tick

// Track which WebSocket belongs to which player
const wsToPlayer = new Map<unknown, string>();

// ── Helpers ──────────────────────────────────────────────────────────

function gridDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Generate a random player name in Adjective+Animal format.
 * Returns unique combinations by tracking used names.
 */
const usedNames = new Set<string>();

function generateRandomName(): string {
  let name: string;
  let attempts = 0;

  do {
    const adjective = ADJECTIVES[randomInt(0, ADJECTIVES.length - 1)];
    const animal = ANIMALS[randomInt(0, ANIMALS.length - 1)];
    name = `${adjective}${animal}`;
    attempts++;

    // If we've tried 100 times, allow duplicates (very rare with 48*48=2304 combos)
    if (attempts > 100) break;
  } while (usedNames.has(name));

  usedNames.add(name);
  return name;
}

/**
 * Remove a name from the used names set (when player disconnects permanently)
 */
function releasePlayerName(name: string) {
  usedNames.delete(name);
}

// Temporary test - remove after verification
console.log('[Name Gen Test]', generateRandomName(), generateRandomName(), generateRandomName());

function calculateGemInventory(playerId: string): Record<string, number> {
  const inventory: Record<string, number> = {
    diamond: 0,
    ruby: 0,
    emerald: 0,
    sapphire: 0,
    amethyst: 0,
  };

  for (const gem of buriedGems) {
    if (gem.state === 'collected' && gem.collectedBy === playerId) {
      inventory[gem.gemType] = (inventory[gem.gemType] ?? 0) + 1;
    }
  }

  return inventory;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function spawnCureFragments() {
  cureFragments.length = 0;
  const occupied = new Set<string>();
  // Avoid house area (30,30 to 31,31) and nearby tiles
  for (let i = 0; i < CURE_FRAGMENT_COUNT; i++) {
    let gx: number, gy: number;
    let attempts = 0;
    do {
      gx = randomInt(2, currentMapSize - 3);
      gy = randomInt(2, currentMapSize - 3);
      attempts++;
    } while (
      (occupied.has(`${gx},${gy}`) ||
       (gx >= 28 && gx <= 33 && gy >= 28 && gy <= 33)) &&
      attempts < 100
    );
    occupied.add(`${gx},${gy}`);
    cureFragments.push({ id: nextFragmentId++, gridX: gx, gridY: gy, collected: false });
  }
}

// Known pond centers [cx, cy, radius] from tileManager — avoid spawning gems in water
const POND_AVOID: [number, number, number][] = [
  [18, 46, 8], [48, 18, 7], [8, 14, 6], [5, 5, 6], [58, 58, 6],
];
function isInPond(gx: number, gy: number): boolean {
  for (const [cx, cy, r] of POND_AVOID) {
    if (Math.sqrt((gx - cx) ** 2 + (gy - cy) ** 2) < r) return true;
  }
  return false;
}

// Mountain/snow regions from tileManager — avoid spawning gems on blocked terrain (boulders, trees)
const MOUNTAIN_AVOID: [number, number, number][] = [
  [12, 48, 14], [50, 10, 12], [54, 48, 10], [10, 12, 7], [32, 55, 8],
  [8, 32, 6], [58, 28, 8], [20, 8, 6], [42, 8, 5], [8, 56, 6], [56, 56, 6],
  [4, 4, 8], [60, 4, 7], [4, 60, 8], [60, 60, 7], [4, 32, 6], [60, 32, 6],
];
function isInMountainOrBlocked(gx: number, gy: number): boolean {
  for (const [cx, cy, r] of MOUNTAIN_AVOID) {
    if (Math.sqrt((gx - cx) ** 2 + (gy - cy) ** 2) < r) return true;
  }
  return false;
}

/** Only spawn gems on walkable tiles — avoid ponds, mountains, snow peaks (blocked terrain). */
function isWalkableForGem(gx: number, gy: number): boolean {
  return !isInPond(gx, gy) && !isInMountainOrBlocked(gx, gy);
}

function spawnBuriedGems(occupied: Set<string>) {
  buriedGems.length = 0;
  nextBuriedGemId = 1;

  // Spread gems evenly across map using a grid of zones
  const padding = 5;
  const usable = currentMapSize - padding * 2;
  const zones = Math.ceil(Math.sqrt(BURIED_GEM_COUNT));
  const zoneSize = Math.floor(usable / zones);

  let spawned = 0;
  for (let zx = 0; zx < zones && spawned < BURIED_GEM_COUNT; zx++) {
    for (let zy = 0; zy < zones && spawned < BURIED_GEM_COUNT; zy++) {
      const baseX = padding + zx * zoneSize;
      const baseY = padding + zy * zoneSize;
      let gx: number, gy: number;
      let attempts = 0;
      do {
        gx = baseX + randomInt(0, Math.max(1, zoneSize - 1));
        gy = baseY + randomInt(0, Math.max(1, zoneSize - 1));
        attempts++;
      } while (
        (occupied.has(`${gx},${gy}`) || gx < 2 || gy < 2 ||
         gx >= currentMapSize - 3 || gy >= currentMapSize - 3 ||
         !isWalkableForGem(gx, gy)) &&
        attempts < 50
      );
      if (attempts >= 50) continue; // skip this zone if no valid spot found
      occupied.add(`${gx},${gy}`);
      const gemType = BURIED_GEM_TYPES[randomInt(0, BURIED_GEM_TYPES.length - 1)];
      buriedGems.push({
        id: nextBuriedGemId++,
        gridX: gx,
        gridY: gy,
        gemType,
        points: BURIED_GEM_POINTS[gemType] ?? 10,
        state: 'buried',
      });
      spawned++;
    }
  }
  console.log('[Game] Buried gems spread across map:', buriedGems.length, 'gems');
}

/** Assign exactly one patient zero. Clears any existing first. PRD: only one at a time. */
function assignPatientZero() {
  // Clear any existing patient zero — ensure only one
  if (patientZeroId) {
    const old = players.get(patientZeroId);
    if (old) old.isPatientZero = false;
    patientZeroId = null;
  }
  for (const p of players.values()) {
    p.isPatientZero = false;
  }

  const ids = Array.from(players.keys()).filter(id => !players.get(id)!.eliminated);
  if (ids.length === 0) return;
  const idx = randomInt(0, ids.length - 1);
  patientZeroId = ids[idx];
  const p = players.get(patientZeroId)!;
  p.infected = true;
  p.infectedAt = tick;
  p.canSpread = false; // incubation period
  p.isPatientZero = true;
  p.incubationTicks = randomInt(INCUBATION_MIN, INCUBATION_MAX);
  console.log(`[Game] Patient zero assigned: ${p.name} (${patientZeroId.slice(0, 8)}...)`);

  // Note: infected notification is sent by the caller AFTER gameStarted broadcast
  // so the client receives it last and doesn't overwrite isPatientZero
}

/**
 * Respawn a player with new random name and healthy status.
 * Called after vote-kick elimination.
 */
function respawnPlayer(playerId: string) {
  const player = players.get(playerId);
  if (!player) return;

  const oldName = player.name;
  const newName = generateRandomName();

  // Reset player state
  player.name = newName;
  player.infected = false;
  player.infectedAt = -1;
  player.canSpread = false;
  player.isPatientZero = false;
  player.eliminated = false;
  player.accuseCooldownUntil = 0;
  player.cureFragments = 0;
  player.lastTestTick = -TEST_COOLDOWN_TICKS;
  player.lastTestResult = null;
  player.lastTestTick2 = -1;
  player.proximityLog = [];
  player.incubationTicks = 0;

  // If this was patient zero, clear so maybeSelectNewPatientZero can assign a new one
  if (patientZeroId === playerId) {
    patientZeroId = null;
  }

  // Respawn at random location near map center
  const center = Math.floor(currentMapSize / 2);
  player.gridX = randomInt(center - 4, center + 4);
  player.gridY = randomInt(center - 4, center + 4);

  console.log(`[Respawn] ${oldName} → ${newName} at (${player.gridX}, ${player.gridY})`);

  // Broadcast respawn event to all clients
  broadcast({
    type: 'playerRespawned',
    playerId: player.id,
    oldName,
    newName,
    gridX: player.gridX,
    gridY: player.gridY,
  });

  // Send updated state to respawned player
  send(player.ws, {
    type: 'respawned',
    newName,
    infected: false,
  });
}

function resetGame() {
  tick = 0;
  gameTimer = GAME_DURATION_TICKS;
  patientZeroId = null;
  gameOver = false;
  nextAccusationId = 1;
  proximityCounters.clear();
  deadNames.clear();
  accusations.length = 0;

  for (const p of players.values()) {
    p.infected = false;
    p.infectedAt = -1;
    p.canSpread = false;
    p.lastTestTick = -TEST_COOLDOWN_TICKS;
    p.lastTestResult = null;
    p.cureFragments = 0;
    p.eliminated = false;
    p.accuseCooldownUntil = 0;
  }

  spawnCureFragments();

  testCamps = [];
  const occupied = new Set<string>();
  for (const f of cureFragments) occupied.add(`${f.gridX},${f.gridY}`);
  // Always add the fantasy testing house door as a permanent test camp
  const FANTASY_HOUSE_DOOR = { x: 61, y: 63 };
  testCamps.push(FANTASY_HOUSE_DOOR);
  occupied.add(`${FANTASY_HOUSE_DOOR.x},${FANTASY_HOUSE_DOOR.y}`);
  // Always add one test camp very near map center so player can easily test
  const mapCenter = Math.floor(currentMapSize / 2);
  const nearSpawnCamp = { x: mapCenter + 2, y: mapCenter + 1 };
  if (!occupied.has(`${nearSpawnCamp.x},${nearSpawnCamp.y}`)) {
    testCamps.push(nearSpawnCamp);
    occupied.add(`${nearSpawnCamp.x},${nearSpawnCamp.y}`);
  }
  for (let i = testCamps.length; i < TEST_CAMP_COUNT; i++) {
    let gx: number, gy: number;
    let attempts = 0;
    do {
      gx = randomInt(10, currentMapSize - 11);
      gy = randomInt(10, currentMapSize - 11);
      attempts++;
    } while (occupied.has(`${gx},${gy}`) && attempts < 100);
    occupied.add(`${gx},${gy}`);
    testCamps.push({ x: gx, y: gy });
  }
  spawnBuriedGems(occupied);
  console.log('[Game] Test camps at:', testCamps.map(c => `(${c.x},${c.y})`).join(', '));

  // Assign patient zero when game starts (2+ players)
  if (players.size >= MIN_PLAYERS_TO_START) {
    assignPatientZero();

    // Initialize scores for all players
    for (const playerId of players.keys()) {
      playerScores.set(playerId, 0);
    }

    // Clear enemies and schedule first wave
    enemies.length = 0;
    waveState.farmPatches = [];
    waveState.active = false;
    waveState.countingDown = false;
    waveState.waveNumber = 0;
    waveState.nextWaveTime = tick + 25; // First wave starts after ~5s

    broadcast({ type: 'game_start' });
    console.log('[Game] Game started — first wave in ~5s');
  }
}

// ── Broadcasting ─────────────────────────────────────────────────────

function send(ws: unknown, msg: object) {
  try {
    (ws as { send(data: string): void }).send(JSON.stringify(msg));
  } catch { /* disconnected */ }
}

function broadcast(msg: object) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) {
    try {
      (p.ws as { send(data: string): void }).send(data);
    } catch { /* disconnected */ }
  }
}

function broadcastState() {
  const playerList = Array.from(players.values())
    .filter(p => !p.eliminated)
    .map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      gridX: p.gridX,
      gridY: p.gridY,
      proximityLog: p.proximityLog,
      // NOTE: infected status is private - only revealed via testing or vote-kick
    }));

  const fragments = cureFragments
    .filter(f => !f.collected)
    .map(f => ({ id: f.id, gridX: f.gridX, gridY: f.gridY }));

  const gems = buriedGems
    .filter(g => g.state === 'buried' || g.state === 'dug')
    .map(g => ({ id: g.id, gridX: g.gridX, gridY: g.gridY, gemType: g.gemType, points: g.points, state: g.state }));

  const activeAccusations = accusations
    .filter(a => !a.resolved)
    .map(a => ({
      id: a.id,
      accuserId: a.accuserId,
      targetId: a.targetId,
      votesFor: Array.from(a.votes.values()).filter(v => v).length,
      votesAgainst: Array.from(a.votes.values()).filter(v => !v).length,
      totalPlayers: players.size,
      ticksRemaining: Math.max(0, VOTE_DURATION_TICKS - (tick - a.startTick)),
    }));

  const leaderboard = Array.from(playerScores.entries()).map(([id, score]) => ({
    id,
    name: players.get(id)?.name ?? 'Unknown',
    score,
  })).sort((a, b) => b.score - a.score);

  broadcast({
    type: 'state',
    players: playerList,
    cureFragments: fragments,
    buriedGems: gems,
    timer: Math.ceil(gameTimer / 5), // convert ticks to seconds
    tick,
    accusations: activeAccusations,
    gameOver,
    mapSize: currentMapSize,
    leaderboard,
    testCamps,
    deadNames: Object.fromEntries(deadNames), // name → wasInfected
  });

  // Send infected player IDs privately to patient zero only
  if (patientZeroId) {
    const pzWs = Array.from(wsToPlayer.entries()).find(([_, id]) => id === patientZeroId)?.[0];
    if (pzWs) {
      const infectedIds = Array.from(players.values())
        .filter(p => p.infected && !p.eliminated)
        .map(p => p.id);
      send(pzWs, { type: 'infected_players', infectedIds });
    }
  }
}

/** Broadcast lobby state (before game starts) so all connected players can see each other */
function broadcastLobby() {
  const playerList = Array.from(players.values()).map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    gridX: p.gridX,
    gridY: p.gridY,
  }));
  broadcast({ type: 'lobby', players: playerList, playerCount: players.size });
}

// ── Infection Logic ──────────────────────────────────────────────────

function tickInfection() {
  const activePlayers = Array.from(players.values()).filter(p => !p.eliminated);

  // Check incubation FIRST — only patient zero becomes contagious after incubation
  for (const p of activePlayers) {
    if (p.infected && p.isPatientZero && !p.canSpread && p.infectedAt >= 0) {
      if (p.incubationTicks === 0) {
        p.incubationTicks = randomInt(INCUBATION_MIN, INCUBATION_MAX);
      }
      if (tick - p.infectedAt >= p.incubationTicks) {
        p.canSpread = true;
        console.log(`[Infection] ${p.name} is now contagious (incubation done)`);
      }
    }
  }

  // Update proximity logs (all players near each other, for social deduction clues)
  for (const a of activePlayers) {
    for (const b of activePlayers) {
      if (a.id === b.id) continue;
      const dist = gridDistance(a.gridX, a.gridY, b.gridX, b.gridY);
      if (dist <= INFECTION_RADIUS && !a.proximityLog.includes(b.name)) {
        a.proximityLog = [b.name, ...a.proximityLog].slice(0, PROXIMITY_LOG_SIZE);
      }
    }
  }

}
// Infection spreads only via Q-key (infect_nearby) — no passive proximity spread

// ── Voting Resolution ────────────────────────────────────────────────

function tickVotes() {
  for (const acc of accusations) {
    if (acc.resolved) continue;
    if (tick - acc.startTick >= VOTE_DURATION_TICKS) {
      resolveAccusation(acc);
    }
  }
}

function resolveAccusation(acc: Accusation) {
  acc.resolved = true;
  const activePlayers = Array.from(players.values()).filter(p => !p.eliminated);
  const totalPlayers = activePlayers.length;
  const votesFor = Array.from(acc.votes.values()).filter(v => v).length;
  const passed = totalPlayers > 0 && votesFor / totalPlayers >= VOTE_THRESHOLD_PCT;

  const target = players.get(acc.targetId);
  const accuser = players.get(acc.accuserId);

  if (passed && target) {
    // Broadcast reveal with target's last test proof info
    broadcast({
      type: 'voteResult',
      accusationId: acc.id,
      targetId: acc.targetId,
      targetName: target.name,
      revealed: true,
      infected: target.infected,
      passed: true,
      targetProof: target.lastTestResult !== null ? {
        result: target.lastTestResult ? 'infected' : 'healthy',
        tick: target.lastTestTick2,
        ageSeconds: Math.floor((tick - target.lastTestTick2) / 5),
      } : null,
    });

    if (target.infected) {
      // Correct kick: accuser earns points
      if (accuser) {
        const s = playerScores.get(acc.accuserId) ?? 0;
        playerScores.set(acc.accuserId, s + POINTS_SUCCESSFUL_ACCUSE);
      }
      const oldName = target.name;
      deadNames.set(oldName, true); // record as infected for proximity log display
      broadcast({
        type: 'playerEliminated',
        playerId: target.id,
        playerName: oldName,
        wasInfected: true,
      });
      respawnPlayer(target.id);
      // Check if all infected are now eliminated → pick new patient zero
      maybeSelectNewPatientZero();
    } else {
      // Wrong kick: accuser loses points and gets cooldown; healthy player still eliminated & respawns
      if (accuser) {
        const s = playerScores.get(acc.accuserId) ?? 0;
        playerScores.set(acc.accuserId, Math.max(0, s - POINTS_FAILED_ACCUSE_PENALTY));
        accuser.accuseCooldownUntil = tick + ACCUSE_COOLDOWN_TICKS;
      }
      if (target) {
        const oldName = target.name;
        deadNames.set(oldName, false); // record as healthy-killed for proximity log display
        broadcast({
          type: 'playerEliminated',
          playerId: target.id,
          playerName: oldName,
          wasInfected: false,
        });
        respawnPlayer(target.id);
      }
    }
  } else {
    // Vote failed to reach threshold
    if (accuser) {
      const s = playerScores.get(acc.accuserId) ?? 0;
      playerScores.set(acc.accuserId, Math.max(0, s - POINTS_FAILED_ACCUSE_PENALTY));
      accuser.accuseCooldownUntil = tick + ACCUSE_COOLDOWN_TICKS;
    }
    broadcast({
      type: 'voteResult',
      accusationId: acc.id,
      targetId: acc.targetId,
      targetName: target?.name ?? 'Unknown',
      revealed: false,
      infected: false,
      passed: false,
    });
  }
}

/** PRD: When all infected are vote-kicked, select new patient zero from healthy pool (3+ players). */
function maybeSelectNewPatientZero() {
  const activePlayers = Array.from(players.values()).filter(p => !p.eliminated);
  const anyInfected = activePlayers.some(p => p.infected);
  if (!anyInfected && activePlayers.length >= MIN_PLAYERS_FOR_PZ) {
    console.log('[Game] All infected eliminated — selecting new patient zero');
    assignPatientZero();
    const pzWs = Array.from(wsToPlayer.entries()).find(([_, id]) => id === patientZeroId)?.[0];
    if (pzWs) send(pzWs, { type: 'infected', message: 'You are patient zero!' });
  }
}

// ── Wave & Farm Defense ──────────────────────────────────────────────

function startWaveCountdown() {
  waveState.waveNumber++;
  waveState.countingDown = true;
  waveState.countdown = 5;

  broadcast({
    type: 'wave_countdown',
    wave: waveState.waveNumber,
    countdown: 5,
  });

  console.log(`[Wave] Wave ${waveState.waveNumber} countdown started`);
}

function spawnWave() {
  const playerCount = players.size;
  const center = Math.floor(currentMapSize / 2);

  // Create large farm patches spread across the map
  waveState.farmPatches = [];
  const vegetables = ['carrot', 'cabbage', 'onion', 'pumpkin', 'leek'] as const;

  // Create 3-5 large farm patches spread out
  const numPatches = Math.min(3 + Math.floor(waveState.waveNumber / 3), 5);

  for (let p = 0; p < numPatches; p++) {
    const angle = (p / numPatches) * Math.PI * 2;
    const distance = 25 + p * 8; // Spread them further
    const patchWidth = 8;  // Larger patches (8×12)
    const patchHeight = 12;
    const farmX = Math.floor(center + Math.cos(angle) * distance - patchWidth / 2);
    const farmY = Math.floor(center + Math.sin(angle) * distance - patchHeight / 2);
    const vegType = vegetables[p % vegetables.length]; // Different veg per patch

    waveState.farmPatches.push({
      id: `farm_${tick}_${p}`,
      gridX: farmX,
      gridY: farmY,
      width: patchWidth,
      height: patchHeight,
      health: 150, // More health for larger patches
      maxHealth: 150,
      vegetableType: vegType,
    });
  }

  waveState.currentTargetPatchIndex = 0;

  // Progressive wave intensity - more mobs each wave
  const baseMobs = Math.min(50, 8 + waveState.waveNumber * 3);
  const mobCount = baseMobs + Math.max(0, playerCount - 1);
  waveState.mobsRemaining = mobCount;
  waveState.active = true;
  waveState.countingDown = false;

  // Determine mob type distribution
  const mobTypes: MobType[] = [];
  for (let i = 0; i < mobCount; i++) {
    const rand = Math.random();
    if (rand < 0.5) mobTypes.push('normal');
    else if (rand < 0.7) mobTypes.push('fast');
    else if (rand < 0.85) mobTypes.push('swarm');
    else mobTypes.push('tank');
  }

  // Spawn mobs near buried gems — they attack gems and players nearby
  const availableGems = buriedGems.filter(g => g.state === 'buried');

  for (let i = 0; i < mobCount; i++) {
    const mobType = mobTypes[i];
    const stats = MOB_TYPES[mobType];

    let mobX: number;
    let mobY: number;

    if (availableGems.length > 0) {
      // Pick a random gem and spawn mob 5–12 tiles away from it
      const gem = availableGems[randomInt(0, availableGems.length - 1)];
      const angle = Math.random() * Math.PI * 2;
      const spawnRadius = 5 + Math.random() * 7;
      mobX = Math.max(2, Math.min(currentMapSize - 2, gem.gridX + Math.cos(angle) * spawnRadius));
      mobY = Math.max(2, Math.min(currentMapSize - 2, gem.gridY + Math.sin(angle) * spawnRadius));
    } else {
      // Fallback: random position on map
      mobX = 5 + Math.random() * (currentMapSize - 10);
      mobY = 5 + Math.random() * (currentMapSize - 10);
    }

    // Target nearest farm
    let targetFarm = waveState.farmPatches[0];
    let minDist = Infinity;
    for (const farm of waveState.farmPatches) {
      const farmCenterX = farm.gridX + farm.width / 2;
      const farmCenterY = farm.gridY + farm.height / 2;
      const dist = gridDistance(mobX, mobY, farmCenterX, farmCenterY);
      if (dist < minDist) {
        minDist = dist;
        targetFarm = farm;
      }
    }

    enemies.push({
      id: `enemy_${nextEnemyId++}`,
      gridX: mobX,
      gridY: mobY,
      health: stats.health,
      maxHealth: stats.health,
      targetId: targetFarm.id,
      lastAttackTick: 0,
      lastHitBy: null,
      mobType,
    });
  }

  broadcast({
    type: 'wave_start',
    wave: waveState.waveNumber,
    farms: waveState.farmPatches,
    enemies: enemies.map(e => ({ id: e.id, gridX: e.gridX, gridY: e.gridY, health: e.health, maxHealth: e.maxHealth, mobType: e.mobType })),
  });

  console.log(`[Wave] Wave ${waveState.waveNumber} spawned:`);
  console.log(`  - ${numPatches} farm patches at center (${center}, ${center})`);
  console.log(`  - ${mobCount} mobs spawned from edges`);
  console.log(`  - Farm locations:`, waveState.farmPatches.map(f => `(${f.gridX},${f.gridY} ${f.width}×${f.height})`));
  console.log(`  - First 5 enemies:`, enemies.slice(0, 5).map(e => `${e.mobType} at (${e.gridX.toFixed(1)},${e.gridY.toFixed(1)}) → ${e.targetId}`));
}

function damageFarm(farmId: string, damage: number) {
  const farm = waveState.farmPatches.find(f => f.id === farmId);
  if (!farm) return;

  farm.health = Math.max(0, farm.health - damage);

  broadcast({
    type: 'farm_health',
    farmId: farm.id,
    health: farm.health,
    maxHealth: farm.maxHealth,
  });

  if (farm.health <= 0) {
    // Farm destroyed - remove it from the list
    const index = waveState.farmPatches.indexOf(farm);
    if (index > -1) {
      waveState.farmPatches.splice(index, 1);
    }

    broadcast({
      type: 'farm_destroyed',
      farmId: farm.id,
    });

    // If all farms destroyed - wave fails
    if (waveState.farmPatches.length === 0) {
      // 20% score penalty
      for (const [playerId, score] of playerScores.entries()) {
        const newScore = Math.floor(score * 0.8);
        playerScores.set(playerId, newScore);
      }

      waveState.active = false;
      waveState.nextWaveTime = tick + 50; // 10s cooldown

      // Clear all enemies
      enemies.length = 0;

      const scoreList = Array.from(playerScores.entries()).map(([id, score]) => ({
        id,
        name: players.get(id)?.name ?? 'Unknown',
        score,
      }));

      broadcast({
        type: 'wave_failed',
        nextWaveIn: 10,
        scores: scoreList,
      });

      console.log('[Wave] All farms destroyed - wave failed, 20% score penalty');
    }
  }
}

function tickWaves() {
  // Handle countdown
  if (waveState.countingDown) {
    if (tick % 5 === 0) { // Every second
      waveState.countdown--;
      if (waveState.countdown > 0) {
        broadcast({ type: 'wave_countdown', wave: waveState.waveNumber, countdown: waveState.countdown });
        console.log(`[Wave] Countdown: ${waveState.countdown}`);
      } else {
        // Countdown complete - spawn wave
        spawnWave();
      }
    }
    return;
  }

  // Start next wave if it's time
  if (!waveState.active && waveState.nextWaveTime > 0 && tick >= waveState.nextWaveTime) {
    startWaveCountdown();
  }

  if (!waveState.active) return;

  const AGGRO_RANGE = 10; // Tiles - mobs chase players within this range

  // Broadcast enemy positions periodically
  if (tick % 10 === 0) { // Every 2 seconds
    broadcast({
      type: 'enemies_update',
      enemies: enemies.map(e => ({ id: e.id, gridX: e.gridX, gridY: e.gridY, health: e.health, maxHealth: e.maxHealth, mobType: e.mobType })),
    });
  }

  // Update enemy AI
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (!enemy) continue;

    // Check for nearby players (aggro system)
    let nearestPlayer: ServerPlayer | null = null;
    let nearestPlayerDist = AGGRO_RANGE;

    for (const [_playerId, player] of players) {
      if (player.eliminated) continue;
      const dist = gridDistance(enemy.gridX, enemy.gridY, player.gridX, player.gridY);
      if (dist < nearestPlayerDist) {
        nearestPlayerDist = dist;
        nearestPlayer = player;
      }
    }

    // If player nearby, chase them. Otherwise, attack farm.
    if (nearestPlayer) {
      // AGGRO: Chase player
      const dx = nearestPlayer.gridX - enemy.gridX;
      const dy = nearestPlayer.gridY - enemy.gridY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 1.5) {
        // Move toward player (use mob type speed)
        if (tick % 5 === 0) {
          const stats = MOB_TYPES[enemy.mobType];
          const moveX = (dx / dist) * stats.speed;
          const moveY = (dy / dist) * stats.speed;
          enemy.gridX += moveX;
          enemy.gridY += moveY;
        }
      } else {
        // Attack player — contagion mode: no health/damage (server doesn't track health)
        enemy.lastAttackTick = tick;
      }
    } else {
      // NO AGGRO: Attack farm patch
      // Find farm with assigned targetId OR nearest farm
      let targetFarm = waveState.farmPatches.find(f => f.id === enemy.targetId);

      if (!targetFarm && waveState.farmPatches.length > 0) {
        // Find nearest farm if no target assigned
        let minDist = Infinity;
        for (const farm of waveState.farmPatches) {
          const dist = gridDistance(enemy.gridX, enemy.gridY, farm.gridX + farm.width / 2, farm.gridY + farm.height / 2);
          if (dist < minDist) {
            minDist = dist;
            targetFarm = farm;
          }
        }
        if (targetFarm) {
          enemy.targetId = targetFarm.id;
        }
      }

      if (!targetFarm) continue;

      // Move toward center of farm patch
      const farmCenterX = targetFarm.gridX + targetFarm.width / 2;
      const farmCenterY = targetFarm.gridY + targetFarm.height / 2;
      const dx = farmCenterX - enemy.gridX;
      const dy = farmCenterY - enemy.gridY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        // Move toward farm (use mob type speed)
        if (tick % 3 === 0) { // Every 0.6s
          const stats = MOB_TYPES[enemy.mobType];
          const moveX = (dx / dist) * stats.speed;
          const moveY = (dy / dist) * stats.speed;
          enemy.gridX += moveX;
          enemy.gridY += moveY;
        }
      } else {
        // Attack farm if in range (use mob type damage)
        if (tick >= enemy.lastAttackTick + 5) {
          const stats = MOB_TYPES[enemy.mobType];
          damageFarm(targetFarm.id, stats.damage);
          enemy.lastAttackTick = tick;
        }
      }
    }

    // Check if enemy is dead
    if (enemy.health <= 0) {
      // Award points to killer
      if (enemy.lastHitBy) {
        const currentScore = playerScores.get(enemy.lastHitBy) || 0;
        playerScores.set(enemy.lastHitBy, currentScore + 10);

        broadcast({
          type: 'enemy_killed',
          enemyId: enemy.id,
          killerId: enemy.lastHitBy,
          score: currentScore + 10,
        });
      }

      enemies.splice(i, 1);
      waveState.mobsRemaining--;

      // Check if wave complete
      if (waveState.mobsRemaining <= 0 && waveState.farmPatches.length > 0) {
        waveState.active = false;
        waveState.nextWaveTime = tick + 50; // 10s before next wave

        const scoreList = Array.from(playerScores.entries()).map(([id, score]) => ({
          id,
          name: players.get(id)?.name ?? 'Unknown',
          score,
        }));

        broadcast({
          type: 'wave_complete',
          wave: waveState.waveNumber,
          nextWaveIn: 10,
          scores: scoreList,
        });

        console.log(`[Wave] Wave ${waveState.waveNumber} complete!`);
      }
    }
  }

  // Broadcast enemy positions every 5 ticks
  if (tick % 5 === 0) {
    broadcast({
      type: 'enemies_update',
      enemies: enemies.map(e => ({
        id: e.id,
        gridX: Math.round(e.gridX * 10) / 10,
        gridY: Math.round(e.gridY * 10) / 10,
        health: e.health,
        maxHealth: e.maxHealth,
      })),
    });
  }
}

// ── Win Condition ────────────────────────────────────────────────────

function checkWinCondition() {
  if (gameOver) return;

  const active = Array.from(players.values()).filter(p => !p.eliminated);

  // Cure race: someone collected enough fragments
  for (const p of active) {
    if (!p.infected && p.cureFragments >= CURE_FRAGMENTS_TO_WIN) {
      gameOver = true;
      const healthyWinners = active.filter(a => !a.infected).map(a => ({ id: a.id, name: a.name }));
      broadcast({
        type: 'gameOver',
        reason: 'cure',
        curedBy: { id: p.id, name: p.name },
        winners: healthyWinners,
      });
      console.log(`[Game Over] Cure found by ${p.name}!`);
      return;
    }
  }

  // All healthy players infected — infection wins
  const healthyCount = active.filter(a => !a.infected).length;
  if (healthyCount === 0 && active.length >= 2 && patientZeroId) {
    gameOver = true;
    broadcast({
      type: 'gameOver',
      reason: 'allInfected',
      winners: active.filter(a => a.infected).map(a => ({ id: a.id, name: a.name })),
    });
    console.log('[Game Over] All players infected!');
  }
}

// ── Message Handling ─────────────────────────────────────────────────

function handleMessage(ws: unknown, raw: string) {
  let msg: { type: string; [key: string]: unknown };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  const playerId = wsToPlayer.get(ws);

  switch (msg.type) {
    case 'join': {
      const id = msg.address as string;
      const color = (msg.color as string) || '#4CAF50';

      // Server generates random name instead of using client name
      const name = generateRandomName();

      // Reconnect or new player
      const existing = players.get(id);
      if (existing) {
        // Reconnecting player keeps their current name
        existing.ws = ws;
        existing.color = color;
        wsToPlayer.set(ws, id);
        console.log(`[Reconnect] ${existing.name} (${id.slice(0, 8)}...)`);
      } else {
        // Spawn players in a ring around center so they don't start on top of each other
        const center = Math.floor(currentMapSize / 2);
        const angle = Math.random() * Math.PI * 2;
        const radius = 15 + Math.random() * 10; // 15-25 tiles from center
        const spawnX = Math.round(center + Math.cos(angle) * radius);
        const spawnY = Math.round(center + Math.sin(angle) * radius);
        players.set(id, {
          id,
          name,
          color,
          gridX: spawnX,
          gridY: spawnY,
          infected: false,
          infectedAt: -1,
          canSpread: false,
          isPatientZero: false,
          lastTestTick: -TEST_COOLDOWN_TICKS,
          lastTestResult: null,
          lastTestTick2: -1,
          zkNonce: null,
          cureFragments: 0,
          eliminated: false,
          accuseCooldownUntil: 0,
          proximityLog: [],
          incubationTicks: 0,
          ws,
        });
        wsToPlayer.set(ws, id);
        console.log(`[Join] ${name} (${id.slice(0, 8)}...) — ${players.size} players`);
      }

      // Send current state to joining player
      const gameAlreadyStarted = !!patientZeroId && !gameOver;
      const p = players.get(id);
      send(ws, {
        type: 'welcome',
        playerId: id,
        fragmentsToWin: CURE_FRAGMENTS_TO_WIN,
        gameDuration: Math.ceil(GAME_DURATION_TICKS / 5),
        gameStarted: gameAlreadyStarted,
        playerCount: players.size,
        mapSize: currentMapSize,
        testCamps,
        isPatientZero: !!(p?.isPatientZero),
      });

      // Expand map if needed
      const newMapSize = calculateMapSize(players.size);
      if (newMapSize > currentMapSize) {
        currentMapSize = newMapSize;
        console.log(`[Map] Expanded to ${currentMapSize}×${currentMapSize} (${players.size} players)`);
        // Spawn additional cure fragments in the new area
        const extraFragments = Math.floor((currentMapSize - BASE_MAP_SIZE) / MAP_GROWTH_PER_PLAYER) * 2;
        const currentCount = cureFragments.filter(f => !f.collected).length;
        const target = CURE_FRAGMENT_COUNT + extraFragments;
        const occupied = new Set(cureFragments.map(f => `${f.gridX},${f.gridY}`));
        for (let i = currentCount; i < target; i++) {
          let gx: number, gy: number;
          let attempts = 0;
          do {
            gx = randomInt(2, currentMapSize - 3);
            gy = randomInt(2, currentMapSize - 3);
            attempts++;
          } while (occupied.has(`${gx},${gy}`) && attempts < 100);
          occupied.add(`${gx},${gy}`);
          cureFragments.push({ id: nextFragmentId++, gridX: gx, gridY: gy, collected: false });
        }
        broadcast({ type: 'mapExpanded', mapSize: currentMapSize });
      }

      // Start game when 2+ players — first player sees lobby, can share link; game starts when 2nd joins
      if (players.size >= MIN_PLAYERS_TO_START && !patientZeroId && !gameOver) {
        resetGame();
        broadcast({ type: 'gameStarted' });
        broadcastState();
        // Send infected AFTER gameStarted so client receives it last (avoids overwriting isPatientZero)
        const pzWs = Array.from(wsToPlayer.entries()).find(([_, id]) => id === patientZeroId)?.[0];
        if (pzWs) send(pzWs, { type: 'infected', message: 'You are patient zero!' });
        console.log('[Game] Started with', players.size, 'player(s)');
      } else if (gameAlreadyStarted) {
        // Game already running — send state immediately so new player sees gems, players, etc.
        broadcastState();
      } else {
        // Broadcast lobby so player sees they're connected
        broadcastLobby();
      }
      break;
    }

    case 'move': {
      if (!playerId) return;
      const p = players.get(playerId);
      if (!p) return;
      p.gridX = msg.gridX as number;
      p.gridY = msg.gridY as number;
      break;
    }

    case 'player_damaged': {
      if (!playerId) return;
      const p = players.get(playerId);
      if (!p) return;
      const enemyType = (msg.enemyType as string) || 'goblin';
      const pointsLost = POINTS_LOST_PER_MOB_HIT[enemyType] ?? 5;
      const currentScore = playerScores.get(playerId) ?? 0;
      const newScore = Math.max(0, currentScore - pointsLost);
      playerScores.set(playerId, newScore);
      broadcastState();
      console.log(`[Mob] ${p.name} hit by ${enemyType}: -${pointsLost} pts (${newScore} total)`);
      break;
    }

    case 'test': {
      send(ws, { type: 'error', message: 'Go to a test camp to find out your infection status' });
      break;
    }

    case 'flashProof': {
      if (!playerId) return;
      const p = players.get(playerId);
      if (!p) return;

      if (p.lastTestResult === null) {
        send(ws, { type: 'error', message: 'Test yourself first before flashing proof' });
        return;
      }

      // Accept ZK proof data from client (optional — present when proof was generated)
      const zkProof = msg.proof as string | undefined;
      const zkPublicInputs = msg.publicInputs as string[] | undefined;
      const zkCommitment = msg.zkCommitment as string | undefined;

      broadcast({
        type: 'proofFlashed',
        playerId: p.id,
        playerName: p.name,
        status: p.lastTestResult ? 'INFECTED' : 'HEALTHY',
        testedAt: p.lastTestTick,
        currentTick: tick,
        // ZK proof data (undefined when no proof generated yet)
        proof: zkProof,
        publicInputs: zkPublicInputs,
        zkCommitment,
      });
      console.log(`[Flash] ${p.name} flashed: ${p.lastTestResult ? 'INFECTED' : 'HEALTHY'} (tested ${tick - p.lastTestTick} ticks ago)${zkProof ? ' [+ZK proof]' : ''}`);
      break;
    }

    case 'accuse': {
      if (!playerId) return;
      const accuser = players.get(playerId);
      if (!accuser) return;

      if (tick < accuser.accuseCooldownUntil) {
        const remaining = Math.ceil((accuser.accuseCooldownUntil - tick) / 5);
        send(ws, { type: 'accuseCooldown', remaining });
        return;
      }

      const targetId = msg.targetId as string;
      const target = players.get(targetId);
      if (!target || targetId === playerId) return;

      // Check no active accusation against this target
      const activeAcc = accusations.find(a => !a.resolved && a.targetId === targetId);
      if (activeAcc) {
        send(ws, { type: 'error', message: 'There is already an active accusation against this player' });
        return;
      }

      const acc: Accusation = {
        id: nextAccusationId++,
        accuserId: playerId,
        targetId,
        votes: new Map(),
        startTick: tick,
        resolved: false,
      };
      // Accuser auto-votes yes
      acc.votes.set(playerId, true);
      accusations.push(acc);

      broadcast({
        type: 'accusation',
        id: acc.id,
        accuserId: playerId,
        accuserName: accuser.name,
        targetId,
        targetName: target.name,
        voteDuration: Math.ceil(VOTE_DURATION_TICKS / 5),
      });
      console.log(`[Accuse] ${accuser.name} accuses ${target.name}`);
      break;
    }

    case 'vote': {
      if (!playerId) return;
      const accId = msg.accusationId as number;
      const yes = msg.yes as boolean;

      const acc = accusations.find(a => a.id === accId && !a.resolved);
      if (!acc) return;

      acc.votes.set(playerId, yes);

      // Check if all active players have voted → resolve early
      const activePlayers = Array.from(players.values()).filter(p => !p.eliminated);
      if (acc.votes.size >= activePlayers.length) {
        resolveAccusation(acc);
      }
      break;
    }

    case 'collectFragment': {
      if (!playerId) return;
      const p = players.get(playerId);
      if (!p || p.infected) {
        send(ws, { type: 'error', message: p?.infected ? 'Infected players cannot collect cure fragments' : 'Cannot collect' });
        return;
      }

      const fgx = msg.gridX as number;
      const fgy = msg.gridY as number;

      // Check player is near the fragment
      const fragment = cureFragments.find(
        f => !f.collected && gridDistance(p.gridX, p.gridY, f.gridX, f.gridY) <= COLLECT_RADIUS
          && f.gridX === fgx && f.gridY === fgy
      );
      if (!fragment) {
        send(ws, { type: 'error', message: 'No fragment at this location or too far away' });
        return;
      }

      fragment.collected = true;
      p.cureFragments++;

      broadcast({
        type: 'fragmentCollected',
        playerId: p.id,
        playerName: p.name,
        fragmentId: fragment.id,
        playerFragments: p.cureFragments,
        fragmentsToWin: CURE_FRAGMENTS_TO_WIN,
      });
      console.log(`[Cure] ${p.name} collected fragment (${p.cureFragments}/${CURE_FRAGMENTS_TO_WIN})`);
      break;
    }

    case 'dig_gem': {
      if (!playerId) return;
      const player = players.get(playerId);
      if (!player) return;

      const gemId = msg.gemId as number;
      const gx = msg.gridX as number;
      const gy = msg.gridY as number;

      // Find the buried gem
      const gem = buriedGems.find(g => g.id === gemId && g.state === 'buried');
      if (!gem) {
        console.warn('[dig_gem] Gem not found or already dug:', gemId);
        send(ws, { type: 'error', message: 'Gem not available' });
        break;
      }

      // Validate position - player must be on the exact tile
      if (gem.gridX !== gx || gem.gridY !== gy) {
        console.warn('[dig_gem] Position mismatch:', { gemPos: { x: gem.gridX, y: gem.gridY }, playerPos: { x: gx, y: gy } });
        send(ws, { type: 'error', message: 'Must be on gem tile to dig' });
        break;
      }

      // Update gem state
      gem.state = 'dug';
      gem.dugBy = playerId;
      gem.dugAt = Date.now();

      // Broadcast to all clients
      broadcast({
        type: 'gem_dug',
        gemId: gem.id,
        gridX: gem.gridX,
        gridY: gem.gridY,
        gemType: gem.gemType,
        points: gem.points,
        dugBy: playerId,
      });

      console.log('[dig_gem] Gem dug:', { gemId, gemType: gem.gemType, playerId, pos: { x: gx, y: gy } });
      break;
    }

    case 'collect_gem': {
      if (!playerId) return;
      const player = players.get(playerId);
      if (!player) return;

      const gemId = msg.gemId as number;
      const gx = Math.floor(player.gridX);
      const gy = Math.floor(player.gridY);

      console.log('[collect_gem] Attempt:', { playerId, gemId, playerPos: { x: gx, y: gy } });

      // Find the dug gem (changed from 'buried' check)
      const gem = buriedGems.find(g => g.id === gemId && g.state === 'dug');
      if (!gem) {
        console.warn('[collect_gem] Gem not found or not dug yet:', gemId);
        send(ws, { type: 'error', message: 'Gem not available for collection' });
        break;
      }

      // Validate proximity (within 1.5 tiles)
      const dx = Math.abs(gem.gridX - gx);
      const dy = Math.abs(gem.gridY - gy);
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 1.5) {
        console.warn('[collect_gem] Player too far from gem:', { distance, maxDistance: 1.5 });
        send(ws, { type: 'error', message: 'Too far from gem' });
        break;
      }

      // Mark as collected
      gem.state = 'collected';
      gem.collectedBy = playerId;
      gem.collectedAt = Date.now();

      // Award points
      const currentScore = playerScores.get(playerId) ?? 0;
      playerScores.set(playerId, currentScore + gem.points);

      // Broadcast to all clients that gem was collected
      broadcast({
        type: 'gem_collected',
        gemId: gem.id,
        playerId,
      });

      // Send inventory update to collector
      send(ws, {
        type: 'inventory_update',
        gems: calculateGemInventory(playerId),
        totalPoints: playerScores.get(playerId) ?? 0,
      });

      console.log('[collect_gem] Success:', { gemId, gemType: gem.gemType, playerId, points: gem.points });
      break;
    }

    case 'attack_enemy': {
      if (!playerId) return;
      const p = players.get(playerId);
      if (!p) return;

      const enemyId = msg.enemyId as string;
      const damage = (msg.damage as number) || 10;

      const enemy = enemies.find(e => e.id === enemyId);
      if (!enemy) {
        send(ws, { type: 'error', message: 'Enemy not found' });
        return;
      }

      // Check distance (must be within 3 tiles)
      const dist = gridDistance(p.gridX, p.gridY, enemy.gridX, enemy.gridY);
      if (dist > 3) {
        send(ws, { type: 'error', message: 'Too far to attack' });
        return;
      }

      enemy.health -= damage;
      enemy.lastHitBy = playerId;

      broadcast({
        type: 'enemy_damaged',
        enemyId: enemy.id,
        health: enemy.health,
        maxHealth: enemy.maxHealth,
        attackerId: playerId,
      });

      console.log(`[Combat] ${p.name} hit ${enemyId} for ${damage} damage (${enemy.health}/${enemy.maxHealth} HP)`);
      break;
    }

    case 'test_infection': {
      if (!playerId) return;
      const p = players.get(playerId);
      if (!p) return;

      const nearbyCamp = testCamps.find(camp => gridDistance(p.gridX, p.gridY, camp.x, camp.y) <= TEST_CAMP_RADIUS);
      if (!nearbyCamp) {
        send(ws, { type: 'test_error', message: 'Too far from test camp — go to a test camp to find out your status' });
        return;
      }

      p.lastTestResult = p.infected;
      p.lastTestTick = tick;
      p.lastTestTick2 = tick;

      // Generate ZK nonce: 31 random bytes as hex (fits in BN254 field)
      const nonceBytes = new Uint8Array(31);
      crypto.getRandomValues(nonceBytes);
      const zkNonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      p.zkNonce = zkNonce;

      // Derive player_id_hash: sha256(playerId), first 31 bytes as BigInt hex
      const idHashBuf = createHash('sha256').update(p.id).digest();
      const idHashHex = '00' + idHashBuf.slice(1).toString('hex'); // clear high byte

      send(ws, {
        type: 'test_result',
        infected: p.infected,
        tick,
        // ZK inputs — sent only to this player, not broadcast
        zkNonce,
        zkStatus: p.infected ? '0' : '1',
        zkPlayerIdHash: idHashHex,
        zkTick: tick.toString(),
      });

      console.log(`[Test] ${p.name} tested at camp: ${p.infected ? 'INFECTED' : 'HEALTHY'}`);
      break;
    }

    case 'player_died': {
      if (!playerId) return;
      const p = players.get(playerId);
      if (!p) return;

      // Reset score to 0
      playerScores.set(playerId, 0);

      broadcast({
        type: 'player_died',
        playerId,
        playerName: p.name,
      });

      broadcast({
        type: 'score_update',
        playerId,
        score: 0,
      });

      console.log(`[Death] ${p.name} died - score reset to 0`);
      break;
    }

    case 'infect_nearby': {
      // Infected player holds Q to immediately infect a nearby healthy player
      if (!playerId) return;
      const p = players.get(playerId);
      if (!p || !p.infected) return;

      let infected = false;
      for (const [, target] of players) {
        if (target.id === playerId || target.infected || target.eliminated) continue;
        const dist = gridDistance(p.gridX, p.gridY, target.gridX, target.gridY);
        if (dist <= 3) {
          target.infected = true;
          target.infectedAt = tick;
          target.canSpread = false;
          target.incubationTicks = randomInt(INCUBATION_MIN, INCUBATION_MAX);
          send(target.ws, { type: 'infected', message: 'You have been infected!' });
          const s = playerScores.get(p.id) ?? 0;
          playerScores.set(p.id, s + POINTS_PER_INFECTION);
          console.log(`[Q-Infect] ${p.name} infected ${target.name}`);
          infected = true;
          break; // Infect one player at a time
        }
      }
      if (!infected) {
        send(ws, { type: 'error', message: 'No nearby healthy player to infect' });
      }
      break;
    }

    case 'restart': {
      if (gameOver) {
        resetGame();
        broadcast({ type: 'gameStarted' });
        console.log('[Game] Restarted!');
      }
      break;
    }
  }
}

// ── Tick Loop ────────────────────────────────────────────────────────

function gameTick() {
  if (gameOver || !patientZeroId) return;

  tick++;

  tickInfection();
  tickVotes();

  checkWinCondition();
  broadcastState();
}

// ── Bun WebSocket Server ─────────────────────────────────────────────

console.log(`[Plague Server] Starting on port ${PORT}...`);

Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Upgrade HTTP → WebSocket
    if (server.upgrade(req)) {
      console.log('[WS] Upgrade request received');
      return undefined;
    }
    return new Response('Plague Game Server', { status: 200 });
  },
  websocket: {
    open(ws) {
      console.log('[WS] Connection opened');
    },
    message(ws, message) {
      handleMessage(ws, typeof message === 'string' ? message : new TextDecoder().decode(message as ArrayBuffer));
    },
    close(ws) {
      const playerId = wsToPlayer.get(ws);
      if (playerId) {
        console.log(`[WS] ${players.get(playerId)?.name ?? playerId} disconnected`);
        // Don't remove player immediately — allow reconnect
        wsToPlayer.delete(ws);
      }
    },
  },
});

// Start tick loop
setInterval(gameTick, TICK_MS);

console.log(`[Plague Server] Running at ws://localhost:${PORT}`);
