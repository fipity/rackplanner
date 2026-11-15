import { expect, test } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';
const NTD = 'nbn HFC NTD (Arris CM8200B)';
const PANEL = 'Coax patch panel 12× F-type 1U';

test('a coax patch panel feeds the nbn NTD with a coax cable', async ({ page, request }) => {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 2,
        id: 'd_coax',
        name: 'Coax test',
        rack: { width: '19in', heightU: 6, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false },
        expectedPoeLoadW: null,
        placements: [
          { id: 'panel', partId: 'generic-coax-panel-12-f-1u', bottomU: 5, xMm: 0, mounting: 'front' },
          { id: 'shelf', partId: 'generic-shelf-1u-350-19', bottomU: 1, xMm: 0, mounting: 'front' },
          { id: 'ntd', partId: 'arris-cm8200b-nbn-hfc', parentId: 'shelf', bottomU: 1, xMm: 0, mounting: 'front', label: 'ntd' },
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
  const cables = page.locator(`${rack} [aria-label="Cables"] > g`);
  await page.getByRole('radio', { name: 'Rear' }).click();
  await page.getByRole('button', { name: 'Cable mode' }).click();

  // The panel's rear couplers are where the wall coax lands.
  await expect(page.getByRole('button', { name: `${PANEL} Coax (F-type) 1 (rear)` })).toBeVisible();
  await page.screenshot({ path: 'test-results/coax-rear.png' });

  // Front of port 1 to the NTD's cable input (on its rear).
  const before = await cables.count();
  await page.getByRole('button', { name: `${NTD} Coax (F-type) 1` }).click();
  await page.getByRole('radio', { name: 'Front' }).click();
  await page.getByRole('button', { name: `${PANEL} Coax (F-type) 1`, exact: true }).click();
  await expect(cables).toHaveCount(before + 1);
  await expect(page.getByLabel('Cable type')).toHaveValue('coax');
  await page.screenshot({ path: 'test-results/coax-front.png' });
});
