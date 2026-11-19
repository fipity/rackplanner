import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { RateLimiter } from '../printed/rateLimit.js';
import { ResolveError, resolveModel } from '../printed/resolver.js';
import type { Transport } from '../printed/netguard.js';
import { ImageError, MAX_IMAGE_BYTES, ThumbnailStore } from '../printed/thumbnails.js';

export interface PrintedRouteOptions {
  thumbnailDir: string;
  /** Tests swap in a fake network. */
  transport?: Transport;
  /** Fetches per client per minute. */
  fetchLimit?: number;
}

const UrlBody = z.object({ url: z.string().min(1).max(2000) });
// base64 of up to 5 MB (plus an optional data: URL prefix).
const ImageBody = z.object({ data: z.string().min(1).max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 200) });

export function registerPrintedRoutes(app: FastifyInstance, db: Db, opts: PrintedRouteOptions): void {
  const thumbnails = new ThumbnailStore(opts.thumbnailDir);
  const fetchLimiter = new RateLimiter(opts.fetchLimit ?? 10, 60_000);
  const uploadLimiter = new RateLimiter(60, 60_000);
  const deps = { db, thumbnails, log: app.log, ...(opts.transport ? { transport: opts.transport } : {}) };

  const limited = (limiter: RateLimiter, req: FastifyRequest, reply: FastifyReply): boolean => {
    const wait = limiter.take(req.ip);
    if (!wait) return false;
    void reply.code(429).header('retry-after', String(wait)).send({ error: `Too many requests; try again in ${wait} s` });
    return true;
  };

  const handle = (refresh: boolean) => async (req: FastifyRequest, reply: FastifyReply) => {
    const body = UrlBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Expected { url }' });
    if (limited(fetchLimiter, req, reply)) return reply;
    try {
      return await resolveModel(deps, body.data.url, { refresh });
    } catch (e) {
      if (e instanceof ResolveError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  };

  /** Paste a link: parse it and fetch the page once (cached). */
  app.post('/api/printed/resolve', handle(false));
  /** "Refresh details": fetch the page again. */
  app.post('/api/printed/refresh', handle(true));

  /** Upload or paste a thumbnail (base64), or import one from a design file. */
  app.post('/api/thumbnails', { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const body = ImageBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Expected { data: base64 image }' });
    if (limited(uploadLimiter, req, reply)) return reply;
    const b64 = body.data.data.replace(/^data:[a-z0-9.+/-]+;base64,/i, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return reply.code(400).send({ error: 'Not base64' });
    try {
      return reply.code(201).send({ id: await thumbnails.store(Buffer.from(b64, 'base64')) });
    } catch (e) {
      if (e instanceof ImageError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  /** Cached thumbnails (public, like shared designs: ids are content hashes). */
  app.get<{ Params: { id: string } }>('/api/thumbnails/:id', async (req, reply) => {
    const file = thumbnails.pathOf(req.params.id);
    if (!file) return reply.code(404).send({ error: 'Not found' });
    return reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'")
      .send(createReadStream(file));
  });
}
