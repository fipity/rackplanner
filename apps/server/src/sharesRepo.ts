import { randomBytes } from 'node:crypto';
import { uprightId, type Design, type Part } from '@rackplanner/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db/index.js';
import { parts, shares } from './db/schema.js';
import { DesignError, getDesign } from './designsRepo.js';

export interface ShareInfo {
  token: string;
  createdAt: string;
}

/** 144 random bits, URL-safe. */
const newToken = () => randomBytes(18).toString('base64url');

export function getShare(db: Db, designId: string): ShareInfo | null {
  getDesign(db, designId); // 404 for unknown designs
  const row = db.select().from(shares).where(eq(shares.designId, designId)).get();
  return row ? { token: row.token, createdAt: row.createdAt } : null;
}

/** Turn sharing on (idempotent: an existing link is kept). */
export function createShare(db: Db, designId: string): ShareInfo {
  const existing = getShare(db, designId);
  if (existing) return existing;
  const info = { token: newToken(), createdAt: new Date().toISOString() };
  db.insert(shares).values({ token: info.token, designId, createdAt: info.createdAt }).run();
  return info;
}

/** Turn sharing off; the old link stops working. */
export function deleteShare(db: Db, designId: string): void {
  getDesign(db, designId);
  db.delete(shares).where(eq(shares.designId, designId)).run();
}

export interface SharedDesign {
  design: Design;
  /** Every catalog part the design uses (custom parts included), upright form. */
  parts: Part[];
}

/** The live design behind a share token, plus the parts needed to draw it. */
export function getSharedDesign(db: Db, token: string): SharedDesign {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) throw new DesignError(404, 'Shared design not found');
  const row = db.select().from(shares).where(eq(shares.token, token)).get();
  if (!row) throw new DesignError(404, 'Shared design not found');
  const { design } = getDesign(db, row.designId);
  const ids = [...new Set(design.placements.map((p) => uprightId(p.partId)))];
  const used = ids.length ? db.select({ data: parts.data }).from(parts).where(inArray(parts.id, ids)).all().map((r) => r.data) : [];
  return { design, parts: used };
}
