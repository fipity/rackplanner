import { expect, test } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';

test('a device that only fits a shelf lying down is turned on drop', async ({ page, request }) => {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 2,
        id: 'd_dropturn',
        name: 'Drop turn',
        rack: { width: '19in', heightU: 8, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false },
        expectedPoeLoadW: null,
        placements: [
          { id: 'shelf', partId: 'generic-shelf-1u-350-19', bottomU: 3, xMm: 0, mounting: 'front', label: 'shelf' },
          // 1U of headroom: the upright NTD (3U) can't stand here.
          { id: 'blank', partId: 'generic-blank-1u-19', bottomU: 5, xMm: 0, mounting: 'front', label: 'blank' },
        ],
        cables: [],
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(res.ok()).toBe(true);
  const { id } = ((await res.json()) as { design: { id: string } }).design;

  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await page.getByLabel('Search parts').fill('CM8200B');
  const src = (await page.locator('aside li', { hasText: 'CM8200B' }).first().locator('[role=button]').first().boundingBox())!;
  const shelfBox = (await page.locator(`${rack} [role="button"][aria-label="shelf"]`).boundingBox())!;
  const svgBox = (await page.locator(rack).boundingBox())!;
  const pxPerMm = svgBox.width / 530;
  const partH = 3 * 44.45 * pxPerMm;

  await page.mouse.move(src.x + 40, src.y + 20);
  await page.mouse.down();
  await page.mouse.move(src.x + 70, src.y + 40, { steps: 4 });
  await page.mouse.move(shelfBox.x + shelfBox.width * 0.3, shelfBox.y - partH / 2 + 2, { steps: 12 });
  await page.waitForTimeout(150);
  await expect(page.getByRole('status').filter({ hasText: 'on its side' })).toBeVisible();
  await page.screenshot({ path: 'test-results/drop-turn-ghost.png' });
  await page.mouse.up();

  await expect(page.getByText('Laid on its side to fit the shelf')).toBeVisible();
  // Selected after the drop; the inspector offers to stand it back up.
  await expect(page.getByRole('button', { name: 'Upright' })).toBeVisible();
  const device = page.locator(`${rack} [role="button"][aria-label="arris-cm8200b-nbn-hfc@side"]`);
  const box = (await device.boundingBox())!;
  expect(box.width).toBeGreaterThan(box.height * 2);
  await page.screenshot({ path: 'test-results/drop-turn.png' });
});
