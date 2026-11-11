import { describe, expect, it } from 'vitest';
import { cableProblems, guessCableType, portOptions, sameEnd, suggestCableLengthM } from './cables.js';
import { createDesign } from './design.js';
import { buildBom } from './exchange.js';
import type { Catalog } from './placement.js';
import { DesignSchema, PartSchema, type Cable, type Part, type PartInput } from './schemas.js';
import { computeStats } from './stats.js';

const mk = (o: Partial<PartInput> & { id: string }): Part =>
  PartSchema.parse({
    brand: 'T', model: o.id, name: o.id, category: 'switch', heightU: 1, width: '19in', depthMm: 200, mounting: 'front', rackWidths: ['19in'],
    power: { typicalW: null, maxW: null }, weightKg: null, render: { style: 'switch' }, sourceUrl: null, verified: false, ...o,
  });
const catalog: Catalog = new Map([mk({ id: 'swx', ports: { rj45_1g: 8, sfp_plus: 2 } }), mk({ id: 'ppx', category: 'patch-panel', ports: { keystone: 24 }, render: { style: 'patch-panel' } })].map((p) => [p.id, p]));
const cable = (id: string, a: Cable['a'], b: Cable['b'], extra: Partial<Cable> = {}): Cable => ({ id, a, b, type: 'copper', color: '#3b82f6', ...extra });
const base = {
  ...createDesign(),
  placements: [
    { id: 's', partId: 'swx', bottomU: 1, xMm: 0, mounting: 'front' as const },
    { id: 'p', partId: 'ppx', bottomU: 2, xMm: 0, mounting: 'front' as const },
  ],
};

describe('cables', () => {
  it('lists ports numbered per type', () => {
    const opts = portOptions(catalog.get('swx')!);
    expect(opts).toHaveLength(10);
    expect(opts[8]).toEqual({ type: 'sfp_plus', index: 1, label: 'SFP+ 10G 1' });
  });

  it('lists the rear of each patch panel port separately', () => {
    const opts = portOptions(catalog.get('ppx')!);
    expect(opts).toHaveLength(48);
    expect(opts[0]).toEqual({ type: 'keystone', index: 1, label: 'Keystone 1 (front)' });
    expect(opts[24]).toEqual({ type: 'keystone', index: 1, back: true, label: 'Keystone 1 (rear)' });
  });

  it('lets the front and rear of a patch port take one cable each', () => {
    const front = { placementId: 'p', port: { type: 'keystone' as const, index: 3 } };
    const back = { placementId: 'p', port: { type: 'keystone' as const, index: 3, back: true as const } };
    const cables = [
      cable('c1', { placementId: 's', port: { type: 'rj45_1g', index: 1 } }, front),
      cable('c2', { placementId: 's', port: { type: 'rj45_1g', index: 2 } }, back),
      cable('c3', { placementId: 's', port: { type: 'rj45_1g', index: 3 } }, { placementId: 'p', port: { type: 'keystone', index: 25, back: true } }),
    ];
    expect(cableProblems({ ...base, cables }, catalog).map((p) => `${p.cableId}: ${p.message}`)).toEqual(["c3: ppx · Keystone 25 (rear) doesn't exist on ppx"]);
    expect(sameEnd(front, back)).toBe(false);
    expect(DesignSchema.parse({ ...base, cables }).cables[1]!.b.port).toEqual(back.port);
  });

  it('guesses a cable type from the ports', () => {
    expect(guessCableType({ placementId: 'a', port: { type: 'rj45_1g', index: 1 } }, { placementId: 'b', port: { type: 'keystone', index: 1 } })).toBe('copper');
    expect(guessCableType({ placementId: 'a', port: { type: 'sfp_plus', index: 1 } }, { placementId: 'b', port: { type: 'sfp_plus', index: 2 } })).toBe('dac');
    expect(guessCableType({ placementId: 'a', port: { type: 'outlet_c13', index: 1 } }, { placementId: 'b' })).toBe('power');
  });

  it('suggests standard lengths with slack', () => {
    expect(suggestCableLengthM(44)).toBe(0.3);
    expect(suggestCableLengthM(400)).toBe(1);
    expect(suggestCableLengthM(50000)).toBe(71);
  });

  it('flags shared ports, missing ports and missing devices', () => {
    const cables = [
      cable('c1', { placementId: 's', port: { type: 'rj45_1g', index: 1 } }, { placementId: 'p', port: { type: 'keystone', index: 1 } }),
      cable('c2', { placementId: 's', port: { type: 'rj45_1g', index: 1 } }, { placementId: 'p', port: { type: 'keystone', index: 2 } }),
      cable('c3', { placementId: 's', port: { type: 'rj45_1g', index: 9 } }, { placementId: 'p' }),
      cable('c4', { placementId: 'gone' }, { placementId: 'p' }),
    ];
    const msgs = cableProblems({ ...base, cables }, catalog).map((p) => `${p.cableId}: ${p.message}`);
    expect(msgs).toEqual([
      'c2: swx · RJ45 1G 1 has more than one cable',
      "c3: swx · RJ45 1G 9 doesn't exist on swx",
      'c4: A cable is connected to a device that no longer exists',
    ]);
  });

  it('feeds stats and the BOM', () => {
    const cables = [
      cable('c1', { placementId: 's', port: { type: 'rj45_1g', index: 1 } }, { placementId: 'p', port: { type: 'keystone', index: 1 } }, { lengthM: 0.3 }),
      cable('c2', { placementId: 's', port: { type: 'rj45_1g', index: 2 } }, { placementId: 'p', port: { type: 'keystone', index: 2 } }, { lengthM: 0.3, label: 'AP office' }),
      cable('c3', { placementId: 's', port: { type: 'sfp_plus', index: 1 } }, { placementId: 's', port: { type: 'sfp_plus', index: 2 } }, { type: 'dac' }),
    ];
    const s = computeStats({ ...base, cables }, catalog);
    expect(s.cables).toEqual({ count: 3, byType: { copper: 2, dac: 1 }, totalLengthM: 0.6, withoutLength: 1 });
    const bom = buildBom({ ...base, cables }, catalog).filter((r) => r.category === 'cable');
    expect(bom.map((r) => [r.model, r.qty])).toEqual([
      ['Copper (RJ45) 0.3 m', 2],
      ['DAC / twinax length not set', 1],
    ]);
    expect(bom[0]?.labels).toEqual(['AP office']);
  });

  it('keeps old designs without cables valid', () => {
    const { cables: _omit, ...old } = base;
    expect(DesignSchema.parse(old).cables).toEqual([]);
  });
});
