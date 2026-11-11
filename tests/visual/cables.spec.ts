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
