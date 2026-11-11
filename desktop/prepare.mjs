// Copy the built server bundle, web app, catalog and examples into the
// desktop package. Run `npm run build` at the repo root first.
import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const need = ['apps/server/dist/index.js', 'apps/web/dist/index.html'];
for (const f of need) {
  if (!existsSync(path.join(root, f))) {
    console.error(`Missing ${f}: run "npm run build" in the repo root first.`);
    process.exit(1);
  }
}

const out = (...p) => path.join(here, ...p);
rmSync(out('server'), { recursive: true, force: true });
rmSync(out('resources'), { recursive: true, force: true });

cpSync(path.join(root, 'apps/server/dist/index.js'), out('server/index.js'));
const noMaps = (src) => statSync(src).isDirectory() || !src.endsWith('.map');
cpSync(path.join(root, 'apps/web/dist'), out('resources/web'), { recursive: true, filter: noMaps });
cpSync(path.join(root, 'catalog'), out('resources/catalog'), { recursive: true, filter: (s) => statSync(s).isDirectory() || s.endsWith('.json') });
cpSync(path.join(root, 'examples'), out('resources/examples'), { recursive: true });
cpSync(out('build/icon.png'), out('resources/icon.png'));

const count = (d) => readdirSync(d, { recursive: true }).length;
console.log(`Prepared desktop app: web ${count(out('resources/web'))} files, catalog ${count(out('resources/catalog'))}, examples ${count(out('resources/examples'))}`);
