import path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DesignSchema, migrateDesignData, type Cable, type Design } from '@rackplanner/shared';
import { loadCatalogDir } from '../../../../server/src/catalog';
import { cableChannels, polylineLength, routeCables, roundedPath } from './cableRoutes';
import { cableDistanceMm, cableEndPoint } from './cableGeometry';
import { LABEL_COL, rackLayout } from './geometry';

const root = path.resolve(__dirname, '../../../../..');
const { parts } = loadCatalogDir(path.join(root, 'catalog'));
const catalog = new Map(parts.map((p) => [p.id, p]));
const load = (f: string): Design => {
  const raw = JSON.parse(readFileSync(path.join(root, 'examples', f), 'utf8'));
  return DesignSchema.parse(migrateDesignData(raw.design ?? raw));
};

describe('cable routing', () => {
  const design = load('templates/tpl-network-cabinet-9u.json');

  it('finds the cable manager (front only) and the brush panel (both views)', () => {
    const front = cableChannels(design, catalog, 'front');
    expect(front.map((c) => c.kind).sort()).toEqual(['brush', 'manager']);
    expect(cableChannels(design, catalog, 'rear').map((c) => c.kind)).toEqual(['brush']);
  });

  it('routes front cables through a manager with only horizontal and vertical runs', () => {
    const routes = routeCables(design, catalog, design.cables, 'front');
    expect(routes.size).toBeGreaterThan(0);
    for (const r of routes.values()) {
      for (let i = 1; i < r.points.length; i++) {
        const [p, q] = [r.points[i - 1]!, r.points[i]!];
        // The first and last legs end at the port; everything else is axis-aligned.
        expect(Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01).toBe(true);
      }
    }
  });

  it('starts and ends each route on its ports', () => {
    const routes = routeCables(design, catalog, design.cables, 'front');
    for (const c of design.cables) {
      const r = routes.get(c.id);
      if (!r || r.through) continue;
      const a = cableEndPoint(design, catalog, c.a, 'front')!;
      const b = cableEndPoint(design, catalog, c.b, 'front')!;
      expect(r.points[0]).toMatchObject({ x: a.x, y: a.y });
      expect(r.points[r.points.length - 1]).toMatchObject({ x: b.x, y: b.y });
    }
  });

  it('spreads cables sharing a manager into a bundle', () => {
    const routes = [...routeCables(design, catalog, design.cables, 'front').values()];
    const mgr = cableChannels(design, catalog, 'front').find((c) => c.kind === 'manager')!;
    const ys = new Set<number>();
    for (const r of routes) {
      for (const p of r.points) if (p.y > mgr.y && p.y < mgr.y + mgr.h) ys.add(+p.y.toFixed(2));
    }
    expect(ys.size).toBeGreaterThan(1);
    for (const y of ys) expect(Math.abs(y - (mgr.y + mgr.h / 2))).toBeLessThanOrEqual(mgr.h * 0.3 + 0.01);
  });

  it('leaves cables alone when the rack has no manager or brush panel', () => {
    const plain = load('templates/tpl-nbn-unifi.json');
    expect(routeCables(plain, catalog, plain.cables, 'front').size).toBe(0);
  });

  it('runs a port far from any manager down the side of the rack', () => {
    const d = load('templates/tpl-homelab-12u.json');
    const layout = rackLayout(d.rack);
    const lanes = [LABEL_COL + layout.frame.post / 2, layout.width - LABEL_COL - layout.frame.post / 2];
    const routes = [...routeCables(d, catalog, d.cables, 'front').values()];
    // A vertical leg within a bundle's width of a lane.
    const onLane = routes.filter((r) =>
      r.points.some((p, i) => i > 0 && Math.abs(p.x - r.points[i - 1]!.x) < 0.01 && Math.abs(p.y - r.points[i - 1]!.y) > 1 && lanes.some((x) => Math.abs(p.x - x) <= 6)),
    );
    expect(onLane.length).toBeGreaterThan(0);
  });

  it('routes a front-to-rear cable to the brush panel it passes through', () => {
    const sw = design.placements.find((p) => catalog.get(p.partId)?.category === 'switch')!;
    const end = cableEndPoint(design, catalog, { placementId: sw.id }, 'front')!;
    expect(end.visible).toBe(true);
    // A device-level end on a rear-mounted copy of the switch is only visible from the rear.
    const rearCopy = { ...sw, id: 'rear-sw', mounting: 'rear' as const, bottomU: 1 };
    const withRear = { ...design, placements: [...design.placements, rearCopy] };
    const cable: Cable = { id: 'x', a: { placementId: sw.id }, b: { placementId: 'rear-sw' }, type: 'copper', color: '#ff0000' };
    const b = cableEndPoint(withRear, catalog, cable.b, 'front');
    expect(b?.visible).toBe(false);
    const r = routeCables(withRear, catalog, [cable], 'front').get('x')!;
    const brush = cableChannels(withRear, catalog, 'front').find((c) => c.kind === 'brush')!;
    expect(r.through).not.toBeNull();
    expect(r.through!.y).toBeGreaterThan(brush.y);
    expect(r.through!.y).toBeLessThan(brush.y + brush.h);
  });

  it('measures the routed path for the length estimate', () => {
    const c = design.cables[0]!;
    const r = routeCables(design, catalog, [c], 'front').get(c.id);
    const dist = cableDistanceMm(design, catalog, c.a, c.b)!;
    if (r) expect(dist).toBeCloseTo(polylineLength(r.points), 5);
  });

  it('draws rounded corners', () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 30, y: 20 }]);
    expect(d).toBe('M0 0 L0 16 Q0 20 4 20 L30 20');
  });
});
