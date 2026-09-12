import { createClient } from "@libsql/client";

export function openMaintenanceDb(databasePath) {
  const client = createClient({ url: `file:${databasePath}` });
  const execute = (sql, args = []) => client.execute({ sql, args });
  return {
    client,
    async all(sql, args = []) {
      const result = await execute(sql, args);
      return result.rows;
    },
    async get(sql, args = []) {
      const result = await execute(sql, args);
      return result.rows[0] ?? null;
    },
    execute,
    async batch(statements) {
      if (statements.length === 0) return;
      await client.batch(statements, "write");
    },
  };
}

export function assertProductionWriteAllowed(databasePath) {
  const normalizedPath = String(databasePath).replaceAll("\\", "/");
  if (normalizedPath !== "/data/pbo.db") return;

  if (
    process.env.ALLOW_PRODUCTION_BACKFILL !== "1" ||
    process.env.BACKFILL_CONFIRM !== "SEASON11" ||
    process.env.BACKFILL_BACKUP_CONFIRMED !== "1"
  ) {
    throw new Error(
      "Production writes require ALLOW_PRODUCTION_BACKFILL=1, BACKFILL_CONFIRM=SEASON11, and BACKFILL_BACKUP_CONFIRMED=1 after a verified backup.",
    );
  }
}
