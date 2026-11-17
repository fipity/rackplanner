import { useDraggable } from '@dnd-kit/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useDragStore } from '../../store/dragStore';
import { useUiStore } from '../../store/uiStore';
import { handleCableEndClick } from '../../lib/cableActions';
import { rackSvgRef, type DragData } from './dnd';
import { uprightPart, wallWidthMm, type PlacedPart, type Part } from '@rackplanner/shared';
import { drawingExtent, rackLayout } from './geometry';
import { RackView, type PlacementWrapperProps, type RackGhost } from './RackView';
import { lodForScale } from '../faceplates/Faceplate';
import { ShelfPlanView } from './ShelfPlanView';
import { cx } from '../ui';

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

export function RackCanvas() {
  const design = useDesignStore((s) => s.design);
  const catalog = useCatalogStore((s) => s.catalog);
  const { view, zoom, selectedId, select, setFitScale, zoomBy, cableMode, pendingEnd, selectedCableId, showCables, selectCable, leds, plan } = useUiStore();
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const drag = useDragStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  // Right-button drag panning: pointer and scroll position when it started.
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  // Touch screens: fingers currently down, and a two-finger pan in progress
  // (midpoint and scroll position when the second finger landed).
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const touchPan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const midpoint = () => {
    const pts = [...touches.current.values()].slice(0, 2);
    return { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
  };
  const endTouch = (id: number) => {
    touches.current.delete(id);
    if (touches.current.size < 2 && touchPan.current) {
      touchPan.current = null;
      setPanning(false);
    }
  };

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = rackLayout(design.rack);
  const extent = drawingExtent(layout, wallWidthMm(design, catalog), view);
  const fit = Math.max(0.2, Math.min((size.w - 48) / extent.w, (size.h - 48) / layout.height));
  const scale = zoom === 'fit' ? fit : zoom;
  useEffect(() => setFitScale(fit), [fit, setFitScale]);

  const ghost: RackGhost | null =
    drag.active && drag.overRack && drag.resolution
      ? {
          candidate: drag.resolution.candidate,
          ok: drag.resolution.check.ok,
          collisionIds: drag.resolution.check.collisions.map((c) => c.placementId),
        }
      : null;

  // Ctrl/Cmd + wheel zooms. Native listener because React's wheel handler is passive.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  return (
    <div
      ref={containerRef}
      className={cx('relative h-full w-full overflow-auto', panning && 'cursor-grabbing [&_*]:!cursor-grabbing')}
      onClick={() => {
        select(null);
        selectCable(null);
      }}
      // Hold the right mouse button and drag to pan around the rack.
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={(e) => {
        // Two fingers down: pan with their midpoint (right-drag needs a mouse).
        if (e.pointerType !== 'touch') return;
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const el = containerRef.current;
        if (touches.current.size === 2 && el) {
          const m = midpoint();
          touchPan.current = { x: m.x, y: m.y, left: el.scrollLeft, top: el.scrollTop };
          setPanning(true);
          // Stop a long-press drag of the device under the first finger from starting.
          e.stopPropagation();
        }
      }}
      onPointerMoveCapture={(e) => {
        if (e.pointerType !== 'touch' || !touches.current.has(e.pointerId)) return;
        touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = touchPan.current;
        const el = containerRef.current;
        if (!p || !el) return;
        const m = midpoint();
        el.scrollLeft = p.left - (m.x - p.x);
        el.scrollTop = p.top - (m.y - p.y);
        e.stopPropagation();
      }}
      onPointerUpCapture={(e) => {
        if (e.pointerType === 'touch') endTouch(e.pointerId);
      }}
      onPointerCancelCapture={(e) => {
        if (e.pointerType === 'touch') endTouch(e.pointerId);
      }}
      onPointerDown={(e) => {
        if (e.button !== 2 || e.pointerType !== 'mouse') return;
        const el = containerRef.current;
        if (!el) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
        setPanning(true);
      }}
      onPointerUp={(e) => {
        if (pan.current?.id !== e.pointerId) return;
        pan.current = null;
        setPanning(false);
      }}
      onPointerCancel={() => {
        pan.current = null;
        setPanning(false);
      }}
      onPointerMove={(e) => {
        const p = pan.current;
        if (p && p.id === e.pointerId) {
          const el = containerRef.current!;
          el.scrollLeft = p.left - (e.clientX - p.x);
          el.scrollTop = p.top - (e.clientY - p.y);
          return;
        }
        if (!pendingEnd) return;
        const ctm = rackSvgRef.current?.getScreenCTM();
        if (!ctm) return;
        const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
        setPointer({ x: pt.x, y: pt.y });
      }}
    >
      {cableMode && (
        <div className="pointer-events-none sticky top-2 z-10 mx-auto w-fit rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 shadow">
          {pendingEnd ? 'Click the other end: a port or device (Esc to cancel)' : `Cable mode: click a port or device to start a cable — switch to ${view === 'front' ? 'Rear' : 'Front'} view for the other side (Esc to finish)`}
        </div>
      )}
      {plan ? (
        <div className="flex min-h-full w-full justify-center">
          <ShelfPlanView design={design} catalog={catalog} leds={leds} />
        </div>
      ) : (
      <div className="flex min-h-full min-w-full items-center justify-center p-6" style={{ width: 'max-content', minWidth: '100%' }}>
        <RackView
          svgRef={(el) => {
            rackSvgRef.current = el;
          }}
          design={design}
          catalog={catalog}
          view={view}
          scale={scale}
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
          lod={lodForScale(scale)}
          leds={leds}
          portTooltips={!cableMode && !drag.active}
          className="no-touch-scroll select-none"
        />
      </div>
      )}
    </div>
  );
}
