#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
CLIENT_DIR="$ROOT_DIR/client"

FAILED=0

run() {
  echo "--- $1 ---"
  if eval "$2"; then
    echo "PASS: $1"
  else
    echo "FAIL: $1"
    FAILED=1
  fi
  echo ""
}

# --- Contracts ---
cd "$CONTRACTS_DIR"
run "contracts: build" "scarb build"
run "contracts: test" "snforge test"

# --- Client ---
cd "$CLIENT_DIR"
run "client: install" "pnpm install --frozen-lockfile"
run "client: lint" "pnpm lint"
run "client: typecheck" "pnpm typecheck"
run "client: build" "pnpm build"

# --- Summary ---
echo "========================"
if [ "$FAILED" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks failed."
  exit 1
fi
