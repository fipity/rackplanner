/**
 * The wall beside the rack: a painted panel with a skirting board, for
 * wall-mounted gear (nbn boxes, wall plates, power points). Drawn behind
 * everything; devices on it are placed by RackView like rack devices.
 */
import { memo } from 'react';
import { U_MM } from '@rackplanner/shared';
import type { Lod } from '../faceplates/elements';
import type { RackLayout, View } from './geometry';

const SKIRTING = 14;

export const WallArea = memo(function WallArea({ layout, x, w, view, lod }: { layout: RackLayout; x: number; w: number; view: View; lod: Lod }) {
  const h = layout.height;
  // The label sits at the far end, away from the rack.
  const labelX = view === 'front' ? x + 8 : x + w - 8;
  return (
    <g aria-label="Wall" pointerEvents="none">
      <rect x={x} y={0} width={w} height={h} fill="var(--rack-wall)" stroke="var(--rack-wall-edge)" strokeWidth={0.6} />
      {lod !== 'low' && (
        <>
          {/* Faint height marks every 5U so wall gear lines up with the rack. */}
          {Array.from({ length: Math.floor(layout.rack.heightU / 5) }, (_, i) => {
            const y = layout.top + (layout.rack.heightU - (i + 1) * 5) * U_MM;
            return <line key={i} x1={x} x2={x + w} y1={y} y2={y} stroke="var(--rack-wall-edge)" strokeWidth={0.4} strokeDasharray="3 5" />;
          })}
          <rect x={x} y={h - SKIRTING} width={w} height={SKIRTING} fill="var(--rack-skirting)" stroke="var(--rack-wall-edge)" strokeWidth={0.5} />
          <line x1={x} x2={x + w} y1={h - SKIRTING + 3} y2={h - SKIRTING + 3} stroke="var(--rack-wall-edge)" strokeWidth={0.4} />
        </>
      )}
      <text
        x={labelX}
        y={layout.top + 4}
        fontSize={9}
        fontWeight={600}
        letterSpacing={1.5}
        textAnchor={view === 'front' ? 'start' : 'end'}
        fill="var(--rack-label)"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        WALL
      </text>
    </g>
  );
});
