/**
 * Outbound HTTP for model pages and thumbnails, locked down:
 *  - https only, to an allow-listed domain (checked on the parsed hostname),
 *    and every redirect hop is checked the same way;
 *  - the hostname must resolve only to public addresses, checked at connect
 *    time (no DNS rebinding window), so private, loopback and link-local
 *    networks are unreachable;
 *  - a hard timeout and a response size cap (Content-Length and streamed).
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { hostMatches } from '@rackplanner/shared';

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly kind: 'blocked' | 'timeout' | 'too-large' | 'http' | 'network' | 'type',
    public readonly status?: number,
  ) {
    super(message);
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and documentation addresses. */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return blocked.check(ip, 'ipv4');
  if (v === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped / compatible (::ffff:10.0.0.1): judge the embedded IPv4.
    const mapped = /^::(?:ffff:(?:0:)?)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isBlockedAddress(mapped[1]!);
    if (/^::ffff:/.test(lower)) return true;
    return blocked.check(ip, 'ipv6');
  }
  return true;
}

type LookupFn = (hostname: string, options: { all?: boolean; family?: number }, cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => void;

/** dns.lookup that refuses hostnames resolving to any non-public address. */
export const guardedLookup: LookupFn = (hostname, options, cb) => {
  dnsLookup(hostname, { all: true, family: options.family ?? 0 }, (err, addresses) => {
    if (err) return cb(err, []);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) {
      const e = new FetchError(`${hostname} resolves to a private or reserved address`, 'blocked') as Error as NodeJS.ErrnoException;
      e.code = 'EBLOCKED';
      return cb(e, []);
    }
    if (options.all) return cb(null, list);
    return cb(null, list[0]!.address, list[0]!.family);
  });
};

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/** One HTTP GET with no redirect handling. Swappable in tests. */
export type Transport = (url: URL, opts: { headers: Record<string, string>; timeoutMs: number; maxBytes: number }) => Promise<RawResponse>;

export const httpsTransport: Transport = (url, { headers, timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers, lookup: guardedLookup as never, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      // Redirects and errors: the body doesn't matter.
      if (status >= 300) {
        res.resume();
        resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        return;
      }
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        req.destroy(new FetchError(`Response too large (${declared} bytes)`, 'too-large'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) req.destroy(new FetchError(`Response larger than ${maxBytes} bytes`, 'too-large'));
        else chunks.push(c);
      });
      res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    const timer = setTimeout(() => req.destroy(new FetchError('Timed out', 'timeout')), timeoutMs);
    req.on('timeout', () => req.destroy(new FetchError('Timed out', 'timeout')));
    req.on('error', (e) => reject(e instanceof FetchError ? e : (e as NodeJS.ErrnoException).code === 'EBLOCKED' ? new FetchError(e.message, 'blocked') : new FetchError(e.message, 'network')));
    req.on('close', () => clearTimeout(timer));
    req.end();
  });

export interface SafeGetOptions {
  /** Domains (and their subdomains) allowed for the URL and every redirect. */
  domains: readonly string[];
  maxBytes: number;
  timeoutMs?: number;
  accept: string;
  userAgent: string;
  maxRedirects?: number;
  transport?: Transport;
}

export interface SafeGetResult {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

/** Throws FetchError('blocked') unless the URL is https on an allowed domain, with no credentials or odd port. */
export function assertAllowed(url: URL, domains: readonly string[]): void {
  if (url.protocol !== 'https:') throw new FetchError(`Only https is allowed (${url.protocol})`, 'blocked');
  if (url.username || url.password) throw new FetchError('Credentials in URLs are not allowed', 'blocked');
  if (url.port && url.port !== '443') throw new FetchError('Only the default https port is allowed', 'blocked');
  if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new FetchError('IP address hosts are not allowed', 'blocked');
  if (!domains.some((d) => hostMatches(url.hostname, d))) throw new FetchError(`${url.hostname} is not an allowed host`, 'blocked');
}

/** GET with the allow-list checked on every hop, manual redirects and size/time limits. */
export async function safeGet(input: string, opts: SafeGetOptions): Promise<SafeGetResult> {
  const transport = opts.transport ?? httpsTransport;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const started = Date.now();
  let url = new URL(input);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    assertAllowed(url, opts.domains);
    const left = timeoutMs - (Date.now() - started);
    if (left <= 0) throw new FetchError('Timed out', 'timeout');
    const res = await transport(url, {
      headers: { 'user-agent': opts.userAgent, accept: opts.accept, 'accept-encoding': 'identity', 'accept-language': 'en' },
      timeoutMs: left,
      maxBytes: opts.maxBytes,
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.location;
      const target = Array.isArray(loc) ? loc[0] : loc;
      if (!target) throw new FetchError('Redirect without a location', 'http', res.status);
      url = new URL(target, url);
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new FetchError(`HTTP ${res.status}`, 'http', res.status);
    if (res.body.length > opts.maxBytes) throw new FetchError(`Response larger than ${opts.maxBytes} bytes`, 'too-large');
    const ct = res.headers['content-type'];
    return { url: url.toString(), status: res.status, contentType: (Array.isArray(ct) ? ct[0] : ct) ?? '', body: res.body };
  }
  throw new FetchError('Too many redirects', 'http');
}
