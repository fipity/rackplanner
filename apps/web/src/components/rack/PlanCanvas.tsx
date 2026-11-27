/**
 * The Shelves tab: top-down shelf plans on a canvas that pans and zooms like
 * the rack view, through the same view store, so the toolbar zoom, the zoom
 * %, F / 0 / Shift+2, arrow keys and "Back to shelves" all work here and the
 * view is remembered per design (saved apart from the rack view's).
 *
 *  - Devices: click to select (Shift / Ctrl + click adds to the selection),
 *    drag along their shelf or onto another shelf (mouse or pen).
 *  - A shelf: click its tray or title to select it.
 *  - Pan: drag empty space or a tray, middle / right drag, Space + drag,
 *    one or two fingers; pinch or the mouse wheel zooms (per the wheel setting).
 */
import {
  checkPlacement,
  partWidthMm,
  shelfGeometry,
  shelfXCandidates,
  type Catalog,
  type Design,
  type PlacedPart,
} from '@rackplanner/shared';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from '../../lib/toast';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { canvasRef, panView, setTransform, syncCanvas, useViewStore } from '../../store/viewStore';
import { cx } from '../ui';
import { CanvasOverlay } from './CanvasOverlay';
import { ShelfPlanView, type PlanDrag } from './ShelfPlanView';
import { mouseWheelZoomFactor, screenToWorld, wheelPixels, wheelSource, wheelZoomFactor, zoomAt, type Pt, type ViewTransform, type WheelSource } from './viewport';

/** Distance a press must move before it becomes a pan or a drag (px); less is a click. */
const SLOP = 3;
/** The shelf plans start at 100%, where they've always been drawn (top, centred). */
const HOME: ViewTransform = { x: 0, y: 0, k: 1 };

type Gesture =
  | { kind: 'pan'; id: number; last: Pt; start: Pt; armed: boolean; moved: boolean }
  | { kind: 'pinch'; a: number; b: number; t0: ViewTransform; d0: number; w0: Pt }
  | { kind: 'item'; id: number; placementId: string; start: Pt; grabMm: number; moved: boolean; additive: boolean };

/** The shelf svg under a client point, and the point in its plan coordinates (mm across the usable tray). */
function shelfAt(clientX: number, clientY: number): { shelfId: string; xMm: number } | null {
  const svg = document.elementFromPoint(clientX, clientY)?.closest('svg[data-shelf-svg]') as SVGSVGElement | null;
  const ctm = svg?.getScreenCTM();
  if (!svg || !ctm) return null;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { shelfId: svg.getAttribute('data-shelf-svg')!, xMm: p.x };
}

/** Where a device dragged to `rawX` on `shelfId` would land: the nearest free spot, else the raw spot (invalid). */
function planDrop(design: Pick<Design, 'rack' | 'placements'>, catalog: Catalog, p: PlacedPart, shelfId: string, rawX: number): { drag: PlanDrag; candidate: PlacedPart | null; problem?: string } {
  const part = catalog.get(p.partId);
  const shelf = design.placements.find((q) => q.id === shelfId);
  const geo = shelf && shelfGeometry(design.placements, shelf, catalog);
  if (!part || !shelf || !geo || part.formFactor !== 'desktop') {
    return { drag: { placementId: p.id, shelfId, xMm: rawX, ok: false }, candidate: null, problem: part?.formFactor !== 'desktop' ? 'Only desktop gear sits on a shelf' : undefined };
  }
  const w = partWidthMm(part);
  const clampX = Math.max(0, Math.min(rawX, Math.max(0, geo.usableWidthMm - w)));
  const base: PlacedPart = { ...p, parentId: shelf.id, bottomU: geo.baseU, mounting: geo.faces.includes('front') ? 'front' : 'rear' };
  delete base.wall;
  const xs = shelfXCandidates(design.placements, geo, part, catalog, [p.id]).sort((a, b) => Math.abs(a - clampX) - Math.abs(b - clampX));
  for (const xMm of xs) {
    // Only snap to a free spot close by; further away, show the clash where the pointer is.
    if (Math.abs(xMm - clampX) > Math.max(40, w / 2)) break;
    const candidate = { ...base, xMm: Math.round(xMm * 10) / 10 };
    if (checkPlacement(design, candidate, catalog).ok) return { drag: { placementId: p.id, shelfId, xMm: candidate.xMm, ok: true }, candidate };
  }
  const candidate = { ...base, xMm: Math.round(clampX * 10) / 10 };
  const check = checkPlacement(design, candidate, catalog);
  return { drag: { placementId: p.id, shelfId, xMm: candidate.xMm, ok: check.ok }, candidate: check.ok ? candidate : null, problem: check.problems[0]?.message };
}

export function PlanCanvas({ design, catalog, leds }: { design: Design; catalog: Catalog; leds: boolean }) {
  const select = useUiStore((s) => s.select);
  const toggleSelect = useUiStore((s) => s.toggleSelect);
  const selectedIds = useUiStore((s) => s.selectedIds);
  const view = useUiStore((s) => s.view);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [drag, setDrag] = useState<PlanDrag | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Pt>());
  const suppressClick = useRef(false);
  const hovering = useRef(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    canvasRef.current = el;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (canvasRef.current === el) canvasRef.current = null;
    };
  }, []);

  // Tell the view store about the canvas and the plans (restores this design's plan view, or starts at
  // home). Runs after every render but only reports a change in size or in the plans' extent.
  const synced = useRef('');
  useLayoutEffect(() => {
    const grid = stageRef.current?.firstElementChild as HTMLElement | null;
    if (!grid || size.w <= 0) return;
    const content = { x: grid.offsetLeft, y: grid.offsetTop, w: Math.max(1, grid.offsetWidth), h: Math.max(1, grid.offsetHeight) };
    const key = JSON.stringify([design.id, size, content]);
    if (key === synced.current && useViewStore.getState().designId === `${design.id}:plan`) return;
    synced.current = key;
    syncCanvas(`${design.id}:plan`, size, content, 0, { home: HOME });
  });

  // Write the transform straight to the stage once per frame (as the rack canvas does).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const { t } = useViewStore.getState();
      stage.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    };
    apply();
    const unsub = useViewStore.subscribe((s, prev) => {
      if (s.t !== prev.t) frame ||= requestAnimationFrame(apply);
    });
    return () => {
      unsub();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Wheel: native listener so the page itself never scrolls or zooms over the plans.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let last: { source: WheelSource; at: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = wheelPixels(e, { w: el.clientWidth, h: el.clientHeight });
      const { t } = useViewStore.getState();
      const now = performance.now();
      const mode = useUiStore.getState().wheelMode;
      const source: WheelSource = mode === 'zoom' ? 'mouse' : mode === 'pan' ? 'trackpad' : wheelSource(e as WheelEvent & { wheelDeltaY?: number }, now, last);
      last = { source, at: now };
      const r = el.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) setTransform(zoomAt(t, t.k * wheelZoomFactor(d.y), at));
      else if (e.shiftKey || source !== 'mouse') panView(-d.x, -d.y);
      else setTransform(zoomAt(t, t.k * mouseWheelZoomFactor(e), at));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Hold Space to pan from anywhere (while the pointer is over the plans).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tgt = e.target;
      if (e.code !== 'Space' || !hovering.current || (tgt instanceof HTMLElement && (tgt.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tgt.tagName)))) return;
      e.preventDefault();
      if (!e.repeat) setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceHeld(false);
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const startPan = (e: ReactPointerEvent, armed: boolean) => {
    const p = local(e);
    gesture.current = { kind: 'pan', id: e.pointerId, last: p, start: p, armed, moved: false };
    if (armed) {
      containerRef.current?.setPointerCapture(e.pointerId);
      setPanning(true);
      useViewStore.setState({ interacting: true });
    }
  };
  /** Ignore the click that ends this gesture (if the browser sends one at all: after a capture it may not). */
  const swallowClick = () => {
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
  };
  const endGesture = () => {
    const g = gesture.current;
    if ((g?.kind === 'pan' || g?.kind === 'item') && g.moved) swallowClick();
    gesture.current = null;
    setPanning(false);
    setDrag(null);
    useViewStore.setState({ interacting: false });
  };

  return (
    <div
      ref={containerRef}
      data-plan-canvas
      className={cx(
        'relative h-full w-full touch-none overflow-hidden overscroll-none',
        panning ? 'cursor-grabbing [&_*]:!cursor-grabbing' : spaceHeld && 'cursor-grab [&_*]:!cursor-grab',
        drag && 'cursor-grabbing [&_*]:!cursor-grabbing',
      )}
      onPointerEnter={() => (hovering.current = true)}
      onPointerLeave={() => (hovering.current = false)}
      onClick={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        // A click on a shelf's tray or title selects the shelf; empty space deselects.
        const shelfId = e.target instanceof Element ? e.target.closest('[data-plan-shelf]')?.getAttribute('data-plan-shelf') : null;
        if (shelfId && (e.shiftKey || e.ctrlKey || e.metaKey)) toggleSelect(shelfId);
        else select(shelfId ?? null);
      }}
      onContextMenu={(e) => e.preventDefault()}
      // The browser's own drag-and-drop of SVG content would cancel the pointer mid-drag.
      onDragStart={(e) => e.preventDefault()}
      onPointerDownCapture={(e) => {
        const p = local(e);
        if (e.pointerType === 'touch') {
          touches.current.set(e.pointerId, p);
          if (touches.current.size === 2) {
            const [a, b] = [...touches.current.keys()];
            const pa = touches.current.get(a!)!;
            const pb = touches.current.get(b!)!;
            const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
            const t0 = useViewStore.getState().t;
            gesture.current = { kind: 'pinch', a: a!, b: b!, t0, d0: Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y)), w0: screenToWorld(t0, mid) };
            setDrag(null);
            setPanning(true);
          } else if (touches.current.size === 1) startPan(e, false); // a tap on a device still selects it (click)
          return;
        }
        if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceHeld)) {
          e.preventDefault();
          startPan(e, true);
          return;
        }
        if (e.button !== 0) return;
        const item = e.target instanceof Element ? e.target.closest('[data-plan-item]')?.getAttribute('data-plan-item') : null;
        if (item) {
          // Where on the device it was grabbed (a shelf item's plan x is its xMm).
          const placement = design.placements.find((q) => q.id === item);
          const at = shelfAt(e.clientX, e.clientY);
          gesture.current = { kind: 'item', id: e.pointerId, placementId: item, start: p, grabMm: at && placement ? at.xMm - placement.xMm : 0, moved: false, additive: e.shiftKey || e.ctrlKey || e.metaKey };
          e.preventDefault(); // no text selection or native drag
          containerRef.current?.setPointerCapture(e.pointerId);
          return;
        }
        startPan(e, false); // empty space or a tray: pans once it moves; a click selects / deselects
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, local(e));
        if (g?.kind === 'pinch') {
          const pa = touches.current.get(g.a);
          const pb = touches.current.get(g.b);
          if (!pa || !pb) return;
          const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
          const k = zoomAt(g.t0, g.t0.k * (Math.hypot(pa.x - pb.x, pa.y - pb.y) / g.d0), mid).k;
          setTransform({ k, x: mid.x - g.w0.x * k, y: mid.y - g.w0.y * k });
          return;
        }
        if (!g || g.id !== e.pointerId) return;
        const p = local(e);
        if (g.kind === 'item') {
          if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < SLOP) return;
          g.moved = true;
          const placement = design.placements.find((q) => q.id === g.placementId);
          if (!placement) return;
          const at = shelfAt(e.clientX, e.clientY);
          setDrag(at ? planDrop(design, catalog, placement, at.shelfId, at.xMm - g.grabMm).drag : { placementId: g.placementId, shelfId: null, xMm: 0, ok: false });
          return;
        }
        if (!g.armed) {
          if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < SLOP) return;
          g.armed = true;
          containerRef.current?.setPointerCapture(e.pointerId);
          setPanning(true);
          useViewStore.setState({ interacting: true });
        }
        g.moved = true;
        panView(p.x - g.last.x, p.y - g.last.y);
        g.last = p;
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'touch') touches.current.delete(e.pointerId);
        const g = gesture.current;
        if (g?.kind === 'pinch') {
          if (touches.current.size < 2) endGesture();
          return;
        }
        if (!g || g.id !== e.pointerId) return;
        if (g.kind === 'item') {
          if (!g.moved) {
            if (g.additive) toggleSelect(g.placementId);
            else select(g.placementId);
            swallowClick();
          } else {
            const placement = design.placements.find((q) => q.id === g.placementId);
            const at = shelfAt(e.clientX, e.clientY);
            if (placement && at) {
              const r = planDrop(design, catalog, placement, at.shelfId, at.xMm - g.grabMm);
              if (r.candidate) {
                const c = r.candidate;
                if (c.parentId !== placement.parentId || c.xMm !== placement.xMm) {
                  useDesignStore.getState().updatePlacement(placement.id, { parentId: c.parentId, bottomU: c.bottomU, xMm: c.xMm, mounting: c.mounting, wall: undefined });
                }
                select(placement.id);
              } else toast(r.problem ?? 'No room there', 'error');
            }
          }
        }
        endGesture();
      }}
      onPointerCancel={(e) => {
        if (e.pointerType === 'touch') touches.current.delete(e.pointerId);
        if (gesture.current) endGesture();
      }}
    >
      <div ref={stageRef} data-stage className="absolute top-0 left-0 flex origin-top-left justify-center" style={{ width: size.w || '100%' }}>
        <ShelfPlanView design={design} catalog={catalog} leds={leds} selectedIds={selectedIds} drag={drag} />
      </div>
      <CanvasOverlay design={design} catalog={catalog} view={view} plan />
    </div>
  );
}
