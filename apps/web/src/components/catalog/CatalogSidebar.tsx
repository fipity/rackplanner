import { useDraggable } from '@dnd-kit/core';
import { findFreeSlot, fitsRackWidth, newId, type Part, type RackWidth } from '@rackplanner/shared';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from '../../lib/toast';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { PartThumb } from '../faceplates/PartThumb';
import type { DragData } from '../rack/dnd';
import { Badge, cx, inputClass } from '../ui';

const CATEGORY_LABELS: Record<string, string> = {
  gateway: 'Gateways & routers',
  switch: 'Switches',
  'patch-panel': 'Patch panels',
  'cable-management': 'Cable management',
  blank: 'Blank panels',
  shelf: 'Shelves',
  server: 'Servers',
  nas: 'NAS & storage',
  power: 'Power',
  mount: 'Mounts',
};

function addToRack(part: Part) {
  const { design, addPlacement } = useDesignStore.getState();
  const { catalog } = useCatalogStore.getState();
  const view = useUiStore.getState().view;
  // Click-to-add uses the part's own default side (e.g. PDUs go to the rear),
  // except that front-mounted gear added while looking at the rear goes there.
  const mounting = part.mounting === 'front' && view === 'rear' ? 'rear' : part.mounting;
  const slot = findFreeSlot(design, catalog, part.id, mounting);
  if (!slot) {
    toast(`No free space for ${part.name}`, 'error');
    return;
  }
  const id = newId('p_');
  addPlacement({ ...slot, id });
  useUiStore.getState().select(id);
  if (mounting !== 'full-depth' && mounting !== view) toast(`${part.name} added to the ${mounting} of the rack`);
}

function CatalogItem({ part, rackWidth, reason }: { part: Part; rackWidth: RackWidth; reason?: string | undefined }) {
  const data: DragData = { kind: 'catalog', partId: part.id };
  const disabled = reason !== undefined;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `catalog:${part.id}`, data, disabled });
  return (
    <li>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        role="button"
        title={reason ?? `Drag into the rack, or click to add at the first free slot`}
        onClick={() => !disabled && addToRack(part)}
        className={cx(
          'group flex items-center gap-2.5 rounded-lg border border-transparent p-1.5 select-none',
          disabled
            ? 'cursor-not-allowed opacity-45'
            : 'cursor-grab hover:border-zinc-300 hover:bg-white active:cursor-grabbing dark:hover:border-zinc-700 dark:hover:bg-zinc-900',
          isDragging && 'opacity-50',
        )}
      >
        <div className="flex w-28 shrink-0 justify-center">
          <PartThumb part={part} rackWidth={rackWidth} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">{part.name}</div>
          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {part.brand} · {part.model}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge>{part.heightU}U</Badge>
            {part.width === '10in' && <Badge tone="blue">10″</Badge>}
            {typeof part.width === 'object' || part.width === 'half-19in' ? <Badge tone="blue">partial</Badge> : null}
            {part.formFactor === 'desktop' && <Badge tone="amber">shelf</Badge>}
            {part.poeBudgetW ? <Badge tone="green">PoE</Badge> : null}
            {reason && <span className="text-[11px] text-red-600 dark:text-red-400">{reason}</span>}
          </div>
        </div>
      </div>
    </li>
  );
}

export function CatalogSidebar() {
  const parts = useCatalogStore((s) => s.parts);
  const status = useCatalogStore((s) => s.status);
  const rackWidth = useDesignStore((s) => s.design.rack.width);
  const { showIncompatible, setShowIncompatible } = useUiStore();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const map = new Map<string, { part: Part; reason?: string | undefined }[]>();
    for (const part of parts) {
      const hay = `${part.brand} ${part.model} ${part.name} ${part.category} ${part.subcategory ?? ''} ${part.tags.join(' ')}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
      const fit = fitsRackWidth(part, rackWidth);
      if (!fit.ok && !showIncompatible) continue;
      const list = map.get(part.category) ?? [];
      list.push({ part, reason: fit.ok ? undefined : fit.reason });
      map.set(part.category, list);
    }
    return [...map.entries()]
      .map(([cat, items]) => ({
        cat,
        label: CATEGORY_LABELS[cat] ?? cat.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        items: items.sort((a, b) => Number(!!a.reason) - Number(!!b.reason) || a.part.name.localeCompare(b.part.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [parts, query, rackWidth, showIncompatible]);

  const count = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2 left-2 size-4 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search parts…"
            aria-label="Search parts"
            className={cx(inputClass, 'pl-8')}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={showIncompatible} onChange={(e) => setShowIncompatible(e.target.checked)} />
          Show parts that don't fit a {rackWidth === '19in' ? '19″' : '10″'} rack
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {status === 'loading' && <p className="p-3 text-sm text-zinc-500">Loading catalog…</p>}
        {status === 'ready' && count === 0 && <p className="p-3 text-sm text-zinc-500">No parts match.</p>}
        {groups.map((g) => (
          <section key={g.cat} className="mb-3">
            <h3 className="sticky top-0 z-10 bg-zinc-50/95 px-1.5 py-1 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase backdrop-blur dark:bg-zinc-950/90 dark:text-zinc-400">
              {g.label} <span className="font-normal">({g.items.length})</span>
            </h3>
            <ul>
              {g.items.map(({ part, reason }) => (
                <CatalogItem key={part.id} part={part} rackWidth={rackWidth} reason={reason} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
