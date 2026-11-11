/**
 * Draws resolved faceplate elements. Repeated parts are <use> references to
 * the symbols in FaceplateDefs; colours come from the style preset.
 */
import type { ReactNode } from 'react';
import type { BayElement, Connector, FaceElement, FeatureElement, FeatureRegion, PortElement, StylePreset } from '@rackplanner/shared';

type Feat<K extends FeatureElement['kind']> = FeatureElement & { kind: K; region: Extract<FeatureRegion, { type: K }> };
import { LED, PRESETS, trayId, type PresetTokens } from './presets';

export type Lod = 'low' | 'mid' | 'high';

export interface DrawCtx {
  preset: StylePreset;
  t: PresetTokens;
  lod: Lod;
  leds: boolean;
  model: string;
  /** Per-port colour overrides, "portType:index" → colour. */
  portColors?: Record<string, string> | undefined;
  tooltips?: boolean | undefined;
}

const SYMBOL: Partial<Record<Connector, string>> = {
  rj45: 'rp-rj45',
  console: 'rp-rj45',
  sfp: 'rp-sfp',
  sfp_plus: 'rp-sfp',
  sfp28: 'rp-sfp',
  qsfp: 'rp-qsfp',
  qsfp28: 'rp-qsfp',
  keystone: 'rp-keystone',
  coupler: 'rp-keystone',
  punchdown: 'rp-punchdown',
  usb_a: 'rp-usb-a',
  usb_c: 'rp-usb-c',
  micro_usb: 'rp-micro-usb',
  hdmi: 'rp-hdmi',
  micro_hdmi: 'rp-micro-hdmi',
  displayport: 'rp-dp',
  vga: 'rp-dsub15',
  serial: 'rp-dsub9',
  iec_c13: 'rp-c13',
  iec_c19: 'rp-c19',
  iec_c14: 'rp-c14',
  iec_c20: 'rp-c20',
  iec_c8: 'rp-c8',
  iec_c6: 'rp-c6',
  dc_barrel: 'rp-dc',
  outlet_au: 'rp-au',
  outlet_nema: 'rp-nema',
  outlet_schuko: 'rp-schuko',
  outlet_uk: 'rp-uk',
  lc: 'rp-lc',
  sc: 'rp-sc',
  audio: 'rp-audio',
  microsd: 'rp-microsd',
};

/** Deterministic "lit" pattern so a rack looks alive but renders the same every time. */
function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 13;
  return x % 100;
}

function portColor(p: PortElement, ctx: DrawCtx): string {
  if (p.portType && p.index !== undefined && !p.back) {
    const over = ctx.portColors?.[`${p.portType}:${p.index}`];
    if (over) return over;
  }
  if (p.color) return p.color;
  switch (p.connector) {
    case 'keystone':
    case 'coupler':
      return ctx.t.keystone;
    case 'lc':
      return '#38bdf8';
    case 'sc':
      return '#2563eb';
    case 'usb_a':
      return '#111827';
    case 'usb_c':
    case 'hdmi':
    case 'displayport':
      return '#111827';
    case 'console':
      return ctx.t.light ? '#7dd3fc' : '#3b82f6';
    default:
      return p.uplink && p.connector === 'rj45' ? (ctx.t.light ? '#9fb4c8' : '#40546a') : ctx.t.jack;
  }
}

function PortLeds({ p, ctx }: { p: PortElement; ctx: DrawCtx }) {
  if (ctx.lod === 'low') return null;
  const s = p.w / 13.6;
  const y = p.latch === 'bottom' ? p.y + 9.4 * s : p.y + 1.2 * s;
  // Flip the LED row with the latch: LEDs sit beside the latch notch.
  const ly = p.latch === 'bottom' ? y : p.y + p.h - 2.2 * s;
  const off = ctx.t.light ? LED.offLight : LED.off;
  const h = hash(p.number + (p.portType?.length ?? 0) * 31);
  const link = ctx.leds && (p.uplink || h < 72);
  const act = ctx.leds && link && h % 3 === 0;
  const w = 1.9 * s;
  const hh = 1.05 * s;
  return (
    <g>
      <rect x={p.x + 0.55 * s} y={ly} width={w} height={hh} rx={0.25 * s} fill={link ? LED.link : off} />
      <rect x={p.x + p.w - 0.55 * s - w} y={ly} width={w} height={hh} rx={0.25 * s} fill={act ? LED.activity : off} />
      {ctx.lod === 'high' && link && (
        <circle cx={p.x + 0.55 * s + w / 2} cy={ly + hh / 2} r={1.5 * s} fill={LED.link} opacity={0.22} />
      )}
    </g>
  );
}

export function Port({ p, ctx }: { p: PortElement; ctx: DrawCtx }) {
  const color = portColor(p, ctx);
  if (ctx.lod === 'low') {
    return <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={p.connector.startsWith('sfp') || p.connector.startsWith('qsfp') ? '#9aa1a8' : '#0b0d10'} />;
  }
  const id = SYMBOL[p.connector];
  // Symbols are drawn latch-down; top-row ports are mirrored vertically.
  const flip = p.latch === 'top' && (p.connector === 'rj45' || p.connector === 'console' || p.connector.startsWith('sfp') || p.connector.startsWith('qsfp'));
  const use = id ? (
    <use
      href={`#${id}`}
      x={flip ? undefined : p.x}
      y={flip ? undefined : p.y}
      width={p.w}
      height={p.h}
      color={color}
      transform={flip ? `translate(${p.x} ${p.y + p.h}) scale(1 -1)` : undefined}
    />
  ) : (
    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={0.4} fill="#0b0d10" />
  );
  const isRj = p.connector === 'rj45';
  const isCage = p.connector.startsWith('sfp') || p.connector.startsWith('qsfp');
  const numberY = p.latch === 'top' ? p.y - 0.7 : p.y + p.h + 2.3;
  return (
    <g>
      {ctx.tooltips && <title>{p.title}</title>}
      {use}
      {isRj && <PortLeds p={p} ctx={ctx} />}
      {isCage && ctx.lod === 'high' && (
        <rect x={p.x + p.w - 2.4} y={p.latch === 'top' ? p.y + p.h - 0.9 : p.y + 0.15} width={1.8} height={0.7} fill={ctx.leds ? LED.link : LED.off} />
      )}
      {p.poe && (
        <path
          d={`M${p.x + p.w / 2 - 1.1} ${p.latch === 'top' ? p.y - 0.15 : p.y + p.h + 0.15} l1.1 ${p.latch === 'top' ? -1.4 : 1.4} l1.1 ${p.latch === 'top' ? 1.4 : -1.4} z`}
          fill={LED.poe}
        />
      )}
      {p.uplink && isRj && ctx.lod === 'high' && (
        <rect x={p.x - 0.35} y={p.y - 0.35} width={p.w + 0.7} height={p.h + 0.7} rx={0.7} fill="none" stroke={ctx.t.accent} strokeWidth={0.35} opacity={0.9} />
      )}
      {p.showNumber && ctx.lod === 'high' && (
        <text x={p.x + p.w / 2} y={p.latch === 'top' && !isRj ? numberY : p.y - 0.8} fontSize={2.3} textAnchor="middle" fill={ctx.t.textDim} fontFamily={ctx.t.font} fontWeight={600}>
          {p.number}
        </text>
      )}
    </g>
  );
}

export function Bay({ b, ctx }: { b: BayElement; ctx: DrawCtx }) {
  if (ctx.lod === 'low') return <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={ctx.t.tray[1]} />;
  const v = b.vertical;
  const tray = `url(#${trayId(ctx.preset)})`;
  const led = ctx.leds ? (hash(b.number + 7) < 80 ? LED.link : LED.off) : LED.off;
  const handle = v
    ? { x: b.x + b.w * 0.15, y: b.y + b.h * 0.72, w: b.w * 0.7, h: b.h * 0.22 }
    : { x: b.x + b.w * 0.66, y: b.y + b.h * 0.15, w: b.w * 0.3, h: b.h * 0.7 };
  const vent = v ? { x: b.x + b.w * 0.18, y: b.y + b.h * 0.08, w: b.w * 0.64, h: b.h * 0.58 } : { x: b.x + b.w * 0.05, y: b.y + b.h * 0.18, w: b.w * 0.56, h: b.h * 0.64 };
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={0.6} fill="#06070800" stroke="#000" strokeOpacity={0.6} strokeWidth={0.5} />
      <rect x={b.x + 0.25} y={b.y + 0.25} width={b.w - 0.5} height={b.h - 0.5} rx={0.5} fill={tray} />
      {ctx.lod === 'high' && <rect x={vent.x} y={vent.y} width={vent.w} height={vent.h} fill="url(#rp-vent-honeycomb)" opacity={0.85} />}
      <rect x={handle.x} y={handle.y} width={handle.w} height={handle.h} rx={0.6} fill={ctx.t.light ? '#8d949b' : '#4a5058'} stroke="#000" strokeOpacity={0.35} strokeWidth={0.25} />
      {ctx.lod === 'high' && (
        <rect
          x={v ? handle.x + handle.w * 0.35 : handle.x + handle.w * 0.08}
          y={v ? handle.y + handle.h * 0.2 : handle.y + handle.h * 0.35}
          width={v ? handle.w * 0.3 : handle.w * 0.18}
          height={v ? handle.h * 0.6 : handle.h * 0.3}
          rx={0.3}
          fill={ctx.t.accent}
          opacity={0.9}
        />
      )}
      <circle cx={v ? b.x + b.w / 2 : b.x + b.w - 1.6} cy={v ? b.y + 1.4 : b.y + 1.6} r={Math.min(0.7, b.w * 0.06, b.h * 0.08)} fill={led} />
    </g>
  );
}

function Fan({ cx, cy, r, lod }: { cx: number; cy: number; r: number; lod: Lod }) {
  if (lod === 'low') return <circle cx={cx} cy={cy} r={r} fill="#0a0b0c" />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="url(#rp-fan)" stroke="#3a3f45" strokeWidth={0.4} />
      {lod === 'high' &&
        [0, 1, 2, 3, 4].map((k) => {
          const a = (k * 2 * Math.PI) / 5;
          const x1 = cx + Math.cos(a) * r * 0.25;
          const y1 = cy + Math.sin(a) * r * 0.25;
          const x2 = cx + Math.cos(a + 0.9) * r * 0.85;
          const y2 = cy + Math.sin(a + 0.9) * r * 0.85;
          return <path key={k} d={`M${x1} ${y1} Q${cx + Math.cos(a + 0.2) * r * 0.75} ${cy + Math.sin(a + 0.2) * r * 0.75} ${x2} ${y2}`} stroke="#2f3439" strokeWidth={r * 0.18} fill="none" strokeLinecap="round" />;
        })}
      {[0.45, 0.72, 0.95].map((k) => (
        <circle key={k} cx={cx} cy={cy} r={r * k} fill="none" stroke="#7b838b" strokeWidth={0.3} opacity={0.75} />
      ))}
      <path d={`M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}`} stroke="#7b838b" strokeWidth={0.3} opacity={0.75} />
      <circle cx={cx} cy={cy} r={r * 0.22} fill="#3a3f45" />
    </g>
  );
}

function Display({ e, ctx }: { e: Feat<'display'>; ctx: DrawCtx }) {
  const { x, y, w, h } = e;
  const r = Math.min(1.2, h * 0.15);
  if (ctx.lod === 'low') return <rect x={x} y={y} width={w} height={h} rx={r} fill="#0b0f14" />;
  const touch = e.region.variant === 'touch';
  const ix = x + w * 0.08;
  const iw = w * 0.84;
  const lineH = h * 0.1;
  return (
    <g>
      <rect x={x - 0.4} y={y - 0.4} width={w + 0.8} height={h + 0.8} rx={r + 0.4} fill="#000" opacity={0.5} />
      <rect x={x} y={y} width={w} height={h} rx={r} fill="url(#rp-screen)" />
      {ctx.leds && e.region.variant !== 'segment' && (
        <g>
          <rect x={ix} y={y + h * 0.16} width={iw * 0.45} height={lineH} rx={lineH / 2} fill={ctx.t.accent} opacity={0.9} />
          <rect x={ix} y={y + h * 0.38} width={iw * 0.8} height={lineH * 0.7} rx={lineH * 0.35} fill="#cbd5e1" opacity={0.55} />
          <rect x={ix} y={y + h * 0.54} width={iw * 0.6} height={lineH * 0.7} rx={lineH * 0.35} fill="#cbd5e1" opacity={0.4} />
          {ctx.lod === 'high' && (
            <path
              d={`M${ix} ${y + h * 0.86} L${ix + iw * 0.2} ${y + h * 0.76} L${ix + iw * 0.4} ${y + h * 0.82} L${ix + iw * 0.6} ${y + h * 0.7} L${ix + iw * 0.8} ${y + h * 0.78} L${ix + iw} ${y + h * 0.72}`}
              stroke="#22c55e"
              strokeWidth={Math.max(0.2, h * 0.025)}
              fill="none"
              opacity={0.85}
            />
          )}
          {touch && ctx.lod === 'high' && <circle cx={x + w * 0.88} cy={y + h * 0.2} r={h * 0.06} fill="#e2e8f0" opacity={0.6} />}
        </g>
      )}
      {ctx.leds && e.region.variant === 'segment' && (
        <text x={x + w / 2} y={y + h * 0.68} fontSize={h * 0.48} textAnchor="middle" fill="#4ade80" fontFamily="ui-monospace, monospace">
          100%
        </text>
      )}
      {ctx.lod === 'high' && <rect x={x + w * 0.06} y={y + h * 0.06} width={w * 0.5} height={h * 0.1} rx={h * 0.05} fill="#fff" opacity={0.05} />}
    </g>
  );
}

function Psu({ e, ctx }: { e: Feat<'psu'>; ctx: DrawCtx }) {
  const n = e.region.count;
  const gap = 2;
  const mw = (e.w - gap * (n - 1)) / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const x = e.x + i * (mw + gap);
        const { y, h } = e;
        const fr = Math.min(h * 0.36, mw * 0.2);
        const inletW = Math.min(mw * 0.3, 27 * (h * 0.55) / 19.5);
        const inletH = inletW * (19.5 / 27);
        return (
          <g key={i}>
            <rect x={x} y={y} width={mw} height={h} rx={0.8} fill={ctx.t.tray[1]} stroke="#000" strokeOpacity={0.6} strokeWidth={0.4} />
            {ctx.lod !== 'low' && (
              <>
                <Fan cx={x + mw * 0.22} cy={y + h / 2} r={fr} lod={ctx.lod} />
                <use href={e.region.inlet === 'iec_c20' ? '#rp-c20' : '#rp-c14'} x={x + mw * 0.45} y={y + (h - inletH) / 2} width={inletW} height={inletH} />
                <path d={`M${x + mw - 4} ${y + h * 0.18} h2 v${h * 0.64} h-2`} stroke="#8d949b" strokeWidth={1} fill="none" strokeLinejoin="round" />
                <circle cx={x + mw * 0.85} cy={y + h * 0.22} r={0.75} fill={ctx.leds ? LED.power : LED.off} />
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

function feature(e: FeatureElement, ctx: DrawCtx): ReactNode {
  const { x, y, w, h } = e;
  const t = ctx.t;
  switch (e.kind) {
    case 'display':
      return <Display e={e as Feat<'display'>} ctx={ctx} />;
    case 'vent': {
      const pattern = (e.region as { pattern?: string }).pattern ?? t.vent;
      return <rect x={x} y={y} width={w} height={h} fill={ctx.lod === 'low' ? 'rgba(0,0,0,0.25)' : `url(#rp-vent-${pattern})`} />;
    }
    case 'leds': {
      const r = e.region as Extract<FeatureElement['region'], { type: 'leds' }>;
      const step = w / r.count;
      const rad = Math.min(0.9, h / 2.5, step / 3);
      return (
        <g>
          {Array.from({ length: r.count }, (_, i) => {
            const c = r.colors?.[i] ?? (i === 0 ? t.accent : LED.link);
            const on = ctx.leds;
            return (
              <g key={i}>
                <circle cx={x + step * (i + 0.5)} cy={y + h / 2} r={rad} fill={on ? c : t.light ? LED.offLight : LED.off} />
                {on && ctx.lod === 'high' && <circle cx={x + step * (i + 0.5)} cy={y + h / 2} r={rad * 2.2} fill={c} opacity={0.18} />}
              </g>
            );
          })}
        </g>
      );
    }
    case 'ledbar': {
      const c = (e.region as { color?: string }).color ?? t.accent;
      return (
        <g>
          {ctx.leds && ctx.lod === 'high' && <rect x={x - 0.6} y={y - 0.6} width={w + 1.2} height={h + 1.2} rx={(h + 1.2) / 2} fill={c} opacity={0.2} />}
          <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={ctx.leds ? c : t.light ? LED.offLight : LED.off} />
        </g>
      );
    }
    case 'button': {
      const kind = (e.region as { kind?: string }).kind;
      const r = Math.min(w, h) / 2;
      const cx = x + w / 2;
      const cy = y + h / 2;
      if (kind === 'pinhole') return <circle cx={cx} cy={cy} r={Math.min(0.7, r)} fill="#000" opacity={0.75} />;
      if (kind === 'reset') return <rect x={cx - r * 0.6} y={cy - r * 0.6} width={r * 1.2} height={r * 1.2} rx={0.3} fill="#0b0d10" stroke={t.edge} strokeWidth={0.3} />;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={t.light ? '#d5dade' : '#202328'} stroke="#000" strokeOpacity={0.5} strokeWidth={0.35} />
          {kind === 'power' && ctx.lod !== 'low' && (
            <path
              d={`M${cx - r * 0.38} ${cy - r * 0.3} a${r * 0.5} ${r * 0.5} 0 1 0 ${r * 0.76} 0 M${cx} ${cy - r * 0.55} v${r * 0.5}`}
              stroke={ctx.leds ? LED.status : t.textDim}
              strokeWidth={Math.max(0.25, r * 0.14)}
              fill="none"
              strokeLinecap="round"
            />
          )}
        </g>
      );
    }
    case 'label': {
      const r = e.region as { text?: string; size?: number; color?: string };
      const text = r.text ?? ctx.model;
      const size = Math.min(r.size ?? 3.4, h / 1.3, Math.max(1.6, (w / Math.max(1, text.length)) * 1.6));
      if (ctx.lod === 'low' && size < 2.5) return null;
      return (
        <text x={x} y={y + size} fontSize={size} fill={r.color ?? t.text} fontFamily={t.font} fontWeight={t.fontWeight} letterSpacing={0.08}>
          {text}
        </text>
      );
    }
    case 'psu':
      return <Psu e={e as Feat<'psu'>} ctx={ctx} />;
    case 'fan': {
      const n = (e.region as { count: number }).count;
      const d = Math.min(h, (w - 2 * (n - 1)) / n);
      const gap = n > 1 ? (w - d * n) / (n - 1) : 0;
      return (
        <g>
          {Array.from({ length: n }, (_, i) => (
            <Fan key={i} cx={x + d / 2 + i * (d + gap)} cy={y + h / 2} r={d / 2 - 0.3} lod={ctx.lod} />
          ))}
        </g>
      );
    }
    case 'pcie': {
      const n = (e.region as { count: number }).count;
      const sw = w / n;
      return (
        <g>
          {Array.from({ length: n }, (_, i) => (
            <g key={i}>
              <rect x={x + i * sw + 0.6} y={y} width={sw - 1.2} height={h} rx={0.4} fill="url(#rp-metal-dark)" stroke="#000" strokeOpacity={0.5} strokeWidth={0.3} />
              {ctx.lod === 'high' && <rect x={x + i * sw + sw * 0.3} y={y + h * 0.1} width={sw * 0.4} height={h * 0.75} fill="url(#rp-vent-slots)" />}
              <circle cx={x + i * sw + sw / 2} cy={y + 1.6} r={0.9} fill="url(#rp-screw)" />
            </g>
          ))}
        </g>
      );
    }
    case 'io_shield':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={0.5} fill="url(#rp-metal)" stroke="#5b6168" strokeWidth={0.3} />
          {ctx.lod !== 'low' && <rect x={x + w * 0.05} y={y + h * 0.2} width={w * 0.9} height={h * 0.6} fill="url(#rp-vent-mesh)" opacity={0.6} />}
        </g>
      );
    case 'ground': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={0.6} fill="url(#rp-metal)" stroke="#5b6168" strokeWidth={0.25} />
          {ctx.lod === 'high' && <path d={`M${cx} ${cy - 2} v2 M${cx - 1.8} ${cy} h3.6 M${cx - 1.2} ${cy + 0.9} h2.4 M${cx - 0.6} ${cy + 1.8} h1.2`} stroke="#3f444a" strokeWidth={0.35} />}
        </g>
      );
    }
    case 'label_strip':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={0.4} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.25} />
          {ctx.lod === 'high' && <rect x={x} y={y} width={w} height={h} fill="none" stroke="#cbd5e1" strokeWidth={0.2} strokeDasharray="0.6 14.2" />}
        </g>
      );
    case 'cable_bar':
      return (
        <g>
          <rect x={x} y={y + h * 0.3} width={w} height={h * 0.4} rx={h * 0.2} fill="url(#rp-metal)" stroke="#5b6168" strokeWidth={0.25} />
          {[0.02, 0.98].map((k) => (
            <rect key={k} x={x + w * k - 1.2} y={y} width={2.4} height={h} rx={0.4} fill="url(#rp-metal-dark)" />
          ))}
        </g>
      );
    case 'brush':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={Math.min(h / 2, 2.5)} fill="#050607" stroke="#000" strokeWidth={0.4} />
          {ctx.lod !== 'low' && <rect x={x + 1} y={y} width={w - 2} height={h} fill="url(#rp-brush)" />}
          <rect x={x} y={y + h / 2 - 0.25} width={w} height={0.5} fill="#000" />
        </g>
      );
    case 'handle':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.3} fill="none" stroke={t.light ? '#7b828a' : '#9aa1a8'} strokeWidth={Math.max(1, Math.min(w, h) * 0.18)} />
        </g>
      );
    case 'thumbscrew': {
      const r = Math.min(w, h) / 2;
      return (
        <g>
          <circle cx={x + w / 2} cy={y + h / 2} r={r} fill="url(#rp-screw)" stroke="#4b5157" strokeWidth={0.3} />
          {ctx.lod === 'high' && <circle cx={x + w / 2} cy={y + h / 2} r={r * 0.8} fill="none" stroke="#6b7279" strokeWidth={0.5} strokeDasharray="0.4 0.4" />}
        </g>
      );
    }
    case 'switch': {
      const r = e.region as { count: number; variant?: string };
      const sw = w / r.count;
      return (
        <g>
          {Array.from({ length: r.count }, (_, i) =>
            r.variant === 'toggle' ? (
              <g key={i}>
                <rect x={x + i * sw + sw * 0.25} y={y + h * 0.25} width={sw * 0.5} height={h * 0.5} rx={0.6} fill="#1b1e22" stroke="#4b5157" strokeWidth={0.25} />
                <rect x={x + i * sw + sw * 0.4} y={y + h * 0.18} width={sw * 0.2} height={h * 0.38} rx={0.4} fill="url(#rp-metal)" />
              </g>
            ) : (
              <g key={i}>
                <rect x={x + i * sw + 0.6} y={y} width={sw - 1.2} height={h} rx={1} fill="#111316" stroke="#3f444a" strokeWidth={0.35} />
                <rect x={x + i * sw + 1.6} y={y + 1} width={sw - 3.2} height={h - 2} rx={0.7} fill={ctx.leds ? '#ef4444' : '#7f1d1d'} />
                {ctx.leds && ctx.lod === 'high' && <rect x={x + i * sw + 1.6} y={y + 1} width={sw - 3.2} height={(h - 2) / 2} rx={0.7} fill="#fff" opacity={0.18} />}
              </g>
            ),
          )}
        </g>
      );
    }
    case 'breaker':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={1} fill="#16181b" stroke="#3f444a" strokeWidth={0.35} />
          <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.3} fill="#2a2e33" stroke="#000" strokeWidth={0.3} />
        </g>
      );
    case 'slot':
      return <rect x={x} y={y} width={w} height={h} rx={Math.min(0.5, h / 2)} fill="#050607" />;
    case 'd_ring': {
      const n = (e.region as { count: number }).count;
      const ringH = h * 0.78;
      const rw = Math.max(2, Math.min(w / n - 4, 28, ringH));
      const straight = Math.max(0, ringH - rw / 2);
      return (
        <g>
          <rect x={x} y={y + h * 0.42} width={w} height={h * 0.16} fill="#000" opacity={0.25} />
          {Array.from({ length: n }, (_, i) => {
            const cx = x + ((i + 0.5) * w) / n;
            return (
              <path
                key={i}
                d={`M${cx - rw / 2} ${y + h * 0.1} v${straight} a${rw / 2} ${rw / 2} 0 0 0 ${rw} 0 v${-straight}`}
                fill="none"
                stroke={t.light ? '#6b7280' : '#9aa1a8'}
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      );
    }
    case 'panel': {
      const r = e.region as { color?: string; radius?: number };
      return <rect x={x} y={y} width={w} height={h} rx={r.radius ?? 1} fill={r.color ?? t.bezel[0]} />;
    }
  }
}

/** Ports drawn as bars for zoomed-out views: one bar per row of a port block. */
function portBars(ports: PortElement[]): ReactNode[] {
  const rows = new Map<string, { x0: number; x1: number; y: number; h: number; cage: boolean }>();
  for (const p of ports) {
    const key = `${p.connector}:${Math.round(p.y * 4)}`;
    const r = rows.get(key);
    if (r) {
      r.x0 = Math.min(r.x0, p.x);
      r.x1 = Math.max(r.x1, p.x + p.w);
    } else rows.set(key, { x0: p.x, x1: p.x + p.w, y: p.y, h: p.h, cage: p.connector.startsWith('sfp') || p.connector.startsWith('qsfp') });
  }
  return [...rows.values()].map((r, i) => <rect key={`bar${i}`} x={r.x0} y={r.y} width={r.x1 - r.x0} height={r.h} rx={0.6} fill={r.cage ? '#9aa1a8' : '#0b0d10'} opacity={0.9} />);
}

export function Elements({ elements, ctx }: { elements: FaceElement[]; ctx: DrawCtx }) {
  // Backgrounds first, then everything else, labels last.
  const order = (e: FaceElement) => (e.kind === 'panel' ? 0 : e.kind === 'label' ? 2 : 1);
  const sorted = [...elements].sort((a, b) => order(a) - order(b));
  const nodes: ReactNode[] = [];
  if (ctx.lod === 'low') {
    nodes.push(...portBars(sorted.filter((e): e is PortElement => e.kind === 'port')));
  }
  sorted.forEach((e, i) => {
    if (e.kind === 'port') {
      if (ctx.lod !== 'low') nodes.push(<Port key={i} p={e} ctx={ctx} />);
    } else if (e.kind === 'bay') nodes.push(<Bay key={i} b={e} ctx={ctx} />);
    else nodes.push(<g key={i}>{feature(e, ctx)}</g>);
  });
  return <>{nodes}</>;
}

export { PRESETS };
