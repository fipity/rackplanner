import { fitsRackWidth, type Part, type RackWidth } from '@rackplanner/shared';
import type { CatalogFilters } from '../store/uiStore';

export const CATEGORY_LABELS: Record<string, string> = {
  gateway: 'Gateways & routers',
  switch: 'Switches',
  'patch-panel': 'Patch panels',
  'cable-management': 'Cable management',
  blank: 'Blank panels',
  shelf: 'Shelves',
  server: 'Servers & chassis',
  nas: 'NAS & storage',
  nvr: 'NVR & Protect',
  power: 'Power (UPS, PDU)',
  mount: 'Mounts',
  accessory: 'Accessories',
  'mini-pc': 'Mini PCs',
  sbc: 'Single-board computers',
  modem: 'Modems & ONTs',
  storage: 'External storage',
};

export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export interface CatalogEntry {
  part: Part;
  /** Set when the part doesn't fit the current rack; the entry is shown greyed out. */
  reason?: string | undefined;
}

export interface CatalogGroup {
  key: string;
  label: string;
  items: CatalogEntry[];
}

export interface FilterInput {
  parts: readonly Part[];
  retired: ReadonlySet<string>;
  query: string;
  filters: CatalogFilters;
  rackWidth: RackWidth;
  showIncompatible: boolean;
}

function matchesHeight(part: Part, height: string): boolean {
  if (!height) return true;
  if (height === 'tall') return part.heightU >= 4;
  return part.heightU === Number(height);
}

/** Search + filter the catalog and group it by category (custom parts first). */
export function filterCatalog({ parts, retired, query, filters, rackWidth, showIncompatible }: FilterInput): CatalogGroup[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<string, CatalogEntry[]>();
  for (const part of parts) {
    if (retired.has(part.id)) continue;
    if (filters.onlyCustom && part.source !== 'custom') continue;
    if (filters.brand && part.brand !== filters.brand) continue;
    if (filters.category && part.category !== filters.category) continue;
    if (!matchesHeight(part, filters.height)) continue;
    if (filters.poe === 'yes' && !part.poeBudgetW) continue;
    if (filters.poe === 'no' && part.poeBudgetW) continue;
    if (filters.rackWidth !== 'any' && !fitsRackWidth(part, filters.rackWidth).ok) continue;
    if (filters.hideLegacy && part.legacy) continue;
    if (terms.length) {
      const hay = `${part.brand} ${part.model} ${part.name} ${part.category} ${part.subcategory ?? ''} ${part.tags.join(' ')}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
    }
    const fit = fitsRackWidth(part, rackWidth);
    if (!fit.ok && !showIncompatible) continue;
    const key = part.source === 'custom' ? '__custom' : part.category;
    const list = groups.get(key) ?? [];
    list.push({ part, reason: fit.ok ? undefined : fit.reason });
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      label: key === '__custom' ? 'My custom parts' : categoryLabel(key),
      items: items.sort(
        (a, b) =>
          Number(!!a.reason) - Number(!!b.reason) ||
          Number(!!a.part.legacy) - Number(!!b.part.legacy) ||
          a.part.name.localeCompare(b.part.name, undefined, { numeric: true }),
      ),
    }))
    .sort((a, b) => (a.key === '__custom' ? -1 : b.key === '__custom' ? 1 : a.label.localeCompare(b.label)));
}

/** Distinct values (with counts) for a filter dropdown. */
export function facet(parts: readonly Part[], retired: ReadonlySet<string>, key: 'brand' | 'category'): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of parts) if (!retired.has(p.id)) counts.set(p[key], (counts.get(p[key]) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
}

export function activeFilterCount(f: CatalogFilters): number {
  return [f.brand, f.category, f.height, f.poe !== 'any', f.rackWidth !== 'any', f.hideLegacy, f.onlyCustom].filter(Boolean).length;
}
