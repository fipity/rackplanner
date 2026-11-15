import { expect, test } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';
const FTTC = 'nbn FTTC connection device (NetComm NDD-0300)';
const PHONE = 'Phone wall socket (RJ11 / RJ12)';

async function newDesign(request: import('@playwright/test').APIRequestContext, id: string, wall: boolean, placements: unknown[]) {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 2,
        id,
        name: 'Wall test',
        rack: { width: '19in', heightU: 8, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false, wall },
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

test('wall gear beside the rack shows in both views and takes cables', async ({ page, request }) => {
  const id = await newDesign(request, 'd_wall', true, [
    { id: 'gw', partId: 'generic-patch-12-cat6-1u', bottomU: 6, xMm: 0, mounting: 'front', label: 'patch' },
    { id: 'phone', partId: 'generic-wall-socket-phone', bottomU: 1, xMm: 20, mounting: 'front', wall: true },
    { id: 'fttc', partId: 'netcomm-ndd-0300-nbn-fttc', bottomU: 4, xMm: 20, mounting: 'front', wall: true, label: 'fttc' },
    { id: 'gpo', partId: 'generic-gpo-double-au', bottomU: 1, xMm: 120, mounting: 'front', wall: true },
    { id: 'fibre', partId: 'generic-fibre-wall-outlet-sc-apc', bottomU: 7, xMm: 20, mounting: 'front', wall: true },
  ]);

  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await expect(page.locator(rack)).toHaveAttribute('aria-label', /with wall/);
  await expect(page.getByRole('button', { name: 'Wall beside the rack' })).toHaveAttribute('aria-pressed', 'true');
  // Wall gear is left of the rack in the front view.
  const rackX = (await page.locator(`${rack} [aria-label="patch"]`).boundingBox())!.x;
  const fttc = page.locator(`${rack} [role="button"][aria-label="fttc, on the wall"]`);
  expect((await fttc.boundingBox())!.x).toBeLessThan(rackX);
  await page.screenshot({ path: 'test-results/wall-front.png' });

  // Phone socket to the FTTC box's WALL SOCKET, both on the wall, in the front view.
  await page.getByRole('button', { name: 'Cable mode' }).click();
  const cables = page.locator(`${rack} [aria-label="Cables"] > g`);
  await page.getByRole('button', { name: `${PHONE} RJ11 (phone) 1` }).click();
  await page.getByRole('button', { name: `${FTTC} RJ11 (phone) 1` }).click();
  await expect(cables).toHaveCount(1);
  await expect(page.getByLabel('Cable type')).toHaveValue('phone');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/wall-front-cable.png' });

  // Rear view: the wall is on the right, and the cable is still drawn.
  await page.getByRole('radio', { name: 'Rear' }).click();
  const svg = (await page.locator(rack).boundingBox())!;
  expect((await fttc.boundingBox())!.x).toBeGreaterThan(svg.x + svg.width / 2);
  await expect(cables).toHaveCount(1);
  await page.screenshot({ path: 'test-results/wall-rear.png' });

  // Stats: wall gear isn't "desktop gear not on a shelf" and uses no rack U.
  await page.getByRole('tab', { name: /Stats/ }).click();
  await expect(page.getByText('Desktop gear not on a shelf')).toHaveCount(0);

  // Move the FTTC box into the rack from the inspector, then back.
  await page.getByRole('radio', { name: 'Front' }).click();
  await fttc.click();
  await page.getByRole('button', { name: 'In the rack', exact: true }).click();
  await expect(page.locator(`${rack} [role="button"][aria-label="fttc"]`)).toBeVisible();
  await page.getByRole('button', { name: 'On the wall', exact: true }).click();
  await expect(fttc).toBeVisible();
});

test('turning the wall on, adding a wall plate, and dragging gear onto the wall', async ({ page, request }) => {
  const id = await newDesign(request, 'd_wall2', false, [{ id: 'shelf', partId: 'generic-shelf-1u-350-19', bottomU: 2, xMm: 0, mounting: 'front', label: 'shelf' }]);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await expect(page.locator(rack)).not.toHaveAttribute('aria-label', /with wall/);

  // Clicking a wall plate in the catalog turns the wall on and puts it there.
  await page.getByLabel('Search parts').fill('TV / coax');
  await page.locator('aside li', { hasText: 'Wall plate, TV / coax' }).first().locator('[role=button]').first().click();
  await expect(page.locator(rack)).toHaveAttribute('aria-label', /with wall/);
  await expect(page.locator(`${rack} [role="button"][aria-label="Wall plate, TV / coax (F-type), on the wall"]`)).toBeVisible();

  // Drag the nbn HFC box from the catalog onto the wall.
  await page.getByLabel('Search parts').fill('CM8200B');
  const src = (await page.locator('aside li', { hasText: 'CM8200B' }).first().locator('[role=button]').first().boundingBox())!;
  const svg = (await page.locator(rack).boundingBox())!;
  await page.mouse.move(src.x + 40, src.y + 20);
  await page.mouse.down();
  await page.mouse.move(src.x + 70, src.y + 40, { steps: 4 });
  // Left part of the drawing is the wall in the front view.
  await page.mouse.move(svg.x + svg.width * 0.12, svg.y + svg.height * 0.45, { steps: 12 });
  await page.waitForTimeout(150);
  await expect(page.getByRole('status').filter({ hasText: 'On the wall' })).toBeVisible();
  await page.screenshot({ path: 'test-results/wall-drag.png' });
  await page.mouse.up();
  await expect(page.locator(`${rack} [role="button"][aria-label="nbn HFC NTD (Arris CM8200B), on the wall"]`)).toBeVisible();

  // The wall can't be turned off silently: it asks before removing what's on it.
  // (dnd-kit swallows clicks for 50 ms after a drop.)
  await page.waitForTimeout(120);
  await page.getByRole('button', { name: 'Wall beside the rack', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('nbn HFC NTD');
  await page.screenshot({ path: 'test-results/wall-off-confirm.png' });
});
