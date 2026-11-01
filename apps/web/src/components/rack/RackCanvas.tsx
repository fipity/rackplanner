import { useDraggable } from '@dnd-kit/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useDragStore } from '../../store/dragStore';
import { useUiStore } from '../../store/uiStore';
import { rackSvgRef, type DragData } from './dnd';
import { rackLayout } from './geometry';
import { RackView, type PlacementWrapperProps, type RackGhost } from './RackView';

function DraggablePlacement({ placement, box, children }: PlacementWrapperProps) {
  const data: DragData = { kind: 'placement', placementId: placement.id };
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `placement:${placement.id}`, data });
  const select = useUiStore((s) => s.select);
  return (
    <g
      // dnd-kit types its node ref for HTMLElement, but only uses
      // getBoundingClientRect(), which SVG elements implement too.
      ref={(el) => setNodeRef(el as unknown as HTMLElement | null)}
      {...listeners}
      {...attributes}
      role="button"
      aria-label={placement.label ?? placement.partId}
      className="cursor-grab outline-none active:cursor-grabbing"
      onClick={(e) => {
        e.stopPropagation();
        select(placement.id);
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
  const { view, zoom, selectedId, select, setFitScale, zoomBy } = useUiStore();
  const drag = useDragStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

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
  const fit = Math.max(0.2, Math.min((size.w - 48) / layout.width, (size.h - 48) / layout.height));
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
    <div ref={containerRef} className="relative h-full w-full overflow-auto" onClick={() => select(null)}>
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
          className="no-touch-scroll drop-shadow-xl select-none"
        />
      </div>
    </div>
  );
}
