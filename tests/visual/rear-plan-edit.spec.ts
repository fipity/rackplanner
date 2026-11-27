import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const rack = 'svg[aria-label*="rack,"]';
type Placement = { id: string; bottomU: number; xMm: number; mounting: string; parentId?: string; facing?: string };

async function seed(request: APIRequestContext) {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 3,
        id: 'd_rear_plan',
        name: 'Rear and plan editing',
        rack: { width: '19in', heightU: 10, depthMm: 800, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false },
        expectedPoeLoadW: null,
        placements: [
          { id: 'sw', partId: 'ubiquiti-usw-24-poe', bottomU: 9, xMm: 0, mounting: 'front', facing: 'front', label: 'sw' },
          { id: 'pdu', partId: 'generic-pdu-1u-12-c13', bottomU: 1, xMm: 0, mounting: 'rear', facing: 'rear', label: 'pdu' },
          { id: 'shelf1', partId: 'generic-shelf-1u-350-19', bottomU: 3, xMm: 0, mounting: 'front', facing: 'front', label: 'shelf1' },
          { id: 'mini', partId: 'generic-desktop-switch-8', parentId: 'shelf1', bottomU: 3, xMm: 0, mounting: 'front', facing: 'front', label: 'mini' },
          { id: 'shelf2', partId: 'generic-shelf-1u-350-19', bottomU: 6, xMm: 0, mounting: 'front', facing: 'front', label: 'shelf2' },
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

const saved = async (request: APIRequestContext, id: string, pid: string) =>
  ((await (await request.get(`/api/designs/${id}`)).json()) as { design: { placements: Placement[] } }).design.placements.find((p) => p.id === pid);
const label = (page: Page) => page.getByRole('textbox', { name: 'Label' });
async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (dx * i) / 8, from.y + (dy * i) / 8);
  await page.mouse.up();
}

test('front-rail gear can be selected and moved from the rear view', async ({ page, request }) => {
  const id = await seed(request);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await page.getByRole('radio', { name: 'Rear' }).click();

  // The switch is on the front rails: seen through the rack, and now clickable.
  const sw = page.locator(`${rack} [data-pid="sw"]`);
  const box = (await sw.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
  await expect(label(page)).toHaveValue('sw');

  // Drag it down 2U: it moves, and stays on the front rails.
  await page.waitForTimeout(150); // dnd-kit swallows clicks just after a drop
  await dragBy(page, { x: box.x + box.width * 0.3, y: box.y + box.height / 2 }, 0, box.height * 2);
  await expect.poll(async () => (await saved(request, id, 'sw'))?.bottomU).toBe(7);
  expect((await saved(request, id, 'sw'))?.mounting).toBe('front');
  await page.keyboard.press('r');
  await expect(page.locator(`${rack} [data-testid="reversed-badge"]`)).toHaveCount(1);
  await page.screenshot({ path: 'test-results/rear-edit.png' });
});

test('Shelves tab: select and drag devices, select shelves, facing marks, zoom controls and remembered view', async ({ page, request }) => {
  const id = await seed(request);
  await page.goto(`/d/${id}`);
  await page.waitForSelector(rack);
  await page.getByRole('radio', { name: 'Shelves' }).click();
  const item = page.locator('[data-plan-item="mini"]');
  await expect(item).toBeVisible();

  // Click selects the device.
  await item.click();
  await expect(label(page)).toHaveValue('mini');
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  await expect(item.locator('[data-facing]')).toHaveAttribute('data-facing', 'front');

  // R reverses it: the facing mark moves to the rear edge.
  await page.keyboard.press('r');
  await expect(item.locator('[data-facing]')).toHaveAttribute('data-facing', 'rear');

  // Drag along its shelf.
  let b = (await item.boundingBox())!;
  await dragBy(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 120, 0);
  await expect.poll(async () => (await saved(request, id, 'mini'))?.xMm ?? 0).toBeGreaterThan(50);
  expect((await saved(request, id, 'mini'))?.parentId).toBe('shelf1');

  // Drag onto the other shelf.
  b = (await item.boundingBox())!;
  const other = (await page.locator('svg[data-shelf-svg="shelf2"]').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 10, b.y + b.height / 2);
  // While dragging: the device fades and a preview shows where it would land.
  await expect(item).toHaveAttribute('opacity', '0.35');
  await expect(page.locator('[data-testid="plan-drag-ghost"]')).toHaveCount(1);
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width / 2 + ((other.x + other.width / 2 - b.x - b.width / 2) * i) / 8, b.y + b.height / 2 + ((other.y + other.height / 2 - b.y - b.height / 2) * i) / 8);
  await page.mouse.up();
  await expect.poll(async () => (await saved(request, id, 'mini'))?.parentId).toBe('shelf2');
  expect((await saved(request, id, 'mini'))?.bottomU).toBe(6);
  await page.screenshot({ path: 'test-results/plan-edit.png' });
  await page.locator('[data-plan-shelf="shelf2"]').screenshot({ path: 'test-results/plan-edit-shelf.png', scale: 'device' });

  // Clicking a shelf's tray selects the shelf.
  const s1 = (await page.locator('svg[data-shelf-svg="shelf1"]').boundingBox())!;
  await page.mouse.click(s1.x + s1.width / 2, s1.y + s1.height / 2);
  await expect(label(page)).toHaveValue('shelf1');

  // The toolbar zoom buttons and 0 work on the plans.
  const fig = page.locator('[data-plan-shelf="shelf1"]');
  const w0 = (await fig.boundingBox())!.width;
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => (await fig.boundingBox())!.width / w0).toBeCloseTo(1.25, 1);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const w2 = (await fig.boundingBox())!.width;

  // The plan view is remembered when switching to the rack and back.
  await page.getByRole('radio', { name: 'Front' }).click();
  await page.waitForSelector(rack);
  await page.getByRole('radio', { name: 'Shelves' }).click();
  await expect.poll(async () => (await fig.boundingBox())!.width).toBeCloseTo(w2, 0);

  await page.locator('[data-plan-canvas]').click({ position: { x: 5, y: 5 } }); // deselect (focus stays off inputs)
  await page.keyboard.press('0');
  await expect.poll(async () => (await fig.boundingBox())!.width).toBeCloseTo(w0, 0);

  // Pan the plans right off screen: "Back to shelves" brings them back.
  const c = (await page.locator('[data-plan-canvas]').boundingBox())!;
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(c.x + c.width - 10, c.y + c.height - 10);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(c.x + 10, c.y + c.height - 10, { steps: 6 });
    await page.mouse.up({ button: 'right' });
  }
  const back = page.getByRole('button', { name: 'Back to shelves' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(back).toBeHidden();
  await expect(fig).toBeInViewport();
});
