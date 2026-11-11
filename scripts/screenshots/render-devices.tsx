/**
 * Render front faceplates to standalone SVG files for the README
 * (docs/images/devices/). Uses the same React components as the app.
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/screenshots/render-devices.tsx
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { RACK_OPENING_MM, STYLE_PRESETS, U_MM, isFullWidth, partWidthMm, resolvePreset, type Part, type StylePreset } from '@rackplanner/shared';
import { loadCatalogDir } from '../../apps/server/src/catalog.js';
import { Faceplate, bodyHeight } from '../../apps/web/src/components/faceplates/Faceplate';
import { FaceplateDefs } from '../../apps/web/src/components/faceplates/Defs';
import { RAIL } from '../../apps/web/src/components/rack/geometry';
import { resolveCssVars } from '../../apps/web/src/lib/export/palette';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'docs', 'images', 'devices');
const { parts } = loadCatalogDir(path.join(root, 'catalog'));
const byId = new Map(parts.map((p) => [p.id, p]));

/** My RackMate T1 build, then one reference device per style preset. */
export const BUILD = ['raspberry-pi-4-case', 'ubiquiti-ucg-ultra', 'ubiquiti-usw-lite-8-poe', 'ubiquiti-unvr-instant', 'deskpi-rackmate-patch-12-keystone-1u'];
export const PRESET_REFERENCE: Record<StylePreset, string[]> = {
  'unifi-silver': ['ubiquiti-usw-pro-max-24-poe', 'ubiquiti-usw-pro-24-poe'],
  'unifi-black': ['ubiquiti-usw-enterprise-24-poe', 'ubiquiti-udm-pro-max'],
  'unifi-white': ['ubiquiti-ucg-ultra'],
  'dell-bezel': ['dell-poweredge-r740'],
  hpe: [],
  synology: ['synology-rs822-plus'],
  mikrotik: [],
  'generic-black': ['generic-switch-8p-10in'],
  'generic-silver': [],
  'patch-panel': ['generic-patch-24-cat6-keystone-1u'],
  'brush-panel': ['generic-brush-1u-19'],
  shelf: ['deskpi-rackmate-shelf-1u'],
  pdu: ['generic-pdu-1u-8-c13'],
  ups: ['apc-smt1500rmi2u'],
  'rpi-case': ['raspberry-pi-4-case'],
};

export function referencePart(preset: StylePreset): Part | undefined {
  for (const id of PRESET_REFERENCE[preset]) {
    const p = byId.get(id);
    if (p && resolvePreset(p) === preset) return p;
  }
  return parts.find((p) => resolvePreset(p) === preset && p.render.style !== 'shelf') ?? parts.find((p) => resolvePreset(p) === preset);
}

export function faceSvg(part: Part, view: 'front' | 'rear', leds = true): string {
  const rackWidth = part.rackWidths.includes('19in') && part.width !== '10in' ? '19in' : '10in';
  const ears = part.formFactor === 'rack' && isFullWidth(part, rackWidth);
  const w = ears ? RACK_OPENING_MM[rackWidth] + RAIL * 2 : partWidthMm(part);
  const fullH = part.heightU * U_MM;
  const h = part.formFactor === 'desktop' ? bodyHeight(part, fullH) : fullH;
  const pad = 2;
  const body = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`} width={Math.round((w + pad * 2) * 3)} height={Math.round((h + pad * 2) * 3)}>
      <title>{`${part.name} (${view})`}</title>
      <FaceplateDefs />
      <Faceplate part={part} w={w} h={h} ears={ears} view={view} lod="high" leds={leds} />
    </svg>,
  );
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + resolveCssVars(body);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const written: string[] = [];
  for (const id of BUILD) {
    const part = byId.get(id)!;
    writeFileSync(path.join(out, `${id}.svg`), faceSvg(part, 'front'));
    written.push(`${id}.svg`);
  }
  for (const preset of STYLE_PRESETS) {
    const part = referencePart(preset);
    if (!part) continue;
    writeFileSync(path.join(out, `preset-${preset}.svg`), faceSvg(part, 'front'));
    written.push(`preset-${preset}.svg (${part.id})`);
  }
  console.log(`devices: ${written.length} SVGs\n  ${written.join('\n  ')}`);
}
