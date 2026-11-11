import { describe, expect, it } from 'vitest';
import {
  alignedX,
  findShelfSlot,
  applyRackChange,
  canAlign,
  checkPlacement,
  findFreeSlot,
  occupancyOf,
  resolveDrop,
  snapBottomU,
  xCandidates,
  type Catalog,
} from './placement.js';
import { PartSchema, type Part, type PartInput, type PlacedPart, type Rack } from './schemas.js';

function part(overrides: Partial<PartInput> & Pick<PartInput, 'id'>): Part {
  return PartSchema.parse({
    brand: 'Test',
    model: overrides.id,
    name: overrides.id,
    category: 'test',
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
    ...overrides,
  });
}

const parts = [
  part({ id: 'sw-1u' }),
  part({ id: 'srv-2u', heightU: 2, mounting: 'full-depth', depthMm: 700, render: { style: 'server' } }),
  part({ id: 'pp-half', heightU: 0.5, render: { style: 'patch-panel' } }),
  part({ id: 'mini-10', width: '10in', rackWidths: ['10in', '19in'] }),
  part({ id: 'half-19', width: 'half-19in', rackWidths: ['19in'] }),
  part({ id: 'pdu-rear', mounting: 'rear', depthMm: 200, render: { style: 'pdu' } }),
  part({ id: 'ten-only', width: '10in', rackWidths: ['10in'] }),
  part({
    id: 'shelf-1u',
    mounting: 'front',
    depthMm: 250,
    shelf: { usableWidthMm: 430, usableDepthMm: 240 },
    render: { style: 'shelf' },
  }),
  part({ id: 'mini-pc', formFactor: 'desktop', heightU: 2, width: { mm: 180 }, depthMm: 180, render: { style: 'desktop' } }),
];
const catalog: Catalog = new Map(parts.map((p) => [p.id, p]));

const rack19: Rack = { width: '19in', heightU: 12, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false };
const pp = (p: Partial<PlacedPart> & Pick<PlacedPart, 'id' | 'partId'>): PlacedPart => ({
  bottomU: 1,
  xMm: 0,
  mounting: 'front',
  ...p,
});

describe('collision detection', () => {
  it('accepts a part in an empty rack', () => {
    const r = checkPlacement({ rack: rack19, placements: [] }, pp({ id: 'a', partId: 'sw-1u', bottomU: 5 }), catalog);
    expect(r.ok).toBe(true);
  });

  it('rejects overlapping full-width parts and names the culprit', () => {
    const placements = [pp({ id: 'srv', partId: 'srv-2u', bottomU: 3, mounting: 'full-depth', label: 'pve1' })];
    const r = checkPlacement({ rack: rack19, placements }, pp({ id: 'b', partId: 'sw-1u', bottomU: 4 }), catalog);
    expect(r.ok).toBe(false);
    expect(r.collisions.map((c) => c.placementId)).toEqual(['srv']);
    expect(r.problems.find((p) => p.code === 'collision')?.message).toContain('pve1 (U3–4)');
  });

  it('allows touching parts (adjacent U)', () => {
    const placements = [pp({ id: 'srv', partId: 'srv-2u', bottomU: 3, mounting: 'full-depth' })];
    const below = checkPlacement({ rack: rack19, placements }, pp({ id: 'b', partId: 'sw-1u', bottomU: 2 }), catalog);
    const above = checkPlacement({ rack: rack19, placements }, pp({ id: 'c', partId: 'sw-1u', bottomU: 5 }), catalog);
    expect(below.ok).toBe(true);
    expect(above.ok).toBe(true);
  });

  it('rejects parts outside the rack', () => {
    const top = checkPlacement({ rack: rack19, placements: [] }, pp({ id: 'a', partId: 'srv-2u', bottomU: 12, mounting: 'full-depth' }), catalog);
    expect(top.ok).toBe(false);
    expect(top.problems[0]?.code).toBe('out-of-bounds');
  });

  it('ignores the placement being moved', () => {
    const placements = [pp({ id: 'a', partId: 'srv-2u', bottomU: 3, mounting: 'full-depth' })];
    const r = checkPlacement({ rack: rack19, placements }, { ...placements[0]!, bottomU: 4 }, catalog);
    expect(r.ok).toBe(true);
  });

  it('stacks two half-U panels in one U', () => {
    const placements = [pp({ id: 'a', partId: 'pp-half', bottomU: 1 })];
    expect(checkPlacement({ rack: rack19, placements }, pp({ id: 'b', partId: 'pp-half', bottomU: 1.5 }), catalog).ok).toBe(true);
    expect(checkPlacement({ rack: rack19, placements }, pp({ id: 'b', partId: 'pp-half', bottomU: 1 }), catalog).ok).toBe(false);
  });
});

describe('partial-width placement', () => {
  it('places two half-width devices side by side', () => {
    const placements = [pp({ id: 'a', partId: 'half-19', bottomU: 2, xMm: 0 })];
    const right = checkPlacement({ rack: rack19, placements }, pp({ id: 'b', partId: 'half-19', bottomU: 2, xMm: 225 }), catalog);
    const overlapping = checkPlacement({ rack: rack19, placements }, pp({ id: 'c', partId: 'half-19', bottomU: 2, xMm: 100 }), catalog);
    expect(right.ok).toBe(true);
    expect(overlapping.ok).toBe(false);
  });

  it('offers left / centre / right and flush-to-neighbour x positions', () => {
    const empty = xCandidates({ rack: rack19, placements: [] }, catalog.get('mini-10')!, 1, catalog);
    expect(empty).toEqual([0, 114, 228]);
    const withNeighbour = xCandidates(
      { rack: rack19, placements: [pp({ id: 'a', partId: 'half-19', xMm: 0 })] },
      catalog.get('mini-10')!,
      1,
      catalog,
    );
    expect(withNeighbour).toContain(225);
  });

  it('only offers x=0 for full-width parts', () => {
    expect(xCandidates({ rack: rack19, placements: [] }, catalog.get('sw-1u')!, 1, catalog)).toEqual([0]);
  });

  it('rejects parts that extend past the opening', () => {
    const r = checkPlacement({ rack: rack19, placements: [] }, pp({ id: 'a', partId: 'mini-10', xMm: 300 }), catalog);
    expect(r.ok).toBe(false);
  });

  it('rejects parts not compatible with the rack width', () => {
    expect(checkPlacement({ rack: rack19, placements: [] }, pp({ id: 'a', partId: 'ten-only' }), catalog).problems[0]?.code).toBe(
      'rack-width',
    );
    const rack10: Rack = { ...rack19, width: '10in' };
    expect(checkPlacement({ rack: rack10, placements: [] }, pp({ id: 'a', partId: 'sw-1u' }), catalog).problems[0]?.code).toBe(
      'rack-width',
    );
  });

  it('resolveDrop picks the nearest free horizontal slot', () => {
    const design = { rack: rack19, placements: [pp({ id: 'a', partId: 'mini-10', xMm: 0, bottomU: 4 })] };
    const res = resolveDrop(design, catalog, { partId: 'mini-10', rawBottomU: 4.2, rawXMm: 10, mounting: 'front' });
    expect(res?.check.ok).toBe(true);
    expect(res?.candidate.bottomU).toBe(4);
    expect(res?.candidate.xMm).toBe(222);
  });
});

describe('front / rear / full-depth occupancy', () => {
  it('lets a front and a rear part share a U when depth is unknown', () => {
    const placements = [pp({ id: 'a', partId: 'sw-1u', bottomU: 1, mounting: 'front' })];
    const r = checkPlacement({ rack: rack19, placements }, pp({ id: 'b', partId: 'pdu-rear', bottomU: 1, mounting: 'rear' }), catalog);
    expect(r.ok).toBe(true);
  });

  it('blocks a front + rear pair that is too deep for the rack', () => {
    const shallow: Rack = { ...rack19, depthMm: 450 };
    const placements = [pp({ id: 'a', partId: 'sw-1u', bottomU: 1, mounting: 'front' })]; // 300 mm
    const r = checkPlacement({ rack: shallow, placements }, pp({ id: 'b', partId: 'pdu-rear', bottomU: 1, mounting: 'rear' }), catalog); // 200 mm
    expect(r.ok).toBe(false);
    expect(r.collisions[0]?.reason).toBe('depth');
    const deep: Rack = { ...rack19, depthMm: 600 };
    expect(checkPlacement({ rack: deep, placements }, pp({ id: 'b', partId: 'pdu-rear', bottomU: 1, mounting: 'rear' }), catalog).ok).toBe(true);
  });

  it('full-depth parts block both faces', () => {
    const placements = [pp({ id: 'srv', partId: 'srv-2u', bottomU: 1, mounting: 'full-depth' })];
    expect(checkPlacement({ rack: rack19, placements }, pp({ id: 'b', partId: 'pdu-rear', bottomU: 2, mounting: 'rear' }), catalog).ok).toBe(false);
    expect(checkPlacement({ rack: rack19, placements }, pp({ id: 'c', partId: 'sw-1u', bottomU: 2, mounting: 'front' }), catalog).ok).toBe(false);
  });

  it('two rear parts collide', () => {
    const placements = [pp({ id: 'a', partId: 'pdu-rear', bottomU: 1, mounting: 'rear' })];
    expect(checkPlacement({ rack: rack19, placements }, pp({ id: 'b', partId: 'pdu-rear', bottomU: 1, mounting: 'rear' }), catalog).ok).toBe(false);
  });

  it('full-depth parts cannot be switched to front-only', () => {
    const r = checkPlacement({ rack: rack19, placements: [] }, pp({ id: 'a', partId: 'srv-2u', mounting: 'front' }), catalog);
    expect(r.problems.some((p) => p.code === 'mounting')).toBe(true);
  });
});

describe('shelves', () => {
  const shelf = pp({ id: 'shelf', partId: 'shelf-1u', bottomU: 3 });

  it('places a desktop item on top of a shelf', () => {
    const child = pp({ id: 'pc', partId: 'mini-pc', parentId: 'shelf', xMm: 0, bottomU: 3 });
    const occ = occupancyOf([shelf, child], child, catalog)!;
    expect(occ.u0).toBe(3); // stands on the tray, inside the shelf's own U
    expect(occ.u1).toBe(5);
    expect(occ.x0).toBe(10); // (450 - 430) / 2 inset
    expect(checkPlacement({ rack: rack19, placements: [shelf] }, child, catalog).ok).toBe(true);
  });

  it('shelf items block rack space above the shelf, but not the shelf itself', () => {
    const child = pp({ id: 'pc', partId: 'mini-pc', parentId: 'shelf', xMm: 0, bottomU: 3 });
    const r = checkPlacement({ rack: rack19, placements: [shelf, child] }, pp({ id: 'sw', partId: 'sw-1u', bottomU: 4 }), catalog);
    expect(r.ok).toBe(false);
    expect(checkPlacement({ rack: rack19, placements: [shelf, child] }, pp({ id: 'sw', partId: 'sw-1u', bottomU: 5 }), catalog).ok).toBe(true);
  });

  it('rejects items wider than the shelf space left', () => {
    const r = checkPlacement({ rack: rack19, placements: [shelf] }, pp({ id: 'pc', partId: 'mini-pc', parentId: 'shelf', xMm: 300 }), catalog);
    expect(r.ok).toBe(false);
  });

  it('checks shelf children when the shelf moves', () => {
    const child = pp({ id: 'pc', partId: 'mini-pc', parentId: 'shelf', xMm: 0, bottomU: 3 });
    const blocker = pp({ id: 'sw', partId: 'sw-1u', bottomU: 8 });
    const r = checkPlacement({ rack: rack19, placements: [shelf, child, blocker] }, { ...shelf, bottomU: 7 }, catalog);
    expect(r.ok).toBe(false);
    expect(r.collisions[0]?.placementId).toBe('sw');
  });
});

describe('snapping and free slots', () => {
  it('snaps to whole U and clamps into the rack', () => {
    const sw = catalog.get('sw-1u')!;
    expect(snapBottomU(sw, 3.4, rack19)).toBe(3);
    expect(snapBottomU(sw, 3.6, rack19)).toBe(4);
    expect(snapBottomU(sw, -2, rack19)).toBe(1);
    expect(snapBottomU(catalog.get('srv-2u')!, 50, rack19)).toBe(11);
    expect(snapBottomU(catalog.get('pp-half')!, 3.4, rack19)).toBe(3.5);
  });

  it('finds the nearest free slot for duplicates', () => {
    const placements = [pp({ id: 'a', partId: 'sw-1u', bottomU: 5 }), pp({ id: 'b', partId: 'sw-1u', bottomU: 6 })];
    const slot = findFreeSlot({ rack: rack19, placements }, catalog, 'sw-1u', 'front', 6);
    expect(slot?.bottomU).toBe(7);
  });

  it('returns null when the rack is full', () => {
    const tiny: Rack = { ...rack19, heightU: 1 };
    const placements = [pp({ id: 'a', partId: 'sw-1u', bottomU: 1 })];
    expect(findFreeSlot({ rack: tiny, placements }, catalog, 'sw-1u', 'front')).toBeNull();
  });
});

describe('rack resize validation', () => {
  it('removes parts above the new top', () => {
    const placements = [pp({ id: 'low', partId: 'sw-1u', bottomU: 2 }), pp({ id: 'high', partId: 'sw-1u', bottomU: 10 })];
    const r = applyRackChange({ rack: rack19, placements }, { ...rack19, heightU: 6 }, catalog);
    expect(r.placements.map((p) => p.id)).toEqual(['low']);
    expect(r.removed.map((p) => p.placementId)).toEqual(['high']);
  });

  it('removes 19" gear and clamps partial-width gear when switching to 10"', () => {
    const placements = [
      pp({ id: 'sw', partId: 'sw-1u', bottomU: 1 }),
      pp({ id: 'mini', partId: 'mini-10', bottomU: 3, xMm: 228 }),
    ];
    const r = applyRackChange({ rack: rack19, placements }, { ...rack19, width: '10in' }, catalog);
    expect(r.removed.map((p) => p.placementId)).toEqual(['sw']);
    expect(r.placements).toEqual([{ ...placements[1], xMm: 0 }]);
  });

  it('removes side-by-side parts that collide after narrowing', () => {
    const placements = [
      pp({ id: 'l', partId: 'mini-10', bottomU: 1, xMm: 0 }),
      pp({ id: 'r', partId: 'mini-10', bottomU: 1, xMm: 228 }),
    ];
    const r = applyRackChange({ rack: rack19, placements }, { ...rack19, width: '10in' }, catalog);
    expect(r.placements.map((p) => p.id)).toEqual(['l']);
    expect(r.removed[0]?.reason).toContain('Collides');
  });

  it('removes shelf children with their shelf', () => {
    const placements = [
      pp({ id: 'shelf', partId: 'shelf-1u', bottomU: 10 }),
      pp({ id: 'pc', partId: 'mini-pc', parentId: 'shelf', bottomU: 10 }),
    ];
    const r = applyRackChange({ rack: rack19, placements }, { ...rack19, heightU: 8 }, catalog);
    expect(r.placements).toEqual([]);
    expect(r.removed.map((p) => p.placementId).sort()).toEqual(['pc', 'shelf']);
  });

  it('reports depth conflicts when a rack depth is introduced', () => {
    const placements = [
      pp({ id: 'f', partId: 'sw-1u', bottomU: 1, mounting: 'front' }),
      pp({ id: 'r', partId: 'pdu-rear', bottomU: 1, mounting: 'rear' }),
    ];
    const r = applyRackChange({ rack: rack19, placements }, { ...rack19, depthMm: 400 }, catalog);
    expect(r.removed.map((p) => p.placementId)).toEqual(['r']);
  });

  it('keeps everything when growing', () => {
    const placements = [pp({ id: 'a', partId: 'srv-2u', bottomU: 1, mounting: 'full-depth' })];
    const r = applyRackChange({ rack: rack19, placements }, { ...rack19, heightU: 24 }, catalog);
    expect(r.removed).toEqual([]);
    expect(r.placements).toEqual(placements);
  });
});

describe('shelf drops', () => {
  const shelf = pp({ id: 'shelf', partId: 'shelf-1u', bottomU: 3 });
  const design = { rack: rack19, placements: [shelf] };

  it('puts desktop gear dropped onto a shelf onto its tray', () => {
    const r = resolveDrop(design, catalog, { partId: 'mini-pc', rawBottomU: 3.4, rawXMm: 40, mounting: 'front', view: 'front' });
    expect(r?.candidate.parentId).toBe('shelf');
    expect(r?.candidate.bottomU).toBe(3);
    expect(r?.candidate.xMm).toBe(0); // snapped to the left edge of the usable area
    expect(r?.check.ok).toBe(true);
  });

  it('places a second item flush beside the first', () => {
    const withOne = { rack: rack19, placements: [shelf, pp({ id: 'pc1', partId: 'mini-pc', parentId: 'shelf', bottomU: 3, xMm: 0 })] };
    const r = resolveDrop(withOne, catalog, { partId: 'mini-pc', rawBottomU: 3, rawXMm: 60, mounting: 'front', view: 'front' });
    expect(r?.candidate.parentId).toBe('shelf');
    expect(r?.candidate.xMm).toBe(180);
    expect(r?.check.ok).toBe(true);
  });

  it('places desktop gear loose when not near a shelf', () => {
    const r = resolveDrop(design, catalog, { partId: 'mini-pc', rawBottomU: 9, rawXMm: 40, mounting: 'front', view: 'front' });
    expect(r?.candidate.parentId).toBeUndefined();
  });

  it('ignores shelves on the other face', () => {
    const rear = { rack: rack19, placements: [{ ...shelf, mounting: 'rear' as const }] };
    const r = resolveDrop(rear, catalog, { partId: 'mini-pc', rawBottomU: 3, rawXMm: 40, mounting: 'front', view: 'front' });
    expect(r?.candidate.parentId).toBeUndefined();
  });

  it('moves an item off its shelf when dragged away', () => {
    const d = { rack: rack19, placements: [shelf, pp({ id: 'pc1', partId: 'mini-pc', parentId: 'shelf', bottomU: 3 })] };
    const r = resolveDrop(d, catalog, { partId: 'mini-pc', placementId: 'pc1', rawBottomU: 9, rawXMm: 0, mounting: 'front', view: 'front' });
    expect(r?.candidate.parentId).toBeUndefined();
    expect(r?.candidate.bottomU).toBe(9);
  });

  it('computes left / centre / right alignment in the rack and on shelves', () => {
    const mini = pp({ id: 'm', partId: 'mini-10', bottomU: 1 });
    expect(alignedX({ rack: rack19, placements: [mini] }, mini, catalog, 'right')).toBe(228);
    expect(alignedX({ rack: rack19, placements: [mini] }, mini, catalog, 'centre')).toBe(114);
    const child = pp({ id: 'pc', partId: 'mini-pc', parentId: 'shelf', bottomU: 3 });
    expect(alignedX({ rack: rack19, placements: [shelf, child] }, child, catalog, 'right')).toBe(250);
    const full = pp({ id: 'f', partId: 'sw-1u' });
    expect(canAlign({ rack: rack19, placements: [full] }, full, catalog)).toBe(false);
  });
});

describe('findShelfSlot', () => {
  it('finds room on a shelf for desktop gear, beside items already there', () => {
    const shelf = pp({ id: 'shelf', partId: 'shelf-1u', bottomU: 3 });
    const d = { rack: rack19, placements: [shelf, pp({ id: 'a', partId: 'mini-pc', parentId: 'shelf', bottomU: 3, xMm: 0 })] };
    const slot = findShelfSlot(d, catalog, 'mini-pc');
    expect(slot).toMatchObject({ parentId: 'shelf', bottomU: 3, xMm: 180 });
  });

  it('returns null when shelves are full or the part is not desktop gear', () => {
    const shelf = pp({ id: 'shelf', partId: 'shelf-1u', bottomU: 3 });
    const full = { rack: rack19, placements: [shelf, pp({ id: 'a', partId: 'mini-pc', parentId: 'shelf', bottomU: 3, xMm: 0 }), pp({ id: 'b', partId: 'mini-pc', parentId: 'shelf', bottomU: 3, xMm: 180 })] };
    expect(findShelfSlot(full, catalog, 'mini-pc')).toBeNull();
    expect(findShelfSlot({ rack: rack19, placements: [shelf] }, catalog, 'sw-1u')).toBeNull();
  });
});
