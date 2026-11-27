/**
 * Right-click menu on a part in the rack: reverse, turn on its side,
 * duplicate, remove. Acts on the whole selection when the part is part of a
 * multi-selection.
 */
import { canReverse, canTurn, facingOf, uprightPart } from '@rackplanner/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteSelected, duplicateSelected, reverseSelected, selectedPlacements, turnSelected } from '../../lib/actions';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';

export function PartContextMenu() {
  const menu = useUiStore((s) => s.contextMenu);
  const close = () => useUiStore.getState().setContextMenu(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const design = useDesignStore((s) => s.design);
  const catalog = useCatalogStore((s) => s.catalog);

  // Keep the menu on screen.
  useLayoutEffect(() => {
    if (!menu) return setPos(null);
    const r = ref.current?.getBoundingClientRect();
    const w = r?.width ?? 200;
    const h = r?.height ?? 160;
    setPos({ x: Math.max(4, Math.min(menu.x, innerWidth - w - 4)), y: Math.max(4, Math.min(menu.y, innerHeight - h - 4)) });
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  if (!menu) return null;
  const p = design.placements.find((q) => q.id === menu.placementId);
  const part = p && catalog.get(p.partId);
  if (!p || !part) return null;
  const many = selectedPlacements().length > 1;
  const facing = facingOf(design.placements, p);
  const turnable = !many && (canTurn(part) || !!uprightPart(part));
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const item = 'flex w-full items-center justify-between gap-6 rounded px-2.5 py-1.5 text-left text-sm hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:opacity-40 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800';
  const kbd = 'text-xs text-zinc-500';
  // Portalled to <body>, and clicks stopped here: React still bubbles portal events to the
  // canvas, whose "click empty space" handler would deselect the part.
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Part actions"
      className="fixed z-50 min-w-52 rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      }}
    >
      <button role="menuitem" className={item} disabled={!canReverse(p)} onClick={run(() => reverseSelected())}>
        <span>{many ? 'Reverse selected parts' : facing === 'front' ? 'Reverse (face rear)' : 'Reverse (face front)'}</span>
        <span className={kbd}>R</span>
      </button>
      {turnable && (
        <button role="menuitem" className={item} onClick={run(turnSelected)}>
          <span>{uprightPart(part) ? 'Stand upright' : 'Turn on its side'}</span>
          <span className={kbd}>T</span>
        </button>
      )}
      {!many && (
        <button role="menuitem" className={item} onClick={run(duplicateSelected)}>
          <span>Duplicate</span>
          <span className={kbd}>Ctrl+D</span>
        </button>
      )}
      <button role="menuitem" className={`${item} text-red-600 dark:text-red-400`} onClick={run(deleteSelected)}>
        <span>{many ? 'Remove selected parts' : 'Remove'}</span>
        <span className={kbd}>Del</span>
      </button>
    </div>,
    document.body,
  );
}
