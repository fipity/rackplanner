import { expect, test } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';
const NTD = 'nbn HFC NTD (Arris CM8200B)';

async function newDesign(request: import('@playwright/test').APIRequestContext, id: string, rackOver: object, placements: unknown[]) {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 2, id, name: 'Fit and pan',
        rack: { width: '19in', heightU: 12, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false, ...rackOver },
        expectedPoeLoadW: null, placements, cables: [], createdAt: now, updatedAt: now,
      },
    },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { design: { id: string } }).design.id;
}

test('the nbn HFC NTD lies down when it is too tall to stand on a shelf', async ({ page, request }) => {
  const id = await newDesign(request, 'd_fit', {}, [{ id: 'shelf', partId: 'generic-shelf-1u-350-19', bottomU: 2, xMm: 0, mounting: 'front', label: 'shelf' }]);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await page.getByLabel('Search parts').fill('CM8200B');
  await page.locator('aside li', { hasText: NTD }).first().locator('[role=button]').first().click();
  await expect(page.locator(`${rack} [role="button"][aria-label="${NTD}, on its side"]`)).toBeVisible();
  await expect(page.getByText(/on its side to fit/)).toBeVisible();
  await page.getByRole('tab', { name: /Stats/ }).click();
  await expect(page.getByText(/is 132 mm tall/)).toHaveCount(0);
});

test('power points for the wall count as outlets', async ({ page, request }) => {
  const id = await newDesign(request, 'd_gpo', { wall: true }, []);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await page.getByLabel('Search parts').fill('power point');
  for (const name of ['Single power point (AU/NZ)', 'Double power point with USB-A + USB-C (AU/NZ)', 'Double power point (UK, BS 1363)', 'Double power point (EU Schuko)', 'Duplex power outlet (US, NEMA 5-15R)']) {
    await expect(page.locator('aside li', { hasText: name }).first()).toBeVisible();
  }
  await page.locator('aside li', { hasText: 'Double power point with USB-A + USB-C (AU/NZ)' }).first().locator('[role=button]').first().click();
  await expect(page.locator(`${rack} [role="button"][aria-label="Double power point with USB-A + USB-C (AU/NZ), on the wall"]`)).toBeVisible();
  await page.screenshot({ path: 'test-results/fit-gpo.png' });
});

test('holding the right mouse button drags the view around', async ({ page, request }) => {
  const id = await newDesign(request, 'd_pan', { heightU: 32 }, []);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /zoom in/i }).click();
  const canvas = page.locator('[data-rack-canvas]');
  const before = (await page.locator(rack).boundingBox())!;
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx - 150, cy - 200, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const after = (await page.locator(rack).boundingBox())!;
  // The rack follows the pointer exactly.
  expect(before.y - after.y).toBeCloseTo(200, 0);
  expect(before.x - after.x).toBeCloseTo(150, 0);
});
