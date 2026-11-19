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

// ---------------------------------------------------------------------------
// Read-only share links
// ---------------------------------------------------------------------------

const ShareSchema = z.object({ share: z.object({ token: z.string(), createdAt: z.string() }).nullable() });
export type ShareInfo = NonNullable<z.infer<typeof ShareSchema>['share']>;

const shareUrl = (id: string) => `/api/designs/${encodeURIComponent(id)}/share`;
export const getShareApi = (id: string) => request(shareUrl(id), ShareSchema).then((r) => r.share);
export const createShareApi = (id: string) => request(shareUrl(id), ShareSchema, { method: 'POST', body: '{}' }).then((r) => r.share!);
export const deleteShareApi = (id: string) => request(shareUrl(id), null, { method: 'DELETE' });

const SharedDesignSchema = z.object({ design: DesignSchema, parts: z.array(PartSchema) });
export type SharedDesign = z.infer<typeof SharedDesignSchema>;
export const getSharedDesign = (token: string) => request(`/api/shared/${encodeURIComponent(token)}`, SharedDesignSchema);

// ---------------------------------------------------------------------------
// Templates (starting points for new designs)
// ---------------------------------------------------------------------------

const TemplateSchema = z.object({ id: z.string(), name: z.string(), description: z.string(), design: DesignSchema });
export type Template = z.infer<typeof TemplateSchema>;
export const listTemplates = () => request('/api/templates', z.object({ templates: z.array(TemplateSchema) })).then((r) => r.templates);

// ---------------------------------------------------------------------------
// 3D-printed parts
// ---------------------------------------------------------------------------

const ResolveSchema = z.object({
  parsed: z.object({ site: z.literal('makerworld'), modelId: z.string(), slug: z.string().nullable(), profileId: z.string().nullable(), canonicalUrl: z.string() }),
  details: z
    .object({
      title: z.string().nullable(),
      designer: z.string().nullable(),
      designerUrl: z.string().nullable(),
      description: z.string().nullable(),
      licence: z.string().nullable(),
      profileName: z.string().nullable(),
    })
    .nullable(),
  thumbnail: z.string().nullable(),
  fetched: z.boolean(),
  reason: z.string().nullable(),
  fetchedAt: z.string(),
  cached: z.boolean(),
});
export type ResolvedModel = z.infer<typeof ResolveSchema>;

/** Paste a link: the server fetches the page once (cached). */
export const resolvePrinted = (url: string, refresh = false) =>
  request(`/api/printed/${refresh ? 'refresh' : 'resolve'}`, ResolveSchema, { method: 'POST', body: JSON.stringify({ url }) });

/** Store an image (base64 or data: URL); returns its thumbnail id. */
export const uploadThumbnail = (data: string) =>
  request('/api/thumbnails', z.object({ id: z.string() }), { method: 'POST', body: JSON.stringify({ data }) }).then((r) => r.id);

export const thumbnailUrl = (id: string) => `/api/thumbnails/${id}`;

/** A stored thumbnail as base64 (for JSON exports), or null if it's gone. */
export async function thumbnailBase64(id: string): Promise<string | null> {
  const res = await fetch(thumbnailUrl(id));
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
