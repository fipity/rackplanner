/**
 * Live design statistics and warnings. Pure functions over a design and the
 * catalog, shared by the stats panel, exports and tests.
 *
 * Power model
 *  - A placement's draw is its measured power if set, otherwise the catalog
 *    typical/max figures. Missing typical falls back to max (and vice versa),
 *    counted as "estimated".
 *  - Catalog max power excludes PoE output, so the expected PoE load the user
 *    enters is added on top when comparing against UPS capacity.
 *  - UPS and PDU units are not counted as load.
 *  - Passive parts (panels, shelves, mounts…) with no power data count as 0 W;
 *    active parts with no data are listed as unknown.
 */
import {
  checkPlacement,
  descendantsOf,
  displayName,
  occupancyOf,
  type Catalog,
} from './placement.js';
import type { Design, Part, PlacedPart, PortType } from './schemas.js';
import { EPS } from './units.js';

export const PASSIVE_CATEGORIES: ReadonlySet<string> = new Set([
  'blank',
  'patch-panel',
  'cable-management',
  'shelf',
  'mount',
  'accessory',
]);

export type WarningCode =
  | 'unknown-part'
  | 'invalid-placement'
  | 'too-deep'
  | 'shelf-too-shallow'
  | 'desktop-not-on-shelf'
  | 'ups-overload'
  | 'ups-max-overload'
  | 'poe-overload'
  | 'no-poe-source'
  | 'unknown-power';

export interface StatsWarning {
  code: WarningCode;
  severity: 'error' | 'warning' | 'info';
  message: string;
  placementIds: string[];
}

export interface DesignStats {
  rackU: number;
  usedU: number;
  freeU: number;
  deviceCount: number;
  activeCount: number;
  passiveCount: number;
  power: {
    typicalW: number;
    maxW: number;
    /** maxW plus the expected PoE load. */
    maxWithPoeW: number;
    typicalWithPoeW: number;
    measuredCount: number;
    estimatedCount: number;
    unknownIds: string[];
  };
  ups: { capacityW: number; capacityVA: number | null; count: number };
  poe: { budgetW: number; expectedLoadW: number | null; sourceCount: number };
  weight: { totalKg: number; unknownIds: string[] };
  ports: Partial<Record<PortType, number>>;
  warnings: StatsWarning[];
}

export function isPassive(part: Part): boolean {
  return PASSIVE_CATEGORIES.has(part.category) && part.power.maxW === null && part.power.typicalW === null;
}

function isPowerSource(part: Part): boolean {
  return !!part.ups || part.subcategory === 'pdu' || part.subcategory === 'rps';
}

/** Resolved draw for one placement, or null when unknown. */
export function placementPower(p: PlacedPart, part: Part): { typicalW: number; maxW: number; measured: boolean; estimated: boolean } | null {
  if (p.measuredW !== undefined) return { typicalW: p.measuredW, maxW: p.measuredW, measured: true, estimated: false };
  const { typicalW, maxW } = part.power;
  if (typicalW === null && maxW === null) return null;
  return {
    typicalW: typicalW ?? maxW!,
    maxW: maxW ?? typicalW!,
    measured: false,
    estimated: typicalW === null || maxW === null,
  };
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeStats(design: Pick<Design, 'rack' | 'placements' | 'expectedPoeLoadW'>, catalog: Catalog): DesignStats {
  const { rack, placements } = design;
  const warnings: StatsWarning[] = [];
  const occupied = new Set<number>();
  const ports: Partial<Record<PortType, number>> = {};
  let typicalW = 0;
  let maxW = 0;
  let measuredCount = 0;
  let estimatedCount = 0;
  const unknownPower: string[] = [];
  let weightKg = 0;
  const unknownWeight: string[] = [];
  let upsW = 0;
  let upsVA: number | null = 0;
  let upsCount = 0;
  let poeBudget = 0;
  let poeSources = 0;
  let passiveCount = 0;
  const desktopLoose: string[] = [];
  const unknownParts: string[] = [];

  placements.forEach((p, index) => {
    const part = catalog.get(p.partId);
    if (!part) {
      unknownParts.push(p.id);
      return;
    }
    const occ = occupancyOf(placements, p, catalog);
    if (occ) {
      for (let u = occ.u0; u < occ.u1 - EPS; u += 0.5) occupied.add(Math.round(u * 2));
    }

    if (isPassive(part)) passiveCount++;
    for (const [type, n] of Object.entries(part.ports) as [PortType, number][]) {
      if (n) ports[type] = (ports[type] ?? 0) + n;
    }

    if (part.ups) {
      upsW += part.ups.capacityW;
      upsVA = part.ups.capacityVA !== null && upsVA !== null ? upsVA + part.ups.capacityVA : null;
      upsCount++;
    } else if (!isPowerSource(part)) {
      const pw = placementPower(p, part);
      if (pw) {
        typicalW += pw.typicalW;
        maxW += pw.maxW;
        if (pw.measured) measuredCount++;
        if (pw.estimated) estimatedCount++;
      } else if (!isPassive(part)) {
        unknownPower.push(p.id);
      }
    }

    if (part.poeBudgetW) {
      poeBudget += part.poeBudgetW;
      poeSources++;
    }

    if (part.weightKg !== null) weightKg += part.weightKg;
    else if (!isPassive(part)) unknownWeight.push(p.id);

    const name = displayName(p, part);

    // Placement validity (collisions, bounds, width). Report each collision once.
    const check = checkPlacement(design, p, catalog);
    if (!check.ok) {
      const earlier = new Set(placements.slice(0, index).map((q) => q.id));
      const problems = check.problems.filter(
        (pr) => pr.code !== 'collision' || check.collisions.some((c) => earlier.has(c.placementId)),
      );
      if (problems.length) {
        warnings.push({
          code: 'invalid-placement',
          severity: 'error',
          message: `${name}: ${problems.map((pr) => pr.message).join('; ')}`,
          placementIds: [p.id, ...check.collisions.filter((c) => earlier.has(c.placementId)).map((c) => c.placementId)],
        });
      }
    }

    if (rack.depthMm !== null && part.depthMm !== null && p.parentId === undefined && part.depthMm > rack.depthMm + EPS) {
      warnings.push({
        code: 'too-deep',
        severity: 'warning',
        message: `${name} is ${part.depthMm} mm deep; the rack is ${rack.depthMm} mm`,
        placementIds: [p.id],
      });
    }

    if (p.parentId !== undefined) {
      const shelf = placements.find((q) => q.id === p.parentId);
      const shelfPart = shelf && catalog.get(shelf.partId);
      if (shelfPart?.shelf && part.depthMm !== null && part.depthMm > shelfPart.shelf.usableDepthMm + EPS) {
        warnings.push({
          code: 'shelf-too-shallow',
          severity: 'warning',
          message: `${name} (${part.depthMm} mm) is deeper than ${displayName(shelf!, shelfPart)} (${shelfPart.shelf.usableDepthMm} mm usable)`,
          placementIds: [p.id],
        });
      }
    } else if (part.formFactor === 'desktop') {
      desktopLoose.push(p.id);
    }
  });

  const nameOf = (id: string) => {
    const p = placements.find((q) => q.id === id)!;
    return displayName(p, catalog.get(p.partId));
  };
  const list = (ids: string[], max = 3) =>
    ids.slice(0, max).map(nameOf).join(', ') + (ids.length > max ? ` and ${ids.length - max} more` : '');

  if (unknownParts.length) {
    warnings.unshift({
      code: 'unknown-part',
      severity: 'error',
      message: `${unknownParts.length} placement${unknownParts.length === 1 ? ' uses a part' : 's use parts'} missing from the catalog`,
      placementIds: unknownParts,
    });
  }
  if (desktopLoose.length) {
    warnings.push({
      code: 'desktop-not-on-shelf',
      severity: 'warning',
      message: `Desktop gear not on a shelf: ${list(desktopLoose)}`,
      placementIds: desktopLoose,
    });
  }

  const expected = design.expectedPoeLoadW;
  const maxWithPoeW = maxW + (expected ?? 0);
  const typicalWithPoeW = typicalW + (expected ?? 0);

  if (upsCount > 0) {
    if (typicalWithPoeW > upsW + EPS) {
      warnings.push({
        code: 'ups-overload',
        severity: 'error',
        message: `Typical draw ${round(typicalWithPoeW)} W exceeds UPS capacity ${upsW} W`,
        placementIds: [],
      });
    } else if (maxWithPoeW > upsW + EPS) {
      warnings.push({
        code: 'ups-max-overload',
        severity: 'warning',
        message: `Max draw ${round(maxWithPoeW)} W exceeds UPS capacity ${upsW} W`,
        placementIds: [],
      });
    }
  }

  if (expected !== null && expected > 0) {
    if (poeSources === 0) {
      warnings.push({ code: 'no-poe-source', severity: 'warning', message: `Expected PoE load is ${expected} W but nothing in the rack supplies PoE`, placementIds: [] });
    } else if (expected > poeBudget + EPS) {
      warnings.push({ code: 'poe-overload', severity: 'error', message: `Expected PoE load ${expected} W exceeds the ${poeBudget} W PoE budget`, placementIds: [] });
    }
  }

  if (unknownPower.length) {
    warnings.push({
      code: 'unknown-power',
      severity: 'info',
      message: `No power data for ${list(unknownPower)}; set a measured value in the inspector`,
      placementIds: unknownPower,
    });
  }

  const usedU = occupied.size / 2;
  return {
    rackU: rack.heightU,
    usedU,
    freeU: Math.max(0, rack.heightU - usedU),
    deviceCount: placements.length,
    activeCount: placements.length - passiveCount - unknownParts.length,
    passiveCount,
    power: {
      typicalW: round(typicalW),
      maxW: round(maxW),
      maxWithPoeW: round(maxWithPoeW),
      typicalWithPoeW: round(typicalWithPoeW),
      measuredCount,
      estimatedCount,
      unknownIds: unknownPower,
    },
    ups: { capacityW: upsW, capacityVA: upsCount ? upsVA : null, count: upsCount },
    poe: { budgetW: round(poeBudget), expectedLoadW: expected, sourceCount: poeSources },
    weight: { totalKg: round(weightKg, 2), unknownIds: unknownWeight },
    ports,
    warnings,
  };
}

/** Placements affected by a warning, including shelf contents. */
export function warningTargets(design: Pick<Design, 'placements'>, w: StatsWarning): string[] {
  return [...new Set(w.placementIds.flatMap((id) => [id, ...descendantsOf(design.placements, id)]))];
}
