# RackPlanner

A self-hosted visual designer for home-lab server racks. Pick a 19″ or 10″ rack (1–32U), drag hardware from a parts catalog into it, and move things around. Placement snaps to whole U and collisions are blocked, with an explanation.

> **Status: Phase 3 of 4.** Multiple saved designs with autosave, a live stats panel with warnings, measured power per device, a researched catalog of ~300 parts, and a custom part builder. Coming next in Phase 4: placing gear on shelves, partial-width placement UI, exports (PNG/SVG/PDF/CSV/JSON), import and final packaging.

## Run it (Docker)

```bash
git clone https://github.com/fipity/rackplanner.git
cd rackplanner
cp .env.example .env        # optional: change RACKPLANNER_PORT, PUID/PGID, enable basic auth
docker compose up -d --build
```

Open `http://<server-ip>:8085`. Health check: `GET /api/health`.

Update: `git pull && docker compose up -d --build`.

## Designs

The home screen lists your designs with live thumbnails. Create a new one by picking a width, a height preset and an optional depth. Rename, duplicate or delete designs from each card's menu. Changes save automatically as you work. The header shows *Saved*, *Saving…* or *Offline, retrying*. If the same design is saved from another tab or device, you're asked whether to keep your version or load the latest one.

## Stats & warnings

The **Stats** tab, next to the device details, updates live:

- **Space:** U used and free (a U counts as used if anything occupies it, front or rear), plus device and passive counts.
- **Power:** typical and max draw. A device's **measured power** (set in the inspector, e.g. from a smart plug or PDU reading) replaces catalog figures. When a part only publishes one figure, it's used for both. Catalog max power excludes PoE output, so the **expected PoE load** you enter is added on top before comparing against total **UPS capacity**.
- **PoE:** total PoE budget of the switches and gateways in the rack, compared with your expected PoE load.
- **Weight** and **port counts** by type.
- **Warnings:** devices deeper than the rack, gear deeper than its shelf, desktop gear not on a shelf, collisions or bad widths (e.g. after an import), parts missing from the catalog, UPS or PoE overload, and devices with no power data. Click a warning to select the device.

## Using the editor

| Action | How |
|---|---|
| Add a part | Drag it from the catalog into the rack, or click it to drop it in the first free slot |
| Move | Drag a placed part (red = blocked, with the reason shown next to the cursor) |
| Move by 1U | <kbd>↑</kbd> / <kbd>↓</kbd> |
| Delete / duplicate | <kbd>Del</kbd> / <kbd>Ctrl</kbd>+<kbd>D</kbd> |
| Undo / redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> |
| Zoom | <kbd>+</kbd> / <kbd>-</kbd>, <kbd>0</kbd> to fit, or <kbd>Ctrl</kbd>+scroll |
| Measured power | Select a device, enter watts in *Measured power* |

Changing the rack width, height or depth so that some parts no longer fit asks for confirmation and lists what would be removed. You can undo afterwards.

## Catalog

~300 parts in versioned JSON files under [`catalog/`](catalog/):

| File | Contents |
|---|---|
| `unifi.json` | Full rack-relevant UniFi lineup: gateways, switches, UNAS/UNVR/ENVR, UPS/PDU/RPS, OCD panels, shelves, rack-mount kits, plus desktop gear for shelves |
| `mikrotik.json` | CRS/CSS switches, CCR/RB routers, RDS storage |
| `switching.json` | TP-Link Omada, Netgear, Cisco, legacy Ubiquiti EdgeMax/UISP |
| `storage.json` | Synology RackStation |
| `servers.json` | Dell PowerEdge, HPE ProLiant, Supermicro chassis, generic DIY cases |
| `power.json` | APC, CyberPower, Eaton UPS units and generic PDUs |
| `patch-panels.json` | Generic 19" patch panels, blanks, brush panels, cable managers, shelves, drawers |
| `mini-rack.json` | 10" ecosystem: DeskPi RackMate shelves/panels, Pi and mini-PC mounts, 10" PDUs |
| `desktop.json` | Mini PCs, SBCs, modems/ONTs that sit on shelves |

**What `verified` means:** `true` means every number in the part comes from the manufacturer's own spec page or datasheet, linked in `sourceUrl`. `false` means the figures come from resellers, rack-vendor guides or typical values for generic items. Unknown values are `null`, never guessed. [`catalog/UNVERIFIED.md`](catalog/UNVERIFIED.md) lists every unverified part and every missing value.

On first start the catalog is loaded into the SQLite database in `./data`. When a file's contents change, it's re-applied on the next start. Parts removed from a file are retired: hidden from the catalog but kept, so existing designs still render.

### Adding or editing catalog parts

1. Edit or add a JSON file in `catalog/`. Your editor can autocomplete against `catalog/schema.json`. Bump the file's `version`.
2. Validate it: `npm run validate:catalog` (or `./dev.sh run validate:catalog`). This lists every problem and exits non-zero, and the Docker build runs it too.
3. Deploy: `docker compose up -d --build`. To skip rebuilding, uncomment the `./catalog` volume in `docker-compose.yml`, then run `curl -X POST http://localhost:8085/api/catalog/reload` after editing.

### Custom parts

Use the **+** button in the catalog to build your own device, with a live faceplate preview. The **copy** icon on any catalog part (or *Customise a copy* in the inspector) starts from an existing part. Custom parts are stored in the database, appear under *My custom parts*, and are never overwritten by catalog updates.

### Regenerating the researched catalog

`scripts/research/` has the scripts that built the catalog. They cache spec pages in `~/.cache/rackplanner-research`:

```bash
python3 scripts/research/fetch_unifi.py      # techspecs.ui.com (UniFi + EdgeMax/UISP)
python3 scripts/research/build_unifi.py      # -> catalog/unifi.json
python3 scripts/research/fetch_mikrotik.py && python3 scripts/research/build_mikrotik.py
python3 scripts/research/build_misc.py       # servers, storage, switching, power, passive, 10", desktop
python3 scripts/research/gen_unverified.py   # -> catalog/UNVERIFIED.md
```

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | Health check (used by Docker) |
| GET | `/api/catalog` | All parts, retired ids, catalog files |
| POST | `/api/catalog/reload` | Re-read `catalog/*.json` |
| POST / PUT / DELETE | `/api/parts[/:id]` | Custom parts |
| GET / POST | `/api/designs` | List / create (`{name, rack}` or import `{design}`) |
| GET / PUT / DELETE | `/api/designs/:id` | Load / save (`{design, revision, force?}`, 409 on conflict) / delete |
| POST | `/api/designs/:id/duplicate` | Copy a design |

## Development

There's no Node on the host? `./dev.sh` runs npm inside a `node:22` container:

```bash
./dev.sh install
./dev.sh test               # vitest: placement engine + schema + catalog files
./dev.sh run typecheck
./dev.sh run dev            # API on :8085, Vite on :5173 (proxying /api)
```

Layout:

```
packages/shared   zod schemas, placement engine (collision, snapping, resize), shared by web + server
apps/server       Fastify API + static hosting of the built web app
apps/web          React + Vite + Tailwind editor (SVG rendering, dnd-kit, zustand + zundo)
catalog/          parts catalog JSON seed files
```

## Licence

MIT
