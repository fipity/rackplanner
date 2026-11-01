import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { formatURange } from '@rackplanner/shared';
import { PanelLeft, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CatalogSidebar } from './components/catalog/CatalogSidebar';
import { PartThumb } from './components/faceplates/PartThumb';
import { Inspector } from './components/inspector/Inspector';
import { handleDragCancel, handleDragEnd, handleDragMove, handleDragStart } from './components/rack/dnd';
import { RackCanvas } from './components/rack/RackCanvas';
import { Toolbar } from './components/Toolbar';
import { Button, cx } from './components/ui';
import { useToastStore } from './lib/toast';
import { useKeyboardShortcuts } from './lib/useKeyboardShortcuts';
import { useCatalogStore } from './store/catalogStore';
import { useDesignStore } from './store/designStore';
import { useDragStore } from './store/dragStore';
import { applyTheme, useUiStore } from './store/uiStore';

function DragFeedback() {
  const { active, resolution, overRack, pointer } = useDragStore();
  const rack = useDesignStore((s) => s.design.rack);
  if (!active || !overRack || !resolution || !pointer) return null;
  const { check, candidate } = resolution;
  const part = useCatalogStore.getState().catalog.get(candidate.partId);
  const where = part ? formatURange(candidate.bottomU, candidate.bottomU + part.heightU, rack) : '';
  return (
    <div
      role="status"
      className={cx(
        'pointer-events-none fixed z-50 max-w-xs rounded-md px-2.5 py-1.5 text-xs font-medium shadow-lg',
        check.ok ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-red-600 text-white',
      )}
      style={{ left: pointer.x + 18, top: pointer.y + 18 }}
    >
      {check.ok ? `${where} · ${candidate.mounting}` : check.problems.map((p) => <div key={p.message}>{p.message}</div>)}
    </div>
  );
}

function DragPreview() {
  const active = useDragStore((s) => s.active);
  const overRack = useDragStore((s) => s.overRack);
  const part = useCatalogStore((s) => (active ? s.catalog.get(active.partId) : undefined));
  const rackWidth = useDesignStore((s) => s.design.rack.width);
  const { zoom, fitScale } = useUiStore();
  if (!active || active.kind !== 'catalog' || !part || overRack) return null;
  return (
    <div className="opacity-80 drop-shadow-xl">
      <PartThumb part={part} rackWidth={rackWidth} scale={(zoom === 'fit' ? fitScale : zoom) * 0.8} />
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cx(
            'rounded-lg px-4 py-2 text-sm font-medium shadow-lg',
            t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const { status, error, load } = useCatalogStore();
  const theme = useUiStore((s) => s.theme);
  const selectedId = useUiStore((s) => s.selectedId);
  const [catalogOpen, setCatalogOpen] = useState(false);
  useKeyboardShortcuts();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Button aria-label="Toggle catalog" className="px-1.5 md:hidden" onClick={() => setCatalogOpen((o) => !o)}>
              <PanelLeft className="size-4" />
            </Button>
            <img src="/favicon.svg" alt="" className="size-6" />
            <span className="font-semibold tracking-tight">RackPlanner</span>
          </div>
          <Toolbar />
        </header>

        {status === 'error' ? (
          <div className="m-auto max-w-md p-6 text-center">
            <p className="mb-3 font-semibold">Couldn't load the parts catalog</p>
            <p className="mb-4 text-sm text-zinc-500">{error}</p>
            <Button variant="primary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : (
          <main className="relative grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[17rem_1fr] lg:grid-cols-[19rem_1fr_20rem]">
            <div
              className={cx(
                'min-h-0 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:w-80 max-md:shadow-2xl',
                !catalogOpen && 'max-md:hidden',
              )}
            >
              <CatalogSidebar />
            </div>
            <div className="min-h-0 min-w-0 bg-zinc-100 dark:bg-zinc-950">
              <RackCanvas />
            </div>
            <div
              className={cx(
                'min-h-0 border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
                'max-lg:absolute max-lg:right-3 max-lg:bottom-3 max-lg:z-20 max-lg:max-h-[60%] max-lg:w-80 max-lg:rounded-xl max-lg:border max-lg:shadow-2xl',
                !selectedId && 'max-lg:hidden',
              )}
            >
              {selectedId && (
                <Button aria-label="Close inspector" className="absolute top-2 right-2 px-1.5 lg:hidden" onClick={() => useUiStore.getState().select(null)}>
                  <X className="size-4" />
                </Button>
              )}
              <Inspector />
            </div>
          </main>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        <DragPreview />
      </DragOverlay>
      <DragFeedback />
      <Toasts />
    </DndContext>
  );
}
