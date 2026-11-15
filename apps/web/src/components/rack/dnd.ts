/**
 * Drag & drop wiring between dnd-kit and the placement engine.
 *
 * dnd-kit tracks the pointer; we convert its client coordinates into rack
 * SVG millimetres (via the rack <svg>'s screen CTM) and feed them to
 * `resolveDrop`, which snaps and validates. The result is stored in
 * `useDragStore` so the canvas can draw a ghost and the tooltip can explain
 * collisions.
 */
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SIDE_SUFFIX,
  U_MM,
  newId,
  occupancyOf,
  partWidthMm,
  resolveDrop,
  wallWidthMm,
  type Mounting,
  type Part,
} from '@rackplanner/shared';
import { toast } from '../../lib/toast';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useDragStore } from '../../store/dragStore';
import { useUiStore } from '../../store/uiStore';
import { isOverWall, rackLayout, svgToWallX, svgToXMm, uTopToY, wallXToSvg, xToSvg, yToUTop } from './geometry';

export type DragData = { kind: 'catalog'; partId: string } | { kind: 'placement'; placementId: string };

/** The interactive rack <svg>, registered by RackCanvas. */
export const rackSvgRef: { current: SVGSVGElement | null } = { current: null };

function isDragData(v: unknown): v is DragData {
  if (typeof v !== 'object' || v === null || !('kind' in v)) return false;
  return v.kind === 'catalog' || v.kind === 'placement';
}

function clientPoint(e: Event): { x: number; y: number } | null {
  if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
    const t = e.touches[0] ?? e.changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }
  if (e instanceof MouseEvent || (typeof PointerEvent !== 'undefined' && e instanceof PointerEvent)) {
    return { x: e.clientX, y: e.clientY };
  }
  return null;
}

function clientToSvg(p: { x: number; y: number }): { x: number; y: number } | null {
  const svg = rackSvgRef.current;
  const ctm = svg?.getScreenCTM();
  if (!svg || !ctm) return null;
  const pt = new DOMPoint(p.x, p.y).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

function isOverRack(p: { x: number; y: number }): boolean {
  const r = rackSvgRef.current?.getBoundingClientRect();
  return !!r && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

function defaultMounting(part: Part): Mounting {
  if (part.mounting === 'full-depth') return 'full-depth';
  // Dropping onto the rear view mounts at the rear.
  return useUiStore.getState().view === 'rear' ? 'rear' : 'front';
}

let startPointer: { x: number; y: number } | null = null;

export function handleDragStart(e: DragStartEvent): void {
  const data = e.active.data.current;
  if (!isDragData(data)) return;
  startPointer = clientPoint(e.activatorEvent);
  const { catalog } = useCatalogStore.getState();
  const { design } = useDesignStore.getState();
  const view = useUiStore.getState().view;

  if (data.kind === 'catalog') {
    const part = catalog.get(data.partId);
    if (!part) return;
    useDragStore.getState().start({
      kind: 'catalog',
      partId: part.id,
      mounting: defaultMounting(part),
      grabDx: partWidthMm(part) / 2,
      grabDy: (part.heightU * U_MM) / 2,
    });
    return;
  }

  const placement = design.placements.find((p) => p.id === data.placementId);
  const part = placement && catalog.get(placement.partId);
  const occ = placement && occupancyOf(design.placements, placement, catalog);
  if (!placement || !part || !occ) return;
  const layout = rackLayout(design.rack);
  const ptr = startPointer && clientToSvg(startPointer);
  const left = occ.wall ? wallXToSvg(layout, occ.x0, partWidthMm(part), view) : xToSvg(layout, occ.x0, partWidthMm(part), view);
  const top = uTopToY(layout, occ.u1);
  useUiStore.getState().select(placement.id);
  useDragStore.getState().start({
    kind: 'placement',
    partId: part.id,
    placementId: placement.id,
    mounting: placement.parentId !== undefined ? defaultMounting(part) : placement.mounting,
    grabDx: ptr ? ptr.x - left : partWidthMm(part) / 2,
    grabDy: ptr ? ptr.y - top : (part.heightU * U_MM) / 2,
  });
}

export function handleDragMove(e: DragMoveEvent): void {
  const drag = useDragStore.getState();
  const active = drag.active;
  if (!active || !startPointer) return;
  const pointer = { x: startPointer.x + e.delta.x, y: startPointer.y + e.delta.y };
  const over = isOverRack(pointer);
  const svgPt = over ? clientToSvg(pointer) : null;
  if (!svgPt) {
    drag.update({ resolution: null, overRack: false, pointer });
    return;
  }
  const { catalog } = useCatalogStore.getState();
  const { design } = useDesignStore.getState();
  const part = catalog.get(active.partId);
  if (!part) return;
  const layout = rackLayout(design.rack);
  const view = useUiStore.getState().view;
  const topY = svgPt.y - active.grabDy;
  const rawBottomU = yToUTop(layout, topY) - part.heightU;
  // The pointer, not the device's edge, decides between the wall and the rack.
  const wall = wallWidthMm(design, catalog) > 0 && isOverWall(layout, svgPt.x, view);
  const left = svgPt.x - active.grabDx;
  const rawXMm = wall ? svgToWallX(layout, left, partWidthMm(part), view) : svgToXMm(layout, left, partWidthMm(part), view);
  const resolution = resolveDrop(design, catalog, {
    partId: part.id,
    ...(active.placementId ? { placementId: active.placementId } : {}),
    rawBottomU,
    rawXMm,
    mounting: active.mounting,
    view,
    wall,
  });
  drag.update({ resolution, overRack: true, pointer });
}

export function handleDragEnd(_e: DragEndEvent): void {
  const { active, resolution, overRack } = useDragStore.getState();
  useDragStore.getState().end();
  startPointer = null;
  if (!active || !resolution || !overRack || !resolution.check.ok) return;
  const store = useDesignStore.getState();
  const c = resolution.candidate;

  if (active.kind === 'placement' && active.placementId) {
    const existing = store.design.placements.find((p) => p.id === active.placementId);
    if (
      existing &&
      existing.bottomU === c.bottomU &&
      existing.xMm === c.xMm &&
      existing.mounting === c.mounting &&
      existing.parentId === c.parentId &&
      existing.partId === c.partId &&
      existing.wall === c.wall
    ) {
      return; // no-op move: don't pollute undo history
    }
    store.updatePlacement(active.placementId, { partId: c.partId, bottomU: c.bottomU, xMm: c.xMm, mounting: c.mounting, parentId: c.parentId, wall: c.wall });
    if (c.wall && !existing?.wall) toast('Mounted on the wall');
    else if (c.partId !== existing?.partId) toast(turnedMessage(c.partId));
    else if (c.parentId && existing?.parentId !== c.parentId) toast('Placed on shelf');
    return;
  }

  const id = newId('p_');
  store.addPlacement({ ...c, id });
  useUiStore.getState().select(id);
  if (c.wall) return;
  if (c.partId !== active.partId) toast(turnedMessage(c.partId));
  else if (c.parentId) toast('Placed on shelf');
}

/** The drop turned the device to make it fit the shelf. */
function turnedMessage(partId: string): string {
  return partId.endsWith(SIDE_SUFFIX) ? 'Laid on its side to fit the shelf (R to stand it up)' : 'Stood upright to fit the shelf';
}

export function handleDragCancel(): void {
  startPointer = null;
  useDragStore.getState().end();
}
