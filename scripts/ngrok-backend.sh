#!/bin/bash
# Expose the game backend (WebSocket on 3001) via ngrok.
# Run the backend first (e.g. ./scripts/restart.sh or in another terminal: cd client && bun run dev:server).
# Then run this script and set VITE_CONTAGION_WS_URL to the printed wss:// URL when starting the frontend.
set -e
cd "$(dirname "$0")/.."
echo "Exposing backend (port 3001) via ngrok..."
echo "Ensure the backend is running: cd client && bun run dev:server"
echo ""
echo "After ngrok starts, copy the HTTPS URL (e.g. https://xxxx.ngrok-free.app)"
echo "and use the WebSocket URL for the frontend:"
echo "  VITE_CONTAGION_WS_URL=wss://<your-ngrok-host> pnpm dev"
echo ""
cd client && pnpm exec ngrok http 3001
