import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Part } from '@rackplanner/shared';
import { registerBasicAuth } from './auth.js';
import type { Config } from './config.js';

export interface AppDeps {
  config: Config;
  parts: Part[];
  catalogFiles: { file: string; title: string; version: number; count: number }[];
}

export async function buildApp({ config, parts, catalogFiles }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel } });

  if (config.basicAuth) registerBasicAuth(app, config.basicAuth);

  app.get('/api/health', async () => ({ status: 'ok', parts: parts.length }));

  app.get('/api/catalog', async () => ({ parts, files: catalogFiles }));

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
