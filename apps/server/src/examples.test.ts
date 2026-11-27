import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_SCHEMA_VERSION, createDesign } from '@rackplanner/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './db/index.js';
import { deleteDesign, getDesign, listDesigns } from './designsRepo.js';
import { designs } from './db/schema.js';
import { seedExamples } from './examples.js';

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rp-ex-'));
  db = openDb(':memory:');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('example designs', () => {
  it('adds each example once and never brings back a deleted one', () => {
    const d = { ...createDesign({ name: 'My RackMate T1', rack: { width: '10in', heightU: 8, frame: 'rackmate-t1' } }), id: 'example-t1' };
    writeFileSync(path.join(dir, 'a.json'), JSON.stringify(d));
    writeFileSync(path.join(dir, 'bad.json'), '{"nope": true}');
    const first = seedExamples(db, dir);
    expect(first.map((r) => r.action)).toEqual(['added', 'invalid']);
    expect(getDesign(db, 'example-t1').design.rack.frame).toBe('rackmate-t1');
    expect(seedExamples(db, dir)[0]!.action).toBe('skipped');
    deleteDesign(db, 'example-t1');
    seedExamples(db, dir);
    expect(listDesigns(db)).toHaveLength(0);
  });

  it('returns nothing for a missing directory', () => {
    expect(seedExamples(db, path.join(dir, 'missing'))).toEqual([]);
  });
});

describe('stored v1 designs', () => {
  it('are upgraded to the current schema on read', () => {
    const v1 = {
      schemaVersion: 1,
      id: 'old',
      name: 'Old rack',
      rack: { width: '10in', heightU: 6, depthMm: null, numbering: 'bottom-up' },
      expectedPoeLoadW: null,
      placements: [],
      cables: [],
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };
    // Write the raw v1 JSON the way an older version stored it.
    db.insert(designs).values({ id: 'old', name: 'Old rack', data: v1 as never, revision: 3, createdAt: v1.createdAt, updatedAt: v1.updatedAt }).run();
    const got = getDesign(db, 'old');
    expect(got.design.schemaVersion).toBe(DESIGN_SCHEMA_VERSION);
    expect(got.design.rack.frame).toBe('mini-10in');
    expect(got.revision).toBe(3);
  });
});

describe('templates', () => {
  it('loads every bundled template and they stay valid', async () => {
    const { loadTemplates } = await import('./templates.js');
    const warnings: string[] = [];
    const list = loadTemplates(fileURLToPath(new URL('../../../examples/templates', import.meta.url)), (m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect(list.map((t) => t.id).sort()).toEqual(['tpl-homelab-12u', 'tpl-mini-10in', 'tpl-nbn-unifi', 'tpl-network-cabinet-9u']);
    for (const t of list) expect(t.design.placements.length).toBeGreaterThan(3);
  });
});
