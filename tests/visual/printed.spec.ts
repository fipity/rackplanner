/**
 * 3D-printed parts: paste a MakerWorld link (the server's fetch is mocked in
 * the browser, so the real site is never contacted), confirm the form, place
 * the mount in a 10" rack with its device, and drag it: the device follows.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';
const LINK = 'https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248';

async function newDesign(request: APIRequestContext, id: string) {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 2,
        id,
        name: 'Printed test',
        rack: { width: '10in', heightU: 8, depthMm: 212, numbering: 'bottom-up', frame: 'rackmate-t1', glassDoor: false },
        expectedPoeLoadW: null,
        placements: [],
        cables: [],
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { design: { id: string } }).design.id;
}

async function mockResolve(page: Page, fetched: boolean) {
  await page.route('**/api/printed/resolve', (route) =>
    route.fulfill({
      json: {
        parsed: { site: 'makerworld', modelId: '2424584', slug: 'unifi-nvr-instant-10-inch-rackmount', profileId: '2659248', canonicalUrl: LINK },
        details: fetched
          ? { title: 'UniFi NVR Instant 10 inch Rackmount 2U', designer: 'Test Designer', designerUrl: 'https://makerworld.com/en/@testdesigner', description: 'A test model.', licence: 'CC BY-NC-SA', profileName: 'PETG 0.2 mm' }
          : null,
        thumbnail: null,
        fetched,
        reason: fetched ? null : 'The site blocked the automatic request',
        fetchedAt: new Date().toISOString(),
        cached: false,
      },
    }),
  );
}

/** Centre of a placement's drawing, by its accessible name. */
async function centreOf(page: Page, name: string) {
  const box = (await page.locator(`${rack} [role="button"][aria-label="${name}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, h: box.height, left: box.x };
}

test('paste a MakerWorld link, place the mount with its device, drag them together', async ({ page, request }) => {
  const id = await newDesign(request, 'd_printed');
  await mockResolve(page, true);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);

  // Other sites are refused before anything is fetched.
  await page.getByRole('button', { name: 'Add 3D-printed part' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add 3D-printed part' });
  await dialog.getByLabel('MakerWorld model link').fill('https://www.printables.com/model/1-x');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(/Printables links aren’t supported yet/);

  await dialog.getByLabel('MakerWorld model link').fill(LINK);
  await dialog.getByRole('button', { name: 'Continue' }).click();

  // Everything fetched or guessed, editable.
  await expect(dialog.getByLabel('Name *')).toHaveValue('UniFi NVR Instant 10 inch Rackmount 2U');
  await expect(dialog.getByLabel('Height')).toHaveValue('2');
  await expect(dialog.getByLabel('Rack width')).toHaveValue('10in');
  await expect(dialog.getByLabel('Part type')).toHaveValue('rackmount');
  await expect(dialog.getByLabel('Held device 1', { exact: true })).toHaveValue('ubiquiti-unvr-instant');
  await expect(dialog.getByLabel('Designer', { exact: true })).toHaveValue('Test Designer');
  await expect(dialog.getByText('Non-commercial')).toBeVisible();
  await dialog.getByRole('button', { name: 'Looks right' }).click();
  await dialog.getByLabel('Name *').fill('NVR mount');
  await page.screenshot({ path: 'test-results/printed-dialog.png' });
  await dialog.getByRole('button', { name: 'Save & add to rack' }).click();
  await expect(dialog).toBeHidden();

  // The mount is in the rack with the NVR inside it.
  const mount = page.locator(`${rack} [role="button"][aria-label="NVR mount"]`);
  const nvr = page.locator(`${rack} [role="button"][aria-label="UniFi NVR Instant"]`);
  await expect(mount).toBeVisible();
  await expect(nvr).toBeVisible();
  const m0 = await centreOf(page, 'NVR mount');
  const n0 = await centreOf(page, 'UniFi NVR Instant');
  expect(Math.abs(m0.y - n0.y)).toBeLessThan(3);

  // Details panel: credit, licence, link.
  await page.waitForTimeout(100);
  await mount.click({ position: { x: 6, y: 6 } });
  const panel = page.getByRole('region', { name: '3D-printed part' });
  await expect(panel.getByRole('link', { name: 'Test Designer' })).toHaveAttribute('href', 'https://makerworld.com/en/@testdesigner');
  await expect(panel.getByRole('link', { name: 'View on MakerWorld' })).toHaveAttribute('href', LINK);
  await expect(panel.getByRole('link', { name: 'View on MakerWorld' })).toHaveAttribute('target', '_blank');
  await page.screenshot({ path: 'test-results/printed-placed.png' });

  // Drag the mount (by its ear) down the rack: the NVR comes along.
  await page.mouse.move(m0.left + 6, m0.y);
  await page.mouse.down();
  await page.mouse.move(m0.left + 16, m0.y + 10, { steps: 4 });
  await page.mouse.move(m0.left + 6, m0.y + m0.h * 2, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(100);
  const m1 = await centreOf(page, 'NVR mount');
  const n1 = await centreOf(page, 'UniFi NVR Instant');
  expect(m1.y).toBeGreaterThan(m0.y + m0.h);
  expect(n1.y - n0.y).toBeCloseTo(m1.y - m0.y, 0);

  // Stats count it as still to print.
  await page.getByRole('tab', { name: /Stats/ }).click();
  await expect(page.getByText('3D-printed parts')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Parts to print' })).toBeVisible();

  // Removing the mount asks about the NVR; keep it.
  await page.waitForTimeout(100);
  await mount.click({ position: { x: 6, y: 6 } });
  await page.keyboard.press('Delete');
  const ask = page.getByRole('dialog', { name: 'Remove mount' });
  await expect(ask).toContainText('It holds UniFi NVR Instant');
  await ask.getByRole('button', { name: 'Keep the device' }).click();
  await expect(mount).toHaveCount(0);
  await expect(nvr).toBeVisible();
});

test('falls back to the link when MakerWorld blocks the fetch', async ({ page, request }) => {
  const id = await newDesign(request, 'd_printed2');
  await mockResolve(page, false);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await page.getByRole('button', { name: 'Add 3D-printed part' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add 3D-printed part' });
  await dialog.getByLabel('MakerWorld model link').fill('makerworld.com/models/2424584-unifi-nvr-instant-10-inch-rackmount');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByRole('note')).toContainText('Details couldn’t be fetched automatically');
  await expect(dialog.getByLabel('Name *')).toHaveValue('UniFi NVR Instant 10 Inch Rackmount');
  // No U height in the title: 1U, highlighted to check.
  await expect(dialog.getByLabel('Height')).toHaveValue('1');
  await expect(dialog.getByText('Not in the title: check it')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Refresh details' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Upload or paste a picture' })).toBeVisible();
  await page.screenshot({ path: 'test-results/printed-fallback.png' });
});
