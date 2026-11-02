/**
 * Cables between devices: port enumeration, defaults, length suggestions and
 * validation. Drawing lives in the web app; this is the pure part.
 */
import { displayName, type Catalog } from './placement.js';
import { PORT_TYPE_LABELS, PORT_TYPES, type Cable, type CableEnd, type CableType, type Design, type Part, type PortType } from './schemas.js';

export const CABLE_COLORS: Record<CableType, string> = {
  copper: '#3b82f6',
  fiber: '#eab308',
  dac: '#1f2937',
  power: '#111827',
  other: '#a855f7',
};

export const CABLE_TYPE_LABELS: Record<CableType, string> = {
  copper: 'Copper (RJ45)',
  fiber: 'Fibre',
  dac: 'DAC / twinax',
  power: 'Power',
  other: 'Other',
};

/** Standard patch lead lengths (m) to round suggestions up to. */
export const STANDARD_LENGTHS_M = [0.15, 0.3, 0.5, 1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 30] as const;

export interface PortOption {
  type: PortType;
  index: number;
  label: string;
}

/** Every port on a part, numbered per type ("RJ45 1G 3"). */
export function portOptions(part: Part): PortOption[] {
  const out: PortOption[] = [];
  for (const type of PORT_TYPES) {
    const n = part.ports[type] ?? 0;
    for (let i = 1; i <= n; i++) out.push({ type, index: i, label: `${PORT_TYPE_LABELS[type]} ${i}` });
  }
  return out;
}

const SFP_FAMILY: ReadonlySet<PortType> = new Set(['sfp', 'sfp_plus', 'sfp28', 'qsfp_plus', 'qsfp28']);
const OUTLETS: ReadonlySet<PortType> = new Set(['outlet_c13', 'outlet_c19', 'outlet_nema', 'outlet_schuko', 'outlet_au', 'outlet_uk']);

/** Sensible cable type for two ends (user can change it). */
export function guessCableType(a: CableEnd, b: CableEnd): CableType {
  const types = [a.port?.type, b.port?.type].filter((t): t is PortType => !!t);
  if (types.some((t) => OUTLETS.has(t))) return 'power';
  if (types.includes('lc_duplex')) return 'fiber';
  if (types.length === 2 && types.every((t) => SFP_FAMILY.has(t))) return 'dac';
  if (types.some((t) => SFP_FAMILY.has(t))) return 'fiber';
  return 'copper';
}

/**
 * Suggest a patch lead length from the straight-line distance between the
 * two ends (mm), adding slack for routing, rounded up to a standard length.
 */
export function suggestCableLengthM(distanceMm: number): number {
  const needed = (distanceMm * 1.4 + 150) / 1000;
  return STANDARD_LENGTHS_M.find((l) => l >= needed) ?? Math.ceil(needed);
}

export function sameEnd(x: CableEnd, y: CableEnd): boolean {
  return x.placementId === y.placementId && x.port?.type === y.port?.type && x.port?.index === y.port?.index && !!x.port === !!y.port;
}

export function endLabel(design: Pick<Design, 'placements'>, catalog: Catalog, end: CableEnd): string {
  const p = design.placements.find((q) => q.id === end.placementId);
  const name = p ? displayName(p, catalog.get(p.partId)) : 'missing device';
  return end.port ? `${name} · ${PORT_TYPE_LABELS[end.port.type]} ${end.port.index}` : name;
}

export interface CableProblem {
  cableId: string;
  message: string;
}

/** Cables that point at missing devices or ports, or share a port with another cable. */
export function cableProblems(design: Pick<Design, 'placements' | 'cables'>, catalog: Catalog): CableProblem[] {
  const out: CableProblem[] = [];
  const used = new Map<string, string>();
  for (const c of design.cables) {
    for (const end of [c.a, c.b]) {
      const p = design.placements.find((q) => q.id === end.placementId);
      const part = p && catalog.get(p.partId);
      if (!p || !part) {
        out.push({ cableId: c.id, message: `A cable${c.label ? ` (${c.label})` : ''} is connected to a device that no longer exists` });
        continue;
      }
      if (!end.port) continue;
      if (end.port.index > (part.ports[end.port.type] ?? 0)) {
        out.push({ cableId: c.id, message: `${endLabel(design, catalog, end)} doesn't exist on ${part.name}` });
        continue;
      }
      const key = `${end.placementId}|${end.port.type}|${end.port.index}`;
      const other = used.get(key);
      if (other && other !== c.id) out.push({ cableId: c.id, message: `${endLabel(design, catalog, end)} has more than one cable` });
      used.set(key, c.id);
    }
  }
  return out;
}

export function cablesAt(design: Pick<Design, 'cables'>, placementId: string): Cable[] {
  return design.cables.filter((c) => c.a.placementId === placementId || c.b.placementId === placementId);
}
