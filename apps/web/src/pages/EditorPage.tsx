import { DragOverlay } from '@dnd-kit/core';
import { formatURange } from '@rackplanner/shared';
import { BarChart3, ChevronLeft, PanelLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CatalogSidebar } from '../components/catalog/CatalogSidebar';
import { DesignName } from '../components/DesignName';
import { PartThumb } from '../components/faceplates/PartThumb';
import { RackCanvas } from '../components/rack/RackCanvas';
import { RightPanel } from '../components/RightPanel';
import { SaveIndicator } from '../components/SaveIndicator';
import { Toolbar } from '../components/Toolbar';
import { Button, cx } from '../components/ui';
import { ApiError, getDesign } from '../lib/api';
import { navigate } from '../lib/router';
import { useAutosave } from '../lib/useAutosave';
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts';
import { useCatalogStore } from '../store/catalogStore';
import { useDesignStore } from '../store/designStore';
import { useDragStore } from '../store/dragStore';
import { useSaveStore } from '../store/saveStore';
import { useUiStore } from '../store/uiStore';

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

export function EditorPage({ id }: { id: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const catalogStatus = useCatalogStore((s) => s.status);
  const selectedId = useUiStore((s) => s.selectedId);
  const panelOpen = useUiStore((s) => s.panelOpen);
  const [catalogOpen, setCatalogOpen] = useState(false);
  useKeyboardShortcuts();
  useAutosave(state === 'ready' ? id : null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    getDesign(id).then(
      (res) => {
        if (cancelled) return;
        useUiStore.getState().select(null);
        useDesignStore.getState().loadDesign(res.design);
        useSaveStore.getState().init(id, res.revision);
        document.title = `${res.design.name} · RackPlanner`;
        setState('ready');
      },
      (err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setState('missing');
        else {
          setError(err instanceof Error ? err.message : String(err));
          setState('error');
        }
      },
    );
    return () => {
      cancelled = true;
      document.title = 'RackPlanner';
    };
  }, [id]);

  const name = useDesignStore((s) => s.design.name);
  useEffect(() => {
    if (state === 'ready') document.title = `${name} · RackPlanner`;
  }, [name, state]);

  if (state === 'missing' || state === 'error') {
    return (
      <div className="m-auto max-w-md p-6 text-center">
        <p className="mb-2 font-semibold">{state === 'missing' ? 'That design no longer exists.' : "Couldn't open the design"}</p>
        {error && <p className="mb-4 text-sm text-zinc-500">{error}</p>}
        <Button variant="primary" onClick={() => navigate('/')}>
          Back to designs
        </Button>
      </div>
    );
  }
  if (state === 'loading' || catalogStatus !== 'ready') {
    return <div className="m-auto text-sm text-zinc-500">Loading…</div>;
  }

  const showPanel = !!selectedId || panelOpen;
  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex min-w-0 items-center gap-1">
          <Button aria-label="Toggle catalog" className="px-1.5 md:hidden" onClick={() => setCatalogOpen((o) => !o)}>
            <PanelLeft className="size-4" />
          </Button>
          <Button aria-label="All designs" title="All designs" className="px-1.5" onClick={() => navigate('/')}>
            <ChevronLeft className="size-4" />
            <img src="/favicon.svg" alt="" className="size-5" />
          </Button>
          <DesignName />
          <SaveIndicator />
        </div>
        <Toolbar />
        <Button
          aria-label="Stats"
          title="Stats & warnings"
          className="px-1.5 lg:hidden"
          onClick={() => {
            useUiStore.getState().setRightTab('stats');
            useUiStore.getState().setPanelOpen(!panelOpen);
          }}
        >
          <BarChart3 className="size-4" />
        </Button>
      </header>

      <main className="relative grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[17rem_1fr] lg:grid-cols-[19rem_1fr_20rem]">
        <div className={cx('min-h-0 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:w-80 max-md:shadow-2xl', !catalogOpen && 'max-md:hidden')}>
          <CatalogSidebar />
        </div>
        <div className="min-h-0 min-w-0 bg-zinc-100 dark:bg-zinc-950">
          <RackCanvas />
        </div>
        <div
          className={cx(
            'min-h-0 border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
            'max-lg:absolute max-lg:right-3 max-lg:bottom-3 max-lg:z-20 max-lg:max-h-[70%] max-lg:w-80 max-lg:overflow-hidden max-lg:rounded-xl max-lg:border max-lg:shadow-2xl',
            !showPanel && 'max-lg:hidden',
          )}
        >
          <RightPanel />
        </div>
      </main>
      <DragOverlay dropAnimation={null}>
        <DragPreview />
      </DragOverlay>
      <DragFeedback />
    </>
  );
}
