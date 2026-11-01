import { U_MM, isFullWidth, partWidthMm, type Part, type RackWidth } from '@rackplanner/shared';
import { RAIL } from '../rack/geometry';
import { Faceplate } from './Faceplate';

/** A part's faceplate on its own, e.g. for the catalog list or drag overlay. */
export function PartThumb({ part, rackWidth, width, scale }: { part: Part; rackWidth: RackWidth; width?: number; scale?: number }) {
  const ears = part.formFactor === 'rack' && isFullWidth(part, rackWidth);
  const w = ears ? partWidthMm(part) + RAIL * 2 : partWidthMm(part);
  const h = part.heightU * U_MM;
  const px = scale ? { width: w * scale, height: h * scale } : { width: width ?? 112 };
  return (
    <svg viewBox={`-0.5 -0.5 ${w + 1} ${h + 1}`} {...px} className="block max-h-16 shrink-0" aria-hidden="true">
      <Faceplate part={part} w={w} h={h} ears={ears} view="front" />
    </svg>
  );
}
