/**
 * Design import/export format and bill of materials. Pure functions so the
 * browser, server and tests share them.
 */
import { z } from 'zod';
import type { Catalog } from './placement.js';
import { DesignSchema, PartSchema, type Design, type Part } from './schemas.js';
import { placementPower } from './stats.js';

export const EXPORT_FORMAT = 'rackplanner-design';

export const DesignExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  design: DesignSchema,
  /** Custom parts the design uses, so it can be imported on another instance. */
  customParts: z.array(PartSchema).default([]),
});
export type DesignExport = z.infer<typeof DesignExportSchema>;

export function buildDesignExport(design: Design, catalog: Catalog, now = new Date()): DesignExport {
  const used = new Set(design.placements.map((p) => p.partId));
  const customParts = [...used].map((id) => catalog.get(id)).filter((p): p is Part => !!p && p.source === 'custom');
  return { format: EXPORT_FORMAT, formatVersion: 1, exportedAt: now.toISOString(), design, customParts };
}

export type ImportResult = { ok: true; design: Design; customParts: Part[] } | { ok: false; error: string };

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
    return { ok: true, design: r.data.design, customParts: r.data.customParts };
  }
  const r = DesignSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: describe(r.error) };
  return { ok: true, design: r.data, customParts: [] };
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
}

export function buildBom(design: Pick<Design, 'placements'>, catalog: Catalog): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const p of design.placements) {
    const part = catalog.get(p.partId);
    let row = rows.get(p.partId);
    if (!row) {
      row = {
        partId: p.partId,
        brand: part?.brand ?? '',
        model: part?.model ?? p.partId,
        name: part?.name ?? `Unknown part ${p.partId}`,
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
      rows.set(p.partId, row);
    }
    row.qty++;
    row.totalU += part && p.parentId === undefined ? part.heightU : 0;
    if (p.label) row.labels.push(p.label);
    if (part) {
      const pw = placementPower(p, part);
      if (pw?.measured) row.measuredW = (row.measuredW ?? 0) + pw.typicalW;
    }
  }
  return [...rows.values()].sort((a, b) => a.category.localeCompare(b.category) || a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
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
