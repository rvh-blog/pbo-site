import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Database path: use DATABASE_PATH env var in production, local file in dev
const dbPath = process.env.DATABASE_PATH || "pbo.db";

const client = createClient({
  url: `file:${dbPath}`,
});

// Initialize SQLite with optimizations for better read performance
// Run PRAGMA commands to optimize for read-heavy workloads
async function initializeDb() {
  try {
    // WAL mode for better concurrency
    await client.execute("PRAGMA journal_mode = WAL");
    // Keep more data in memory
    await client.execute("PRAGMA cache_size = -64000"); // 64MB cache
    // Reduce fsync calls for reads
    await client.execute("PRAGMA synchronous = NORMAL");
    // Memory-map the database for faster reads
    await client.execute("PRAGMA mmap_size = 268435456"); // 256MB mmap
    console.log("[DB] SQLite optimizations applied");
  } catch (e) {
    console.error("[DB] Failed to apply optimizations:", e);
  }
}

// Initialize on first import
initializeDb();

// Query counter for debugging
let queryCount = 0;
let totalRowsRead = 0;

// Custom logger to track queries
const queryLogger = {
  logQuery: (query: string, params: unknown[]) => {
    queryCount++;
    // Estimate rows by tracking SELECT queries
    const isSelect = query.trim().toUpperCase().startsWith("SELECT");
    console.log(`[DB Query #${queryCount}] ${isSelect ? "READ" : "WRITE"}: ${query.slice(0, 100)}${query.length > 100 ? "..." : ""}`);
  },
};

// Enable logging only in development when DEBUG_DB=true
const enableLogging = process.env.DEBUG_DB === "true";

export { client as rawClient };

export const db = drizzle(client, {
  schema,
  logger: enableLogging ? queryLogger : undefined,
});

// Export helper to get query stats
export function getQueryStats() {
  return { queryCount, totalRowsRead };
}

export function resetQueryStats() {
  queryCount = 0;
  totalRowsRead = 0;
}
