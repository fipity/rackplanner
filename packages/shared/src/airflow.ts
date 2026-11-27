/**
 * Cooling airflow and heat. A device's airflow is relative to its own front
 * panel; gear that faces the rear of the rack (reversed, or on the rear rails
 * facing out) blows the other way in rack terms. Mixing front-to-back and back-to-front gear in one rack
 * means one device breathes the other's exhaust.
 */
import { facingOf } from './facing.js';
import type { Catalog } from './placement.js';
import type { Airflow, Design, Part, PlacedPart } from './schemas.js';

/** 1 W of electrical draw ends up as 3.412 BTU/h of heat. */
export const BTU_PER_W = 3.412;

export const wattsToBtuH = (w: number) => Math.round(w * BTU_PER_W);

/** Catalog airflow, or the usual direction for rack servers and UPSs. */
export function partAirflow(part: Part): Airflow | null {
  if (part.airflow) return part.airflow;
  if (part.formFactor === 'rack' && (part.category === 'server' || part.subcategory === 'ups')) return 'front-to-back';
  return null;
}

/** Airflow of a placement relative to the device (override, else catalog). */
export function placementAirflow(p: PlacedPart, part: Part): { airflow: Airflow | null; source: 'yours' | 'catalog' | 'typical' | null } {
  if (p.airflow) return { airflow: p.airflow, source: 'yours' };
  if (part.airflow) return { airflow: part.airflow, source: 'catalog' };
  const guess = partAirflow(part);
  return { airflow: guess, source: guess ? 'typical' : null };
}

/** Direction through the rack: 'out-rear' = cold air in at the rack front, hot air out the back. */
export type RackAirflow = 'out-rear' | 'out-front';

export function rackAirflow(p: PlacedPart, part: Part, placements: readonly PlacedPart[] = [p]): RackAirflow | null {
  if (p.wall) return null;
  const { airflow } = placementAirflow(p, part);
  if (airflow !== 'front-to-back' && airflow !== 'back-to-front') return null;
  const reversed = facingOf(placements, p) === 'rear';
  const outRear = (airflow === 'front-to-back') !== reversed;
  return outRear ? 'out-rear' : 'out-front';
}

/** Placements grouped by which way they blow through the rack. */
export function airflowGroups(design: Pick<Design, 'placements'>, catalog: Catalog): Record<RackAirflow, string[]> {
  const out: Record<RackAirflow, string[]> = { 'out-rear': [], 'out-front': [] };
  for (const p of design.placements) {
    const part = catalog.get(p.partId);
    const dir = part && rackAirflow(p, part, design.placements);
    if (dir) out[dir].push(p.id);
  }
  return out;
}
