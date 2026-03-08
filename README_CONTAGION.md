# Contagion — Dojo Hackathon

**Social deduction .io game.** One player is secretly Patient Zero. Infection spreads by proximity. Prove your health with ZK proofs. No Stellar — runs on WebSocket + Starknet wallet.

## Quick Start

```bash
# Install deps
cd client && pnpm install   # or: bun install

# Start backend + frontend
./scripts/restart.sh
```

Open **http://localhost:3000**. Connect with Cartridge Controller, then play.

## Architecture

- **Frontend**: React + Vite (port 3000)
- **Backend**: Bun WebSocket server (port 3001)
- **Wallet**: Starknet (Cartridge Controller) — address = player ID
- **Game state**: WebSocket only (no on-chain game logic yet)

## Dojo / EGS Integration (TODO)

- [Embeddable Game Standard](https://docs.provable.games/embeddable-game-standard)
- [denshokan-sdk](https://docs.provable.games/embeddable-game-standard/frontend) for score/leaderboard
- Agent skills: `npx skills add dojogengine/book`, `npx skills add cartridge-gg/docs`

## Commands

| Command | Description |
|---------|-------------|
| `./scripts/restart.sh` | Kill 3000/3001, start backend + frontend |
| `cd client && pnpm dev` | Frontend only (needs backend on 3001) |
| `cd client && bun run dev:server` | Backend only |

## Share via ngrok

```bash
# Terminal 1
./scripts/restart.sh

# Terminal 2
cd client && pnpm exec ngrok http 3000
```

Share the `https://` URL — friends can play immediately.
