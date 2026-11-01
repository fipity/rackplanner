import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CatalogFileSchema, type CatalogFile, type Part } from '@rackplanner/shared';
import { z } from 'zod';

export interface LoadedCatalogFile {
  file: string;
  data: CatalogFile;
}

export interface CatalogLoadResult {
  files: LoadedCatalogFile[];
  parts: Part[];
  errors: string[];
}

/**
 * Read and validate every `*.json` file in the catalog directory.
 * Collects all errors (schema, JSON syntax, duplicate ids) instead of
 * stopping at the first one, so the validator can report everything at once.
 */
export function loadCatalogDir(dir: string): CatalogLoadResult {
  const files: LoadedCatalogFile[] = [];
  const errors: string[] = [];
  const seen = new Map<string, string>();
  const parts: Part[] = [];

  let names: string[];
  try {
    names = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'schema.json')
      .sort();
  } catch (err) {
    return { files, parts, errors: [`Cannot read catalog directory ${dir}: ${(err as Error).message}`] };
  }
  if (names.length === 0) errors.push(`No catalog JSON files found in ${dir}`);

  for (const name of names) {
    const full = path.join(dir, name);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(full, 'utf8'));
    } catch (err) {
      errors.push(`${name}: invalid JSON: ${(err as Error).message}`);
      continue;
    }
    const parsed = CatalogFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${name}: ${describePath(raw, issue.path)}: ${issue.message}`);
      }
      continue;
    }
    for (const part of parsed.data.parts) {
      const prev = seen.get(part.id);
      if (prev) {
        errors.push(`${name}: duplicate part id "${part.id}" (also in ${prev})`);
        continue;
      }
      seen.set(part.id, name);
      parts.push(part);
    }
    files.push({ file: name, data: parsed.data });
  }
  return { files, parts, errors };
}

/** Render an issue path, naming the part id where possible: parts[3](ubiquiti-x).ports */
function describePath(raw: unknown, issuePath: readonly PropertyKey[]): string {
  if (issuePath[0] === 'parts' && typeof issuePath[1] === 'number') {
    const partsArr = z.object({ parts: z.array(z.object({ id: z.unknown() }).loose()) }).safeParse(raw);
    const id = partsArr.success ? partsArr.data.parts[issuePath[1]]?.id : undefined;
    const rest = issuePath.slice(2).map(String).join('.');
    return `parts[${issuePath[1]}]${typeof id === 'string' ? `(${id})` : ''}${rest ? '.' + rest : ''}`;
  }
  return issuePath.map(String).join('.') || '(root)';
}
