/**
 * Generate catalog/schema.json from the zod schema so editors (VS Code etc.)
 * can autocomplete and validate catalog files via their "$schema" key.
 * Cross-field rules (superRefine) are only enforced by `npm run validate:catalog`.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogFileSchema } from '@rackplanner/shared';
import { z } from 'zod';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'catalog', 'schema.json');
const schema = z.toJSONSchema(CatalogFileSchema, { io: 'input', unrepresentable: 'any' });
writeFileSync(out, JSON.stringify({ title: 'RackPlanner catalog file', ...schema }, null, 2) + '\n');
console.log(`wrote ${out}`);
