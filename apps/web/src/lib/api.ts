import { PartSchema, type Part } from '@rackplanner/shared';
import { z } from 'zod';

const CatalogResponseSchema = z.object({
  parts: z.array(PartSchema),
  retired: z.array(z.string()),
  files: z.array(z.object({ file: z.string(), title: z.string(), version: z.number(), count: z.number() })),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}

async function request<T>(url: string, schema: z.ZodType<T> | null, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  });
  if (!res.ok) {
    let body: { error?: string; issues?: ApiError['issues'] } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, body.error ?? `${url}: HTTP ${res.status}`, body.issues);
  }
  if (!schema) return undefined as T;
  return schema.parse(await res.json());
}

export const fetchCatalog = () => request('/api/catalog', CatalogResponseSchema);

export const createPart = (part: unknown) => request('/api/parts', PartSchema, { method: 'POST', body: JSON.stringify(part) });

export const updatePart = (id: string, part: unknown) =>
  request(`/api/parts/${encodeURIComponent(id)}`, PartSchema, { method: 'PUT', body: JSON.stringify(part) });

export const deletePart = (id: string) => request(`/api/parts/${encodeURIComponent(id)}`, null, { method: 'DELETE' });

export type { Part };
