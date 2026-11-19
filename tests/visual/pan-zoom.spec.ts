/**
 * Free panning and zooming in the rack editor. Runs in Chromium, Firefox and
 * at tablet size (see playwright.config.ts projects).
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const rack = '[data-stage] > svg';
const canvasSel = '[data-rack-canvas]';
const U_MM = 44.45;

async function newDesign(request: APIRequestContext, name: string, rack: Record<string, unknown>, placements: unknown[]) {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 2,
        id: `d_${name}`,
        name,
        rack: { width: '10in', heightU: 12, depthMm: null, numbering: 'bottom-up', frame: 'mini-10in', glassDoor: false, ...rack },
        expectedPoeLoadW: null,
        placements,
        cables: [],
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { design: { id: string } }).design.id;
}

async function open(page: Page, id: string) {
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await page.waitForTimeout(100);
}

/** Wait for the next frames (the view transform is applied in requestAnimationFrame). */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const rackBox = async (page: Page) => {
  await settle(page);
  return (await page.locator(rack).boundingBox())!;
};
const canvasBox = async (page: Page) => (await page.locator(canvasSel).boundingBox())!;
const zoomPct = async (page: Page) => Number((await page.getByRole('button', { name: /^Zoom \d+%/ }).innerText()).replace('%', ''));
const placements = async (request: APIRequestContext, id: string) =>
  ((await (await request.get(`/api/designs/${id}`)).json()) as { design: { placements: { id: string; partId: string; bottomU: number }[] } }).design.placements;

/** An empty spot on the canvas (top-left corner, clear of the rack and the overlay buttons). */
async function emptySpot(page: Page) {
  const c = await canvasBox(page);
  return { x: c.x + 16, y: c.y + 60 };
}

test('drag on empty space pans, and a plain click still deselects', async ({ page, request }) => {
  const id = await newDesign(request, 'pan-empty', {}, [{ id: 'v', partId: 'deskpi-rackmate-vent-1u', bottomU: 6, xMm: 0, mounting: 'front', label: 'ref' }]);
  await open(page, id);
  const before = await rackBox(page);
  const p = await emptySpot(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 40, { steps: 3 });
  await page.mouse.move(p.x + 120, p.y + 90, { steps: 3 });
  await page.mouse.up();
  const after = await rackBox(page);
  expect(after.x - before.x).toBeCloseTo(120, 0);
  expect(after.y - before.y).toBeCloseTo(90, 0);

  // Select, then a click on empty space deselects (no pan).
  await page.waitForTimeout(100);
  await page.locator(`${rack} [role="button"][aria-label="ref"]`).click();
  await expect(page.getByRole('tab', { name: 'Device' })).toHaveAttribute('aria-selected', 'true');
  const selected = await rackBox(page);
  const q = await emptySpot(page);
  await page.mouse.click(q.x, q.y);
  await expect(page.getByRole('tab', { name: 'Device' })).not.toBeVisible();
  expect((await rackBox(page)).x).toBeCloseTo(selected.x, 0);
});

test('Space + drag pans even over a device, which stays put', async ({ page, request }) => {
  const id = await newDesign(request, 'pan-space', {}, [{ id: 'v', partId: 'deskpi-rackmate-vent-1u', bottomU: 6, xMm: 0, mounting: 'front', label: 'ref' }]);
  await open(page, id);
  const dev = (await page.locator(`${rack} [role="button"][aria-label="ref"]`).boundingBox())!;
  const before = await rackBox(page);
  await page.mouse.move(dev.x + dev.width / 2, dev.y + dev.height / 2);
  await page.keyboard.down('Space');
  await expect(page.locator(canvasSel)).toHaveClass(/cursor-grab/);
  await page.mouse.down();
  await page.mouse.move(dev.x + dev.width / 2 - 50, dev.y + dev.height / 2 + 30, { steps: 4 });
  await page.mouse.move(dev.x + dev.width / 2 - 100, dev.y + dev.height / 2 + 70, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const after = await rackBox(page);
  expect(after.x - before.x).toBeCloseTo(-100, 0);
  expect(after.y - before.y).toBeCloseTo(70, 0);
  await page.waitForTimeout(1200);
  expect((await placements(request, id))[0]!.bottomU).toBe(6);
});

test('middle-button drag pans', async ({ page, request }) => {
  const id = await newDesign(request, 'pan-middle', {}, []);
  await open(page, id);
  const before = await rackBox(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(c.x + c.width / 2 + 80, c.y + c.height / 2 - 60, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  const after = await rackBox(page);
  expect(after.x - before.x).toBeCloseTo(80, 0);
  expect(after.y - before.y).toBeCloseTo(-60, 0);
});

test('wheel pans vertically, Shift + wheel sideways, trackpad diagonally; the page never scrolls', async ({ page, request }) => {
  const id = await newDesign(request, 'pan-wheel', {}, []);
  await open(page, id);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  let before = await rackBox(page);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => before.y - (await rackBox(page)).y).toBeCloseTo(100, 0);

  before = await rackBox(page);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  await expect.poll(async () => before.x - (await rackBox(page)).x).toBeCloseTo(100, 0);
  expect((await rackBox(page)).y).toBeCloseTo(before.y, 0);

  before = await rackBox(page);
  await page.mouse.wheel(40, 30);
  await expect.poll(async () => before.x - (await rackBox(page)).x).toBeCloseTo(40, 0);
  expect(before.y - (await rackBox(page)).y).toBeCloseTo(30, 0);

  expect(await page.evaluate(() => [window.scrollX, window.scrollY, document.scrollingElement?.scrollTop ?? 0])).toEqual([0, 0, 0]);
});

test('Ctrl + wheel zooms towards the cursor: the point under it stays put', async ({ page, request }) => {
  const id = await newDesign(request, 'zoom-cursor', {}, []);
  await open(page, id);
  const before = await rackBox(page);
  // A point in the lower-right part of the rack, not the centre.
  // Whole pixels: browsers report wheel-event coordinates rounded.
  const cursor = { x: Math.round(before.x + before.width * 0.8), y: Math.round(before.y + before.height * 0.7) };
  const rel = { x: (cursor.x - before.x) / before.width, y: (cursor.y - before.y) / before.height };
  const pct0 = await zoomPct(page);
  await page.mouse.move(cursor.x, cursor.y);
  await page.keyboard.down('Control');
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(() => zoomPct(page)).toBeGreaterThan(pct0 * 1.5);
  await page.waitForTimeout(100);
  const after = await rackBox(page);
  expect(after.x + after.width * rel.x).toBeCloseTo(cursor.x, 0);
  expect(after.y + after.height * rel.y).toBeCloseTo(cursor.y, 0);
  // The browser's page zoom didn't change.
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test('zoom % can be typed, buttons zoom around the centre, F fits, 0 resets', async ({ page, request }) => {
  const id = await newDesign(request, 'zoom-ui', {}, []);
  await open(page, id);
  await page.getByRole('button', { name: /^Zoom \d+%/ }).click();
  await page.getByLabel('Zoom percentage').fill('250');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Zoom 250%/ })).toBeVisible();

  const c = await canvasBox(page);
  const centre = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  const b0 = await rackBox(page);
  const rel = { x: (centre.x - b0.x) / b0.width, y: (centre.y - b0.y) / b0.height };
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const b1 = await rackBox(page);
  expect(b1.x + b1.width * rel.x).toBeCloseTo(centre.x, 0);
  expect(b1.y + b1.height * rel.y).toBeCloseTo(centre.y, 0);

  // Limits: 10% to 800%.
  await page.getByRole('button', { name: /^Zoom \d+%/ }).click();
  await page.getByLabel('Zoom percentage').fill('5000');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Zoom 800%/ })).toBeVisible();

  await page.keyboard.press('f');
  const fitted = await rackBox(page);
  expect(fitted.y).toBeGreaterThanOrEqual(c.y - 1);
  expect(fitted.y + fitted.height).toBeLessThanOrEqual(c.y + c.height + 1);

  await page.keyboard.press('0');
  await expect(page.getByRole('button', { name: /^Zoom 100%/ })).toBeVisible();
  const reset = await rackBox(page);
  expect(reset.x + reset.width / 2).toBeCloseTo(centre.x, 0);
});

test('drop a device at 300% zoom, panned: it lands in the U under the pointer', async ({ page, request }) => {
  const id = await newDesign(request, 'zoom-drop', {}, [{ id: 'v', partId: 'deskpi-rackmate-vent-1u', bottomU: 4, xMm: 0, mounting: 'front', label: 'ref' }]);
  await open(page, id);
  const ref = page.locator(`${rack} [role="button"][aria-label="ref"]`);
  await ref.click();
  await page.keyboard.press('Shift+Digit2'); // zoom to the selection
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Zoom \d+%/ }).click();
  await page.getByLabel('Zoom percentage').fill('300');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Zoom 300%/ })).toBeVisible();
  // Pan a little so the view isn't centred on anything.
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.wheel(30, -60);
  await page.waitForTimeout(100);

  await settle(page);
  const r = (await ref.boundingBox())!;
  const uPx = U_MM * 3;
  expect(r.height).toBeCloseTo(uPx, 0);
  // Two U above the reference panel (U6), in the middle of the slot.
  const target = { x: Math.min(Math.max(r.x + r.width / 2, c.x + 40), c.x + c.width - 40), y: r.y - uPx * 1.5 };
  expect(target.y).toBeGreaterThan(c.y);

  await page.getByLabel('Search parts').fill('BLANK-1U-10');
  const item = page.locator('aside [role="button"]').filter({ hasText: '10" blank panel 1U' }).first();
  await item.scrollIntoViewIfNeeded();
  const src = (await item.boundingBox())!;
  await page.mouse.move(src.x + 30, src.y + 20);
  await page.mouse.down();
  await page.mouse.move(src.x + 60, src.y + 40, { steps: 4 });
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect.poll(async () => (await placements(request, id)).find((p) => p.partId === 'generic-blank-1u-10in')?.bottomU, { timeout: 4000 }).toBe(6);
});

test('dragging a device near the canvas edge pans the view', async ({ page, request }) => {
  const id = await newDesign(request, 'edge-pan', { heightU: 32, width: '19in', frame: 'open-4post' }, [
    { id: 'v', partId: 'generic-blank-1u-19', bottomU: 20, xMm: 0, mounting: 'front', label: 'mover' },
  ]);
  await open(page, id);
  await page.getByRole('button', { name: /^Zoom \d+%/ }).click();
  await page.getByLabel('Zoom percentage').fill('200');
  await page.keyboard.press('Enter');
  const dev = page.locator(`${rack} [role="button"][aria-label="mover"]`);
  await dev.scrollIntoViewIfNeeded(); // focus-style scrolls become pans too
  await settle(page);
  const d = (await dev.boundingBox())!;
  const c = await canvasBox(page);
  const before = await rackBox(page);
  // Grab a visible part of the device (at 200% it's wider than the canvas).
  const gx = Math.max(d.x, c.x) + 60;
  await page.mouse.move(gx, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(gx + 10, d.y + d.height / 2 + 20, { steps: 4 });
  await page.mouse.move(gx + 10, c.y + c.height - 6, { steps: 10 });
  await page.waitForTimeout(700);
  const during = await rackBox(page);
  await page.mouse.up();
  expect(before.y - during.y).toBeGreaterThan(100);
});

test('the rack can be panned far away, then brought back', async ({ page, request }) => {
  const id = await newDesign(request, 'back', {}, []);
  await open(page, id);
  const c = await canvasBox(page);
  await expect(page.getByRole('button', { name: 'Back to rack' })).toHaveCount(0);
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  const far = await rackBox(page);
  // Soft bound: at most one viewport of empty space past the canvas edge, never further.
  expect(far.y).toBeGreaterThan(c.y + c.height);
  expect(far.y).toBeLessThanOrEqual(c.y + 2 * c.height + 2);
  await page.getByRole('button', { name: 'Back to rack' }).click();
  const back = await rackBox(page);
  expect(back.y + back.height / 2).toBeCloseTo(c.y + c.height / 2, 0);
});

test('arrow keys pan when nothing is selected, and move the device when it is', async ({ page, request }) => {
  const id = await newDesign(request, 'arrows', {}, [{ id: 'v', partId: 'deskpi-rackmate-vent-1u', bottomU: 6, xMm: 0, mounting: 'front', label: 'ref' }]);
  await open(page, id);
  let before = await rackBox(page);
  await page.keyboard.press('ArrowRight');
  expect(before.x - (await rackBox(page)).x).toBeCloseTo(60, 0);
  before = await rackBox(page);
  await page.keyboard.press('Shift+ArrowDown');
  expect(before.y - (await rackBox(page)).y).toBeCloseTo(240, 0);
  await page.keyboard.press('0');
  await page.waitForTimeout(100);
  await page.locator(`${rack} [role="button"][aria-label="ref"]`).click();
  before = await rackBox(page);
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await placements(request, id))[0]!.bottomU, { timeout: 4000 }).toBe(7);
  expect((await rackBox(page)).y).toBeCloseTo(before.y, 0);
});

test('zoom and pan are remembered per design, and the minimap choice too', async ({ page, request }) => {
  const id = await newDesign(request, 'remember', {}, []);
  await open(page, id);
  await page.getByRole('button', { name: /^Zoom \d+%/ }).click();
  await page.getByLabel('Zoom percentage').fill('237');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'Minimap' }).click();
  await expect(page.getByRole('img', { name: /Minimap/ })).toBeVisible();
  const before = await rackBox(page);
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector(rack);
  await expect(page.getByRole('button', { name: /^Zoom 237%/ })).toBeVisible();
  const after = await rackBox(page);
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  await expect(page.getByRole('button', { name: 'Minimap' })).toHaveAttribute('aria-pressed', 'true');

  // Dragging in the minimap moves the view.
  const mini = (await page.getByRole('img', { name: /Minimap/ }).boundingBox())!;
  await page.mouse.click(mini.x + 4, mini.y + 4);
  const moved = await rackBox(page);
  expect(Math.abs(moved.y - after.y) + Math.abs(moved.x - after.x)).toBeGreaterThan(50);
  await expect(page.getByTestId('minimap-viewport')).toBeVisible();
});

test('the shortcuts popup opens with ?', async ({ page, request }) => {
  const id = await newDesign(request, 'help', {}, []);
  await open(page, id);
  await page.keyboard.press('Shift+Slash');
  const dlg = page.getByRole('dialog', { name: 'Shortcuts' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText('Space + drag')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
});

test.describe('touch', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'touch input via the Chrome DevTools protocol');
  test.use({ hasTouch: true });

  test('one finger on empty space pans; a pinch zooms and pans', async ({ page, request }) => {
    const id = await newDesign(request, 'touch', {}, []);
    await open(page, id);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
    const p = await emptySpot(page);
    let before = await rackBox(page);
    await touch('touchStart', [p]);
    for (let s = 1; s <= 6; s++) await touch('touchMove', [{ x: p.x + s * 15, y: p.y + s * 10 }]);
    await touch('touchEnd', []);
    let after = await rackBox(page);
    expect(after.x - before.x).toBeCloseTo(90, 0);
    expect(after.y - before.y).toBeCloseTo(60, 0);

    // Pinch out around a point: zooms in, and that point stays under the fingers.
    before = after;
    const c = await canvasBox(page);
    const mid = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
    const rel = { x: (mid.x - before.x) / before.width, y: (mid.y - before.y) / before.height };
    await touch('touchStart', [{ x: mid.x - 40, y: mid.y }]);
    await touch('touchStart', [{ x: mid.x - 40, y: mid.y }, { x: mid.x + 40, y: mid.y }]);
    for (let s = 1; s <= 8; s++) await touch('touchMove', [{ x: mid.x - 40 - s * 5, y: mid.y }, { x: mid.x + 40 + s * 5, y: mid.y }]);
    await touch('touchEnd', []);
    after = await rackBox(page);
    expect(after.width / before.width).toBeCloseTo(2, 1);
    expect(after.x + after.width * rel.x).toBeCloseTo(mid.x, 0);
    expect(after.y + after.height * rel.y).toBeCloseTo(mid.y, 0);
  });
});

test('panning a full rack never touches the device drawing (no re-render)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium');
  await page.goto('/d/example-homelab-24u');
  await page.waitForSelector(rack);
  await settle(page);
  // Count DOM changes inside the rack drawing while panning.
  await page.evaluate(() => {
    const w = window as unknown as { __mut: number; __frames: number[] };
    w.__mut = 0;
    w.__frames = [];
    new MutationObserver((list) => (w.__mut += list.length)).observe(document.querySelector('[data-stage] > svg')!, { subtree: true, childList: true, attributes: true, characterData: true });
    let last = performance.now();
    const tick = (now: number) => {
      w.__frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const c = await canvasBox(page);
  const p = await emptySpot(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 60; i++) await page.mouse.move(p.x + i * 4, p.y + Math.sin(i / 6) * 80);
  await page.mouse.up();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  for (let i = 0; i < 20; i++) await page.mouse.wheel(7, 11);
  await settle(page);
  const { mut, frames } = await page.evaluate(() => {
    const w = window as unknown as { __mut: number; __frames: number[] };
    return { mut: w.__mut, frames: w.__frames.slice(2) };
  });
  expect(mut).toBe(0);
  const sorted = [...frames].sort((a, b) => a - b);
  console.log(`frames: ${frames.length}, median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)} ms, p95 ${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(1)} ms`);
});
