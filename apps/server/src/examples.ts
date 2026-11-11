import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DesignSchema } from '@rackplanner/shared';
import { eq } from 'drizzle-orm';
import type { Db } from './db/index.js';
import { designs } from './db/schema.js';

export interface ExampleReport {
  file: string;
  action: 'added' | 'skipped' | 'invalid';
  message?: string;
}

/**
 * Add the example designs in `dir` to the design list, once each. A meta
 * flag records that an example was offered, so deleting it keeps it deleted.
 */
export function seedExamples(db: Db, dir: string): ExampleReport[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const sqlite = db.$client;
  const getMeta = sqlite.prepare('SELECT value FROM meta WHERE key = ?');
  const setMeta = sqlite.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  const reports: ExampleReport[] = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = DesignSchema.safeParse(JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
    } catch (err) {
      reports.push({ file, action: 'invalid', message: (err as Error).message });
      continue;
    }
    if (!parsed.success) {
      reports.push({ file, action: 'invalid', message: parsed.error.message });
      continue;
    }
    const design = parsed.data;
    const key = `example:${design.id}`;
    if (getMeta.get(key)) {
      reports.push({ file, action: 'skipped' });
      continue;
    }
    sqlite.transaction(() => {
      const exists = db.select({ id: designs.id }).from(designs).where(eq(designs.id, design.id)).get();
      if (!exists) {
        const now = new Date().toISOString();
        db.insert(designs).values({ id: design.id, name: design.name, data: { ...design, createdAt: now, updatedAt: now }, revision: 1, createdAt: now, updatedAt: now }).run();
      }
      setMeta.run(key, new Date().toISOString());
    })();
    reports.push({ file, action: 'added' });
  }
  return reports;
}
