import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LAYERED_KINDS, U_MM, layoutPortCounts, overlaps, partWidthMm, resolveFace, type Part } from '@rackplanner/shared';
import { loadCatalogDir } from '../apps/server/src/catalog.js';
import { layoutProblems } from './layout-checks.js';

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
  it('verified layouts cite sources', () => {
    const missing = result.parts.filter((p) => p.layout?.layoutVerified && p.layout.sources.length === 0).map((p) => p.id);
    expect(missing).toEqual([]);
  });
  it('every layout (detailed or generated) stays inside its face without overlaps', () => {
    expect(result.parts.flatMap(layoutProblems)).toEqual([]);
  });
  it('layouts account for every catalog port exactly once', () => {
    const bad = result.parts
      .map((p: Part) => {
        const declared = Object.fromEntries(Object.entries(p.ports).filter(([, n]) => n));
        const drawn = layoutPortCounts(p);
        return JSON.stringify(declared) === JSON.stringify(Object.fromEntries(Object.entries(declared).map(([k]) => [k, drawn[k as keyof typeof drawn]]))) &&
          Object.keys(drawn).every((k) => k in declared)
          ? null
          : `${p.id}: catalog ${JSON.stringify(declared)} vs layout ${JSON.stringify(drawn)}`;
      })
      .filter(Boolean);
    expect(bad).toEqual([]);
  });
  it('unverified layouts are listed in UNVERIFIED.md', async () => {
    const { readFileSync } = await import('node:fs');
    const doc = readFileSync(path.join(dir, 'UNVERIFIED.md'), 'utf8');
    const missing = result.parts.filter((p) => p.layout && !p.layout.layoutVerified && !doc.includes(`\`${p.id}\``)).map((p) => p.id);
    expect(missing).toEqual([]);
  });
  it('resolves the priority build at real size', () => {
    const pi = result.parts.find((p) => p.id === 'raspberry-pi-4-case')!;
    const ports = resolveFace(pi, 'front', partWidthMm(pi), pi.heightMm ?? U_MM).elements.filter((e) => e.kind === 'port');
    expect(ports).toHaveLength(5);
    const solid = ports.filter((e) => !LAYERED_KINDS.has(e.kind));
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) expect(overlaps(solid[i]!, solid[j]!)).toBe(false);
  });
});
