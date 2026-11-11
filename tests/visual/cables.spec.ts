import { expect, test } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';

test('cables can start on a rear port and finish on a front port', async ({ page }) => {
  await page.goto('/d/example-rackmate-t1');
  await page.waitForSelector(rack);
  const cables = page.locator(`${rack} [aria-label="Cables"] > g`);
  const before = await cables.count();

  await page.getByRole('radio', { name: 'Rear' }).click();
  const rearBefore = await cables.count();
  await page.getByRole('button', { name: 'Cable mode' }).click();
  // The UCG Ultra is front-mounted but has its network ports on the back.
  const rearPort = page.getByRole('button', { name: 'UniFi Cloud Gateway Ultra RJ45 1G 4' });
  await expect(rearPort).toBeVisible();
  await rearPort.click();

  await page.getByRole('radio', { name: 'Front' }).click();
  await page.getByRole('button', { name: 'UniFi Switch Lite 8 PoE RJ45 1G 7' }).click();

  await expect(cables).toHaveCount(before + 1);
  await page.getByRole('radio', { name: 'Rear' }).click();
  // Seen from the back, the new cable shows too (it ends on the UCG's rear port).
  await expect(cables).toHaveCount(rearBefore + 1);
});

test('patch panels take a cable on the front and another on the back of the same port', async ({ page }) => {
  await page.goto('/d/example-rackmate-t1');
  await page.waitForSelector(rack);
  const cables = page.locator(`${rack} [aria-label="Cables"] > g`);
  await page.getByRole('radio', { name: 'Rear' }).click();
  const before = await cables.count();
  await page.getByRole('button', { name: 'Cable mode' }).click();
  // Punch-down block on the back of the (front-mounted) RackMate patch panel.
  const back = page.getByRole('button', { name: /patch panel Keystone 12 \(rear\)$/ });
  await expect(back).toBeVisible();
  await back.click();
  await page.getByRole('button', { name: 'UniFi Cloud Gateway Ultra RJ45 1G 3' }).click();
  await expect(cables).toHaveCount(before + 1);
  // The new cable is selected; its end is the back of keystone 12.
  await expect(page.getByLabel('From port')).toHaveValue('keystone:12:back');

  // The front jack of the same port is still a separate, clickable target.
  await page.getByRole('radio', { name: 'Front' }).click();
  await expect(page.getByRole('button', { name: /patch panel Keystone 12$/ })).toBeVisible();
});
