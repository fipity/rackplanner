import { expect, test } from '@playwright/test';
import { STYLE_PRESETS } from '../../packages/shared/src/schemas';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    test.beforeEach(async ({ page }) => {
      await page.goto('/_faceplates');
      await page.waitForSelector('[data-preset]');
    });
    for (const preset of STYLE_PRESETS) {
      for (const face of ['front', 'rear'] as const) {
        test(`${preset} ${face}`, async ({ page }) => {
          const el = page.locator(`[data-preset="${preset}"] [data-face="${face}"]`);
          await expect(el).toHaveScreenshot(`${preset}-${face}-${scheme}.png`);
        });
      }
    }
  });
}

test('port tooltips name the port, speed and PoE', async ({ page }) => {
  await page.goto('/d/example-rackmate-t1');
  await page.waitForSelector('svg[aria-label*="rack,"]');
  const titles = await page.locator('svg[aria-label*="rack,"] title').allTextContents();
  expect(titles).toContain('Port 1 — 1 GbE (PoE+)');
  expect(titles).toContain('Port 5 — 1 GbE');
});

test('SVG export is self-contained and honours the print style', async ({ page }) => {
  await page.goto('/d/example-rackmate-t1');
  await page.waitForSelector('svg[aria-label*="rack,"]');
  const exportSvg = async (printStyle: boolean) => {
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByLabel('Print style (LEDs off)').setChecked(printStyle);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'SVG: front + rear' }).click()]);
    const chunks = await (await download.createReadStream()).toArray();
    return Buffer.concat(chunks).toString('utf8');
  };
  const lit = await exportSvg(false);
  const print = await exportSvg(true);
  for (const svg of [lit, print]) {
    expect(svg).toContain('<symbol id="rp-rj45"');
    expect(svg).toContain('<symbol id="rp-keystone"');
    expect(svg).not.toContain('var(--');
  }
  const green = (svg: string) => svg.split('#22c55e').length;
  expect(green(print)).toBeLessThan(green(lit) - 5);
});
