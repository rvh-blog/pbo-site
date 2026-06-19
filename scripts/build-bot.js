const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: ['src/bot/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/bot/index.js',
  format: 'cjs',
  external: [
    'discord.js',
    'better-sqlite3',
  ],
  alias: {
    '@': path.resolve(__dirname, '../src'),
  },
  sourcemap: false,
  minify: false,
}).then(() => {
  console.log('[Build] Bot compiled successfully');
}).catch((error) => {
  console.error('[Build] Bot compilation failed:', error);
  process.exit(1);
});
