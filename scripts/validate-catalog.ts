/**
 * Validate every catalog/*.json file against the shared zod schema.
 * Exits non-zero (and prints every problem) on any error. Runs as part of
 * `npm run build`, so a bad catalog file fails the Docker build.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutPortCounts } from '@rackplanner/shared';
import { loadCatalogDir } from '../apps/server/src/catalog.js';
import { layoutProblems } from './layout-checks.js';

const dir = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'catalog');
const result = loadCatalogDir(dir);

// Layout consistency: every port drawn once, nothing outside its face or overlapping.
for (const p of result.parts) {
  for (const problem of layoutProblems(p)) result.errors.push(`layout: ${problem}`);
  if (p.layout?.front || p.layout?.rear) {
    const drawn = layoutPortCounts(p);
    for (const [type, n] of Object.entries(p.ports)) {
      if (n && drawn[type as keyof typeof drawn] !== n) result.errors.push(`layout: ${p.id} declares ${n} × ${type} but its layout draws ${drawn[type as keyof typeof drawn] ?? 0}`);
    }
    for (const type of Object.keys(drawn)) if (!(type in p.ports)) result.errors.push(`layout: ${p.id} layout draws ${type} ports the catalog entry doesn't list`);
  }
}

if (result.errors.length) {
  console.error(`\n✗ Catalog validation FAILED with ${result.errors.length} error(s):\n`);
  for (const e of result.errors) console.error(`  • ${e}`);
  console.error('');
  process.exit(1);
}

const unverified = result.parts.filter((p) => !p.verified).length;
console.log(`✓ ${result.files.length} catalog file(s), ${result.parts.length} parts valid (${unverified} unverified)`);
for (const f of result.files) console.log(`  - ${f.file} v${f.data.version}: ${f.data.parts.length} parts`);
