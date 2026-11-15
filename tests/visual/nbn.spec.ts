import { expect, test } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';
const FTTP = 'nbn FTTP NTD, 1 port (Nokia XS-010X-Q)';
const FTTC = 'nbn FTTC connection device (NetComm NDD-0300)';
const FW = 'nbn Fixed Wireless connection box';

test('the nbn FTTP, FTTC and Fixed Wireless boxes sit on shelves and take cables', async ({ page, request }) => {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 2,
        id: 'd_nbn',
        name: 'nbn boxes',
        rack: { width: '19in', heightU: 6, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false },
        expectedPoeLoadW: null,
        placements: [
          { id: 's1', partId: 'generic-shelf-1u-350-19', bottomU: 1, xMm: 0, mounting: 'front' },
          { id: 'fttp', partId: 'nokia-xs-010x-q-nbn-fttp', parentId: 's1', bottomU: 1, xMm: 0, mounting: 'front', label: 'fttp' },
          { id: 'fttc', partId: 'netcomm-ndd-0300-nbn-fttc', parentId: 's1', bottomU: 1, xMm: 160, mounting: 'front', label: 'fttc' },
          { id: 's2', partId: 'generic-shelf-1u-350-19', bottomU: 3, xMm: 0, mounting: 'front' },
          { id: 'fw', partId: 'nbn-fixed-wireless-ntd', parentId: 's2', bottomU: 3, xMm: 0, mounting: 'front', label: 'fw' },
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
  await page.screenshot({ path: 'test-results/nbn-front.png' });
  await page.getByRole('radio', { name: 'Shelves' }).click();
  await page.screenshot({ path: 'test-results/nbn-shelves.png' });

  await page.getByRole('radio', { name: 'Rear' }).click();
  await page.getByRole('button', { name: 'Cable mode' }).click();
  await expect(page.getByRole('button', { name: `${FTTP} SC duplex 1` })).toBeVisible();
  for (let i = 1; i <= 4; i++) await expect(page.getByRole('button', { name: `${FW} RJ45 1G ${i}` })).toBeVisible();
  await page.screenshot({ path: 'test-results/nbn-rear.png' });

  // FTTC GATEWAY to Fixed Wireless UNI-D 1: an ordinary copper lead.
  const cables = page.locator(`${rack} [aria-label="Cables"] > g`);
  const before = await cables.count();
  await page.getByRole('button', { name: `${FTTC} RJ45 1G 1` }).click();
  await page.getByRole('button', { name: `${FW} RJ45 1G 1` }).click();
  await expect(cables).toHaveCount(before + 1);
  await expect(page.getByLabel('Cable type')).toHaveValue('copper');
});
