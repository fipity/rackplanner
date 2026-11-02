import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerBasicAuth } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import { registerCatalogRoutes } from './routes/catalog.js';

export interface AppDeps {
  config: Config;
  db: Db;
}

export async function buildApp({ config, db }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel }, bodyLimit: 5 * 1024 * 1024 });

  if (config.basicAuth) registerBasicAuth(app, config.basicAuth);

  app.get('/api/health', async () => {
    db.$client.prepare('SELECT 1').get();
    return { status: 'ok' };
  });

  registerCatalogRoutes(app, db, config.catalogDir);

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || !existsSync(config.webDist)) {
      return reply.code(404).send({ error: 'Not found' });
    }
    // SPA fallback: client-side routes get index.html.
    return reply.sendFile('index.html');
  });

  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
  } else {
    app.log.warn(`Web build not found at ${config.webDist}; serving API only`);
  }

  return app;
}
