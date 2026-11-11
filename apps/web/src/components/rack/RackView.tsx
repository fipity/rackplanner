/**
 * Pure SVG rendering of a rack and its devices. Used by the interactive
 * editor (with a wrapper that adds drag handles) and, later, by thumbnails
 * and exports, so every output looks the same.
 */
import { Fragment, type ComponentType, type ReactNode, type Ref } from 'react';
import {
  PORT_TYPE_LABELS,
  occupancyOf,
  type Cable,
  type CableEnd,
  type Catalog,
  type Design,
  type Occupancy,
  type Part,
  type PlacedPart,
} from '@rackplanner/shared';
import { Faceplate, bodyHeight, portPositions, type Lod } from '../faceplates/Faceplate';
import { FaceplateDefs } from '../faceplates/Defs';
import { GlassDoor, RackFrame } from './RackFrame';
import { cableEndPoint, cablePath } from './cableGeometry';
import { deviceBox, faceSeen, rackLayout, shelfTrayMm, type DeviceBox, type View } from './geometry';

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
  cables?: readonly Cable[];
  showCables?: boolean;
  selectedCableId?: string | null;
  onCableClick?: (id: string) => void;
  /** Cable mode: draw clickable port targets. */
  onPortClick?: (end: CableEnd) => void;
  /** First end of a cable being drawn, and the pointer (SVG mm) for the rubber band. */
  pendingEnd?: CableEnd | null;
  pointer?: { x: number; y: number } | null;
  /** Level of detail; exports always use 'high'. */
  lod?: Lod;
  /** Status LEDs lit (off = print style). */
  leds?: boolean;
  /** Include the shared <defs> (standalone SVG exports). */
  embedDefs?: boolean;
  /** Hover tooltips on ports ("Port 17 — 1 GbE PoE+"). */
  portTooltips?: boolean;
}

export function RackView({
  design,
  catalog,
  view,
  scale,
  selectedId,
  draggingId,
  ghost,
  Wrapper,
  svgRef,
  className,
  cables = [],
  showCables = true,
  selectedCableId,
  onCableClick,
  onPortClick,
  pendingEnd,
  pointer,
  lod = 'high',
  leds = true,
  embedDefs = false,
  portTooltips = false,
}: RackViewProps) {
  const layout = rackLayout(design.rack);
  const { placements } = design;

  const items = placements
    .map((p) => {
      const part = catalog.get(p.partId);
      const occ = part ? occupancyOf(placements, p, catalog) : null;
      return part && occ ? { p, part, occ } : null;
    })
    .filter((x): x is { p: PlacedPart; part: Part; occ: Occupancy } => x !== null);

  /** Drawing box for a placement; shelf items are lifted onto the tray. */
  const boxOf = (p: PlacedPart, part: Part, occ: Occupancy, list: readonly PlacedPart[] = placements): DeviceBox => {
    let lift = 0;
    if (p.parentId !== undefined) {
      const shelf = list.find((q) => q.id === p.parentId);
      const shelfPart = shelf && catalog.get(shelf.partId);
      if (shelfPart) lift = shelfTrayMm(shelfPart);
    }
    return deviceBox(layout, part, occ.u0, occ.u1, occ.x0, view, p.parentId !== undefined, lift);
  };

  const visible = items.filter((i) => i.occ.faces.includes(view));
  const otherFace = items.filter((i) => !i.occ.faces.includes(view));
  // Shelves before their contents so children draw on top.
  const byLayer = (a: (typeof items)[number], b: (typeof items)[number]) => Number(a.p.parentId !== undefined) - Number(b.p.parentId !== undefined);
  visible.sort(byLayer);
  otherFace.sort(byLayer);

  // U slots with nothing mounted on this face: drawn as subtle "free" hints.
  const filled = new Set<number>();
  for (const { occ } of visible) for (let u = Math.floor(occ.u0); u < occ.u1 - 1e-6; u++) filled.add(u);
  const emptyUs = Array.from({ length: design.rack.heightU }, (_, i) => i + 1).filter((u) => !filled.has(u));

  const face = (p: PlacedPart, part: Part, occ: Occupancy, box: DeviceBox, extra: { label?: string | undefined; color?: string | undefined } = {}) => (
    <Faceplate
      part={part}
      w={box.w}
      h={box.h}
      ears={box.ears}
      view={faceSeen(occ.faces, view)}
      lod={lod}
      leds={leds}
      portColors={p.portColors}
      tooltips={portTooltips}
      label={extra.label}
      color={extra.color}
    />
  );

  let ghostNode: ReactNode = null;
  if (ghost) {
    const part = catalog.get(ghost.candidate.partId);
    const ghostPlacements = [...placements.filter((p) => p.id !== ghost.candidate.id), ghost.candidate];
    const occ = part ? occupancyOf(ghostPlacements, ghost.candidate, catalog) : null;
    if (part && occ) {
      const box = boxOf(ghost.candidate, part, occ, ghostPlacements);
      const stroke = ghost.ok ? '#22c55e' : '#ef4444';
      ghostNode = (
        <g pointerEvents="none">
          <g transform={`translate(${box.x} ${box.y})`} opacity={0.72}>
            {face(ghost.candidate, part, occ, box)}
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
      {embedDefs && <FaceplateDefs />}
      <RackFrame layout={layout} lod={lod} emptyKey={emptyUs.join(',')} />

      {/* Gear mounted on the other face, seen through the rack. */}
      {otherFace.map(({ p, part, occ }) => {
        const box = boxOf(p, part, occ);
        return (
          <g key={`o-${p.id}`} transform={`translate(${box.x} ${box.y})`} opacity={0.78} pointerEvents="none">
            {face(p, part, occ, box)}
          </g>
        );
      })}

      {/* Soft shadow where devices meet the rails and the gear below. */}
      {lod !== 'low' &&
        visible.map(({ p, part, occ }) => {
          if (part.render.style === 'shelf') return null;
          const box = boxOf(p, part, occ);
          const bh = bodyHeight(part, box.h);
          return <rect key={`s-${p.id}`} x={box.x + 0.8} y={box.y + box.h - 0.3} width={box.w - 1.6} height={Math.min(3, bh * 0.2)} fill="url(#rp-rail-shadow)" pointerEvents="none" />;
        })}

      {visible.map(({ p, part, occ }) => {
        const box = boxOf(p, part, occ);
        const drawn = (
          <g transform={`translate(${box.x} ${box.y})`} opacity={draggingId === p.id ? 0.3 : 1}>
            {face(p, part, occ, box, { label: p.label, color: p.color })}
          </g>
        );
        const collided = ghost && !ghost.ok && ghost.collisionIds.includes(p.id);
        return (
          <Fragment key={p.id}>
            {Wrapper ? (
              <Wrapper placement={p} part={part} box={box} occupancy={occ}>
                {drawn}
              </Wrapper>
            ) : (
              drawn
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

      {showCables && cables.length > 0 && (
        <g aria-label="Cables">
          {cables.map((c) => {
            const a = cableEndPoint(design, catalog, c.a, view);
            const b = cableEndPoint(design, catalog, c.b, view);
            if (!a || !b || (!a.visible && !b.visible)) return null;
            const d = cablePath(a, b);
            const crossFace = !a.visible || !b.visible;
            const selected = selectedCableId === c.id;
            return (
              <g key={c.id} opacity={crossFace ? 0.55 : 1}>
                {selected && <path d={d} fill="none" stroke="#60a5fa" strokeWidth={5} strokeOpacity={0.55} strokeLinecap="round" />}
                <path d={d} fill="none" stroke="#0b0c0e" strokeWidth={2.9} strokeOpacity={0.55} strokeLinecap="round" strokeDasharray={crossFace ? '5 3' : undefined} />
                <path d={d} fill="none" stroke={c.color} strokeWidth={1.8} strokeLinecap="round" strokeDasharray={crossFace ? '5 3' : undefined} />
                {[a, b].map((pt, i) =>
                  pt.visible ? (
                    <rect key={i} x={pt.x - 1.9} y={pt.y - 1.9} width={3.8} height={3.8} rx={0.6} fill={c.color} stroke="#0b0c0e" strokeWidth={0.5} />
                  ) : null,
                )}
                {onCableClick && (
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={7}
                    pointerEvents="stroke"
                    className="cursor-pointer"
                    role="button"
                    aria-label={`Cable${c.label ? ` ${c.label}` : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCableClick(c.id);
                    }}
                  >
                    <title>{c.label ?? 'Cable'}</title>
                  </path>
                )}
              </g>
            );
          })}
        </g>
      )}

      {onPortClick && (
        <g aria-label="Ports">
          {visible.map(({ p, part, occ }) => {
            const box = boxOf(p, part, occ);
            return portPositions(part, box.w, box.h, box.ears, faceSeen(occ.faces, view)).map((sl) => {
              const end: CableEnd = { placementId: p.id, port: { type: sl.type, index: sl.index } };
              const used = cables.some((c) => [c.a, c.b].some((e) => e.placementId === p.id && e.port?.type === sl.type && e.port.index === sl.index));
              const pending = pendingEnd?.placementId === p.id && pendingEnd.port?.type === sl.type && pendingEnd.port.index === sl.index;
              const title = `${sl.title}${used ? ' · in use' : ''}`;
              return (
                <rect
                  key={`${p.id}-${sl.type}-${sl.index}`}
                  x={box.x + sl.x - 0.6}
                  y={box.y + sl.y - 0.6}
                  width={sl.w + 1.2}
                  height={sl.h + 1.2}
                  rx={0.8}
                  role="button"
                  aria-label={`${part.name} ${PORT_TYPE_LABELS[sl.type]} ${sl.index}`}
                  className="cursor-crosshair fill-transparent stroke-transparent hover:fill-blue-400/30 hover:stroke-blue-500"
                  style={pending ? { fill: 'rgba(250,204,21,0.45)', stroke: '#eab308' } : used ? { stroke: 'rgba(96,165,250,0.6)' } : undefined}
                  strokeWidth={0.6}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPortClick(end);
                  }}
                >
                  <title>{title}</title>
                </rect>
              );
            });
          })}
        </g>
      )}

      {pendingEnd && pointer && (() => {
        const a = cableEndPoint(design, catalog, pendingEnd, view);
        return a ? <path d={`M${a.x} ${a.y} L${pointer.x} ${pointer.y}`} stroke="#eab308" strokeWidth={1.6} strokeDasharray="4 3" pointerEvents="none" /> : null;
      })()}

      {design.rack.frame === 'cabinet' && design.rack.glassDoor && view === 'front' && <GlassDoor layout={layout} />}
      {ghostNode}
    </svg>
  );
}
