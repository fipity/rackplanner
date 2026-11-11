/**
 * Build the example designs in examples/*.json from the catalog, checking
 * every placement and cable with the same engine the editor uses.
 *   npx tsx scripts/build-examples.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DesignSchema,
  cableProblems,
  checkPlacement,
  createDesign,
  type Cable,
  type CableEnd,
  type Design,
  type PlacedPart,
  type PortType,
  type Rack,
} from '@rackplanner/shared';
import { loadCatalogDir } from '../apps/server/src/catalog.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parts, errors } = loadCatalogDir(path.join(root, 'catalog'));
if (errors.length) throw new Error(errors.join('\n'));
const catalog = new Map(parts.map((p) => [p.id, p]));
const STAMP = '2026-11-10T00:00:00.000Z';

class Builder {
  design: Design;
  private n = 0;
  constructor(id: string, name: string, rack: Partial<Rack>) {
    this.design = { ...createDesign({ name, rack }, new Date(STAMP)), id };
  }
  add(partId: string, bottomU: number, opts: Partial<PlacedPart> = {}): string {
    if (!catalog.has(partId)) throw new Error(`unknown part ${partId}`);
    const id = `p${++this.n}`;
    const part = catalog.get(partId)!;
    const p: PlacedPart = { id, partId, bottomU, xMm: 0, mounting: part.mounting === 'full-depth' ? 'full-depth' : 'front', ...opts };
    const check = checkPlacement(this.design, p, catalog);
    if (!check.ok) throw new Error(`${this.design.name}: ${partId} at U${bottomU}: ${check.problems.map((x) => x.message).join('; ')}`);
    this.design.placements.push(p);
    return id;
  }
  onShelf(shelfId: string, partId: string, xMm: number, opts: Partial<PlacedPart> = {}): string {
    const shelf = this.design.placements.find((p) => p.id === shelfId)!;
    return this.add(partId, shelf.bottomU, { parentId: shelfId, xMm, ...opts });
  }
  cable(a: CableEnd, b: CableEnd, color: string, label?: string, lengthM?: number) {
    const c: Cable = { id: `c${this.design.cables.length + 1}`, a, b, type: 'copper', color, ...(label ? { label } : {}), ...(lengthM ? { lengthM } : {}) };
    this.design.cables.push(c);
  }
  done(): Design {
    const probs = cableProblems(this.design, catalog);
    if (probs.length) throw new Error(`${this.design.name}: ${probs.map((p) => p.message).join('; ')}`);
    return DesignSchema.parse(this.design);
  }
}

const port = (placementId: string, type: PortType, index: number): CableEnd => ({ placementId, port: { type, index } });

// --- My RackMate T1: the priority 10" build -------------------------------
function rackmateT1(): Design {
  const b = new Builder('example-rackmate-t1', 'My RackMate T1', { width: '10in', heightU: 8, depthMm: 212, frame: 'rackmate-t1' });
  const BLUE = '#3b82f6';
  const YELLOW = '#facc15';
  const patch = b.add('deskpi-rackmate-patch-12-keystone-1u', 8, {
    label: 'Patch',
    portColors: { 'keystone:1': BLUE, 'keystone:2': BLUE, 'keystone:3': BLUE, 'keystone:4': BLUE, 'keystone:5': YELLOW, 'keystone:6': YELLOW },
  });
  const shelfTop = b.add('deskpi-rackmate-shelf-1u', 7);
  const sw = b.onShelf(shelfTop, 'ubiquiti-usw-lite-8-poe', 0);
  const pi = b.onShelf(shelfTop, 'raspberry-pi-4-case', 212 - 70);
  const shelfGw = b.add('deskpi-rackmate-shelf-1u', 6);
  const gw = b.onShelf(shelfGw, 'ubiquiti-ucg-ultra', 0);
  b.add('power-automatix-pa-pdu6x', 5, { label: 'Power' });
  b.add('deskpi-rackmate-vent-1u', 4);
  // U3 left open so the NVR can breathe.
  const shelfNvr = b.add('deskpi-rackmate-shelf-1u', 1);
  const nvr = b.onShelf(shelfNvr, 'ubiquiti-unvr-instant', 0, { notes: 'Too wide and deep for the 212 × 200 mm shelf: check the fit, or wall-mount it with the included bracket.' });
  for (let i = 1; i <= 4; i++) b.cable(port(sw, 'rj45_1g', i), port(patch, 'keystone', i), BLUE, `PoE ${i}`, 0.2);
  b.cable(port(pi, 'rj45_1g', 1), port(sw, 'rj45_1g', 5), '#22c55e', 'Pi 4', 0.3);
  b.cable(port(nvr, 'rj45_1g', 1), port(sw, 'rj45_1g', 6), '#a855f7', 'NVR uplink', 0.5);
  b.cable(port(gw, 'rj45_1g', 1), port(sw, 'rj45_1g', 8), '#f97316', 'Uplink', 0.3);
  return b.done();
}

// --- A populated 24U 19" homelab -------------------------------------------
function homelab24(): Design {
  const b = new Builder('example-homelab-24u', 'Homelab 24U (example)', { width: '19in', heightU: 24, depthMm: 1000, frame: 'cabinet' });
  const gw = b.add('ubiquiti-udm-pro-max', 24);
  b.add('generic-cable-manager-1u-19', 23);
  const pp1 = b.add('ubiquiti-uacc-rack-panel-patch-blank-24', 22);
  const sw24 = b.add('ubiquiti-usw-pro-max-24-poe', 21);
  b.add('ubiquiti-usw-aggregation', 20);
  const pp2 = b.add('generic-patch-24-cat6-keystone-1u', 19);
  const sw48 = b.add('ubiquiti-usw-pro-max-48-poe', 18);
  b.add('generic-cable-manager-1u-finger', 17);
  b.add('generic-brush-1u-19', 16);
  b.add('ubiquiti-unvr', 15);
  b.add('ubiquiti-unas-pro', 13);
  b.add('generic-vented-blank-1u-19', 12);
  b.add('synology-rs822-plus', 11);
  b.add('synology-rs422-plus', 10);
  b.add('generic-blank-1u-19', 9);
  b.add('dell-poweredge-r740', 7);
  b.add('dell-poweredge-r630', 6);
  b.add('generic-blank-1u-19', 5);
  b.add('generic-vented-blank-1u-19', 4);
  b.add('generic-pdu-1u-6-au', 3, { mounting: 'rear' });
  b.add('apc-smt1500rmi2u', 1);
  for (let i = 1; i <= 6; i++) b.cable(port(sw24, 'rj45_2_5g', i), port(pp1, 'keystone', i), '#3b82f6', undefined, 0.3);
  for (let i = 1; i <= 6; i++) b.cable(port(sw48, 'rj45_1g', i), port(pp2, 'keystone', i), '#22c55e', undefined, 0.3);
  void gw;
  return b.done();
}

mkdirSync(path.join(root, 'examples'), { recursive: true });
for (const [file, d] of [
  ['my-rackmate-t1.json', rackmateT1()],
  ['homelab-24u.json', homelab24()],
] as const) {
  writeFileSync(path.join(root, 'examples', file), JSON.stringify(d, null, 2) + '\n');
  console.log(`examples/${file}: ${d.placements.length} placements, ${d.cables.length} cables`);
}
