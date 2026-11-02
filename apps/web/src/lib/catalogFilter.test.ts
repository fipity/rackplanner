import { PartSchema, type Part, type PartInput } from '@rackplanner/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from '../store/uiStore';
import { facet, filterCatalog } from './catalogFilter';

const mk = (o: Partial<PartInput> & { id: string }): Part =>
  PartSchema.parse({
    brand: 'Ubiquiti',
    model: o.id,
    name: o.id,
    category: 'switch',
    heightU: 1,
    width: '19in',
    depthMm: 200,
    mounting: 'front',
    rackWidths: ['19in'],
    power: { typicalW: null, maxW: null },
    weightKg: null,
    render: { style: 'switch' },
    sourceUrl: null,
    verified: true,
    ...o,
  });

const parts = [
  mk({ id: 'sw-poe', name: 'Switch 24 PoE', poeBudgetW: 400 }),
  mk({ id: 'sw-plain', name: 'Switch 24' }),
  mk({ id: 'nas-2u', category: 'nas', heightU: 2, brand: 'Synology' }),
  mk({ id: 'ten-panel', category: 'patch-panel', width: '10in', rackWidths: ['10in'], brand: 'Generic' }),
  mk({ id: 'old-sw', legacy: true }),
  mk({ id: 'my-part', source: 'custom', verified: false, brand: 'Me' }),
  mk({ id: 'gone' }),
];
const base = { parts, retired: new Set(['gone']), query: '', filters: DEFAULT_FILTERS, rackWidth: '19in' as const, showIncompatible: false };
const ids = (groups: ReturnType<typeof filterCatalog>) => groups.flatMap((g) => g.items.map((i) => i.part.id)).sort();

describe('filterCatalog', () => {
  it('hides retired parts and parts that do not fit the rack by default', () => {
    expect(ids(filterCatalog(base))).toEqual(['my-part', 'nas-2u', 'old-sw', 'sw-plain', 'sw-poe']);
  });

  it('shows incompatible parts greyed out with a reason when asked', () => {
    const groups = filterCatalog({ ...base, showIncompatible: true });
    const entry = groups.flatMap((g) => g.items).find((i) => i.part.id === 'ten-panel');
    expect(entry?.reason).toMatch(/19in/);
  });

  it('puts custom parts in their own group first', () => {
    expect(filterCatalog(base)[0]?.label).toBe('My custom parts');
  });

  it('searches across brand, model, name and tags (all terms must match)', () => {
    expect(ids(filterCatalog({ ...base, query: 'switch poe' }))).toEqual(['sw-poe']);
    expect(ids(filterCatalog({ ...base, query: 'synology' }))).toEqual(['nas-2u']);
  });

  it.each([
    [{ brand: 'Synology' }, ['nas-2u']],
    [{ category: 'nas' }, ['nas-2u']],
    [{ height: '2' }, ['nas-2u']],
    [{ poe: 'yes' as const }, ['sw-poe']],
    [{ hideLegacy: true, category: 'switch' }, ['my-part', 'sw-plain', 'sw-poe']],
    [{ onlyCustom: true }, ['my-part']],
  ])('applies filter %o', (patch, expected) => {
    expect(ids(filterCatalog({ ...base, filters: { ...DEFAULT_FILTERS, ...patch } }))).toEqual(expected);
  });

  it('filters by rack width compatibility independently of the current rack', () => {
    const r = filterCatalog({ ...base, rackWidth: '10in', showIncompatible: true, filters: { ...DEFAULT_FILTERS, rackWidth: '10in' } });
    expect(ids(r)).toEqual(['ten-panel']);
  });

  it('builds facets with counts, excluding retired parts', () => {
    expect(facet(parts, base.retired, 'brand')).toContainEqual({ value: 'Ubiquiti', count: 3 });
  });
});
