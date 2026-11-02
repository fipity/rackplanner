/**
 * Procedural faceplate renderer. Every device is drawn from its catalog data
 * (render style, finish, accent colour, port counts, drive bays) so new
 * catalog entries get a plausible look without custom artwork. All units are
 * millimetres; the component draws at the origin and the caller translates it.
 *
 * Deliberately generic: model text labels only, no brand logos or artwork.
 */
import { memo, type ReactNode } from 'react';
import { U_MM, type BodyFinish, type Part, type PortType, type RenderStyle } from '@rackplanner/shared';
import { RAIL, type View } from '../rack/geometry';

interface Finish {
  body: string;
  edge: string;
  ear: string;
  text: string;
  dim: string;
  bay: string;
}

const FINISHES: Record<BodyFinish, Finish> = {
  black: { body: '#24282e', edge: '#101215', ear: '#1c1f24', text: '#d4d8de', dim: '#7c838d', bay: '#16191d' },
  grey: { body: '#5a6069', edge: '#33373d', ear: '#4b5058', text: '#eef0f3', dim: '#b4bac2', bay: '#30343a' },
  silver: { body: '#d5d9dd', edge: '#8f969d', ear: '#c2c7cc', text: '#30353b', dim: '#7a8189', bay: '#a9afb5' },
  white: { body: '#eef0f2', edge: '#a3a9b0', ear: '#dde1e4', text: '#30353b', dim: '#8a9199', bay: '#c9ced3' },
};

const DEFAULT_BODY: Partial<Record<RenderStyle, BodyFinish>> = {
  switch: 'silver',
  gateway: 'silver',
  desktop: 'white',
};

const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export interface FaceplateProps {
  part: Part;
  w: number;
  h: number;
  ears: boolean;
  view: View;
  label?: string | undefined;
  color?: string | undefined;
}

export const Faceplate = memo(function Faceplate({ part, w, h, ears, view, label, color }: FaceplateProps) {
  const style = part.render.style;
  const fin = FINISHES[part.render.body ?? DEFAULT_BODY[style] ?? 'black'];
  const accent = part.render.accent ?? '#64748b';
  const earW = ears ? RAIL : 0;
  const ix = earW;
  const iw = w - earW * 2;
  const rear = view === 'rear' && part.mounting === 'full-depth';

  if (style === 'shelf' && !rear) {
    return (
      <g>
        {ears && <Ears w={w} h={h} fin={fin} />}
        <Shelf x={ix} w={iw} h={h} fin={fin} />
        {color && <rect x={ix} y={h - 6} width={2.4} height={5} fill={color} />}
        {label && <LabelTag x={ix + iw} y={h - 8} text={label} />}
      </g>
    );
  }

  // Desktop gear is usually shorter than the U footprint it reserves.
  const bodyH = style === 'desktop' && part.heightMm ? Math.min(h, part.heightMm) : h;
  const by = h - bodyH;

  let content: ReactNode;
  if (rear) {
    content = <RearPanel part={part} x={ix} y={by} w={iw} h={bodyH} fin={fin} accent={accent} />;
  } else {
    content = <FrontContent part={part} style={style} x={ix} y={by} w={iw} h={bodyH} fin={fin} accent={accent} />;
  }

  return (
    <g>
      {ears && <Ears w={w} h={h} fin={fin} />}
      <rect
        x={ix}
        y={by + 0.35}
        width={iw}
        height={bodyH - 0.7}
        rx={style === 'desktop' ? Math.min(4, bodyH / 4) : 1}
        fill={fin.body}
        stroke={fin.edge}
        strokeWidth={0.5}
      />
      {content}
      {color && <rect x={ix + 0.3} y={by + 0.6} width={2.4} height={bodyH - 1.2} fill={color} />}
      {label && <LabelTag x={ix + iw} y={by} text={label} />}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Ears({ w, h, fin }: { w: number; h: number; fin: Finish }) {
  const units = Math.max(1, Math.round((h / U_MM) * 2) / 2);
  const screws: number[] = [];
  for (let i = 0; i < Math.ceil(units); i++) {
    screws.push(Math.min(h - 3, i * U_MM + Math.min(U_MM, h) / 2));
  }
  return (
    <g>
      {[0, w - RAIL].map((x) => (
        <g key={x}>
          <rect x={x} y={0.35} width={RAIL} height={h - 0.7} rx={1} fill={fin.ear} stroke={fin.edge} strokeWidth={0.5} />
          {screws.map((sy) => (
            <g key={sy}>
              <circle cx={x + RAIL / 2} cy={sy} r={2.6} fill="#9aa0a6" stroke="#5f656b" strokeWidth={0.4} />
              <path d={`M${x + RAIL / 2 - 1.5} ${sy}h3M${x + RAIL / 2} ${sy - 1.5}v3`} stroke="#4b5056" strokeWidth={0.5} />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

function LabelTag({ x, y, text }: { x: number; y: number; text: string }) {
  const t = text.length > 28 ? text.slice(0, 27) + '…' : text;
  const tw = t.length * 2.05 + 4;
  return (
    <g>
      <rect x={x - tw - 1.5} y={y + 1.5} width={tw} height={5.6} rx={1.4} fill="rgba(15,23,42,0.82)" />
      <text x={x - tw / 2 - 1.5} y={y + 5.5} fontSize={3.6} fill="#f8fafc" textAnchor="middle" fontFamily={FONT} fontWeight={600}>
        {t}
      </text>
    </g>
  );
}

function ModelText({ x, y, text, fin, size = 3.6 }: { x: number; y: number; text: string; fin: Finish; size?: number }) {
  return (
    <text x={x} y={y} fontSize={size} fill={fin.text} fontFamily={FONT} fontWeight={600} letterSpacing={0.1}>
      {text}
    </text>
  );
}

function Led({ x, y, color, r = 0.9 }: { x: number; y: number; color: string; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={color} />;
}

function Vents({ x, y, w, h, fin }: { x: number; y: number; w: number; h: number; fin: Finish }) {
  if (w < 6 || h < 4) return null;
  const rows: ReactNode[] = [];
  const rowGap = 3.4;
  const nRows = Math.max(1, Math.floor(h / rowGap));
  const slotW = 7;
  const nCols = Math.max(1, Math.floor(w / (slotW + 1.8)));
  const offX = x + (w - nCols * (slotW + 1.8) + 1.8) / 2;
  const offY = y + (h - nRows * rowGap + rowGap - 1.4) / 2;
  for (let r = 0; r < nRows; r++) {
    const stagger = r % 2 ? (slotW + 1.8) / 2 : 0;
    for (let c = 0; c < nCols - (r % 2); c++) {
      rows.push(
        <rect key={`${r}-${c}`} x={offX + stagger + c * (slotW + 1.8)} y={offY + r * rowGap} width={slotW} height={1.4} rx={0.7} fill={fin.edge} opacity={0.75} />,
      );
    }
  }
  return <g>{rows}</g>;
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

type PortKind = 'rj45' | 'sfp' | 'qsfp' | 'keystone' | 'outlet' | 'outlet-big';

interface PortGroup {
  kind: PortKind;
  /** LED / tint per port. */
  tints: string[];
}

const TIER: Partial<Record<PortType, string>> = {
  rj45_100m: '#f59e0b',
  rj45_1g: '#22c55e',
  rj45_2_5g: '#38bdf8',
  rj45_5g: '#60a5fa',
  rj45_10g: '#a78bfa',
  sfp: '#22c55e',
  sfp_plus: '#38bdf8',
  sfp28: '#a78bfa',
  qsfp_plus: '#38bdf8',
  qsfp28: '#a78bfa',
};

const CELL: Record<PortKind, { w: number; h: number; gap: number; groupEvery: number; groupGap: number }> = {
  rj45: { w: 11.6, h: 9.6, gap: 1.3, groupEvery: 6, groupGap: 3.5 },
  sfp: { w: 13.6, h: 8.8, gap: 1.6, groupEvery: 4, groupGap: 2.5 },
  qsfp: { w: 18, h: 9, gap: 1.8, groupEvery: 4, groupGap: 2.5 },
  keystone: { w: 11, h: 11, gap: 1.5, groupEvery: 6, groupGap: 4 },
  outlet: { w: 13, h: 12, gap: 3, groupEvery: 99, groupGap: 0 },
  'outlet-big': { w: 16, h: 13, gap: 3, groupEvery: 99, groupGap: 0 },
};

function portGroups(part: Part): PortGroup[] {
  const p = part.ports;
  const n = (k: PortType) => p[k] ?? 0;
  const groups: PortGroup[] = [];
  const rj: string[] = [];
  for (const k of ['rj45_100m', 'rj45_1g', 'rj45_2_5g', 'rj45_5g', 'rj45_10g'] as const) {
    for (let i = 0; i < n(k); i++) rj.push(TIER[k]!);
  }
  if (rj.length) groups.push({ kind: 'rj45', tints: rj });
  const sfp: string[] = [];
  for (const k of ['sfp', 'sfp_plus', 'sfp28'] as const) for (let i = 0; i < n(k); i++) sfp.push(TIER[k]!);
  if (sfp.length) groups.push({ kind: 'sfp', tints: sfp });
  const q: string[] = [];
  for (const k of ['qsfp_plus', 'qsfp28'] as const) for (let i = 0; i < n(k); i++) q.push(TIER[k]!);
  if (q.length) groups.push({ kind: 'qsfp', tints: q });
  const ks = n('keystone') + n('lc_duplex');
  if (ks) groups.push({ kind: 'keystone', tints: Array.from({ length: ks }, () => '#e5e7eb') });
  const outlets = n('outlet_c13') + n('outlet_nema') + n('outlet_schuko') + n('outlet_au') + n('outlet_uk');
  if (outlets) groups.push({ kind: 'outlet', tints: Array.from({ length: outlets }, () => '#111') });
  if (n('outlet_c19')) groups.push({ kind: 'outlet-big', tints: Array.from({ length: n('outlet_c19') }, () => '#111') });
  return groups;
}

function rowsFor(kind: PortKind, count: number, h: number): number {
  const c = CELL[kind];
  const maxRows = Math.max(1, Math.floor((h + c.gap) / (c.h + c.gap + (kind === 'keystone' ? 3.2 : 0))));
  const threshold = kind === 'rj45' || kind === 'keystone' ? 12 : 4;
  if (count <= threshold) return 1;
  return Math.min(maxRows, 2, count);
}

function groupSize(kind: PortKind, count: number, rows: number) {
  const c = CELL[kind];
  const cols = Math.ceil(count / rows);
  const groupGaps = Math.max(0, Math.ceil(cols / c.groupEvery) - 1);
  const labelH = kind === 'keystone' ? 3.2 : 0;
  return {
    cols,
    w: cols * c.w + (cols - 1) * c.gap + groupGaps * c.groupGap,
    h: rows * (c.h + labelH) + (rows - 1) * c.gap,
  };
}

/** Lay out port groups left-to-right inside a box, scaling down to fit. */
function PortBlock({ groups, x, y, w, h, fin, align = 'center' }: { groups: PortGroup[]; x: number; y: number; w: number; h: number; fin: Finish; align?: 'center' | 'start' | 'end' }) {
  if (!groups.length || w <= 4 || h <= 3) return null;
  const sized = groups.map((g) => {
    const rows = rowsFor(g.kind, g.tints.length, h);
    return { g, rows, ...groupSize(g.kind, g.tints.length, rows) };
  });
  const interGroup = 6;
  const totalW = sized.reduce((s, g) => s + g.w, 0) + interGroup * (sized.length - 1);
  const totalH = Math.max(...sized.map((g) => g.h));
  const s = Math.min(1, w / totalW, h / totalH);
  const drawnW = totalW * s;
  const ox = align === 'start' ? x : align === 'end' ? x + w - drawnW : x + (w - drawnW) / 2;
  const oy = y + (h - totalH * s) / 2;

  let cursor = 0;
  const out: ReactNode[] = [];
  sized.forEach(({ g, rows, cols, w: gw, h: gh }, gi) => {
    const c = CELL[g.kind];
    const labelH = g.kind === 'keystone' ? 3.2 : 0;
    const gy = (totalH - gh) / 2;
    g.tints.forEach((tint, i) => {
      // Switch-style numbering: odd ports on top, even below.
      const col = rows === 2 ? Math.floor(i / 2) : i % cols;
      const row = rows === 2 ? i % 2 : Math.floor(i / cols);
      const px = cursor + col * (c.w + c.gap) + Math.floor(col / c.groupEvery) * c.groupGap;
      const py = gy + row * (c.h + labelH + c.gap) + labelH;
      out.push(<Port key={`${gi}-${i}`} kind={g.kind} x={px} y={py} tint={tint} flip={rows === 2 && row === 1} n={i + 1} fin={fin} />);
    });
    cursor += gw + interGroup;
  });

  return <g transform={`translate(${ox} ${oy}) scale(${s})`}>{out}</g>;
}

function Port({ kind, x, y, tint, flip, n, fin }: { kind: PortKind; x: number; y: number; tint: string; flip: boolean; n: number; fin: Finish }) {
  const c = CELL[kind];
  switch (kind) {
    case 'rj45': {
      const tabY = flip ? y + 1.3 : y + c.h - 2.9;
      return (
        <g>
          <rect x={x} y={y} width={c.w} height={c.h} rx={0.6} fill="#0c0e11" stroke="#454b52" strokeWidth={0.3} />
          <rect x={x + 1.4} y={y + 1.8} width={c.w - 2.8} height={c.h - 3.6} fill="#020304" />
          <rect x={x + c.w / 2 - 2} y={tabY} width={4} height={1.6} fill="#020304" />
          <rect x={x + 0.9} y={flip ? y + c.h - 1.4 : y + 0.5} width={2} height={0.9} fill={tint} />
        </g>
      );
    }
    case 'sfp':
    case 'qsfp':
      return (
        <g>
          <rect x={x} y={y} width={c.w} height={c.h} rx={0.4} fill="#a3a9b0" stroke="#5d636a" strokeWidth={0.35} />
          <rect x={x + 1.2} y={y + 1.5} width={c.w - 2.4} height={c.h - 3} fill="#16191c" />
          <rect x={x + c.w - 2.6} y={y + 0.4} width={1.8} height={0.8} fill={tint} />
        </g>
      );
    case 'keystone':
      return (
        <g>
          <text x={x + c.w / 2} y={y - 0.9} fontSize={2.4} fill={fin.dim} textAnchor="middle" fontFamily={FONT}>
            {n}
          </text>
          <rect x={x} y={y} width={c.w} height={c.h} rx={0.8} fill="#e6e8eb" stroke="#9ca3af" strokeWidth={0.3} />
          <rect x={x + 2} y={y + 2.6} width={c.w - 4} height={c.h - 5} fill="#0b0c0e" />
          <rect x={x + c.w / 2 - 1.6} y={y + c.h - 3} width={3.2} height={1.2} fill="#0b0c0e" />
        </g>
      );
    case 'outlet':
    case 'outlet-big':
      return (
        <g>
          <path
            d={`M${x + 2} ${y} h${c.w - 4} l2 3 v${c.h - 5} q0 2 -2 2 h${-(c.w - 4)} q-2 0 -2 -2 v${-(c.h - 5)} z`}
            fill="#0b0c0e"
            stroke="#3f444a"
            strokeWidth={0.4}
          />
          <rect x={x + c.w * 0.25} y={y + c.h * 0.32} width={1.4} height={3.4} fill="#3b4046" />
          <rect x={x + c.w * 0.75 - 1.4} y={y + c.h * 0.32} width={1.4} height={3.4} fill="#3b4046" />
          <rect x={x + c.w / 2 - 0.7} y={y + c.h * 0.62} width={1.4} height={2.6} fill="#3b4046" />
        </g>
      );
  }
}

// ---------------------------------------------------------------------------
// Drive bays
// ---------------------------------------------------------------------------

function DriveBays({ part, x, y, w, h, fin }: { part: Part; x: number; y: number; w: number; h: number; fin: Finish }) {
  // Internal M.2 / E1.S slots aren't visible on the faceplate.
  const bays = (part.driveBays ?? []).filter((b) => b.size !== 'm2' && b.size !== 'e1s');
  const n = bays.reduce((s, b) => s + b.count, 0);
  if (!n || w < 8 || h < 6) return null;
  const size = bays[0]?.size ?? '3.5';
  const vertical = size !== '3.5' && h >= 70;
  const base =
    size === '3.5'
      ? { w: 101, h: 26 }
      : size === '2.5' || size === 'u2'
        ? vertical
          ? { w: 16, h: 70 }
          : { w: 70, h: 16 }
        : { w: 12, h: 38 };
  const gap = 1;
  const rowsFit = Math.max(1, Math.floor((h + gap) / (base.h + gap)));
  let best = { rows: 1, cols: n, s: 0 };
  const options: { rows: number; cols: number; s: number }[] = [];
  for (let rows = 1; rows <= Math.max(rowsFit, 1) + 1 && rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const needW = cols * base.w + (cols - 1) * gap;
    const needH = rows * base.h + (rows - 1) * gap;
    options.push({ rows, cols, s: Math.min(1, w / needW, h / needH) });
  }
  const maxS = Math.max(...options.map((o) => o.s));
  best = options.find((o) => o.s >= maxS - 0.06) ?? best;
  const { rows, cols, s } = best;
  const bw = base.w * s;
  const bh = base.h * s;
  const totalW = cols * bw + (cols - 1) * gap * s;
  const totalH = rows * bh + (rows - 1) * gap * s;
  const ox = x + (w - totalW) / 2;
  const oy = y + (h - totalH) / 2;
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const bx = ox + c * (bw + gap * s);
    const byy = oy + r * (bh + gap * s);
    const horizontal = bw >= bh;
    out.push(
      <g key={i}>
        <rect x={bx} y={byy} width={bw} height={bh} rx={0.6} fill={fin.bay} stroke={fin.edge} strokeWidth={0.35} />
        {horizontal ? (
          <>
            <rect x={bx + bw * 0.06} y={byy + bh * 0.2} width={bw * 0.5} height={bh * 0.6} fill={fin.edge} opacity={0.35} />
            <rect x={bx + bw * 0.62} y={byy + bh * 0.38} width={bw * 0.3} height={Math.max(0.8, bh * 0.22)} rx={0.4} fill={fin.edge} opacity={0.8} />
            <Led x={bx + bw - 2} y={byy + bh * 0.2 + 0.6} color="#22c55e" r={Math.min(0.8, bh * 0.08)} />
          </>
        ) : (
          <>
            <rect x={bx + bw * 0.2} y={byy + bh * 0.08} width={bw * 0.6} height={bh * 0.55} fill={fin.edge} opacity={0.35} />
            <rect x={bx + bw * 0.3} y={byy + bh * 0.7} width={bw * 0.4} height={bh * 0.2} rx={0.4} fill={fin.edge} opacity={0.8} />
            <Led x={bx + bw / 2} y={byy + bh * 0.04 + 0.8} color="#22c55e" r={Math.min(0.7, bw * 0.08)} />
          </>
        )}
      </g>,
    );
  }
  return <g>{out}</g>;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

interface ContentProps {
  part: Part;
  x: number;
  y: number;
  w: number;
  h: number;
  fin: Finish;
  accent: string;
}

function FrontContent({ style, ...p }: ContentProps & { style: RenderStyle }) {
  switch (style) {
    case 'switch':
    case 'gateway':
      return <SwitchFront {...p} gateway={style === 'gateway'} />;
    case 'server':
    case 'nas':
      return <ServerFront {...p} />;
    case 'patch-panel':
      return <PatchPanelFront {...p} />;
    case 'ups':
      return <UpsFront {...p} />;
    case 'pdu':
      return <PduFront {...p} />;
    case 'vented':
      return <Vents x={p.x + 6} y={p.y + 3} w={p.w - 12} h={p.h - 6} fin={p.fin} />;
    case 'brush':
      return <BrushFront {...p} />;
    case 'cable-manager':
      return <CableManagerFront {...p} />;
    case 'drawer':
      return <DrawerFront {...p} />;
    case 'fan':
      return <FanFront {...p} />;
    case 'desktop':
      return <DesktopFront {...p} />;
    case 'blank':
    case 'shelf':
      return null;
  }
}

function SwitchFront({ part, x, y, w, h, fin, accent, gateway }: ContentProps & { gateway: boolean }) {
  const left = Math.min(gateway ? 64 : 48, w * 0.25);
  const pad = Math.min(4, h * 0.1);
  const textSize = Math.min(3.4, h * 0.15, left / 9);
  return (
    <g>
      <rect x={x + 3} y={y + h - 1.6} width={left - 6} height={0.6} fill={accent} opacity={0.9} />
      <ModelText x={x + 4.5} y={y + pad + textSize} text={part.model} fin={fin} size={textSize} />
      <Led x={x + 5.5} y={y + h - pad - 2.5} color={accent} r={1.1} />
      {gateway && h >= 30 && (
        <g>
          <rect x={x + left - 30} y={y + h * 0.3} width={24} height={Math.min(14, h * 0.42)} rx={1} fill="#0b0f14" stroke={accent} strokeWidth={0.4} />
          <rect x={x + left - 27} y={y + h * 0.3 + 3} width={10} height={1.2} fill={accent} opacity={0.8} />
          <rect x={x + left - 27} y={y + h * 0.3 + 6} width={16} height={1} fill="#94a3b8" opacity={0.6} />
        </g>
      )}
      <PortBlock groups={portGroups(part)} x={x + left} y={y + pad} w={w - left - 5} h={h - pad * 2} fin={fin} align="end" />
    </g>
  );
}

function ServerFront({ part, x, y, w, h, fin, accent }: ContentProps) {
  const hasBays = (part.driveBays ?? []).some((b) => b.size !== 'm2' && b.size !== 'e1s');
  const ctrl = Math.min(22, w * 0.1);
  const right = Math.min(hasBays ? 26 : 40, w * 0.15);
  const pad = Math.min(3, h * 0.08);
  const textSize = Math.min(3.2, h * 0.14);
  return (
    <g>
      <rect x={x + 1.5} y={y + 1.2} width={1} height={h - 2.4} fill={accent} opacity={0.85} />
      <circle cx={x + ctrl / 2 + 1} cy={y + h / 2} r={Math.min(3, h * 0.12)} fill={fin.edge} stroke={fin.dim} strokeWidth={0.4} />
      <Led x={x + ctrl / 2 + 1} y={y + h / 2} color="#22c55e" r={Math.min(1, h * 0.04)} />
      <Led x={x + ctrl / 2 + 1} y={y + h / 2 + Math.min(7, h * 0.28)} color="#3b82f6" r={0.8} />
      {hasBays ? (
        <DriveBays part={part} x={x + ctrl} y={y + pad} w={w - ctrl - right} h={h - pad * 2} fin={fin} />
      ) : (
        <>
          <PortBlock groups={portGroups(part)} x={x + ctrl} y={y + pad + 4} w={(w - ctrl - right) * 0.6} h={h - pad * 2 - 4} fin={fin} />
          <Vents x={x + ctrl + (w - ctrl - right) * 0.62} y={y + pad} w={(w - ctrl - right) * 0.38} h={h - pad * 2} fin={fin} />
        </>
      )}
      <ModelText x={x + w - right + 2} y={y + pad + textSize} text={part.model} fin={fin} size={Math.min(textSize, right / 7)} />
      <Vents x={x + w - right + 2} y={y + pad + textSize + 2} w={right - 4} h={h - pad * 2 - textSize - 3} fin={fin} />
    </g>
  );
}

function PatchPanelFront({ part, x, y, w, h, fin }: ContentProps) {
  const pad = Math.min(3, h * 0.12);
  return <PortBlock groups={portGroups(part)} x={x + 8} y={y + pad} w={w - 16} h={h - pad * 2} fin={fin} />;
}

function UpsFront({ part, x, y, w, h, fin, accent }: ContentProps) {
  const pad = Math.min(5, h * 0.1);
  const dispW = Math.min(46, w * 0.18);
  const dispH = Math.min(18, h * 0.45);
  const dy = y + (h - dispH) / 2;
  return (
    <g>
      <rect x={x + 8} y={dy} width={dispW} height={dispH} rx={1.5} fill="#0d1f14" stroke={fin.edge} strokeWidth={0.6} />
      <text x={x + 8 + dispW / 2} y={dy + dispH / 2 + 2} fontSize={Math.min(5, dispH * 0.4)} fill="#4ade80" textAnchor="middle" fontFamily="ui-monospace, monospace">
        100%
      </text>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={x + 14 + dispW + i * 8} cy={y + h / 2} r={Math.min(2.4, h * 0.1)} fill={fin.edge} stroke={fin.dim} strokeWidth={0.4} />
      ))}
      <Led x={x + 14 + dispW + 24} y={y + h / 2} color={accent} r={1.1} />
      <ModelText x={x + 8} y={y + pad + 3} text={part.model} fin={fin} size={Math.min(3.4, h * 0.12)} />
      <Vents x={x + dispW + 50} y={y + pad} w={w - dispW - 58} h={h - pad * 2} fin={fin} />
      <rect x={x + 2} y={y + h - 2.2} width={w - 4} height={0.8} fill={accent} opacity={0.7} />
    </g>
  );
}

function PduFront({ part, x, y, w, h, fin }: ContentProps) {
  const pad = Math.min(4, h * 0.12);
  const textSize = Math.min(3.2, h * 0.14);
  const labelW = Math.min(40, w * 0.18);
  return (
    <g>
      <ModelText x={x + 4} y={y + h / 2 + textSize / 3} text={part.model} fin={fin} size={textSize} />
      <PortBlock groups={portGroups(part)} x={x + labelW} y={y + pad} w={w - labelW - 22} h={h - pad * 2} fin={fin} />
      <rect x={x + w - 18} y={y + h / 2 - 5} width={12} height={10} rx={1} fill="#7f1d1d" stroke="#450a0a" strokeWidth={0.5} />
      <rect x={x + w - 16} y={y + h / 2 - 3.5} width={8} height={4} rx={0.6} fill="#ef4444" opacity={0.9} />
    </g>
  );
}

function BrushFront({ x, y, w, h, fin }: ContentProps) {
  const sh = Math.max(4, h * 0.42);
  const sy = y + (h - sh) / 2;
  const lines: ReactNode[] = [];
  for (let bx = x + 12; bx < x + w - 12; bx += 1.3) {
    lines.push(<line key={bx} x1={bx} y1={sy} x2={bx + 0.4} y2={sy + sh / 2 - 0.3} stroke="#3f444b" strokeWidth={0.5} />);
    lines.push(<line key={`b${bx}`} x1={bx + 0.4} y1={sy + sh / 2 + 0.3} x2={bx} y2={sy + sh} stroke="#3f444b" strokeWidth={0.5} />);
  }
  return (
    <g>
      <rect x={x + 10} y={sy} width={w - 20} height={sh} rx={sh / 2} fill="#050607" stroke={fin.edge} strokeWidth={0.5} />
      {lines}
    </g>
  );
}

function CableManagerFront({ x, y, w, h, fin }: ContentProps) {
  const n = Math.max(2, Math.min(6, Math.floor(w / 70)));
  const ringW = Math.min(36, w / (n * 1.6));
  const ringH = h * 0.72;
  return (
    <g>
      <rect x={x + 4} y={y + h * 0.42} width={w - 8} height={h * 0.16} fill={fin.edge} opacity={0.4} />
      {Array.from({ length: n }, (_, i) => {
        const cx = x + ((i + 0.5) * w) / n;
        return (
          <path
            key={i}
            d={`M${cx - ringW / 2} ${y + h * 0.14} v${ringH - ringW / 2} a${ringW / 2} ${ringW / 2} 0 0 0 ${ringW} 0 v${-(ringH - ringW / 2)}`}
            fill="none"
            stroke={fin.dim}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function DrawerFront({ x, y, w, h, fin }: ContentProps) {
  return (
    <g>
      <rect x={x + 4} y={y + 2} width={w - 8} height={h - 4} rx={1} fill="none" stroke={fin.edge} strokeWidth={0.6} />
      <rect x={x + w / 2 - 30} y={y + h / 2 - 2} width={60} height={4} rx={2} fill={fin.dim} />
      <circle cx={x + w - 20} cy={y + h / 2} r={2.2} fill="#a1a1aa" stroke={fin.edge} strokeWidth={0.4} />
    </g>
  );
}

function FanFront({ x, y, w, h, fin }: ContentProps) {
  const r = Math.min(h * 0.4, 40);
  const n = Math.max(1, Math.min(6, Math.floor((w - 20) / (r * 2.4))));
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const cx = x + ((i + 0.5) * w) / n;
        const cy = y + h / 2;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill="#0b0c0e" stroke={fin.edge} strokeWidth={0.6} />
            {[0, 1, 2, 3].map((k) => (
              <circle key={k} cx={cx} cy={cy} r={r * (0.25 + k * 0.22)} fill="none" stroke={fin.dim} strokeWidth={0.35} opacity={0.7} />
            ))}
            <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={fin.dim} strokeWidth={0.35} />
            <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={fin.dim} strokeWidth={0.35} />
          </g>
        );
      })}
    </g>
  );
}

function DesktopFront({ part, x, y, w, h, fin, accent }: ContentProps) {
  const textSize = Math.min(3, h * 0.25, w / 14);
  return (
    <g>
      <ModelText x={x + 3} y={y + Math.max(textSize + 1, h * 0.35)} text={part.model} fin={fin} size={textSize} />
      <Led x={x + 4} y={y + h - Math.min(4, h * 0.3)} color={accent} r={Math.min(1, h * 0.08)} />
      <PortBlock groups={portGroups(part)} x={x + w * 0.35} y={y + h * 0.18} w={w * 0.6} h={h * 0.64} fin={fin} align="end" />
    </g>
  );
}

function Shelf({ x, w, h, fin }: { x: number; w: number; h: number; fin: Finish }) {
  const t = Math.min(4, h * 0.12);
  return (
    <g>
      <path d={`M${x} ${h - t - 8} v${8 + t} h${w} v${-(8 + t)}`} fill="none" stroke={fin.ear} strokeWidth={2} />
      <rect x={x} y={h - t} width={w} height={t} fill={fin.body} stroke={fin.edge} strokeWidth={0.4} />
      {Array.from({ length: Math.floor(w / 14) }, (_, i) => (
        <rect key={i} x={x + 6 + i * 14} y={h - t + t * 0.3} width={8} height={t * 0.4} rx={t * 0.2} fill={fin.edge} opacity={0.6} />
      ))}
    </g>
  );
}

/** Generic rear panel for full-depth gear: PSUs, a few ports, fans/vents. */
function RearPanel({ part, x, y, w, h, fin, accent }: ContentProps) {
  const psuCount = part.render.style === 'server' || part.render.style === 'nas' || part.render.style === 'ups' ? 2 : 1;
  const psuW = Math.min(52, w * 0.16);
  const psuH = Math.min(h - 4, 38);
  const pad = Math.min(4, h * 0.1);
  const rj = Math.min(4, (part.ports.rj45_1g ?? 0) + (part.ports.rj45_10g ?? 0) + (part.ports.rj45_2_5g ?? 0));
  const portsW = Math.min(80, w * 0.25);
  return (
    <g>
      <ModelText x={x + 4} y={y + pad + 3} text={`${part.model} — rear`} fin={fin} size={Math.min(3, h * 0.12)} />
      <Vents x={x + 4} y={y + pad + 5} w={w * 0.35} h={h - pad * 2 - 5} fin={fin} />
      {rj > 0 && (
        <PortBlock groups={[{ kind: 'rj45', tints: Array.from({ length: rj }, () => accent) }]} x={x + w * 0.4} y={y + pad} w={portsW} h={h - pad * 2} fin={fin} />
      )}
      {Array.from({ length: psuCount }, (_, i) => {
        const px = x + w - (i + 1) * (psuW + 3);
        const py = y + (h - psuH) / 2;
        const fr = Math.min(psuH, psuW * 0.6) * 0.38;
        return (
          <g key={i}>
            <rect x={px} y={py} width={psuW} height={psuH} rx={1} fill={fin.bay} stroke={fin.edge} strokeWidth={0.5} />
            <circle cx={px + psuW * 0.36} cy={py + psuH / 2} r={fr} fill="#0b0c0e" stroke={fin.dim} strokeWidth={0.4} />
            <rect x={px + psuW * 0.72} y={py + psuH / 2 - 3} width={psuW * 0.2} height={6} rx={0.8} fill="#0b0c0e" />
            <Led x={px + psuW * 0.82} y={py + 3} color="#22c55e" r={0.8} />
          </g>
        );
      })}
    </g>
  );
}
