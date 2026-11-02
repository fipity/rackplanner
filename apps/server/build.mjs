// Bundle the server and all pure-JS dependencies into one file. Only the
// native better-sqlite3 module stays external (installed in the image).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['better-sqlite3'],
  // CommonJS dependencies (fastify, pino…) call require(); give ESM output one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
