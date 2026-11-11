/**
 * Device faceplates drawn from catalog data. The layout engine in
 * @rackplanner/shared positions every port, bay, display and vent from the
 * part's declarative layout (or an auto-generated one); this file draws the
 * bezel, ears and shelf around it and picks the level of detail.
 * All units are millimetres; the component draws at the origin.
 *
 * Deliberately generic: plain-text model labels only, no logos or artwork.
 */
import { memo } from 'react';
import { U_MM, resolveFace, type Part, type PortElement, type PortType, type StylePreset } from '@rackplanner/shared';
import { RAIL, type View } from '../rack/geometry';
import { Elements, type DrawCtx, type Lod } from './elements';
import { PRESETS, bezelId, earId } from './presets';

export type { Lod } from './elements';

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export interface FaceplateProps {
  part: Part;
  w: number;
  h: number;
  ears: boolean;
  view: View;
  label?: string | undefined;
  color?: string | undefined;
  lod?: Lod | undefined;
  /** Status LEDs lit (off gives a cleaner print look). */
  leds?: boolean | undefined;
  portColors?: Record<string, string> | undefined;
  /** Hover tooltips on ports. */
  tooltips?: boolean | undefined;
}

/** Detail level for a zoom (CSS px per mm). */
export function lodForScale(pxPerMm: number): Lod {
  return pxPerMm < 0.55 ? 'low' : pxPerMm < 1.5 ? 'mid' : 'high';
}

/** Height of the body actually drawn: desktop gear is often shorter than its U footprint. */
export function bodyHeight(part: Part, h: number): number {
  return part.formFactor === 'desktop' && part.heightMm ? Math.min(h, part.heightMm) : h;
}

const isVented = (part: Part) => /vent/i.test(part.name) || part.tags.includes('vented');

export const Faceplate = memo(function Faceplate({ part, w, h, ears, view, label, color, lod = 'high', leds = true, portColors, tooltips = false }: FaceplateProps) {
  const face = view === 'front' ? 'front' : 'rear';
  const earW = ears ? RAIL : 0;
  const ix = earW;
  const iw = w - earW * 2;

  if (part.render.style === 'shelf') {
    const preset: StylePreset = part.render.preset ?? 'shelf';
    // Device mounts: a faceplate with the device sitting in its opening.
    const plate = part.layout?.front ? resolveFace(part, 'front', iw, h) : null;
    const pt = PRESETS[plate?.preset ?? preset];
    return (
      <g>
        {ears && <Ears w={w} h={h} preset={preset} lod={lod} />}
        {plate ? (
          <>
            <rect x={ix} y={0.3} width={iw} height={h - 0.6} rx={0.8} fill={`url(#${bezelId(plate.preset)})`} stroke={pt.edge} strokeWidth={0.45} />
            {part.shelf && (
              <rect x={ix + (iw - part.shelf.usableWidthMm) / 2 - 1} y={1.2} width={part.shelf.usableWidthMm + 2} height={h - 2.4} rx={1.5} fill="#000" opacity={0.55} />
            )}
            <g transform={`translate(${ix} 0)`}>
              <Elements elements={plate.elements} ctx={{ preset: plate.preset, t: pt, lod, leds, model: part.model, portColors, tooltips }} />
            </g>
          </>
        ) : (
          <Shelf part={part} x={ix} w={iw} h={h} lod={lod} />
        )}
        {color && <rect x={ix} y={h - 6} width={2.4} height={5} fill={color} />}
        {label && <LabelTag x={ix + iw} y={h - 9} text={label} />}
      </g>
    );
  }

  const bodyH = bodyHeight(part, h);
  const by = h - bodyH;
  const resolved = resolveFace(part, face, iw, bodyH);
  const preset = resolved.preset;
  const t = PRESETS[preset];
  const desktop = part.formFactor === 'desktop';
  const radius = desktop ? Math.min(t.radius, bodyH / 4, iw / 8) : 0.8;
  const ctx: DrawCtx = { preset, t, lod, leds, model: part.model, portColors, tooltips };

  return (
    <g>
      {ears && <Ears w={w} h={h} preset={preset} lod={lod} />}
      <rect x={ix} y={by + 0.3} width={iw} height={bodyH - 0.6} rx={radius} fill={`url(#${bezelId(preset)})`} stroke={t.edge} strokeWidth={0.45} />
      {lod !== 'low' && (
        <>
          {/* Bevel: light top edge, dark bottom edge. */}
          <rect x={ix + radius * 0.6 + 0.4} y={by + 0.65} width={Math.max(0, iw - radius * 1.2 - 0.8)} height={0.45} fill={t.highlight} />
          <rect x={ix + radius * 0.6 + 0.4} y={by + bodyH - 1.05} width={Math.max(0, iw - radius * 1.2 - 0.8)} height={0.45} fill="#000" opacity={0.22} />
        </>
      )}
      <g transform={`translate(${ix} ${by})`}>
        <Elements elements={resolved.elements} ctx={ctx} />
      </g>
      {color && <rect x={ix + 0.3} y={by + 0.6} width={2.4} height={bodyH - 1.2} rx={0.4} fill={color} />}
      {label && <LabelTag x={ix + iw} y={by} text={label} />}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Ears, shelf, label tag
// ---------------------------------------------------------------------------

/** Rack holes per U, measured from the top of the U (EIA-310). */
const HOLE_OFFSETS = [6.35, 22.225, 38.1];

function Ears({ w, h, preset, lod }: { w: number; h: number; preset: StylePreset; lod: Lod }) {
  const t = PRESETS[preset];
  const units = Math.max(0.5, Math.round((h / U_MM) * 2) / 2);
  const screws: number[] = [];
  for (let u = 0; u < Math.ceil(units); u++) {
    // One screw per U in the bottom hole; a half-U part uses its single hole.
    const off = units - u < 1 ? HOLE_OFFSETS[0]! : HOLE_OFFSETS[2]!;
    const y = u * U_MM + off;
    if (y < h - 1.5) screws.push(y);
  }
  const holes = lod === 'high' ? screws.map((y) => (y > U_MM * 0.5 ? y - (HOLE_OFFSETS[2]! - HOLE_OFFSETS[0]!) : null)).filter((y): y is number => y !== null && y > 1.5) : [];
  return (
    <g>
      {[0, w - RAIL].map((x) => (
        <g key={x}>
          <rect x={x} y={0.3} width={RAIL} height={h - 0.6} rx={0.8} fill={`url(#${earId(preset)})`} stroke={t.edge} strokeWidth={0.4} />
          {lod !== 'low' && <rect x={x === 0 ? RAIL - 1.2 : w - RAIL + 0.4} y={0.6} width={0.8} height={h - 1.2} fill="#000" opacity={0.18} />}
          {lod !== 'low' &&
            holes.map((y) => <rect key={`h${y}`} x={x + RAIL / 2 - 2.6} y={y - 1.7} width={5.2} height={3.4} rx={1.7} fill="#000" opacity={0.55} />)}
          {lod !== 'low' &&
            screws.map((y) =>
              lod === 'high' ? (
                <use key={y} href={t.light ? '#rp-screw' : '#rp-screw-black'} x={x + RAIL / 2 - 2.4} y={y - 2.4} width={4.8} height={4.8} />
              ) : (
                <circle key={y} cx={x + RAIL / 2} cy={y} r={2.2} fill={t.light ? '#b7bdc4' : '#3a3f45'} />
              ),
            )}
        </g>
      ))}
    </g>
  );
}

function Shelf({ part, x, w, h, lod }: { part: Part; x: number; w: number; h: number; lod: Lod }) {
  const tray = Math.min(4, h * 0.12);
  const usable = part.shelf?.usableWidthMm ?? w;
  const inset = Math.max(0, (w - usable) / 2);
  const lipH = Math.min(9, h * 0.25);
  const vented = isVented(part);
  return (
    <g>
      {/* Side lips bounding the usable width. */}
      {inset > 0.5 && lod !== 'low' && (
        <>
          <rect x={x + inset - 1.6} y={h - tray - lipH} width={1.6} height={lipH} fill="url(#rp-shelf)" />
          <rect x={x + w - inset} y={h - tray - lipH} width={1.6} height={lipH} fill="url(#rp-shelf)" />
        </>
      )}
      {/* Rear support brackets, seen through the opening. */}
      {lod === 'high' && (
        <path d={`M${x + 2} ${h - tray} L${x + 2} ${h - tray - 6} M${x + w - 2} ${h - tray} L${x + w - 2} ${h - tray - 6}`} stroke="#000" strokeOpacity={0.35} strokeWidth={1.2} />
      )}
      <rect x={x} y={h - tray} width={w} height={tray} rx={0.4} fill="url(#rp-shelf)" stroke="#121417" strokeWidth={0.35} />
      {lod !== 'low' && <rect x={x + 0.5} y={h - tray + 0.3} width={w - 1} height={0.35} fill="#fff" opacity={0.18} />}
      {vented && lod === 'high' && (
        <rect x={x + 6} y={h - tray + tray * 0.3} width={w - 12} height={tray * 0.45} fill="url(#rp-vent-slots)" />
      )}
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

// ---------------------------------------------------------------------------
// Port positions (cables, tooltips)
// ---------------------------------------------------------------------------

export interface PortSlot {
  type: PortType;
  index: number;
  /** Back of a pass-through port (patch panel rear). */
  back?: true;
  number: number;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Ports drawn on a faceplate of size w × h (faceplate-local mm) in a view.
 * Only ports with a catalog type (cable targets) are returned.
 */
export function portPositions(part: Part, w: number, h: number, ears: boolean, view: View): PortSlot[] {
  if (part.render.style === 'shelf') return [];
  const earW = ears ? RAIL : 0;
  const bodyH = bodyHeight(part, h);
  const face = resolveFace(part, view === 'front' ? 'front' : 'rear', w - earW * 2, bodyH);
  return face.elements
    .filter((e): e is PortElement & { portType: PortType; index: number } => e.kind === 'port' && e.portType !== undefined && e.index !== undefined)
    .map((p) => ({ type: p.portType, index: p.index, ...(p.back ? { back: true as const } : {}), number: p.number, title: p.title, x: earW + p.x, y: h - bodyH + p.y, w: p.w, h: p.h }));
}
