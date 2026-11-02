# Progress

## Phase 1 — rack editor core ✅ (2026-11-01)
- Monorepo: `packages/shared` (zod schemas + placement engine), `apps/server` (Fastify), `apps/web` (React/Vite/Tailwind).
- Placement engine: U/x/face occupancy, front+rear depth clash, half-U parts, partial-width snapping (left/centre/right/flush), shelf children (engine only), rack resize with removal report. 53 unit tests.
- Editor: SVG rack 1–32U, 19″/10″, U labels both rails, top-down toggle, depth presets, front/rear views, procedural faceplates, dnd-kit drag/drop with red ghost + tooltip, click-to-add, inspector (label, notes, colour, mounting, duplicate, delete), keyboard shortcuts, undo/redo (zundo), zoom/fit, dark/light/system theme, tablet layout.
- Starter catalog: 24 parts across 6 files, all `verified: false` pending Phase 2 research.
- Docker: multi-stage image (node:22-bookworm-slim, 369 MB), compose with healthcheck, `.env` port.

## Phase 2 — catalog, filters, custom parts ✅ (2026-11-02)
- Catalog researched: 298 parts in 9 files (173 verified against manufacturer pages, 125 unverified with reasons in catalog/UNVERIFIED.md).
  - UniFi: 123 parts scraped from techspecs.ui.com structured data (gateways, all switch lines incl. ECS/Pro XG/Pro Max/Pro HD, UNAS/UNVR/ENVR, UPS/PDU/RPS, OCD panels, shelves, rack kits, desktop gear).
  - MikroTik 29 (mikrotik.com), Synology 12 (synology.com), TP-Link 4 (official datasheets), EdgeMax/UISP 13 (techspecs.ui.com).
  - Netgear/Cisco/servers/UPS from reseller & rack-vendor data (verified: false); generic passive and 10" gear with typical sizes.
- Research scripts in scripts/research/ (cache in ~/.cache/rackplanner-research).
- SQLite (better-sqlite3 + Drizzle): parts + catalog_files tables, PRAGMA user_version migrations, hash-based reseeding, retiring removed parts.
- API: GET /api/catalog, POST /api/catalog/reload, POST/PUT/DELETE /api/parts (custom only).
- UI: filter panel (brand, category, height, PoE, rack width, legacy, custom-only), custom parts group, custom part builder with live preview + shared zod validation, edit/delete/customise-copy actions.
- Docker: entrypoint fixes ./data ownership via PUID/PGID then drops to that user (setpriv).
- Tests: 73 (placement, schema, catalog files, catalog filter, server API with in-memory SQLite).

### Notes for later phases
- QNAP rack NAS not yet in the catalog (their spec pages need a browser); add in Phase 4 or via custom parts.
- Placement-level power override would help servers whose draw is config-dependent (catalog power is null).
- Static files: @fastify/static with wildcard:false indexes files at startup (fine in Docker); add cache headers in Phase 4.
- Image size: consider an alpine runtime in Phase 4 (better-sqlite3 has musl prebuilds).
- `/data` is owned by `node` (uid 1000) in the image; a host bind mount `./data` needs to be writable by uid 1000 once SQLite lands (Phase 3).
- Shelf placement UI (drop onto a shelf) is Phase 4; the engine and tests already support it.
