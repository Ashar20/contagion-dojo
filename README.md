# Contagion

A social deduction .io game built on Starknet with the Dojo engine. One player is secretly Patient Zero. Infection spreads by proximity. Prove your health with flashing proofs. Healthy players mine and perform tasks for points.

## Quick Start

```bash
# Install deps
cd client && pnpm install

# Start backend + frontend
./scripts/restart.sh
```

Open **https://localhost:3000** (or http if no mkcert). Connect with Cartridge Controller, then play.

## How to Play

1. Connect with Cartridge Controller (Google or Discord signup)
2. Create or join a room
3. Move on the isometric map — one player is secretly Patient Zero
4. Infection spreads when you get close to infected players
5. Collect cure fragments to win, or survive until the timer ends
6. Use test camps to prove your health with ZK proofs
7. Accuse suspected Patient Zero and vote

## Architecture

```
contagion-dojo/
├── contracts/          # Dojo 1.8 Cairo smart contracts
│   └── src/
│       ├── models.cairo              # Player model (position, health, gold, level, dug bitmap)
│       ├── systems/actions.cairo     # spawn, move, dig — grid game with validation
│       └── tests/test_world.cairo    # Contract tests
├── egs/                # Embeddable Game Standard contract (Starknet 2.15.1)
│   └── src/lib.cairo                 # IMinigameTokenData — provable score reporting
├── client/             # React + Vite + TypeScript frontend
│   └── src/
│       ├── main.tsx                  # App entry point
│       ├── starknet.tsx              # Cartridge Controller + starknet-react
│       ├── dojo/                     # Dojo SDK config, contract wrappers, models
│       └── games/contagion/          # Game components (isometric map, HUD, networking)
├── server/             # Bun WebSocket server (real-time multiplayer)
└── scripts/            # Setup, deploy, and utility scripts
```

### Smart Contracts (Cairo)

**Dojo contracts** (`contracts/`) — Dojo 1.8:
- **Models**: `Player` — position, health, gold, level, dug bitmap
- **Systems**: `spawn`, `move`, `dig` — grid-based game with on-chain validation
- Two-layer randomness: Poseidon hash for tile content (~20% probability), block timestamp for dig outcome (gold vs bomb)
- Level progression, health management, duplicate-dig prevention via bitmap

**EGS contract** (`egs/`) — Starknet 2.15.1 + [game-components](https://github.com/Provable-Games/game-components):
- Implements `IMinigameTokenData` for provable score/game_over reporting
- `report_result(token_id, score)` called when a game ends
- Deployed on Sepolia

### Client

- **React + Vite** with Three.js for isometric rendering
- **Cartridge Controller** for player authentication (passkeys, Google, Discord)
- **Dojo SDK** (`@dojoengine/core`, `@dojoengine/sdk`) for on-chain state
- **Noir + bb.js** for ZK health proofs
- **Denshokan SDK** for EGS integration (provable game sessions)
- **WebSocket** for real-time multiplayer state

### Backend

- **Bun WebSocket server** (port 3001)
- Room management, proximity-based infection logic, game state sync

## Dojo Integration

Contracts are deployed on Starknet Sepolia:
- **World**: `0x056e42d1a8638411797a6dac30816d7f31949c6f5ba5c502e8e8b269afc8ac61`
- **Actions**: `0x050aa714156b7fc942f0782d50d7323a0fb84fcffa8128a3d84f782c98df8e20`
- **EGS**: `0x00afdc03274b847d6a006272632464b66fe6ac217879e3c3fdec53578e5145a0`

Deploy contracts locally:
```bash
cd contracts && sozo build && sozo migrate
```

## EGS (Embeddable Game Standard)

Contagion adopts the [Embeddable Game Standard](https://docs.provable.games/embeddable-game-standard) for provable, embeddable sessions.

- **Frontend**: `DenshokanProvider` with React hooks (`useGames`, `useToken`, `useScoreUpdates`)
- **Contract**: `egs/` implements `IMinigameTokenData`. Deploy with `./scripts/egs-deploy-sepolia.sh`, then register:
  ```bash
  cd client && EGS_DEPLOYER_PRIVATE_KEY=0x... pnpm run egs:register
  ```
- The client calls `report_result(token_id, score)` on-chain when a game ends

## Commands

| Command | Description |
|---------|-------------|
| `./scripts/restart.sh` | Kill 3000/3001, start backend + frontend |
| `cd client && pnpm dev` | Frontend only (needs backend on 3001) |
| `cd client && bun run dev:server` | Backend only |
| `cd contracts && sozo build` | Build Dojo contracts |
| `cd contracts && scarb test` | Run contract tests |

## Share via ngrok

```bash
# Terminal 1 — start the game
./scripts/restart.sh

# Terminal 2 — expose frontend
cd client && pnpm exec ngrok http 3000
```

Share the `https://` URL — friends can play immediately.

For remote backend hosting, see the [ngrok backend guide](./scripts/ngrok-backend.sh).

## Prerequisites

- [Dojo toolchain](https://book.dojoengine.org/getting-started/installation) (scarb, sozo, katana, torii)
- [Node.js](https://nodejs.org/) >= 18, [pnpm](https://pnpm.io/) >= 9
- [Bun](https://bun.sh/) (for WebSocket server)

## Team

@Ashar20
