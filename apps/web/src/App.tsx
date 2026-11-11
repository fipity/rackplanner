import { DndContext, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { useEffect } from 'react';
import { CustomPartBuilder } from './components/catalog/CustomPartBuilder';
import { GlobalFaceplateDefs } from './components/faceplates/Defs';
import { handleDragCancel, handleDragEnd, handleDragMove, handleDragStart } from './components/rack/dnd';
import { Button, cx } from './components/ui';
import { navigate, useRoute } from './lib/router';
import { useToastStore } from './lib/toast';
import { EditorPage } from './pages/EditorPage';
import { HomePage } from './pages/HomePage';
import { PrintPage } from './pages/PrintPage';
import { useCatalogStore } from './store/catalogStore';
import { applyTheme, useUiStore } from './store/uiStore';

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
  const route = useRoute();
  const { status, error, load } = useCatalogStore();
  const theme = useUiStore((s) => s.theme);
  const builder = useUiStore((s) => s.builder);

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

  let page;
  if (status === 'error') {
    page = (
      <div className="m-auto max-w-md p-6 text-center">
        <p className="mb-3 font-semibold">Couldn't load the parts catalog</p>
        <p className="mb-4 text-sm text-zinc-500">{error}</p>
        <Button variant="primary" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  } else if (route.name === 'design') {
    page = <EditorPage key={route.id} id={route.id} />;
  } else if (route.name === 'print') {
    page = <PrintPage key={route.id} id={route.id} />;
  } else if (route.name === 'home') {
    page = <HomePage />;
  } else {
    page = (
      <div className="m-auto p-6 text-center">
        <p className="mb-3 font-semibold">Page not found</p>
        <Button variant="primary" onClick={() => navigate('/')}>
          Go to designs
        </Button>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <GlobalFaceplateDefs />
      <div className="flex h-full flex-col">{page}</div>
      {builder && <CustomPartBuilder key={`${builder.mode}:${builder.partId ?? ''}`} />}
      <Toasts />
    </DndContext>
  );
}
