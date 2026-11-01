/**
 * Validate every catalog/*.json file against the shared zod schema.
 * Exits non-zero (and prints every problem) on any error. Runs as part of
 * `npm run build`, so a bad catalog file fails the Docker build.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalogDir } from '../apps/server/src/catalog.js';

const dir = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'catalog');
const result = loadCatalogDir(dir);

if (result.errors.length) {
  console.error(`\n✗ Catalog validation FAILED with ${result.errors.length} error(s):\n`);
  for (const e of result.errors) console.error(`  • ${e}`);
  console.error('');
  process.exit(1);
}

const unverified = result.parts.filter((p) => !p.verified).length;
console.log(`✓ ${result.files.length} catalog file(s), ${result.parts.length} parts valid (${unverified} unverified)`);
for (const f of result.files) console.log(`  - ${f.file} v${f.data.version}: ${f.data.parts.length} parts`);
