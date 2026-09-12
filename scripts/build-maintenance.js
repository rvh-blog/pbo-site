/* eslint-disable @typescript-eslint/no-require-imports */
const esbuild = require("esbuild");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const portablePath = (value) => value.split(path.sep).join("/");
const entries = [
  "scripts/backup-production-db.mjs",
  "scripts/backfill-season11-hax.mjs",
  "scripts/backfill-mega-items.mjs",
];

esbuild.build({
  entryPoints: entries.map((entry) => portablePath(path.join(repoRoot, entry))),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: portablePath(path.join(repoRoot, "dist/maintenance")),
  entryNames: "[name]",
  outExtension: { ".js": ".mjs" },
  external: ["@libsql/client"],
  alias: {
    "@": portablePath(path.join(repoRoot, "src")),
  },
  sourcemap: false,
  minify: false,
}).then(() => {
  console.log("[Build] Maintenance scripts compiled successfully");
}).catch((error) => {
  console.error("[Build] Maintenance scripts compilation failed:", error);
  process.exit(1);
});
