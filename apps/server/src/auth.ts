import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Requests that skip basic auth: the health check, and what a read-only share
 * link needs (its page, the app's static files and the shared design itself).
 */
export function isPublicPath(method: string, url: string): boolean {
  const pathname = url.split('?')[0]!;
  if (pathname === '/api/health') return true;
  if (method !== 'GET' && method !== 'HEAD') return false;
  return (
    pathname.startsWith('/api/shared/') ||
    /^\/api\/thumbnails\/[a-f0-9]{64}$/.test(pathname) ||
    /^\/s\/[A-Za-z0-9_-]+\/?$/.test(pathname) ||
    pathname.startsWith('/assets/') ||
    /^\/[A-Za-z0-9_.-]+\.(?:svg|png|ico|webmanifest|txt)$/.test(pathname)
  );
}

/**
 * Optional HTTP basic auth, enabled when BASIC_AUTH_USER and BASIC_AUTH_PASS
 * are both set. Public paths (above) stay open.
 */
export function registerBasicAuth(app: FastifyInstance, creds: { user: string; pass: string }): void {
  app.addHook('onRequest', async (req, reply) => {
    if (isPublicPath(req.method, req.url)) return;
    const header = req.headers.authorization ?? '';
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      if (sep !== -1 && safeEqual(decoded.slice(0, sep), creds.user) && safeEqual(decoded.slice(sep + 1), creds.pass)) {
        return;
      }
    }
    reply.header('WWW-Authenticate', 'Basic realm="RackPlanner", charset="UTF-8"');
    return reply.code(401).send({ error: 'Unauthorized' });
  });
}
