import type { Catalog, Design } from '@rackplanner/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { rackLayout, type View } from '../../components/rack/geometry';
import { RackView } from '../../components/rack/RackView';
import { resolveCssVars } from './palette';

export interface SvgDoc {
  svg: string;
  width: number;
  height: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

function rackMarkup(design: Design, catalog: Catalog, view: View, leds: boolean): { markup: string; width: number; height: number } {
  const layout = rackLayout(design.rack);
  const markup = resolveCssVars(
    renderToStaticMarkup(<RackView design={design} catalog={catalog} view={view} scale={1} cables={design.cables} lod="high" leds={leds} embedDefs />),
  );
  return { markup, width: layout.width, height: layout.height };
}

/**
 * A sheet with one or more rack views side by side, a title and view labels.
 * Units are millimetres of the drawing (1 user unit = 1 mm of rack).
 */
export function renderSheet(design: Design, catalog: Catalog, views: View[], opts: { title?: boolean; leds?: boolean } = {}): SvgDoc {
  const pad = 20;
  const titleH = opts.title === false ? 0 : 46;
  const labelH = 22;
  const gap = 40;
  const racks = views.map((v) => ({ view: v, ...rackMarkup(design, catalog, v, opts.leds ?? true) }));
  const width = pad * 2 + racks.reduce((s, r) => s + r.width, 0) + gap * (racks.length - 1);
  const height = pad * 2 + titleH + labelH + Math.max(...racks.map((r) => r.height));
  let x = pad;
  const parts: string[] = [];
  for (const r of racks) {
    const y = pad + titleH + labelH;
    parts.push(
      `<text x="${x + r.width / 2}" y="${y - 7}" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="600" fill="#374151">${r.view === 'front' ? 'Front' : 'Rear'}</text>`,
    );
    // Place the rack's own <svg> (it carries width/height/viewBox) at x,y.
    parts.push(r.markup.replace(/^<svg /, `<svg x="${x}" y="${y}" `));
    x += r.width + gap;
  }
  const rack = design.rack;
  const subtitle = `${rack.heightU}U ${rack.width === '19in' ? '19"' : '10"'} rack${rack.depthMm ? ` · ${rack.depthMm} mm deep` : ''} · ${design.placements.length} devices`;
  const title =
    titleH > 0
      ? `<text x="${pad}" y="${pad + 18}" font-family="${FONT}" font-size="20" font-weight="700" fill="#111827">${esc(design.name)}</text>` +
        `<text x="${pad}" y="${pad + 36}" font-family="${FONT}" font-size="11" fill="#6b7280">${esc(subtitle)}</text>`
      : '';
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>${title}${parts.join('')}</svg>`;
  return { svg, width, height };
}

/** Rasterise an SVG document to a PNG blob at `pxPerUnit` pixels per drawing unit. */
export async function svgToPng(doc: SvgDoc, pxPerUnit = 3): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([doc.svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the rack image'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(doc.width * pxPerUnit);
    canvas.height = Math.round(doc.height * pxPerUnit);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
