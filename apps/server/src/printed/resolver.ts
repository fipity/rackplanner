/**
 * Turn a pasted model link into details: parse it, then (only when asked,
 * never in the background) fetch the public page once, read its metadata and
 * cache the result, including a failure. MakerWorld often answers scripted
 * requests with a bot challenge; that's a normal outcome here, not an error:
 * the client falls back to what the link itself says.
 */
import { adapterFor, parseModelUrl, type ModelDetails, type ParsedModelUrl } from '@rackplanner/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { printedSources } from '../db/schema.js';
import { FetchError, safeGet, type Transport } from './netguard.js';
import { ImageError, MAX_IMAGE_BYTES, type ThumbnailStore } from './thumbnails.js';

export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;

declare const __APP_VERSION__: string | undefined;
export const USER_AGENT = `RackPlanner/${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'} (self-hosted rack planner; +https://github.com/fipity/rackplanner)`;

export class ResolveError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export interface ResolveResult {
  parsed: ParsedModelUrl;
  /** Details from the page, or null when they couldn't be fetched. */
  details: Omit<ModelDetails, 'thumbnailUrl'> | null;
  thumbnail: string | null;
  fetched: boolean;
  /** Why details couldn't be fetched (for a small note, not an error). */
  reason: string | null;
  fetchedAt: string;
  cached: boolean;
}

export interface ResolverDeps {
  db: Db;
  thumbnails: ThumbnailStore;
  transport?: Transport;
  log?: { info: (o: object, msg: string) => void };
}

function describe(e: unknown): string {
  if (e instanceof FetchError) {
    if (e.kind === 'http' && (e.status === 403 || e.status === 503 || e.status === 429)) return 'The site blocked the automatic request';
    if (e.kind === 'timeout') return 'The site took too long to answer';
    if (e.kind === 'too-large') return 'The page was too large';
    if (e.kind === 'blocked') return 'The address isn’t allowed';
    return e.kind === 'http' ? `The site answered ${e.message}` : 'Couldn’t reach the site';
  }
  return 'Couldn’t read the page';
}

const keyOf = (p: ParsedModelUrl) => and(eq(printedSources.site, p.site), eq(printedSources.modelId, p.modelId), eq(printedSources.profileId, p.profileId ?? ''));

export async function resolveModel(deps: ResolverDeps, rawUrl: unknown, opts: { refresh?: boolean } = {}): Promise<ResolveResult> {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2000) throw new ResolveError('Expected { url }');
  const r = parseModelUrl(rawUrl);
  if (!r.ok) throw new ResolveError(r.error);
  const { adapter, parsed } = r;

  const cached = deps.db.select().from(printedSources).where(keyOf(parsed)).get();
  // Pasting the same link again reuses a good result; Refresh (or an earlier failure) fetches again.
  if (cached && cached.status === 'ok' && !opts.refresh) {
    const { thumbnailUrl: _t, ...details } = cached.details ?? ({} as ModelDetails);
    return { parsed, details: cached.details ? details : null, thumbnail: cached.thumbnail, fetched: true, reason: null, fetchedAt: cached.fetchedAt, cached: true };
  }

  const now = new Date().toISOString();
  let details: ModelDetails | null = null;
  let reason: string | null = null;
  try {
    const page = await safeGet(parsed.canonicalUrl.replace(/#.*$/, ''), {
      domains: adapter.pageHosts,
      maxBytes: MAX_PAGE_BYTES,
      timeoutMs: FETCH_TIMEOUT_MS,
      accept: 'text/html,application/xhtml+xml',
      userAgent: USER_AGENT,
      ...(deps.transport ? { transport: deps.transport } : {}),
    });
    if (!/html/i.test(page.contentType)) throw new FetchError('Not an HTML page', 'type');
    details = adapter.extract(page.body.toString('utf8'), parsed);
    if (!details) reason = 'The page had no readable details (probably a bot check)';
  } catch (e) {
    reason = describe(e);
    deps.log?.info({ url: parsed.canonicalUrl, err: (e as Error).message }, 'model page fetch failed');
  }

  let thumbnail: string | null = cached?.thumbnail ?? null;
  if (details?.thumbnailUrl) {
    try {
      const img = await safeGet(details.thumbnailUrl, {
        domains: adapterFor(parsed.site).imageHosts,
        maxBytes: MAX_IMAGE_BYTES,
        timeoutMs: FETCH_TIMEOUT_MS,
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        userAgent: USER_AGENT,
        ...(deps.transport ? { transport: deps.transport } : {}),
      });
      thumbnail = await deps.thumbnails.store(img.body);
    } catch (e) {
      deps.log?.info({ url: details.thumbnailUrl, err: (e as Error).message }, 'thumbnail fetch failed');
      if (!(e instanceof FetchError) && !(e instanceof ImageError)) throw e;
    }
  }

  const row = {
    site: parsed.site,
    modelId: parsed.modelId,
    profileId: parsed.profileId ?? '',
    url: parsed.canonicalUrl,
    status: details ? ('ok' as const) : ('failed' as const),
    details,
    thumbnail,
    error: reason,
    fetchedAt: now,
  };
  // A failed refresh never throws away details fetched earlier.
  if (details || !cached || cached.status !== 'ok') {
    deps.db
      .insert(printedSources)
      .values(row)
      .onConflictDoUpdate({ target: [printedSources.site, printedSources.modelId, printedSources.profileId], set: row })
      .run();
  } else {
    const { thumbnailUrl: _t, ...kept } = cached.details ?? ({} as ModelDetails);
    return { parsed, details: cached.details ? kept : null, thumbnail: cached.thumbnail, fetched: true, reason: `Refresh failed: ${reason}`, fetchedAt: cached.fetchedAt, cached: true };
  }
  const { thumbnailUrl: _t, ...out } = details ?? ({} as ModelDetails);
  return { parsed, details: details ? out : null, thumbnail, fetched: !!details, reason, fetchedAt: now, cached: false };
}
