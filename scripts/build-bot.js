/* eslint-disable @typescript-eslint/no-require-imports */
const esbuild = require('esbuild');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const portablePath = (value) => value.split(path.sep).join('/');

esbuild.build({
  entryPoints: [portablePath(path.join(repoRoot, 'src/bot/index.ts'))],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: portablePath(path.join(repoRoot, 'dist/bot/index.js')),
  format: 'cjs',
  alias: {
    '@': portablePath(path.join(repoRoot, 'src')),
  },
  sourcemap: false,
  minify: true,
  keepNames: true,
}).then(() => {
  console.log('[Build] Bot compiled successfully');
}).catch((error) => {
  console.error('[Build] Bot compilation failed:', error);
  process.exit(1);
});
