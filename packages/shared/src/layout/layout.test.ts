import { describe, expect, it } from 'vitest';
import { PartSchema, type Part, type PartInput } from '../schemas.js';
import { RACK_OPENING_MM } from '../units.js';
import { LAYERED_KINDS, layoutPortCounts, overlaps, regionBoxes, resolveFace, resolveLayout, type FaceElement, type PortElement } from './engine.js';
import { autoFaceLayout } from './auto.js';
import { resolvePreset } from './presets.js';
import { FaceLayoutSchema } from '../schemas.js';

const base: PartInput = {
  id: 'test-switch',
  brand: 'Generic',
  model: 'SW-24',
  name: 'Test switch',
  category: 'switch',
  heightU: 1,
  width: '19in',
  depthMm: 200,
  mounting: 'front',
  rackWidths: ['19in'],
  power: { typicalW: 20, maxW: 30 },
  weightKg: 2,
  ports: { rj45_1g: 24, sfp_plus: 2 },
  render: { style: 'switch' },
  sourceUrl: null,
  verified: false,
};
const mk = (over: Partial<PartInput> = {}): Part => PartSchema.parse({ ...base, ...over });

const U1 = 44.45;
const ports = (els: FaceElement[]) => els.filter((e): e is PortElement => e.kind === 'port');

function assertClean(els: FaceElement[], W: number, H: number) {
  for (const e of els) {
    expect(e.x).toBeGreaterThanOrEqual(-0.01);
    expect(e.y).toBeGreaterThanOrEqual(-0.01);
    expect(e.x + e.w).toBeLessThanOrEqual(W + 0.01);
    expect(e.y + e.h).toBeLessThanOrEqual(H + 0.01);
  }
  const solid = els.filter((e) => !LAYERED_KINDS.has(e.kind));
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (overlaps(solid[i]!, solid[j]!)) {
        throw new Error(`overlap: ${solid[i]!.kind} ${JSON.stringify(solid[i])} vs ${solid[j]!.kind} ${JSON.stringify(solid[j])}`);
      }
    }
  }
}

describe('regionBoxes (fractional positioning)', () => {
  it('places regions at fractional x and width', () => {
    const boxes = regionBoxes(
      [
        { type: 'display', x: 0.04, w: 0.12, variant: 'lcd' },
        { type: 'vent', x: 0.5, w: 0.25 },
      ],
      400,
      40,
    );
    expect(boxes[0]!.x).toBeCloseTo(16);
    expect(boxes[0]!.w).toBeCloseTo(48);
    expect(boxes[1]!.x).toBeCloseTo(200);
    expect(boxes[1]!.w).toBeCloseTo(100);
  });

  it('flows regions without x after the previous one and shares space between fills', () => {
    const boxes = regionBoxes(
      [
        { type: 'button', kind: 'power', x: 0 },
        { type: 'vent' },
        { type: 'vent' },
        { type: 'fan', count: 1, x: 0.8 },
      ],
      200,
      40,
    );
    expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x + boxes[0]!.w);
    expect(boxes[1]!.w).toBeCloseTo(boxes[2]!.w);
    // Fills stop before the next explicitly placed region.
    expect(boxes[2]!.x + boxes[2]!.w).toBeLessThanOrEqual(160 + 0.01);
  });

  it('clips a natural-width region to the next anchor instead of overlapping it', () => {
    const boxes = regionBoxes(
      [
        { type: 'rj45', count: 48, x: 0.05 },
        { type: 'sfp_plus', count: 4, x: 0.6 },
      ] as never,
      222,
      U1,
    );
    expect(boxes[0]!.x + boxes[0]!.w).toBeLessThanOrEqual(boxes[1]!.x);
  });
});

describe('port grouping and numbering', () => {
  const face = FaceLayoutSchema.parse({
    regions: [
      { type: 'rj45', count: 24, rows: 2, grouping: 12, poe: true, x: 0.2, w: 0.55 },
      { type: 'sfp_plus', count: 2, x: 0.8, w: 0.08, uplink: true },
    ],
  });
  const els = ports(resolveLayout(face, 430, U1));

  it('numbers zigzag: odd ports on top, even below', () => {
    const p1 = els.find((p) => p.number === 1)!;
    const p2 = els.find((p) => p.number === 2)!;
    const p3 = els.find((p) => p.number === 3)!;
    expect(p1.y).toBeLessThan(p2.y);
    expect(p1.x).toBeCloseTo(p2.x);
    expect(p3.x).toBeGreaterThan(p1.x);
    expect(p1.latch).toBe('top');
    expect(p2.latch).toBe('bottom');
  });

  it('groups ports in blocks with a wider gap', () => {
    const top = els.filter((p) => p.connector === 'rj45' && p.number % 2 === 1).sort((a, b) => a.x - b.x);
    const gaps = top.slice(1).map((p, i) => p.x - (top[i]!.x + top[i]!.w));
    const small = Math.min(...gaps);
    const big = Math.max(...gaps);
    expect(big).toBeGreaterThan(small * 2);
    // The big gap sits between port 11 and port 13 (6 columns per group).
    expect(gaps.indexOf(big)).toBe(5);
  });

  it('continues network numbering into SFP cages and keeps per-type cable indexes', () => {
    const sfp = els.filter((p) => p.connector === 'sfp_plus');
    expect(sfp.map((p) => p.number)).toEqual([25, 26]);
    expect(sfp.map((p) => p.index)).toEqual([1, 2]);
    expect(sfp.every((p) => p.uplink)).toBe(true);
  });

  it('writes tooltips with type and PoE', () => {
    expect(els.find((p) => p.number === 17)!.title).toBe('Port 17 — 1 GbE (PoE+)');
    expect(els.find((p) => p.number === 25)!.title).toBe('Port 25 — 10G SFP+ (uplink)');
  });

  it('marks only listed PoE ports', () => {
    const f = FaceLayoutSchema.parse({ regions: [{ type: 'rj45', count: 8, poe: 'poe+', poePorts: [1, 2, 3, 4] }] });
    const ps = ports(resolveLayout(f, 100, 32));
    expect(ps.filter((p) => p.poe).map((p) => p.number)).toEqual([1, 2, 3, 4]);
  });

  it('numbers patch panels row by row with colour overrides', () => {
    const f = FaceLayoutSchema.parse({ regions: [{ type: 'keystone', count: 48, rows: 2, numbers: true, colors: ['#ff0000'] }] });
    const ps = ports(resolveLayout(f, 450, U1 * 2));
    const p24 = ps.find((p) => p.number === 24)!;
    const p25 = ps.find((p) => p.number === 25)!;
    expect(p25.y).toBeGreaterThan(p24.y);
    expect(ps[0]!.color).toBe('#ff0000');
    expect(ps[1]!.color).toBeUndefined();
  });

  it('honours an explicit start number', () => {
    const f = FaceLayoutSchema.parse({ regions: [{ type: 'rj45', count: 2, start: 0 }] });
    expect(ports(resolveLayout(f, 100, 30)).map((p) => p.number)).toEqual([0, 1]);
  });

  it('skips cable indexes for pass-through backs', () => {
    const f = FaceLayoutSchema.parse({ regions: [{ type: 'punchdown', count: 12, portType: 'none' }] });
    expect(ports(resolveLayout(f, 222, U1)).every((p) => p.portType === undefined)).toBe(true);
  });
});

describe('cable indexes across faces', () => {
  it('numbers rear ports after the front ones of the same type', () => {
    const part = mk({
      ports: { usb: 4, rj45_1g: 1 },
      layout: {
        layoutVerified: false,
        front: { regions: [{ type: 'usb_a', count: 2 }] },
        rear: { regions: [{ type: 'usb_a', count: 2 }, { type: 'rj45', count: 1 }] },
      },
    });
    const idx = (face: 'front' | 'rear') => ports(resolveFace(part, face, 400, 40).elements).map((p) => `${p.portType}:${p.index}`);
    expect(idx('front')).toEqual(['usb:1', 'usb:2']);
    expect(idx('rear')).toEqual(['usb:3', 'usb:4', 'rj45_1g:1']);
  });
});

describe('regressions', () => {
  it('stacks 16 ports in two rows on a 1U face (no float rounding to one row)', () => {
    const part = mk({ ports: { rj45_1g: 16, rj45_2_5g: 8, sfp_plus: 2 }, poeBudgetW: 400 });
    const ps = ports(resolveFace(part, 'front', 450, U1).elements).filter((p) => p.portType === 'rj45_1g');
    expect(new Set(ps.map((p) => Math.round(p.y))).size).toBe(2);
    expect(ps[0]!.w).toBeGreaterThan(10);
  });
  it('gives explicitly placed labels their natural width even before another anchored region', () => {
    const r = resolveFace(mk(), 'front', 450, U1).elements.find((e) => e.kind === 'label')!;
    expect(r.w).toBeGreaterThan(10);
  });
});

describe('auto-generation fallback', () => {
  it('builds a switch face with every catalog port', () => {
    const part = mk();
    const r = resolveFace(part, 'front', 450, U1);
    expect(r.auto).toBe(true);
    const ps = ports(r.elements);
    expect(ps.filter((p) => p.portType === 'rj45_1g')).toHaveLength(24);
    expect(ps.filter((p) => p.portType === 'sfp_plus')).toHaveLength(2);
  });

  it('accounts for each catalog port exactly once across front and rear', () => {
    const parts = [
      mk(),
      mk({ id: 'srv', render: { style: 'server' }, mounting: 'full-depth', heightU: 2, driveBays: [{ count: 8, size: '2.5' }], ports: { rj45_1g: 4, usb: 2, vga: 1 } }),
      mk({ id: 'nas', render: { style: 'nas' }, mounting: 'full-depth', driveBays: [{ count: 4, size: '3.5' }], ports: { rj45_1g: 4, usb: 2 } }),
      mk({ id: 'pp-24', category: 'patch-panel', render: { style: 'patch-panel' }, ports: { keystone: 24 }, power: { typicalW: null, maxW: null } }),
      mk({ id: 'pdu', category: 'power', subcategory: 'pdu', render: { style: 'pdu' }, ports: { outlet_au: 6 } }),
      mk({ id: 'ups', category: 'power', render: { style: 'ups' }, ports: { outlet_c13: 6 }, ups: { capacityW: 900, capacityVA: 1500 } }),
      mk({ id: 'desk', formFactor: 'desktop', width: { mm: 140 }, render: { style: 'desktop' }, ports: { rj45_1g: 4, rj45_2_5g: 1 } }),
    ];
    for (const p of parts) {
      const declared = Object.fromEntries(Object.entries(p.ports).filter(([, n]) => n));
      expect(layoutPortCounts(p), p.id).toEqual(declared);
    }
  });

  it('picks presets by style and brand', () => {
    expect(resolvePreset(mk({ brand: 'Ubiquiti', render: { style: 'switch', body: 'white' } }))).toBe('unifi-white');
    expect(resolvePreset(mk({ brand: 'Ubiquiti', render: { style: 'switch' } }))).toBe('unifi-silver');
    expect(resolvePreset(mk({ brand: 'Dell', render: { style: 'server' } }))).toBe('dell-bezel');
    expect(resolvePreset(mk({ render: { style: 'patch-panel' } }))).toBe('patch-panel');
    expect(resolvePreset(mk({ render: { style: 'switch', preset: 'mikrotik' } }))).toBe('mikrotik');
    expect(resolvePreset(mk({ render: { style: 'switch', body: 'black' } }))).toBe('generic-black');
  });

  it('uses a detailed layout when the catalog has one', () => {
    const part = mk({
      layout: { layoutVerified: true, front: { regions: [{ type: 'rj45', count: 24 }, { type: 'sfp_plus', count: 2 }] } },
    });
    expect(resolveFace(part, 'front', 450, U1).auto).toBe(false);
    expect(resolveFace(part, 'rear', 450, U1).auto).toBe(true);
  });

  it('memoises resolved faces per part and size', () => {
    const part = mk();
    expect(resolveFace(part, 'front', 450, U1)).toBe(resolveFace(part, 'front', 450, U1));
    expect(resolveFace(part, 'front', 222, U1)).not.toBe(resolveFace(part, 'front', 450, U1));
  });
});

describe('bounds and overlap across rack widths', () => {
  const styles: PartInput[] = [
    base,
    { ...base, id: 'gw-1', render: { style: 'gateway' }, ports: { rj45_1g: 8, sfp_plus: 2, rj45_10g: 1 } },
    { ...base, id: 'sw48', ports: { rj45_1g: 48, sfp28: 4, qsfp28: 2 }, poeBudgetW: 720 },
    { ...base, id: 'srv', mounting: 'full-depth', heightU: 2, render: { style: 'server' }, driveBays: [{ count: 24, size: '2.5' }], ports: { rj45_10g: 2, usb: 2 } },
    { ...base, id: 'nas', mounting: 'full-depth', render: { style: 'nas' }, driveBays: [{ count: 4, size: '3.5' }], ports: { rj45_1g: 4 } },
    { ...base, id: 'pp-24', render: { style: 'patch-panel' }, ports: { keystone: 24 }, depthMm: 100 },
    { ...base, id: 'pp48', heightU: 2, render: { style: 'patch-panel' }, ports: { keystone: 48 } },
    { ...base, id: 'pdu', subcategory: 'pdu', render: { style: 'pdu' }, ports: { outlet_c13: 8 } },
    { ...base, id: 'ups', heightU: 2, mounting: 'full-depth', render: { style: 'ups' }, ports: { outlet_c13: 6 }, ups: { capacityW: 900, capacityVA: 1500 } },
    { ...base, id: 'fan', render: { style: 'fan' }, ports: {} },
    { ...base, id: 'brush', render: { style: 'brush' }, ports: {} },
    { ...base, id: 'cm-1', render: { style: 'cable-manager' }, ports: {} },
    { ...base, id: 'drawer', heightU: 2, render: { style: 'drawer' }, ports: {} },
    { ...base, id: 'vent', render: { style: 'vented' }, ports: {} },
  ];
  const widths = { '19in': RACK_OPENING_MM['19in'], '10in': RACK_OPENING_MM['10in'], half: RACK_OPENING_MM['19in'] / 2 };
  for (const input of styles) {
    for (const [wName, W] of Object.entries(widths)) {
      it(`${input.id} fits a ${wName} face without overlaps`, () => {
        const part = PartSchema.parse(input);
        const H = part.heightU * U1;
        for (const face of ['front', 'rear', 'top'] as const) {
          const h = face === 'top' ? 200 : H;
          assertClean(resolveFace(part, face, W, h).elements, W, h);
        }
      });
    }
  }

  it('scales ports down to fit narrow faces', () => {
    const part = mk({ ports: { rj45_1g: 48, sfp_plus: 4 } });
    const narrow = ports(resolveFace(part, 'front', RACK_OPENING_MM['10in'], U1).elements);
    const wide = ports(resolveFace(part, 'front', RACK_OPENING_MM['19in'], U1).elements);
    expect(narrow).toHaveLength(52);
    expect(narrow[0]!.w).toBeLessThan(wide[0]!.w);
  });

  it('auto layouts are schema-valid', () => {
    for (const input of styles) {
      const part = PartSchema.parse(input);
      for (const face of ['front', 'rear', 'top'] as const) expect(() => FaceLayoutSchema.parse(autoFaceLayout(part, face))).not.toThrow();
    }
  });
});
