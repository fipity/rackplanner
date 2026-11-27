import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';
const SW = 'UniFi Switch 24 PoE';

async function seed(request: APIRequestContext, id: string) {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 3,
        id,
        name: 'Reverse test',
        rack: { width: '19in', heightU: 8, depthMm: 600, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false },
        expectedPoeLoadW: null,
        placements: [
          { id: 'sw1', partId: 'ubiquiti-usw-24-poe', bottomU: 2, xMm: 0, mounting: 'front', facing: 'front', label: 'sw1' },
          { id: 'sw2', partId: 'ubiquiti-usw-24-poe', bottomU: 5, xMm: 0, mounting: 'front', facing: 'front', label: 'sw2' },
        ],
        cables: [],
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { design: { id: string } }).design.id;
}

const device = (page: Page, label: string) => page.locator(`${rack} [role="button"][data-pid][aria-label^="${label}"]`);
const badges = (page: Page) => page.locator(`${rack} [data-testid="reversed-badge"]`);
/** Port 1 of sw1 as a cable-mode target (only drawn where its faceplate is). */
const port1 = (page: Page) => page.locator(`${rack} [role="button"][aria-label="${SW} RJ45 1G 1"]`);

test('R reverses the selected switch: rear panel at the front, ports at the rear, undoable', async ({ page, request }) => {
  const id = await seed(request, 'd_reverse');
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);

  await device(page, 'sw1').click();
  await expect(page.getByRole('button', { name: 'Reverse (face rear)' })).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(100); // dnd-kit ignores clicks right after a pointer up
  await page.keyboard.press('r');
  await expect(page.getByText('now faces the rear')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reverse (face front)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(badges(page)).toHaveCount(1);
  await expect(device(page, 'sw1')).toHaveAttribute('aria-label', /facing the rear/);

  // Front view: its rear panel, so no front ports to cable to. Rear view: the faceplate, ports and all.
  await page.getByRole('button', { name: 'Cable mode' }).click();
  await expect(port1(page)).toHaveCount(1); // sw2's port 1 (sw1 shows its back)
  await page.getByRole('radio', { name: 'Rear' }).click();
  await expect(port1(page)).toHaveCount(1); // now sw1's
  const p1 = (await port1(page).boundingBox())!;
  const box = (await page.locator(`${rack} [data-oid="sw1"]`).boundingBox())!; // on the front rails: seen through the rack
  expect(p1.y).toBeGreaterThan(box.y - 1);
  expect(p1.y + p1.height).toBeLessThan(box.y + box.height + 1);
  await expect(badges(page)).toHaveCount(1);
  await page.screenshot({ path: 'test-results/reversed-rear.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cable mode' }).click();

  // Autosaved.
  await expect
    .poll(async () => ((await (await request.get(`/api/designs/${id}`)).json()) as { design: { placements: { id: string; facing?: string }[] } }).design.placements.find((p) => p.id === 'sw1')?.facing)
    .toBe('rear');

  // Undo puts it back.
  await page.getByRole('radio', { name: 'Front' }).click();
  await page.keyboard.press('Control+z');
  await expect(badges(page)).toHaveCount(0);
  await expect(device(page, 'sw1')).not.toHaveAttribute('aria-label', /facing/);
});

test('multi-select, right-click menu and swap view', async ({ page, request }) => {
  const id = await seed(request, 'd_reverse_multi');
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);

  // Shift+click selects both; R reverses both in one undo step.
  await device(page, 'sw1').click();
  await page.waitForTimeout(100);
  await device(page, 'sw2').click({ modifiers: ['Shift'] });
  await expect(page.getByText('2 parts selected')).toBeVisible();
  await page.keyboard.press('r');
  await expect(badges(page)).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(badges(page)).toHaveCount(0);

  // Right-click without dragging opens the part menu.
  await page.locator(rack).click({ position: { x: 5, y: 5 } }); // deselect
  await device(page, 'sw2').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Part actions' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Reverse (face rear)' }).click();
  await expect(menu).toBeHidden();
  await expect(badges(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Reverse (face front)' })).toBeVisible(); // still selected

  // Swap view flips to the rear view and keeps the selected part in the middle
  // (zoomed in, so the soft pan bounds don't stop it getting there).
  for (let i = 0; i < 4; i++) await page.keyboard.press('+');
  await page.getByRole('button', { name: 'Swap view' }).click();
  await expect(page.getByRole('radio', { name: 'Rear' })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(150);
  const canvas = (await page.locator('[data-rack-canvas]').boundingBox())!;
  const sel = (await page.locator(`${rack} [data-oid="sw2"]`).boundingBox())!;
  expect(Math.abs(sel.x + sel.width / 2 - (canvas.x + canvas.width / 2))).toBeLessThan(4);
  expect(Math.abs(sel.y + sel.height / 2 - (canvas.y + canvas.height / 2))).toBeLessThan(4);

  // Show through off hides the other side's gear (sw1 is on the front rails).
  await expect(page.locator(`${rack} [data-oid="sw1"]`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Show through' }).click();
  await expect(page.locator(`${rack} [data-oid="sw1"]`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Show through' }).click();
});
