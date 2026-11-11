import { describe, expect, it } from 'vitest';
import { CatalogFileSchema, DesignSchema, PartSchema } from './schemas.js';

const valid = {
  id: 'ubiquiti-test-switch',
  brand: 'Ubiquiti',
  model: 'TEST-24',
  name: 'Test Switch 24',
  category: 'switch',
  heightU: 1,
  width: '19in',
  depthMm: 200,
  mounting: 'front',
  rackWidths: ['19in'],
  power: { typicalW: 10, maxW: 20 },
  weightKg: 2.5,
  ports: { rj45_1g: 24, sfp_plus: 2 },
  render: { style: 'switch', body: 'silver', accent: '#006fff' },
  sourceUrl: 'https://example.com/spec',
  verified: true,
};

describe('PartSchema', () => {
  it('accepts a valid part and applies defaults', () => {
    const p = PartSchema.parse(valid);
    expect(p.source).toBe('seed');
    expect(p.formFactor).toBe('rack');
    expect(p.tags).toEqual([]);
  });

  it('accepts explicit mm widths and null specs', () => {
    expect(
      PartSchema.safeParse({ ...valid, width: { mm: 180 }, depthMm: null, weightKg: null, power: { typicalW: null, maxW: null } })
        .success,
    ).toBe(true);
  });

  it.each([
    ['bad id', { id: 'Not Kebab' }],
    ['unknown port type', { ports: { rj45_7g: 1 } }],
    ['negative ports', { ports: { rj45_1g: -1 } }],
    ['non-half-U height', { heightU: 1.3 }],
    ['too tall', { heightU: 40 }],
    ['unknown width class', { width: '23in' }],
    ['unknown field', { colour: 'red' }],
    ['typical > max power', { power: { typicalW: 50, maxW: 20 } }],
    ['19in part without 19in rack width', { rackWidths: ['10in'] }],
    ['bad accent colour', { render: { style: 'switch', accent: 'blue' } }],
    ['bad url', { sourceUrl: 'not a url' }],
    ['missing verified flag', { verified: undefined }],
  ])('rejects %s', (_name, patch) => {
    expect(PartSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it('rejects desktop parts declared as shelves', () => {
    const r = PartSchema.safeParse({ ...valid, formFactor: 'desktop', shelf: { usableWidthMm: 100, usableDepthMm: 100 } });
    expect(r.success).toBe(false);
  });
});

describe('CatalogFileSchema', () => {
  it('requires a version and title', () => {
    expect(CatalogFileSchema.safeParse({ parts: [valid] }).success).toBe(false);
    expect(CatalogFileSchema.safeParse({ version: 1, title: 'Test', parts: [valid] }).success).toBe(true);
  });
});

describe('DesignSchema', () => {
  const design = {
    schemaVersion: 1,
    id: 'd1',
    name: 'Home rack',
    rack: { width: '19in', heightU: 12, depthMm: 600, numbering: 'bottom-up' },
    placements: [{ id: 'p1', partId: 'x', bottomU: 1, xMm: 0, mounting: 'front' }],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
  it('accepts a valid design', () => {
    expect(DesignSchema.parse(design).expectedPoeLoadW).toBeNull();
  });
  it('migrates v1 designs to v2 with a frame style by width', () => {
    const v2 = DesignSchema.parse(design);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.rack.frame).toBe('open-4post');
    expect(v2.rack.glassDoor).toBe(false);
    const mini = DesignSchema.parse({ ...design, rack: { ...design.rack, width: '10in' } });
    expect(mini.rack.frame).toBe('mini-10in');
    // Re-parsing a migrated design is a no-op.
    expect(DesignSchema.parse(v2)).toEqual(v2);
  });
  it('keeps per-port colours and rejects bad keys', () => {
    const p = { ...design.placements[0], portColors: { 'keystone:3': '#ff0000' } };
    expect(DesignSchema.parse({ ...design, placements: [p] }).placements[0]!.portColors).toEqual({ 'keystone:3': '#ff0000' });
    expect(DesignSchema.safeParse({ ...design, placements: [{ ...p, portColors: { bad: '#ff0000' } }] }).success).toBe(false);
  });
  it('rejects unknown future versions', () => {
    expect(DesignSchema.safeParse({ ...design, schemaVersion: 3 }).success).toBe(false);
  });
  it.each([[0], [33], [6.5]])('rejects rack height %s', (h) => {
    expect(DesignSchema.safeParse({ ...design, rack: { ...design.rack, heightU: h } }).success).toBe(false);
  });
  it('rejects a bottomU off the half-U grid', () => {
    expect(
      DesignSchema.safeParse({ ...design, placements: [{ ...design.placements[0], bottomU: 1.25 }] }).success,
    ).toBe(false);
  });
});
