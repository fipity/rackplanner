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

## Phase 3 — persistence, designs, stats ✅ (2026-11-02)
- Catalog: + UGREEN NASync (DXP2800, DXP4800 Plus, DXP6800 Pro, DXP8800 Plus, DXP480T Plus, DH4300 Plus, DH2300) and Raspberry Pi 4 (bare / official case); all verified: false (UGREEN spec tables are client-rendered and rate-limited). 307 parts.
- Shared: PlacedPart.measuredW, createDesign(), computeStats() (U used, power typical/max/measured/estimated/unknown, UPS capacity, PoE budget vs expected load, weight, ports, warnings).
- Server: designs table (migration 2), CRUD + duplicate + import, revision-based optimistic concurrency (409 + force).
- Web: history router (/ and /d/:id), home screen with live thumbnails (rename/duplicate/delete), new design dialog, debounced autosave with retry/backoff, keepalive save on unload, conflict dialog, editor header (back, inline name, save status), tabbed right panel with Stats, measured power input, tablet stats overlay.
- Tests: 89 (stats engine, designs API).

## Phase 4 — shelves, partial width, exports, packaging ✅ (2026-11-02)
- Shared: shelf drop targeting (desktop gear near a shelf top snaps onto it, flush with siblings), alignment helpers, export/import format carrying custom parts, BOM + CSV (escaping, formula-injection guard).
- Web: drag onto shelves (shelf moves keep children in sync), Left/Centre/Right alignment, Export menu (PNG/SVG front/rear/both, PDF views + parts list + summary, CSV, JSON), printable view (/d/:id/print), JSON import and backup download on home.
- Server: /api/backup (SQLite online backup), imported custom-* ids preserved, cache headers (index no-cache, hashed assets immutable), fast shutdown.
- Docker: alpine runtime, server bundled with esbuild (only better-sqlite3 external), npm removed from runtime: 409 MB -> 264 MB (node binary is 124 MB of that). su-exec entrypoint with PUID/PGID. better-sqlite3 musl arm64 prebuild confirmed; toolchain fallback in deps stage. Not cross-built on this host (no binfmt/QEMU installed).
- README: Ubuntu install, config, updating, backup/restore, ARM, editor, designs, stats, exports, catalog, API.
- Tests: 106 unit/API tests; Playwright flows for every phase pass against the production image.

## Post-phase: cables + shelf fix (2026-11-02)
- Shelves: items now stand on the shelf's tray (they start in the shelf's own U, drawn lifted by the tray thickness) instead of floating one U above it; a shelf never collides with its own contents. Click-to-add and duplicate put desktop gear onto a shelf with room. Saved designs are re-synced on load.
- Cables: Design.cables (backward compatible, defaults to []), port-to-port or port-to-device, type/colour/label/length, suggested standard lengths. Faceplate port layout refactored into a pure portPositions() so cable ends land on drawn ports. Cable mode (C), cable inspector, per-device cable list, stats, warnings (shared ports, missing ports/devices), BOM shopping-list lines, exports/print/thumbnails.
- Tests: 114.

### Possible follow-ups
- QNAP rack NAS added after Phase 4: 14 models from qnap.com spec pages (TS-h1886XU-RP R2 page wouldn't load, so it's not included).
- Placement-level power override would help servers whose draw is config-dependent (catalog power is null).
- Static files: @fastify/static with wildcard:false indexes files at startup (fine in Docker); add cache headers in Phase 4.
- Image size: consider an alpine runtime in Phase 4 (better-sqlite3 has musl prebuilds).
- `/data` is owned by `node` (uid 1000) in the image; a host bind mount `./data` needs to be writable by uid 1000 once SQLite lands (Phase 3).
- Shelf placement UI (drop onto a shelf) is Phase 4; the engine and tests already support it.
