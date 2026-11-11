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

# Faceplate realism upgrade (4 phases, started 2026-11-10)

## Phase 1: component library, style presets, auto-generation, priority build ✅ (2026-11-11)
- Shared layout engine (`packages/shared/src/layout`): declarative front/rear/top `layout` per part (fractional regions; ports, bays, display, vents, LEDs, PSUs, fans, PCIe, label strips, cable bars, brushes…), switch-style zigzag numbering, grouping, PoE/uplink, per-port colours, memoised `resolveFace`, auto-generated layouts from ports/bays/category for every entry without one.
- Schema: `layout` (+ `layoutVerified`, `sources`), `powerInput`, `render.preset`, new port types (USB-C, HDMI, micro HDMI, DP, VGA, serial, SC, DC out). Design v2: `rack.frame`, `rack.glassDoor`, `placement.portColors`; v1 designs migrate on parse (client, import and server read).
- Web renderer: SVG `<symbol>` component library (RJ45 with LED pair and latch notch, SFP/QSFP cages, USB-A/C, HDMI, DP, D-sub, IEC C13/C14/C19/C20/C6/C8, AU/NEMA/Schuko/UK outlets, keystones, punch-downs, LC/SC, screws, cage holes), 15 style presets, bevels, rail shadows, lit/unlit LEDs toggle, LOD (low/mid/high by zoom), port tooltips, rear views of every device (front-mounted gear seen through the rack).
- Rack frames: open 2-post, 4-post, cabinet (+ glass door), generic 10" and DeskPi RackMate T1/T2 (dimensions from wiki.deskpi.com), EIA cage-nut holes, empty-U hints.
- Shelf plans ("Shelves" view): top-down footprint of each shelf, overhangs hatched. Shelf overhang now a warning (centred) instead of a blocked drop; too-tall and too-narrow warnings; power-source summary (outlets needed vs available, plug-pack warnings).
- Priority catalog: Pi 4 in official case, UCG-Ultra, USW-Lite-8-PoE, UNVR-Instant (front/rear/top, power inputs, sources); DeskPi shelves/panels/patch panels (DP-0031/0041/0056/0034/0086/0060/0043/0044/0032/0045/0051/0063/0073/0058/0042), 3D-printed Mauker mounts, PA-PDU6X and generic 10" AU boards, generic 10" punch-down panel. No DeskPi 8-port 0.5U panel exists (DP-0034 is 12-port 0.5U).
- Finding: UNVR-Instant (220 × 220 × 47 mm) is wider than the 212 mm RackMate shelves and deeper than their 200 mm tray; the example shows it with that warning.
- Examples (`examples/*.json`, built by `npm run examples`) seeded once via a `meta` table (migration 3): "My RackMate T1" and "Homelab 24U (example)".
- Images: `npm run screenshots` (Playwright + sharp + gifenc) writes docs/images (hero, build front/rear/shelves, 24U, light/dark, catalog, builder, GIF, device SVGs, social preview). Locally run with `~/.cache/rackplanner-research/bin/shots` (Node 22 server container + Playwright image with BASE_URL).
- Tests: 187 (layout engine, catalog layout bounds/overlap/port counts, migration, example seeding).

## Phase 2: rack frame detail, LOD, performance ✅ (2026-11-11)
- Most of the frame work landed with phase 1 (frames, cage-nut holes, empty-U hints, LOD, tooltips). This phase adds: LOD for home thumbnails (mid) and catalog thumbnails (by pixel size), frame memoised on rack + empty slots, print page and exports always full detail with an LED on/off (print style) option in the Export menu and print view.
- Measured with a fully populated 32U rack (31 × 48-port switches/servers/patch panels) in headless Chromium: dragging a device holds 60 fps (median and p95 frame 16.7–16.8 ms; one ~100 ms frame when the drag starts).
- Checked every frame style in light and dark mode.

## Phase 3: detailed catalog layouts ✅ (2026-11-11)
- `scripts/research/build_layouts.py` (idempotent) adds layouts and power inputs:
  - UniFi: 98 entries (rack gateways, switches, NVRs, UNAS, patch/brush/vented panels; desktop gateways and switches) generated from the cached techspecs data: port counts by speed, PoE class split per port group (PoE/PoE+/PoE++/PoE+++), WAN port, console/MGMT, LCM display, NVR/NAS bays, AC/RPS/dual PSU inputs. Positions follow each family's panel convention, so `layoutVerified: false` (all listed in UNVERIFIED.md). UXG-Pro skipped (spec port list disagrees with the catalog).
  - Dell R630/R730/R740: port list from the R740 technical guide (front iDRAC Direct USB, USB, VGA; rear 4-port NDC, iDRAC, VGA, serial, 2 × USB, PCIe risers, 2 PSUs); ports in the catalog updated to match.
  - Synology RS422+ (spec page: 2 × 1GbE, USB 3.2, console, upgrade slot, 3 fans) and RS822+ (page wouldn't load; estimated).
  - APC SMT1500RM2U/RMI2U/SMT2200RM2U layouts; new APC SMT750RM1U (1U, verified from APC's datasheet).
  - Generic 1U PDUs, patch (keystone/punch-down/angled/HD/2U/0.5U), brush, blank and vented panels.
- Engine: PoE+++ level.
