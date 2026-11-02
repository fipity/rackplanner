import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadCatalogDir } from './catalog.js';
import { seedCatalog } from './catalogRepo.js';
import type { Config } from './config.js';
import { openDb, type Db } from './db/index.js';

const seedPart = (id: string, name = id) => ({
  id,
  brand: 'Test',
  model: id,
  name,
  category: 'switch',
  heightU: 1,
  width: '19in',
  depthMm: 200,
  mounting: 'front',
  rackWidths: ['19in'],
  power: { typicalW: null, maxW: 10 },
  weightKg: 1,
  render: { style: 'switch' },
  sourceUrl: null,
  verified: false,
});

let dir: string;
let db: Db;
let app: FastifyInstance;

function writeCatalog(parts: unknown[], version = 1) {
  writeFileSync(path.join(dir, 'test.json'), JSON.stringify({ version, title: 'Test', parts }));
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'rp-'));
  writeCatalog([seedPart('test-a'), seedPart('test-b')]);
  db = openDb(':memory:');
  seedCatalog(db, loadCatalogDir(dir));
  const config: Config = {
    port: 0,
    host: '127.0.0.1',
    dataDir: dir,
    catalogDir: dir,
    webDist: path.join(dir, 'nope'),
    logLevel: 'silent',
    basicAuth: null,
  };
  app = await buildApp({ config, db });
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('catalog seeding', () => {
  it('loads seed parts on first start', async () => {
    const res = await app.inject('/api/catalog');
    expect(res.statusCode).toBe(200);
    expect(res.json().parts.map((p: { id: string }) => p.id).sort()).toEqual(['test-a', 'test-b']);
    expect(res.json().files[0]).toMatchObject({ file: 'test.json', count: 2 });
  });

  it('skips unchanged files and applies changed ones, retiring removed parts', async () => {
    expect(seedCatalog(db, loadCatalogDir(dir))[0]?.action).toBe('unchanged');
    writeCatalog([seedPart('test-a', 'Renamed'), seedPart('test-c')], 2);
    const res = await app.inject({ method: 'POST', url: '/api/catalog/reload' });
    expect(res.json().reports[0]).toMatchObject({ action: 'seeded', parts: 2, retired: 1 });
    const cat = (await app.inject('/api/catalog')).json();
    expect(cat.retired).toEqual(['test-b']);
    expect(cat.parts.find((p: { id: string }) => p.id === 'test-a').name).toBe('Renamed');
  });

  it('refuses to reload an invalid catalog', async () => {
    writeCatalog([{ ...seedPart('test-a'), heightU: 1.3 }]);
    const res = await app.inject({ method: 'POST', url: '/api/catalog/reload' });
    expect(res.statusCode).toBe(422);
  });
});

describe('custom parts API', () => {
  const body = { ...seedPart('ignored', 'My Mini PC Shelf'), id: undefined, brand: 'Me', verified: true };

  it('creates a custom part with a generated id, forcing source and verified', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/parts', payload: body });
    expect(res.statusCode).toBe(201);
    const part = res.json();
    expect(part.id).toMatch(/^custom-my-mini-pc-shelf-/);
    expect(part.source).toBe('custom');
    expect(part.verified).toBe(false);
    const cat = (await app.inject('/api/catalog')).json();
    expect(cat.parts).toHaveLength(3);
  });

  it('rejects invalid parts with zod issues', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/parts', payload: { ...body, heightU: 0 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].path).toEqual(['heightU']);
  });

  it('updates and deletes custom parts', async () => {
    const created = (await app.inject({ method: 'POST', url: '/api/parts', payload: body })).json();
    const upd = await app.inject({ method: 'PUT', url: `/api/parts/${created.id}`, payload: { ...created, name: 'Renamed' } });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().name).toBe('Renamed');
    expect((await app.inject({ method: 'DELETE', url: `/api/parts/${created.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/api/parts/${created.id}` })).statusCode).toBe(404);
  });

  it('keeps seed parts read-only and custom parts across reseeds', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/api/parts/test-a' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/api/parts/test-a', payload: body })).statusCode).toBe(403);
    await app.inject({ method: 'POST', url: '/api/parts', payload: body });
    writeCatalog([seedPart('test-a')], 3);
    await app.inject({ method: 'POST', url: '/api/catalog/reload' });
    const cat = (await app.inject('/api/catalog')).json();
    expect(cat.parts.filter((p: { source: string }) => p.source === 'custom')).toHaveLength(1);
  });
});

describe('health', () => {
  it('reports ok', async () => {
    expect((await app.inject('/api/health')).json()).toEqual({ status: 'ok' });
  });
});

describe('imports and backups', () => {
  it('keeps a valid custom-* id from an imported part', async () => {
    const payload = { ...seedPart('custom-imported-box', 'Imported box') };
    const res = await app.inject({ method: 'POST', url: '/api/parts', payload });
    expect(res.json().id).toBe('custom-imported-box');
    expect((await app.inject({ method: 'POST', url: '/api/parts', payload })).statusCode).toBe(409);
  });

  it('ignores non-custom ids on create', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/parts', payload: seedPart('test-a', 'Sneaky') });
    expect(res.json().id).toMatch(/^custom-sneaky-/);
  });

  it('downloads a SQLite backup', async () => {
    const res = await app.inject('/api/backup');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="rackplanner-/);
    expect(res.rawPayload.subarray(0, 15).toString()).toBe('SQLite format 3');
  });
});
