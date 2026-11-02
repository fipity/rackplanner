import { DesignSchema, PartSchema, type Design, type Part, type Rack } from '@rackplanner/shared';
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

// ---------------------------------------------------------------------------
// Designs
// ---------------------------------------------------------------------------

const StoredDesignSchema = z.object({ design: DesignSchema, revision: z.number().int() });
export type StoredDesign = z.infer<typeof StoredDesignSchema>;

export const listDesigns = () => request('/api/designs', z.object({ designs: z.array(StoredDesignSchema) })).then((r) => r.designs);

export const getDesign = (id: string) => request(`/api/designs/${encodeURIComponent(id)}`, StoredDesignSchema);

export const createDesignApi = (input: { name?: string; rack?: Partial<Rack>; design?: Design }) =>
  request('/api/designs', StoredDesignSchema, { method: 'POST', body: JSON.stringify(input) });

export const saveDesignApi = (design: Design, revision: number, force = false) =>
  request(`/api/designs/${encodeURIComponent(design.id)}`, StoredDesignSchema, {
    method: 'PUT',
    body: JSON.stringify({ design, revision, ...(force ? { force: true } : {}) }),
  });

export const duplicateDesignApi = (id: string) =>
  request(`/api/designs/${encodeURIComponent(id)}/duplicate`, StoredDesignSchema, { method: 'POST', body: '{}' });

export const deleteDesignApi = (id: string) => request(`/api/designs/${encodeURIComponent(id)}`, null, { method: 'DELETE' });

/** Best-effort save while the page unloads (keepalive survives navigation). */
export function saveDesignOnUnload(design: Design, revision: number): void {
  try {
    void fetch(`/api/designs/${encodeURIComponent(design.id)}`, {
      method: 'PUT',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ design, revision }),
    });
  } catch {
    /* page is going away anyway */
  }
}
