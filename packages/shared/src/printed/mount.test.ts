import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesign } from '../design.js';
import { buildBom, bomToCsv } from '../exchange.js';
import { checkPlacement, descendantsOf, occupancyOf, resolveDrop } from '../placement.js';
import { CatalogFileSchema, PartSchema, type Design, type Part, type PlacedPart } from '../schemas.js';
import { computeStats } from '../stats.js';
import { printedPartFromForm, type PrintedPartForm } from './detect.js';
import { partsToPrint, partsToPrintCsv, partsToPrintMarkdown } from './list.js';
import { heldDevicePlacements, removeMountKeepDevices } from './place.js';

const load = (f: string) => CatalogFileSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), 'catalog', f), 'utf8'))).parts;
const base: Part[] = [...load('unifi.json'), ...load('mini-rack.json'), ...load('desktop.json')];
const catalog = new Map(base.map((p) => [p.id, p]));

const form = (over: Partial<PrintedPartForm> = {}): PrintedPartForm => ({
  name: 'NVR Instant mount',
  kind: 'rackmount',
  heightU: 2,
  rackWidth: '10in',
  depthMm: null,
  mounting: 'front',
  filament: '#1c1c1c',
  status: 'planned',
  notes: '',
  holds: [{ partId: 'ubiquiti-unvr-instant', qty: 1 }],
  source: { site: 'makerworld', modelId: '2424584', profileId: '2659248', url: 'https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248', title: null, designer: 'Test Designer', designerUrl: 'https://makerworld.com/en/@testdesigner', licence: 'CC BY-NC-SA', profileName: null, description: null, fetchedAt: null },
  thumbnail: null,
  ...over,
});
const addPart = (id: string, f: PrintedPartForm) => {
  const part = PartSchema.parse({ ...printedPartFromForm(f, catalog), id });
  catalog.set(id, part);
  return part;
};
addPart('custom-nvr-mount-aaa', form());
addPart('custom-pi-mount-aaa', form({ name: '2x Pi 4 mount', heightU: 1, holds: [{ partId: 'raspberry-pi-4-case', qty: 2 }] }));
addPart('custom-short-mount-aaa', form({ name: '1U NVR mount (too short)', heightU: 1 }));

let n = 0;
const nid = () => `c${++n}`;
function rack(u = 8, depthMm: number | null = 212): Design {
  return { ...createDesign({ rack: { width: '10in', heightU: u, depthMm, frame: 'rackmate-t1' } }), id: 'd' };
}
function place(d: Design, partId: string, bottomU: number): Design {
  const mount: PlacedPart = { id: `m${bottomU}`, partId, bottomU, xMm: 0, mounting: 'front' };
  const kids = heldDevicePlacements(d, mount, catalog, nid);
  return { ...d, placements: [...d.placements, mount, ...kids] };
}

describe('printed mounts', () => {
  it('places the held device inside, within the mount’s own U', () => {
    const d = place(rack(), 'custom-nvr-mount-aaa', 1);
    expect(d.placements).toHaveLength(2);
    const child = d.placements[1]!;
    expect(child).toMatchObject({ partId: 'ubiquiti-unvr-instant', parentId: 'm1', bottomU: 1 });
    expect(occupancyOf(d.placements, child, catalog)).toMatchObject({ u0: 1, u1: 3 });
    expect(checkPlacement(d, child, catalog).ok).toBe(true);
  });

  it('spreads two devices across the opening', () => {
    const d = place(rack(), 'custom-pi-mount-aaa', 4);
    const kids = d.placements.filter((p) => p.parentId === 'm4');
    expect(kids).toHaveLength(2);
    expect(kids[0]!.xMm).toBeLessThan(kids[1]!.xMm);
    for (const k of kids) expect(checkPlacement(d, k, catalog).ok).toBe(true);
  });

  it('keeps a too-tall device inside the mount’s U and warns instead', () => {
    let d = place(rack(), 'custom-short-mount-aaa', 1);
    // Something in U2 must not collide with the NVR poking out.
    d = { ...d, placements: [...d.placements, { id: 'v', partId: 'deskpi-rackmate-vent-1u', bottomU: 2, xMm: 0, mounting: 'front' }] };
    const stats = computeStats(d, catalog);
    expect(stats.warnings.filter((w) => w.code === 'invalid-placement')).toEqual([]);
    const fit = stats.warnings.find((w) => w.code === 'mount-fit');
    expect(fit?.message).toMatch(/47 mm tall \(1U leaves 41\.5 mm\)/);
  });

  it('warns when the device is deeper than the rack', () => {
    const stats = computeStats(place(rack(), 'custom-nvr-mount-aaa', 1), catalog);
    const deep = stats.warnings.filter((w) => w.code === 'too-deep').map((w) => w.message);
    expect(deep).toContain('UniFi NVR Instant is 220 mm deep; the rack is 212 mm');
    expect(stats.warnings.some((w) => w.code === 'mount-fit')).toBe(false);
  });

  it('moves the device with the mount', () => {
    const d = place(rack(), 'custom-nvr-mount-aaa', 1);
    expect(descendantsOf(d.placements, 'm1')).toEqual([d.placements[1]!.id]);
    const drop = resolveDrop(d, catalog, { partId: 'custom-nvr-mount-aaa', placementId: 'm1', rawBottomU: 5, rawXMm: 0, mounting: 'front' })!;
    expect(drop.check.ok).toBe(true);
    const moved = d.placements.map((p) => (p.id === 'm1' ? { ...p, ...drop.candidate, id: 'm1' } : p));
    expect(occupancyOf(moved, moved[1]!, catalog)).toMatchObject({ u0: 5, u1: 7 });
  });

  it('removing the mount can keep the device on the nearest shelf', () => {
    let d = place(rack(), 'custom-nvr-mount-aaa', 1);
    d = { ...d, placements: [...d.placements, { id: 's', partId: 'deskpi-rackmate-shelf-1u', bottomU: 6, xMm: 0, mounting: 'front' }] };
    const r = removeMountKeepDevices(d, 'm1', catalog);
    expect(r.removed).toEqual([]);
    expect(r.moved).toEqual([{ id: d.placements[1]!.id, name: 'UniFi NVR Instant', where: 'shelf' }]);
    expect(r.placements.find((p) => p.id === d.placements[1]!.id)).toMatchObject({ parentId: 's' });
    expect(r.placements.some((p) => p.id === 'm1')).toBe(false);
  });

  it('removing the mount with no shelf puts the device in free rack space', () => {
    const d = place(rack(), 'custom-nvr-mount-aaa', 1);
    const r = removeMountKeepDevices(d, 'm1', catalog);
    expect(r.moved[0]?.where).toBe('rack');
    const kept = r.placements[0]!;
    expect(kept.parentId).toBeUndefined();
  });

  it('counts printed parts and lists them with their source', () => {
    let d = place(rack(), 'custom-nvr-mount-aaa', 1);
    d = place(d, 'custom-pi-mount-aaa', 4);
    d = { ...d, placements: d.placements.map((p) => (p.id === 'm4' ? { ...p, print: { status: 'installed' as const, filament: '#ff6600' } } : p)) };
    expect(computeStats(d, catalog).printed).toEqual({ count: 2, toPrint: 1 });
    const rows = partsToPrint(d, catalog);
    expect(rows.map((r) => [r.name, r.status, r.filament])).toEqual([
      ['NVR Instant mount', 'planned', '#1c1c1c'],
      ['2x Pi 4 mount', 'installed', '#ff6600'],
    ]);
    expect(rows[0]!.holds).toEqual(['UniFi NVR Instant']);
    expect(partsToPrintCsv(rows)).toContain('https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248,,Test Designer');
    const md = partsToPrintMarkdown('My rack', rows);
    expect(md).toContain('2 3D-printed parts, 1 still to print.');
    expect(md).toContain('CC BY-NC-SA (**non-commercial**)');
    const bom = buildBom(d, catalog);
    expect(bom.find((r) => r.partId === 'custom-nvr-mount-aaa')?.printed).toMatchObject({ designer: 'Test Designer', licence: 'CC BY-NC-SA' });
    expect(bomToCsv(bom).split('\r\n')[0]).toMatch(/Model URL \(3D print\),Designer,Licence$/);
  });
});
