import { occupancyOf, type CableEnd, type Catalog, type Design, type Part, type PlacedPart } from '@rackplanner/shared';
import { portPositions } from '../faceplates/Faceplate';
import { deviceBox, faceSeen, rackLayout, shelfTrayMm, type DeviceBox, type View } from './geometry';

export interface EndPoint {
  x: number;
  y: number;
  /** Device face is drawn in this view. */
  visible: boolean;
  /** Lands on a drawn port (otherwise the device centre). */
  onPort: boolean;
}

/** Drawing box of a placement (same as RackView), or null. */
export function placementBox(design: Pick<Design, 'rack' | 'placements'>, catalog: Catalog, p: PlacedPart, view: View): { box: DeviceBox; part: Part; visible: boolean; face: View } | null {
  const part = catalog.get(p.partId);
  const occ = part && occupancyOf(design.placements, p, catalog);
  if (!part || !occ) return null;
  let lift = 0;
  if (p.parentId !== undefined) {
    const shelf = design.placements.find((q) => q.id === p.parentId);
    const shelfPart = shelf && catalog.get(shelf.partId);
    if (shelfPart) lift = shelfTrayMm(shelfPart);
  }
  const box = deviceBox(rackLayout(design.rack), part, occ.u0, occ.u1, occ.x0, view, p.parentId !== undefined, lift);
  return { box, part, visible: occ.faces.includes(view), face: faceSeen(occ.faces, view) };
}

/** Where a cable end attaches in a view (SVG mm coordinates). */
export function cableEndPoint(design: Pick<Design, 'rack' | 'placements'>, catalog: Catalog, end: CableEnd, view: View): EndPoint | null {
  const p = design.placements.find((q) => q.id === end.placementId);
  const info = p && placementBox(design, catalog, p, view);
  if (!info) return null;
  const { box, part, visible, face } = info;
  if (end.port) {
    // Ports live on one face; a port on the face we're looking at is visible.
    const slot = portPositions(part, box.w, box.h, box.ears, face).find((s) => s.type === end.port!.type && s.index === end.port!.index);
    if (slot) return { x: box.x + slot.x + slot.w / 2, y: box.y + slot.y + slot.h / 2, visible: true, onPort: true };
    return { x: box.x + box.w / 2, y: box.y + box.h / 2, visible: false, onPort: false };
  }
  return { x: box.x + box.w / 2, y: box.y + box.h / 2, visible, onPort: false };
}

/** Patch-cable curve that sags below its ends. */
export function cablePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const sag = Math.min(70, 10 + dx * 0.12 + dy * 0.25);
  return `M${a.x} ${a.y} C${a.x} ${a.y + sag} ${b.x} ${b.y + sag} ${b.x} ${b.y}`;
}

/** Straight-line distance between two ends in mm (front view geometry). */
export function cableDistanceMm(design: Pick<Design, 'rack' | 'placements'>, catalog: Catalog, a: CableEnd, b: CableEnd): number | null {
  const views: View[] = ['front', 'rear'];
  for (const v of views) {
    const pa = cableEndPoint(design, catalog, a, v);
    const pb = cableEndPoint(design, catalog, b, v);
    if (pa && pb && pa.visible && pb.visible) return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  }
  const pa = cableEndPoint(design, catalog, a, 'front');
  const pb = cableEndPoint(design, catalog, b, 'front');
  // Front-to-rear runs go through the rack: add a typical depth crossing.
  return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) + 500 : null;
}
