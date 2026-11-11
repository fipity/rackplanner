/**
 * Faceplate layout engine. Turns a declarative face layout (regions with
 * fractional positions) into absolutely positioned elements in millimetres.
 * Pure and framework-free: the web app draws the result, cables use the port
 * positions, tests check bounds and overlaps.
 */
import type { Connector, FaceLayout, FeatureRegion, Part, PoeLevel, PortRegion, PortType, Region, StylePreset } from '../schemas.js';
import { CONNECTOR_SPECS, DEFAULT_PORT_TYPE, POE_TEXT, PORT_SPEED_TEXT } from './connectors.js';
import { autoFaceLayout } from './auto.js';
import { resolvePreset } from './presets.js';

export type FaceName = 'front' | 'rear' | 'top';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PortElement extends Box {
  kind: 'port';
  connector: Connector;
  /** Printed number. */
  number: number;
  /** Catalog port type and 1-based index among that type on the device (cable key). */
  portType?: PortType;
  index?: number;
  poe?: PoeLevel;
  uplink: boolean;
  /** Latch / key side. */
  latch: 'top' | 'bottom';
  color?: string;
  showNumber: boolean;
  title: string;
}

export interface BayElement extends Box {
  kind: 'bay';
  number: number;
  size: '2.5' | '3.5' | 'm2' | 'e1s';
  vertical: boolean;
}

export type FeatureKind = Exclude<FeatureRegion['type'], 'bays'>;
export interface FeatureElement extends Box {
  kind: FeatureKind;
  region: Extract<FeatureRegion, { type: FeatureKind }>;
}

export type FaceElement = PortElement | BayElement | FeatureElement;

export interface ResolvedFace {
  face: FaceName;
  preset: StylePreset;
  w: number;
  h: number;
  elements: FaceElement[];
  /** Generated from catalog data rather than a detailed layout. */
  auto: boolean;
}

export const isPortRegion = (r: Region): r is PortRegion => r.type in CONNECTOR_SPECS;

/** Catalog port type of a port region (undefined for inlets and pass-through backs). */
export function portTypeOf(r: PortRegion): PortType | undefined {
  if (r.portType === 'none') return undefined;
  return r.portType ?? DEFAULT_PORT_TYPE[r.type];
}

/** Region kinds that stretch to fill leftover space when no width is given. */
const FILL = new Set<Region['type']>(['vent', 'label_strip', 'cable_bar', 'brush', 'panel', 'ledbar']);
/** Kinds drawn on top of others (backgrounds / thin bars); excluded from overlap checks. */
export const LAYERED_KINDS = new Set<string>(['panel', 'ledbar', 'label']);

// ---------------------------------------------------------------------------
// Natural sizes
// ---------------------------------------------------------------------------

interface PortBlock {
  rows: number;
  cols: number;
  colsPerGroup: number;
  w: number;
  h: number;
  labelH: number;
}

function portBlock(r: PortRegion, availH: number): PortBlock {
  const s = CONNECTOR_SPECS[r.type];
  const count = r.count;
  const labelH = r.numbers ? 3 : 0;
  const maxRows = Math.max(1, Math.floor((availH + s.gapY) / (s.h + labelH + s.gapY) + 1e-6));
  let rows = r.rows;
  if (rows === undefined) {
    if (s.family === 'patch') rows = count > 24 ? 2 : 1;
    else if (s.family === 'net') rows = (count >= 10 || (r.type !== 'rj45' && count > 4)) && maxRows >= 2 ? 2 : 1;
    else rows = 1;
  }
  rows = Math.min(rows, count);
  const cols = Math.ceil(count / rows);
  const colsPerGroup = Math.max(1, r.grouping ? Math.round(r.grouping / rows) : s.groupCols);
  const groups = Math.ceil(cols / colsPerGroup);
  return {
    rows,
    cols,
    colsPerGroup,
    labelH,
    w: cols * s.w + (cols - 1) * s.gapX + (groups - 1) * s.groupGap,
    h: rows * (s.h + labelH) + (rows - 1) * s.gapY,
  };
}

const BAY_SIZE = {
  '3.5': { w: 101.6, h: 26.1 },
  '2.5': { w: 70, h: 15 },
  m2: { w: 25, h: 8 },
  e1s: { w: 9.5, h: 40 },
} as const;

function bayBase(r: Extract<FeatureRegion, { type: 'bays' }>, availH: number) {
  const base = BAY_SIZE[r.size];
  const vertical = r.orientation ? r.orientation === 'vertical' : r.size === '2.5' ? availH >= 60 : r.size === 'e1s';
  return vertical && r.size !== 'e1s' ? { w: base.h, h: base.w, vertical } : { ...base, vertical };
}

function bayGrid(r: Extract<FeatureRegion, { type: 'bays' }>, bw: number, bh: number) {
  const base = bayBase(r, bh);
  const gap = 1;
  const n = r.count;
  const options: { rows: number; cols: number; s: number }[] = [];
  const maxRows = r.rows ?? Math.min(n, 6);
  for (let rows = r.rows ?? 1; rows <= maxRows; rows++) {
    const cols = Math.ceil(n / rows);
    const needW = cols * base.w + (cols - 1) * gap;
    const needH = rows * base.h + (rows - 1) * gap;
    options.push({ rows, cols, s: Math.min(1.05, bw / needW, bh / needH) });
  }
  const best = options.reduce((a, b) => (b.s > a.s + 0.04 ? b : a));
  return { ...best, base, gap };
}

/** Natural width of a region at the given available height. */
function naturalWidth(r: Region, availH: number): number {
  if (isPortRegion(r)) return portBlock(r, availH).w;
  switch (r.type) {
    case 'bays': {
      const g = bayGrid(r, Infinity, availH);
      return g.cols * g.base.w * g.s + (g.cols - 1) * g.gap * g.s;
    }
    case 'display': {
      const h = Math.min(availH * 0.8, 15);
      return h * 1.9;
    }
    case 'leds':
      return r.count * 3.4;
    case 'button':
      return r.kind === 'pinhole' ? 3 : 5;
    case 'label': {
      const size = r.size ?? Math.min(3.4, availH * 0.3);
      return Math.max(8, (r.text ?? '').length * size * 0.62 + 2);
    }
    case 'psu':
      return r.count * Math.min(86, availH * 2) + (r.count - 1) * 2;
    case 'fan': {
      const d = Math.min(availH, 80);
      return r.count * d + (r.count - 1) * 2;
    }
    case 'pcie':
      return r.count * 21;
    case 'io_shield':
      return Math.min(159, availH * 3.6);
    case 'ground':
      return 8;
    case 'handle':
      return 20;
    case 'thumbscrew':
      return 7;
    case 'switch':
      return r.count * 12;
    case 'breaker':
      return 10;
    case 'slot':
      return 12;
    case 'd_ring':
      return r.count * 28;
    default:
      return 0; // fill kinds
  }
}

/** Natural height (capped to the available height). */
function naturalHeight(r: Region, availH: number): number {
  if (isPortRegion(r)) return Math.min(availH, portBlock(r, availH).h);
  switch (r.type) {
    case 'display':
      return Math.min(availH * 0.8, 15);
    case 'leds':
      return Math.min(availH, 3);
    case 'ledbar':
      return Math.min(availH, 1.2);
    case 'button':
      return Math.min(availH, r.kind === 'pinhole' ? 3 : 5);
    case 'label':
      return Math.min(availH, (r.size ?? Math.min(3.4, availH * 0.3)) * 1.3);
    case 'ground':
    case 'thumbscrew':
      return Math.min(availH, 7);
    case 'switch':
      return Math.min(availH, 14);
    case 'breaker':
      return Math.min(availH, 12);
    case 'slot':
      return Math.min(availH, 2.4);
    case 'fan':
      return Math.min(availH, 80);
    case 'handle':
      return availH * 0.8;
    default:
      return availH;
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Place region boxes left to right. Explicit x starts a new segment; fill kinds share leftovers. */
export function regionBoxes(regions: readonly Region[], W: number, H: number): Box[] {
  const padX = Math.min(3, W * 0.02);
  const padY = Math.min(1.5, H * 0.06);
  const gap = Math.min(3, W * 0.015);
  const availH = Math.max(0, H - padY * 2);
  const boxes: Box[] = regions.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));

  // Layered kinds (labels, backgrounds, bars) with an explicit x sit on top of
  // the others: they don't take part in the left-to-right flow.
  const floating = (r: Region) => r.x !== undefined && LAYERED_KINDS.has(r.type);
  regions.forEach((r, i) => {
    if (!floating(r)) return;
    const x = r.x! * W;
    const w = Math.max(0, Math.min(r.w !== undefined ? r.w * W : FILL.has(r.type) ? W - padX - x : naturalWidth(r, availH), W - x));
    const h = r.h !== undefined ? r.h * H : naturalHeight(r, availH);
    const y = r.y !== undefined ? r.y * H : padY + (availH - h) / 2;
    boxes[i] = { x, y: Math.max(0, Math.min(y, H - h)), w, h: Math.min(h, H) };
  });

  // Split the rest into segments at regions with an explicit x.
  const segments: number[][] = [];
  regions.forEach((r, i) => {
    if (floating(r)) return;
    if (segments.length === 0 || r.x !== undefined) segments.push([i]);
    else segments[segments.length - 1]!.push(i);
  });
  segments.forEach((seg, si) => {
    const first = regions[seg[0]!]!;
    const start = first.x !== undefined ? first.x * W : padX;
    const nextSeg = segments[si + 1];
    const nextX = nextSeg ? regions[nextSeg[0]!]!.x : undefined;
    const end = nextX !== undefined ? Math.max(start, nextX * W - gap) : W - padX;
    const segW = Math.max(0, end - start);
    const hOf = (r: Region) => (r.h !== undefined ? r.h * H : availH);
    const widths = seg.map((i) => {
      const r = regions[i]!;
      if (r.w !== undefined) return { fixed: true, fill: false, w: r.w * W };
      if (FILL.has(r.type)) return { fixed: false, fill: true, w: 0 };
      return { fixed: false, fill: false, w: naturalWidth(r, hOf(r)) };
    });
    const gaps = gap * (seg.length - 1);
    const fixedSum = widths.filter((x) => x.fixed).reduce((s, x) => s + x.w, 0);
    const natSum = widths.filter((x) => !x.fixed && !x.fill).reduce((s, x) => s + x.w, 0);
    const fills = widths.filter((x) => x.fill).length;
    let room = segW - gaps - fixedSum;
    // Shrink natural-width regions when they don't fit (their content scales down).
    const natScale = natSum > 0 ? Math.max(0, Math.min(1, room / natSum)) : 1;
    room -= natSum * natScale;
    const fillW = fills ? Math.max(0, room) / fills : 0;
    let cursor = start;
    seg.forEach((i, k) => {
      const r = regions[i]!;
      const ww = widths[k]!;
      let w = ww.fixed ? ww.w : ww.fill ? fillW : ww.w * natScale;
      w = Math.max(0, Math.min(w, W - padX - cursor));
      const ah = hOf(r);
      const h = r.h !== undefined ? r.h * H : naturalHeight(r, ah);
      const y = r.y !== undefined ? r.y * H : padY + (availH - h) / 2;
      let x = cursor;
      // A lone natural-width region with spare room honours align within its segment.
      if (seg.length === 1 && !ww.fill && r.align && r.w === undefined) {
        if (r.align === 'center') x = start + (segW - w) / 2;
        if (r.align === 'end') x = start + segW - w;
      }
      boxes[i] = { x, y: Math.max(0, Math.min(y, H - h)), w, h: Math.min(h, H) };
      cursor = x + w + gap;
    });
  });
  return boxes;
}

interface Counters {
  family: Map<string, number>;
  type: Map<PortType, number>;
}

function layoutPorts(r: PortRegion, box: Box, counters: Counters, out: FaceElement[]) {
  const s = CONNECTOR_SPECS[r.type];
  const blk = portBlock(r, box.h);
  const scale = Math.min(1, blk.w > 0 ? box.w / blk.w : 1, blk.h > 0 ? box.h / blk.h : 1);
  const bw = blk.w * scale;
  const bh = blk.h * scale;
  const align = r.align ?? 'center';
  const ox = align === 'start' ? box.x : align === 'end' ? box.x + box.w - bw : box.x + (box.w - bw) / 2;
  const oy = box.y + (box.h - bh) / 2;
  const order = r.order ?? (s.family === 'patch' || blk.rows !== 2 ? 'row' : 'zigzag');
  const famStart = (counters.family.get(s.family) ?? 0) + 1;
  const start = r.start ?? famStart;
  const portType = portTypeOf(r);
  const poeLevel: PoeLevel | undefined = r.poe === true ? 'poe+' : r.poe === false ? undefined : r.poe;
  for (let i = 0; i < r.count; i++) {
    const col = order === 'zigzag' ? Math.floor(i / 2) : i % blk.cols;
    const row = order === 'zigzag' ? i % 2 : Math.floor(i / blk.cols);
    const number = start + i;
    const groupOffset = Math.floor(col / blk.colsPerGroup) * s.groupGap;
    const x = ox + (col * (s.w + s.gapX) + groupOffset) * scale;
    const y = oy + (row * (s.h + blk.labelH + s.gapY) + blk.labelH) * scale;
    let index: number | undefined;
    if (portType) {
      index = (counters.type.get(portType) ?? 0) + 1;
      counters.type.set(portType, index);
    }
    const poe = poeLevel && (!r.poePorts || r.poePorts.includes(number)) ? poeLevel : undefined;
    const speed = r.speed ?? (portType ? PORT_SPEED_TEXT[portType] : s.label);
    const name = s.family === 'net' || s.family === 'patch' ? `Port ${number}` : `${s.label} ${number}`;
    const extras = [poe ? POE_TEXT[poe] : null, r.uplink ? 'uplink' : null, r.role ?? null].filter(Boolean).join(', ');
    out.push({
      kind: 'port',
      connector: r.type,
      x,
      y,
      w: s.w * scale,
      h: s.h * scale,
      number,
      ...(portType ? { portType, index } : {}),
      ...(poe ? { poe } : {}),
      uplink: r.uplink ?? false,
      latch: blk.rows >= 2 && row % 2 === 0 ? 'top' : 'bottom',
      ...(r.colors?.[i] ? { color: r.colors[i] } : {}),
      showNumber: r.numbers ?? false,
      title: `${name} — ${speed}${extras ? ` (${extras})` : ''}`,
    });
  }
  counters.family.set(s.family, Math.max(famStart - 1, start + r.count - 1));
}

function layoutBays(r: Extract<FeatureRegion, { type: 'bays' }>, box: Box, out: FaceElement[]) {
  const g = bayGrid(r, box.w, box.h);
  const s = Math.min(1, g.s);
  const bw = g.base.w * s;
  const bh = g.base.h * s;
  const gap = g.gap * s;
  const totalW = g.cols * bw + (g.cols - 1) * gap;
  const totalH = g.rows * bh + (g.rows - 1) * gap;
  const ox = box.x + (box.w - totalW) / 2;
  const oy = box.y + (box.h - totalH) / 2;
  const start = r.start ?? 0;
  for (let i = 0; i < r.count; i++) {
    // Vertical bays fill left to right; horizontal bays fill row by row.
    const c = i % g.cols;
    const rr = Math.floor(i / g.cols);
    out.push({ kind: 'bay', x: ox + c * (bw + gap), y: oy + rr * (bh + gap), w: bw, h: bh, number: start + i, size: r.size, vertical: g.base.vertical });
  }
}

/** Resolve a face layout into positioned elements. W × H is the face area in mm (ears excluded). */
export function resolveLayout(layout: FaceLayout, W: number, H: number): FaceElement[] {
  const boxes = regionBoxes(layout.regions, W, H);
  const counters: Counters = { family: new Map(), type: new Map() };
  const out: FaceElement[] = [];
  layout.regions.forEach((r, i) => {
    const box = boxes[i]!;
    if (box.w <= 0.01 || box.h <= 0.01) {
      // Still count ports so cable indexes stay stable even when squeezed out.
      if (isPortRegion(r)) layoutPorts(r, { ...box, w: 0, h: 0 }, counters, []);
      return;
    }
    if (isPortRegion(r)) layoutPorts(r, box, counters, out);
    else if (r.type === 'bays') layoutBays(r, box, out);
    else out.push({ kind: r.type, ...box, region: r } as FeatureElement);
  });
  return out;
}

const cache = new WeakMap<Part, Map<string, ResolvedFace>>();

/** The layout used for a face: the catalog's detailed one, else auto-generated. */
export function faceLayoutFor(part: Part, face: FaceName): { layout: FaceLayout; auto: boolean } {
  const detailed = part.layout?.[face];
  if (detailed) return { layout: detailed, auto: false };
  return { layout: autoFaceLayout(part, face), auto: true };
}

/** Resolve a part's face at a given size. Memoised per part object and size. */
export function resolveFace(part: Part, face: FaceName, w: number, h: number): ResolvedFace {
  const key = `${face}:${w.toFixed(2)}:${h.toFixed(2)}`;
  let byPart = cache.get(part);
  const hit = byPart?.get(key);
  if (hit) return hit;
  const { layout, auto } = faceLayoutFor(part, face);
  const resolved: ResolvedFace = {
    face,
    preset: layout.style ?? resolvePreset(part),
    w,
    h,
    elements: resolveLayout(layout, w, h),
    auto,
  };
  if (!byPart) cache.set(part, (byPart = new Map()));
  if (byPart.size > 24) byPart.clear();
  byPart.set(key, resolved);
  return resolved;
}

/** Port elements of a face, for cables and tooltips. */
export function facePorts(part: Part, face: FaceName, w: number, h: number): PortElement[] {
  return resolveFace(part, face, w, h).elements.filter((e): e is PortElement => e.kind === 'port');
}

/** Ports per catalog type declared by a layout (front, rear and top), for consistency checks. */
export function layoutPortCounts(part: Part): Partial<Record<PortType, number>> {
  const counts: Partial<Record<PortType, number>> = {};
  for (const face of ['front', 'rear', 'top'] as const) {
    const { layout } = faceLayoutFor(part, face);
    for (const r of layout.regions) {
      if (!isPortRegion(r)) continue;
      const t = portTypeOf(r);
      if (t) counts[t] = (counts[t] ?? 0) + r.count;
    }
  }
  return counts;
}

export function overlaps(a: Box, b: Box, eps = 0.01): boolean {
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}
