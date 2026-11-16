import { describe, expect, it } from 'vitest';
import { buildBom, buildDesignExport } from './exchange.js';
import { createDesign } from './design.js';
import { checkPlacement, findFreeSlot, findShelfSlot, findWallSlot, occupancyOf, partWidthMm, resolveDrop, type Catalog } from './placement.js';
import { PartSchema, type Part, type PartInput, type PlacedPart, type Rack } from './schemas.js';
import { SIDE_SUFFIX, canTurn, turnedPart, uprightId, uprightPart, withTurnedParts } from './turn.js';

function part(o: Partial<PartInput> & Pick<PartInput, 'id'>): Part {
  return PartSchema.parse({
    brand: 'Test', model: o.id, name: o.id, category: 'test', heightU: 1, width: '19in', depthMm: 300, mounting: 'front',
    rackWidths: ['19in'], power: { typicalW: null, maxW: null }, weightKg: null, render: { style: 'switch' }, sourceUrl: null, verified: false,
    ...o,
  });
}

// An upright box like the nbn HFC NTD: 44 wide × 132 tall × 132 deep.
const ntd = part({ id: 'ntd', formFactor: 'desktop', heightU: 3, heightMm: 132, width: { mm: 44 }, depthMm: 132, render: { style: 'desktop' }, ports: { rj45_1g: 2 } });
const shelf = part({ id: 'shelf-1u', depthMm: 250, shelf: { usableWidthMm: 430, usableDepthMm: 240 }, render: { style: 'shelf' } });
const sw = part({ id: 'sw-1u' });
const custom = part({ id: 'custom-box', source: 'custom', formFactor: 'desktop', heightU: 1, heightMm: 30, width: { mm: 100 }, depthMm: 100, render: { style: 'desktop' } });
const catalog: Catalog = new Map(withTurnedParts([ntd, shelf, sw, custom]).map((p) => [p.id, p]));
const rack: Rack = { width: '19in', heightU: 12, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false };
const pp = (p: Partial<PlacedPart> & Pick<PlacedPart, 'id' | 'partId'>): PlacedPart => ({ bottomU: 1, xMm: 0, mounting: 'front', ...p });

describe('turning shelf gear on its side', () => {
  it('swaps width and height and rounds the height up to whole U', () => {
    const t = turnedPart(ntd)!;
    expect(t.id).toBe(`ntd${SIDE_SUFFIX}`);
    expect(partWidthMm(t)).toBe(132);
    expect(t.heightMm).toBe(44);
    expect(t.heightU).toBe(1);
    expect(t.depthMm).toBe(132);
    expect(t.ports).toEqual(ntd.ports);
    expect(uprightPart(t)).toBe(ntd);
    expect(uprightPart(ntd)).toBeUndefined();
    expect(turnedPart(ntd)).toBe(t); // memoised
    expect(uprightId(t.id)).toBe('ntd');
  });

  it('only turns desktop gear with a known size and no top-face layout, once', () => {
    expect(canTurn(sw)).toBe(false);
    expect(canTurn(part({ id: 'no-h', formFactor: 'desktop', width: { mm: 50 }, render: { style: 'desktop' } }))).toBe(false);
    const withTop = part({
      id: 'pi-case', formFactor: 'desktop', heightMm: 25, width: { mm: 70 }, render: { style: 'desktop' },
      layout: { layoutVerified: false, top: { regions: [{ type: 'usb_c', count: 1 }] } },
    });
    expect(canTurn(withTop)).toBe(false);
    expect(turnedPart(turnedPart(ntd)!)).toBeNull();
    expect(withTurnedParts([ntd, sw, shelf]).map((p) => p.id)).toEqual(['ntd', 'sw-1u', 'shelf-1u', `ntd${SIDE_SUFFIX}`]);
  });

  it('frees the U above a shelf when laid down', () => {
    const s = pp({ id: 's', partId: 'shelf-1u', bottomU: 3 });
    const above = pp({ id: 'sw', partId: 'sw-1u', bottomU: 4 });
    const upright = pp({ id: 'n', partId: 'ntd', parentId: 's', bottomU: 3 });
    expect(occupancyOf([s, upright], upright, catalog)!.u1).toBe(6);
    expect(checkPlacement({ rack, placements: [s, upright] }, above, catalog).ok).toBe(false);
    const flat = { ...upright, partId: `ntd${SIDE_SUFFIX}` };
    expect(occupancyOf([s, flat], flat, catalog)!.u1).toBe(4);
    expect(checkPlacement({ rack, placements: [s, flat] }, above, catalog).ok).toBe(true);
  });

  it('lists upright and turned copies as one part, and exports the upright custom part', () => {
    const design = {
      ...createDesign({ name: 'Lab' }),
      placements: [
        pp({ id: 's', partId: 'shelf-1u', bottomU: 3 }),
        pp({ id: 'a', partId: 'ntd', parentId: 's', bottomU: 3 }),
        pp({ id: 'b', partId: `ntd${SIDE_SUFFIX}`, parentId: 's', bottomU: 3, xMm: 50 }),
        pp({ id: 'c', partId: `custom-box${SIDE_SUFFIX}`, parentId: 's', bottomU: 3, xMm: 200 }),
      ],
    };
    const row = buildBom(design, catalog).find((r) => r.partId === 'ntd')!;
    expect(row.qty).toBe(2);
    expect(row.name).toBe('ntd');
    expect(buildDesignExport(design, catalog).customParts.map((p) => p.id)).toEqual(['custom-box']);
  });
});

describe('turning to fit elsewhere', () => {
  it('turns on the wall when it is too tall to stand up there', () => {
    // A 2U-tall wall: the 3U upright box can't fit anywhere, flat it can.
    const wallRack: Rack = { ...rack, heightU: 2, wall: true };
    const r = resolveDrop({ rack: wallRack, placements: [] }, catalog, { partId: 'ntd', rawBottomU: 2, rawXMm: 20, mounting: 'front', wall: true })!;
    expect(r.check.ok).toBe(true);
    expect(r.candidate).toMatchObject({ partId: `ntd${SIDE_SUFFIX}`, wall: true, bottomU: 2 });
    expect(findWallSlot({ rack: wallRack, placements: [] }, catalog, 'ntd')).toMatchObject({ partId: `ntd${SIDE_SUFFIX}` });
    // With room to stand, it stays upright.
    expect(resolveDrop({ rack: { ...rack, wall: true }, placements: [] }, catalog, { partId: 'ntd', rawBottomU: 4, rawXMm: 20, mounting: 'front', wall: true })!.candidate.partId).toBe('ntd');
  });

  it('turns loose in the rack when only that fits, and finds free slots the same way', () => {
    const small: Rack = { ...rack, heightU: 2 };
    expect(findFreeSlot({ rack: small, placements: [] }, catalog, 'ntd', 'front')).toMatchObject({ partId: `ntd${SIDE_SUFFIX}` });
  });
});

describe('dropping onto a shelf', () => {
  const s = pp({ id: 's', partId: 'shelf-1u', bottomU: 3 });
  const above = pp({ id: 'sw', partId: 'sw-1u', bottomU: 4 });
  const drop = (placements: PlacedPart[], partId: string, placementId?: string) =>
    resolveDrop({ rack, placements }, catalog, { partId, rawBottomU: 3, rawXMm: 20, mounting: 'front', view: 'front', ...(placementId ? { placementId } : {}) });

  it('keeps a device upright when it fits', () => {
    const short = part({ id: 'short', formFactor: 'desktop', heightU: 3, heightMm: 120, width: { mm: 44 }, depthMm: 132, render: { style: 'desktop' } });
    const cat: Catalog = new Map([...catalog, ...withTurnedParts([short]).map((p) => [p.id, p] as const)]);
    const r = resolveDrop({ rack, placements: [s] }, cat, { partId: 'short', rawBottomU: 3, rawXMm: 20, mounting: 'front', view: 'front' })!;
    expect(r.check.ok).toBe(true);
    expect(r.candidate).toMatchObject({ partId: 'short', parentId: 's' });
  });

  it('lays a device on its side when it is taller than the room its U span leaves above the tray', () => {
    // 132 mm standing, but 3U on a shelf leaves about 129 mm (the nbn HFC NTD).
    const r = drop([s], 'ntd')!;
    expect(r.check.ok).toBe(true);
    expect(r.candidate).toMatchObject({ partId: `ntd${SIDE_SUFFIX}`, parentId: 's' });
  });

  it('click-to-add and moving onto a shelf turn the same way', () => {
    expect(findShelfSlot({ rack, placements: [s] }, catalog, 'ntd')).toMatchObject({ partId: `ntd${SIDE_SUFFIX}`, parentId: 's' });
  });

  it('lays a device on its side when only that fits under the gear above', () => {
    const r = drop([s, above], 'ntd')!;
    expect(r.check.ok).toBe(true);
    expect(r.candidate).toMatchObject({ partId: `ntd${SIDE_SUFFIX}`, parentId: 's', bottomU: 3 });
  });

  it('stands a turned device back up when moved to a shelf where only upright fits', () => {
    // 400 mm of the 430 mm tray is taken: 132 mm flat won't fit, 44 mm upright will.
    const wide = part({ id: 'wide', formFactor: 'desktop', heightU: 1, heightMm: 40, width: { mm: 386 }, depthMm: 100, render: { style: 'desktop' } });
    const cat: Catalog = new Map([...catalog, ...withTurnedParts([wide]).map((p) => [p.id, p] as const)]);
    const flat = pp({ id: 'n', partId: `ntd${SIDE_SUFFIX}`, bottomU: 8 });
    const placements = [s, pp({ id: 'w', partId: 'wide', parentId: 's', bottomU: 3 }), flat];
    const r = resolveDrop({ rack, placements }, cat, { partId: flat.partId, placementId: 'n', rawBottomU: 3, rawXMm: 390, mounting: 'front', view: 'front' })!;
    expect(r.check.ok).toBe(true);
    expect(r.candidate).toMatchObject({ id: 'n', partId: 'ntd', parentId: 's' });
  });
});
