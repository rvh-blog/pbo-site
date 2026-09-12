import fs from "node:fs/promises";
import path from "node:path";
import { openMaintenanceDb } from "./maintenance-db.mjs";

const databasePath = process.env.DATABASE_PATH || "/data/pbo.db";
if (databasePath.replaceAll("\\", "/") !== "/data/pbo.db") {
  throw new Error("This backup command is restricted to /data/pbo.db.");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDirectory = process.env.BACKUP_DIR || `/data/backups/season11-backfill-${stamp}`;
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

console.log(`Production database backup created at ${backupDirectory}`);
