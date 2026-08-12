import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const manifestPath = fileURLToPath(new URL("../src/data/changelog-releases.json", import.meta.url));
const releases = JSON.parse(readFileSync(manifestPath, "utf8"));

function pacificDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function fail(message) {
  console.error(`[Changelog] ${message}`);
  process.exit(1);
}

if (!Array.isArray(releases) || releases.length === 0) {
  fail("The release manifest is empty.");
}

const sourceKeys = new Set();
for (const [index, release] of releases.entries()) {
  if (!release || typeof release !== "object") fail(`Release ${index + 1} is invalid.`);
  if (!release.sourceKey || sourceKeys.has(release.sourceKey)) fail(`Release ${index + 1} has a missing or duplicate sourceKey.`);
  sourceKeys.add(release.sourceKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(release.publishedAt ?? "")) fail(`${release.sourceKey} has an invalid publishedAt date.`);
  if (!String(release.title ?? "").trim()) fail(`${release.sourceKey} is missing a title.`);
  if (!Array.isArray(release.changes) || release.changes.length === 0) fail(`${release.sourceKey} has no changes.`);
}

const requiredDate = process.env.CHANGELOG_RELEASE_DATE || pacificDate();
if (!releases.some((release) => release.publishedAt === requiredDate)) {
  fail(`No release entry exists for ${requiredDate}. Add one before deploying.`);
}

if (process.env.CHANGELOG_SKIP_GIT_CHECK !== "true") {
  let changedFiles;
  try {
    changedFiles = execFileSync(
      "git",
      ["diff-tree", "--no-commit-id", "--name-only", "-r", "-m", "HEAD"],
      { encoding: "utf8" }
    );
  } catch {
    fail("Could not verify the files in the deployment commit.");
  }

  if (!changedFiles.split(/\r?\n/).includes("src/data/changelog-releases.json")) {
    fail("The deployment commit does not update src/data/changelog-releases.json.");
  }
}

console.log(`[Changelog] Release manifest is valid and includes ${requiredDate}.`);
