/**
 * Visual snapshot tests for faceplates (one reference device per style
 * preset, front and rear, light and dark). Run against a server started on
 * a scratch data dir:
 *   BASE_URL=http://127.0.0.1:8097 npx playwright test
 * Update snapshots with --update-snapshots. Snapshots are rendered in the
 * mcr.microsoft.com/playwright image so fonts and anti-aliasing match.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/visual',
  snapshotPathTemplate: '{testDir}/__snapshots__/{arg}{ext}',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:8085',
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 1,
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
});
