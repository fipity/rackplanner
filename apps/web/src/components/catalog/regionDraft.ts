/** Region drafts for the faceplate editor: string fields <-> layout regions. Pure. */
import { CONNECTORS, type Region } from '@rackplanner/shared';

export interface RegionDraft {
  type: string;
  count: string;
  x: string;
  w: string;
  y: string;
  h: string;
  rows: string;
  poe: string;
  portType: string;
  text: string;
  /** Fields the table doesn't edit (poePorts, grouping, colours, role…), kept as-is. */
  extra: Record<string, unknown>;
}

export type FaceKey = 'front' | 'rear';

export const FEATURES = ['bays', 'display', 'vent', 'leds', 'ledbar', 'button', 'label', 'psu', 'fan', 'pcie', 'io_shield', 'ground', 'label_strip', 'cable_bar', 'brush', 'handle', 'thumbscrew', 'switch', 'breaker', 'slot', 'd_ring', 'panel'] as const;
export const COUNTED = new Set(['bays', 'leds', 'psu', 'fan', 'pcie', 'switch', 'd_ring']);
export const isPort = (t: string) => (CONNECTORS as readonly string[]).includes(t);
const pct = (v: number | undefined) => (v === undefined ? '' : String(Math.round(v * 1000) / 10));

const EDITED = new Set(['type', 'count', 'x', 'w', 'y', 'h', 'rows', 'poe', 'portType', 'text']);

export function regionToDraft(r: Region): RegionDraft {
  const a = r as Record<string, unknown>;
  return {
    extra: Object.fromEntries(Object.entries(a).filter(([k]) => !EDITED.has(k))),
    type: r.type,
    count: a.count !== undefined ? String(a.count) : '',
    x: pct(r.x),
    w: pct(r.w),
    y: pct(r.y),
    h: pct(r.h),
    rows: a.rows !== undefined ? String(a.rows) : '',
    poe: typeof a.poe === 'string' ? a.poe : a.poe === true ? 'poe+' : '',
    portType: typeof a.portType === 'string' ? a.portType : '',
    text: typeof a.text === 'string' ? a.text : '',
  };
}

const frac = (v: string) => {
  if (v.trim() === '') return undefined;
  const n = Number(v) / 100;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined;
};

/** Draft → region object (validated later by the part schema). */
export function draftToRegion(d: RegionDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d.extra, type: d.type };
  for (const k of ['x', 'w', 'y', 'h'] as const) {
    const v = frac(d[k]);
    if (v !== undefined) out[k] = v;
  }
  if (isPort(d.type) || COUNTED.has(d.type)) {
    const n = Number(d.count);
    if (d.count.trim() !== '' && Number.isFinite(n)) out.count = n;
  }
  if ((isPort(d.type) || d.type === 'bays') && d.rows.trim()) out.rows = Number(d.rows);
  if (isPort(d.type)) {
    if (d.poe) out.poe = d.poe;
    if (d.portType) out.portType = d.portType;
    if (d.type === 'keystone' || d.type === 'coupler' || d.type === 'punchdown') out.numbers = true;
  }
  if (d.type === 'label' && d.text.trim()) out.text = d.text.trim();
  if (d.type === 'display' && !out.variant) out.variant = 'lcd';
  return out;
}

export const blankRegion = (type = 'rj45'): RegionDraft => ({ type, count: isPort(type) ? '8' : COUNTED.has(type) ? '2' : '', x: '', w: '', y: '', h: '', rows: '', poe: '', portType: '', text: '', extra: {} });

