#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
CLIENT_DIR="$ROOT_DIR/client"

KATANA_PID=""
TORII_PID=""
CLIENT_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$CLIENT_PID" ] && kill "$CLIENT_PID" 2>/dev/null || true
  [ -n "$TORII_PID" ] && kill "$TORII_PID" 2>/dev/null || true
  [ -n "$KATANA_PID" ] && kill "$KATANA_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

log() { echo ""; echo "=> $*"; }
run() { log "$@"; "$@"; }
run_bg() { log "$@"; "$@" >/dev/null 2>&1 & }
run_quiet() { log "$@"; "$@" >/dev/null 2>&1; }

# --- All contract tooling runs from contracts/ ---
cd "$CONTRACTS_DIR"

echo "=== Initializing contracts environment ==="
run_quiet sozo build

# --- Start Katana ---
run_bg katana --config katana.toml
KATANA_PID=$!

for i in $(seq 1 30); do
  if curl -s http://localhost:5050 >/dev/null 2>&1; then break; fi
  if ! kill -0 "$KATANA_PID" 2>/dev/null; then echo "Error: Katana failed to start."; exit 1; fi
  sleep 1
done
if ! curl -s http://localhost:5050 >/dev/null 2>&1; then echo "Error: Katana did not become ready in time."; exit 1; fi

# --- Migrate ---
run_quiet sozo migrate --dev

# --- Copy manifest to client ---
MANIFEST="manifest_dev.json"
if [ ! -f "$MANIFEST" ]; then echo "Error: manifest_dev.json not found after migration."; exit 1; fi
cp "$MANIFEST" "$CLIENT_DIR/src/dojo/manifest_dev.json"

WORLD_ADDRESS=$(python3 -c "import json; print(json.load(open('$MANIFEST'))['world']['address'])")

# --- Start Torii ---
log "torii --config torii.toml --world ${WORLD_ADDRESS:0:10}..."
torii --config torii.toml --world "$WORLD_ADDRESS" >/dev/null 2>&1 &
TORII_PID=$!
sleep 2
if ! kill -0 "$TORII_PID" 2>/dev/null; then echo "Error: Torii failed to start."; exit 1; fi

# --- Write .env for client ---
cat > "$CLIENT_DIR/.env" <<EOF
VITE_RPC_URL=http://localhost:5050
VITE_TORII_URL=http://localhost:8080
EOF

# --- Start frontend (unless --no-client) ---
if [[ "${1:-}" != "--no-client" ]]; then
  echo ""
  echo "=== Initializing client environment ==="
  cd "$CLIENT_DIR"
  run_quiet pnpm install --frozen-lockfile
  log "pnpm dev"
  pnpm dev >/dev/null 2>&1 &
  CLIENT_PID=$!
fi

# --- Print summary ---
echo ""
echo "=== Dev environment running ==="
echo ""
echo "Katana RPC:  http://localhost:5050"
echo "Torii HTTP:  http://localhost:8080"
if [ -n "$CLIENT_PID" ]; then
  echo "Frontend:    https://localhost:5173"
fi
echo ""
echo "Press Ctrl+C to stop."

# --- Wait ---
wait
