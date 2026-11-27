/**
 * The Shelves tab: top-down shelf plans on a canvas that pans and zooms like
 * the rack view. Drag empty space, middle / right drag or Space + drag to
 * pan; two fingers pan and pinch; the mouse wheel follows the same
 * "wheel zooms / pans" setting as the rack. The view is local to the tab and
 * starts at 100% with the plans where they always were.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Catalog, Design } from '@rackplanner/shared';
import { useUiStore } from '../../store/uiStore';
import { cx } from '../ui';
import { ShelfPlanView } from './ShelfPlanView';
import { constrain, mouseWheelZoomFactor, screenToWorld, wheelPixels, wheelSource, wheelZoomFactor, zoomAt, type Pt, type ViewTransform, type WheelSource } from './viewport';

/** Distance a press must move before it becomes a pan (px); less is a click. */
const PAN_SLOP = 3;

type Gesture =
  | { kind: 'pan'; id: number; last: Pt; start: Pt; armed: boolean; moved: boolean }
  | { kind: 'pinch'; a: number; b: number; t0: ViewTransform; d0: number; w0: Pt };

export function PlanCanvas({ design, catalog, leds }: { design: Pick<Design, 'rack' | 'placements'>; catalog: Catalog; leds: boolean }) {
  const select = useUiStore((s) => s.select);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [t, setT] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Pt>());
  const suppressClick = useRef(false);
  const hovering = useRef(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Apply a transform, soft-bounded (as in the rack view) so the plans can't be lost. */
  const apply = (next: ViewTransform) => {
    const stage = stageRef.current;
    const content = { x: 0, y: 0, w: stage?.offsetWidth ?? size.w, h: stage?.offsetHeight ?? size.h };
    setT(size.w > 0 ? constrain(next, content, size) : next);
  };
  const tRef = useRef(t);
  tRef.current = t;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // Wheel: native listener so the page itself never scrolls or zooms over the plans.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let last: { source: WheelSource; at: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = wheelPixels(e, { w: el.clientWidth, h: el.clientHeight });
      const cur = tRef.current;
      const now = performance.now();
      const mode = useUiStore.getState().wheelMode;
      const source: WheelSource = mode === 'zoom' ? 'mouse' : mode === 'pan' ? 'trackpad' : wheelSource(e as WheelEvent & { wheelDeltaY?: number }, now, last);
      last = { source, at: now };
      const r = el.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) applyRef.current(zoomAt(cur, cur.k * wheelZoomFactor(d.y), at));
      else if (e.shiftKey || source !== 'mouse') applyRef.current({ ...cur, x: cur.x - d.x, y: cur.y - d.y });
      else applyRef.current(zoomAt(cur, cur.k * mouseWheelZoomFactor(e), at));
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

  const startPan = (e: ReactPointerEvent, armed: boolean) => {
    const p = local(e);
    gesture.current = { kind: 'pan', id: e.pointerId, last: p, start: p, armed, moved: false };
    if (armed) {
      containerRef.current?.setPointerCapture(e.pointerId);
      setPanning(true);
    }
  };
  const endGesture = () => {
    if (gesture.current?.kind === 'pan' && gesture.current.moved) suppressClick.current = true;
    gesture.current = null;
    setPanning(false);
  };

  return (
    <div
      ref={containerRef}
      data-plan-canvas
      className={cx(
        'relative h-full w-full touch-none overflow-hidden overscroll-none',
        panning ? 'cursor-grabbing [&_*]:!cursor-grabbing' : cx('cursor-grab', spaceHeld && '[&_*]:!cursor-grab'),
      )}
      onPointerEnter={() => (hovering.current = true)}
      onPointerLeave={() => (hovering.current = false)}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        select(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={(e) => {
        const p = local(e);
        if (e.pointerType === 'touch') {
          touches.current.set(e.pointerId, p);
          if (touches.current.size === 2) {
            const [a, b] = [...touches.current.keys()];
            const pa = touches.current.get(a!)!;
            const pb = touches.current.get(b!)!;
            const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
            gesture.current = { kind: 'pinch', a: a!, b: b!, t0: tRef.current, d0: Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y)), w0: screenToWorld(tRef.current, mid) };
            setPanning(true);
          } else if (touches.current.size === 1) startPan(e, false);
          return;
        }
        if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceHeld)) {
          e.preventDefault();
          startPan(e, true);
        } else if (e.button === 0) startPan(e, false); // pans once it moves; a click still deselects
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
          apply({ k, x: mid.x - g.w0.x * k, y: mid.y - g.w0.y * k });
          return;
        }
        if (g?.kind !== 'pan' || g.id !== e.pointerId) return;
        const p = local(e);
        if (!g.armed) {
          if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < PAN_SLOP) return;
          g.armed = true;
          containerRef.current?.setPointerCapture(e.pointerId);
          setPanning(true);
        }
        g.moved = true;
        const cur = tRef.current;
        apply({ ...cur, x: cur.x + p.x - g.last.x, y: cur.y + p.y - g.last.y });
        g.last = p;
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'touch') touches.current.delete(e.pointerId);
        const g = gesture.current;
        if (g?.kind === 'pinch' ? touches.current.size < 2 : g?.id === e.pointerId) endGesture();
      }}
      onPointerCancel={(e) => {
        if (e.pointerType === 'touch') touches.current.delete(e.pointerId);
        if (gesture.current) endGesture();
      }}
    >
      <div
        ref={stageRef}
        data-stage
        className="absolute top-0 left-0 flex origin-top-left justify-center"
        style={{ width: size.w || '100%', transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
      >
        <ShelfPlanView design={design} catalog={catalog} leds={leds} />
      </div>
    </div>
  );
}
