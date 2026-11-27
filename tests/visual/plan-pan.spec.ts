import { expect, test } from '@playwright/test';

test('the Shelves tab pans by dragging, right-dragging and Space + drag', async ({ page, request }) => {
  const now = new Date().toISOString();
  const res = await request.post('/api/designs', {
    data: {
      design: {
        schemaVersion: 3,
        id: 'd_plan_pan',
        name: 'Plan pan',
        rack: { width: '19in', heightU: 6, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false },
        expectedPoeLoadW: null,
        placements: [
          { id: 'shelf', partId: 'generic-shelf-1u-350-19', bottomU: 2, xMm: 0, mounting: 'front', facing: 'front' },
          { id: 'sw', partId: 'generic-desktop-switch-8', parentId: 'shelf', bottomU: 2, xMm: 0, mounting: 'front', facing: 'front' },
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
  await page.getByRole('radio', { name: 'Shelves' }).click();
  const plan = page.getByRole('img', { name: /^Top view of/ });
  await expect(plan).toBeVisible();
  const canvas = (await page.locator('[data-plan-canvas]').boundingBox())!;
  const at = async () => {
    const b = (await plan.boundingBox())!;
    return { x: b.x, y: b.y };
  };
  const drag = async (dx: number, dy: number, button: 'left' | 'right' | 'middle' = 'left') => {
    const sx = canvas.x + canvas.width / 2;
    const sy = canvas.y + canvas.height - 40;
    await page.mouse.move(sx, sy);
    await page.mouse.down({ button });
    await page.mouse.move(sx + dx / 2, sy + dy / 2, { steps: 4 });
    await page.mouse.move(sx + dx, sy + dy, { steps: 4 });
    await page.mouse.up({ button });
  };

  // Left-drag on empty space.
  let before = await at();
  await drag(120, -80);
  let after = await at();
  expect(after.x - before.x).toBeCloseTo(120, -1);
  expect(after.y - before.y).toBeCloseTo(-80, -1);

  // Right-drag pans too (and no browser menu).
  before = after;
  await drag(-60, 50, 'right');
  after = await at();
  expect(after.x - before.x).toBeCloseTo(-60, -1);
  expect(after.y - before.y).toBeCloseTo(50, -1);

  // Space + drag starting over the plan itself.
  before = after;
  const p = (await plan.boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(p.x + p.width / 2 + 40, p.y + p.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  after = await at();
  expect(after.x - before.x).toBeCloseTo(40, -1);
  expect(after.y - before.y).toBeCloseTo(30, -1);

  // A click without moving doesn't pan.
  before = after;
  await page.mouse.click(canvas.x + 20, canvas.y + 20);
  expect(await at()).toEqual(before);
});
