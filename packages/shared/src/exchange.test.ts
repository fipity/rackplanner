import { describe, expect, it } from 'vitest';
import { createDesign } from './design.js';
import { bomToCsv, buildBom, buildDesignExport, parseDesignImport } from './exchange.js';
import type { Catalog } from './placement.js';
import { PartSchema, type Part, type PartInput } from './schemas.js';

const mk = (o: Partial<PartInput> & { id: string }): Part =>
  PartSchema.parse({
    brand: 'Ubiquiti', model: o.id.toUpperCase(), name: o.id, category: 'switch', heightU: 1, width: '19in', depthMm: 200,
    mounting: 'front', rackWidths: ['19in'], power: { typicalW: 10, maxW: 20 }, weightKg: 2, render: { style: 'switch' },
    sourceUrl: 'https://example.com', verified: true, ...o,
  });
const catalog: Catalog = new Map([
  mk({ id: 'sw-a' }),
  mk({ id: 'custom-box-1', source: 'custom', verified: false, brand: 'Me, Inc', name: '=cmd()', sourceUrl: null }),
].map((p) => [p.id, p]));

const design = {
  ...createDesign({ name: 'Lab' }),
  placements: [
    { id: 'p1', partId: 'sw-a', bottomU: 1, xMm: 0, mounting: 'front' as const, label: 'core', measuredW: 15 },
    { id: 'p2', partId: 'sw-a', bottomU: 2, xMm: 0, mounting: 'front' as const },
    { id: 'p3', partId: 'custom-box-1', bottomU: 3, xMm: 0, mounting: 'front' as const },
  ],
};

describe('design export / import', () => {
  it('round-trips including the custom parts in use', () => {
    const exported = buildDesignExport(design, catalog);
    expect(exported.customParts.map((p) => p.id)).toEqual(['custom-box-1']);
    const r = parseDesignImport(JSON.stringify(exported));
    expect(r.ok && r.design.placements).toHaveLength(3);
    expect(r.ok && r.customParts).toHaveLength(1);
  });

  it('accepts a bare design', () => {
    const r = parseDesignImport(JSON.stringify(design));
    expect(r.ok).toBe(true);
  });

  it.each([
    ['not json', '{oops', /Not valid JSON/],
    ['wrong shape', JSON.stringify({ hello: 1 }), /Not a RackPlanner design/],
    ['bad rack', JSON.stringify({ ...design, rack: { ...design.rack, heightU: 99 } }), /rack\.heightU/],
  ])('rejects %s with a readable error', (_n, text, re) => {
    const r = parseDesignImport(text);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(re);
  });
});

describe('bill of materials', () => {
  it('groups placements by part with quantities, U and measured power', () => {
    const rows = buildBom(design, catalog);
    const sw = rows.find((r) => r.partId === 'sw-a')!;
    expect(sw).toMatchObject({ qty: 2, totalU: 2, measuredW: 15, labels: ['core'] });
  });

  it('writes CSV with escaping and formula-injection protection', () => {
    const csv = bomToCsv(buildBom(design, catalog));
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Brand,Model,Name,Category,Qty,U each,U total,Typical W each,Max W each,Measured W total,Weight kg each,Labels,Spec URL');
    expect(csv).toContain('"Me, Inc"');
    expect(csv).toContain(`"'=cmd()"`);
    expect(lines).toHaveLength(3);
  });

  it('marks parts missing from the catalog', () => {
    const rows = buildBom({ placements: [{ id: 'x', partId: 'gone', bottomU: 1, xMm: 0, mounting: 'front' }] }, catalog);
    expect(rows[0]).toMatchObject({ missing: true, qty: 1 });
  });
});
