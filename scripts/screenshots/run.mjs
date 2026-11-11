#!/usr/bin/env node
/**
 * Generate every README image from the running app. Never hand-edit the
 * output: rerun `npm run screenshots` instead.
 *
 * Starts the built server on a scratch database (the example designs seed
 * themselves), drives Chromium with Playwright, then optimises the PNGs and
 * encodes the drag-and-drop GIF.
 *
 * Needs `npm run build` first (the npm script does it) and Playwright's
 * Chromium (`npx playwright install chromium`, or run inside the
 * mcr.microsoft.com/playwright image).
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'docs', 'images');
const PORT = Number(process.env.SCREENSHOT_PORT ?? 8097);
const T1 = 'example-rackmate-t1';
const HOMELAB = 'example-homelab-24u';

mkdirSync(out, { recursive: true });
const log = (...a) => console.log('[screenshots]', ...a);

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
// BASE_URL: use a server you started yourself on a fresh data dir (e.g. when
// the browser runs under a different Node version than the server).
const external = process.env.BASE_URL;
const BASE = external ?? `http://127.0.0.1:${PORT}`;
const dataDir = external ? null : mkdtempSync(path.join(tmpdir(), 'rp-shots-'));
const server = external
  ? null
  : spawn(process.execPath, [path.join(root, 'apps/server/dist/index.js')], {
      env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, LOG_LEVEL: 'warn', EXAMPLES_DIR: path.join(root, 'examples') },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
const stop = () => {
  server?.kill('SIGTERM');
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
};
process.on('exit', stop);

for (let i = 0; ; i++) {
  try {
    const r = await fetch(`${BASE}/api/designs`);
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  if (i > 100) throw new Error(`server at ${BASE} did not respond`);
  await new Promise((r) => setTimeout(r, 150));
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------
const browser = await chromium.launch();
const errors = [];

async function newPage({ scheme = 'dark', width = 1600, height = 1000, scale = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  return page;
}

async function openDesign(page, id, { view = 'Front' } = {}) {
  await page.goto(`${BASE}/d/${id}`);
  await page.waitForSelector('svg[aria-label*="rack"]');
  if (view !== 'Front') await page.getByRole('radio', { name: view }).click();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(500);
}

const rackSvg = (page) => page.locator('svg[aria-label*="rack,"]').first();

async function save(name, buf) {
  const file = path.join(out, name);
  // Palette PNGs: large flat areas compress well and stay visually lossless.
  const png = await sharp(buf).png({ compressionLevel: 9, effort: 10, palette: true, quality: 92, dither: 0.6 }).toBuffer();
  writeFileSync(file, png);
  log(`${name} ${(png.length / 1024).toFixed(0)} KB`);
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------
{
  // Hero: the full editor with the RackMate T1 build, dark mode, 1600 px wide.
  const page = await newPage({ width: 1600, height: 1000 });
  await openDesign(page, T1);
  await save('hero.png', await page.screenshot());

  // My build, front and rear: the rack drawing on its own, at 2× for crispness.
  for (const view of ['Front', 'Rear']) {
    const p = await newPage({ width: 1100, height: 1300, scale: 2 });
    await openDesign(p, T1, { view });
    await save(`rackmate-t1-${view.toLowerCase()}.png`, await rackSvg(p).screenshot());
    await p.context().close();
  }

  // Shelf plans (top-down view) of the build.
  await page.getByRole('radio', { name: 'Shelves' }).click();
  await page.waitForTimeout(300);
  await save('rackmate-t1-shelves.png', await page.locator('[data-shot=shelf-plans]').screenshot());
  await page.context().close();
}
{
  const page = await newPage({ width: 2100, height: 2700, scale: 1 });
  await openDesign(page, HOMELAB);
  await save('full-19in-rack.png', await rackSvg(page).screenshot());
  await page.context().close();
}
for (const scheme of ['light', 'dark']) {
  const page = await newPage({ scheme, width: 1600, height: 1000 });
  await openDesign(page, HOMELAB);
  await save(`${scheme}-mode.png`, await page.screenshot());
  await page.context().close();
}
{
  // Catalog with search and filters in use.
  const page = await newPage({ width: 1600, height: 1000 });
  await openDesign(page, T1);
  await page.getByLabel('Filters', { exact: true }).click();
  await page.getByLabel('Brand', { exact: true }).selectOption({ label: 'Ubiquiti' }).catch(async () => page.getByLabel('Brand', { exact: true }).selectOption('Ubiquiti'));
  await page.getByLabel('PoE', { exact: true }).selectOption('yes');
  await page.getByLabel('Search parts').fill('switch');
  await page.waitForTimeout(400);
  await save('catalog.png', await page.screenshot({ clip: { x: 0, y: 0, width: 760, height: 1000 } }));
  await page.context().close();
}
{
  // Custom part builder with its live faceplate preview.
  const page = await newPage({ width: 1600, height: 1000 });
  await openDesign(page, T1);
  await page.getByLabel('Search parts').fill('USW-Lite-8-PoE');
  await page.waitForTimeout(300);
  await page.getByLabel('Customise a copy of UniFi Switch Lite 8 PoE', { exact: true }).first().dispatchEvent('click');
  await page.waitForSelector('dialog[open]');
  await page.locator('dialog[open] legend', { hasText: 'Faceplate layout' }).scrollIntoViewIfNeeded();
  await page.locator('dialog[open] form').evaluate((f) => f.scrollBy(0, 160));
  await page.waitForTimeout(400);
  await save('custom-part-builder.png', await page.locator('dialog[open]').first().screenshot());
  await page.context().close();
}
{
  // Drag and drop: drag a switch from the catalog into the rack, then move it.
  const page = await newPage({ width: 1280, height: 760 });
  const res = await page.request.post(`${BASE}/api/designs`, { data: { name: 'Drag demo', rack: { width: '19in', heightU: 9, frame: 'open-4post' } } });
  const { design } = await res.json();
  await openDesign(page, design.id);
  await page.getByLabel('Search parts').fill('usw-pro-max-24-poe');
  await page.waitForTimeout(400);
  const item = page.locator('aside li [role=button]').first();
  const svg = rackSvg(page);
  const ib = await item.boundingBox();
  const sb = await svg.boundingBox();
  // Below the toolbar: catalog, rack and stats only.
  const top = Math.round((await page.locator('aside').first().boundingBox()).y);
  const clip = { x: 0, y: top, width: 1280, height: 760 - top };
  const frames = [];
  const grab = async () => frames.push(await page.screenshot({ clip, type: 'png' }));
  const glide = async (from, to, steps) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
      await grab();
    }
  };
  const start = { x: ib.x + ib.width / 2, y: ib.y + ib.height / 2 };
  const slot = (u) => ({ x: sb.x + sb.width / 2, y: sb.y + sb.height * (1 - (u - 0.5) / 10.2) - 8 });
  for (let i = 0; i < 4; i++) await grab();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 4);
  await glide(start, slot(7), 22);
  for (let i = 0; i < 3; i++) await grab();
  await page.mouse.up();
  await page.waitForTimeout(250);
  for (let i = 0; i < 5; i++) await grab();
  const a = slot(7);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, a.y + 6);
  await glide(a, slot(3), 18);
  for (let i = 0; i < 2; i++) await grab();
  await page.mouse.up();
  await page.waitForTimeout(250);
  for (let i = 0; i < 8; i++) await grab();

  const W = 760;
  const H = Math.round((clip.height / clip.width) * W);
  const enc = GIFEncoder();
  let palette = null;
  for (const f of frames) {
    const { data } = await sharp(f).resize(W, H).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (!palette) palette = quantize(data, 256);
    enc.writeFrame(applyPalette(data, palette), W, H, { palette, delay: 80 });
  }
  enc.finish();
  writeFileSync(path.join(out, 'drag-and-drop.gif'), enc.bytes());
  log(`drag-and-drop.gif ${frames.length} frames, ${(frames.length * 0.08).toFixed(1)} s, ${(enc.bytes().length / 1024).toFixed(0)} KB`);
  await page.context().close();
}

// ---------------------------------------------------------------------------
// Device SVGs (rendered in Node with the same components)
// ---------------------------------------------------------------------------
execFileSync(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', path.join(root, 'scripts/tsconfig.json'), path.join(root, 'scripts/screenshots/render-devices.tsx')], {
  stdio: 'inherit',
  cwd: root,
});

{
  // Social preview, 1280 × 640: composed from RackPlanner's own renders.
  const page = await newPage({ width: 1280, height: 640 });
  const front = readFileSync(path.join(out, 'rackmate-t1-front.png')).toString('base64');
  const rack19 = readFileSync(path.join(out, 'full-19in-rack.png')).toString('base64');
  await page.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:640px;background:radial-gradient(circle at 70% 40%,#1e293b,#09090b 70%);font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f8fafc;display:flex;align-items:center;overflow:hidden">
    <div style="padding:0 0 0 72px;width:560px">
      <div style="font-size:64px;font-weight:800;letter-spacing:-1.5px">RackPlanner</div>
      <div style="font-size:26px;line-height:1.35;color:#cbd5e1;margin-top:14px">Plan 19″ and 10″ racks with detailed, data-driven faceplates.</div>
      <div style="font-size:18px;color:#94a3b8;margin-top:22px">Self-hosted · drag and drop · cables · power &amp; PoE stats</div>
    </div>
    <img src="data:image/png;base64,${rack19}" style="height:600px;margin-left:10px;filter:drop-shadow(0 20px 30px #000a)">
    <img src="data:image/png;base64,${front}" style="height:420px;margin-left:24px;filter:drop-shadow(0 20px 30px #000a)">
  </body></html>`);
  await page.waitForTimeout(300);
  await save('social-preview.png', await page.screenshot());
  await page.context().close();
}

await browser.close();
stop();

// Budget check: the whole folder must stay under 15 MB.
const size = (dir) => readdirSync(dir).reduce((s, f) => s + (statSync(path.join(dir, f)).isDirectory() ? size(path.join(dir, f)) : statSync(path.join(dir, f)).size), 0);
const total = size(out);
log(`docs/images total ${(total / 1024 / 1024).toFixed(2)} MB`);
if (errors.length) log(`browser errors:\n  ${errors.join('\n  ')}`);
if (total > 15 * 1024 * 1024) {
  console.error('docs/images is over the 15 MB budget');
  process.exit(1);
}
