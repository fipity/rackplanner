/**
 * Pure SVG rendering of a rack and its devices. Used by the interactive
 * editor (with a wrapper that adds drag handles) and, later, by thumbnails
 * and exports, so every output looks the same.
 */
import { Fragment, type ComponentType, type ReactNode, type Ref } from 'react';
import {
  U_MM,
  occupancyOf,
  type Catalog,
  type Design,
  type Occupancy,
  type Part,
  type PlacedPart,
} from '@rackplanner/shared';
import { Faceplate } from '../faceplates/Faceplate';
import { FRAME, GUTTER, RAIL, deviceBox, rackLayout, uTopToY, type DeviceBox, type RackLayout, type View } from './geometry';

export interface PlacementWrapperProps {
  placement: PlacedPart;
  part: Part;
  box: DeviceBox;
  occupancy: Occupancy;
  children: ReactNode;
}

export interface RackGhost {
  candidate: PlacedPart;
  ok: boolean;
  collisionIds: readonly string[];
}

export interface RackViewProps {
  design: Pick<Design, 'rack' | 'placements'>;
  catalog: Catalog;
  view: View;
  /** CSS pixels per mm. Omit to let the SVG scale to its container. */
  scale?: number;
  selectedId?: string | null;
  /** Placement currently being dragged (drawn faded). */
  draggingId?: string | null;
  ghost?: RackGhost | null;
  Wrapper?: ComponentType<PlacementWrapperProps>;
  svgRef?: Ref<SVGSVGElement>;
  className?: string;
}

const HOLE_OFFSETS = [6.35, 22.225, 38.1];

export function RackView({ design, catalog, view, scale, selectedId, draggingId, ghost, Wrapper, svgRef, className }: RackViewProps) {
  const layout = rackLayout(design.rack);
  const { placements } = design;

  const items = placements
    .map((p) => {
      const part = catalog.get(p.partId);
      const occ = part ? occupancyOf(placements, p, catalog) : null;
      return part && occ ? { p, part, occ } : null;
    })
    .filter((x): x is { p: PlacedPart; part: Part; occ: Occupancy } => x !== null);

  const visible = items.filter((i) => i.occ.faces.includes(view));
  const otherFace = items.filter((i) => !i.occ.faces.includes(view));
  // Shelves before their contents so children draw on top.
  visible.sort((a, b) => Number(a.p.parentId !== undefined) - Number(b.p.parentId !== undefined));

  let ghostNode: ReactNode = null;
  if (ghost) {
    const part = catalog.get(ghost.candidate.partId);
    const ghostPlacements = [...placements.filter((p) => p.id !== ghost.candidate.id), ghost.candidate];
    const occ = part ? occupancyOf(ghostPlacements, ghost.candidate, catalog) : null;
    if (part && occ) {
      const box = deviceBox(layout, part, occ.u0, occ.u1, occ.x0, view, ghost.candidate.parentId !== undefined);
      const stroke = ghost.ok ? '#22c55e' : '#ef4444';
      ghostNode = (
        <g pointerEvents="none">
          <g transform={`translate(${box.x} ${box.y})`} opacity={0.72}>
            <Faceplate part={part} w={box.w} h={box.h} ears={box.ears} view={view} />
          </g>
          <rect
            x={box.x - 0.8}
            y={box.y - 0.8}
            width={box.w + 1.6}
            height={box.h + 1.6}
            rx={1.5}
            fill={ghost.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.28)'}
            stroke={stroke}
            strokeWidth={1.4}
            strokeDasharray={ghost.ok ? undefined : '4 2'}
          />
        </g>
      );
    }
  }

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={scale ? layout.width * scale : undefined}
      height={scale ? layout.height * scale : undefined}
      className={className}
      role="img"
      aria-label={`${design.rack.heightU}U ${design.rack.width} rack, ${view} view`}
    >
      <RackFrame layout={layout} />

      {otherFace.map(({ p, part, occ }) => {
        const box = deviceBox(layout, part, occ.u0, occ.u1, occ.x0, view, p.parentId !== undefined);
        return (
          <rect
            key={`o-${p.id}`}
            x={box.x + 1}
            y={box.y + 1}
            width={box.w - 2}
            height={box.h - 2}
            rx={1}
            fill="rgba(148,163,184,0.06)"
            stroke="rgba(148,163,184,0.35)"
            strokeWidth={0.6}
            strokeDasharray="3 2"
            pointerEvents="none"
          />
        );
      })}

      {visible.map(({ p, part, occ }) => {
        const box = deviceBox(layout, part, occ.u0, occ.u1, occ.x0, view, p.parentId !== undefined);
        const face = (
          <g transform={`translate(${box.x} ${box.y})`} opacity={draggingId === p.id ? 0.3 : 1}>
            <Faceplate part={part} w={box.w} h={box.h} ears={box.ears} view={view} label={p.label} color={p.color} />
          </g>
        );
        const collided = ghost && !ghost.ok && ghost.collisionIds.includes(p.id);
        return (
          <Fragment key={p.id}>
            {Wrapper ? (
              <Wrapper placement={p} part={part} box={box} occupancy={occ}>
                {face}
              </Wrapper>
            ) : (
              face
            )}
            {selectedId === p.id && (
              <rect
                x={box.x - 1}
                y={box.y - 1}
                width={box.w + 2}
                height={box.h + 2}
                rx={1.8}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={1.4}
                pointerEvents="none"
              />
            )}
            {collided && (
              <rect
                x={box.x - 0.6}
                y={box.y - 0.6}
                width={box.w + 1.2}
                height={box.h + 1.2}
                rx={1.5}
                fill="rgba(239,68,68,0.25)"
                stroke="#ef4444"
                strokeWidth={1.2}
                pointerEvents="none"
              />
            )}
          </Fragment>
        );
      })}

      {ghostNode}
    </svg>
  );
}

function RackFrame({ layout }: { layout: RackLayout }) {
  const { rack, width, height, innerX, opening } = layout;
  const units = Array.from({ length: rack.heightU }, (_, i) => i + 1);
  const label = (u: number) => (rack.numbering === 'top-down' ? rack.heightU - u + 1 : u);
  const fontSize = 7;
  return (
    <g>
      <rect x={GUTTER - 6} y={0} width={width - (GUTTER - 6) * 2} height={height} rx={4} fill="var(--rack-frame)" stroke="var(--rack-frame-edge)" strokeWidth={1} />
      <rect x={innerX} y={FRAME} width={opening} height={rack.heightU * U_MM} fill="var(--rack-interior)" />
      {units.slice(1).map((u) => (
        <line key={`l${u}`} x1={innerX} x2={innerX + opening} y1={uTopToY(layout, u)} y2={uTopToY(layout, u)} stroke="var(--rack-slot-line)" strokeWidth={0.4} />
      ))}
      {[GUTTER, innerX + opening].map((rx) => (
        <g key={rx}>
          <rect x={rx} y={FRAME} width={RAIL} height={rack.heightU * U_MM} fill="var(--rack-rail)" />
          {units.flatMap((u) =>
            HOLE_OFFSETS.map((off) => (
              <rect
                key={`${rx}-${u}-${off}`}
                x={rx + RAIL / 2 - 1.6}
                y={uTopToY(layout, u) - off - 1.6}
                width={3.2}
                height={3.2}
                fill="var(--rack-hole)"
              />
            )),
          )}
        </g>
      ))}
      {units.map((u) => {
        const y = uTopToY(layout, u + 1) + U_MM / 2 + fontSize * 0.35;
        return (
          <Fragment key={`n${u}`}>
            <text x={GUTTER - 10} y={y} fontSize={fontSize} textAnchor="middle" fill="var(--rack-label)" fontFamily="ui-monospace, monospace">
              {label(u)}
            </text>
            <text x={width - GUTTER + 10} y={y} fontSize={fontSize} textAnchor="middle" fill="var(--rack-label)" fontFamily="ui-monospace, monospace">
              {label(u)}
            </text>
          </Fragment>
        );
      })}
    </g>
  );
}
