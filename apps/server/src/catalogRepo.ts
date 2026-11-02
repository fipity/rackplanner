import { createHash } from 'node:crypto';
import { newId, PartSchema, type Part, type PartInput } from '@rackplanner/shared';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { CatalogLoadResult } from './catalog.js';
import type { Db } from './db/index.js';
import { catalogFiles, parts } from './db/schema.js';

export interface SeedReport {
  file: string;
  action: 'seeded' | 'unchanged';
  parts: number;
  retired: number;
}

const hashOf = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Sync seed catalog files into the database. A file is (re)applied when its
 * content hash changes: its parts are upserted, and parts that disappeared
 * from it are retired (kept for existing designs, hidden from the catalog).
 * Custom parts are never touched.
 */
export function seedCatalog(db: Db, loaded: CatalogLoadResult): SeedReport[] {
  const now = new Date().toISOString();
  const reports: SeedReport[] = [];
  db.transaction((tx) => {
    for (const { file, data } of loaded.files) {
      const hash = hashOf(data);
      const existing = tx.select().from(catalogFiles).where(eq(catalogFiles.file, file)).get();
      if (existing?.hash === hash) {
        reports.push({ file, action: 'unchanged', parts: data.parts.length, retired: 0 });
        continue;
      }
      for (const part of data.parts) {
        tx.insert(parts)
          .values({ id: part.id, source: 'seed', catalogFile: file, retired: false, data: part, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: parts.id, set: { data: part, catalogFile: file, retired: false, updatedAt: now } })
          .run();
      }
      const ids = data.parts.map((p) => p.id);
      const gone = tx
        .update(parts)
        .set({ retired: true, updatedAt: now })
        .where(and(eq(parts.source, 'seed'), eq(parts.catalogFile, file), ids.length ? notInArray(parts.id, ids) : undefined))
        .run();
      tx.insert(catalogFiles)
        .values({ file, title: data.title, version: data.version, hash, partCount: data.parts.length, seededAt: now })
        .onConflictDoUpdate({ target: catalogFiles.file, set: { title: data.title, version: data.version, hash, partCount: data.parts.length, seededAt: now } })
        .run();
      reports.push({ file, action: 'seeded', parts: data.parts.length, retired: gone.changes });
    }
    // Files deleted from the catalog directory: retire their parts.
    const present = loaded.files.map((f) => f.file);
    const removedFiles = tx
      .select({ file: catalogFiles.file })
      .from(catalogFiles)
      .all()
      .map((r) => r.file)
      .filter((f) => !present.includes(f));
    if (removedFiles.length) {
      tx.update(parts).set({ retired: true, updatedAt: now }).where(and(eq(parts.source, 'seed'), inArray(parts.catalogFile, removedFiles))).run();
      tx.delete(catalogFiles).where(inArray(catalogFiles.file, removedFiles)).run();
    }
  });
  return reports;
}

export function listParts(db: Db): { parts: Part[]; retired: string[] } {
  const rows = db.select({ data: parts.data, retired: parts.retired }).from(parts).all();
  return {
    parts: rows.map((r) => r.data),
    retired: rows.filter((r) => r.retired).map((r) => r.data.id),
  };
}

export function listCatalogFiles(db: Db) {
  return db
    .select({ file: catalogFiles.file, title: catalogFiles.title, version: catalogFiles.version, count: catalogFiles.partCount })
    .from(catalogFiles)
    .all();
}

export class PartError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message);
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'part'
  );
}

/** Validate a custom part, forcing source/verified and generating an id. */
export function normaliseCustom(input: unknown, id?: string): Part {
  const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const candidate: PartInput = {
    ...(raw as PartInput),
    // Imports keep their custom-* ids so designs that reference them still resolve.
    id: id ?? (typeof raw.id === 'string' && /^custom-[a-z0-9-]{3,80}$/.test(raw.id) ? raw.id : `custom-${slugify(String(raw.name ?? 'part'))}-${newId().slice(0, 6)}`),
    source: 'custom',
    verified: false,
    sourceUrl: typeof raw.sourceUrl === 'string' && raw.sourceUrl ? raw.sourceUrl : null,
  };
  const parsed = PartSchema.safeParse(candidate);
  if (!parsed.success) throw new PartError(400, 'Invalid part', parsed.error.issues);
  return parsed.data;
}

export function createCustomPart(db: Db, input: unknown): Part {
  const part = normaliseCustom(input);
  const now = new Date().toISOString();
  db.insert(parts).values({ id: part.id, source: 'custom', catalogFile: null, retired: false, data: part, createdAt: now, updatedAt: now }).run();
  return part;
}

function requireCustom(db: Db, id: string) {
  const row = db.select().from(parts).where(eq(parts.id, id)).get();
  if (!row) throw new PartError(404, `Part ${id} not found`);
  if (row.source !== 'custom') throw new PartError(403, 'Catalog parts are read-only; edit the catalog JSON instead');
  return row;
}

export function updateCustomPart(db: Db, id: string, input: unknown): Part {
  requireCustom(db, id);
  const part = normaliseCustom(input, id);
  db.update(parts).set({ data: part, updatedAt: new Date().toISOString() }).where(eq(parts.id, id)).run();
  return part;
}

export function deleteCustomPart(db: Db, id: string): void {
  requireCustom(db, id);
  db.delete(parts).where(eq(parts.id, id)).run();
}
