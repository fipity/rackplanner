import type { Design, Part } from '@rackplanner/shared';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const parts = sqliteTable('parts', {
  id: text('id').primaryKey(),
  source: text('source', { enum: ['seed', 'custom'] }).notNull(),
  /** Seed file the part came from (null for custom parts). */
  catalogFile: text('catalog_file'),
  /** Seed parts removed from their JSON file are kept (so saved designs still render) but hidden. */
  retired: integer('retired', { mode: 'boolean' }).notNull().default(false),
  data: text('data', { mode: 'json' }).$type<Part>().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const catalogFiles = sqliteTable('catalog_files', {
  file: text('file').primaryKey(),
  title: text('title').notNull(),
  version: integer('version').notNull(),
  hash: text('hash').notNull(),
  partCount: integer('part_count').notNull(),
  seededAt: text('seeded_at').notNull(),
});

export const designs = sqliteTable('designs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: text('data', { mode: 'json' }).$type<Design>().notNull(),
  /** Incremented on every save; used to detect concurrent edits. */
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
