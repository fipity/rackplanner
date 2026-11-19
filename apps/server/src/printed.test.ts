import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { Config } from './config.js';
import { openDb, type Db } from './db/index.js';
import { FetchError, assertAllowed, guardedLookup, isBlockedAddress, safeGet, type RawResponse, type Transport } from './printed/netguard.js';
import { RateLimiter } from './printed/rateLimit.js';

const FIXTURES = path.join(import.meta.dirname, '../../../packages/shared/src/printed/__fixtures__');
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name));
const PAGE = 'https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount';
const LINK = `${PAGE}#profileId-2659248`;
const COVER = 'https://makerworld.bblmw.com/makerworld/model/TEST/design/cover.jpg';

const html = (body: Buffer | string, status = 200): RawResponse => ({ status, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(body) });

/** A fake network: routes by URL, records every request. */
function fakeNet(routes: Record<string, RawResponse | (() => RawResponse)>) {
  const calls: string[] = [];
  const transport: Transport = async (url) => {
    calls.push(url.toString());
    const r = routes[url.toString()];
    if (!r) return { status: 404, headers: {}, body: Buffer.alloc(0) };
    return typeof r === 'function' ? r() : r;
  };
  return { calls, transport };
}

let jpeg: Buffer;
let dir: string;
let db: Db;
let app: FastifyInstance;

async function start(routes: Record<string, RawResponse | (() => RawResponse)>, fetchLimit = 100) {
  const net = fakeNet(routes);
  const config: Config = { port: 0, host: '127.0.0.1', dataDir: dir, catalogDir: dir, examplesDir: path.join(dir, 'none'), webDist: path.join(dir, 'nope'), logLevel: 'silent', basicAuth: null };
  app = await buildApp({ config, db, printed: { transport: net.transport, fetchLimit } });
  return net;
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'rp-printed-'));
  writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ version: 1, title: 'x', parts: [] }));
  db = openDb(':memory:');
  jpeg ??= await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#3366aa' } }).jpeg().toBuffer();
});

afterEach(async () => {
  await app?.close();
  db.$client.close();
  rmSync(dir, { recursive: true, force: true });
});

const resolve = (url: string, route = 'resolve') => app.inject({ method: 'POST', url: `/api/printed/${route}`, payload: { url } });

describe('network guard', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'not-an-ip'])(
    'blocks %s',
    (ip) => expect(isBlockedAddress(ip)).toBe(true),
  );
  it.each(['104.18.26.61', '8.8.8.8', '172.32.0.1', '2606:4700::6812:1a3d', '::ffff:8.8.8.8'])('allows %s', (ip) => expect(isBlockedAddress(ip)).toBe(false));

  it.each([
    ['http', 'http://makerworld.com/en/models/1'],
    ['lookalike', 'https://makerworld.com.evil.example/en/models/1'],
    ['suffix trick', 'https://evilmakerworld.com/en/models/1'],
    ['userinfo', 'https://makerworld.com@evil.example/'],
    ['credentials', 'https://user:pw@makerworld.com/'],
    ['IP host', 'https://104.18.26.61/'],
    ['other port', 'https://makerworld.com:8443/'],
  ])('refuses %s', (_n, url) => {
    expect(() => assertAllowed(new URL(url), ['makerworld.com'])).toThrow(FetchError);
  });

  it('allows the domain and its subdomains', () => {
    expect(() => assertAllowed(new URL('https://makerworld.com/x'), ['makerworld.com'])).not.toThrow();
    expect(() => assertAllowed(new URL('https://public-cdn.bblmw.com/x'), ['bblmw.com'])).not.toThrow();
  });

  it('refuses hostnames that resolve to private addresses', async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((res) => guardedLookup('localhost', {}, (e) => res(e)));
    expect(err?.code).toBe('EBLOCKED');
  });

  it('follows redirects only within the allowed domain', async () => {
    const opts = { domains: ['makerworld.com'], maxBytes: 1000, accept: '*/*', userAgent: 't' };
    const ok = fakeNet({
      'https://makerworld.com/a': { status: 301, headers: { location: '/en/a' }, body: Buffer.alloc(0) },
      'https://makerworld.com/en/a': html('hi'),
    });
    await expect(safeGet('https://makerworld.com/a', { ...opts, transport: ok.transport })).resolves.toMatchObject({ url: 'https://makerworld.com/en/a' });
    const bad = fakeNet({ 'https://makerworld.com/a': { status: 302, headers: { location: 'http://169.254.169.254/latest' }, body: Buffer.alloc(0) } });
    await expect(safeGet('https://makerworld.com/a', { ...opts, transport: bad.transport })).rejects.toMatchObject({ kind: 'blocked' });
    expect(bad.calls).toEqual(['https://makerworld.com/a']);
    const away = fakeNet({ 'https://makerworld.com/a': { status: 302, headers: { location: 'https://evil.example/' }, body: Buffer.alloc(0) } });
    await expect(safeGet('https://makerworld.com/a', { ...opts, transport: away.transport })).rejects.toMatchObject({ kind: 'blocked' });
    const loop = fakeNet({ 'https://makerworld.com/a': { status: 302, headers: { location: '/a' }, body: Buffer.alloc(0) } });
    await expect(safeGet('https://makerworld.com/a', { ...opts, transport: loop.transport })).rejects.toThrow(/redirects/);
  });

  it('caps the response size', async () => {
    const big = fakeNet({ 'https://makerworld.com/a': html('x'.repeat(2000)) });
    await expect(safeGet('https://makerworld.com/a', { domains: ['makerworld.com'], maxBytes: 1000, accept: '*/*', userAgent: 't', transport: big.transport })).rejects.toMatchObject({ kind: 'too-large' });
  });

  it('rate-limits per client', () => {
    let t = 0;
    const rl = new RateLimiter(2, 60_000, () => t);
    expect(rl.take('a')).toBe(0);
    expect(rl.take('a')).toBe(0);
    expect(rl.take('a')).toBeGreaterThan(0);
    expect(rl.take('b')).toBe(0);
    t = 61_000;
    expect(rl.take('a')).toBe(0);
  });
});

describe('POST /api/printed/resolve', () => {
  it('reads the page once, stores the thumbnail and caches the result', async () => {
    const net = await start({ [PAGE]: html(fixture('makerworld-next-data.html')), [COVER]: { status: 200, headers: { 'content-type': 'image/jpeg' }, body: jpeg } });
    const res = await resolve(LINK);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      fetched: true,
      cached: false,
      reason: null,
      parsed: { modelId: '2424584', profileId: '2659248', slug: 'unifi-nvr-instant-10-inch-rackmount', canonicalUrl: LINK },
      details: { title: 'UniFi NVR Instant 10 inch Rackmount 2U', designer: 'Test Designer', licence: 'CC BY-NC-SA', profileName: '0.2mm layer, PETG, no supports' },
    });
    expect(body.details).not.toHaveProperty('thumbnailUrl');
    expect(body.thumbnail).toMatch(/^[a-f0-9]{64}$/);
    expect(net.calls).toEqual([PAGE, COVER]);

    const img = await app.inject({ method: 'GET', url: `/api/thumbnails/${body.thumbnail}` });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/webp');
    const meta = await sharp(img.rawPayload).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 600, height: 450 });

    // Same link again: from the cache, no request.
    const again = await resolve('https://makerworld.com/models/2424584#profileId-2659248');
    expect(again.json()).toMatchObject({ cached: true, fetched: true, thumbnail: body.thumbnail });
    expect(net.calls).toHaveLength(2);
  });

  it('falls back quietly when MakerWorld blocks the request', async () => {
    const net = await start({ [PAGE]: html(fixture('cloudflare-challenge.html'), 403) });
    const res = await resolve(LINK);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ fetched: false, details: null, thumbnail: null, reason: 'The site blocked the automatic request', parsed: { slug: 'unifi-nvr-instant-10-inch-rackmount' } });
    // A failure isn't sticky: the next paste tries again.
    await resolve(LINK);
    expect(net.calls).toHaveLength(2);
  });

  it('treats a challenge page with status 200 as no details', async () => {
    await start({ [PAGE]: html(fixture('cloudflare-challenge.html')) });
    expect((await resolve(LINK)).json()).toMatchObject({ fetched: false, reason: expect.stringMatching(/bot check/) });
  });

  it('keeps earlier details when a refresh fails', async () => {
    let blocked = false;
    await start({ [PAGE]: () => (blocked ? html('', 503) : html(fixture('makerworld-next-data.html'))) });
    expect((await resolve(LINK)).json()).toMatchObject({ fetched: true });
    blocked = true;
    const r = (await resolve(LINK, 'refresh')).json();
    expect(r).toMatchObject({ fetched: true, details: { designer: 'Test Designer' }, reason: expect.stringMatching(/^Refresh failed/) });
  });

  it('never fetches thumbnails from other hosts', async () => {
    const net = await start({ ['https://makerworld.com/en/models/99']: html(fixture('makerworld-hostile.html')) });
    const r = (await resolve('https://makerworld.com/en/models/99')).json();
    expect(r).toMatchObject({ fetched: true, thumbnail: null, details: { title: 'Mini PC holder' } });
    expect(net.calls).toEqual(['https://makerworld.com/en/models/99']);
  });

  it('survives a thumbnail that is not an image', async () => {
    await start({ [PAGE]: html(fixture('makerworld-next-data.html')), [COVER]: { status: 200, headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('<svg onload=alert(1)>') } });
    expect((await resolve(LINK)).json()).toMatchObject({ fetched: true, thumbnail: null });
  });

  it('rejects other sites without fetching', async () => {
    const net = await start({});
    const res = await resolve('https://www.printables.com/model/1-x');
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Printables/);
    expect((await resolve('http://127.0.0.1/models/1')).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/printed/resolve', payload: {} })).statusCode).toBe(400);
    expect(net.calls).toEqual([]);
  });

  it('is rate-limited', async () => {
    await start({ [PAGE]: html('', 403) }, 2);
    expect((await resolve(LINK)).statusCode).toBe(200);
    expect((await resolve(LINK)).statusCode).toBe(200);
    const third = await resolve(LINK);
    expect(third.statusCode).toBe(429);
    expect(third.headers['retry-after']).toBeDefined();
  });
});

describe('thumbnails', () => {
  const upload = (data: string) => app.inject({ method: 'POST', url: '/api/thumbnails', payload: { data } });

  it('stores an uploaded image, resized to 600 px WebP', async () => {
    await start({});
    const png = await sharp({ create: { width: 300, height: 800, channels: 4, background: '#ff0000' } }).png().toBuffer();
    const res = await upload(`data:image/png;base64,${png.toString('base64')}`);
    expect(res.statusCode).toBe(201);
    const { id } = res.json();
    const img = await app.inject({ method: 'GET', url: `/api/thumbnails/${id}` });
    expect(await sharp(img.rawPayload).metadata()).toMatchObject({ format: 'webp', width: 225, height: 600 });
    // Same image again: same id.
    expect((await upload(png.toString('base64'))).json().id).toBe(id);
  });

  it('validates by decoding, not by name or type', async () => {
    await start({});
    const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('not really')]);
    expect((await upload(`data:image/png;base64,${fakePng.toString('base64')}`)).statusCode).toBe(400);
    expect((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64'))).statusCode).toBe(400);
    expect((await upload('!!!not base64!!!')).statusCode).toBe(400);
  });

  it('refuses images over 5 MB', async () => {
    await start({});
    const res = await upload(Buffer.alloc(5 * 1024 * 1024 + 10, 1).toString('base64'));
    expect([400, 413]).toContain(res.statusCode);
  });

  it('serves only well-formed ids', async () => {
    await start({});
    expect((await app.inject({ method: 'GET', url: '/api/thumbnails/..%2F..%2Fetc%2Fpasswd' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/thumbnails/${'a'.repeat(64)}` })).statusCode).toBe(404);
  });
});
