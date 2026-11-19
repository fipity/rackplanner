/**
 * Source adapters: one per model-sharing site. An adapter recognises the
 * site's model links, turns them into a canonical form and reads model
 * details out of the public page HTML (meta tags and embedded JSON). The
 * server does the fetching; everything here is pure so it runs in tests and
 * in the browser.
 *
 * Only MakerWorld is implemented. To add Printables or Thingiverse, write an
 * adapter and add it to ADAPTERS (and its site to SOURCE_SITES).
 */
import type { SourceSite } from './schema.js';

export interface ParsedModelUrl {
  site: SourceSite;
  modelId: string;
  /** URL slug ("unifi-nvr-instant-10-inch-rackmount"), when the link had one. */
  slug: string | null;
  profileId: string | null;
  /** Cleaned link to the model page. */
  canonicalUrl: string;
}

/** Details read from a model page. Every field is plain text (or a URL) or null. */
export interface ModelDetails {
  title: string | null;
  designer: string | null;
  designerUrl: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  licence: string | null;
  profileName: string | null;
}

export interface SourceAdapter {
  site: SourceSite;
  /** Name shown to people ("MakerWorld"). */
  label: string;
  /** Hostnames (and their subdomains) the model pages may be fetched from. */
  pageHosts: readonly string[];
  /** Hostnames (and their subdomains) thumbnails may be fetched from. */
  imageHosts: readonly string[];
  /** Does this URL belong to the site (any page, not necessarily a model)? */
  owns(url: URL): boolean;
  /** Parse a model link, or null if it isn't one. */
  parse(url: URL): ParsedModelUrl | null;
  /** Read details from the model page HTML. Returns null when the page has nothing usable (e.g. a bot challenge). */
  extract(html: string, parsed: ParsedModelUrl): ModelDetails | null;
}

export type ModelUrlResult = { ok: true; adapter: SourceAdapter; parsed: ParsedModelUrl } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Is `host` equal to `domain` or one of its subdomains? */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return h === domain || h.endsWith(`.${domain}`);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * Plain text from untrusted page text: tags removed, entities decoded, control
 * characters dropped, whitespace collapsed and length capped. Nothing fetched
 * is ever rendered as HTML.
 */
export function sanitizeText(raw: unknown, max = 200): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s).replace(/<[^>]*>/g, ' ');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** An absolute https URL on one of `hosts`, or null. */
export function safeHttpsUrl(raw: unknown, hosts: readonly string[]): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(decodeEntities(raw.trim()).replace(/^\/\//, 'https://'));
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (!hosts.some((h) => hostMatches(u.hostname, h))) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Content of <meta property|name="key" content="…">, attribute order agnostic. */
export function metaContent(html: string, key: string): string | null {
  const re = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  const want = key.toLowerCase();
  for (const m of html.matchAll(re)) {
    const tag = m[0];
    const name = /\b(?:property|name|itemprop)\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const id = (name?.[2] ?? name?.[3] ?? '').toLowerCase();
    if (id !== want) continue;
    const content = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const v = content?.[2] ?? content?.[3];
    if (v !== undefined) return v;
  }
  return null;
}

/** JSON from <script type="application/json" id="…"> or application/ld+json blocks. */
export function embeddedJson(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const attrs = m[1] ?? '';
    if (!/type\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attrs) && !/id\s*=\s*["']__NEXT_DATA__["']/i.test(attrs)) continue;
    const body = (m[2] ?? '').trim();
    if (!body || body.length > 3_000_000) continue;
    try {
      out.push(JSON.parse(body));
    } catch {
      /* not JSON */
    }
  }
  return out;
}

/** Depth-first search for the first object satisfying `pred`. */
export function findObject(root: unknown, pred: (o: Record<string, unknown>) => boolean, maxDepth = 12): Record<string, unknown> | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): Record<string, unknown> | null => {
    if (!v || typeof v !== 'object' || depth > maxDepth || seen.has(v)) return null;
    seen.add(v);
    if (!Array.isArray(v) && pred(v as Record<string, unknown>)) return v as Record<string, unknown>;
    for (const child of Array.isArray(v) ? v : Object.values(v)) {
      const hit = walk(child, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(root, 0);
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null);

// ---------------------------------------------------------------------------
// MakerWorld
// ---------------------------------------------------------------------------

const MW_HOST = 'makerworld.com';
const MW_IMAGE_HOSTS = ['makerworld.com', 'bblmw.com'];
/** "/en", "/zh", "/pt-BR"… */
const LANG = /^[a-z]{2}(?:-[a-z]{2,4})?$/i;

/** Normalise a licence string: MakerWorld often says just "BY-NC-SA". */
export function normaliseLicence(raw: unknown): string | null {
  const s = sanitizeText(raw, 120);
  if (!s) return null;
  if (/^(?:CC[\s-]*)?BY(?:-(?:NC|SA|ND)){0,2}(?:\s*\d(?:\.\d)?)?$/i.test(s)) {
    return `CC ${s.replace(/^CC[\s-]*/i, '').toUpperCase()}`;
  }
  if (/^CC0/i.test(s)) return 'CC0';
  return s;
}

function mwTitle(raw: string | null): string | null {
  // "Name by Designer - MakerWorld" / "Name | MakerWorld"
  return sanitizeText(raw?.replace(/\s*[-|–]\s*MakerWorld.*$/i, '').replace(/\s+-\s+Free 3D Print Model.*$/i, ''));
}

export const makerWorld: SourceAdapter = {
  site: 'makerworld',
  label: 'MakerWorld',
  pageHosts: [MW_HOST],
  imageHosts: MW_IMAGE_HOSTS,

  owns(url) {
    return hostMatches(url.hostname, MW_HOST);
  },

  parse(url) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase();
    if (host !== MW_HOST && host !== `www.${MW_HOST}`) return null;
    if (url.username || url.password || (url.port && url.port !== '443' && url.port !== '80')) return null;
    const segs = url.pathname.split('/').filter(Boolean);
    if (segs[0] && LANG.test(segs[0]) && segs[0] !== 'models') segs.shift();
    if (segs[0] !== 'models' || segs.length !== 2) return null;
    const m = /^([0-9]{1,15})(?:-([a-z0-9][a-z0-9-]*))?$/i.exec(decodeURIComponent(segs[1]!));
    if (!m) return null;
    const modelId = m[1]!;
    const slug = m[2] ? m[2].toLowerCase().replace(/-+$/, '') || null : null;
    const fromHash = /profileId[-=]([0-9]{1,15})/i.exec(url.hash);
    const fromQuery = url.searchParams.get('profileId');
    const profileId = fromHash?.[1] ?? (fromQuery && /^[0-9]{1,15}$/.test(fromQuery) ? fromQuery : null);
    const canonicalUrl = `https://${MW_HOST}/en/models/${modelId}${slug ? `-${slug}` : ''}${profileId ? `#profileId-${profileId}` : ''}`;
    return { site: 'makerworld', modelId, slug, profileId, canonicalUrl };
  },

  extract(html, parsed) {
    // Cloudflare / bot challenges: nothing usable.
    if (/<title>\s*Just a moment/i.test(html) || /cf-browser-verification|challenge-platform/i.test(html)) return null;

    const json = embeddedJson(html);
    // The model ("design") object: has a title and the model id.
    const design =
      json
        .map((j) =>
          findObject(j, (o) => (str(o.id) === parsed.modelId || str(o.designId) === parsed.modelId) && typeof o.title === 'string'),
        )
        .find(Boolean) ?? null;
    const creator = design ? ((design.designCreator ?? design.creator ?? design.user ?? null) as Record<string, unknown> | null) : null;
    const instances = design && Array.isArray(design.instances) ? (design.instances as Record<string, unknown>[]) : [];
    const profile = parsed.profileId ? instances.find((i) => str(i?.id) === parsed.profileId || str(i?.profileId) === parsed.profileId) : undefined;

    const ogTitle = metaContent(html, 'og:title') ?? /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? null;
    let title = sanitizeText(design?.title) ?? mwTitle(ogTitle);
    let designer = sanitizeText(creator?.name ?? creator?.nickname ?? creator?.nickName, 120);
    // "Title by Designer" in the og:title when there's no JSON.
    if (title && !design) {
      const by = /^(.*\S)\s+by\s+(\S.{0,80})$/i.exec(title);
      if (by) {
        title = by[1]!;
        designer ??= sanitizeText(by[2], 120);
      }
    }
    designer ??= sanitizeText(metaContent(html, 'author'), 120);
    const handle = str(creator?.handle ?? creator?.userName ?? creator?.username);
    const designerUrl = handle && /^@?[A-Za-z0-9_.-]{1,60}$/.test(handle) ? `https://${MW_HOST}/en/${handle.startsWith('@') ? handle : `@${handle}`}` : null;
    const thumbnailUrl =
      safeHttpsUrl(design?.coverUrl ?? design?.cover ?? design?.coverImage, MW_IMAGE_HOSTS) ??
      safeHttpsUrl(metaContent(html, 'og:image'), MW_IMAGE_HOSTS) ??
      safeHttpsUrl(metaContent(html, 'twitter:image'), MW_IMAGE_HOSTS);
    const description =
      sanitizeText(design?.summary ?? design?.description, 600) ??
      sanitizeText(metaContent(html, 'og:description') ?? metaContent(html, 'description'), 600);
    const licence = normaliseLicence(design?.license ?? design?.licence ?? design?.copyright);
    const profileName = sanitizeText(profile?.title ?? profile?.name);

    const details: ModelDetails = { title, designer, designerUrl, thumbnailUrl, description, licence, profileName };
    return details.title ? details : null;
  },
};

/** Sites recognised but not supported yet, for a clearer message. */
const PLANNED: { domain: string; label: string }[] = [
  { domain: 'printables.com', label: 'Printables' },
  { domain: 'thingiverse.com', label: 'Thingiverse' },
];

export const ADAPTERS: readonly SourceAdapter[] = [makerWorld];

export function adapterFor(site: SourceSite): SourceAdapter {
  return ADAPTERS.find((a) => a.site === site)!;
}

/** Parse a pasted model link. Errors are written for people. */
export function parseModelUrl(input: string): ModelUrlResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Paste a MakerWorld model link' };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: 'That doesn’t look like a link' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, error: 'Only http(s) links are supported' };
  for (const adapter of ADAPTERS) {
    if (!adapter.owns(url)) continue;
    const parsed = adapter.parse(url);
    if (parsed) return { ok: true, adapter, parsed };
    return { ok: false, error: `That ${adapter.label} link isn’t a model page (expected …/models/<number>-<name>)` };
  }
  const planned = PLANNED.find((p) => hostMatches(url.hostname, p.domain));
  if (planned) return { ok: false, error: `${planned.label} links aren’t supported yet. Only MakerWorld for now.` };
  return { ok: false, error: `Only MakerWorld links are supported (makerworld.com/…/models/…), not ${url.hostname}` };
}
