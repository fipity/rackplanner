/**
 * Placement engine: pure functions shared by the editor, the API and tests.
 *
 * Coordinate system
 *  - Vertical: rack units, 1-based from the bottom. A placement occupies
 *    [bottomU, bottomU + heightU).
 *  - Horizontal: millimetres from the left rail as seen in the FRONT view,
 *    across the usable opening (450 mm for 19", 222 mm for 10").
 *  - Depth: each placement occupies a set of faces. front → {front},
 *    rear → {rear}, full-depth → {front, rear}. A front and a rear part can
 *    share the same U/x space only if their depths fit within the rack depth.
 *  - Shelf children (parentId set) stand on their shelf's tray: they occupy
 *    U space starting at the shelf's bottom U (overlapping the shelf itself,
 *    which never collides with its own contents), inherit its faces, and their
 *    xMm is relative to the shelf's usable area.
 */
import type { Design, Mounting, Part, PlacedPart, Rack } from './schemas.js';
import { EPS, RACK_OPENING_MM, type RackWidth } from './units.js';

export type Catalog = ReadonlyMap<string, Part>;
export type Face = 'front' | 'rear';

export interface Occupancy {
  placementId: string;
  u0: number;
  u1: number;
  x0: number;
  x1: number;
  faces: readonly Face[];
  depthMm: number | null;
}

export type CollisionReason = 'overlap' | 'depth';

export interface Collision {
  placementId: string;
  name: string;
  reason: CollisionReason;
  u0: number;
  u1: number;
}

export type ProblemCode =
  | 'unknown-part'
  | 'unknown-parent'
  | 'not-a-shelf'
  | 'rack-width'
  | 'too-wide'
  | 'out-of-bounds'
  | 'mounting'
  | 'collision';

export interface PlacementProblem {
  code: ProblemCode;
  message: string;
}

export interface PlacementCheck {
  ok: boolean;
  problems: PlacementProblem[];
  collisions: Collision[];
}

// ---------------------------------------------------------------------------
// Basic geometry helpers
// ---------------------------------------------------------------------------

export function openingMm(rackWidth: RackWidth): number {
  return RACK_OPENING_MM[rackWidth];
}

/** Physical width a part occupies within the rack opening. */
export function partWidthMm(part: Part): number {
  const w = part.width;
  if (typeof w === 'object') return w.mm;
  switch (w) {
    case '19in':
      return RACK_OPENING_MM['19in'];
    case '10in':
      return RACK_OPENING_MM['10in'];
    case 'half-19in':
      return RACK_OPENING_MM['19in'] / 2;
  }
}

export function isFullWidth(part: Part, rackWidth: RackWidth): boolean {
  return partWidthMm(part) >= openingMm(rackWidth) - EPS;
}

export function facesFor(mounting: Mounting): readonly Face[] {
  switch (mounting) {
    case 'front':
      return ['front'];
    case 'rear':
      return ['rear'];
    case 'full-depth':
      return ['front', 'rear'];
  }
}

/** Mounting options a user may choose for a part. Full-depth gear stays full-depth. */
export function allowedMountings(part: Part): readonly Mounting[] {
  return part.mounting === 'full-depth' ? ['full-depth'] : ['front', 'rear'];
}

/** Snap step for vertical positions: half-U parts may sit on half-U boundaries. */
export function uStep(part: Part): number {
  return Number.isInteger(part.heightU) ? 1 : 0.5;
}

export interface FitResult {
  ok: boolean;
  reason?: string;
}

/** Whether a part can be mounted directly in a rack of the given width. */
export function fitsRackWidth(part: Part, rackWidth: RackWidth): FitResult {
  if (part.formFactor === 'desktop') {
    // Desktop gear sits on shelves; it only has to be narrower than the opening.
    return partWidthMm(part) <= openingMm(rackWidth) + EPS
      ? { ok: true }
      : { ok: false, reason: `Wider than a ${rackWidth} rack opening` };
  }
  if (!part.rackWidths.includes(rackWidth)) {
    return { ok: false, reason: `Not mountable in a ${rackWidth} rack` };
  }
  if (partWidthMm(part) > openingMm(rackWidth) + EPS) {
    return { ok: false, reason: `Too wide for a ${rackWidth} rack` };
  }
  return { ok: true };
}

export function displayName(placement: PlacedPart, part: Part | undefined): string {
  if (placement.label?.trim()) return placement.label.trim();
  return part ? part.name : placement.partId;
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - EPS && b0 < a1 - EPS;
}

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

/**
 * Compute the space a placement occupies. Returns null when the placement
 * references an unknown part or a missing / invalid parent shelf.
 */
export function occupancyOf(
  placements: readonly PlacedPart[],
  placement: PlacedPart,
  catalog: Catalog,
  depth = 0,
): Occupancy | null {
  const part = catalog.get(placement.partId);
  if (!part) return null;
  const width = partWidthMm(part);

  if (placement.parentId !== undefined) {
    if (depth > 4) return null; // defensive: cyclic parent chain
    const parent = placements.find((p) => p.id === placement.parentId);
    if (!parent) return null;
    const parentPart = catalog.get(parent.partId);
    if (!parentPart?.shelf) return null;
    const parentOcc = occupancyOf(placements, parent, catalog, depth + 1);
    if (!parentOcc) return null;
    const inset = Math.max(0, (parentOcc.x1 - parentOcc.x0 - parentPart.shelf.usableWidthMm) / 2);
    // Items wider than the usable area overhang it, centred (stats warn about it).
    const x0 =
      width > parentPart.shelf.usableWidthMm + EPS
        ? parentOcc.x0 + (parentOcc.x1 - parentOcc.x0 - width) / 2
        : parentOcc.x0 + inset + placement.xMm;
    // Items stand on the shelf's tray, which sits at the bottom of the shelf's
    // own U, so they start in that U rather than above it.
    return {
      placementId: placement.id,
      u0: parentOcc.u0,
      u1: parentOcc.u0 + part.heightU,
      x0,
      x1: x0 + width,
      faces: parentOcc.faces,
      depthMm: part.depthMm,
    };
  }

  return {
    placementId: placement.id,
    u0: placement.bottomU,
    u1: placement.bottomU + part.heightU,
    x0: placement.xMm,
    x1: placement.xMm + width,
    faces: facesFor(placement.mounting),
    depthMm: part.depthMm,
  };
}

/** Does `a` collide with `b`? Returns the reason, or null if they can coexist. */
export function collides(a: Occupancy, b: Occupancy, rack: Rack): CollisionReason | null {
  if (!rangesOverlap(a.u0, a.u1, b.u0, b.u1)) return null;
  if (!rangesOverlap(a.x0, a.x1, b.x0, b.x1)) return null;
  if (a.faces.some((f) => b.faces.includes(f))) return 'overlap';
  // One front, one rear. They only clash if together they're deeper than the rack.
  if (rack.depthMm !== null && a.depthMm !== null && b.depthMm !== null) {
    if (a.depthMm + b.depthMm > rack.depthMm + EPS) return 'depth';
  }
  return null;
}

/** Placement ids of every ancestor (the shelf a part sits on, recursively). */
export function ancestorsOf(placements: readonly PlacedPart[], id: string): string[] {
  const out: string[] = [];
  let cur = placements.find((p) => p.id === id);
  while (cur?.parentId !== undefined && !out.includes(cur.parentId)) {
    out.push(cur.parentId);
    const parentId: string = cur.parentId;
    cur = placements.find((p) => p.id === parentId);
  }
  return out;
}

/** Placement ids of every descendant (shelf children, recursively). */
export function descendantsOf(placements: readonly PlacedPart[], id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of placements) {
      if (p.parentId === cur && !out.includes(p.id)) {
        out.push(p.id);
        stack.push(p.id);
      }
    }
  }
  return out;
}

function replaceOrAppend(placements: readonly PlacedPart[], candidate: PlacedPart): PlacedPart[] {
  const idx = placements.findIndex((p) => p.id === candidate.id);
  if (idx === -1) return [...placements, candidate];
  const next = placements.slice();
  next[idx] = candidate;
  return next;
}

// ---------------------------------------------------------------------------
// Validation of a single candidate placement
// ---------------------------------------------------------------------------

/**
 * Check whether `candidate` (new, or a moved version of an existing
 * placement) is valid in `design`. When a shelf moves, its children move
 * with it and are checked too.
 */
export function checkPlacement(
  design: Pick<Design, 'rack' | 'placements'>,
  candidate: PlacedPart,
  catalog: Catalog,
): PlacementCheck {
  const problems: PlacementProblem[] = [];
  const collisions: Collision[] = [];
  const { rack } = design;
  const part = catalog.get(candidate.partId);
  if (!part) {
    return {
      ok: false,
      problems: [{ code: 'unknown-part', message: `Unknown part "${candidate.partId}"` }],
      collisions,
    };
  }

  const placements = replaceOrAppend(design.placements, candidate);

  if (candidate.parentId !== undefined) {
    const parent = placements.find((p) => p.id === candidate.parentId);
    const parentPart = parent ? catalog.get(parent.partId) : undefined;
    if (!parent || !parentPart) {
      problems.push({ code: 'unknown-parent', message: 'Shelf not found' });
    } else if (!parentPart.shelf) {
      problems.push({ code: 'not-a-shelf', message: `${parentPart.name} is not a shelf` });
    } else if (partWidthMm(part) <= parentPart.shelf.usableWidthMm + EPS && candidate.xMm + partWidthMm(part) > parentPart.shelf.usableWidthMm + EPS) {
      problems.push({ code: 'too-wide', message: `Doesn't fit on ${parentPart.name}` });
    }
  } else {
    const fit = fitsRackWidth(part, rack.width);
    if (!fit.ok) problems.push({ code: 'rack-width', message: fit.reason ?? 'Does not fit rack width' });
    if (!allowedMountings(part).includes(candidate.mounting)) {
      problems.push({ code: 'mounting', message: `${part.name} must be mounted ${part.mounting}` });
    }
  }

  const moving = [candidate.id, ...descendantsOf(placements, candidate.id)];
  const movingSet = new Set(moving);
  const others = placements
    .filter((p) => !movingSet.has(p.id))
    .map((p) => ({ p, occ: occupancyOf(placements, p, catalog) }))
    .filter((o): o is { p: PlacedPart; occ: Occupancy } => o.occ !== null);

  const opening = openingMm(rack.width);
  for (const id of moving) {
    const placement = placements.find((p) => p.id === id)!;
    const occ = occupancyOf(placements, placement, catalog);
    if (!occ) continue;
    if (occ.u0 < 1 - EPS || occ.u1 > rack.heightU + 1 + EPS) {
      problems.push({ code: 'out-of-bounds', message: id === candidate.id ? 'Outside the rack' : 'Shelf item would leave the rack' });
    }
    if (occ.x0 < -EPS || occ.x1 > opening + EPS) {
      if (!problems.some((pr) => pr.code === 'rack-width')) {
        problems.push({ code: 'out-of-bounds', message: 'Outside the rack opening' });
      }
    }
    const ancestors = ancestorsOf(placements, id);
    for (const o of others) {
      if (ancestors.includes(o.p.id)) continue; // a shelf never collides with what stands on it
      const reason = collides(occ, o.occ, rack);
      if (reason && !collisions.some((c) => c.placementId === o.p.id)) {
        collisions.push({
          placementId: o.p.id,
          name: displayName(o.p, catalog.get(o.p.partId)),
          reason,
          u0: o.occ.u0,
          u1: o.occ.u1,
        });
      }
    }
  }

  if (collisions.length) {
    problems.push({ code: 'collision', message: describeCollisions(collisions, rack) });
  }

  return { ok: problems.length === 0, problems, collisions };
}

export function formatURange(u0: number, u1: number, rack: Rack): string {
  const toLabel = (u: number) => (rack.numbering === 'top-down' ? rack.heightU - u + 1 : u);
  const a = toLabel(u0);
  const b = toLabel(u1 - 1);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return lo === hi ? `U${lo}` : `U${lo}–${hi}`;
}

function describeCollisions(collisions: readonly Collision[], rack: Rack): string {
  return collisions
    .map((c) =>
      c.reason === 'depth'
        ? `Too deep alongside ${c.name} (${formatURange(c.u0, c.u1, rack)}) for a ${rack.depthMm} mm rack`
        : `Collides with ${c.name} (${formatURange(c.u0, c.u1, rack)})`,
    )
    .join('; ');
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

/** Snap a raw (fractional) bottom U to the part's grid and clamp it into the rack. */
export function snapBottomU(part: Part, rawBottomU: number, rack: Rack): number {
  const step = uStep(part);
  const snapped = Math.round((rawBottomU - 1) / step) * step + 1;
  const max = rack.heightU + 1 - part.heightU;
  if (max < 1) return 1;
  return Math.min(Math.max(snapped, 1), max);
}

/**
 * Candidate horizontal positions for a top-level part: left, centre, right,
 * and flush against neighbours that share its U range.
 */
export function xCandidates(
  design: Pick<Design, 'rack' | 'placements'>,
  part: Part,
  bottomU: number,
  catalog: Catalog,
  ignoreIds: readonly string[] = [],
): number[] {
  const opening = openingMm(design.rack.width);
  const w = partWidthMm(part);
  if (w >= opening - EPS) return [0];
  const maxX = opening - w;
  const set = new Set<number>([0, maxX / 2, maxX]);
  const u0 = bottomU;
  const u1 = bottomU + part.heightU;
  for (const p of design.placements) {
    if (ignoreIds.includes(p.id)) continue;
    const occ = occupancyOf(design.placements, p, catalog);
    if (!occ || !rangesOverlap(u0, u1, occ.u0, occ.u1)) continue;
    if (occ.x1 <= maxX + EPS) set.add(occ.x1);
    if (occ.x0 - w >= -EPS) set.add(Math.max(0, occ.x0 - w));
  }
  return [...set].sort((a, b) => a - b);
}

export interface DropRequest {
  partId: string;
  /** Existing placement being moved, if any. */
  placementId?: string;
  rawBottomU: number;
  rawXMm: number;
  mounting: Mounting;
  /** View being dropped into; only shelves visible in it are drop targets. */
  view?: Face;
}

export interface DropResolution {
  candidate: Omit<PlacedPart, 'id'> & { id: string };
  check: PlacementCheck;
}

/**
 * Turn a raw pointer position into a snapped candidate placement. Vertical
 * position follows the pointer exactly (so collisions are visible); for
 * partial-width parts the nearest collision-free horizontal slot wins.
 */
export function resolveDrop(
  design: Pick<Design, 'rack' | 'placements'>,
  catalog: Catalog,
  req: DropRequest,
  newId = '__candidate__',
): DropResolution | null {
  const part = catalog.get(req.partId);
  if (!part) return null;
  const existing = req.placementId ? design.placements.find((p) => p.id === req.placementId) : undefined;
  const ignore = existing ? [existing.id, ...descendantsOf(design.placements, existing.id)] : [];

  // Desktop gear dropped onto a shelf sits on it.
  const shelf = findShelfTarget(design, catalog, part, req.rawBottomU, req.rawXMm, req.view, ignore);
  if (shelf) {
    const relX = req.rawXMm - shelf.x0;
    const sxs = shelfXCandidates(design.placements, shelf, part, catalog, ignore).sort((a, b) => Math.abs(a - relX) - Math.abs(b - relX));
    const mounting: Mounting = shelf.faces.includes('front') ? 'front' : 'rear';
    const shelfBase: PlacedPart = existing
      ? { ...existing, parentId: shelf.shelf.id, bottomU: shelf.baseU, xMm: sxs[0] ?? 0, mounting }
      : { id: newId, partId: part.id, parentId: shelf.shelf.id, bottomU: shelf.baseU, xMm: sxs[0] ?? 0, mounting };
    let firstOnShelf: DropResolution | null = null;
    for (const xMm of sxs) {
      const candidate = { ...shelfBase, xMm };
      const check = checkPlacement(design, candidate, catalog);
      if (check.ok) return { candidate, check };
      firstOnShelf ??= { candidate, check };
    }
    if (firstOnShelf) return firstOnShelf;
  }

  const bottomU = snapBottomU(part, req.rawBottomU, design.rack);
  const xs = xCandidates(design, part, bottomU, catalog, ignore).sort(
    (a, b) => Math.abs(a - req.rawXMm) - Math.abs(b - req.rawXMm),
  );

  const base: PlacedPart = existing
    ? { ...existing, parentId: undefined, bottomU, xMm: xs[0] ?? 0, mounting: req.mounting }
    : { id: newId, partId: part.id, bottomU, xMm: xs[0] ?? 0, mounting: req.mounting };
  if (base.parentId === undefined) delete base.parentId;

  let first: DropResolution | null = null;
  for (const xMm of xs) {
    const candidate = { ...base, xMm };
    const check = checkPlacement(design, candidate, catalog);
    if (check.ok) return { candidate, check };
    first ??= { candidate, check };
  }
  return first ?? { candidate: base, check: checkPlacement(design, base, catalog) };
}

/**
 * Find the nearest free position for a part, searching outward from
 * `nearU` (defaults to the top of the rack). Used by duplicate.
 */
export function findFreeSlot(
  design: Pick<Design, 'rack' | 'placements'>,
  catalog: Catalog,
  partId: string,
  mounting: Mounting,
  nearU?: number,
  newId = '__candidate__',
): PlacedPart | null {
  const part = catalog.get(partId);
  if (!part) return null;
  const step = uStep(part);
  const maxBottom = design.rack.heightU + 1 - part.heightU;
  if (maxBottom < 1) return null;
  const positions: number[] = [];
  for (let u = 1; u <= maxBottom + EPS; u += step) positions.push(u);
  const target = nearU ?? maxBottom;
  positions.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || b - a);
  for (const bottomU of positions) {
    for (const xMm of xCandidates(design, part, bottomU, catalog)) {
      const candidate: PlacedPart = { id: newId, partId, bottomU, xMm, mounting };
      if (checkPlacement(design, candidate, catalog).ok) return candidate;
    }
  }
  return null;
}


// ---------------------------------------------------------------------------
// Shelves
// ---------------------------------------------------------------------------

export interface ShelfGeometry {
  shelf: PlacedPart;
  shelfPart: Part;
  /** Rack-space x (front view) of the left edge of the usable area. */
  x0: number;
  usableWidthMm: number;
  usableDepthMm: number;
  /** U where items on the shelf start (the shelf's own bottom U: they stand on its tray). */
  baseU: number;
  faces: readonly Face[];
}

export function shelfGeometry(placements: readonly PlacedPart[], shelf: PlacedPart, catalog: Catalog): ShelfGeometry | null {
  const shelfPart = catalog.get(shelf.partId);
  if (!shelfPart?.shelf) return null;
  const occ = occupancyOf(placements, shelf, catalog);
  if (!occ) return null;
  const inset = Math.max(0, (occ.x1 - occ.x0 - shelfPart.shelf.usableWidthMm) / 2);
  return {
    shelf,
    shelfPart,
    x0: occ.x0 + inset,
    usableWidthMm: shelfPart.shelf.usableWidthMm,
    usableDepthMm: shelfPart.shelf.usableDepthMm,
    baseU: occ.u0,
    faces: occ.faces,
  };
}

/** Horizontal positions (relative to the shelf's usable area) for an item on a shelf. */
export function shelfXCandidates(
  placements: readonly PlacedPart[],
  geo: ShelfGeometry,
  part: Part,
  catalog: Catalog,
  ignoreIds: readonly string[] = [],
): number[] {
  const w = partWidthMm(part);
  const maxX = geo.usableWidthMm - w;
  // Wider than the usable area: it can only sit centred, overhanging the lips.
  if (maxX < -EPS) return [0];
  const set = new Set<number>([0, Math.max(0, maxX / 2), Math.max(0, maxX)]);
  for (const p of placements) {
    if (p.parentId !== geo.shelf.id || ignoreIds.includes(p.id)) continue;
    const sp = catalog.get(p.partId);
    if (!sp) continue;
    const right = p.xMm + partWidthMm(sp);
    if (right <= maxX + EPS) set.add(right);
    if (p.xMm - w >= -EPS) set.add(Math.max(0, p.xMm - w));
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Find a shelf a desktop part is being dropped onto: the part's bottom must
 * be near the shelf's top surface and its centre over the shelf.
 */
export function findShelfTarget(
  design: Pick<Design, 'rack' | 'placements'>,
  catalog: Catalog,
  part: Part,
  rawBottomU: number,
  rawXMm: number,
  view: Face | undefined,
  ignoreIds: readonly string[] = [],
): ShelfGeometry | null {
  if (part.formFactor !== 'desktop') return null;
  const w = partWidthMm(part);
  const centre = rawXMm + w / 2;
  let best: { geo: ShelfGeometry; dist: number } | null = null;
  for (const p of design.placements) {
    if (ignoreIds.includes(p.id) || p.parentId !== undefined) continue;
    const geo = shelfGeometry(design.placements, p, catalog);
    if (!geo) continue;
    if (view && !geo.faces.includes(view)) continue;
    const shelfOcc = occupancyOf(design.placements, p, catalog)!;
    if (w > shelfOcc.x1 - shelfOcc.x0 + EPS) continue;
    // The dragged part's bottom must be near the tray (the shelf's bottom U).
    if (rawBottomU < geo.baseU - 0.75 || rawBottomU > shelfOcc.u1 + 0.5) continue;
    if (centre < shelfOcc.x0 || centre > shelfOcc.x1) continue;
    const dist = Math.abs(rawBottomU - geo.baseU);
    if (!best || dist < best.dist) best = { geo, dist };
  }
  return best?.geo ?? null;
}

/** First free spot on any shelf for a desktop part (preferring `preferShelfId`). */
export function findShelfSlot(
  design: Pick<Design, 'rack' | 'placements'>,
  catalog: Catalog,
  partId: string,
  preferShelfId?: string,
  newId = '__candidate__',
): PlacedPart | null {
  const part = catalog.get(partId);
  if (!part || part.formFactor !== 'desktop') return null;
  const shelves = design.placements
    .filter((p) => p.parentId === undefined && catalog.get(p.partId)?.shelf)
    .sort((a, b) => Number(b.id === preferShelfId) - Number(a.id === preferShelfId) || b.bottomU - a.bottomU);
  for (const shelf of shelves) {
    const geo = shelfGeometry(design.placements, shelf, catalog);
    if (!geo) continue;
    const mounting: Mounting = geo.faces.includes('front') ? 'front' : 'rear';
    for (const xMm of shelfXCandidates(design.placements, geo, part, catalog)) {
      const candidate: PlacedPart = { id: newId, partId, parentId: shelf.id, bottomU: geo.baseU, xMm, mounting };
      if (checkPlacement(design, candidate, catalog).ok) return candidate;
    }
  }
  return null;
}

export type Alignment = 'left' | 'centre' | 'right';

/** xMm that aligns a placement left / centre / right in the rack or on its shelf. */
export function alignedX(design: Pick<Design, 'rack' | 'placements'>, placement: PlacedPart, catalog: Catalog, align: Alignment): number | null {
  const part = catalog.get(placement.partId);
  if (!part) return null;
  const w = partWidthMm(part);
  let span: number;
  if (placement.parentId !== undefined) {
    const shelf = design.placements.find((p) => p.id === placement.parentId);
    const geo = shelf && shelfGeometry(design.placements, shelf, catalog);
    if (!geo) return null;
    span = geo.usableWidthMm;
  } else {
    span = openingMm(design.rack.width);
  }
  const maxX = Math.max(0, span - w);
  return align === 'left' ? 0 : align === 'right' ? maxX : maxX / 2;
}

/** Whether a placement can move horizontally at all. */
export function canAlign(design: Pick<Design, 'rack' | 'placements'>, placement: PlacedPart, catalog: Catalog): boolean {
  const right = alignedX(design, placement, catalog, 'right');
  return right !== null && right > EPS;
}

// ---------------------------------------------------------------------------
// Rack resize
// ---------------------------------------------------------------------------

export interface RemovedPlacement {
  placementId: string;
  name: string;
  reason: string;
}

export interface RackChangeResult {
  placements: PlacedPart[];
  removed: RemovedPlacement[];
}

/**
 * Apply a rack change (width / height / depth). Partial-width parts are
 * clamped into the new opening; anything that no longer fits is removed
 * (together with shelf children). Placements are kept in their original
 * order, so earlier ones win when two now overlap.
 */
export function applyRackChange(
  design: Pick<Design, 'rack' | 'placements'>,
  newRack: Rack,
  catalog: Catalog,
): RackChangeResult {
  const removed: RemovedPlacement[] = [];
  const accepted: PlacedPart[] = [];
  const opening = openingMm(newRack.width);
  const removedIds = new Set<string>();

  // Parents before children so shelves are settled first.
  const ordered = [
    ...design.placements.filter((p) => p.parentId === undefined),
    ...design.placements.filter((p) => p.parentId !== undefined),
  ];

  for (const original of ordered) {
    const part = catalog.get(original.partId);
    const name = displayName(original, part);
    if (original.parentId !== undefined && removedIds.has(original.parentId)) {
      removedIds.add(original.id);
      removed.push({ placementId: original.id, name, reason: 'Its shelf was removed' });
      continue;
    }
    if (!part) {
      removedIds.add(original.id);
      removed.push({ placementId: original.id, name, reason: 'Unknown part' });
      continue;
    }
    let candidate = original;
    if (original.parentId === undefined) {
      const w = partWidthMm(part);
      const xMm = w >= opening - EPS ? 0 : Math.min(Math.max(original.xMm, 0), Math.max(0, opening - w));
      candidate = { ...original, xMm };
    }
    const check = checkPlacement({ rack: newRack, placements: accepted }, candidate, catalog);
    if (check.ok) {
      accepted.push(candidate);
    } else {
      removedIds.add(original.id);
      removed.push({ placementId: original.id, name, reason: check.problems.map((p) => p.message).join('; ') });
    }
  }

  // Preserve the original ordering of the survivors.
  const order = new Map(design.placements.map((p, i) => [p.id, i]));
  accepted.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { placements: accepted, removed };
}
