/**
 * Drag & drop wiring between dnd-kit and the placement engine.
 *
 * dnd-kit tracks the pointer; we convert its client coordinates into rack
 * SVG millimetres (through the canvas's pan / zoom transform) and feed them to
 * `resolveDrop`, which snaps and validates. The result is stored in
 * `useDragStore` so the canvas can draw a ghost and the tooltip can explain
 * collisions.
 */
import { TouchSensor, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core';
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
import { addNewPlacement } from '../../lib/actions';
import { toast } from '../../lib/toast';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useDragStore } from '../../store/dragStore';
import { useUiStore } from '../../store/uiStore';
import { clientToSvg, overCanvas } from '../../store/viewStore';
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

/** Over the rack drawing, within the visible canvas (the drawing can extend under the sidebars). */
function isOverRack(p: { x: number; y: number }): boolean {
  const r = rackSvgRef.current?.getBoundingClientRect();
  return !!r && overCanvas(p) && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
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
  if (!startPointer) return;
  updateDrag({ x: startPointer.x + e.delta.x, y: startPointer.y + e.delta.y });
}

/** Re-resolve the drop at the last pointer position (after the view auto-pans under it). */
export function refreshDrag(): void {
  const p = useDragStore.getState().pointer;
  if (p) updateDrag(p);
}

function updateDrag(pointer: { x: number; y: number }): void {
  const drag = useDragStore.getState();
  const active = drag.active;
  if (!active) return;
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
    if (c.partId !== existing?.partId) toast(turnedMessage(c.partId, !!c.wall));
    else if (c.wall && !existing?.wall) toast('Mounted on the wall');
    else if (c.parentId && existing?.parentId !== c.parentId) toast('Placed on shelf');
    return;
  }

  const id = newId('p_');
  if (useCatalogStore.getState().catalog.get(c.partId)?.printed) {
    addNewPlacement({ ...c, id });
    return;
  }
  store.addPlacement({ ...c, id });
  useUiStore.getState().select(id);
  if (c.partId !== active.partId) toast(turnedMessage(c.partId, !!c.wall));
  else if (c.wall) return;
  else if (c.parentId) toast('Placed on shelf');
}

/** The device was turned to make it fit (the shelf, the room above it, or the wall). */
export function turnedMessage(partId: string, wall = false): string {
  const where = wall ? 'on the wall' : 'there';
  return partId.endsWith(SIDE_SUFFIX) ? `Laid on its side to fit ${where} (R to stand it up)` : `Stood upright to fit ${where}`;
}

export function handleDragCancel(): void {
  startPointer = null;
  useDragStore.getState().end();
}

/**
 * dnd-kit's TouchSensor, but a second finger landing cancels the drag (pending
 * or started), so a two-finger pan on the rack never drags a device.
 */
export class OneFingerTouchSensor extends TouchSensor {
  constructor(props: ConstructorParameters<typeof TouchSensor>[0]) {
    super(props);
    const doc = (props.event.target as Node | null)?.ownerDocument ?? document;
    let done = false;
    const stop = () => {
      done = true;
      doc.removeEventListener('touchstart', onStart, true);
      doc.removeEventListener('touchend', onEnd, true);
      doc.removeEventListener('touchcancel', onEnd, true);
    };
    const onStart = (e: TouchEvent) => {
      if (done || e.touches.length < 2) return;
      stop();
      // handleCancel is private in the typings but is the sensor's own abort path.
      (this as unknown as { handleCancel(): void }).handleCancel();
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) stop();
    };
    doc.addEventListener('touchstart', onStart, true);
    doc.addEventListener('touchend', onEnd, true);
    doc.addEventListener('touchcancel', onEnd, true);
  }
}
