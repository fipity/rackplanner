/**
 * The rack editor's view: one transform from drawing space to the canvas.
 *
 *   screen = world × k + (x, y)
 *
 * "world" is the rack drawing in CSS pixels at 100% (1 px per mm, the SVG's
 * own units shifted so the drawing starts at 0, 0); "screen" is relative to
 * the canvas element's top-left corner. Pure functions only, so the maths is
 * unit-tested and shared by pointer, wheel, keyboard and drag-and-drop code.
 */

export interface ViewTransform {
  x: number;
  y: number;
  /** Scale: CSS px per mm (1 = 100%). */
  k: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
/** Margin kept around content when fitting it (screen px). */
export const FIT_PADDING = 24;

export const clampZoom = (k: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(k) ? k : 1));

export function screenToWorld(t: ViewTransform, p: Pt): Pt {
  return { x: (p.x - t.x) / t.k, y: (p.y - t.y) / t.k };
}

export function worldToScreen(t: ViewTransform, p: Pt): Pt {
  return { x: p.x * t.k + t.x, y: p.y * t.k + t.y };
}

/** Zoom to `k`, keeping the world point under screen point `anchor` where it is. */
export function zoomAt(t: ViewTransform, k: number, anchor: Pt): ViewTransform {
  const nk = clampZoom(k);
  const w = screenToWorld(t, anchor);
  return { k: nk, x: anchor.x - w.x * nk, y: anchor.y - w.y * nk };
}

/** Zoom by a factor around `anchor`. */
export function zoomBy(t: ViewTransform, factor: number, anchor: Pt): ViewTransform {
  return zoomAt(t, t.k * factor, anchor);
}

export function panBy(t: ViewTransform, dx: number, dy: number): ViewTransform {
  return { ...t, x: t.x + dx, y: t.y + dy };
}

/** Transform that fits `content` (world rect) inside the viewport, centred, with padding. */
export function fitRect(content: Rect, size: Size, padding = FIT_PADDING, maxK = MAX_ZOOM): ViewTransform {
  const aw = Math.max(1, size.w - padding * 2);
  const ah = Math.max(1, size.h - padding * 2);
  const k = clampZoom(Math.min(aw / Math.max(1, content.w), ah / Math.max(1, content.h), maxK));
  return centreOn({ x: content.x + content.w / 2, y: content.y + content.h / 2 }, k, size);
}

/** Transform at scale k with world point `c` in the middle of the viewport. */
export function centreOn(c: Pt, k: number, size: Size): ViewTransform {
  const nk = clampZoom(k);
  return { k: nk, x: size.w / 2 - c.x * nk, y: size.h / 2 - c.y * nk };
}

/** Where `content` (world rect) lands on screen. */
export function screenRect(t: ViewTransform, content: Rect): Rect {
  return { x: content.x * t.k + t.x, y: content.y * t.k + t.y, w: content.w * t.k, h: content.h * t.k };
}

/**
 * Soft bounds: the content may go well past the edges (up to one full
 * viewport of empty space on every side), but never further, so it can't be
 * lost or stuck partly off-screen.
 */
export function constrain(t: ViewTransform, content: Rect, size: Size): ViewTransform {
  const r = screenRect(t, content);
  let { x, y } = t;
  // Right edge no further left than one viewport past the left edge, etc.
  if (r.x + r.w < -size.w) x += -size.w - (r.x + r.w);
  if (r.x > 2 * size.w) x -= r.x - 2 * size.w;
  if (r.y + r.h < -size.h) y += -size.h - (r.y + r.h);
  if (r.y > 2 * size.h) y -= r.y - 2 * size.h;
  return x === t.x && y === t.y ? t : { ...t, x, y };
}

/** Is any part of the content on screen? */
export function isVisible(t: ViewTransform, content: Rect, size: Size): boolean {
  const r = screenRect(t, content);
  return r.x < size.w && r.x + r.w > 0 && r.y < size.h && r.y + r.h > 0;
}

/** Wheel delta in pixels (Firefox reports mouse wheels in lines). */
export function wheelPixels(e: { deltaX: number; deltaY: number; deltaMode: number; shiftKey: boolean }, page: Size): Pt {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? page.h : 1;
  let dx = e.deltaX * unit;
  let dy = e.deltaY * unit;
  // Shift + wheel scrolls sideways (some platforms already swap the axes).
  if (e.shiftKey && dx === 0) {
    dx = dy;
    dy = 0;
  }
  return { x: dx, y: dy };
}

/** Zoom factor for a Ctrl/Cmd + wheel or trackpad pinch step: smooth for small deltas, capped for big mouse notches. */
export function wheelZoomFactor(deltaPixelsY: number): number {
  const d = Math.max(-100, Math.min(100, deltaPixelsY));
  return Math.exp(-d * 0.0045);
}

/** A saved view, independent of the canvas size: the world point at the centre and the scale. */
export interface SavedView {
  cx: number;
  cy: number;
  k: number;
}

export function toSaved(t: ViewTransform, size: Size): SavedView {
  const c = screenToWorld(t, { x: size.w / 2, y: size.h / 2 });
  return { cx: Math.round(c.x * 10) / 10, cy: Math.round(c.y * 10) / 10, k: Math.round(t.k * 10000) / 10000 };
}

export function fromSaved(s: SavedView, size: Size): ViewTransform {
  return centreOn({ x: s.cx, y: s.cy }, s.k, size);
}

export type WheelSource = 'mouse' | 'trackpad';

/**
 * Guess whether a wheel event came from a mouse wheel (zooms) or a trackpad
 * two-finger scroll (pans). Browsers don't say, so it goes by the event:
 *  - line or page deltas (Firefox mouse wheels) → mouse;
 *  - any sideways movement → trackpad (a plain wheel has none);
 *  - the legacy wheelDeltaY, where available, is ±120 per notch for wheels
 *    and something else for trackpads (unless it's exactly −3 × deltaY,
 *    which is how Chrome and Safari report trackpad pixels);
 *  - otherwise a big vertical step (≥ 40 px; fractional is fine, display
 *    scaling makes notches like 66.67 px) is a wheel, small steps a trackpad.
 * Events less than `streamGapMs` apart keep the first verdict, so one swipe
 * never flips between panning and zooming.
 */
export function wheelSource(
  e: { deltaX: number; deltaY: number; deltaMode: number; wheelDeltaY?: number | undefined },
  now: number,
  last: { source: WheelSource; at: number } | null,
  streamGapMs = 120,
): WheelSource {
  if (last && now - last.at < streamGapMs) return last.source;
  if (e.deltaMode !== 0) return 'mouse';
  if (Math.abs(e.deltaX) > 0.5) return 'trackpad';
  const legacy = e.wheelDeltaY;
  if (legacy) {
    if (Math.abs(legacy + 3 * e.deltaY) < 0.5 && Math.abs(e.deltaY) < 40) return 'trackpad';
    if (legacy % 120 === 0) return 'mouse';
  }
  return Math.abs(e.deltaY) >= 40 ? 'mouse' : 'trackpad';
}

/** Zoom factor for one mouse-wheel step: about 1.2× per notch, whatever the browser's step size. */
export function mouseWheelZoomFactor(e: { deltaY: number; deltaMode: number }): number {
  const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY;
  return Math.exp(-Math.max(-300, Math.min(300, px)) * 0.0018);
}
