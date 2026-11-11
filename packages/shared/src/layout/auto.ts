/**
 * Auto-generated faceplates for catalog entries without a detailed layout.
 * Built only from data every part has (render style, ports, drive bays,
 * power), so nothing in the catalog regresses when it lacks a layout.
 */
import { FaceLayoutSchema, type FaceLayout, type Part, type PortRegionSchema, type PortType, type RegionInput } from '../schemas.js';
import type { z } from 'zod';
import { CONNECTOR_FOR_PORT, RJ45_TIERS } from './connectors.js';

type Face = 'front' | 'rear' | 'top';
type Region = RegionInput;
type PortRegion = z.input<typeof PortRegionSchema>;

const n = (part: Part, t: PortType) => part.ports[t] ?? 0;

/** One region per catalog port type present, in a sensible order. */
function portRegions(part: Part, types: readonly PortType[], extra: Partial<PortRegion> = {}): PortRegion[] {
  const tiers = RJ45_TIERS.filter((t) => n(part, t) > 0);
  const poe = (part.poeBudgetW ?? 0) > 0;
  const out: PortRegion[] = [];
  for (const t of types) {
    const count = n(part, t);
    if (!count) continue;
    const connector = CONNECTOR_FOR_PORT[t];
    const isRj = RJ45_TIERS.includes(t);
    const isFastestTier = isRj && tiers.length > 1 && t === tiers[tiers.length - 1];
    const isCage = connector.startsWith('sfp') || connector.startsWith('qsfp');
    out.push({
      type: connector,
      count,
      portType: t,
      ...(isRj && poe && !isFastestTier ? { poe: 'poe+' as const } : {}),
      ...(isCage || isFastestTier ? { uplink: true } : {}),
      ...extra,
    });
  }
  return out;
}

const NETWORK: readonly PortType[] = [
  'rj45_100m',
  'rj45_1g',
  'rj45_2_5g',
  'rj45_5g',
  'rj45_10g',
  'sfp',
  'sfp_plus',
  'sfp28',
  'qsfp_plus',
  'qsfp28',
];
const OTHER_IO: readonly PortType[] = ['console', 'usb', 'usb_c', 'hdmi', 'micro_hdmi', 'displayport', 'vga', 'serial'];
const OUTLETS: readonly PortType[] = ['outlet_au', 'outlet_nema', 'outlet_schuko', 'outlet_uk', 'outlet_c13', 'outlet_c19', 'dc_out'];
const PATCH: readonly PortType[] = ['keystone', 'lc_duplex', 'sc_duplex'];

function inletRegion(part: Part): Region {
  const pi = part.powerInput;
  if (pi?.connector === 'usb_c') return { type: 'usb_c', count: 1, portType: 'none', role: 'Power in' };
  if (pi?.connector === 'dc_barrel') return { type: 'dc_barrel', count: 1, role: 'Power in' };
  if (pi?.connector === 'iec_c8') return { type: 'iec_c8', count: 1, role: 'Power in' };
  if (pi?.connector === 'iec_c6') return { type: 'iec_c6', count: 1, role: 'Power in' };
  if (pi?.connector === 'iec_c20' || (part.power.maxW ?? 0) > 2000) return { type: 'iec_c20', count: 1, role: 'Power in' };
  return { type: 'iec_c14', count: 1, role: 'Power in' };
}

function front(part: Part): Region[] {
  const label: Region = { type: 'label', x: 0.012, y: 0.1, text: part.model };
  const bays = (part.driveBays ?? []).filter((b) => b.size !== 'm2' && b.size !== 'e1s');
  const bayCount = bays.reduce((s, b) => s + b.count, 0);
  switch (part.render.style) {
    case 'switch':
    case 'gateway': {
      const gateway = part.render.style === 'gateway';
      const ports = portRegions(part, [...NETWORK, 'console']);
      if (ports[0]) ports[0] = { ...ports[0], x: gateway ? 0.26 : 0.2 };
      return [
        label,
        { type: 'leds', count: 1, x: 0.015, y: 0.62 },
        ...(gateway ? [{ type: 'display' as const, x: 0.12 }] : []),
        ...ports,
      ];
    }
    case 'server':
    case 'nas': {
      const controls: Region[] = [
        { type: 'button', kind: 'power', x: 0.012 },
        { type: 'leds', count: 2 },
      ];
      if (bayCount) {
        return [
          ...controls,
          { type: 'bays', count: bayCount, size: bays[0]!.size === 'u2' ? '2.5' : bays[0]!.size, x: 0.07, w: 0.78 },
          { type: 'label', x: 0.87, y: 0.1, text: part.model },
          { type: 'vent', x: 0.87, y: 0.35, h: 0.55, pattern: 'mesh' },
        ];
      }
      return [
        ...controls,
        ...portRegions(part, [...NETWORK, ...OTHER_IO]).map((r, i) => (i === 0 ? { ...r, x: 0.12 } : r)),
        { type: 'vent', pattern: 'slots' },
        { type: 'label', x: 0.86, y: 0.1, text: part.model },
      ];
    }
    case 'patch-panel': {
      const regions = portRegions(part, PATCH, { numbers: true });
      return regions.length ? regions.map((r, i) => (i === 0 ? { ...r, x: 0.04, w: regions.length > 1 ? 0.6 : 0.92 } : r)) : [];
    }
    case 'pdu':
      return [
        { type: 'label', x: 0.015, text: part.model },
        ...portRegions(part, [...OUTLETS, ...NETWORK, ...OTHER_IO]).map((r, i) => (i === 0 ? { ...r, x: 0.15 } : r)),
        { type: 'switch', variant: 'rocker', count: 1, x: 0.9 },
      ];
    case 'ups':
      return [
        { type: 'display', variant: 'lcd', x: 0.03 },
        { type: 'button', kind: 'power' },
        { type: 'leds', count: 3 },
        { type: 'label', x: 0.3, y: 0.1, text: part.model },
        { type: 'vent', x: 0.3, y: 0.4, h: 0.5, pattern: 'slots' },
        { type: 'ledbar', x: 0.01, y: 0.93, w: 0.98, h: 0.03 },
      ];
    case 'vented':
      return [{ type: 'vent', x: 0.03, w: 0.94, pattern: 'holes' }];
    case 'brush':
      return [{ type: 'brush', x: 0.04, w: 0.92 }];
    case 'cable-manager':
      return [{ type: 'd_ring', count: Math.max(2, Math.min(5, Math.round(part.heightU * 2 + 1))), x: 0.05, w: 0.9 }];
    case 'drawer':
      return [{ type: 'handle', x: 0.44, w: 0.12 }, { type: 'thumbscrew', x: 0.9 }];
    case 'fan':
      return [{ type: 'fan', count: part.heightU >= 2 ? 2 : 4, x: 0.05, w: 0.9 }];
    case 'desktop': {
      const ports = portRegions(part, [...NETWORK, ...OTHER_IO]);
      return [
        { type: 'label', x: 0.03, y: 0.12, text: part.model },
        { type: 'leds', count: 1, x: 0.03, y: 0.65 },
        ...ports.map((r, i) => (i === 0 ? { ...r, x: 0.3, align: 'end' as const } : r)),
      ];
    }
    case 'blank':
    case 'shelf':
      return [];
  }
}

function rear(part: Part): Region[] {
  const style = part.render.style;
  const passive = ['blank', 'vented', 'brush', 'cable-manager', 'drawer', 'shelf'].includes(style);
  if (passive) return style === 'vented' ? [{ type: 'vent', x: 0.03, w: 0.94, pattern: 'holes' }] : [];
  if (style === 'patch-panel') {
    const k = n(part, 'keystone');
    const punch = (part.depthMm ?? 0) >= 60;
    const bar = (part.depthMm ?? 0) >= 80;
    return k
      ? [
          { type: punch ? 'punchdown' : 'coupler', count: k, portType: 'none', numbers: true, x: 0.04, w: 0.92, ...(bar ? { y: 0.03, h: 0.78 } : {}) },
          ...(bar ? [{ type: 'cable_bar' as const, x: 0.02, y: 0.85, w: 0.96, h: 0.12 }] : []),
        ]
      : [];
  }
  if (style === 'pdu') return [inletRegion(part), { type: 'breaker', x: 0.9 }];
  if (style === 'ups') {
    return [
      { type: 'fan', count: 1, x: 0.03 },
      ...portRegions(part, OUTLETS).map((r, i) => (i === 0 ? { ...r, x: 0.2 } : r)),
      { type: 'rj45', count: 1, portType: 'none', role: 'Network card' },
      { type: 'usb_a', count: 1, portType: 'none', role: 'Comms' },
      { ...inletRegion(part), x: 0.88 },
    ];
  }
  if (style === 'desktop') return [{ type: 'label', x: 0.03, y: 0.12, text: 'Rear' }, { ...inletRegion(part), x: 0.8 }];
  // Switches / gateways: fans (if the draw needs them), ground lug, power inlet.
  const maxW = part.power.maxW ?? part.power.typicalW ?? 0;
  const fans = maxW > 150 ? 3 : maxW > 45 ? 2 : 0;
  if (style === 'switch' || style === 'gateway') {
    return [
      { type: 'ground', x: 0.03 },
      ...(fans ? [{ type: 'fan' as const, count: fans, x: 0.3 }] : [{ type: 'vent' as const, x: 0.1, w: 0.6, pattern: 'slots' as const }]),
      { ...inletRegion(part), x: 0.86 },
    ];
  }
  // Servers / NAS / fan trays: rear I/O, PSUs.
  if (style === 'server' || style === 'nas') {
    const bays = (part.driveBays ?? []).some((b) => b.size !== 'm2' && b.size !== 'e1s');
    const psus = (part.power.maxW ?? 0) >= 300 || part.heightU >= 2 ? 2 : 1;
    return [
      { type: 'fan', count: part.heightU >= 2 ? 2 : 1, x: 0.02 },
      ...(bays ? portRegions(part, [...NETWORK, ...OTHER_IO]).map((r, i) => (i === 0 ? { ...r, x: 0.2 } : r)) : [{ type: 'vent' as const, x: 0.2, w: 0.3 }]),
      { type: 'psu', count: psus, x: psus === 2 ? 0.62 : 0.8, inlet: 'iec_c14' },
    ];
  }
  if (style === 'fan') return [];
  return [];
}

function top(part: Part): Region[] {
  if (part.render.style === 'shelf') return [];
  return [
    { type: 'vent', x: 0.1, w: 0.8, y: 0.3, h: 0.4, pattern: 'slots' },
    { type: 'label', x: 0.06, y: 0.06, text: part.model },
  ];
}

/** Model names longer than a label allows are shortened. */
function trimLabel(r: Region): Region {
  return r.type === 'label' && r.text && r.text.length > 60 ? { ...r, text: r.text.slice(0, 59) + '…' } : r;
}

export function autoFaceLayout(part: Part, face: Face): FaceLayout {
  const regions = face === 'front' ? front(part) : face === 'rear' ? rear(part) : top(part);
  return FaceLayoutSchema.parse({ regions: regions.map(trimLabel) });
}
