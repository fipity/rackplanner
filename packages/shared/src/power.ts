/**
 * Where each device's power comes from, and whether the rack's power boards
 * have enough of the right outlets. Plug-pack (wall-wart) adapters need a
 * mains socket, not an IEC C13 outlet, and tend to block their neighbours.
 */
import { displayName, type Catalog } from './placement.js';
import type { Design, Part, PortType, PowerInput } from './schemas.js';

export const MAINS_SOCKETS: readonly PortType[] = ['outlet_au', 'outlet_nema', 'outlet_schuko', 'outlet_uk'];
export const IEC_OUTLETS: readonly PortType[] = ['outlet_c13', 'outlet_c19'];

const PASSIVE_CATS = new Set(['blank', 'patch-panel', 'cable-management', 'shelf', 'mount', 'accessory']);

export interface PowerNeed {
  placementId: string;
  name: string;
  /** How it connects. Inferred (IEC inlet) when the catalog has no power input data. */
  input: PowerInput;
  inferred: boolean;
  /** Outlets it uses (0 for PoE-powered). */
  outlets: number;
  /** Needs a mains socket (plug-pack), rather than any outlet. */
  needsSocket: boolean;
  summary: string;
}

export interface PowerSupplySummary {
  needs: PowerNeed[];
  outletsNeeded: number;
  socketsNeeded: number;
  mainsSockets: number;
  iecOutlets: number;
  dcOutputs: number;
  plugPackIds: string[];
  /** True when the design has power boards or explicit power data, so the check is meaningful. */
  relevant: boolean;
}

export function isPowerProvider(part: Part): boolean {
  return !!part.ups || part.subcategory === 'pdu' || part.subcategory === 'rps' || part.render.style === 'pdu';
}

const CONNECTOR_TEXT: Record<PowerInput['connector'], string> = {
  iec_c14: 'IEC C14 inlet',
  iec_c20: 'IEC C20 inlet',
  iec_c8: 'IEC C8 (figure-8) inlet',
  iec_c6: 'IEC C6 (clover) inlet',
  ac_inlet: 'AC power cord',
  usb_c: 'USB-C',
  dc_barrel: 'DC barrel jack',
  poe: 'PoE (powered by a switch port)',
  hardwired: 'Fixed mains cord',
};

export function describePowerInput(pi: PowerInput): string {
  const volts = pi.voltageV ? ` ${pi.voltageV} V${pi.currentA ? ` ${pi.currentA} A` : ''}` : '';
  const via =
    pi.adapter === 'wall'
      ? ` via plug-pack${pi.adapterW ? ` (${pi.adapterW} W)` : ''}`
      : pi.adapter === 'brick'
        ? ` via external power brick${pi.adapterW ? ` (${pi.adapterW} W)` : ''}`
        : '';
  const n = pi.inputs > 1 ? ` ×${pi.inputs}` : '';
  return `${CONNECTOR_TEXT[pi.connector]}${volts}${via}${n}`;
}

function needFor(part: Part): { input: PowerInput; inferred: boolean } | null {
  if (part.powerInput) return { input: part.powerInput, inferred: false };
  if (isPowerProvider(part)) return null;
  const hasPower = part.power.maxW !== null || part.power.typicalW !== null;
  if (!hasPower && PASSIVE_CATS.has(part.category)) return null;
  if (!hasPower && part.formFactor === 'rack' && part.category !== 'server' && part.category !== 'storage') return null;
  return { input: { connector: 'iec_c14', adapter: 'none', inputs: 1 }, inferred: true };
}

export function powerSupplySummary(design: Pick<Design, 'placements'>, catalog: Catalog): PowerSupplySummary {
  const needs: PowerNeed[] = [];
  let mainsSockets = 0;
  let iecOutlets = 0;
  let dcOutputs = 0;
  let explicit = false;
  for (const p of design.placements) {
    const part = catalog.get(p.partId);
    if (!part) continue;
    for (const t of MAINS_SOCKETS) mainsSockets += part.ports[t] ?? 0;
    for (const t of IEC_OUTLETS) iecOutlets += part.ports[t] ?? 0;
    dcOutputs += part.ports.dc_out ?? 0;
    const need = needFor(part);
    if (!need) continue;
    if (!need.inferred) explicit = true;
    const { input } = need;
    const outlets = input.connector === 'poe' ? 0 : input.inputs;
    const needsSocket = input.adapter === 'wall';
    needs.push({
      placementId: p.id,
      name: displayName(p, part),
      input,
      inferred: need.inferred,
      outlets,
      needsSocket,
      summary: need.inferred ? 'Assumed IEC C14 inlet (no power input data in the catalog)' : describePowerInput(input),
    });
  }
  const outletsNeeded = needs.reduce((s, n) => s + n.outlets, 0);
  const socketsNeeded = needs.filter((n) => n.needsSocket).reduce((s, n) => s + n.outlets, 0);
  return {
    needs,
    outletsNeeded,
    socketsNeeded,
    mainsSockets,
    iecOutlets,
    dcOutputs,
    plugPackIds: needs.filter((n) => n.input.adapter === 'wall').map((n) => n.placementId),
    relevant: explicit || mainsSockets + iecOutlets > 0,
  };
}
