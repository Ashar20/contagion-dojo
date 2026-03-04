# Dojo Starter

Official starter repo for [Dojo](https://book.dojoengine.org) — a provable game engine on Starknet.

Clone this repo, run one command, and have a local game running in minutes.

## Prerequisites

- [asdf](https://asdf-vm.com/) or compatible version manager (reads `contracts/.tool-versions`)
- [Dojo toolchain](https://book.dojoengine.org/getting-started/installation) — `scarb`, `sozo`, `katana`, `torii`
- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 9
- Python 3 (used by `dev.sh` to parse manifest JSON)

Pinned versions live in [`contracts/.tool-versions`](contracts/.tool-versions).

## Quickstart

```bash
git clone https://github.com/dojoengine/starter.git
cd starter

# Start the full local stack (Katana + contracts + Torii + frontend)
./scripts/dev.sh
```

Open https://localhost:5173 in your browser.
Connect with Cartridge Controller, then use the compass to move and dig for treasure.

## Architecture

```
starter/
├── contracts/          # Cairo/Dojo smart contracts
│   └── src/
│       ├── models.cairo          # Player model + Direction enum
│       ├── systems/actions.cairo # spawn, move, dig logic
│       └── tests/test_world.cairo
├── client/             # React + Vite + TypeScript frontend
│   └── src/
│       ├── App.tsx               # Game UI (grid, HUD, compass)
│       ├── dojo/                 # SDK config, contracts, models
│       ├── starknet-provider.tsx # Cartridge Controller + starknet-react
│       └── tileUtils.ts         # Client-side tile content logic
└── scripts/
    ├── dev.sh          # One-command local dev environment
    └── check.sh        # CI validation (build, test, lint, typecheck)
```

### Contracts

Namespace: `starter`

**Player** model — stores position, health, gold, level, and a bitmap of dug tiles.
Each player navigates a 10x10 grid, digging tiles that may contain gold or bombs.

Three actions:
- `spawn` — initialize a new player at a random-ish starting position
- `move(direction)` — step in a cardinal direction (costs 1 health)
- `dig` — reveal the current tile (gold, bomb, or empty)

Tile content is determined by a two-layer randomness system:
1. Poseidon hash over (player, level, x, y) determines if a tile has content (~20%)
2. Block timestamp entropy at dig time determines gold vs bomb

### Client

React app using `starknet-react` and `@dojoengine/sdk`.
Reads game state via Torii (gRPC subscriptions) and writes transactions through Cartridge Controller with session keys.

## Commands

| Command | Description |
|---|---|
| `./scripts/dev.sh` | Start full local stack |
| `./scripts/check.sh` | Run all CI checks |
| `cd contracts && sozo build` | Build contracts |
| `cd contracts && scarb test` | Run contract tests |
| `cd client && pnpm dev` | Start frontend dev server (needs running backend) |
| `cd client && pnpm lint` | Lint frontend |
| `cd client && pnpm typecheck` | Typecheck frontend |

## Troubleshooting

**Port already in use**
Katana (5050), Torii (8080), and Vite (5173) need their default ports free.
Kill any existing processes on those ports before running `dev.sh`.

```bash
lsof -ti:5050 -ti:8080 -ti:5173 | xargs kill -9
```

**Torii fails to start**
Torii depends on a successful contract migration.
If Torii exits immediately, check that `sozo migrate` succeeded and that `manifest_dev.json` exists in `contracts/`.

**Controller wallet not connecting**
The frontend uses Cartridge Controller which requires HTTPS.
Vite is configured with `mkcert` for local HTTPS — accept the self-signed certificate when prompted.

**Version mismatch errors**
Ensure your installed tool versions match `contracts/.tool-versions`.
Run `asdf install` from the `contracts/` directory to sync.
