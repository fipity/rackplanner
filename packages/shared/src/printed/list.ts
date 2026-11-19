/** "Parts to print" list for a design, with CSV and Markdown output. */
import { displayName, type Catalog } from '../placement.js';
import type { Design } from '../schemas.js';
import { uprightId } from '../turn.js';
import { PRINT_STATUS_LABELS, TO_PRINT, licenceInfo, type PrintStatus } from './schema.js';

export interface PrintRow {
  placementId: string;
  partId: string;
  /** Placement label, else the part name. */
  name: string;
  partName: string;
  filament: string;
  status: PrintStatus;
  url: string;
  site: string;
  designer: string | null;
  designerUrl: string | null;
  licence: string | null;
  profileName: string | null;
  thumbnail: string | null;
  /** Names of the devices placed inside it. */
  holds: string[];
}

/** Every placed 3D-printed part, still-to-print first, then top of the rack down. */
export function partsToPrint(design: Pick<Design, 'placements'>, catalog: Catalog): PrintRow[] {
  const rows: PrintRow[] = [];
  for (const p of design.placements) {
    const part = catalog.get(uprightId(p.partId)) ?? catalog.get(p.partId);
    if (!part?.printed) continue;
    const src = part.printed.source;
    rows.push({
      placementId: p.id,
      partId: part.id,
      name: displayName(p, part),
      partName: part.name,
      filament: p.print?.filament ?? part.printed.filament,
      status: p.print?.status ?? part.printed.status,
      url: src.url,
      site: src.site,
      designer: src.designer,
      designerUrl: src.designerUrl,
      licence: src.licence,
      profileName: src.profileName,
      thumbnail: part.printed.thumbnail,
      holds: design.placements.filter((c) => c.parentId === p.id).map((c) => displayName(c, catalog.get(c.partId))),
    });
  }
  const bottomOf = new Map(design.placements.map((p) => [p.id, p.bottomU]));
  return rows.sort(
    (a, b) => Number(TO_PRINT.has(b.status)) - Number(TO_PRINT.has(a.status)) || (bottomOf.get(b.placementId) ?? 0) - (bottomOf.get(a.placementId) ?? 0),
  );
}

function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) || safe !== v ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function partsToPrintCsv(rows: readonly PrintRow[]): string {
  const head = ['Name', 'Part', 'Filament', 'Status', 'Holds', 'Model URL', 'Print profile', 'Designer', 'Designer URL', 'Licence'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push(
      [r.name, r.partName, r.filament, PRINT_STATUS_LABELS[r.status], r.holds.join('; '), r.url, r.profileName ?? '', r.designer ?? '', r.designerUrl ?? '', r.licence ?? '']
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

const md = (s: string) => s.replace(/[\\|*_`[\]<>]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

export function partsToPrintMarkdown(designName: string, rows: readonly PrintRow[]): string {
  const left = rows.filter((r) => TO_PRINT.has(r.status)).length;
  const out = [`# Parts to print: ${md(designName)}`, '', `${rows.length} 3D-printed part${rows.length === 1 ? '' : 's'}, ${left} still to print.`, ''];
  if (!rows.length) return out.join('\n');
  out.push('| Name | Filament | Status | Holds | Model | Designer | Licence |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const lic = licenceInfo(r.licence);
    const flags = lic ? [lic.nonCommercial && 'non-commercial', lic.noDerivatives && 'no derivatives'].filter(Boolean).join(', ') : '';
    out.push(
      `| ${md(r.name)} | ${r.filament} | ${PRINT_STATUS_LABELS[r.status]} | ${md(r.holds.join(', ')) || '–'} | [${r.site === 'makerworld' ? 'MakerWorld' : md(r.site)}](${r.url}) | ${
        r.designer ? (r.designerUrl ? `[${md(r.designer)}](${r.designerUrl})` : md(r.designer)) : '–'
      } | ${r.licence ? md(r.licence) + (flags ? ` (**${flags}**)` : '') : '–'} |`,
    );
  }
  out.push('', 'Models belong to their designers; check each licence before sharing or selling prints.', '');
  return out.join('\n');
}
