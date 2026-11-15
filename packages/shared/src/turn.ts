/**
 * Shelf gear turned on its side. A turned device is a derived catalog entry
 * (`<id>@side`) whose width and height are swapped; placing it is just a
 * partId swap, so cables, stats and saved designs need nothing special.
 * Faces are drawn from the upright part, rotated 90° (see Faceplate).
 *
 * Seen from the front the device turns clockwise: its left side ends up on
 * top and its right side rests on the shelf.
 */
import type { Part } from './schemas.js';
import { U_MM } from './units.js';

export const SIDE_SUFFIX = '@side';

const uprightOf = new WeakMap<Part, Part>();
const turnedOf = new WeakMap<Part, Part>();

/** Can this part be laid on its side? Desktop gear with known size and no top-face ports drawn. */
export function canTurn(part: Part): boolean {
  return (
    part.formFactor === 'desktop' &&
    typeof part.width === 'object' &&
    typeof part.heightMm === 'number' &&
    part.heightMm > 0 &&
    !part.layout?.top &&
    !part.id.endsWith(SIDE_SUFFIX)
  );
}

/** The upright part a turned part was derived from (undefined when `part` is upright). */
export function uprightPart(part: Part): Part | undefined {
  return uprightOf.get(part);
}

/** Catalog id of the upright version of a part id. */
export function uprightId(id: string): string {
  return id.endsWith(SIDE_SUFFIX) ? id.slice(0, -SIDE_SUFFIX.length) : id;
}

/** The on-its-side version of an upright part, or null if it can't be turned. Memoised per part. */
export function turnedPart(part: Part): Part | null {
  if (!canTurn(part)) return null;
  const hit = turnedOf.get(part);
  if (hit) return hit;
  const wMm = (part.width as { mm: number }).mm;
  const hMm = part.heightMm!;
  const turned: Part = {
    ...part,
    id: part.id + SIDE_SUFFIX,
    width: { mm: hMm },
    heightMm: wMm,
    // Ceil to whole U, ignoring a hair over (44.5 mm is still 1U).
    heightU: Math.max(1, Math.ceil(wMm / U_MM - 0.02)),
  };
  turnedOf.set(part, turned);
  uprightOf.set(turned, part);
  return turned;
}

/** The parts plus a turned version of each part that can lie on its side. */
export function withTurnedParts(parts: readonly Part[]): Part[] {
  const out = [...parts];
  for (const p of parts) {
    const t = turnedPart(p);
    if (t) out.push(t);
  }
  return out;
}
