import { useDraggable } from '@dnd-kit/core';
import { displayName, findFreeSlot, findShelfSlot, newId, type Part, type RackWidth } from '@rackplanner/shared';
import { Copy, Filter, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { deletePart } from '../../lib/api';
import { activeFilterCount, categoryLabel, facet, filterCatalog } from '../../lib/catalogFilter';
import { toast } from '../../lib/toast';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { ConfirmDialog } from '../ConfirmDialog';
import { PartThumb } from '../faceplates/PartThumb';
import type { DragData } from '../rack/dnd';
import { Badge, Button, cx, inputClass, selectClass } from '../ui';

function addToRack(part: Part) {
  const { design, addPlacement } = useDesignStore.getState();
  const { catalog } = useCatalogStore.getState();
  const view = useUiStore.getState().view;
  // Click-to-add uses the part's own default side (e.g. PDUs go to the rear),
  // except that front-mounted gear added while looking at the rear goes there.
  const mounting = part.mounting === 'front' && view === 'rear' ? 'rear' : part.mounting;
  // Desktop gear goes onto a shelf with room, if there is one.
  const shelfSlot = findShelfSlot(design, catalog, part.id);
  if (shelfSlot) {
    const id = newId('p_');
    addPlacement({ ...shelfSlot, id });
    useUiStore.getState().select(id);
    const shelf = design.placements.find((p) => p.id === shelfSlot.parentId);
    toast(`${part.name} placed on ${shelf ? displayName(shelf, catalog.get(shelf.partId)) : 'a shelf'}`);
    return;
  }
  const slot = findFreeSlot(design, catalog, part.id, mounting);
  if (!slot) {
    toast(`No free space for ${part.name}`, 'error');
    return;
  }
  const id = newId('p_');
  addPlacement({ ...slot, id });
  useUiStore.getState().select(id);
  if (part.formFactor === 'desktop') {
    const hasShelf = design.placements.some((p) => p.parentId === undefined && catalog.get(p.partId)?.shelf);
    toast(hasShelf ? `No room on a shelf for ${part.name}; placed loose` : `${part.name} placed loose; add a shelf to stand it on`);
  }
  else if (mounting !== 'full-depth' && mounting !== view) toast(`${part.name} added to the ${mounting} of the rack`);
}

const CatalogItem = memo(function CatalogItem({
  part,
  rackWidth,
  reason,
  onDelete,
}: {
  part: Part;
  rackWidth: RackWidth;
  reason?: string | undefined;
  onDelete: (part: Part) => void;
}) {
  const data: DragData = { kind: 'catalog', partId: part.id };
  const disabled = reason !== undefined;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `catalog:${part.id}`, data, disabled });
  const openBuilder = useUiStore((s) => s.openBuilder);
  const custom = part.source === 'custom';
  return (
    <li className="group relative [contain-intrinsic-size:auto_76px] [content-visibility:auto]">
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        role="button"
        title={reason ?? `Drag into the rack, or click to add at the first free slot`}
        onClick={() => !disabled && addToRack(part)}
        className={cx(
          'flex items-center gap-2.5 rounded-lg border border-transparent p-1.5 select-none',
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
            {part.poeBudgetW ? <Badge tone="green">PoE {part.poeBudgetW}W</Badge> : null}
            {part.legacy && <Badge>legacy</Badge>}
            {reason && <span className="text-[11px] text-red-600 dark:text-red-400">{reason}</span>}
          </div>
        </div>
      </div>
      {/* Actions sit outside the draggable so clicks don't start a drag. */}
      <div className="absolute top-1 right-1 hidden gap-0.5 rounded-md bg-white/95 p-0.5 shadow-sm group-hover:flex group-focus-within:flex dark:bg-zinc-900/95">
        {custom ? (
          <>
            <button type="button" aria-label={`Edit ${part.name}`} title="Edit" onClick={() => openBuilder({ mode: 'edit', partId: part.id })} className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">
              <Pencil className="size-3.5" />
            </button>
            <button type="button" aria-label={`Delete ${part.name}`} title="Delete" onClick={() => onDelete(part)} className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
              <Trash2 className="size-3.5" />
            </button>
          </>
        ) : (
          <button type="button" aria-label={`Customise a copy of ${part.name}`} title="Customise a copy" onClick={() => openBuilder({ mode: 'copy', partId: part.id })} className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">
            <Copy className="size-3.5" />
          </button>
        )}
      </div>
    </li>
  );
});

function Filters() {
  const parts = useCatalogStore((s) => s.parts);
  const retired = useCatalogStore((s) => s.retired);
  const { filters, setFilters, resetFilters, showIncompatible, setShowIncompatible } = useUiStore();
  const rackWidth = useDesignStore((s) => s.design.rack.width);
  const brands = useMemo(() => facet(parts, retired, 'brand'), [parts, retired]);
  const categories = useMemo(() => facet(parts, retired, 'category'), [parts, retired]);
  const sel = cx(selectClass, 'w-full min-w-0 text-xs');
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <select aria-label="Brand" className={sel} value={filters.brand} onChange={(e) => setFilters({ brand: e.target.value })}>
        <option value="">All brands</option>
        {brands.map((b) => (
          <option key={b.value} value={b.value}>
            {b.value} ({b.count})
          </option>
        ))}
      </select>
      <select aria-label="Category" className={sel} value={filters.category} onChange={(e) => setFilters({ category: e.target.value })}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.value} value={c.value}>
            {categoryLabel(c.value)} ({c.count})
          </option>
        ))}
      </select>
      <select aria-label="Height" className={sel} value={filters.height} onChange={(e) => setFilters({ height: e.target.value })}>
        <option value="">Any height</option>
        <option value="0.5">0.5U</option>
        <option value="1">1U</option>
        <option value="2">2U</option>
        <option value="3">3U</option>
        <option value="tall">4U+</option>
      </select>
      <select aria-label="PoE" className={sel} value={filters.poe} onChange={(e) => setFilters({ poe: e.target.value as typeof filters.poe })}>
        <option value="any">PoE: any</option>
        <option value="yes">Supplies PoE</option>
        <option value="no">No PoE</option>
      </select>
      <select
        aria-label="Rack width compatibility"
        className={cx(sel, 'col-span-2')}
        value={filters.rackWidth}
        onChange={(e) => setFilters({ rackWidth: e.target.value as typeof filters.rackWidth })}
      >
        <option value="any">Any rack width</option>
        <option value="19in">Fits 19″ racks</option>
        <option value="10in">Fits 10″ racks</option>
      </select>
      <label className="col-span-2 flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" checked={showIncompatible} onChange={(e) => setShowIncompatible(e.target.checked)} />
        Show parts that don't fit this {rackWidth === '19in' ? '19″' : '10″'} rack
      </label>
      <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" checked={filters.hideLegacy} onChange={(e) => setFilters({ hideLegacy: e.target.checked })} />
        Hide legacy
      </label>
      <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" checked={filters.onlyCustom} onChange={(e) => setFilters({ onlyCustom: e.target.checked })} />
        Only custom
      </label>
      {activeFilterCount(filters) > 0 && (
        <button type="button" onClick={resetFilters} className="col-span-2 text-left text-blue-600 hover:underline dark:text-blue-400">
          Clear filters
        </button>
      )}
    </div>
  );
}

export function CatalogSidebar() {
  const parts = useCatalogStore((s) => s.parts);
  const retired = useCatalogStore((s) => s.retired);
  const status = useCatalogStore((s) => s.status);
  const rackWidth = useDesignStore((s) => s.design.rack.width);
  const { showIncompatible, filters, openBuilder } = useUiStore();
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [doomed, setDoomed] = useState<Part | null>(null);

  const groups = useMemo(
    () => filterCatalog({ parts, retired, query, filters, rackWidth, showIncompatible }),
    [parts, retired, query, filters, rackWidth, showIncompatible],
  );
  const count = groups.reduce((s, g) => s + g.items.length, 0);
  const nFilters = activeFilterCount(filters);
  const usedCount = useDesignStore((s) => (doomed ? s.design.placements.filter((p) => p.partId === doomed.id).length : 0));

  const confirmDelete = async () => {
    if (!doomed) return;
    const part = doomed;
    setDoomed(null);
    try {
      await deletePart(part.id);
      useCatalogStore.getState().remove(part.id);
      toast(`Deleted ${part.name}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2 left-2 size-4 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${parts.length - retired.size} parts…`}
              aria-label="Search parts"
              className={cx(inputClass, 'pl-8')}
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-600">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button
            aria-label="Filters"
            aria-expanded={showFilters}
            title="Filters"
            active={showFilters}
            onClick={() => setShowFilters((v) => !v)}
            className="relative border border-zinc-300 px-2 dark:border-zinc-700"
          >
            <Filter className="size-4" />
            {nFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{nFilters}</span>
            )}
          </Button>
          <Button aria-label="New custom part" title="New custom part" onClick={() => openBuilder({ mode: 'create' })} className="border border-zinc-300 px-2 dark:border-zinc-700">
            <Plus className="size-4" />
          </Button>
        </div>
        {showFilters && <Filters />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {status === 'loading' && <p className="p-3 text-sm text-zinc-500">Loading catalog…</p>}
        {status === 'ready' && count === 0 && (
          <div className="p-3 text-sm text-zinc-500">
            <p>No parts match.</p>
            <button type="button" className="mt-2 text-blue-600 hover:underline dark:text-blue-400" onClick={() => openBuilder({ mode: 'create' })}>
              Create a custom part
            </button>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.key} className="mb-3">
            <h3 className="sticky top-0 z-10 bg-zinc-50/95 px-1.5 py-1 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase backdrop-blur dark:bg-zinc-950/90 dark:text-zinc-400">
              {g.label} <span className="font-normal">({g.items.length})</span>
            </h3>
            <ul>
              {g.items.map(({ part, reason }) => (
                <CatalogItem key={part.id} part={part} rackWidth={rackWidth} reason={reason} onDelete={setDoomed} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {doomed && (
        <ConfirmDialog title={`Delete ${doomed.name}?`} confirmLabel="Delete part" onCancel={() => setDoomed(null)} onConfirm={() => void confirmDelete()}>
          <p>This removes the custom part from your catalog.</p>
          {usedCount > 0 && (
            <p className="mt-2 text-amber-700 dark:text-amber-400">
              It's used {usedCount} time{usedCount === 1 ? '' : 's'} in the current design; those placements will stop rendering.
            </p>
          )}
        </ConfirmDialog>
      )}
    </aside>
  );
}
