/**
 * Rack frame drawings: rails with square cage-nut holes at EIA-310 spacing
 * (three per U), U numbers, posts, top and bottom panels, per frame style.
 * Product frames (DeskPi RackMate T1/T2) use their published outer sizes.
 */
import { Fragment, memo } from 'react';
import { U_MM, type Rack } from '@rackplanner/shared';
import type { Lod } from '../faceplates/Faceplate';
import { LABEL_COL, RAIL, uTopToY, type RackLayout } from './geometry';

/** Hole centres below the top of each U (EIA-310: 6.35, 22.225, 38.1 mm). */
export const HOLE_OFFSETS = [6.35, 22.225, 38.1];
const HOLE = 9.5;

interface FrameProps {
  layout: RackLayout;
  lod: Lod;
  /** Comma-separated U numbers (bottom-up) with nothing mounted on this face; a string so memo can compare it. */
  emptyKey: string;
}

function uLabel(rack: Rack, u: number) {
  return rack.numbering === 'top-down' ? rack.heightU - u + 1 : u;
}

function Rails({ layout, lod }: { layout: RackLayout; lod: Lod }) {
  const { rack, innerX, opening, railX, top } = layout;
  const units = Array.from({ length: rack.heightU }, (_, i) => i + 1);
  const h = rack.heightU * U_MM;
  return (
    <>
      {[railX, innerX + opening].map((rx) => (
        <g key={rx}>
          <rect x={rx} y={top} width={RAIL} height={h} fill="var(--rack-rail)" />
          <rect x={rx} y={top} width={RAIL} height={h} fill="url(#rp-rail-sheen)" opacity={0.6} />
          <rect x={rx === railX ? rx + RAIL - 0.8 : rx} y={top} width={0.8} height={h} fill="#000" opacity={0.3} />
          {lod !== 'low' &&
            units.flatMap((u) =>
              HOLE_OFFSETS.map((off) => (
                <use key={`${u}-${off}`} href="#rp-cagehole" x={rx + (RAIL - HOLE) / 2} y={uTopToY(layout, u + 1) + off - HOLE / 2} width={HOLE} height={HOLE} />
              )),
            )}
          {lod === 'low' &&
            units.map((u) => <rect key={u} x={rx + RAIL / 2 - 1.5} y={uTopToY(layout, u + 1) + U_MM / 2 - 1.5} width={3} height={3} fill="var(--rack-hole)" />)}
          {/* U boundary ticks */}
          {units.slice(1).map((u) => (
            <rect key={`t${u}`} x={rx} y={uTopToY(layout, u) - 0.2} width={RAIL} height={0.4} fill="#fff" opacity={0.12} />
          ))}
        </g>
      ))}
    </>
  );
}

function ULabels({ layout }: { layout: RackLayout }) {
  const { rack, width } = layout;
  const fontSize = 7;
  return (
    <>
      {Array.from({ length: rack.heightU }, (_, i) => i + 1).map((u) => {
        const y = uTopToY(layout, u + 1) + U_MM / 2 + fontSize * 0.35;
        return (
          <Fragment key={u}>
            <text x={LABEL_COL / 2} y={y} fontSize={fontSize} textAnchor="middle" fill="var(--rack-label)" fontFamily="ui-monospace, monospace">
              {uLabel(rack, u)}
            </text>
            <text x={width - LABEL_COL / 2} y={y} fontSize={fontSize} textAnchor="middle" fill="var(--rack-label)" fontFamily="ui-monospace, monospace">
              {uLabel(rack, u)}
            </text>
          </Fragment>
        );
      })}
    </>
  );
}

function EmptySlots({ layout, emptyUs }: { layout: RackLayout; emptyUs: readonly number[] }) {
  const { innerX, opening } = layout;
  return (
    <g pointerEvents="none">
      {emptyUs.map((u) => {
        const y = uTopToY(layout, u + 1);
        return (
          <g key={u}>
            <rect x={innerX + 2} y={y + 1.6} width={opening - 4} height={U_MM - 3.2} rx={1.6} fill="var(--rack-empty)" stroke="var(--rack-empty-edge)" strokeWidth={0.5} strokeDasharray="3 2.5" />
          </g>
        );
      })}
    </g>
  );
}

/** Posts outside the rails, full height. */
function Posts({ layout, fill, rx = 1.5 }: { layout: RackLayout; fill: string; rx?: number }) {
  const { railX, width, height, frame } = layout;
  if (frame.post <= 0) return null;
  const y = frame.handle;
  return (
    <>
      <rect x={railX - frame.post} y={y} width={frame.post} height={height - y} rx={rx} fill={fill} />
      <rect x={width - railX} y={y} width={frame.post} height={height - y} rx={rx} fill={fill} />
    </>
  );
}

function Handles({ layout }: { layout: RackLayout }) {
  const { width, frame, railX } = layout;
  if (!frame.handle) return null;
  const h = frame.handle;
  const span = Math.min(110, (width - railX * 2) * 0.42);
  const xs = [width / 2 - span - 8, width / 2 + 8];
  return (
    <g>
      {xs.map((x) => (
        <path
          key={x}
          d={`M${x} ${h + 2} V${h * 0.45} Q${x} ${h * 0.12} ${x + h * 0.3} ${h * 0.12} H${x + span - h * 0.3} Q${x + span} ${h * 0.12} ${x + span} ${h * 0.45} V${h + 2}`}
          fill="none"
          stroke="var(--rack-post)"
          strokeWidth={7}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

export const RackFrame = memo(function RackFrame({ layout, lod, emptyKey }: FrameProps) {
  const emptyUs = emptyKey ? emptyKey.split(',').map(Number) : [];
  const { rack, width, height, innerX, opening, top, frame, railX } = layout;
  const uH = rack.heightU * U_MM;
  const style = rack.frame ?? 'open-4post';
  const bottomY = top + uH;
  const frameX = railX - frame.post;
  const frameW = width - frameX * 2;
  const product = style === 'rackmate-t1' || style === 'rackmate-t2';

  return (
    <g>
      {/* Body behind the opening. */}
      {style === 'cabinet' && <rect x={frameX} y={0} width={frameW} height={height} rx={4} fill="var(--rack-frame)" stroke="var(--rack-frame-edge)" strokeWidth={1} />}
      {product && (
        // Acrylic side panels seen edge-on: a faint translucent band outside the posts.
        <rect x={frameX - 0.5} y={frame.handle} width={frameW + 1} height={height - frame.handle} rx={6} fill="var(--rack-acrylic)" stroke="var(--rack-frame-edge)" strokeWidth={0.6} />
      )}
      <rect x={innerX} y={top} width={opening} height={uH} fill="var(--rack-interior)" />
      {lod !== 'low' && (
        <rect x={innerX} y={top} width={opening} height={uH} fill="url(#rp-vent-mesh)" opacity={style === 'cabinet' ? 0.25 : 0} />
      )}

      {/* Posts, top and bottom. */}
      {style !== 'cabinet' && <Posts layout={layout} fill="var(--rack-post)" rx={product ? 3 : 1.5} />}
      {style === 'open-2post' ? (
        <>
          <rect x={frameX} y={0} width={frameW} height={top} rx={2} fill="var(--rack-post)" />
          {/* Floor base: wider foot plate. */}
          <rect x={frameX} y={bottomY} width={frameW} height={frame.bottom * 0.45} fill="var(--rack-post)" />
          <path d={`M${frameX - 14} ${height} L${frameX - 4} ${bottomY + frame.bottom * 0.45} H${width - frameX + 4} L${width - frameX + 14} ${height} Z`} fill="var(--rack-frame)" stroke="var(--rack-frame-edge)" strokeWidth={0.6} />
        </>
      ) : style === 'cabinet' ? (
        <>
          {/* Top panel with vent slots, plinth with feet. */}
          <rect x={frameX + 4} y={4} width={frameW - 8} height={top - 8} rx={2} fill="var(--rack-post)" />
          {lod !== 'low' && <rect x={frameX + 30} y={top / 2 - 4} width={frameW - 60} height={8} fill="url(#rp-vent-slots)" />}
          <rect x={frameX + 4} y={bottomY + 4} width={frameW - 8} height={frame.bottom - 16} rx={2} fill="var(--rack-post)" />
          {[frameX + 14, width - frameX - 34].map((x) => (
            <rect key={x} x={x} y={height - 12} width={20} height={10} rx={2} fill="var(--rack-frame-edge)" />
          ))}
          <rect x={railX - 4} y={top} width={4} height={uH} fill="#000" opacity={0.3} />
          <rect x={width - railX} y={top} width={4} height={uH} fill="#000" opacity={0.3} />
        </>
      ) : (
        <>
          <rect x={frameX} y={frame.handle} width={frameW} height={frame.top} rx={product ? 4 : 2} fill="var(--rack-post)" />
          <rect x={frameX} y={bottomY} width={frameW} height={frame.bottom} rx={product ? 4 : 2} fill="var(--rack-post)" />
          {lod !== 'low' && (
            <>
              <rect x={frameX + 2} y={frame.handle + 1} width={frameW - 4} height={0.8} fill="#fff" opacity={0.18} />
              <rect x={frameX + 2} y={bottomY + 1} width={frameW - 4} height={0.8} fill="#fff" opacity={0.12} />
            </>
          )}
          {product && lod !== 'low' && (
            <>
              {/* Rubber feet. */}
              {[frameX + 12, width - frameX - 32].map((x) => (
                <rect key={x} x={x} y={height - 3} width={20} height={3} rx={1.2} fill="#0b0c0e" />
              ))}
              {/* Corner screws on the die-cast frame. */}
              {[frameX + 7, width - frameX - 7].flatMap((x) =>
                [frame.handle + frame.top / 2, bottomY + frame.bottom / 2].map((y) => <use key={`${x}-${y}`} href="#rp-screw-black" x={x - 2.4} y={y - 2.4} width={4.8} height={4.8} />),
              )}
            </>
          )}
        </>
      )}
      <Handles layout={layout} />

      <Rails layout={layout} lod={lod} />
      <EmptySlots layout={layout} emptyUs={emptyUs} />
      <ULabels layout={layout} />
    </g>
  );
}, (a, b) => sameFrame(a, b));

// Re-render only when the rack itself, the detail level or the empty slots change.
export const sameFrame = (a: FrameProps, b: FrameProps) => a.lod === b.lod && a.emptyKey === b.emptyKey && JSON.stringify(a.layout.rack) === JSON.stringify(b.layout.rack);

/** Glass door overlay, drawn above devices (front view of cabinets). */
export function GlassDoor({ layout }: { layout: RackLayout }) {
  const { railX, width, top, rack } = layout;
  const x = railX - 2;
  const w = width - x * 2;
  const h = rack.heightU * U_MM + 8;
  const y = top - 4;
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} rx={3} fill="url(#rp-glass)" stroke="var(--rack-post)" strokeWidth={5} />
      <path d={`M${x + w * 0.15} ${y + 6} L${x + w * 0.4} ${y + 6} L${x + w * 0.12} ${y + h - 6} L${x + 4} ${y + h - 6} Z`} fill="#fff" opacity={0.05} />
      <rect x={x + w - 9} y={y + h / 2 - 22} width={4} height={44} rx={2} fill="url(#rp-metal)" />
    </g>
  );
}
