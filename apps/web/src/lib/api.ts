import { PartSchema, type Part } from '@rackplanner/shared';
import { z } from 'zod';

const CatalogResponseSchema = z.object({
  parts: z.array(PartSchema),
  files: z.array(z.object({ file: z.string(), title: z.string(), version: z.number(), count: z.number() })),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return schema.parse(await res.json());
}

export function fetchCatalog(): Promise<CatalogResponse> {
  return getJson('/api/catalog', CatalogResponseSchema);
}

export type { Part };
