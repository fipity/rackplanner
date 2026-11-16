import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DesignSchema, type Design } from '@rackplanner/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const TemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(400),
  design: DesignSchema,
});
export type Template = { id: string; name: string; description: string; design: Design };

/** Starting-point designs from `<examplesDir>/templates/*.json`; invalid files are skipped and logged. */
export function loadTemplates(dir: string, warn: (msg: string) => void = () => {}): Template[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const out: Template[] = [];
  for (const file of files) {
    try {
      const r = TemplateSchema.safeParse(JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
      if (r.success) out.push(r.data);
      else warn(`template ${file}: ${r.error.message}`);
    } catch (err) {
      warn(`template ${file}: ${(err as Error).message}`);
    }
  }
  return out;
}

export function registerTemplateRoutes(app: FastifyInstance, examplesDir: string): void {
  const templates = loadTemplates(path.join(examplesDir, 'templates'), (m) => app.log.warn(m));
  app.get('/api/templates', async () => ({ templates }));
}
