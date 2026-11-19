import { useDraggable } from '@dnd-kit/core';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useDragStore } from '../../store/dragStore';
import { useUiStore } from '../../store/uiStore';
import { handleCableEndClick } from '../../lib/cableActions';
import { rackSvgRef, refreshDrag, type DragData } from './dnd';
import { uprightPart, wallWidthMm, type PlacedPart, type Part } from '@rackplanner/shared';
import { drawingExtent, rackLayout } from './geometry';
import { RackView, type PlacementWrapperProps, type RackGhost } from './RackView';
import { lodForScale } from '../faceplates/Faceplate';
import { ShelfPlanView } from './ShelfPlanView';
import { cx } from '../ui';
import { canvasRef, clientToSvg, panView, setTransform, syncCanvas, useViewStore } from '../../store/viewStore';
import { mouseWheelZoomFactor, screenToWorld, wheelPixels, wheelSource, wheelZoomFactor, zoomAt, type Pt, type ViewTransform, type WheelSource } from './viewport';
import { CanvasOverlay } from './CanvasOverlay';

/** What a screen reader announces for a device: its label or product name, and how it sits. */
export function placementA11yName(placement: PlacedPart, part: Part): string {
  const name = placement.label?.trim() || part.name;
  const how = [uprightPart(part) ? 'on its side' : null, placement.wall ? 'on the wall' : null].filter(Boolean).join(', ');
  return how ? `${name}, ${how}` : name;
}

function DraggablePlacement({ placement, part, box, children }: PlacementWrapperProps) {
  const data: DragData = { kind: 'placement', placementId: placement.id };
  const cableMode = useUiStore((s) => s.cableMode);
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `placement:${placement.id}`, data, disabled: cableMode });
  const select = useUiStore((s) => s.select);
  return (
    <g
      // dnd-kit types its node ref for HTMLElement, but only uses
      // getBoundingClientRect(), which SVG elements implement too.
      ref={(el) => setNodeRef(el as unknown as HTMLElement | null)}
      {...listeners}
      {...attributes}
      // dnd-kit marks a disabled draggable aria-disabled; in cable mode it's still clickable.
      aria-disabled={cableMode ? undefined : attributes['aria-disabled']}
      aria-roledescription={cableMode ? undefined : attributes['aria-roledescription']}
      role="button"
      data-pid={placement.id}
      aria-label={placementA11yName(placement, part)}
      className={cableMode ? 'cursor-crosshair outline-none' : 'cursor-grab outline-none active:cursor-grabbing'}
      onClick={(e) => {
        e.stopPropagation();
        // In cable mode a click on the device body makes a device-level connection.
        if (cableMode) handleCableEndClick({ placementId: placement.id });
        else select(placement.id);
      }}
    >
      {/* Transparent hit area so gaps in the faceplate are still grabbable. */}
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" />
      {children}
    </g>
  );
}

/** Elements a left-drag must not pan from: devices, ports, cables, controls. */
function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('[role="button"], button, a, input, select, textarea, label, [data-no-pan]');
}

const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** Distance a pointer must move before a press on empty space becomes a pan (px). */
const PAN_SLOP = 3;
/** Drag-and-drop auto-pan: zone near the canvas edges (px) and top speed (px per frame). */
const EDGE = 48;
const EDGE_SPEED = 16;

type Gesture =
  | { kind: 'pan'; id: number; last: Pt; moved: boolean; armed: boolean; start: Pt }
  | { kind: 'pinch'; a: number; b: number; t0: ViewTransform; d0: number; w0: Pt };

export function RackCanvas() {
  const design = useDesignStore((s) => s.design);
  const catalog = useCatalogStore((s) => s.catalog);
  const { view, selectedId, select, cableMode, pendingEnd, selectedCableId, showCables, selectCable, leds, plan } = useUiStore();
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const drag = useDragStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Pt>());
  const suppressClick = useRef(false);
  const hovering = useRef(false);
  // Level of detail follows the zoom, re-rendering only when it crosses a threshold.
  const lod = useViewStore((s) => lodForScale(s.t.k));

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
  }, [plan]);

  const layout = rackLayout(design.rack);
  const extent = drawingExtent(layout, wallWidthMm(design, catalog), view);

  // Tell the view store about the canvas and drawing (restores or fits the view the first time).
  useLayoutEffect(() => {
    if (plan) return;
    syncCanvas(design.id, size, { x: 0, y: 0, w: extent.w, h: layout.height }, extent.x);
  }, [design.id, size.w, size.h, extent.w, extent.x, layout.height, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Write the transform to the stage once per frame, outside React: panning never re-renders the rack.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const { t, interacting } = useViewStore.getState();
      stage.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
      // Composited while moving (smooth), re-rasterised crisply when still.
      stage.style.willChange = interacting ? 'transform' : 'auto';
    };
    apply();
    const unsub = useViewStore.subscribe((s, prev) => {
      if (s.t !== prev.t || s.interacting !== prev.interacting) frame ||= requestAnimationFrame(apply);
    });
    return () => {
      unsub();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [plan]);

  // Wheel: a mouse wheel zooms at the cursor; two-finger trackpad scroll pans;
  // Shift + wheel pans sideways; Ctrl/Cmd + wheel and trackpad pinch zoom at the cursor. Native listener:
  // React's wheel handler is passive, and the page itself must not scroll or zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || plan) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const busy = () => {
      useViewStore.setState({ interacting: true });
      clearTimeout(idle);
      idle = setTimeout(() => useViewStore.setState({ interacting: false }), 160);
    };
    const local = (e: { clientX: number; clientY: number }): Pt => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let last: { source: WheelSource; at: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      busy();
      const d = wheelPixels(e, { w: el.clientWidth, h: el.clientHeight });
      const { t } = useViewStore.getState();
      const now = performance.now();
      const source = wheelSource(e, now, last);
      last = { source, at: now };
      // Ctrl/Cmd + wheel (and trackpad pinch, which browsers send as Ctrl + wheel) zooms at the cursor.
      if (e.ctrlKey || e.metaKey) setTransform(zoomAt(t, t.k * wheelZoomFactor(d.y), local(e)));
      // Shift + wheel pans sideways.
      else if (e.shiftKey) panView(-d.x, -d.y);
      // A mouse wheel zooms at the cursor; a trackpad two-finger scroll pans.
      else if (source === 'mouse') setTransform(zoomAt(t, t.k * mouseWheelZoomFactor(e), local(e)));
      else panView(-d.x, -d.y);
    };
    // Safari reports trackpad pinches as gesture events.
    let gestureK = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureK = useViewStore.getState().t.k;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      busy();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      setTransform(zoomAt(useViewStore.getState().t, gestureK * g.scale, local(g)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    return () => {
      clearTimeout(idle);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
  }, [plan]);

  // Hold Space to pan from anywhere, even over devices (while the pointer is over the canvas).
  useEffect(() => {
    if (plan) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target) || !hovering.current) return;
      e.preventDefault();
      if (!e.repeat) setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [plan]);

  // Dragging a device near the canvas edge pans the view, and the drop target follows.
  const dragging = !!drag.active;
  useEffect(() => {
    if (!dragging || plan) return;
    let frame = requestAnimationFrame(function step() {
      frame = requestAnimationFrame(step);
      const p = useDragStore.getState().pointer;
      const r = containerRef.current?.getBoundingClientRect();
      if (!p || !r || p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) return;
      const speed = (dist: number) => (dist < EDGE ? Math.ceil(((EDGE - dist) / EDGE) * EDGE_SPEED) : 0);
      const dx = speed(p.x - r.left) - speed(r.right - p.x);
      const dy = speed(p.y - r.top) - speed(r.bottom - p.y);
      if (!dx && !dy) return;
      panView(dx, dy);
      refreshDrag();
    });
    return () => cancelAnimationFrame(frame);
  }, [dragging, plan]);

  const ghost: RackGhost | null =
    drag.active && drag.overRack && drag.resolution
      ? {
          candidate: drag.resolution.candidate,
          ok: drag.resolution.check.ok,
          collisionIds: drag.resolution.check.collisions.map((c) => c.placementId),
        }
      : null;

  const localPoint = (e: { clientX: number; clientY: number }): Pt => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startPan = (e: ReactPointerEvent, armed: boolean) => {
    gesture.current = { kind: 'pan', id: e.pointerId, last: localPoint(e), start: localPoint(e), moved: false, armed };
    if (armed) {
      containerRef.current?.setPointerCapture(e.pointerId);
      setPanning(true);
      useViewStore.setState({ interacting: true });
    }
  };
  const endGesture = () => {
    if (gesture.current?.kind === 'pan' && gesture.current.moved) suppressClick.current = true;
    gesture.current = null;
    setPanning(false);
    useViewStore.setState({ interacting: false });
  };
  const startPinch = () => {
    const [a, b] = [...touches.current.keys()];
    const pa = touches.current.get(a!)!;
    const pb = touches.current.get(b!)!;
    const t0 = useViewStore.getState().t;
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    gesture.current = { kind: 'pinch', a: a!, b: b!, t0, d0: Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y)), w0: screenToWorld(t0, mid) };
    setPanning(true);
    useViewStore.setState({ interacting: true });
  };

  if (plan) {
    return (
      <div className="relative h-full w-full overflow-auto" onClick={() => select(null)}>
        <div className="flex min-h-full w-full justify-center">
          <ShelfPlanView design={design} catalog={catalog} leds={leds} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-rack-canvas
      className={cx(
        'relative h-full w-full touch-none overflow-hidden overscroll-none',
        panning ? 'cursor-grabbing [&_*]:!cursor-grabbing' : spaceHeld && 'cursor-grab [&_*]:!cursor-grab',
      )}
      onPointerEnter={() => (hovering.current = true)}
      onPointerLeave={() => (hovering.current = false)}
      // Focus or scrollIntoView can scroll even an overflow-hidden box: turn that into a pan.
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollLeft || el.scrollTop) {
          panView(-el.scrollLeft, -el.scrollTop);
          el.scrollLeft = 0;
          el.scrollTop = 0;
        }
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        select(null);
        selectCable(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={(e) => {
        const p = localPoint(e);
        if (e.pointerType === 'touch') {
          touches.current.set(e.pointerId, p);
          if (touches.current.size === 2) {
            // Second finger: pinch-zoom and pan together; a long-press drag under the first finger never starts.
            startPinch();
            e.stopPropagation();
            return;
          }
          if (touches.current.size === 1 && !isInteractive(e.target)) startPan(e, false);
          return;
        }
        // Middle or right button, or Space + left: pan from anywhere, even over a device.
        if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceHeld)) {
          e.preventDefault();
          e.stopPropagation();
          startPan(e, true);
          return;
        }
        // Left button on empty space: pan once it moves (a click still deselects).
        if (e.button === 0 && !isInteractive(e.target)) startPan(e, false);
      }}
      onPointerMoveCapture={(e) => {
        const g = gesture.current;
        if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, localPoint(e));
        if (g?.kind === 'pinch') {
          const pa = touches.current.get(g.a);
          const pb = touches.current.get(g.b);
          if (!pa || !pb) return;
          const k = g.t0.k * (Math.hypot(pa.x - pb.x, pa.y - pb.y) / g.d0);
          const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
          const nk = zoomAt(g.t0, k, mid).k;
          setTransform({ k: nk, x: mid.x - g.w0.x * nk, y: mid.y - g.w0.y * nk });
          e.stopPropagation();
          return;
        }
        if (g?.kind !== 'pan' || g.id !== e.pointerId) return;
        const p = localPoint(e);
        if (!g.armed) {
          if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < PAN_SLOP) return;
          g.armed = true;
          containerRef.current?.setPointerCapture(e.pointerId);
          setPanning(true);
          useViewStore.setState({ interacting: true });
        }
        g.moved = true;
        panView(p.x - g.last.x, p.y - g.last.y);
        g.last = p;
        e.stopPropagation();
      }}
      onPointerUpCapture={(e) => {
        if (e.pointerType === 'touch') touches.current.delete(e.pointerId);
        const g = gesture.current;
        if (g?.kind === 'pinch' && touches.current.size < 2) endGesture();
        else if (g?.kind === 'pan' && g.id === e.pointerId) endGesture();
      }}
      onPointerCancelCapture={(e) => {
        if (e.pointerType === 'touch') touches.current.delete(e.pointerId);
        if (gesture.current) endGesture();
      }}
      onPointerMove={(e) => {
        if (!pendingEnd) return;
        const pt = clientToSvg({ x: e.clientX, y: e.clientY });
        if (pt) setPointer(pt);
      }}
    >
      <div ref={stageRef} data-stage className="absolute top-0 left-0 origin-top-left" style={{ width: extent.w, height: layout.height }}>
        <RackView
          svgRef={(el) => {
            rackSvgRef.current = el;
          }}
          design={design}
          catalog={catalog}
          view={view}
          scale={1}
          selectedId={selectedId}
          draggingId={drag.active?.placementId ?? null}
          ghost={ghost}
          Wrapper={DraggablePlacement}
          cables={design.cables}
          showCables={showCables}
          selectedCableId={selectedCableId}
          onCableClick={cableMode ? undefined : (id) => selectCable(id)}
          onPortClick={cableMode ? handleCableEndClick : undefined}
          pendingEnd={pendingEnd}
          pointer={pendingEnd ? pointer : null}
          lod={lod}
          leds={leds}
          portTooltips={!cableMode && !drag.active}
          className="no-touch-scroll block select-none"
        />
      </div>
      {cableMode && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 w-fit max-w-[90%] -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1 text-center text-xs font-semibold text-zinc-950 shadow">
          {pendingEnd ? 'Click the other end: a port or device (Esc to cancel)' : `Cable mode: click a port or device to start a cable — switch to ${view === 'front' ? 'Rear' : 'Front'} view for the other side (Esc to finish)`}
        </div>
      )}
      <CanvasOverlay design={design} catalog={catalog} view={view} />
    </div>
  );
}
