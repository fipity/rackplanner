import { createDesign, DesignSchema, newId, RackSchema, type Design } from '@rackplanner/shared';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './db/index.js';
import { designs } from './db/schema.js';

export class DesignError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface StoredDesign {
  design: Design;
  revision: number;
}

const CreateSchema = z
  .object({
    name: z.string().max(200).optional(),
    rack: RackSchema.partial().optional(),
    /** Import a full design (gets a fresh id). */
    design: z.unknown().optional(),
  })
  .strict();

const SaveSchema = z
  .object({
    design: z.unknown(),
    /** Revision the client last loaded; mismatches return 409 unless force is set. */
    revision: z.number().int().positive(),
    force: z.boolean().optional(),
  })
  .strict();

function parseDesign(raw: unknown): Design {
  const r = DesignSchema.safeParse(raw);
  if (!r.success) throw new DesignError(400, 'Invalid design', { issues: r.error.issues });
  return r.data;
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new DesignError(400, 'Invalid request', { issues: r.error.issues });
  return r.data;
}

/** Stored designs may predate the current schema version: upgrade them on read. */
function upgrade(data: Design): Design {
  const r = DesignSchema.safeParse(data);
  return r.success ? r.data : data;
}

export function listDesigns(db: Db): StoredDesign[] {
  return db
    .select({ data: designs.data, revision: designs.revision })
    .from(designs)
    .orderBy(desc(designs.updatedAt))
    .all()
    .map((r) => ({ design: upgrade(r.data), revision: r.revision }));
}

export function getDesign(db: Db, id: string): StoredDesign {
  const row = db.select({ data: designs.data, revision: designs.revision }).from(designs).where(eq(designs.id, id)).get();
  if (!row) throw new DesignError(404, 'Design not found');
  return { design: upgrade(row.data), revision: row.revision };
}

function insert(db: Db, design: Design): StoredDesign {
  db.insert(designs)
    .values({ id: design.id, name: design.name, data: design, revision: 1, createdAt: design.createdAt, updatedAt: design.updatedAt })
    .run();
  return { design, revision: 1 };
}

export function createNewDesign(db: Db, body: unknown): StoredDesign {
  const input = parseBody(CreateSchema, body);
  const now = new Date().toISOString();
  if (input.design !== undefined) {
    const imported = parseDesign(input.design);
    return insert(db, { ...imported, id: newId('d_'), name: input.name?.trim() || imported.name, createdAt: now, updatedAt: now });
  }
  return insert(db, createDesign({ name: input.name, rack: input.rack }));
}

export function saveDesign(db: Db, id: string, body: unknown): StoredDesign {
  const input = parseBody(SaveSchema, body);
  const design = parseDesign(input.design);
  if (design.id !== id) throw new DesignError(400, 'Design id does not match the URL');
  return db.transaction((tx) => {
    const row = tx.select({ revision: designs.revision, createdAt: designs.createdAt }).from(designs).where(eq(designs.id, id)).get();
    if (!row) throw new DesignError(404, 'Design not found');
    if (row.revision !== input.revision && !input.force) {
      throw new DesignError(409, 'Design was changed elsewhere', { revision: row.revision });
    }
    const updated: Design = { ...design, createdAt: row.createdAt, updatedAt: new Date().toISOString() };
    const revision = row.revision + 1;
    tx.update(designs).set({ name: updated.name, data: updated, revision, updatedAt: updated.updatedAt }).where(eq(designs.id, id)).run();
    return { design: updated, revision };
  });
}

export function duplicateDesign(db: Db, id: string, body: unknown): StoredDesign {
  const { name } = parseBody(z.object({ name: z.string().max(200).optional() }).strict(), body);
  const src = getDesign(db, id).design;
  const now = new Date().toISOString();
  return insert(db, { ...src, id: newId('d_'), name: name?.trim() || `${src.name} (copy)`, createdAt: now, updatedAt: now });
}

export function deleteDesign(db: Db, id: string): void {
  const res = db.delete(designs).where(eq(designs.id, id)).run();
  if (res.changes === 0) throw new DesignError(404, 'Design not found');
}
