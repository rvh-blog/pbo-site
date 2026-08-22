import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const explicitBaseIndex = process.argv.indexOf("--base");
const explicitBase = explicitBaseIndex >= 0 ? process.argv[explicitBaseIndex + 1] : null;
const base = explicitBase || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "HEAD~1");
const range = explicitBase || process.env.GITHUB_BASE_REF ? `${base}...HEAD` : `${base}..HEAD`;

let changedOutput;
try {
  changedOutput = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", range],
    { encoding: "utf8" }
  );
} catch (error) {
  console.error(`[Lint] Could not determine changed files from ${range}.`);
  throw error;
}

const lintableExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const files = changedOutput
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => lintableExtensions.has(path.extname(file)))
  .filter((file) => existsSync(file));

if (files.length === 0) {
  console.log("[Lint] No changed JavaScript or TypeScript files.");
  process.exit(0);
}

console.log(`[Lint] Checking ${files.length} changed file(s).`);
const eslintEntry = path.join("node_modules", "eslint", "bin", "eslint.js");
const result = spawnSync(process.execPath, [eslintEntry, ...files], {
  stdio: "inherit",
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
