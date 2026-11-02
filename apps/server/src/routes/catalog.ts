import type { FastifyInstance } from 'fastify';
import { loadCatalogDir } from '../catalog.js';
import {
  createCustomPart,
  deleteCustomPart,
  listCatalogFiles,
  listParts,
  PartError,
  seedCatalog,
  updateCustomPart,
} from '../catalogRepo.js';
import type { Db } from '../db/index.js';

export function registerCatalogRoutes(app: FastifyInstance, db: Db, catalogDir: string): void {
  app.get('/api/catalog', async () => ({ ...listParts(db), files: listCatalogFiles(db) }));

  /** Re-read catalog/*.json without restarting (after editing a seed file). */
  app.post('/api/catalog/reload', async (_req, reply) => {
    const loaded = loadCatalogDir(catalogDir);
    if (loaded.errors.length) return reply.code(422).send({ error: 'Catalog validation failed', details: loaded.errors });
    return { reports: seedCatalog(db, loaded) };
  });

  app.post('/api/parts', async (req, reply) => reply.code(201).send(createCustomPart(db, req.body)));

  app.put<{ Params: { id: string } }>('/api/parts/:id', async (req) => updateCustomPart(db, req.params.id, req.body));

  app.delete<{ Params: { id: string } }>('/api/parts/:id', async (req, reply) => {
    deleteCustomPart(db, req.params.id);
    return reply.code(204).send();
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof PartError) {
      return reply.code(err.status).send({ error: err.message, ...(err.issues ? { issues: err.issues } : {}) });
    }
    if (err instanceof Error && 'code' in err && err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return reply.code(409).send({ error: 'A part with that id already exists' });
    }
    app.log.error(err);
    const status = typeof (err as { statusCode?: unknown }).statusCode === 'number' ? (err as { statusCode: number }).statusCode : 500;
    return reply.code(status).send({ error: status === 500 ? 'Internal error' : (err as Error).message });
  });
}
