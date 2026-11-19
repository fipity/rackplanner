/**
 * Controls floating over the rack canvas: "Back to rack" when the drawing is
 * panned out of view, the minimap (with a draggable viewport rectangle) and
 * the shortcuts button.
 */
import { memo, useRef } from 'react';
import type { Catalog, Design } from '@rackplanner/shared';
import { Keyboard, LocateFixed, Map as MapIcon, Mouse } from 'lucide-react';
import { backToRack, contentVisible, setTransform, useViewStore } from '../../store/viewStore';
import { useUiStore, type WheelMode } from '../../store/uiStore';
import { RackView } from './RackView';
import { centreOn, screenToWorld } from './viewport';
import type { View } from './geometry';
import { cx } from '../ui';

export const WHEEL_LABEL: Record<WheelMode, string> = { auto: 'Wheel zooms', zoom: 'Wheel always zooms', pan: 'Wheel pans' };
const WHEEL_TITLE: Record<WheelMode, string> = {
  auto: 'a mouse wheel zooms, two-finger trackpad scrolling pans',
  zoom: 'every scroll zooms (trackpads too)',
  pan: 'scrolling pans; hold Ctrl to zoom',
};
const NEXT_WHEEL: Record<WheelMode, WheelMode> = { auto: 'zoom', zoom: 'pan', pan: 'auto' };

const MINI_W = 150;
const MINI_H = 200;

const MiniDrawing = memo(function MiniDrawing({ design, catalog, view, scale }: { design: Design; catalog: Catalog; view: View; scale: number }) {
  return <RackView design={design} catalog={catalog} view={view} scale={scale} lod="low" leds={false} showCables={false} className="block" />;
});

function Minimap({ design, catalog, view }: { design: Design; catalog: Catalog; view: View }) {
  const content = useViewStore((s) => s.content);
  const t = useViewStore((s) => s.t);
  const size = useViewStore((s) => s.size);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const m = Math.min(MINI_W / content.w, MINI_H / content.h);
  const w = content.w * m;
  const h = content.h * m;
  // The canvas viewport, in minimap pixels.
  const tl = screenToWorld(t, { x: 0, y: 0 });
  const br = screenToWorld(t, { x: size.w, y: size.h });
  const vx = Math.max(-2, tl.x * m);
  const vy = Math.max(-2, tl.y * m);
  const vw = Math.min(w + 2, br.x * m) - vx;
  const vh = Math.min(h + 2, br.y * m) - vy;

  const centreAt = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    const { t: cur, size: sz } = useViewStore.getState();
    setTransform(centreOn({ x: (e.clientX - r.left) / m, y: (e.clientY - r.top) / m }, cur.k, sz));
  };

  return (
    <div
      ref={boxRef}
      role="img"
      aria-label="Minimap: drag to move the view"
      data-no-pan
      className="relative cursor-pointer touch-none overflow-hidden rounded-md border border-zinc-300 bg-zinc-100/90 shadow-lg dark:border-zinc-700 dark:bg-zinc-900/90"
      style={{ width: w, height: h }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        centreAt(e);
      }}
      onPointerMove={(e) => dragging.current && centreAt(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <div className="pointer-events-none" aria-hidden="true">
        <MiniDrawing design={design} catalog={catalog} view={view} scale={m} />
      </div>
      {vw > 0 && vh > 0 && (
        <div
          data-testid="minimap-viewport"
          className="pointer-events-none absolute rounded-sm border-2 border-blue-500 bg-blue-500/10"
          style={{ left: vx, top: vy, width: vw, height: vh }}
        />
      )}
    </div>
  );
}

export function CanvasOverlay({ design, catalog, view }: { design: Design; catalog: Catalog; view: View }) {
  const visible = useViewStore((s) => contentVisible(s));
  const minimap = useUiStore((s) => s.minimap);
  const setMinimap = useUiStore((s) => s.setMinimap);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const wheelMode = useUiStore((s) => s.wheelMode);
  const setWheelMode = useUiStore((s) => s.setWheelMode);
  const btn = 'inline-flex size-8 items-center justify-center rounded-md border border-zinc-300 bg-white/90 text-zinc-700 shadow-sm hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-zinc-800';
  return (
    <>
      {!visible && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            backToRack();
          }}
          className="absolute top-1/2 left-1/2 z-20 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500"
        >
          <LocateFixed className="size-4" /> Back to rack
        </button>
      )}
      <div className="absolute bottom-3 left-3 z-10 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Minimap" aria-pressed={minimap} title="Minimap" onClick={() => setMinimap(!minimap)} className={cx(btn, minimap && 'ring-2 ring-blue-500')}>
          <MapIcon className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Scroll wheel: ${WHEEL_LABEL[wheelMode]}`}
          title={`Scroll wheel: ${WHEEL_TITLE[wheelMode]}. Click to change.`}
          onClick={() => setWheelMode(NEXT_WHEEL[wheelMode])}
          className={cx(btn, 'w-auto gap-1 px-2 text-xs font-medium')}
        >
          <Mouse className="size-4" /> {WHEEL_LABEL[wheelMode]}
        </button>
        <button type="button" aria-label="Keyboard and mouse shortcuts" title="Shortcuts (?)" onClick={() => setShortcutsOpen(true)} className={btn}>
          <Keyboard className="size-4" />
        </button>
      </div>
      {minimap && (
        <div className="absolute right-3 bottom-3 z-10 max-sm:hidden">
          <Minimap design={design} catalog={catalog} view={view} />
        </div>
      )}
    </>
  );
}
