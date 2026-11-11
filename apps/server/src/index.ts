import path from 'node:path';
import { buildApp } from './app.js';
import { loadCatalogDir } from './catalog.js';
import { seedCatalog } from './catalogRepo.js';
import { loadConfig } from './config.js';
import { seedExamples } from './examples.js';
import { openDb } from './db/index.js';

const config = loadConfig();
const catalog = loadCatalogDir(config.catalogDir);
if (catalog.errors.length) {
  console.error(`Catalog has ${catalog.errors.length} error(s):\n  ${catalog.errors.join('\n  ')}`);
  process.exit(1);
}

const db = openDb(path.join(config.dataDir, 'rackplanner.db'));
const reports = seedCatalog(db, catalog);
const examples = seedExamples(db, config.examplesDir);
const app = await buildApp({ config, db });
for (const r of examples.filter((r) => r.action !== 'skipped')) {
  app.log.info(`Example ${r.file}: ${r.action}${r.message ? ` (${r.message})` : ''}`);
}
for (const r of reports.filter((r) => r.action === 'seeded')) {
  app.log.info(`Seeded ${r.file}: ${r.parts} parts${r.retired ? `, retired ${r.retired}` : ''}`);
}

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  db.$client.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(`RackPlanner listening on http://${config.host}:${config.port} (data: ${config.dataDir})`);
