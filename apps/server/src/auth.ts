import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Optional HTTP basic auth, enabled when BASIC_AUTH_USER and BASIC_AUTH_PASS
 * are both set. /api/health stays open so the Docker healthcheck works.
 */
export function registerBasicAuth(app: FastifyInstance, creds: { user: string; pass: string }): void {
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/api/health') return;
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
