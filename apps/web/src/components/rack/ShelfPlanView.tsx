/**
 * Top-down plans of every shelf: the usable tray area with each device's
 * footprint (from its top layout), front edge at the bottom. Overhangs past
 * the side lips or the back of the tray are hatched red, so you can see how
 * devices physically fit side by side.
 */
import {
  displayName,
  formatURange,
  occupancyOf,
  partWidthMm,
  resolveFace,
  shelfGeometry,
  type Catalog,
  type Design,
  type Part,
  type PlacedPart,
} from '@rackplanner/shared';
import { memo } from 'react';
import { Elements, type DrawCtx } from '../faceplates/elements';
import { PRESETS, bezelId } from '../faceplates/presets';

interface Item {
  p: PlacedPart;
  part: Part;
  x: number;
  y: number;
  w: number;
  d: number;
  over: boolean;
}

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';

function ShelfPlan({ design, catalog, shelf, leds }: { design: Pick<Design, 'rack' | 'placements'>; catalog: Catalog; shelf: PlacedPart; leds: boolean }) {
  const geo = shelfGeometry(design.placements, shelf, catalog);
  const shelfPart = catalog.get(shelf.partId);
  if (!geo || !shelfPart) return null;
  const W = geo.usableWidthMm;
  const D = geo.usableDepthMm;
  const items: Item[] = design.placements
    .filter((p) => p.parentId === shelf.id)
    .map((p) => {
      const part = catalog.get(p.partId);
      const occ = part && occupancyOf(design.placements, p, catalog);
      if (!part || !occ) return null;
      const w = partWidthMm(part);
      const d = part.depthMm ?? Math.min(D, 120);
      const x = occ.x0 - geo.x0;
      // Devices sit flush with the front edge (bottom of the plan).
      const y = D - d;
      return { p, part, x, y, w, d, over: x < -0.01 || x + w > W + 0.01 || d > D + 0.01 };
    })
    .filter((i): i is Item => i !== null);

  const minX = Math.min(0, ...items.map((i) => i.x));
  const maxX = Math.max(W, ...items.map((i) => i.x + i.w));
  const minY = Math.min(0, ...items.map((i) => i.y));
  const pad = 16;
  const lip = 3;
  const vbX = minX - pad - lip;
  const vbY = minY - pad - 8;
  const vbW = maxX - minX + (pad + lip) * 2;
  const vbH = D - minY + pad * 2 + 22;
  const vented = /vent/i.test(shelfPart.name) || shelfPart.tags.includes('vented');
  const occ = occupancyOf(design.placements, shelf, catalog)!;

  return (
    <figure className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">
          {formatURange(occ.u0, occ.u1, design.rack)} · {displayName(shelf, shelfPart)}
        </span>
        <span className="text-xs text-zinc-500">
          {W} × {D} mm usable · {items.length} device{items.length === 1 ? '' : 's'}
        </span>
      </figcaption>
      <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="h-auto w-full" role="img" aria-label={`Top view of ${displayName(shelf, shelfPart)}`}>
        <defs>
          <pattern id="rp-over" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="4" fill="#ef4444" opacity="0.55" />
          </pattern>
        </defs>
        {/* Tray with side lips; front edge at the bottom. */}
        <rect x={0} y={0} width={W} height={D} rx={2} fill="url(#rp-shelf)" />
        {vented && <rect x={6} y={8} width={W - 12} height={D - 16} fill="url(#rp-shelf-slots)" />}
        <rect x={-lip} y={0} width={lip} height={D} fill="#5b636d" />
        <rect x={W} y={0} width={lip} height={D} fill="#5b636d" />
        <rect x={-lip} y={D - 1.5} width={W + lip * 2} height={3} rx={1} fill="#6b7480" />
        <text x={W / 2} y={D + 15} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.6} fontFamily={FONT} letterSpacing={2}>
          FRONT
        </text>
        <text x={W / 2} y={minY - 4} textAnchor="middle" fontSize={7} fill="currentColor" opacity={0.45} fontFamily={FONT} letterSpacing={2}>
          REAR
        </text>

        {items.map(({ p, part, x, y, w, d, over }) => {
          const face = resolveFace(part, 'top', w, d);
          const t = PRESETS[face.preset];
          const ctx: DrawCtx = { preset: face.preset, t, lod: 'high', leds, model: part.model };
          const full = displayName(p, part);
          const size = Math.max(4.2, Math.min(7, (w / Math.max(6, full.length)) * 1.7));
          const maxChars = Math.floor((w - 8) / (size * 0.6));
          const name = full.length > maxChars ? full.slice(0, Math.max(3, maxChars - 1)) + '…' : full;
          return (
            <g key={p.id}>
              <rect x={x + 1.2} y={y + 1.8} width={w} height={d} rx={Math.min(t.radius + 1, 6)} fill="#000" opacity={0.3} />
              <rect x={x} y={y} width={w} height={d} rx={Math.min(t.radius + 1, 6)} fill={`url(#${bezelId(face.preset)})`} stroke={t.edge} strokeWidth={0.6} />
              <g transform={`translate(${x} ${y})`}>
                <Elements elements={face.elements} ctx={ctx} />
              </g>
              {over && (
                <>
                  {x < 0 && <rect x={x} y={Math.max(y, 0)} width={-x} height={d} fill="url(#rp-over)" />}
                  {x + w > W && <rect x={W} y={Math.max(y, 0)} width={x + w - W} height={d} fill="url(#rp-over)" />}
                  {d > D && <rect x={x} y={y} width={w} height={-y} fill="url(#rp-over)" />}
                  <rect x={x} y={y} width={w} height={d} rx={2} fill="none" stroke="#ef4444" strokeWidth={1.2} strokeDasharray="4 2" />
                </>
              )}
              <rect x={x + w / 2 - (name.length * size * 0.3 + 4)} y={y + d - size * 2.9 - 4} width={name.length * size * 0.6 + 8} height={size * 2.7} rx={2} fill="rgba(15,23,42,0.78)" />
              <text x={x + w / 2} y={y + d - size * 1.9 - 4} textAnchor="middle" fontSize={size} fontWeight={600} fill="#f8fafc" fontFamily={FONT}>
                {name}
              </text>
              <text x={x + w / 2} y={y + d - size * 0.75 - 4} textAnchor="middle" fontSize={size * 0.8} fill="#cbd5e1" fontFamily={FONT}>
                {w} × {d} mm
              </text>
              <title>{`${full}: ${w} × ${d} mm${over ? ' (overhangs the shelf)' : ''}`}</title>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export const ShelfPlanView = memo(function ShelfPlanView({ design, catalog, leds = true }: { design: Pick<Design, 'rack' | 'placements'>; catalog: Catalog; leds?: boolean }) {
  const shelves = design.placements
    .filter((p) => p.parentId === undefined && catalog.get(p.partId)?.shelf)
    .sort((a, b) => b.bottomU - a.bottomU);
  if (!shelves.length) {
    return (
      <div className="m-auto max-w-sm p-6 text-center text-sm text-zinc-500">
        No shelves in this rack yet. Add a shelf and put desktop gear on it to see a top-down plan of how it fits.
      </div>
    );
  }
  return (
    <div data-shot="shelf-plans" className="grid w-full max-w-5xl gap-4 p-4 sm:grid-cols-2">
      {shelves.map((s) => (
        <ShelfPlan key={s.id} design={design} catalog={catalog} shelf={s} leds={leds} />
      ))}
    </div>
  );
});
