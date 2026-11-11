import { describe, expect, it } from 'vitest';
import { createDesign } from './design.js';
import type { Catalog } from './placement.js';
import { PartSchema, type Design, type Part, type PartInput, type PlacedPart } from './schemas.js';
import { computeStats, placementPower } from './stats.js';

function part(o: Partial<PartInput> & Pick<PartInput, 'id'>): Part {
  return PartSchema.parse({
    brand: 'T',
    model: o.id,
    name: o.id,
    category: 'switch',
    heightU: 1,
    width: '19in',
    depthMm: 300,
    mounting: 'front',
    rackWidths: ['19in'],
    power: { typicalW: null, maxW: null },
    weightKg: null,
    render: { style: 'switch' },
    sourceUrl: null,
    verified: false,
    ...o,
  });
}

const catalog: Catalog = new Map(
  [
    part({ id: 'swx', power: { typicalW: 20, maxW: 50 }, weightKg: 4, poeBudgetW: 400, ports: { rj45_1g: 24, sfp_plus: 2 } }),
    part({ id: 'srv', heightU: 2, mounting: 'full-depth', depthMm: 700, category: 'server', power: { typicalW: null, maxW: null }, weightKg: 20 }),
    part({ id: 'nas', heightU: 2, category: 'nas', power: { typicalW: 60, maxW: null }, weightKg: 10 }),
    part({ id: 'ups', heightU: 2, category: 'power', subcategory: 'ups', ups: { capacityW: 100, capacityVA: 150 }, weightKg: 14 }),
    part({ id: 'pdu', category: 'power', subcategory: 'pdu', mounting: 'rear', depthMm: 50, ports: { outlet_c13: 8 } }),
    part({ id: 'blank', category: 'blank', depthMm: 5, render: { style: 'blank' } }),
    part({ id: 'panel', category: 'patch-panel', depthMm: 40, ports: { keystone: 24 }, render: { style: 'patch-panel' } }),
    part({ id: 'shelf', category: 'shelf', depthMm: 250, shelf: { usableWidthMm: 430, usableDepthMm: 240 }, render: { style: 'shelf' } }),
    part({ id: 'mini', formFactor: 'desktop', width: { mm: 180 }, depthMm: 260, category: 'mini-pc', power: { typicalW: 10, maxW: 30 }, render: { style: 'desktop' } }),
  ].map((p) => [p.id, p]),
);

const pp = (id: string, partId: string, bottomU: number, extra: Partial<PlacedPart> = {}): PlacedPart => ({
  id,
  partId,
  bottomU,
  xMm: 0,
  mounting: catalog.get(partId)?.mounting ?? 'front',
  ...extra,
});

function design(placements: PlacedPart[], over: Partial<Design> = {}): Design {
  return { ...createDesign({ rack: { heightU: 12 } }), placements, ...over };
}

describe('computeStats', () => {
  it('counts U used across faces without double counting', () => {
    const s = computeStats(design([pp('a', 'swx', 1), pp('b', 'pdu', 1), pp('c', 'srv', 3)]), catalog);
    expect(s.usedU).toBe(3);
    expect(s.freeU).toBe(9);
    expect(s.deviceCount).toBe(3);
  });

  it('sums power, falling back between typical and max and skipping UPS/PDU', () => {
    const s = computeStats(design([pp('a', 'swx', 1), pp('n', 'nas', 2), pp('u', 'ups', 5), pp('p', 'pdu', 8)]), catalog);
    expect(s.power.typicalW).toBe(80); // 20 + 60
    expect(s.power.maxW).toBe(110); // 50 + 60 (NAS max falls back to typical)
    expect(s.power.estimatedCount).toBe(1);
    expect(s.power.unknownIds).toEqual([]);
  });

  it('uses measured power over catalog figures', () => {
    const s = computeStats(design([pp('a', 'swx', 1, { measuredW: 33 }), pp('s', 'srv', 3, { measuredW: 140 })]), catalog);
    expect(s.power.typicalW).toBe(173);
    expect(s.power.maxW).toBe(173);
    expect(s.power.measuredCount).toBe(2);
    expect(placementPower(pp('x', 'swx', 1, { measuredW: 0 }), catalog.get('swx')!)).toMatchObject({ typicalW: 0, measured: true });
  });

  it('lists active parts with no power data, but not passive ones', () => {
    const s = computeStats(design([pp('s', 'srv', 3), pp('b', 'blank', 1), pp('k', 'panel', 2)]), catalog);
    expect(s.power.unknownIds).toEqual(['s']);
    expect(s.passiveCount).toBe(2);
    expect(s.warnings.find((w) => w.code === 'unknown-power')?.severity).toBe('info');
  });

  it('warns when typical or max draw (plus expected PoE) exceeds UPS capacity', () => {
    const base = [pp('a', 'swx', 1), pp('n', 'nas', 2), pp('u', 'ups', 5)];
    expect(computeStats(design(base), catalog).warnings.find((w) => w.code === 'ups-max-overload')).toBeTruthy(); // 110 > 100
    const over = computeStats(design(base, { expectedPoeLoadW: 30 }), catalog);
    expect(over.warnings.find((w) => w.code === 'ups-overload')?.severity).toBe('error'); // 80 + 30 > 100
    expect(over.power.maxWithPoeW).toBe(140);
    expect(over.ups).toEqual({ capacityW: 100, capacityVA: 150, count: 1 });
  });

  it('checks expected PoE load against the PoE budget', () => {
    expect(computeStats(design([pp('a', 'swx', 1)], { expectedPoeLoadW: 500 }), catalog).warnings.map((w) => w.code)).toContain('poe-overload');
    expect(computeStats(design([pp('a', 'swx', 1)], { expectedPoeLoadW: 300 }), catalog).warnings.map((w) => w.code)).not.toContain('poe-overload');
    expect(computeStats(design([pp('n', 'nas', 1)], { expectedPoeLoadW: 50 }), catalog).warnings.map((w) => w.code)).toContain('no-poe-source');
  });

  it('totals weight and ports', () => {
    const s = computeStats(design([pp('a', 'swx', 1), pp('b', 'swx', 2), pp('k', 'panel', 3), pp('s', 'srv', 5)]), catalog);
    expect(s.weight.totalKg).toBe(28);
    expect(s.ports).toEqual({ rj45_1g: 48, sfp_plus: 4, keystone: 24 });
    expect(s.poe.budgetW).toBe(800);
  });

  it('warns about devices deeper than the rack', () => {
    const s = computeStats(design([pp('s', 'srv', 1)], { rack: { width: '19in', heightU: 12, depthMm: 600, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false } }), catalog);
    expect(s.warnings.find((w) => w.code === 'too-deep')?.message).toContain('700 mm deep');
  });

  it('warns about desktop gear not on a shelf and items deeper than their shelf', () => {
    const loose = computeStats(design([pp('m', 'mini', 1)]), catalog);
    expect(loose.warnings.map((w) => w.code)).toContain('desktop-not-on-shelf');
    const onShelf = computeStats(design([pp('sh', 'shelf', 1), pp('m', 'mini', 1, { parentId: 'sh' })]), catalog);
    expect(onShelf.warnings.map((w) => w.code)).not.toContain('desktop-not-on-shelf');
    expect(onShelf.warnings.find((w) => w.code === 'shelf-too-shallow')?.placementIds).toEqual(['m']);
  });

  it('reports collisions once and unknown parts', () => {
    const s = computeStats(design([pp('a', 'swx', 1), pp('b', 'swx', 1), pp('x', 'nope', 5)]), catalog);
    const invalid = s.warnings.filter((w) => w.code === 'invalid-placement');
    expect(invalid).toHaveLength(1);
    expect(invalid[0]?.placementIds.sort()).toEqual(['a', 'b']);
    expect(s.warnings[0]?.code).toBe('unknown-part');
  });

  it('reports parts that do not fit the rack width (e.g. after an import)', () => {
    const s = computeStats(design([pp('a', 'swx', 1)], { rack: { width: '10in', heightU: 12, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false } }), catalog);
    expect(s.warnings.find((w) => w.code === 'invalid-placement')?.message).toMatch(/10in/);
  });
});

describe('createDesign', () => {
  it('produces a valid empty design with defaults', () => {
    const d = createDesign({ name: '  Lab  ', rack: { width: '10in' } });
    expect(d.name).toBe('Lab');
    expect(d.rack).toEqual({ width: '10in', heightU: 12, depthMm: null, numbering: 'bottom-up', frame: 'mini-10in', glassDoor: false });
    expect(d.placements).toEqual([]);
  });
});
