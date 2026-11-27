import { describe, expect, it } from 'vitest';
import { rackAirflow } from './airflow.js';
import { createDesign } from './design.js';
import { buildBom, bomToCsv, facingText, parseDesignImport } from './exchange.js';
import { canReverse, facingOf, isReversed, reversePlacements, reverseRoots, withFacing } from './facing.js';
import { checkPlacement, occupancyOf, type Catalog } from './placement.js';
import { DesignSchema, PartSchema, type Design, type Part, type PartInput, type PlacedPart } from './schemas.js';
import { computeStats } from './stats.js';

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
    part({ id: 'swx', ports: { rj45_1g: 24 }, airflow: 'front-to-back' }),
    part({ id: 'half-a', depthMm: 300 }),
    part({ id: 'half-b', depthMm: 350 }),
    part({ id: 'srv', heightU: 2, mounting: 'full-depth', depthMm: 700, category: 'server' }),
    part({ id: 'side', airflow: 'side-to-side' }),
    part({ id: 'shelf', category: 'shelf', depthMm: 250, shelf: { usableWidthMm: 430, usableDepthMm: 240 }, render: { style: 'shelf' } }),
    part({ id: 'mini', formFactor: 'desktop', width: { mm: 180 }, depthMm: 200, category: 'mini-pc', ports: { rj45_1g: 1 }, render: { style: 'desktop' } }),
    part({ id: 'plate', formFactor: 'wall', heightU: 3, heightMm: 115, width: { mm: 72 }, depthMm: 12, render: { style: 'desktop' } }),
    part({
      id: 'mount',
      category: 'mount',
      heightU: 2,
      width: '10in',
      rackWidths: ['10in', '19in'],
      tags: ['3d-printed'],
      shelf: { usableWidthMm: 200, usableDepthMm: 200 },
      render: { style: 'shelf' },
      printed: {
        kind: 'rackmount',
        source: { site: 'makerworld', modelId: '1', profileId: null, url: 'https://makerworld.com/en/models/1', title: null, designer: null, designerUrl: null, licence: null, profileName: null, description: null, fetchedAt: null },
        holds: [{ partId: 'mini', qty: 1 }],
        filament: '#111111',
        status: 'planned',
      },
    }),
  ].map((p) => [p.id, p]),
);

const pp = (id: string, partId: string, bottomU: number, extra: Partial<PlacedPart> = {}): PlacedPart => ({ id, partId, bottomU, xMm: 0, mounting: 'front', ...extra });
const design = (placements: PlacedPart[], rack: Partial<Design['rack']> = {}): Design => ({ ...createDesign({ rack: { heightU: 12, depthMm: 600, ...rack } }), placements });
const byId = (d: Pick<Design, 'placements'>, id: string) => d.placements.find((p) => p.id === id)!;

describe('migration of saved designs', () => {
  const v2 = {
    schemaVersion: 2,
    id: 'd',
    name: 'Old rack',
    rack: { width: '19in', heightU: 12, depthMm: 600, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false, wall: true },
    placements: [
      { id: 'f', partId: 'swx', bottomU: 1, xMm: 0, mounting: 'front' },
      { id: 'r', partId: 'swx', bottomU: 2, xMm: 0, mounting: 'rear' },
      { id: 'fd', partId: 'srv', bottomU: 3, xMm: 0, mounting: 'full-depth' },
      { id: 'rs', partId: 'shelf', bottomU: 5, xMm: 0, mounting: 'rear' },
      { id: 'kid', partId: 'mini', parentId: 'rs', bottomU: 5, xMm: 0, mounting: 'rear' },
      { id: 'w', partId: 'plate', bottomU: 1, xMm: 0, mounting: 'front', wall: true },
    ],
    cables: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  it('v2 → v3 keeps every part looking the way it did: rear-rail gear (and what sits on it) faces the rear', () => {
    const d = DesignSchema.parse(v2);
    expect(d.schemaVersion).toBe(3);
    expect(Object.fromEntries(d.placements.map((p) => [p.id, p.facing]))).toEqual({ f: 'front', r: 'rear', fd: 'front', rs: 'rear', kid: 'rear', w: 'front' });
    // Nothing counts as reversed after the upgrade.
    expect(d.placements.some((p) => isReversed(d.placements, p))).toBe(false);
    // Re-parsing is a no-op.
    expect(DesignSchema.parse(d)).toEqual(d);
  });

  it('v1 designs go all the way to v3', () => {
    const v1 = { ...v2, schemaVersion: 1, rack: { width: '19in', heightU: 12, depthMm: 600, numbering: 'bottom-up' } };
    const d = DesignSchema.parse(v1);
    expect(d.schemaVersion).toBe(3);
    expect(d.rack.frame).toBe('open-4post');
    expect(byId(d, 'f').facing).toBe('front');
  });

  it('JSON exports without facing import as front-facing (front and full-depth gear)', () => {
    const file = { format: 'rackplanner-design', formatVersion: 1, exportedAt: '2026-11-01T00:00:00.000Z', design: { ...v2, placements: v2.placements.slice(0, 1) }, customParts: [] };
    const r = parseDesignImport(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.design.placements[0]!.facing).toBe('front');
  });

  it('keeps facing through export and import', () => {
    const d = DesignSchema.parse({ ...v2, schemaVersion: 3, placements: [{ ...v2.placements[0], facing: 'rear' }] });
    const back = DesignSchema.parse(JSON.parse(JSON.stringify(d)));
    expect(back.placements[0]!.facing).toBe('rear');
  });

  it('rejects a bad facing value', () => {
    expect(DesignSchema.safeParse({ ...v2, schemaVersion: 3, placements: [{ ...v2.placements[0], facing: 'up' }] }).success).toBe(false);
  });
});

describe('facingOf / withFacing', () => {
  it('defaults from the rails, the shelf, or the wall', () => {
    const ps = [pp('a', 'swx', 1), pp('b', 'swx', 2, { mounting: 'rear' }), pp('s', 'shelf', 3, { mounting: 'rear' }), pp('k', 'mini', 3, { parentId: 's' }), pp('w', 'plate', 1, { wall: true })];
    expect(ps.map((p) => facingOf(ps, p))).toEqual(['front', 'rear', 'rear', 'rear', 'front']);
    expect(withFacing(ps).map((p) => p.facing)).toEqual(['front', 'rear', 'rear', 'rear', 'front']);
  });
});

describe('reversing', () => {
  it('turns a part round without moving it: same U, x, faces and depth', () => {
    const d = design([pp('a', 'half-a', 4, { xMm: 10 })]);
    const before = occupancyOf(d.placements, byId(d, 'a'), catalog)!;
    const r = reversePlacements(d, ['a'], catalog);
    const after = occupancyOf(r.placements, byId(r, 'a'), catalog)!;
    expect(byId(r, 'a').facing).toBe('rear');
    expect(after).toEqual({ ...before, facing: 'rear' });
    expect(isReversed(r.placements, byId(r, 'a'))).toBe(true);
    // Reversing again brings it back.
    expect(byId(reversePlacements(r, ['a'], catalog), 'a').facing).toBe('front');
  });

  it('a reversed half-depth part at the front shares its U with a half-depth part at the rear while they fit the depth', () => {
    const d = design(reversePlacements(design([pp('a', 'half-a', 4), pp('b', 'half-a', 4, { mounting: 'rear' })]), ['a', 'b'], catalog).placements);
    expect(byId(d, 'a').facing).toBe('rear');
    expect(byId(d, 'b').facing).toBe('front');
    expect(checkPlacement(d, byId(d, 'a'), catalog).ok).toBe(true); // 300 + 300 ≤ 600
    const deep = { ...d, placements: d.placements.map((p) => (p.id === 'b' ? { ...p, partId: 'half-b' } : p)) };
    const c = checkPlacement(deep, byId(deep, 'a'), catalog); // 300 + 350 > 600
    expect(c.ok).toBe(false);
    expect(c.collisions[0]?.reason).toBe('depth');
  });

  it('flipping a shelf flips everything on it; items on it can also be flipped on their own', () => {
    const d = design([pp('s', 'shelf', 3), pp('k1', 'mini', 3, { parentId: 's' }), pp('k2', 'mini', 3, { parentId: 's', xMm: 200 })]);
    const one = reversePlacements(d, ['k1'], catalog);
    expect([facingOf(one.placements, byId(one, 's')), byId(one, 'k1').facing, facingOf(one.placements, byId(one, 'k2'))]).toEqual(['front', 'rear', 'front']);
    const all = reversePlacements(one, ['s'], catalog);
    // Each item turns round in place, so k1 (already reversed) now faces front.
    expect([byId(all, 's').facing, byId(all, 'k1').facing, byId(all, 'k2').facing]).toEqual(['rear', 'front', 'rear']);
    expect(all.flipped.sort()).toEqual(['k1', 'k2', 's']);
  });

  it('selecting a shelf and something on it turns each round once', () => {
    const d = design([pp('s', 'shelf', 3), pp('k', 'mini', 3, { parentId: 's' })]);
    expect(reverseRoots(d.placements, ['k', 's'], catalog)).toEqual(['s']);
    const r = reversePlacements(d, ['k', 's'], catalog);
    expect([byId(r, 's').facing, byId(r, 'k').facing]).toEqual(['rear', 'rear']);
  });

  it('a 3D-printed mount and the device in it flip together, whichever is picked', () => {
    const d = design([pp('m', 'mount', 1), pp('dev', 'mini', 1, { parentId: 'm' })]);
    for (const pick of ['m', 'dev']) {
      const r = reversePlacements(d, [pick], catalog);
      expect([byId(r, 'm').facing, byId(r, 'dev').facing]).toEqual(['rear', 'rear']);
    }
  });

  it('works on several parts at once and skips wall gear', () => {
    const d = design([pp('a', 'swx', 1), pp('b', 'swx', 2), pp('w', 'plate', 1, { wall: true })], { wall: true });
    expect(canReverse(byId(d, 'w'))).toBe(false);
    const r = reversePlacements(d, ['a', 'b', 'w'], catalog);
    expect(r.flipped.sort()).toEqual(['a', 'b']);
    expect(r.skipped).toEqual(['w']);
    expect(byId(r, 'w').facing).toBeUndefined();
  });

  it('rear-rail gear reversed faces the front', () => {
    const d = design([pp('r', 'swx', 1, { mounting: 'rear' })]);
    const r = reversePlacements(d, ['r'], catalog);
    expect(byId(r, 'r').facing).toBe('front');
    expect(isReversed(r.placements, byId(r, 'r'))).toBe(true);
  });
});

describe('airflow and warnings', () => {
  it('reversing a part reverses its airflow through the rack', () => {
    const d = design([pp('a', 'swx', 1)]);
    expect(rackAirflow(byId(d, 'a'), catalog.get('swx')!, d.placements)).toBe('out-rear');
    const r = reversePlacements(d, ['a'], catalog);
    expect(rackAirflow(byId(r, 'a'), catalog.get('swx')!, r.placements)).toBe('out-front');
  });

  it('warns about mixed airflow once one of two servers is reversed', () => {
    const d = design([pp('s1', 'srv', 1, { mounting: 'full-depth' }), pp('s2', 'srv', 3, { mounting: 'full-depth' })]);
    expect(computeStats(d, catalog).warnings.some((w) => w.code === 'airflow-mixed')).toBe(false);
    const r = design(reversePlacements(d, ['s2'], catalog).placements);
    const w = computeStats(r, catalog).warnings.find((x) => x.code === 'airflow-mixed');
    expect(w?.placementIds).toEqual(['s2']);
    expect(w?.message).toContain('Reverse it (R)');
  });

  it('notes side-to-side gear in a front-to-back rack', () => {
    const d = design([pp('s1', 'srv', 1, { mounting: 'full-depth' }), pp('x', 'side', 4)]);
    expect(computeStats(d, catalog).warnings.find((w) => w.code === 'airflow-side')?.placementIds).toEqual(['x']);
    expect(computeStats(design([pp('x', 'side', 4)]), catalog).warnings.some((w) => w.code === 'airflow-side')).toBe(false);
  });

  it('warns when a reversed part’s ports face a closed back', () => {
    const placements = reversePlacements({ placements: [pp('a', 'swx', 1), pp('b', 'swx', 2), pp('c', 'half-a', 3)] }, ['a', 'c'], catalog).placements;
    const open = computeStats(design(placements), catalog);
    expect(open.warnings.some((w) => w.code === 'ports-face-closed-back')).toBe(false);
    const closed = computeStats(design(placements, { closedBack: true }), catalog);
    // 'c' has no ports, 'b' faces front: only 'a'.
    expect(closed.warnings.find((w) => w.code === 'ports-face-closed-back')?.placementIds).toEqual(['a']);
  });
});

describe('bill of materials', () => {
  it('has a Facing column', () => {
    const placements = reversePlacements({ placements: [pp('a', 'swx', 1), pp('b', 'swx', 2), pp('c', 'half-a', 3)] }, ['a', 'c'], catalog).placements;
    const rows = buildBom({ placements }, catalog);
    expect(rows.find((r) => r.partId === 'swx')!.facing).toEqual({ front: 1, rear: 1 });
    expect(facingText(rows.find((r) => r.partId === 'swx')!)).toBe('1 front, 1 rear');
    expect(facingText(rows.find((r) => r.partId === 'half-a')!)).toBe('Rear');
    const csv = bomToCsv(rows).split('\r\n');
    const col = csv[0]!.split(',').indexOf('Facing');
    expect(col).toBeGreaterThan(0);
    expect(csv.find((l) => l.startsWith('T,half-a,'))!.split(',')[col]).toBe('Rear');
    expect(bomToCsv(rows)).toContain(',"1 front, 1 rear",');
  });
});
