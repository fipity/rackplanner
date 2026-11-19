/**
 * Export actions. Loaded on demand (dynamic import) so jsPDF and the SVG
 * renderer don't weigh down the editor.
 */
import { bomToCsv, buildBom, buildDesignExport, computeStats, licenceInfo, thumbnailIds, type Catalog, type Design } from '@rackplanner/shared';
import { thumbnailBase64 } from '../api';
import type { View } from '../../components/rack/geometry';
import { renderSheet, svgToPng } from './render';

export { download, fileStem } from './download';
import { download, fileStem } from './download';

const viewsFor = (which: View | 'both'): View[] => (which === 'both' ? ['front', 'rear'] : [which]);

export interface ExportOptions {
  /** Status LEDs lit; false gives the clean print style. */
  leds?: boolean;
}

export function exportSvg(design: Design, catalog: Catalog, which: View | 'both', opts: ExportOptions = {}): void {
  const doc = renderSheet(design, catalog, viewsFor(which), { leds: opts.leds ?? true });
  download(new Blob([doc.svg], { type: 'image/svg+xml' }), `${fileStem(design)}-${which}.svg`);
}

export async function exportPng(design: Design, catalog: Catalog, which: View | 'both', opts: ExportOptions = {}): Promise<void> {
  const doc = renderSheet(design, catalog, viewsFor(which), { leds: opts.leds ?? true });
  download(await svgToPng(doc, 3), `${fileStem(design)}-${which}.png`);
}

export function exportCsv(design: Design, catalog: Catalog): void {
  download(new Blob([bomToCsv(buildBom(design, catalog))], { type: 'text/csv;charset=utf-8' }), `${fileStem(design)}-bom.csv`);
}

/** JSON export. Cached 3D-print thumbnails are embedded (base64) unless `thumbnails: false`. */
export async function exportJson(design: Design, catalog: Catalog, opts: { thumbnails?: boolean } = {}): Promise<void> {
  const data = buildDesignExport(design, catalog);
  const ids = thumbnailIds(data.customParts);
  if (opts.thumbnails !== false && ids.length) {
    const entries = await Promise.all(ids.map(async (id) => [id, await thumbnailBase64(id)] as const));
    const thumbnails = Object.fromEntries(entries.filter((e): e is readonly [string, string] => e[1] !== null));
    if (Object.keys(thumbnails).length) data.thumbnails = thumbnails;
  }
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${fileStem(design)}.rackplanner.json`);
}

/** PDF: page 1 front + rear views, then the parts list, stats and warnings. */
export async function exportPdf(design: Design, catalog: Catalog, opts: ExportOptions = {}): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // Views are rasterised at high resolution: reliable across viewers and printers.
  const sheet = renderSheet(design, catalog, ['front', 'rear'], { leds: opts.leds ?? true });
  // Short racks make a wide sheet: use landscape for the drawing page.
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: sheet.width > sheet.height ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  let pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const png = await svgToPng(sheet, 4);
  const dataUrl = await new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(png);
  });
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const scale = Math.min(maxW / sheet.width, maxH / sheet.height);
  doc.addImage(dataUrl, 'PNG', margin + (maxW - sheet.width * scale) / 2, margin, sheet.width * scale, sheet.height * scale, undefined, 'FAST');

  // Parts list (always portrait)
  doc.addPage('a4', 'portrait');
  pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(16);
  doc.text(`${design.name}: parts list`, margin, margin + 4);
  const rows = buildBom(design, catalog);
  autoTable(doc, {
    startY: margin + 9,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235] },
    head: [['Qty', 'Brand', 'Model', 'Name', 'U', 'Typ W', 'Max W', 'kg']],
    body: rows.map((r) => [
      r.qty,
      r.brand,
      r.model,
      r.name + (r.labels.length ? `\n${r.labels.join(', ')}` : ''),
      r.totalU || r.heightU,
      r.measuredW !== null ? `${r.measuredW} (measured)` : (r.typicalW ?? '—'),
      r.maxW ?? '—',
      r.weightKg !== null ? +(r.weightKg * r.qty).toFixed(2) : '—',
    ]),
  });

  // 3D-printed parts: where the models are, credit and licence.
  const printed = rows.filter((r) => r.printed);
  if (printed.length) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin + 20;
    autoTable(doc, {
      startY: y + 6,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [22, 128, 61] },
      columnStyles: { 1: { cellWidth: 70 } },
      head: [['3D-printed part', 'Model', 'Designer', 'Licence']],
      body: printed.map((r) => {
        const lic = licenceInfo(r.printed!.licence);
        const flags = lic ? [lic.nonCommercial && 'non-commercial', lic.noDerivatives && 'no derivatives'].filter(Boolean).join(', ') : '';
        return [`${r.qty}× ${r.name}`, r.printed!.url, r.printed!.designer ?? '—', (r.printed!.licence ?? 'not stated') + (flags ? ` (${flags})` : '')];
      }),
    });
  }

  // Stats + warnings
  const stats = computeStats(design, catalog);
  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin + 20;
  const summary: [string, string][] = [
    ['Rack', `${design.rack.heightU}U ${design.rack.width === '19in' ? '19"' : '10"'}${design.rack.depthMm ? `, ${design.rack.depthMm} mm deep` : ''}`],
    ['Space', `${stats.usedU}U used, ${stats.freeU}U free`],
    ['Power', `${stats.power.typicalW} W typical, ${stats.power.maxW} W max${stats.poe.expectedLoadW ? `, ${stats.power.maxWithPoeW} W max incl. PoE load` : ''}`],
    ['UPS capacity', stats.ups.count ? `${stats.ups.capacityW} W` : 'none'],
    ['PoE budget', `${stats.poe.budgetW} W${stats.poe.expectedLoadW !== null ? ` (expected load ${stats.poe.expectedLoadW} W)` : ''}`],
    ['Weight', `${stats.weight.totalKg} kg${stats.weight.unknownIds.length ? ` (+${stats.weight.unknownIds.length} unknown)` : ''}`],
    ...(stats.printed.count ? [['3D-printed parts', `${stats.printed.count} (${stats.printed.toPrint} still to print)`] as [string, string]] : []),
  ];
  autoTable(doc, {
    startY: lastY + 8,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 1.5 },
    head: [['Summary', '']],
    headStyles: { fillColor: [55, 65, 81] },
    body: [...summary, ...stats.warnings.map((w): [string, string] => [w.severity === 'info' ? 'Note' : 'Warning', w.message])],
  });
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(`Generated by RackPlanner on ${new Date().toLocaleString()}`, margin, pageH - 6);
  doc.save(`${fileStem(design)}.pdf`);
}
