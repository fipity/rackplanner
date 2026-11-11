import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { Config } from './config.js';
import { openDb } from './db/index.js';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'rp-d-'));
  writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ version: 1, title: 'x', parts: [] }));
  const config: Config = { port: 0, host: '127.0.0.1', dataDir: dir, catalogDir: dir, examplesDir: path.join(dir, 'none'), webDist: path.join(dir, 'nope'), logLevel: 'silent', basicAuth: null };
  app = await buildApp({ config, db: openDb(':memory:') });
});
afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const create = async (payload: object = {}) => (await app.inject({ method: 'POST', url: '/api/designs', payload })).json();

describe('designs API', () => {
  it('creates designs with defaults and lists them newest first', async () => {
    const a = await create({ name: 'Lab', rack: { heightU: 24, width: '10in' } });
    expect(a.revision).toBe(1);
    expect(a.design.rack).toMatchObject({ heightU: 24, width: '10in', numbering: 'bottom-up' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await create();
    expect(b.design.name).toBe('Untitled rack');
    const list = (await app.inject('/api/designs')).json().designs;
    expect(list.map((d: { design: { id: string } }) => d.design.id)).toEqual([b.design.id, a.design.id]);
  });

  it('saves with revision checks and reports conflicts', async () => {
    const { design } = await create({ name: 'Lab' });
    const placed = { ...design, name: 'Lab 2', placements: [{ id: 'p1', partId: 'any', bottomU: 1, xMm: 0, mounting: 'front' }] };
    const ok = await app.inject({ method: 'PUT', url: `/api/designs/${design.id}`, payload: { design: placed, revision: 1 } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().revision).toBe(2);
    const stale = await app.inject({ method: 'PUT', url: `/api/designs/${design.id}`, payload: { design: placed, revision: 1 } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().revision).toBe(2);
    const forced = await app.inject({ method: 'PUT', url: `/api/designs/${design.id}`, payload: { design: placed, revision: 1, force: true } });
    expect(forced.json().revision).toBe(3);
    const got = (await app.inject(`/api/designs/${design.id}`)).json();
    expect(got.design.name).toBe('Lab 2');
    expect(got.design.createdAt).toBe(design.createdAt);
  });

  it('rejects invalid designs and mismatched ids', async () => {
    const { design } = await create();
    const bad = await app.inject({ method: 'PUT', url: `/api/designs/${design.id}`, payload: { design: { ...design, rack: { ...design.rack, heightU: 40 } }, revision: 1 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().issues[0].path).toEqual(['rack', 'heightU']);
    const wrong = await app.inject({ method: 'PUT', url: `/api/designs/${design.id}`, payload: { design: { ...design, id: 'other' }, revision: 1 } });
    expect(wrong.statusCode).toBe(400);
  });

  it('duplicates, imports and deletes', async () => {
    const { design } = await create({ name: 'Lab' });
    const dup = (await app.inject({ method: 'POST', url: `/api/designs/${design.id}/duplicate`, payload: {} })).json();
    expect(dup.design.name).toBe('Lab (copy)');
    expect(dup.design.id).not.toBe(design.id);
    const imported = await create({ design: { ...design, name: 'Imported' } });
    expect(imported.design.id).not.toBe(design.id);
    expect(imported.design.name).toBe('Imported');
    expect((await app.inject({ method: 'DELETE', url: `/api/designs/${design.id}` })).statusCode).toBe(204);
    expect((await app.inject(`/api/designs/${design.id}`)).statusCode).toBe(404);
    expect((await app.inject('/api/designs')).json().designs).toHaveLength(2);
  });
});
