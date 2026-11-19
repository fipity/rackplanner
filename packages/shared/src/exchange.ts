/**
 * Design import/export format and bill of materials. Pure functions so the
 * browser, server and tests share them.
 */
import { z } from 'zod';
import type { Catalog } from './placement.js';
import { DesignSchema, PartSchema, type Design, type Part } from './schemas.js';
import { CABLE_TYPE_LABELS } from './cables.js';
import { placementPower } from './stats.js';
import { uprightId } from './turn.js';
import { ThumbnailIdSchema } from './printed/schema.js';

export const EXPORT_FORMAT = 'rackplanner-design';

export const DesignExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  design: DesignSchema,
  /** Custom parts the design uses, so it can be imported on another instance. */
  customParts: z.array(PartSchema).default([]),
  /**
   * Cached thumbnails of 3D-printed parts, keyed by thumbnail id, as base64
   * image data. Optional: exports can leave them out.
   */
  thumbnails: z.record(ThumbnailIdSchema, z.string().max(7_000_000).regex(/^[A-Za-z0-9+/=]+$/)).optional(),
});
export type DesignExport = z.infer<typeof DesignExportSchema>;

export function buildDesignExport(design: Design, catalog: Catalog, now = new Date()): DesignExport {
  // A turned device is derived from its upright part; export that.
  const used = new Set(design.placements.map((p) => uprightId(p.partId)));
  const customParts = [...used].map((id) => catalog.get(id)).filter((p): p is Part => !!p && p.source === 'custom');
  return { format: EXPORT_FORMAT, formatVersion: 1, exportedAt: now.toISOString(), design, customParts };
}

/** Thumbnail ids used by a set of parts. */
export function thumbnailIds(parts: readonly Part[]): string[] {
  return [...new Set(parts.map((p) => p.printed?.thumbnail).filter((t): t is string => !!t))];
}

export type ImportResult =
  | { ok: true; design: Design; customParts: Part[]; thumbnails: Record<string, string> }
  | { ok: false; error: string };

/** Parse an exported file, or a bare design JSON, with readable errors. */
export function parseDesignImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  const isWrapper = typeof raw === 'object' && raw !== null && 'format' in raw;
  if (isWrapper) {
    const r = DesignExportSchema.safeParse(raw);
    if (!r.success) return { ok: false, error: describe(r.error) };
    return { ok: true, design: r.data.design, customParts: r.data.customParts, thumbnails: r.data.thumbnails ?? {} };
  }
  const r = DesignSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: describe(r.error) };
  return { ok: true, design: r.data, customParts: [], thumbnails: {} };
}

function describe(err: z.ZodError): string {
  const first = err.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return `Not a RackPlanner design: ${first.join('; ')}${err.issues.length > 3 ? ` (+${err.issues.length - 3} more)` : ''}`;
}

// ---------------------------------------------------------------------------
// Bill of materials
// ---------------------------------------------------------------------------

export interface BomRow {
  partId: string;
  brand: string;
  model: string;
  name: string;
  category: string;
  qty: number;
  heightU: number;
  totalU: number;
  typicalW: number | null;
  maxW: number | null;
  /** Total measured watts across placements that have a measurement. */
  measuredW: number | null;
  weightKg: number | null;
  labels: string[];
  sourceUrl: string | null;
  missing: boolean;
  /** 3D-printed parts: where the model is, who designed it, and its licence. */
  printed?: { url: string; designer: string | null; designerUrl: string | null; licence: string | null };
}

export function buildBom(design: Pick<Design, 'placements'> & { cables?: Design['cables'] }, catalog: Catalog): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const p of design.placements) {
    const placed = catalog.get(p.partId);
    // Upright and turned copies of a device are the same thing to buy.
    const key = uprightId(p.partId);
    const part = catalog.get(key) ?? placed;
    let row = rows.get(key);
    if (!row) {
      row = {
        partId: key,
        brand: part?.brand ?? '',
        model: part?.model ?? key,
        name: part?.name ?? `Unknown part ${key}`,
        category: part?.category ?? '',
        qty: 0,
        heightU: part?.heightU ?? 0,
        totalU: 0,
        typicalW: part?.power.typicalW ?? null,
        maxW: part?.power.maxW ?? null,
        measuredW: null,
        weightKg: part?.weightKg ?? null,
        labels: [],
        sourceUrl: part?.sourceUrl ?? null,
        missing: !part,
      };
      if (part?.printed) {
        const src = part.printed.source;
        row.printed = { url: src.url, designer: src.designer, designerUrl: src.designerUrl, licence: src.licence };
      }
      rows.set(key, row);
    }
    row.qty++;
    row.totalU += placed && p.parentId === undefined ? placed.heightU : 0;
    if (p.label) row.labels.push(p.label);
    if (part) {
      const pw = placementPower(p, part);
      if (pw?.measured) row.measuredW = (row.measuredW ?? 0) + pw.typicalW;
    }
  }
  const devices = [...rows.values()].sort((a, b) => a.category.localeCompare(b.category) || a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));

  // Cables: one line per type + length, so it reads as a shopping list.
  const cableRows = new Map<string, BomRow>();
  for (const c of design.cables ?? []) {
    const len = c.lengthM !== undefined ? `${c.lengthM} m` : 'length not set';
    const key = `${c.type}|${len}`;
    let row = cableRows.get(key);
    if (!row) {
      row = {
        partId: `cable:${key}`, brand: 'Cable', model: `${CABLE_TYPE_LABELS[c.type]} ${len}`, name: `${CABLE_TYPE_LABELS[c.type]} patch cable, ${len}`,
        category: 'cable', qty: 0, heightU: 0, totalU: 0, typicalW: null, maxW: null, measuredW: null, weightKg: null, labels: [], sourceUrl: null, missing: false,
      };
      cableRows.set(key, row);
    }
    row.qty++;
    if (c.label) row.labels.push(c.label);
  }
  return [...devices, ...[...cableRows.values()].sort((a, b) => a.model.localeCompare(b.model, undefined, { numeric: true }))];
}

const BOM_COLUMNS: [string, (r: BomRow) => string | number | null][] = [
  ['Brand', (r) => r.brand],
  ['Model', (r) => r.model],
  ['Name', (r) => r.name],
  ['Category', (r) => r.category],
  ['Qty', (r) => r.qty],
  ['U each', (r) => r.heightU],
  ['U total', (r) => r.totalU],
  ['Typical W each', (r) => r.typicalW],
  ['Max W each', (r) => r.maxW],
  ['Measured W total', (r) => r.measuredW],
  ['Weight kg each', (r) => r.weightKg],
  ['Labels', (r) => r.labels.join('; ')],
  ['Spec URL', (r) => r.sourceUrl],
  ['Model URL (3D print)', (r) => r.printed?.url ?? null],
  ['Designer', (r) => r.printed?.designer ?? null],
  ['Licence', (r) => r.printed?.licence ?? null],
];

function csvCell(v: string | number | null): string {
  if (v === null) return '';
  const s = String(v);
  // Quote when needed, and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\r\n]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function bomToCsv(rows: BomRow[]): string {
  const lines = [BOM_COLUMNS.map(([h]) => h).join(',')];
  for (const r of rows) lines.push(BOM_COLUMNS.map(([, get]) => csvCell(get(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}
