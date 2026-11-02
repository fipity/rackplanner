import type { FastifyInstance } from 'fastify';
import { loadCatalogDir } from '../catalog.js';
import { createCustomPart, deleteCustomPart, listCatalogFiles, listParts, seedCatalog, updateCustomPart } from '../catalogRepo.js';
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

}
