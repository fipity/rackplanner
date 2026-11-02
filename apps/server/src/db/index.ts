import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/**
 * Ordered schema migrations. Each entry runs once; progress is tracked in
 * SQLite's PRAGMA user_version. Append only, never edit a shipped entry.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE parts (
     id TEXT PRIMARY KEY,
     source TEXT NOT NULL CHECK (source IN ('seed', 'custom')),
     catalog_file TEXT,
     retired INTEGER NOT NULL DEFAULT 0,
     data TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX parts_source_idx ON parts (source);
   CREATE TABLE catalog_files (
     file TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     version INTEGER NOT NULL,
     hash TEXT NOT NULL,
     part_count INTEGER NOT NULL,
     seeded_at TEXT NOT NULL
   );`,
];

export function migrate(sqlite: Database.Database): number {
  const current = sqlite.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    sqlite.transaction(() => {
      sqlite.exec(MIGRATIONS[v]!);
      sqlite.pragma(`user_version = ${v + 1}`);
    })();
  }
  return MIGRATIONS.length;
}

/** Open (creating if needed) the SQLite database. Pass ':memory:' for tests. */
export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  migrate(sqlite);
  return drizzle(sqlite, { schema }) as Db;
}
