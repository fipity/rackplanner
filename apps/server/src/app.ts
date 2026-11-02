import { createReadStream, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerBasicAuth } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import { PartError } from './catalogRepo.js';
import { DesignError } from './designsRepo.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerDesignRoutes } from './routes/designs.js';

export interface AppDeps {
  config: Config;
  db: Db;
}

export async function buildApp({ config, db }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: config.logLevel }, bodyLimit: 5 * 1024 * 1024, forceCloseConnections: 'idle' });

  if (config.basicAuth) registerBasicAuth(app, config.basicAuth);

  app.get('/api/health', async () => {
    db.$client.prepare('SELECT 1').get();
    return { status: 'ok' };
  });

  /** Consistent snapshot of the SQLite database (safe while the app is running). */
  app.get('/api/backup', async (_req, reply) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(tmpdir(), `rackplanner-backup-${stamp}-${process.pid}.db`);
    await db.$client.backup(file);
    const stream = createReadStream(file);
    stream.on('close', () => rmSync(file, { force: true }));
    return reply
      .header('content-type', 'application/vnd.sqlite3')
      .header('content-disposition', `attachment; filename="rackplanner-${stamp.slice(0, 19)}.db"`)
      .send(stream);
  });

  registerCatalogRoutes(app, db, config.catalogDir);
  registerDesignRoutes(app, db);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof PartError) {
      return reply.code(err.status).send({ error: err.message, ...(err.issues ? { issues: err.issues } : {}) });
    }
    if (err instanceof DesignError) {
      return reply.code(err.status).send({ error: err.message, ...err.extra });
    }
    if (err instanceof Error && 'code' in err && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return reply.code(409).send({ error: 'An item with that id already exists' });
    }
    const status = typeof (err as { statusCode?: unknown }).statusCode === 'number' ? (err as { statusCode: number }).statusCode : 500;
    if (status >= 500) app.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Internal error' : (err as Error).message });
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || !existsSync(config.webDist)) {
      return reply.code(404).send({ error: 'Not found' });
    }
    // SPA fallback: client-side routes get index.html.
    return reply.sendFile('index.html');
  });

  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      wildcard: false,
      cacheControl: false,
      setHeaders: (res, filePath) => {
        // Hashed build assets never change; index.html must always be revalidated.
        res.setHeader('cache-control', filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  } else {
    app.log.warn(`Web build not found at ${config.webDist}; serving API only`);
  }

  return app;
}
