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

// --- Templates: starting points offered in the New design dialog ------------
// Each one is checked like the examples, and written with a short description
// to examples/templates/<id>.json (not seeded as designs).

interface Template {
  id: string;
  name: string;
  description: string;
  design: Design;
}

function tplMini10(): Template {
  const b = new Builder('tpl-mini-10in', '10″ mini rack', { width: '10in', heightU: 8, depthMm: 300, frame: 'mini-10in' });
  const patch = b.add('generic-patch-12-cat6-10in', 8, { label: 'Patch' });
  const sw = b.add('generic-switch-8p-10in', 7, { label: 'Switch' });
  b.add('generic-brush-1u-10in', 6);
  const pis = b.add('generic-pi-mount-1u-10in', 5, { label: 'Pi cluster' });
  const shelf = b.add('generic-shelf-2u-10in', 3);
  const pc = b.onShelf(shelf, 'lenovo-thinkcentre-m920q', 0, { label: 'mini PC' });
  b.add('generic-vented-1u-10in', 2);
  b.add('generic-pdu-10in-4-au', 1, { label: 'Power' });
  for (let i = 1; i <= 4; i++) b.cable(port(sw, 'rj45_1g', i), port(patch, 'keystone', i), '#3b82f6', undefined, 0.15);
  for (let i = 1; i <= 2; i++) b.cable(port(pis, 'rj45_1g', i), port(sw, 'rj45_1g', 4 + i), '#22c55e', `Pi ${i}`, 0.3);
  b.cable(port(pc, 'rj45_1g', 1), port(sw, 'rj45_1g', 8), '#a855f7', 'mini PC', 0.5);
  return { id: 'tpl-mini-10in', name: '10″ mini rack', description: '8U 10-inch rack: patch panel, 8-port switch, Raspberry Pi mount, a mini PC on a shelf and an AU power strip.', design: b.done() };
}

function tplNbnUnifi(): Template {
  const b = new Builder('tpl-nbn-unifi', 'nbn + UniFi starter', { width: '10in', heightU: 8, depthMm: 212, frame: 'rackmate-t1', wall: true });
  const nbn = b.add('nokia-xs-010x-q-nbn-fttp', 6, { wall: true, xMm: 60, label: 'nbn FTTP' });
  const outlet = b.add('generic-fibre-wall-outlet-sc-apc', 7, { wall: true, xMm: 60 });
  b.add('generic-gpo-double-au', 2, { wall: true, xMm: 60 });
  const patch = b.add('deskpi-rackmate-patch-12-keystone-1u', 8, { label: 'Patch' });
  const top = b.add('deskpi-rackmate-shelf-1u', 7);
  const gw = b.onShelf(top, 'ubiquiti-ucg-ultra', 0, { label: 'Gateway' });
  const swShelf = b.add('deskpi-rackmate-shelf-1u', 6);
  const sw = b.onShelf(swShelf, 'ubiquiti-usw-lite-8-poe', 0, { label: 'Switch' });
  b.add('deskpi-rackmate-vent-1u', 5);
  const pcShelf = b.add('deskpi-rackmate-shelf-1u', 4);
  b.onShelf(pcShelf, 'lenovo-thinkcentre-m920q', 0, { label: 'Home server' });
  b.add('deskpi-rackmate-blank-2u', 2);
  b.add('power-automatix-pa-pdu6x', 1, { label: 'Power' });
  b.cable(port(outlet, 'sc_simplex', 1), port(nbn, 'sc_simplex', 1), '#22c55e', 'Fibre', 0.5);
  b.cable(port(nbn, 'rj45_10g', 1), port(gw, 'rj45_2_5g', 1), '#f97316', 'WAN (UNI-D)', 1);
  b.cable(port(gw, 'rj45_1g', 1), port(sw, 'rj45_1g', 1), '#3b82f6', 'Uplink', 0.15);
  for (let i = 2; i <= 5; i++) b.cable(port(sw, 'rj45_1g', i), port(patch, 'keystone', i - 1), '#3b82f6', `PoE ${i - 1}`, 0.2);
  return {
    id: 'tpl-nbn-unifi',
    name: 'nbn + UniFi starter',
    description: 'DeskPi RackMate T1 with the nbn FTTP box on the wall, a UniFi Cloud Gateway Ultra and Lite 8 PoE switch, and a home server. Swap the nbn box for your connection type.',
    design: b.done(),
  };
}

function tplHomelab12(): Template {
  const b = new Builder('tpl-homelab-12u', 'Homelab 12U', { width: '19in', heightU: 12, depthMm: 600, frame: 'open-4post' });
  const patch = b.add('generic-patch-24-cat6-keystone-1u', 12, { label: 'Patch' });
  const sw = b.add('ubiquiti-usw-pro-24-poe', 11, { label: 'Core switch' });
  b.add('generic-brush-1u-19', 10);
  const gw = b.add('ubiquiti-udm-pro', 9, { label: 'Gateway' });
  b.add('generic-blank-1u-19', 8);
  const nas = b.add('synology-rs422-plus', 7, { label: 'NAS' });
  b.add('generic-vented-blank-1u-19', 6);
  const shelf = b.add('generic-shelf-2u-400-19', 4);
  const pc1 = b.onShelf(shelf, 'lenovo-thinkcentre-m920q', 0, { label: 'node1' });
  const pc2 = b.onShelf(shelf, 'lenovo-thinkcentre-m920q', 185, { label: 'node2' });
  b.add('generic-pdu-1u-6-au', 3, { mounting: 'rear', label: 'PDU' });
  b.add('cyberpower-cp1500pfcrm2u', 1, { label: 'UPS' });
  for (let i = 1; i <= 8; i++) b.cable(port(sw, 'rj45_1g', i), port(patch, 'keystone', i), '#3b82f6', undefined, 0.3);
  b.cable(port(gw, 'rj45_1g', 8), port(sw, 'rj45_1g', 24), '#f97316', 'Uplink', 0.5);
  b.cable(port(nas, 'rj45_1g', 1), port(sw, 'rj45_1g', 20), '#a855f7', 'NAS', 1);
  b.cable(port(pc1, 'rj45_1g', 1), port(sw, 'rj45_1g', 21), '#22c55e', 'node1', 1);
  b.cable(port(pc2, 'rj45_1g', 1), port(sw, 'rj45_1g', 22), '#22c55e', 'node2', 1);
  return { id: 'tpl-homelab-12u', name: 'Homelab 12U (19″)', description: '12U open frame: patch panel, UniFi Pro 24 PoE and Dream Machine Pro, a 4-bay NAS, two mini PCs on a shelf, a rear PDU and a 2U UPS.', design: b.done() };
}

function tplNetworkCabinet(): Template {
  const b = new Builder('tpl-network-cabinet-9u', 'Network cabinet 9U', { width: '19in', heightU: 9, depthMm: 450, frame: 'cabinet', glassDoor: true });
  const patch = b.add('generic-patch-24-cat6-keystone-1u', 9, { label: 'Patch' });
  b.add('generic-cable-manager-1u-19', 8);
  const sw = b.add('ubiquiti-usw-24-poe', 7, { label: 'Switch' });
  const gw = b.add('ubiquiti-udm-se', 6, { label: 'Gateway' });
  b.add('generic-brush-1u-19', 5);
  const shelf = b.add('generic-shelf-2u-400-19', 3);
  const modem = b.onShelf(shelf, 'generic-fibre-ont', 0, { label: 'Modem / NTD' });
  b.add('generic-vented-blank-1u-19', 2);
  b.add('generic-pdu-1u-6-au', 1, { label: 'Power' });
  for (let i = 1; i <= 12; i++) b.cable(port(sw, 'rj45_1g', i), port(patch, 'keystone', i), '#3b82f6', undefined, 0.3);
  b.cable(port(gw, 'rj45_1g', 1), port(sw, 'rj45_1g', 24), '#f97316', 'Uplink', 0.3);
  b.cable(port(modem, 'rj45_1g', 1), port(gw, 'rj45_2_5g', 1), '#ef4444', 'WAN', 0.5);
  return { id: 'tpl-network-cabinet-9u', name: 'Network cabinet 9U', description: '9U wall cabinet with glass door: 24-port patch panel, UniFi 24 PoE switch, Dream Machine SE, the modem or nbn box on a shelf, and a power strip.', design: b.done() };
}

mkdirSync(path.join(root, 'examples', 'templates'), { recursive: true });
for (const t of [tplMini10(), tplNbnUnifi(), tplHomelab12(), tplNetworkCabinet()]) {
  writeFileSync(path.join(root, 'examples', 'templates', `${t.id}.json`), JSON.stringify(t, null, 2) + '\n');
  console.log(`examples/templates/${t.id}.json: ${t.design.placements.length} placements, ${t.design.cables.length} cables`);
}

mkdirSync(path.join(root, 'examples'), { recursive: true });
for (const [file, d] of [
  ['my-rackmate-t1.json', rackmateT1()],
  ['homelab-24u.json', homelab24()],
] as const) {
  writeFileSync(path.join(root, 'examples', file), JSON.stringify(d, null, 2) + '\n');
  console.log(`examples/${file}: ${d.placements.length} placements, ${d.cables.length} cables`);
}
