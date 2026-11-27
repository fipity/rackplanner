/**
 * The rack canvas's pan / zoom state. Kept apart from the UI store so a pan
 * never re-renders the rack: RackCanvas writes the transform straight to the
 * DOM (once per animation frame); only small widgets (zoom %, minimap
 * rectangle, "Back to rack") subscribe to it.
 */
import { create } from 'zustand';
import { readLocal, writeLocal } from '../lib/storage';
import { useUiStore } from './uiStore';
import {
  centreOn,
  constrain,
  fitRect,
  fromSaved,
  isVisible,
  screenToWorld,
  toSaved,
  zoomAt,
  type Pt,
  type Rect,
  type SavedView,
  type Size,
  type ViewTransform,
} from '../components/rack/viewport';

interface ViewState {
  t: ViewTransform;
  size: Size;
  /** The whole drawing in world px (rack plus wall). */
  content: Rect;
  /** SVG user-space x of world x = 0 (the drawing's viewBox starts left of 0 when the wall is shown). */
  svgOriginX: number;
  /** Design whose view this is (for saving it). */
  designId: string | null;
  /** A pan / pinch is in progress (the canvas may cheapen rendering). */
  interacting: boolean;
  /** Set once the view has been fitted or restored for the current design and size. */
  ready: boolean;
}

export const useViewStore = create<ViewState>()(() => ({
  t: { x: 0, y: 0, k: 1 },
  size: { w: 0, h: 0 },
  content: { x: 0, y: 0, w: 1, h: 1 },
  svgOriginX: 0,
  designId: null,
  interacting: false,
  ready: false,
}));

const get = () => useViewStore.getState();
const keyOf = (id: string) => `rackplanner.view.${id}`;

/** Apply a transform (soft-bounded so the rack can't be lost). */
export function setTransform(t: ViewTransform): void {
  const s = get();
  const next = s.size.w > 0 ? constrain(t, s.content, s.size) : t;
  if (next.x === s.t.x && next.y === s.t.y && next.k === s.t.k) return;
  useViewStore.setState({ t: next });
  scheduleSave();
}

export const centre = (): Pt => ({ x: get().size.w / 2, y: get().size.h / 2 });

export function zoomAround(factor: number, anchor: Pt = centre()): void {
  const { t } = get();
  setTransform(zoomAt(t, t.k * factor, anchor));
}

export function zoomTo(k: number, anchor: Pt = centre()): void {
  setTransform(zoomAt(get().t, k, anchor));
}

export function panView(dx: number, dy: number): void {
  const { t } = get();
  setTransform({ ...t, x: t.x + dx, y: t.y + dy });
}

/** Fit the whole drawing. */
export function fitToScreen(): void {
  const s = get();
  if (s.size.w > 0) setTransform(fitRect(s.content, s.size));
}

/** 100%, centred on the drawing. */
export function resetView(): void {
  const s = get();
  setTransform(centreOn({ x: s.content.x + s.content.w / 2, y: s.content.y + s.content.h / 2 }, 1, s.size));
}

/** Fit a world rect (e.g. the selection), not zooming in past 400%. */
export function zoomToRect(r: Rect): void {
  const s = get();
  if (s.size.w > 0) setTransform(fitRect(r, s.size, 48, 4));
}

/** Bring the drawing back on screen without changing the zoom. */
export function backToRack(): void {
  const s = get();
  setTransform(centreOn({ x: s.content.x + s.content.w / 2, y: s.content.y + s.content.h / 2 }, s.t.k, s.size));
}

export const contentVisible = (s: ViewState = get()): boolean => s.size.w === 0 || isVisible(s.t, s.content, s.size);

// ---------------------------------------------------------------------------
// Canvas element and coordinate conversion
// ---------------------------------------------------------------------------

/** The canvas element (registered by RackCanvas). */
export const canvasRef: { current: HTMLElement | null } = { current: null };

/** Client (viewport) coordinates → canvas-relative screen coordinates. */
export function clientToScreen(p: Pt): Pt | null {
  const el = canvasRef.current;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: p.x - r.left, y: p.y - r.top };
}

/** Client coordinates → the rack SVG's user units (mm), through the current view transform. */
export function clientToSvg(p: Pt): Pt | null {
  const sp = clientToScreen(p);
  if (!sp) return null;
  const w = screenToWorld(get().t, sp);
  return { x: w.x + get().svgOriginX, y: w.y };
}

/** Is a client point over the visible canvas? */
export function overCanvas(p: Pt): boolean {
  const r = canvasRef.current?.getBoundingClientRect();
  return !!r && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

/** A client-space rect (e.g. a device's bounding box) in world coordinates. */
export function clientRectToWorld(r: DOMRect): Rect | null {
  const a = clientToScreen({ x: r.left, y: r.top });
  const b = clientToScreen({ x: r.right, y: r.bottom });
  if (!a || !b) return null;
  const { t } = get();
  const wa = screenToWorld(t, a);
  const wb = screenToWorld(t, b);
  return { x: wa.x, y: wa.y, w: wb.x - wa.x, h: wb.y - wa.y };
}

// ---------------------------------------------------------------------------
// Per-design view memory
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = get();
    if (s.designId && s.ready && s.size.w > 0) writeLocal(keyOf(s.designId), JSON.stringify(toSaved(s.t, s.size)));
  }, 250);
}

function readSaved(id: string): SavedView | null {
  try {
    const raw = readLocal(keyOf(id));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedView>;
    return typeof v.cx === 'number' && typeof v.cy === 'number' && typeof v.k === 'number' ? (v as SavedView) : null;
  } catch {
    return null;
  }
}

/**
 * Called by the canvas when its size or the drawing changes. The first time a
 * design is shown the saved view is restored (or the rack is fitted); later
 * size changes keep the same centre and zoom.
 */
export function syncCanvas(designId: string, size: Size, content: Rect, svgOriginX: number): void {
  const s = get();
  if (size.w <= 0 || size.h <= 0) return;
  if (s.designId !== designId || !s.ready) {
    const saved = readSaved(designId);
    useViewStore.setState({ designId, size, content, svgOriginX, ready: true });
    setTransform(saved ? fromSaved(saved, size) : fitRect(content, size));
    return;
  }
  // Same design: keep what's in the middle of the screen in the middle.
  const keep = toSaved(s.t, s.size);
  useViewStore.setState({ size, content, svgOriginX });
  if (s.size.w !== size.w || s.size.h !== size.h) setTransform(fromSaved(keep, size));
  else setTransform(s.t);
}

/** Forget the current design (leaving the editor). */
export function releaseView(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    const s = get();
    if (s.designId && s.ready && s.size.w > 0) writeLocal(keyOf(s.designId), JSON.stringify(toSaved(s.t, s.size)));
  }
  useViewStore.setState({ designId: null, ready: false });
}

/** Fit the selected device (Shift+2). Does nothing without a selection on screen. */
export function zoomToSelection(): void {
  const id = useUiStore.getState().selectedId;
  const el = id ? canvasRef.current?.querySelector(`[data-pid="${CSS.escape(id)}"]`) : null;
  const r = el ? clientRectToWorld(el.getBoundingClientRect()) : null;
  if (r && r.w > 0 && r.h > 0) zoomToRect(r);
}

/**
 * Switch between the front and rear views. With a part selected, it stays
 * in the middle of the screen at the same zoom (it's mirrored left / right
 * in the other view; gear on the other face is found by its see-through copy).
 */
export function swapView(): void {
  const ui = useUiStore.getState();
  ui.setView(ui.view === 'front' ? 'rear' : 'front');
  const id = ui.selectedId;
  if (!id) return;
  // Wait for the other view to render (two frames), then centre on the part.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const root = canvasRef.current;
      const sel = CSS.escape(id);
      const el = root?.querySelector(`[data-pid="${sel}"]`) ?? root?.querySelector(`[data-oid="${sel}"]`);
      const r = el ? clientRectToWorld(el.getBoundingClientRect()) : null;
      if (!r || r.w <= 0 || r.h <= 0) return;
      const s = get();
      setTransform(centreOn({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, s.t.k, s.size));
    }),
  );
}
