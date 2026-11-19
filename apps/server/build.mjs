// Bundle the server and all pure-JS dependencies into one file. Only the
// native better-sqlite3 and sharp modules stay external (installed in the image).
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // sharp (thumbnails) is native too; it's loaded lazily, so the server runs without it.
  external: ['better-sqlite3', 'sharp'],
  define: { __APP_VERSION__: JSON.stringify(version) },
  // CommonJS dependencies (fastify, pino…) call require(); give ESM output one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
