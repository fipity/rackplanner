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
- ~~Placement-level power override~~: done in Phase 3 as `measuredW` (inspector *Measured power*).
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

## Phase 4: custom builder, exports, visual tests ✅ (2026-11-11)
- Custom part builder: style preset picker, "Custom layout" region editor per face (type, count, x/w/y/h %, rows, PoE, counts-as), "Start from generated layout", live front + rear preview, warnings for port-count mismatches and overlapping regions. Fields the table doesn't edit (poePorts, grouping, colours…) survive edits.
- Exports: PNG/SVG/PDF always full detail; "Print style (LEDs off)" option. Export menu now opens towards the side with room (it opened off-screen at ~1400 px widths).
- `/_faceplates` gallery route; Playwright visual tests (`tests/visual`, 60 snapshots: 15 presets × front/rear × light/dark) plus port-tooltip and self-contained-SVG-export checks. Run with `~/.cache/rackplanner-research/bin/visual`.
- README: builder, exports, visual tests, social preview instructions. Docker image builds (265 MB) and seeds the examples.
- Tests: 190 unit/API + 62 Playwright.

## Rear cabling (2026-11-11)

- In the rear view, cable mode now offers the rear ports of front-mounted gear (and the front ports of rear-mounted gear in the front view), unless gear on the viewed face covers them. Start a cable on one side, switch views, and finish it on the other.
- Cable port indexes are unique per device across faces (front ports first, then rear, then top), so a front USB 1 and a rear USB 1 no longer share a key. No existing design or example cable was affected.
- Test: tests/visual/cables.spec.ts.
- Patch panels: the rear coupler / punch-down of each port is cable-able separately from its front jack. A rear patch region marked `portType: "none"` is a pass-through back; its ports carry the front port type (keystone, LC, SC) with the same index and `back: true`, and cable ends store `port.back: true`. The inspector lists "Keystone 3 (front)" and "Keystone 3 (rear)".

## Desktop app (2026-11-11)

- `desktop/`: Electron 45 shell that imports the bundled server in the main process (127.0.0.1, free port, data in the user's app-data folder) and shows the UI. Single instance; external links open in the browser; no Edit menu so Ctrl+Z/Y stay with the app.
- `desktop/build.sh [linux|win]` builds `RackPlanner-Setup-<v>.exe` (NSIS, per-user, unsigned) and `rackplanner_<v>_amd64.deb` in Docker (`electronuserland/builder:wine`).
- better-sqlite3 upgraded to 13.0.3 (Node-API prebuilds bundled for every OS, so no Electron rebuild or cross-compiling). npm 10 still tries node-gyp on it, so the build installs with `--ignore-scripts`.
- Verified: .deb installs and runs on a clean ubuntu:24.04 (Xvfb); the Windows build runs under Wine (server up, designs in %APPDATA%\RackPlanner\data). The NSIS installer itself wasn't exercised (silent install under Wine didn't complete).

## nbn HFC NTD (2026-11-15)

- New desktop part `arris-cm8200b-nbn-hfc`: the nbn HFC connection box (Arris CM8200B). Upright 132 × 44 × 132 mm (H × W × D), 0.95 kg, 2 × GbE (UNI-D1/UNI-D2), F-type coax in, 12 V DC plug-pack. Figures from a reseller copy of the Arris datasheet, so `verified: false`; rear port order is estimated.
- New `coax` port type and `f_type` connector (hex-nut F jack drawn in Defs.tsx), so a cable can run from the coax input.

## Turning shelf gear on its side; CM8200B restyled (2026-11-15)

- Any desktop part with a known width and height and no top-face layout can lie on its side (R, or Orientation in the inspector). The turned version is a derived catalog entry `<id>@side` (packages/shared/src/turn.ts, added to the client catalog map only), so turning just swaps the placement's partId; cables keep their port indexes. Faceplate draws the upright face rotated (clockwise from the front, anticlockwise from behind) and `portPositions` applies the same rotation. BOM rows and custom-part export use the upright id.
- Parts with a `top` layout (Pi case) can't turn, since their top-face ports would have nowhere sensible to go.
- Labels with `align: center | end` now centre or right-align their text in the label box.
- CM8200B redrawn from a product photo: black body, inner panel, nbn mark, captioned POWER / DOWNSTREAM / UPSTREAM / ONLINE LEDs, ARRIS / CM8200 (plain text, no logos); rear labels for CABLE, UNI-D1/2, RESET, 12V DC.
- Test: tests/visual/turn.spec.ts (turn, rotated rear port order, cable to a turned port, stand back up), packages/shared/src/turn.test.ts.

## Coax cable type (2026-11-15)

- New `coax` cable type ("Coax (F-type)", teal). Cables from a coax port are guessed as coax, and SC duplex ports now guess fibre (they guessed copper before). The parts list names them as coax leads.

## Coax patch panels (2026-11-15)

- New `generic-coax-panel-12-f-1u` (19") and `generic-coax-panel-6-f-10in` (10"): F-type through-couplers, so wall or antenna coax lands on the rear and a short lead runs from the front to a modem or the nbn HFC NTD. Generic, unverified.
- Engine: a rear region with `portType: "none"` is a pass-through back for any connector with a back port type (now including `f_type` → coax), not only the patch family, so the NTD's F jack keeps its "Coax 1" name.
- No wall socket: every placement sits in a rack, so a wall plate would need an off-rack area first.
- Test: tests/visual/coax.spec.ts.

## Other nbn connection boxes (2026-11-15)

All white, desktop, `verified: false`, `layoutVerified: false`; tests/visual/nbn.spec.ts.

- `nokia-xs-010x-q-nbn-fttp`: the 1-port FTTP box (XGS-PON). 135 × 135 × 30 mm, 12 V 1 A, < 8.6 W from Nokia's datasheet; SC/APC in (as `sc_duplex`, the only SC type), 1 × 10G RJ45. Weight null (Nokia's datasheet 0.366 kg vs quick reference guide 0.285 kg). Port edge order from Nokia's photo; light names from nbn's 1-port page.
- `netcomm-ndd-0300-nbn-fttc`: FTTC connection device. 166 × 118 × 44 mm from retailer listings; 2U on a shelf (44 mm doesn't fit 1U). C6 mains inlet, WALL SOCKET (phone line, drawn but not a port), RESET, GATEWAY (RJ45); LAN / DSL / Connection / Power lights on top. From nbn's FTTC setup guide.
- `nbn-fixed-wireless-ntd`: indoor Fixed Wireless box, modelled lying on its back with the port edge to the rear. Face ≈ 220 × 127 mm (Internode guide; nbn says the current box is similar); thickness unknown, so 2U and no heightMm (can't be turned). 4 × UNI-D; antenna and power lead under a cover. From nbn's 2024 Fixed Wireless user guide.

## Turn on drop (2026-11-15)

- `resolveDrop`: when desktop gear doesn't fit a shelf in its current orientation but does in the other (`<id>@side` or back upright), the candidate takes the other partId. The ghost shows it turned, the drag tooltip adds "on its side" / "upright", and the drop toasts it. Moving an existing placement now carries `partId` through.
- Tests: turn.test.ts (drop upright, drop turned, stand back up), tests/visual/drop-turn.spec.ts (real drag from the catalog).

## Shelf plan of turned gear (2026-11-15)

- ShelfPlanView draws a device on its side as its plain left side panel (body colour, thin front/rear panel edges) instead of the generated lid with slot vents and model name; the hover title adds "on its side". Checked in tests/visual/drop-turn.spec.ts.

## Phone port and simplex SC (2026-11-15)

- New `rj11` port type ("RJ11 (phone)") and `rj11` connector (narrow 4-contact jack drawn in Defs.tsx), plus a `phone` cable type ("Phone (RJ11)", stone grey) guessed whenever one end is RJ11. The FTTC box's WALL SOCKET is now a real RJ11 port, so the phone line can run to it (e.g. from the back of a keystone).
- New `sc_simplex` port type and connector (one SC adapter, half the width of SC duplex; patch family, pass-through backs supported). The Nokia FTTP box's fibre input uses it and is drawn green (APC).
- `migrateDesignData` now also renames ports on parts whose port type was corrected after a release (`PORT_RENAMES` in schemas.ts): cables saved against the Nokia's `sc_duplex 1` (v0.3.0) load as `sc_simplex 1`.
- Coax patch panel numbers: no change needed. They draw at high zoom like every other panel's; at normal zoom (mid detail) no panel shows numbers.
- Tests: cables.test.ts (phone and simplex guesses), schemas.test.ts (Nokia port rename), tests/visual/nbn.spec.ts (SC simplex port, FTTC phone lead to a keystone back).

## Wall area beside the rack (2026-11-15)

- Design format: `rack.wall` (optional boolean) shows the wall; a placement with `wall: true` is on it. `bottomU` is its height on the wall (same U grid as the rack, so the wall is as tall as the rack) and `xMm` is the distance out from the rack's side, so widening the wall never moves anything. `mounting` is ignored. No schema version bump: both fields are optional.
- Engine (placement.ts): wall occupancies carry `wall: true` and both faces; `collides` never pairs wall with rack. `checkPlacement` takes desktop and `wall` form-factor parts on the wall only while the wall is on (bounds 0..`WALL_MAX_MM`); `wall` parts can't go in the rack or on a shelf. `resolveDrop({ wall: true })`, `findWallSlot`, `wallWidthMm` (auto: 400 mm minimum, grows to fit with 120 mm spare, 50 mm steps). `applyRackChange` leaves wall x alone; turning the wall off goes through the usual removal confirm. Stats: wall gear uses no rack U, isn't "desktop gear not on a shelf", and isn't checked against rack depth.
- Drawing (web): the wall is at negative SVG x in the front view and past the rack's right edge in the rear view (`wallArea`, `wallXToSvg`, `drawingExtent` in geometry.ts), so rack coordinates are unchanged; the viewBox widens. `WallArea.tsx` draws paint, a skirting board and dashed marks every 5U. A wall device shows the face with its ports in both views (`wallFace`: rear for nbn boxes, front for wall plates). New CSS vars `--rack-wall`, `--rack-wall-edge`, `--rack-skirting` (also in the export palette).
- UI: toolbar wall toggle (BrickWall icon); drag onto the wall (pointer side decides wall vs rack; tooltip "On the wall · N mm from the rack"); inspector **Where: In the rack / On the wall** for desktop gear; catalog click on a wall part turns the wall on and adds it; duplicate keeps wall gear on the wall.
- New `wall` form factor and `catalog/wall.json` (6 generic, unverified parts, category `wall-outlet`, passive): 1 × and 2 × RJ45 data plates, TV/coax F-type plate, phone socket (RJ11/RJ12), fibre wall outlet (SC/APC, green), double AU power point (counts as 2 mains sockets). Custom part builder has a Wall option.
- Note for tests: dnd-kit swallows clicks for 50 ms after a drop; wait before clicking after a drag.
- Tests: placement.test.ts "wall area"; tests/visual/wall.spec.ts.

## Smaller polish (2026-11-15)

- Screen-reader names: a device is announced by its label or product name, plus ", on its side" / ", on the wall" (`placementA11yName` in RackCanvas.tsx), never its internal id.
- Coloured ports: any port region's `colors` already worked (not just patch panels). The FTTC box's GATEWAY is yellow; the Nokia's SC/APC green.
- The FTTP, FTTC and Fixed Wireless boxes have a small "nbn FTTP" / "nbn FTTC" / "nbn FIXED WIRELESS" label on the front edge (the planner's own, noted in their layout notes).
- Release notes: the release workflow puts `docs/releases/<tag>.md` (hand-written "What's new") above the standard install text when it exists. Written for v0.3.0 (to paste into the existing release) and v0.4.0 (the next release).

## v0.5.0 batch (2026-11-16)

- **Templates:** `scripts/build-examples.ts` also builds `examples/templates/<id>.json` (`{id, name, description, design}`): 10″ mini rack, nbn + UniFi starter (RackMate T1 with the nbn FTTP box, fibre outlet and power point on the wall), Homelab 12U (19″), Network cabinet 9U. Checked like the examples; only "no power data" / plug-pack info notes remain. `GET /api/templates` (apps/server/src/templates.ts) reads them at startup; not seeded as designs. New design dialog: **Start from: Empty rack / Template** with thumbnails; creating imports the template (fresh id). Docker and the desktop build already copy the whole `examples/` folder.
- **Read-only share links:** migration 4 adds `shares (token, design_id UNIQUE → designs ON DELETE CASCADE)`. `GET/POST/DELETE /api/designs/:id/share`, public `GET /api/shared/:token` → `{design, parts}` (upright parts the design uses, custom ones included; `no-store`, `noindex`). Basic auth now skips `isPublicPath` (auth.ts): health, `GET /api/shared/*`, `GET /s/<token>`, `/assets/*`, root static files. Web: Share button + dialog in the editor header (warns that links only work locally on localhost / desktop app); `/s/:token` route → SharedPage, which reuses `PrintSheet` (split out of PrintPage) with PDF / JSON downloads and never calls `/api/catalog` (App skips the catalog load on that route). Token = 18 random bytes base64url.
- **Heat and airflow:** `stats.heat` (BTU/h = W × 3.412 from typical/max draw, PoE delivered elsewhere excluded) in Stats and print. `Part.airflow` and `PlacedPart.airflow` (`front-to-back | back-to-front | side-to-side | passive`; packages/shared/src/airflow.ts). Servers and UPSs default to front-to-back; everything else unknown. Rear-rail mounting reverses it in rack terms. `airflow-mixed` warning names the smaller group. Inspector **Airflow** select for active, non-wall gear.
- **DeskPi RackMate rails:** `RACK_FRAME_INFO[...].holes: 'tapped'` for T1/T2: round #10-32 holes (4.83 mm) at EIA spacing instead of square cage-nut holes. DeskPi's wiki doesn't state the hole type; rackify.net's T0/T1/T2 comparison, Computing For Geeks and GeeekPi listings say tapped #10-32 (one blog says M5 cage nuts; outvoted). Spacing was already EIA-310.
- **Catalog verified against manufacturer sources:** Cisco CBS350-24T-4G / 24P-4G / 24T-4X / 48P-4G (Cisco datasheet; 24P max W 34.4 filled in), Netgear GS728TP (v3 page; 3.78 kg), GS752TP (v2 page; 310 mm, 4.93 kg), GS752TPP (v3 page), APC SMT1500RM2U (Schneider data sheet: 457 mm, 28.64 kg) and SMT1500RMI2U (Schneider sheet via Mouser). Netgear max consumption includes PoE, so max W stays blank. SMT2200RM2U capacity corrected to 1920 W (1980 W is max configurable) but left unverified. apc.com / se.com block scripted fetches (403); the SMT1500RM2U sheet came from a distributor's copy (cached in ~/.cache/rackplanner-research/apc).
- Tests: 217 unit/API (shares, templates, heat/airflow) + 73 Playwright (tests/visual/v05.spec.ts: template flow, share → view → revoke, airflow warning).

## Wall power points, turning to fit, right-drag panning (2026-11-16, after v0.5.0)

- **Wall power points** (catalog/wall.json v2, generic, unverified): single AU/NZ (portrait, 3U), double AU/NZ with USB-A + USB-C, double UK (BS 1363), double EU Schuko, US duplex NEMA 5-15R (portrait). All `category: wall-outlet`, tagged "power point"; their sockets count as mains sockets in the power-sources check.
- **Turning to fit** (placement.ts `orientationsOf` / `pickOrientation`): shelf drops, loose-in-rack drops, wall drops, `findShelfSlot` (click-to-add, duplicate, wall → rack), `findWallSlot` and `findFreeSlot` all try both orientations. Order: an orientation that fits cleanly (valid and not taller than `shelfHeadroomMm`), else the valid one taking fewest U, else the first attempt. So the CM8200B (132 mm tall at 3U, about 129 mm of room on a shelf) lies down at 1U. Lying down it's 44 mm, which still overflows a 1U shelf's ~40 mm by ~4 mm, so neither orientation is "clean" and the fewer-U rule decides. `tooTallForShelf` is shared with the stats warning. Wall/rack moves carry `partId`; toasts say "Laid on its side to fit there / on the wall".
- **Right-drag panning:** RackCanvas captures the pointer on a right-button mousedown and scrolls the container; the canvas suppresses the browser context menu (on Linux it opens on mousedown). Listed in the shortcuts panel and README.
- Tests: 221 unit (turn.test.ts: too tall to stand, click-to-add, wall, free slot) + 76 Playwright (tests/visual/fit-pan.spec.ts).
