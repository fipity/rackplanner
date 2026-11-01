# Progress

## Phase 1 — rack editor core ✅ (2026-11-01)
- Monorepo: `packages/shared` (zod schemas + placement engine), `apps/server` (Fastify), `apps/web` (React/Vite/Tailwind).
- Placement engine: U/x/face occupancy, front+rear depth clash, half-U parts, partial-width snapping (left/centre/right/flush), shelf children (engine only), rack resize with removal report. 53 unit tests.
- Editor: SVG rack 1–32U, 19″/10″, U labels both rails, top-down toggle, depth presets, front/rear views, procedural faceplates, dnd-kit drag/drop with red ghost + tooltip, click-to-add, inspector (label, notes, colour, mounting, duplicate, delete), keyboard shortcuts, undo/redo (zundo), zoom/fit, dark/light/system theme, tablet layout.
- Starter catalog: 24 parts across 6 files, all `verified: false` pending Phase 2 research.
- Docker: multi-stage image (node:22-bookworm-slim, 369 MB), compose with healthcheck, `.env` port.

### Notes for later phases
- Image size: consider an alpine runtime in Phase 4 (better-sqlite3 has musl prebuilds).
- `/data` is owned by `node` (uid 1000) in the image; a host bind mount `./data` needs to be writable by uid 1000 once SQLite lands (Phase 3).
- Shelf placement UI (drop onto a shelf) is Phase 4; the engine and tests already support it.
