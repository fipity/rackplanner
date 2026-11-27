import { expect, test } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';
const NTD = 'nbn HFC NTD (Arris CM8200B)';

test('shelf gear can be laid on its side and cabled there', async ({ page, request }) => {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 2,
        id: 'd_turn',
        name: 'Turn test',
        rack: { width: '19in', heightU: 6, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false },
        expectedPoeLoadW: null,
        placements: [
          { id: 'shelf', partId: 'generic-shelf-1u-350-19', bottomU: 2, xMm: 0, mounting: 'front' },
          { id: 'ntd', partId: 'arris-cm8200b-nbn-hfc', parentId: 'shelf', bottomU: 2, xMm: 0, mounting: 'front', label: 'ntd' },
          { id: 'sw', partId: 'generic-desktop-switch-8', parentId: 'shelf', bottomU: 2, xMm: 200, mounting: 'front', label: 'sw' },
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
  const device = page.locator(`${rack} [role="button"][aria-label^="ntd"]`);
  const upright = (await device.boundingBox())!;
  expect(upright.height).toBeGreaterThan(upright.width * 2);

  await device.click();
  await expect(page.getByRole('button', { name: 'Upright' })).toBeVisible();
  await page.keyboard.press('t');
  const flat = (await device.boundingBox())!;
  expect(flat.width).toBeGreaterThan(flat.height * 2);

  // Rear view: the ports turn with the box and still take cables.
  await page.getByRole('radio', { name: 'Rear' }).click();
  await page.getByRole('button', { name: 'Cable mode' }).click();
  const d1 = page.getByRole('button', { name: `${NTD} RJ45 1G 1` });
  const coax = page.getByRole('button', { name: `${NTD} Coax (F-type) 1` });
  const a = (await d1.boundingBox())!;
  const c = (await coax.boundingBox())!;
  // On its side, seen from behind, the coax input (top when upright) is at the left end.
  expect(c.x).toBeLessThan(a.x);
  expect(Math.abs(c.y + c.height / 2 - (a.y + a.height / 2))).toBeLessThan(a.height);
  const cables = page.locator(`${rack} [aria-label="Cables"] > g`);
  const before = await cables.count();
  await d1.click();
  const swPort = page.getByRole('button', { name: 'Unmanaged 8-port desktop switch RJ45 1G 1' });
  if ((await swPort.count()) === 0) await page.getByRole('radio', { name: 'Front' }).click();
  await swPort.click();
  await expect(cables).toHaveCount(before + 1);
  await page.screenshot({ path: 'test-results/turned-rear.png' });

  // Stand it back up via the inspector.
  await page.getByRole('radio', { name: 'Front' }).click();
  await page.getByRole('button', { name: 'Cable mode' }).click();
  // The new cable crosses the box, so select it by a corner.
  await device.click({ position: { x: 3, y: 3 } });
  await page.screenshot({ path: 'test-results/turned-front.png' });
  await page.getByRole('button', { name: 'Upright' }).click();
  const back = (await device.boundingBox())!;
  expect(back.height).toBeGreaterThan(back.width * 2);
});
