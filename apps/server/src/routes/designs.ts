import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/index.js';
import { createNewDesign, deleteDesign, duplicateDesign, getDesign, listDesigns, saveDesign } from '../designsRepo.js';

export function registerDesignRoutes(app: FastifyInstance, db: Db): void {
  app.get('/api/designs', async () => ({ designs: listDesigns(db) }));
  app.get<{ Params: { id: string } }>('/api/designs/:id', async (req) => getDesign(db, req.params.id));
  app.post('/api/designs', async (req, reply) => reply.code(201).send(createNewDesign(db, req.body)));
  app.put<{ Params: { id: string } }>('/api/designs/:id', async (req) => saveDesign(db, req.params.id, req.body));
  app.post<{ Params: { id: string } }>('/api/designs/:id/duplicate', async (req, reply) =>
    reply.code(201).send(duplicateDesign(db, req.params.id, req.body)),
  );
  app.delete<{ Params: { id: string } }>('/api/designs/:id', async (req, reply) => {
    deleteDesign(db, req.params.id);
    return reply.code(204).send();
  });
}
