import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Walk up from the server directory to find the repo root (contains catalog/). */
function findRepoRoot(): string {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'catalog'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8085),
  HOST: z.string().default('0.0.0.0'),
  DATA_DIR: z.string().optional(),
  CATALOG_DIR: z.string().optional(),
  EXAMPLES_DIR: z.string().optional(),
  WEB_DIST: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BASIC_AUTH_USER: z.string().optional(),
  BASIC_AUTH_PASS: z.string().optional(),
});

export type Config = {
  port: number;
  host: string;
  dataDir: string;
  catalogDir: string;
  examplesDir: string;
  webDist: string;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  basicAuth: { user: string; pass: string } | null;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = EnvSchema.parse(env);
  const root = findRepoRoot();
  return {
    port: e.PORT,
    host: e.HOST,
    dataDir: path.resolve(e.DATA_DIR ?? path.join(root, 'data')),
    catalogDir: path.resolve(e.CATALOG_DIR ?? path.join(root, 'catalog')),
    examplesDir: path.resolve(e.EXAMPLES_DIR ?? path.join(root, 'examples')),
    webDist: path.resolve(e.WEB_DIST ?? path.join(root, 'apps/web/dist')),
    logLevel: e.LOG_LEVEL,
    basicAuth: e.BASIC_AUTH_USER && e.BASIC_AUTH_PASS ? { user: e.BASIC_AUTH_USER, pass: e.BASIC_AUTH_PASS } : null,
  };
}
