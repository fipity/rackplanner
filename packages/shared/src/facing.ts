/**
 * Facing: which way a placed part's faceplate points. Mounting says which
 * rails (or side of the rack) a part sits on; facing says which way it's
 * turned. A switch on the front rails can face the rear (ports at the back
 * of the rack), and a patch panel on the rear rails can face inwards.
 *
 * Reversing never moves a part or changes the space it takes up: the same U,
 * the same depth from the same side, the same x in rack terms. Only what each
 * view shows changes: from the side it faces you see its faceplate, from the
 * other side its rear panel. Airflow follows it round (see airflow.ts).
 */
import { descendantsOf, isPrintedMount, naturalFacing, type Catalog, type Face } from './placement.js';
import type { Design, PlacedPart } from './schemas.js';

export const FACING_LABELS: Record<Face, string> = { front: 'Faces front', rear: 'Faces rear' };

export const otherFace = (f: Face): Face => (f === 'front' ? 'rear' : 'front');

/**
 * Which way a placement faces. Explicit `facing` wins; otherwise shelf items
 * face the way their shelf does, wall gear faces out from the wall (front),
 * and rack gear faces out from its rails.
 */
export function facingOf(placements: readonly PlacedPart[], p: PlacedPart): Face {
  let cur: PlacedPart | undefined = p;
  for (let hops = 0; cur && hops < 6; hops++) {
    if (cur.facing) return cur.facing;
    if (cur.wall) return 'front';
    if (cur.parentId === undefined) return naturalFacing(cur.mounting);
    const parentId: string = cur.parentId;
    cur = placements.find((q) => q.id === parentId);
  }
  return naturalFacing(p.mounting);
}

/** Fill in any missing facing so the saved JSON says which way everything points. */
export function withFacing(placements: PlacedPart[]): PlacedPart[] {
  if (placements.every((p) => p.facing)) return placements;
  return placements.map((p) => (p.facing ? p : { ...p, facing: facingOf(placements, p) }));
}

/** Can this placement be reversed? Wall gear has only one way to face. */
export function canReverse(p: PlacedPart): boolean {
  return !p.wall;
}

/**
 * The placements a reverse of `ids` actually turns round: a device held in a
 * 3D-printed mount turns with its mount (one unit), and anything already
 * covered by a selected shelf or mount isn't turned twice.
 */
export function reverseRoots(placements: readonly PlacedPart[], ids: readonly string[], catalog: Catalog): string[] {
  const byId = new Map(placements.map((p) => [p.id, p]));
  const roots: string[] = [];
  for (const id of ids) {
    let p = byId.get(id);
    if (!p || !canReverse(p)) continue;
    const parent = p.parentId !== undefined ? byId.get(p.parentId) : undefined;
    if (parent && isPrintedMount(catalog.get(parent.partId))) p = parent;
    if (!roots.includes(p.id)) roots.push(p.id);
  }
  // Drop roots that sit (directly or not) on another root: they turn with it.
  return roots.filter((id) => {
    let cur = byId.get(id);
    for (let hops = 0; cur?.parentId !== undefined && hops < 6; hops++) {
      if (roots.includes(cur.parentId)) return false;
      cur = byId.get(cur.parentId);
    }
    return true;
  });
}

export interface ReverseResult {
  placements: PlacedPart[];
  /** The placements that were turned round, including shelf contents. */
  flipped: string[];
  /** Ids that couldn't be reversed (wall gear, unknown ids). */
  skipped: string[];
}

/**
 * Turn the given placements round. A shelf or printed mount turns along with
 * everything on it (each item keeps its spot on the tray and turns round in
 * place, so an item that was already reversed on the shelf ends up facing
 * the shelf's old way).
 */
export function reversePlacements(design: Pick<Design, 'placements'>, ids: readonly string[], catalog: Catalog): ReverseResult {
  const { placements } = design;
  const roots = reverseRoots(placements, ids, catalog);
  const flip = new Set<string>();
  for (const id of roots) {
    flip.add(id);
    for (const d of descendantsOf(placements, id)) flip.add(d);
  }
  // Every other valid id is a root or sits on one, so it was turned.
  const skipped = ids.filter((id) => {
    const p = placements.find((q) => q.id === id);
    return !p || !canReverse(p);
  });
  const out = placements.map((p) => (flip.has(p.id) ? { ...p, facing: otherFace(facingOf(placements, p)) } : p));
  return { placements: out, flipped: [...flip], skipped };
}

/** The rails a placement hangs off: its own mounting, or its shelf's (recursively). */
function rootOf(placements: readonly PlacedPart[], p: PlacedPart): PlacedPart {
  let cur = p;
  for (let hops = 0; cur.parentId !== undefined && hops < 6; hops++) {
    const parentId: string = cur.parentId;
    const parent = placements.find((q) => q.id === parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur;
}

/**
 * Is this placement turned round from the natural way for its rails (front
 * rails / full depth → faces front, rear rails → faces rear)? That's what the
 * "Rear-facing" / "Front-facing" badge marks.
 */
export function isReversed(placements: readonly PlacedPart[], p: PlacedPart): boolean {
  if (p.wall) return false;
  const root = rootOf(placements, p);
  if (root.wall) return false;
  return facingOf(placements, p) !== naturalFacing(root.mounting);
}
