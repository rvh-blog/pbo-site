import fs from "node:fs/promises";
import path from "node:path";
import { openMaintenanceDb } from "./maintenance-db.mjs";

const databasePath = process.env.DATABASE_PATH || "/data/pbo.db";
if (databasePath.replaceAll("\\", "/") !== "/data/pbo.db") {
  throw new Error("This backup command is restricted to /data/pbo.db.");
}

const backupRoot = "/data/backups";
const backupRetentionCount = Number.parseInt(
  process.env.BACKUP_RETENTION_COUNT || "3",
  10,
);
if (!Number.isInteger(backupRetentionCount) || backupRetentionCount < 1) {
  throw new Error("BACKUP_RETENTION_COUNT must be a positive integer.");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDirectory =
  process.env.BACKUP_DIR || `${backupRoot}/season11-backfill-${stamp}`;
const backupPrefix = "season11-backfill-";
await fs.mkdir(backupRoot, { recursive: true });
await fs.mkdir(backupDirectory, { recursive: true });

const database = openMaintenanceDb(databasePath);
try {
  await database.execute("PRAGMA wal_checkpoint(TRUNCATE)");
} finally {
  database.client.close();
}

await fs.copyFile(databasePath, path.join(backupDirectory, "pbo.db"));
for (const suffix of ["-wal", "-shm"]) {
  const source = `${databasePath}${suffix}`;
  try {
    await fs.copyFile(source, path.join(backupDirectory, `pbo.db${suffix}`));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const sourceStats = await fs.stat(databasePath);
const backupStats = await fs.stat(path.join(backupDirectory, "pbo.db"));
if (sourceStats.size <= 0 || backupStats.size !== sourceStats.size) {
  throw new Error(
    `Backup verification failed: source is ${sourceStats.size} bytes, backup is ${backupStats.size} bytes.`,
  );
}

async function pruneOldBackups() {
  const entries = await fs.readdir(backupRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(backupPrefix)) continue;

    const directory = path.resolve(backupRoot, entry.name);
    const root = path.resolve(backupRoot);
    if (path.dirname(directory) !== root) continue;

    try {
      const stats = await fs.stat(path.join(directory, "pbo.db"));
      if (stats.isFile() && stats.size > 0) {
        candidates.push({ name: entry.name, directory });
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  candidates.sort((a, b) => b.name.localeCompare(a.name));
  const stale = candidates.slice(backupRetentionCount);
  for (const backup of stale) {
    await fs.rm(backup.directory, { recursive: true, force: true });
  }

  return {
    kept: Math.min(candidates.length, backupRetentionCount),
    removed: stale.map((backup) => backup.name),
  };
}

const retention = await pruneOldBackups();
console.log(`Production database backup created at ${backupDirectory}`);
console.log(
  `Backup retention kept ${retention.kept} verified local backups and removed ${retention.removed.length} older backups${retention.removed.length ? `: ${retention.removed.join(", ")}` : "."}`,
);
