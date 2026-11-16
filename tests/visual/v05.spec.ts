import { expect, test } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';

async function newDesign(request: import('@playwright/test').APIRequestContext, id: string, rackOver: object, placements: unknown[]) {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 2,
        id,
        name: 'v0.5 test',
        rack: { width: '19in', heightU: 8, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false, ...rackOver },
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

test('new design from a template', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New design' }).first().click();
  await page.getByRole('radio', { name: 'Template' }).click();
  const tpl = page.getByRole('radio', { name: /nbn \+ UniFi starter/ });
  await expect(tpl).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('radio')).toHaveCount(2 + 4);
  await tpl.click();
  await page.screenshot({ path: 'test-results/v05-templates.png' });
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForSelector(rack);
  await expect(page.locator(rack)).toHaveAttribute('aria-label', /with wall/);
  await expect(page.getByRole('textbox', { name: /design name/i }).or(page.getByText('nbn + UniFi starter')).first()).toBeVisible();
  await expect(page.locator(`${rack} [role="button"][aria-label="nbn FTTP, on the wall"]`)).toBeVisible();
  // RackMate rails are tapped, not cage-nut square holes.
  await expect(page.locator(`${rack} [data-hole="tapped"]`).first()).toBeAttached();
  await page.screenshot({ path: 'test-results/v05-template-editor.png' });
});

test('share a read-only link, open it, then turn it off', async ({ page, browser, request }) => {
  const id = await newDesign(request, 'd_share', {}, [{ id: 'sw', partId: 'ubiquiti-usw-pro-24-poe', bottomU: 8, xMm: 0, mounting: 'front', label: 'core' }]);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByText('Sharing is off.')).toBeVisible();
  await page.getByRole('button', { name: 'Create link' }).click();
  const link = page.getByRole('textbox', { name: 'Share link' });
  await expect(link).toHaveValue(/\/s\/[A-Za-z0-9_-]{24}$/);
  const url = await link.inputValue();
  await page.screenshot({ path: 'test-results/v05-share-dialog.png' });

  const viewer = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const v = await viewer.newPage();
  const catalogCalls: string[] = [];
  v.on('request', (r) => r.url().includes('/api/catalog') && catalogCalls.push(r.url()));
  await v.goto(url);
  await expect(v.getByRole('heading', { name: 'v0.5 test' })).toBeVisible();
  await expect(v.getByText('Shared with you · read-only')).toBeVisible();
  await expect(v.getByRole('img', { name: '8U 19in rack, front view' })).toContainText('core');
  await expect(v.getByRole('cell', { name: /UniFi Switch Pro 24 PoE/ })).toBeVisible();
  expect(catalogCalls).toEqual([]);
  await v.screenshot({ path: 'test-results/v05-shared.png', fullPage: true });

  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(page.getByText('Sharing is off.')).toBeVisible();
  await v.reload();
  await expect(v.getByText('This share link has been turned off or never existed.')).toBeVisible();
  await viewer.close();
});

test('heat output and mixed airflow warning', async ({ page, request }) => {
  const id = await newDesign(request, 'd_air', {}, [
    { id: 'srv', partId: 'dell-poweredge-r640', bottomU: 1, xMm: 0, mounting: 'full-depth', label: 'r640', measuredW: 150 },
    { id: 'sw', partId: 'ubiquiti-usw-pro-24-poe', bottomU: 8, xMm: 0, mounting: 'front', label: 'core' },
  ]);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await page.getByRole('tab', { name: /Stats/ }).click();
  await expect(page.getByText('Heat output')).toBeVisible();
  await expect(page.getByText(/^Mixed airflow/)).toHaveCount(0);

  await page.locator(`${rack} [role="button"][aria-label="core"]`).click();
  const select = page.getByLabel('Airflow');
  await expect(select.locator('option').first()).toHaveText('Unknown');
  await select.selectOption('back-to-front');
  await page.getByRole('tab', { name: /Stats/ }).click();
  await expect(page.getByText(/^Mixed airflow: core blows hot air out of the rack front/)).toBeVisible();
  await page.screenshot({ path: 'test-results/v05-airflow.png' });
});
