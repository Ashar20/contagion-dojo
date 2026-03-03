# Starter Spec (v1)

## Goal
Build the canonical, team-maintained Dojo starter for new projects:
- Minimal Cairo/Dojo contracts
- Minimal React + `starknet-react` frontend
- One-command local development
- Clean, deterministic structure for agentic coding

This repository is the default recommendation for new teams.

## Product Principles
- Optimize for the shortest reliable happy path.
- One canonical way to run each core workflow.
- Prioritize readability and low-maintenance defaults over feature breadth.
- Avoid generated-file churn and repo noise.

## MVP Scope

### Included
- Contracts:
  - 1 namespace: `starter`
  - 1 model: `Position`
  - 1 system: `actions` with `spawn` and `move`
  - Contract tests for core behavior and edge cases
- Frontend:
  - React + Vite + TypeScript
  - `starknet-react` connect/disconnect
  - Show account + current position
  - Trigger `spawn` + directional `move`
  - Basic tx state display (pending/success/failure)
- Local stack:
  - Katana + Sozo migrate + Torii
  - One command to start full dev environment
- CI baseline:
  - contract check + test
  - frontend lint + typecheck + build

### Excluded (MVP)
- Achievements, inventory, quests, marketplaces
- Multi-world orchestration
- Complex game loop abstractions
- Advanced indexer pipelines
- Heavy design systems

## Repo Layout

```text
starter/
├── contracts/
│   ├── src/
│   │   ├── lib.cairo
│   │   ├── models.cairo
│   │   ├── systems/
│   │   │   └── actions.cairo
│   │   └── tests/
│   │       └── test_world.cairo
│   ├── Scarb.toml
│   ├── dojo_dev.toml
│   ├── katana.toml
│   └── .tool-versions
├── client/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── dojo/
│   │   │   ├── config.ts
│   │   │   ├── manifest.ts
│   │   │   └── hooks/
│   │   └── components/
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   ├── dev.sh
│   └── check.sh
├── AGENTS.md
├── README.md
└── SPEC.md
```

## Locked Decisions

### Toolchain and Package Management
- Contracts toolchain is pinned in `contracts/.tool-versions`.
- Frontend package manager: `pnpm` only.
- Exactly one lockfile: `client/pnpm-lock.yaml`.
- No `npm` lockfile in repo.

### Contract Semantics
- Namespace: `starter`.
- Model:
  - `Position { player: ContractAddress (key), x: u32, y: u32 }`
- Direction enum:
  - `Left | Right | Up | Down`
- `spawn()`:
  - idempotent
  - initializes to `(0, 0)` if missing
  - no state change if already spawned
- `move(direction)`:
  - requires spawned player
  - reverts if player has not spawned
  - uses saturating math at `u32` bounds
  - emits `Moved(player, direction, x, y)` event

### Read Strategy
- Read path is Torii-first.
- If Torii is unavailable, frontend falls back to direct RPC read.

### Generated Files Policy
- Contract manifests are generated and not tracked.
- Frontend generated bindings are not tracked in MVP.
- Generation is deterministic and script-driven.

### CI Scope
- CI target: `ubuntu-latest` (single OS in MVP).
- Expand to multi-OS only if instability requires it.

## Developer Experience Requirements

### One-command full local startup
A root script (`scripts/dev.sh`) should orchestrate the full stack in one process, similar to the workflow used in the referenced `deploy_katana.sh` style:
- start Katana
- wait for RPC readiness
- build + migrate contracts
- resolve world address from manifest
- start Torii with that world
- print exported env values for frontend
- optionally launch frontend dev server (`--with-client` flag)
- trap/cleanup all child processes on exit

Target usage:
- `./scripts/dev.sh`
- `./scripts/dev.sh --with-client`

### One-command validation
A root script (`scripts/check.sh`) runs all required validations:
- contracts: format/check/test
- client: install (frozen lockfile), lint, typecheck, build

Target usage:
- `./scripts/check.sh`

### Determinism and Hygiene
- Ignore and never commit:
  - `target/`, `dist/`, `node_modules/`, cache dirs, `*.tsbuildinfo`, local env files
- Keep commands explicit and non-interactive.
- Avoid hidden bootstrap behavior that mutates repo state unexpectedly.

## Testing Requirements

### Contracts
Required tests:
- spawn initializes `(0, 0)`
- spawn idempotency
- move updates each direction correctly
- move before spawn reverts
- bound behavior is saturating
- event emission for move

### Frontend
Required checks:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

Future (not MVP):
- local e2e smoke test against Katana

## Docs Requirements
README must include:
- What this starter is
- Prerequisites
- 5-minute quickstart
- Contract/frontend architecture summary
- Common commands
- Troubleshooting (ports, Torii unavailable, wallet issues)

## Agent Enablement
- Repo includes `AGENTS.md` with skill references to existing local skill paths.
- Skills are referenced, not vendored.
- If a referenced local skill is missing, agent falls back gracefully.

## Milestones
1. M1: contracts scaffold + passing tests
2. M2: frontend scaffold + local read/write flow
3. M3: `scripts/dev.sh` and `scripts/check.sh` stabilized
4. M4: README completed
5. M5: announce as canonical and link migration guidance from legacy starters

## Acceptance Criteria
- Fresh clone to running local app in <= 10 minutes following README.
- `./scripts/check.sh` passes on clean environment with prerequisites.
- No tracked generated/build artifacts except explicitly documented exceptions.
- At least one internal engineer (besides author) validates quickstart end-to-end.

## Deferred (Post-MVP)
- richer starter variants (game loop, achievements, etc.)
- deployment automation for shared environments
- expanded CI matrix and e2e tests
