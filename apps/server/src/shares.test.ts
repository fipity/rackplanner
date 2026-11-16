import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { isPublicPath } from './auth.js';
import { loadCatalogDir } from './catalog.js';
import { seedCatalog } from './catalogRepo.js';
import type { Config } from './config.js';
import { openDb } from './db/index.js';

const part = (id: string) => ({
  id,
  brand: 'Test',
  model: id,
  name: id,
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
let app: FastifyInstance;
const AUTH = 'Basic ' + Buffer.from('u:p').toString('base64');

async function start(basicAuth: Config['basicAuth']) {
  dir = mkdtempSync(path.join(tmpdir(), 'rp-s-'));
  writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ version: 1, title: 'x', parts: [part('sw-a'), part('sw-b')] }));
  const db = openDb(':memory:');
  seedCatalog(db, loadCatalogDir(dir));
  const config: Config = { port: 0, host: '127.0.0.1', dataDir: dir, catalogDir: dir, examplesDir: path.join(dir, 'none'), webDist: path.join(dir, 'nope'), logLevel: 'silent', basicAuth };
  app = await buildApp({ config, db });
}

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const headers = { authorization: AUTH };

async function designWithSwitch() {
  const { design, revision } = (await app.inject({ method: 'POST', url: '/api/designs', headers, payload: { name: 'Lab' } })).json();
  design.placements.push({ id: 'p1', partId: 'sw-a', bottomU: 1, xMm: 0, mounting: 'front' });
  await app.inject({ method: 'PUT', url: `/api/designs/${design.id}`, headers, payload: { design, revision } });
  return design.id as string;
}

describe('share links', () => {
  beforeEach(() => start(null));

  it('creates one link per design, serves the live design with its parts, and revokes it', async () => {
    const id = await designWithSwitch();
    expect((await app.inject(`/api/designs/${id}/share`)).json()).toEqual({ share: null });
    const { share } = (await app.inject({ method: 'POST', url: `/api/designs/${id}/share` })).json();
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const again = (await app.inject({ method: 'POST', url: `/api/designs/${id}/share` })).json();
    expect(again.share.token).toBe(share.token);

    const shared = await app.inject(`/api/shared/${share.token}`);
    expect(shared.statusCode).toBe(200);
    expect(shared.headers['cache-control']).toBe('no-store');
    expect(shared.json().design.name).toBe('Lab');
    expect(shared.json().parts.map((p: { id: string }) => p.id)).toEqual(['sw-a']);

    expect((await app.inject({ method: 'DELETE', url: `/api/designs/${id}/share` })).statusCode).toBe(204);
    expect((await app.inject(`/api/shared/${share.token}`)).statusCode).toBe(404);
  });

  it('drops the link with the design and 404s unknown tokens', async () => {
    const id = await designWithSwitch();
    const { share } = (await app.inject({ method: 'POST', url: `/api/designs/${id}/share` })).json();
    await app.inject({ method: 'DELETE', url: `/api/designs/${id}` });
    expect((await app.inject(`/api/shared/${share.token}`)).statusCode).toBe(404);
    expect((await app.inject('/api/shared/nope')).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/designs/missing/share' })).statusCode).toBe(404);
  });
});

describe('share links with basic auth', () => {
  beforeEach(() => start({ user: 'u', pass: 'p' }));

  it('lets anyone read a shared design but nothing else', async () => {
    const id = await designWithSwitch();
    const { share } = (await app.inject({ method: 'POST', url: `/api/designs/${id}/share`, headers })).json();
    expect((await app.inject(`/api/shared/${share.token}`)).statusCode).toBe(200);
    expect((await app.inject(`/api/designs/${id}`)).statusCode).toBe(401);
    expect((await app.inject(`/api/designs/${id}/share`)).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/designs/${id}/share` })).statusCode).toBe(401);
    expect((await app.inject('/api/catalog')).statusCode).toBe(401);
  });

  it('only opens the share page, static assets and the health check', () => {
    expect(isPublicPath('GET', '/s/abcDEF_-123')).toBe(true);
    expect(isPublicPath('GET', '/assets/index-abc.js')).toBe(true);
    expect(isPublicPath('GET', '/favicon.svg')).toBe(true);
    expect(isPublicPath('GET', '/api/health')).toBe(true);
    expect(isPublicPath('GET', '/')).toBe(false);
    expect(isPublicPath('GET', '/d/x')).toBe(false);
    expect(isPublicPath('GET', '/s/x/print')).toBe(false);
    expect(isPublicPath('POST', '/api/shared/x')).toBe(false);
    expect(isPublicPath('GET', '/api/backup')).toBe(false);
  });
});
