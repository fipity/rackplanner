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
import { U_MM, resolveFace, uprightPart, type Occupancy, type Part, type PortElement, type PortType, type StylePreset } from '@rackplanner/shared';
import { RAIL, faceSeen, type View } from '../rack/geometry';
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
  /** 3D-printed parts: filament colour (defaults to the part's). */
  filament?: string | undefined;
}

/** Detail level for a zoom (CSS px per mm). */
export function lodForScale(pxPerMm: number): Lod {
  return pxPerMm < 0.55 ? 'low' : pxPerMm < 1.5 ? 'mid' : 'high';
}

/** Height of the body actually drawn: desktop gear is often shorter than its U footprint. */
export function bodyHeight(part: Part, h: number): number {
  return part.formFactor !== 'rack' && part.heightMm ? Math.min(h, part.heightMm) : h;
}

const isVented = (part: Part) => /vent/i.test(part.name) || part.tags.includes('vented');

/**
 * Where the upright face lands when a device lies on its side. The upright
 * face (uw wide × uh tall) fills the turned body (uh wide × uw tall) at
 * (ix, by). From the front the device turns clockwise (its top goes right);
 * seen from behind, the same turn is anticlockwise.
 */
function turnTransform(view: View, uw: number, uh: number, ix: number, by: number): string {
  return view === 'front' ? `translate(${ix + uh} ${by}) rotate(90)` : `translate(${ix} ${by + uw}) rotate(-90)`;
}

export const Faceplate = memo(function Faceplate({ part, w, h, ears, view, label, color, lod = 'high', leds = true, portColors, tooltips = false, filament }: FaceplateProps) {
  const face = view === 'front' ? 'front' : 'rear';
  const earW = ears ? RAIL : 0;
  if (part.printed) return <PrintedFace part={part} w={w} h={h} ears={ears} view={view} lod={lod} label={label} color={color} filament={filament ?? part.printed.filament} />;

  const upright = uprightPart(part);
  if (upright) {
    // On its side: draw the upright faceplate, rotated. Tags stay level.
    const iw = w - earW * 2;
    const bodyH = bodyHeight(part, h);
    const by = h - bodyH;
    return (
      <g>
        <g transform={turnTransform(view, bodyH, iw, earW, by)}>
          <Faceplate part={upright} w={bodyH} h={iw} ears={false} view={view} lod={lod} leds={leds} portColors={portColors} tooltips={tooltips} />
        </g>
        {color && <rect x={earW + 0.3} y={by + 0.6} width={2.4} height={bodyH - 1.2} rx={0.4} fill={color} />}
        {label && <LabelTag x={earW + iw} y={by} text={label} />}
      </g>
    );
  }
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
  const desktop = part.formFactor !== 'rack';
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
// 3D-printed parts
// ---------------------------------------------------------------------------

/** Relative luminance (0 dark … 1 light) of a #rrggbb colour. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/**
 * A 3D-printed part: one matte piece in the filament colour with the rack
 * ears printed on (round screw holes), faint layer lines up close, and a
 * cutout for the device a mount holds (the device is drawn in it by RackView).
 */
function PrintedFace({ part, w, h, ears, view, lod, label, color, filament }: { part: Part; w: number; h: number; ears: boolean; view: View; lod: Lod; label?: string | undefined; color?: string | undefined; filament: string }) {
  const kind = part.printed!.kind;
  const earW = ears ? RAIL : 0;
  const ix = earW;
  const iw = w - earW * 2;
  const light = luminance(filament) > 0.45;
  const edge = light ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.6)';
  const hole = light ? '#2b2b2b' : '#050505';
  const front = view === 'front';
  const units = Math.max(0.5, Math.round((h / U_MM) * 2) / 2);
  const holeYs: number[] = [];
  for (let u = 0; u < Math.ceil(units); u++) for (const off of HOLE_OFFSETS) if (u * U_MM + off < h - 2) holeYs.push(u * U_MM + off);
  const screwYs = holeYs.filter((_, i) => i % 3 === 1 || holeYs.length < 3);
  const rim = 1.5;
  const opening = part.shelf ? Math.min(iw - 4, part.shelf.usableWidthMm + 2) : 0;
  return (
    <g>
      <title>3D printed: {part.name}</title>
      <rect x={0.2} y={0.3} width={w - 0.4} height={h - 0.6} rx={ears ? 1.6 : 1} fill={filament} stroke={edge} strokeWidth={0.45} />
      <rect x={0.2} y={0.3} width={w - 0.4} height={h - 0.6} rx={ears ? 1.6 : 1} fill="url(#rp-print-matte)" />
      {lod === 'high' && <rect x={0.6} y={0.7} width={w - 1.2} height={h - 1.4} fill="url(#rp-layer-lines)" />}
      {ears && lod !== 'low' && (
        <>
          {/* Where the ears meet the faceplate. */}
          <rect x={RAIL - 0.4} y={0.8} width={0.4} height={h - 1.6} fill="#000" opacity={0.18} />
          <rect x={w - RAIL} y={0.8} width={0.4} height={h - 1.6} fill="#000" opacity={0.18} />
          {[RAIL / 2, w - RAIL / 2].map((cx) => (
            <g key={cx}>
              {holeYs.map((y) => (
                <circle key={y} cx={cx} cy={y} r={2.5} fill={hole} opacity={screwYs.includes(y) ? 1 : 0.85} />
              ))}
              {lod === 'high' && front && screwYs.map((y) => <use key={`s${y}`} href="#rp-screw-black" x={cx - 2.3} y={y - 2.3} width={4.6} height={4.6} />)}
            </g>
          ))}
        </>
      )}
      {part.shelf && opening > 2 && (
        <g>
          <rect x={ix + (iw - opening) / 2} y={rim} width={opening} height={h - rim * 2} rx={1.2} fill="#070707" opacity={0.92} stroke={light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.16)'} strokeWidth={0.5} />
          {lod !== 'low' && <rect x={ix + (iw - opening) / 2} y={rim} width={opening} height={0.6} fill="#000" opacity={0.6} />}
        </g>
      )}
      {kind === 'patch-panel' && lod !== 'low' && (
        <g>
          {(() => {
            const n = Math.max(1, Math.floor((iw - 16) / 17));
            const gap = (iw - n * 14.5) / (n + 1);
            const kh = Math.min(17, h - 8);
            return Array.from({ length: n }, (_, i) => <rect key={i} x={ix + gap + i * (14.5 + gap)} y={(h - kh) / 2} width={14.5} height={kh} rx={0.8} fill={hole} />);
          })()}
        </g>
      )}
      {kind === 'cable-management' && lod !== 'low' && (
        <g>
          <rect x={ix + 8} y={h * 0.32} width={iw - 16} height={h * 0.36} rx={h * 0.18} fill={hole} />
          {lod === 'high' &&
            (() => {
              const n = Math.max(2, Math.floor((iw - 16) / 18));
              return Array.from({ length: n }, (_, i) => <rect key={i} x={ix + 8 + ((i + 0.5) * (iw - 16)) / n - 1} y={h * 0.32} width={2} height={h * 0.18} fill={filament} />);
            })()}
        </g>
      )}
      {lod !== 'low' && front && (
        <g transform={`translate(${ix + 2} ${Math.min(2, h * 0.08)})`} aria-label="3D printed">
          <rect width={6.2} height={6.2} rx={1.2} fill="#fff" opacity={0.88} />
          <use href="#rp-printer" x={0.85} y={0.85} width={4.5} height={4.5} color="#111827" />
        </g>
      )}
      {color && <rect x={ix + 0.3} y={h - 6} width={2.4} height={5} fill={color} />}
      {label && <LabelTag x={ix + iw} y={0} text={label} />}
    </g>
  );
}

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
const wallFaces = new WeakMap<Part, View>();

/**
 * The face drawn for a device on the wall: whichever face has its ports
 * (the rear for nbn boxes, the front for wall plates), in both views.
 */
export function wallFace(part: Part): View {
  const hit = wallFaces.get(part);
  if (hit) return hit;
  const face: View = portPositions(part, 100, 100, false, 'rear').length > portPositions(part, 100, 100, false, 'front').length ? 'rear' : 'front';
  wallFaces.set(part, face);
  return face;
}

/** Face of a placement seen from `view`. */
export function faceFor(occ: Occupancy, part: Part, view: View): View {
  return occ.wall ? wallFace(part) : faceSeen(occ.faces, view);
}

export function portPositions(part: Part, w: number, h: number, ears: boolean, view: View): PortSlot[] {
  if (part.render.style === 'shelf') return [];
  const earW = ears ? RAIL : 0;
  const upright = uprightPart(part);
  if (upright) {
    // Same rotation as the drawing (see turnTransform).
    const iw = w - earW * 2;
    const bodyH = bodyHeight(part, h);
    const by = h - bodyH;
    return portPositions(upright, bodyH, iw, false, view).map((s) =>
      view === 'front'
        ? { ...s, x: earW + iw - (s.y + s.h), y: by + s.x, w: s.h, h: s.w }
        : { ...s, x: earW + s.y, y: by + bodyH - (s.x + s.w), w: s.h, h: s.w },
    );
  }
  const bodyH = bodyHeight(part, h);
  const face = resolveFace(part, view === 'front' ? 'front' : 'rear', w - earW * 2, bodyH);
  return face.elements
    .filter((e): e is PortElement & { portType: PortType; index: number } => e.kind === 'port' && e.portType !== undefined && e.index !== undefined)
    .map((p) => ({ type: p.portType, index: p.index, ...(p.back ? { back: true as const } : {}), number: p.number, title: p.title, x: earW + p.x, y: h - bodyH + p.y, w: p.w, h: p.h }));
}
