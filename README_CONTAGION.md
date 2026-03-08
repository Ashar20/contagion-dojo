# Contagion — Dojo Hackathon

**Social deduction .io game.** One player is secretly Patient Zero. Infection spreads by proximity. Prove your health with ZK proofs. No Stellar — runs on WebSocket + Starknet wallet.

## Quick Start

```bash
# Install deps
cd client && pnpm install   # or: bun install

# Start backend + frontend
./scripts/restart.sh
```

Open **https://localhost:3000** (or http if no mkcert). Connect with Cartridge Controller, then play.

## Architecture

- **Frontend**: React + Vite (port 3000), [Embeddable Game Standard](https://docs.provable.games/embeddable-game-standard) via `@provable-games/denshokan-sdk`
- **Backend**: Bun WebSocket server (port 3001)
- **Wallet**: Starknet (Cartridge Controller) — address = player ID
- **Game state**: WebSocket (real-time); on-chain Dojo contracts in `contracts/`; EGS minigame in `egs/` for provable score/game_over

## EGS (Embeddable Game Standard)

Contagion adopts the [Embeddable Game Standard](https://docs.provable.games/embeddable-game-standard) for provable, embeddable sessions.

- **Frontend**: `DenshokanProvider` (chain: Sepolia) and **EGS Games** section on the landing page (lists games from the registry). [denshokan-sdk](https://docs.provable.games/embeddable-game-standard/frontend) provides React hooks (`useGames`, `useToken`, `useScoreUpdates`) and WebSocket subscriptions.
- **Contract**: `egs/` is a minimal EGS minigame (Starknet 2.15.1 + [game-components](https://github.com/Provable-Games/game-components)) that implements `IMinigameTokenData` (score, game_over). Deploy with `./scripts/egs-deploy-sepolia.sh`. Then **register** (so Contagion appears in the EGS Games section) by running from the **client** directory: `EGS_DEPLOYER_PRIVATE_KEY=0x... pnpm run egs:register`. Same key as used for deploy. The client calls `report_result(token_id, score)` when a game ends (if the player has an EGS token).

## Dojo

- **contracts/**: Dojo 1.8 (spawn, move, dig grid game) — deploy with `sozo migrate`.
- Agent skills: `npx skills add dojoengine/book`, `npx skills add cartridge-gg/docs`

## Commands

| Command | Description |
|---------|-------------|
| `./scripts/restart.sh` | Kill 3000/3001, start backend + frontend |
| `cd client && pnpm dev` | Frontend only (needs backend on 3001) |
| `cd client && bun run dev:server` | Backend only |

## Share via ngrok

**Share the frontend (same machine):**

```bash
# Terminal 1
./scripts/restart.sh

# Terminal 2
cd client && pnpm exec ngrok http 3000
```

Share the `https://` URL — friends can play immediately.

**Host the backend via ngrok (e.g. backend on another laptop or cloud):**

1. Start the backend (on the machine that will be tunneled):
   ```bash
   cd client && bun run dev:server
   ```
2. Expose it with ngrok:
   ```bash
   ./scripts/ngrok-backend.sh
   ```
3. Copy the ngrok HTTPS URL (e.g. `https://abc123.ngrok-free.app`). The WebSocket URL is the same host with `wss://` (e.g. `wss://abc123.ngrok-free.app`).
4. On the machine running the frontend, point it at the tunneled backend:
   ```bash
   cd client
   VITE_CONTAGION_WS_URL=wss://abc123.ngrok-free.app pnpm dev
   ```
   Replace `abc123.ngrok-free.app` with your ngrok host. Restart the dev server after changing `VITE_CONTAGION_WS_URL`.
5. Open the frontend (e.g. https://localhost:3000 or your own ngrok URL for the frontend). The game will use the backend behind ngrok.
