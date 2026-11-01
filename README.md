# RackPlanner

A self-hosted visual designer for home-lab server racks. Pick a 19″ or 10″ rack (1–32U), drag hardware from a parts catalog into it, and move things around. Placement snaps to whole U and collisions are blocked, with an explanation.

> **Status: Phase 1 of 4.** Rack rendering, drag and drop with collision detection, front/rear views, undo/redo, and a small starter catalog. Coming next: the researched catalog with filters and a custom part builder (Phase 2), saved designs with a stats panel (Phase 3), and shelves, partial-width UI and exports (Phase 4). **Designs are not saved yet in Phase 1.**

## Run it (Docker)

```bash
git clone https://github.com/fipity/rackplanner.git
cd rackplanner
cp .env.example .env        # optional: change RACKPLANNER_PORT, enable basic auth
docker compose up -d --build
```

Open `http://<server-ip>:8085`. Health check: `GET /api/health`.

Update: `git pull && docker compose up -d --build`.

## Using the editor

| Action | How |
|---|---|
| Add a part | Drag it from the catalog into the rack, or click it to drop it in the first free slot |
| Move | Drag a placed part (red = blocked, with the reason shown next to the cursor) |
| Move by 1U | <kbd>↑</kbd> / <kbd>↓</kbd> |
| Delete / duplicate | <kbd>Del</kbd> / <kbd>Ctrl</kbd>+<kbd>D</kbd> |
| Undo / redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> |
| Zoom | <kbd>+</kbd> / <kbd>-</kbd>, <kbd>0</kbd> to fit, or <kbd>Ctrl</kbd>+scroll |

Changing the rack width, height or depth so that some parts no longer fit asks for confirmation and lists what would be removed. You can undo afterwards.

## Catalog

Parts live in versioned JSON files in [`catalog/`](catalog/). They're validated against a shared zod schema on every server start and every build:

```bash
npm run validate:catalog     # fails loudly, listing every problem
npm run catalog:schema       # regenerate catalog/schema.json (editor autocompletion)
```

Unknown specs are `null` rather than guessed, and parts that haven't been checked against a manufacturer spec sheet have `"verified": false` (see [`catalog/UNVERIFIED.md`](catalog/UNVERIFIED.md)).

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
