import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogDir } from '../apps/server/src/catalog.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'catalog');

describe('catalog seed files', () => {
  const result = loadCatalogDir(dir);
  it('all validate against the schema with unique ids', () => {
    expect(result.errors).toEqual([]);
    expect(result.parts.length).toBeGreaterThan(0);
  });
  it('verified parts cite a source URL', () => {
    const missing = result.parts.filter((p) => p.verified && !p.sourceUrl).map((p) => p.id);
    expect(missing).toEqual([]);
  });
});
