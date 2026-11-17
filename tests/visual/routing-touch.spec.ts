import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';

/** Create a design from a built-in template (via the API) and open it. */
async function openTemplate(page: Page, request: APIRequestContext, name: RegExp) {
  const res = await request.get('/api/templates');
  const { templates: tpls } = (await res.json()) as { templates: { name: string; design: { id: string } }[] };
  const tpl = tpls.find((t) => name.test(t.name))!;
  const created = await request.post('/api/designs', { data: { design: { ...tpl.design, id: `d_${Date.now()}_${Math.round(Math.random() * 1e6)}` } } });
  expect(created.ok()).toBe(true);
  const id = ((await created.json()) as { design: { id: string } }).design.id;
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  return id;
}

test('cables run through the cable manager and brush panel', async ({ page, request }) => {
  await openTemplate(page, request, /Network cabinet/);
  const cables = page.locator(`${rack} g[aria-label="Cables"] > g`);
  await expect(cables.first()).toBeVisible();
  // Routed cables have rounded corners (Q segments) instead of one sagging curve (C).
  const paths = await page.locator(`${rack} g[aria-label="Cables"] > g > path:nth-of-type(2)`).evaluateAll((els) => els.map((e) => e.getAttribute('d') ?? ''));
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.filter((d) => d.includes('Q')).length).toBe(paths.length);
  await page.locator(rack).screenshot({ path: 'test-results/routing-cabinet.png' });

  await openTemplate(page, request, /Homelab 12U/);
  await page.locator(rack).screenshot({ path: 'test-results/routing-homelab.png' });
});

test('a routed cable can still be selected', async ({ page, request }) => {
  await openTemplate(page, request, /Network cabinet/);
  // Click a point on the routed path itself (an L-shaped path's box centre is off the cable).
  const pt = await page.locator(`${rack} path[role="button"][aria-label^="Cable"]`).first().evaluate((el) => {
    const path = el as SVGPathElement;
    const p = path.getPointAtLength(path.getTotalLength() * 0.5);
    const m = path.getScreenCTM()!;
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByRole('button', { name: 'Swap ends' })).toBeVisible();
});

test.describe('touch', () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

  test('two fingers pan the rack without dragging a device', async ({ page, request }) => {
    const id = await openTemplate(page, request, /Homelab 12U/);
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /zoom in/i }).click();
    const scroller = page.locator(rack).locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]');
    // Start from the middle of the scroll range so there's room both ways.
    await scroller.evaluate((el) => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    });
    const before = await scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
    const placementsBefore = ((await (await request.get(`/api/designs/${id}`)).json()) as { design: { placements: unknown[] } }).design.placements;

    const box = (await scroller.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
    // First finger, a short pause (shorter than the long-press drag delay), then the second.
    await touch('touchStart', [{ x: cx, y: cy }]);
    await page.waitForTimeout(60);
    await touch('touchStart', [{ x: cx, y: cy }, { x: cx + 60, y: cy }]);
    for (let s = 1; s <= 8; s++) {
      await touch('touchMove', [{ x: cx - s * 20, y: cy - s * 25 }, { x: cx + 60 - s * 20, y: cy - s * 25 }]);
      await page.waitForTimeout(30);
    }
    // Hold past the long-press delay: still no drag.
    await page.waitForTimeout(300);
    await touch('touchEnd', []);
    const after = await scroller.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
    expect(after.y - before.y).toBeGreaterThan(150);
    expect(after.x - before.x).toBeGreaterThan(100);
    await expect(page.locator('[data-dnd-overlay], .dnd-overlay')).toHaveCount(0);
    await page.waitForTimeout(1500); // autosave window
    const placementsAfter = ((await (await request.get(`/api/designs/${id}`)).json()) as { design: { placements: unknown[] } }).design.placements;
    expect(placementsAfter).toEqual(placementsBefore);
  });
});

test('mini PCs from Lenovo, Dell and HP have power figures', async ({ page, request }) => {
  await openTemplate(page, request, /Homelab 12U/);
  await page.getByRole('tab', { name: /Stats/ }).click();
  await expect(page.getByText(/ThinkCentre M920q.*no power data/i)).toHaveCount(0);
  await page.screenshot({ path: 'test-results/minipc-power.png' });
});
