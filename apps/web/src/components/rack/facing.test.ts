/**
 * What each view shows of a reversed part, and where its ports land.
 * Port positions are checked in absolute drawing coordinates (cableEndPoint),
 * the same ones the faceplate, tooltips and cables use.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesign, occupancyOf, reversePlacements, type Design, type PlacedPart } from '@rackplanner/shared';
import { loadCatalogDir } from '../../../../server/src/catalog';
import { faceFor, portPositions } from '../faceplates/Faceplate';
import { cableEndPoint, placementBox } from './cableGeometry';
import { rackLayout } from './geometry';

const root = path.resolve(__dirname, '../../../../..');
const { parts } = loadCatalogDir(path.join(root, 'catalog'));
const catalog = new Map(parts.map((p) => [p.id, p]));

const SW = 'ubiquiti-usw-24-poe';
const SMALL = 'generic-switch-8p-10in';
const pp = (id: string, partId: string, bottomU: number, extra: Partial<PlacedPart> = {}): PlacedPart => ({ id, partId, bottomU, xMm: 0, mounting: 'front', ...extra });
const make = (placements: PlacedPart[]): Design => ({ ...createDesign({ rack: { heightU: 12, depthMm: 600 } }), placements });
const reversed = (d: Design, ids: string[]): Design => ({ ...d, placements: reversePlacements(d, ids, catalog).placements });
const port = (d: Design, id: string, index: number, view: 'front' | 'rear') => cableEndPoint(d, catalog, { placementId: id, port: { type: 'rj45_1g', index } }, view);

describe('a reversed switch', () => {
  const d = reversed(make([pp('a', SW, 4)]), ['a']);
  const p = d.placements[0]!;
  const part = catalog.get(SW)!;
  const occ = occupancyOf(d.placements, p, catalog)!;

  it('shows its rear panel in the front view and its faceplate in the rear view', () => {
    expect(faceFor(occ, part, 'front')).toBe('rear');
    expect(faceFor(occ, part, 'rear')).toBe('front');
    // Unreversed it's the other way round.
    const plain = make([pp('a', SW, 4)]);
    const o2 = occupancyOf(plain.placements, plain.placements[0]!, catalog)!;
    expect([faceFor(o2, part, 'front'), faceFor(o2, part, 'rear')]).toEqual(['front', 'rear']);
  });

  it('has its ports in the rear view (port 1 on the left, as you face it) and none in the front view', () => {
    const p1 = port(d, 'a', 1, 'rear')!;
    const p2 = port(d, 'a', 2, 'rear')!;
    const p24 = port(d, 'a', 24, 'rear')!;
    expect(p1.onPort && p2.onPort && p24.onPort).toBe(true);
    // Face-on, the faceplate reads normally: port numbers rise left to right (pairs stack, so compare 1 with 24).
    expect(p1.x).toBeLessThan(p24.x);
    expect(port(d, 'a', 1, 'front')!.onPort).toBe(false);
  });

  it('has port 1 on the right in front-of-rack terms, like a real switch turned round', () => {
    // Rear-view x mirrored about the opening = where it is seen from the front (through the rack).
    const layout = rackLayout(d.rack);
    const fromFront = (x: number) => 2 * layout.innerX + layout.opening - x;
    const r1 = fromFront(port(d, 'a', 1, 'rear')!.x);
    const r24 = fromFront(port(d, 'a', 24, 'rear')!.x);
    expect(r1).toBeGreaterThan(r24);
    // ...exactly the mirror of the same switch facing front.
    const plain = make([pp('a', SW, 4)]);
    expect(r1).toBeCloseTo(fromFront(port(plain, 'a', 1, 'front')!.x), 5);
  });

  it('keeps port numbers on hover tooltips', () => {
    const info = placementBox(d, catalog, p, 'rear')!;
    const slots = portPositions(part, info.box.w, info.box.h, info.box.ears, info.face).filter((s) => s.type === 'rj45_1g');
    expect(slots.map((s) => s.number).sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(slots.find((s) => s.index === 1)!.title).toMatch(/^Port 1\b/);
  });
});

describe('partial-width parts', () => {
  it('swap left and right between the views, reversed or not', () => {
    for (const rev of [false, true]) {
      let d = make([pp('a', SMALL, 2, { xMm: 0 })]);
      if (rev) d = reversed(d, ['a']);
      const front = placementBox(d, catalog, d.placements[0]!, 'front')!.box;
      const rear = placementBox(d, catalog, d.placements[0]!, 'rear')!.box;
      const layout = rackLayout(d.rack);
      expect(front.x).toBeCloseTo(layout.innerX, 5); // at the left seen from the front
      expect(rear.x + rear.w).toBeCloseTo(layout.innerX + layout.opening, 5); // at the right seen from the rear
    }
  });

  it('read port 1 on the left of a reversed one seen from the rear', () => {
    const d = reversed(make([pp('a', SMALL, 2, { xMm: 0 })]), ['a']);
    expect(port(d, 'a', 1, 'rear')!.x).toBeLessThan(port(d, 'a', 8, 'rear')!.x);
  });
});
