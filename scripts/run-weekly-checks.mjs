import { buildSync } from "esbuild";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

for (const entry of ["scripts/check-weekly-experience.ts", "scripts/check-weekly-data.ts"]) {
  const result = buildSync({
    entryPoints: [resolve(process.cwd(), entry)], bundle: true, platform: "node", format: "cjs", packages: "external", write: false,
  });
  const checked = spawnSync(process.execPath, ["-"], { input: result.outputFiles[0].text, encoding: "utf8" });
  process.stdout.write(checked.stdout ?? "");
  process.stderr.write(checked.stderr ?? "");
  if (checked.error) throw checked.error;
  if (checked.status !== 0) process.exit(checked.status ?? 1);
}
