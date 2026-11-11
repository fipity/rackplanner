/** Layout sanity checks shared by the catalog validator and tests. */
import { LAYERED_KINDS, RACK_OPENING_MM, U_MM, overlaps, partWidthMm, resolveFace, type FaceElement, type Part } from '@rackplanner/shared';

function faceSize(part: Part, face: 'front' | 'rear' | 'top', W: number): [number, number] {
  const h = part.formFactor === 'desktop' && part.heightMm ? Math.min(part.heightMm, part.heightU * U_MM) : part.heightU * U_MM;
  return face === 'top' ? [W, part.depthMm ?? 200] : [W, h];
}

function check(id: string, face: string, els: FaceElement[], W: number, H: number): string[] {
  const out: string[] = [];
  const e = 0.05;
  for (const el of els) {
    if (el.x < -e || el.y < -e || el.x + el.w > W + e || el.y + el.h > H + e) out.push(`${id} ${face}: ${el.kind} outside the ${W.toFixed(0)}×${H.toFixed(0)} face`);
  }
  const solid = els.filter((x) => !LAYERED_KINDS.has(x.kind));
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++)
      if (overlaps(solid[i]!, solid[j]!)) out.push(`${id} ${face}: ${solid[i]!.kind} overlaps ${solid[j]!.kind}`);
  return out;
}

/** Problems with a part's faces at its own width (and, for full-width gear, the other rack width). */
export function layoutProblems(part: Part): string[] {
  if (part.render.style === 'shelf' && !part.layout?.front) return [];
  const widths = new Set<number>([partWidthMm(part)]);
  if (part.width === '19in' || part.width === '10in') for (const w of part.rackWidths) widths.add(RACK_OPENING_MM[w]);
  const out: string[] = [];
  for (const W of widths) {
    for (const face of ['front', 'rear', 'top'] as const) {
      if (part.render.style === 'shelf' && face !== 'front') continue;
      const [w, h] = faceSize(part, face, W);
      out.push(...check(part.id, face, resolveFace(part, face, w, h).elements, w, h));
    }
  }
  return [...new Set(out)];
}
