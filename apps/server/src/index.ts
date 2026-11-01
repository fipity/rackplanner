import { buildApp } from './app.js';
import { loadCatalogDir } from './catalog.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const catalog = loadCatalogDir(config.catalogDir);
if (catalog.errors.length) {
  console.error(`Catalog has ${catalog.errors.length} error(s):\n  ${catalog.errors.join('\n  ')}`);
  process.exit(1);
}

const app = await buildApp({
  config,
  parts: catalog.parts,
  catalogFiles: catalog.files.map((f) => ({
    file: f.file,
    title: f.data.title,
    version: f.data.version,
    count: f.data.parts.length,
  })),
});

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(`RackPlanner listening on http://${config.host}:${config.port} with ${catalog.parts.length} catalog parts`);
