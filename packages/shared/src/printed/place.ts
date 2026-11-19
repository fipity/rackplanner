/** Placing a printed mount with the devices it holds, and taking it out again. */
import {
  checkPlacement,
  displayName,
  findFreeSlot,
  findShelfSlot,
  findWallSlot,
  isPrintedMount,
  partWidthMm,
  shelfGeometry,
  type Catalog,
} from '../placement.js';
import type { Design, PlacedPart } from '../schemas.js';
import { EPS } from '../units.js';

/**
 * Placements for the devices a just-placed mount is made to hold, spread
 * evenly across its opening. Devices that don't fit are left out.
 */
export function heldDevicePlacements(design: Pick<Design, 'rack' | 'placements'>, mount: PlacedPart, catalog: Catalog, newId: () => string): PlacedPart[] {
  const mountPart = catalog.get(mount.partId);
  if (!mountPart?.printed || !mountPart.shelf) return [];
  const placements = design.placements.some((p) => p.id === mount.id) ? [...design.placements] : [...design.placements, mount];
  const geo = shelfGeometry(placements, mount, catalog);
  if (!geo) return [];
  const items = mountPart.printed.holds.flatMap((h) => {
    const part = catalog.get(h.partId);
    return part ? Array.from({ length: h.qty }, () => part) : [];
  });
  if (!items.length) return [];
  const total = items.reduce((s, p) => s + partWidthMm(p), 0);
  const gap = Math.max(0, (geo.usableWidthMm - total) / (items.length + 1));
  const out: PlacedPart[] = [];
  let x = gap;
  const mounting = geo.faces.includes('front') ? 'front' : 'rear';
  for (const part of items) {
    const w = partWidthMm(part);
    const candidate: PlacedPart = { id: newId(), partId: part.id, parentId: mount.id, bottomU: geo.baseU, xMm: Math.max(0, Math.round(Math.min(x, geo.usableWidthMm - w) * 10) / 10), mounting };
    if (w > geo.usableWidthMm + EPS) candidate.xMm = 0; // overhangs: drawn centred, the stats warn
    const check = checkPlacement({ rack: design.rack, placements: [...placements, ...out] }, candidate, catalog);
    // Collisions with neighbours outside the mount don't matter here (the mount's own check covers its space).
    if (check.ok || check.problems.every((p) => p.code === 'collision' || p.code === 'too-wide')) out.push(candidate);
    x += w + gap;
  }
  return out;
}

/** Printed mount placements that currently hold something. */
export function mountChildren(design: Pick<Design, 'placements'>, mountId: string, catalog: Catalog): PlacedPart[] {
  const mount = design.placements.find((p) => p.id === mountId);
  if (!mount || !isPrintedMount(catalog.get(mount.partId))) return [];
  return design.placements.filter((p) => p.parentId === mountId);
}

export interface RehomeResult {
  placements: PlacedPart[];
  /** Devices moved out of the mount, and where to. */
  moved: { id: string; name: string; where: 'shelf' | 'rack' | 'wall' }[];
  /** Devices with nowhere to go (removed with the mount). */
  removed: { id: string; name: string }[];
}

/**
 * Remove a mount but keep what it holds: each device moves to the nearest
 * free shelf, else the nearest free rack space, else the wall (when shown).
 */
export function removeMountKeepDevices(design: Pick<Design, 'rack' | 'placements'>, mountId: string, catalog: Catalog): RehomeResult {
  const mount = design.placements.find((p) => p.id === mountId);
  const children = design.placements.filter((p) => p.parentId === mountId);
  let placements = design.placements.filter((p) => p.id !== mountId && p.parentId !== mountId);
  const moved: RehomeResult['moved'] = [];
  const removed: RehomeResult['removed'] = [];
  const nearU = mount?.bottomU ?? 1;
  for (const child of children) {
    const part = catalog.get(child.partId);
    const name = displayName(child, part);
    const d = { rack: design.rack, placements };
    const shelves = placements
      .filter((p) => p.parentId === undefined && !p.wall && catalog.get(p.partId)?.shelf && !isPrintedMount(catalog.get(p.partId)))
      .sort((a, b) => Math.abs(a.bottomU - nearU) - Math.abs(b.bottomU - nearU));
    let slot: PlacedPart | null = null;
    let where: 'shelf' | 'rack' | 'wall' = 'shelf';
    for (const shelf of shelves) {
      const s = findShelfSlot(d, catalog, child.partId, shelf.id, child.id);
      if (s && s.parentId === shelf.id) {
        slot = s;
        break;
      }
    }
    if (!slot) {
      slot = findFreeSlot(d, catalog, child.partId, 'front', nearU, child.id);
      where = 'rack';
    }
    if (!slot && design.rack.wall) {
      slot = findWallSlot(d, catalog, child.partId, nearU, child.id);
      where = 'wall';
    }
    if (!slot) {
      removed.push({ id: child.id, name });
      continue;
    }
    const next: PlacedPart = { ...child, ...slot, id: child.id };
    if (slot.parentId === undefined) delete next.parentId;
    if (!slot.wall) delete next.wall;
    placements = [...placements, next];
    moved.push({ id: child.id, name, where });
  }
  // Keep the original order for survivors.
  const order = new Map(design.placements.map((p, i) => [p.id, i]));
  placements.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { placements, moved, removed };
}
