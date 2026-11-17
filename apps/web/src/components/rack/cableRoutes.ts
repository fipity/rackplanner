/**
 * Cable routing: instead of a free curve between two ports, a cable drops
 * into the nearest cable manager or brush panel, runs along it, and (when its
 * two ends use different managers) goes up or down the rack's side beside the
 * posts. Cables sharing a manager or a side run are spread a little apart, so
 * they read as a bundle.
 *
 * Everything is in SVG mm, per view. Pure functions (no React) so the
 * inspector can use the same route for its length estimate.
 */
import { U_MM, type Cable, type CableEnd, type Catalog, type Design, type PlacedPart } from '@rackplanner/shared';
import { cableEndPoint, placementBox, type EndPoint } from './cableGeometry';
import { LABEL_COL, rackLayout, type View } from './geometry';

export interface Channel {
  id: string;
  kind: 'manager' | 'brush';
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * A port uses a manager only if it's this close (port to manager centre,
 * vertically); further away, the cable runs out to the side of the rack first
 * rather than straight across the gear in between.
 */
export const MAX_REACH_MM = 2.5 * U_MM;
/** Spacing between neighbouring cables in a bundle (mm). */
const BUNDLE_GAP = 1.5;
/** Corner radius of a routed cable (mm). */
const CORNER_R = 4;

/**
 * Cable managers and brush panels usable in a view. D-ring and finger-duct
 * managers only work on the face they're mounted on; a brush panel passes
 * cables through, so it serves both views.
 */
export function cableChannels(design: Pick<Design, 'rack' | 'placements'>, catalog: Catalog, view: View): Channel[] {
  const out: Channel[] = [];
  for (const p of design.placements) {
    if (p.wall || p.parentId !== undefined) continue;
    const part = catalog.get(p.partId);
    if (!part || part.category !== 'cable-management') continue;
    const brush = part.render.style === 'brush';
    const info = placementBox(design, catalog, p, view);
    if (!info || (!brush && !info.visible)) continue;
    const { x, y, w, h } = info.box;
    out.push({ id: p.id, kind: brush ? 'brush' : 'manager', x, y, w, h });
  }
  return out;
}

function nearestChannel(channels: readonly Channel[], pt: Pt, only?: Channel['kind']): Channel | null {
  let best: Channel | null = null;
  let bestD = Infinity;
  for (const c of channels) {
    if (only && c.kind !== only) continue;
    const d = Math.abs(c.y + c.h / 2 - pt.y);
    if (d <= MAX_REACH_MM && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** The channel within reach of both points that's closest to them overall. */
function sharedChannel(channels: readonly Channel[], a: Pt, b: Pt): Channel | null {
  let best: Channel | null = null;
  let bestD = Infinity;
  for (const c of channels) {
    const cy = c.y + c.h / 2;
    const da = Math.abs(cy - a.y);
    const db = Math.abs(cy - b.y);
    if (da <= MAX_REACH_MM && db <= MAX_REACH_MM && da + db < bestD) {
      best = c;
      bestD = da + db;
    }
  }
  return best;
}

function isWall(design: Pick<Design, 'placements'>, end: CableEnd): boolean {
  return design.placements.find((p: PlacedPart) => p.id === end.placementId)?.wall === true;
}

/** Abstract route before bundle offsets: which channels and side lane it uses. */
interface Plan {
  cableId: string;
  a: EndPoint;
  /** End point (for cross-face cables, the spot where it passes through the brush). */
  b: Pt;
  ca: Channel | null;
  cb: Channel | null;
  /** Side lane, or null when both ends share one channel. */
  side: 'left' | 'right' | null;
}

function plan(design: Pick<Design, 'rack' | 'placements'>, catalog: Catalog, cable: Pick<Cable, 'id' | 'a' | 'b'>, view: View, channels: readonly Channel[]): Plan | null {
  if (channels.length === 0 || isWall(design, cable.a) || isWall(design, cable.b)) return null;
  let a = cableEndPoint(design, catalog, cable.a, view);
  let b = cableEndPoint(design, catalog, cable.b, view);
  if (!a || !b || (!a.visible && !b.visible)) return null;
  const layout = rackLayout(design.rack);
  const mid = layout.width / 2;
  if (a.visible && b.visible) {
    // One manager within reach of both ends: stay in it (no trip to the side).
    const shared = sharedChannel(channels, a, b);
    if (shared) return { cableId: cable.id, a, b, ca: shared, cb: shared, side: null };
    const ca = nearestChannel(channels, a);
    const cb = nearestChannel(channels, b);
    if (!ca && !cb) return null;
    if (ca && ca === cb) return { cableId: cable.id, a, b, ca, cb, side: null };
    return { cableId: cable.id, a, b, ca, cb, side: (a.x + b.x) / 2 < mid ? 'left' : 'right' };
  }
  // One end is on the other face: route the visible end to a brush panel,
  // where the cable passes through the rack.
  if (!a.visible) [a, b] = [b, a];
  const brush = nearestChannel(channels, a, 'brush') ?? channels.filter((c) => c.kind === 'brush').sort((p, q) => Math.abs(p.y - a!.y) - Math.abs(q.y - a!.y))[0];
  if (!brush) return null;
  const ca = nearestChannel(channels, a);
  if (ca === brush) return { cableId: cable.id, a, b: { x: a.x, y: brush.y + brush.h / 2 }, ca, cb: brush, side: null };
  const side = a.x < mid ? 'left' : 'right';
  const exitX = side === 'left' ? brush.x + Math.min(20, brush.w / 4) : brush.x + brush.w - Math.min(20, brush.w / 4);
  return { cableId: cable.id, a, b: { x: exitX, y: brush.y + brush.h / 2 }, ca, cb: brush, side };
}

/** X of the vertical run beside the posts. */
function laneX(design: Pick<Design, 'rack'>, side: 'left' | 'right'): number {
  const layout = rackLayout(design.rack);
  const x = LABEL_COL + layout.frame.post / 2;
  return side === 'left' ? x : layout.width - x;
}

/** Spread `n` cables around a centre line. */
function spread(i: number, n: number, room: number): number {
  const gap = n > 1 ? Math.min(BUNDLE_GAP, room / (n - 1)) : 0;
  return (i - (n - 1) / 2) * gap;
}

function points(design: Pick<Design, 'rack'>, pl: Plan, trackY: (c: Channel) => number, laneOff: number): Pt[] {
  const { a, b, ca, cb, side } = pl;
  if (side === null && ca) {
    const y = trackY(ca);
    return [a, { x: a.x, y }, { x: b.x, y }, b];
  }
  const lx = laneX(design, side ?? 'left') + laneOff;
  const pts: Pt[] = [a];
  if (ca) {
    const y = trackY(ca);
    pts.push({ x: a.x, y }, { x: lx, y });
  } else pts.push({ x: lx, y: a.y });
  if (cb) {
    const y = trackY(cb);
    pts.push({ x: lx, y }, { x: b.x, y });
  } else pts.push({ x: lx, y: b.y });
  pts.push(b);
  return pts;
}

/** Drop repeated and collinear points. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    const prev = out[out.length - 2];
    if (prev && last && ((Math.abs(prev.x - last.x) < 0.01 && Math.abs(last.x - p.x) < 0.01) || (Math.abs(prev.y - last.y) < 0.01 && Math.abs(last.y - p.y) < 0.01))) out.pop();
    out.push(p);
  }
  return out;
}

/** SVG path through the points with rounded corners. */
export function roundedPath(pts: readonly Pt[], r = CORNER_R): string {
  if (pts.length === 0) return '';
  const f = (n: number) => +n.toFixed(2);
  let d = `M${f(pts[0]!.x)} ${f(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const s = { x: p1.x + ((p0.x - p1.x) / (l1 || 1)) * rr, y: p1.y + ((p0.y - p1.y) / (l1 || 1)) * rr };
    const e = { x: p1.x + ((p2.x - p1.x) / (l2 || 1)) * rr, y: p1.y + ((p2.y - p1.y) / (l2 || 1)) * rr };
    d += ` L${f(s.x)} ${f(s.y)} Q${f(p1.x)} ${f(p1.y)} ${f(e.x)} ${f(e.y)}`;
  }
  const last = pts[pts.length - 1]!;
  return d + ` L${f(last.x)} ${f(last.y)}`;
}

export function polylineLength(pts: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return n;
}

export interface CableRoute {
  points: Pt[];
  d: string;
  /** Where a cross-face cable passes through a brush panel (else null). */
  through: Pt | null;
}

/**
 * Routes for every cable that can use a cable manager or brush panel in this
 * view, keyed by cable id. Cables missing from the map are drawn as before.
 */
export function routeCables(design: Pick<Design, 'rack' | 'placements'>, catalog: Catalog, cables: readonly Pick<Cable, 'id' | 'a' | 'b'>[], view: View): Map<string, CableRoute> {
  const channels = cableChannels(design, catalog, view);
  const routes = new Map<string, CableRoute>();
  if (channels.length === 0) return routes;
  const plans = cables.map((c) => plan(design, catalog, c, view, channels)).filter((p): p is Plan => p !== null);

  // Bundle slots per channel, ordered by where each cable enters it (left to right).
  const byChannel = new Map<string, { cableId: string; key: number }[]>();
  const addTo = (c: Channel | null, cableId: string, key: number) => {
    if (!c) return;
    const list = byChannel.get(c.id) ?? [];
    if (!list.some((e) => e.cableId === cableId)) list.push({ cableId, key });
    byChannel.set(c.id, list);
  };
  for (const pl of plans) {
    addTo(pl.ca, pl.cableId, pl.a.x);
    addTo(pl.cb, pl.cableId, pl.b.x);
  }
  for (const list of byChannel.values()) list.sort((p, q) => p.key - q.key || p.cableId.localeCompare(q.cableId));

  // Side lanes, ordered by the top of each run so bundles nest.
  const lanes: Record<'left' | 'right', Plan[]> = { left: [], right: [] };
  for (const pl of plans) if (pl.side) lanes[pl.side].push(pl);
  const laneOffset = new Map<string, number>();
  for (const side of ['left', 'right'] as const) {
    const list = lanes[side].sort((p, q) => Math.min(p.a.y, p.b.y) - Math.min(q.a.y, q.b.y) || p.cableId.localeCompare(q.cableId));
    list.forEach((pl, i) => laneOffset.set(pl.cableId, spread(i, list.length, 10)));
  }

  for (const pl of plans) {
    const trackY = (c: Channel) => {
      const list = byChannel.get(c.id) ?? [];
      const i = list.findIndex((e) => e.cableId === pl.cableId);
      return c.y + c.h / 2 + spread(i, list.length, c.h * 0.6);
    };
    const pts = simplify(points(design, pl, trackY, laneOffset.get(pl.cableId) ?? 0));
    const crossFace = !('visible' in pl.b);
    routes.set(pl.cableId, { points: pts, d: roundedPath(pts), through: crossFace ? pts[pts.length - 1]! : null });
  }
  return routes;
}

/** Routed length of one cable in mm (no bundle offsets), or null if it isn't routed. */
export function routedLengthMm(design: Pick<Design, 'rack' | 'placements'>, catalog: Catalog, a: CableEnd, b: CableEnd, view: View): number | null {
  const r = routeCables(design, catalog, [{ id: '_', a, b }], view).get('_');
  return r ? polylineLength(r.points) : null;
}
