/**
 * Top-down plans of every shelf: the usable tray area with each device's
 * footprint (from its top layout), front edge at the bottom. Overhangs past
 * the side lips or the back of the tray are hatched red, so you can see how
 * devices physically fit side by side. Gear laid on its side shows its
 * plain side panel rather than its lid. A bar along one edge marks each
 * device's faceplate (front or rear of the rack).
 *
 * In the editor (PlanCanvas) devices can be selected and dragged along a
 * shelf or to another one; this component only draws: the selection, and a
 * drag preview passed in as `drag`.
 */
import {
  displayName,
  facingOf,
  isReversed,
  formatURange,
  occupancyOf,
  partWidthMm,
  resolveFace,
  shelfGeometry,
  uprightPart,
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

/** A device being dragged in the shelf plans: where it would land, and whether it can. */
export interface PlanDrag {
  placementId: string;
  /** Shelf under the pointer (null: not over a shelf, so dropping does nothing). */
  shelfId: string | null;
  xMm: number;
  ok: boolean;
}

interface PlanProps {
  design: Pick<Design, 'rack' | 'placements'>;
  catalog: Catalog;
  leds?: boolean;
  selectedIds?: readonly string[];
  drag?: PlanDrag | null;
}

function ShelfPlan({ design, catalog, shelf, leds, selectedIds = [], drag }: Omit<PlanProps, 'leds'> & { shelf: PlacedPart; leds: boolean }) {
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
  // Drag preview: the dragged device drawn where it would land on this shelf.
  const dragged = drag ? design.placements.find((p) => p.id === drag.placementId) : undefined;
  const draggedPart = dragged && catalog.get(dragged.partId);
  const ghost: Item | null =
    drag && drag.shelfId === shelf.id && dragged && draggedPart
      ? { p: dragged, part: draggedPart, x: drag.xMm, y: D - (draggedPart.depthMm ?? Math.min(D, 120)), w: partWidthMm(draggedPart), d: draggedPart.depthMm ?? Math.min(D, 120), over: false }
      : null;

  const minX = Math.min(0, ...items.map((i) => i.x));
  const maxX = Math.max(W, ...items.map((i) => i.x + i.w));
  const minY = Math.min(0, ...items.map((i) => i.y));
  const pad = 16;
  const lip = 3;
  const vbX = minX - pad - lip;
  const vbY = minY - pad - 12;
  const vbW = maxX - minX + (pad + lip) * 2;
  const vbH = D - minY + pad * 2 + 26;
  const vented = /vent/i.test(shelfPart.name) || shelfPart.tags.includes('vented');
  const occ = occupancyOf(design.placements, shelf, catalog)!;

  const selected = selectedIds.includes(shelf.id);
  return (
    <figure
      data-plan-shelf={shelf.id}
      className={`rounded-xl border bg-white p-3 shadow-sm dark:bg-zinc-900 ${selected ? 'border-blue-500 ring-2 ring-blue-500/60' : 'border-zinc-200 dark:border-zinc-800'}`}
    >
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">
          {formatURange(occ.u0, occ.u1, design.rack)} · {displayName(shelf, shelfPart)}
        </span>
        <span className="text-xs text-zinc-500">
          {W} × {D} mm usable · {items.length} device{items.length === 1 ? '' : 's'}
        </span>
      </figcaption>
      <svg data-shelf-svg={shelf.id} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="h-auto w-full" role="img" aria-label={`Top view of ${displayName(shelf, shelfPart)}`}>
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
        <text x={W / 2} y={D + 18} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.6} fontFamily={FONT} letterSpacing={2}>
          FRONT
        </text>
        <text x={W / 2} y={minY - 10} textAnchor="middle" fontSize={7} fill="currentColor" opacity={0.45} fontFamily={FONT} letterSpacing={2}>
          REAR
        </text>

        {items.map(({ p, part, x, y, w, d, over }) => {
          // On its side, the top is the device's left side: a plain panel, no lid detail.
          const onSide = uprightPart(part) !== undefined;
          const lid = resolveFace(part, 'top', w, d);
          const face = onSide ? { ...lid, elements: [] } : lid;
          const t = PRESETS[face.preset];
          const ctx: DrawCtx = { preset: face.preset, t, lod: 'high', leds, model: part.model };
          const full = displayName(p, part);
          const size = Math.max(4.2, Math.min(7, (w / Math.max(6, full.length)) * 1.7));
          const maxChars = Math.floor((w - 8) / (size * 0.6));
          const name = full.length > maxChars ? full.slice(0, Math.max(3, maxChars - 1)) + '…' : full;
          const facing = facingOf(design.placements, p);
          const reversed = isReversed(design.placements, p);
          const isSel = selectedIds.includes(p.id);
          const isDragged = drag?.placementId === p.id;
          return (
            <g
              key={p.id}
              data-plan-item={p.id}
              data-pid={p.id}
              role="button"
              aria-label={`${full}${facing === 'rear' ? ', facing the rear' : ''}`}
              aria-pressed={isSel}
              opacity={isDragged ? 0.35 : 1}
              className="cursor-grab outline-none"
            >
              <rect x={x + 1.2} y={y + 1.8} width={w} height={d} rx={Math.min(t.radius + 1, 6)} fill="#000" opacity={0.3} />
              <rect x={x} y={y} width={w} height={d} rx={Math.min(t.radius + 1, 6)} fill={`url(#${bezelId(face.preset)})`} stroke={t.edge} strokeWidth={0.6} />
              <g transform={`translate(${x} ${y})`}>
                <Elements elements={face.elements} ctx={ctx} />
              </g>
              {onSide && (
                // Edges of the front and rear panels, seen edge-on.
                <g fill={t.edge} opacity={0.9}>
                  <rect x={x + 0.6} y={y + d - 2.2} width={w - 1.2} height={1.6} rx={0.6} />
                  <rect x={x + 0.6} y={y + 0.6} width={w - 1.2} height={1.6} rx={0.6} />
                </g>
              )}
              {over && (
                <>
                  {x < 0 && <rect x={x} y={Math.max(y, 0)} width={-x} height={d} fill="url(#rp-over)" />}
                  {x + w > W && <rect x={W} y={Math.max(y, 0)} width={x + w - W} height={d} fill="url(#rp-over)" />}
                  {d > D && <rect x={x} y={y} width={w} height={-y} fill="url(#rp-over)" />}
                  <rect x={x} y={y} width={w} height={d} rx={2} fill="none" stroke="#ef4444" strokeWidth={1.2} strokeDasharray="4 2" />
                </>
              )}
              {/* Faceplate edge: a bar along the side the ports face (bottom = rack front). */}
              <FacingMark x={x} y={y} w={w} d={d} facing={facing} reversed={reversed} />
              {isSel && <rect x={x - 1.5} y={y - 1.5} width={w + 3} height={d + 3} rx={3} fill="none" stroke="#3b82f6" strokeWidth={1.6} pointerEvents="none" />}
              <rect x={x + w / 2 - (name.length * size * 0.3 + 4)} y={y + d - size * 2.9 - 4} width={name.length * size * 0.6 + 8} height={size * 2.7} rx={2} fill="rgba(15,23,42,0.78)" />
              <text x={x + w / 2} y={y + d - size * 1.9 - 4} textAnchor="middle" fontSize={size} fontWeight={600} fill="#f8fafc" fontFamily={FONT}>
                {name}
              </text>
              <text x={x + w / 2} y={y + d - size * 0.75 - 4} textAnchor="middle" fontSize={size * 0.8} fill="#cbd5e1" fontFamily={FONT}>
                {w} × {d} mm
              </text>
              <title>{`${full}: ${w} × ${d} mm${onSide ? ', on its side' : ''}, faces the ${facing}${reversed ? ' (reversed)' : ''}${over ? ' (overhangs the shelf)' : ''}`}</title>
            </g>
          );
        })}
        {ghost && (
          <g data-testid="plan-drag-ghost" pointerEvents="none">
            <rect x={ghost.x} y={ghost.y} width={ghost.w} height={ghost.d} rx={3} fill={drag!.ok ? 'rgba(59,130,246,0.25)' : 'rgba(239,68,68,0.25)'} stroke={drag!.ok ? '#3b82f6' : '#ef4444'} strokeWidth={1.4} strokeDasharray="5 3" />
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Bar along the faceplate edge, with an arrow pointing the way it faces. Purple when reversed. */
function FacingMark({ x, y, w, d, facing, reversed }: { x: number; y: number; w: number; d: number; facing: 'front' | 'rear'; reversed: boolean }) {
  const colour = reversed ? '#a855f7' : '#22c55e';
  const front = facing === 'front';
  const bar = 4;
  const by = front ? y + d - bar - 0.5 : y + 0.5;
  const cx = x + w / 2;
  const half = Math.min(8, w / 4);
  // The arrow sits just outside the edge the faceplate is on, pointing away from the device.
  const base = front ? y + d + 1 : y - 1;
  const tip = front ? y + d + 8 : y - 8;
  return (
    <g pointerEvents="none" data-facing={facing}>
      <rect x={x + 1.5} y={by} width={Math.max(0, w - 3)} height={bar} rx={1.5} fill={colour} stroke="#0f172a" strokeOpacity={0.35} strokeWidth={0.4} />
      <path d={`M${cx - half} ${base}L${cx + half} ${base}L${cx} ${tip}Z`} fill={colour} stroke="#0f172a" strokeOpacity={0.35} strokeWidth={0.4} />
    </g>
  );
}

export const ShelfPlanView = memo(function ShelfPlanView({ design, catalog, leds = true, selectedIds, drag }: PlanProps) {
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
        <ShelfPlan key={s.id} design={design} catalog={catalog} shelf={s} leds={leds} selectedIds={selectedIds} drag={drag} />
      ))}
    </div>
  );
});
