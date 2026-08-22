import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Database path: use DATABASE_PATH env var in production, local file in dev
const dbPath = process.env.DATABASE_PATH || "pbo.db";

const baseClient = createClient({
  url: `file:${dbPath}`,
});

const slowQueryThresholdMs = Number(
  process.env.SLOW_DB_QUERY_MS || (process.env.NODE_ENV === "production" ? 250 : 1000)
);

let slowQueryCount = 0;
let slowestQueryMs = 0;
let totalQueryMs = 0;
const slowQuerySamples = new Map<string, { count: number; totalMs: number; maxMs: number }>();

function getStatementPreview(statement: unknown) {
  if (typeof statement === "string") return statement;
  if (statement && typeof statement === "object" && "sql" in statement) {
    const sql = (statement as { sql?: unknown }).sql;
    return typeof sql === "string" ? sql : JSON.stringify(statement);
  }
  return String(statement);
}

function recordQueryTiming(kind: "query" | "batch", statement: unknown, durationMs: number) {
  totalQueryMs += durationMs;
  slowestQueryMs = Math.max(slowestQueryMs, durationMs);

  if (durationMs < slowQueryThresholdMs) return;

  slowQueryCount++;
  const preview = getStatementPreview(statement).replace(/\s+/g, " ").slice(0, 220);
  const fingerprint = preview
    .replace(/'[^']*'/g, "?")
    .replace(/\b\d+\b/g, "?");
  const sample = slowQuerySamples.get(fingerprint) || { count: 0, totalMs: 0, maxMs: 0 };
  sample.count++;
  sample.totalMs += durationMs;
  sample.maxMs = Math.max(sample.maxMs, durationMs);
  slowQuerySamples.set(fingerprint, sample);
  console.warn(`[DB Slow ${kind}] ${Math.round(durationMs)}ms ${preview}`);
}

const client = new Proxy(baseClient, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);

    if (prop === "execute" && typeof value === "function") {
      return async (...args: Parameters<typeof baseClient.execute>) => {
        const start = performance.now();
        try {
          return await value.apply(target, args);
        } finally {
          recordQueryTiming("query", args[0], performance.now() - start);
        }
      };
    }

    if (prop === "batch" && typeof value === "function") {
      return async (...args: Parameters<typeof baseClient.batch>) => {
        const start = performance.now();
        try {
          return await value.apply(target, args);
        } finally {
          recordQueryTiming("batch", args[0], performance.now() - start);
        }
      };
    }

    return typeof value === "function" ? value.bind(target) : value;
  },
}) as typeof baseClient;

const isProductionBuild =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

// Initialize SQLite with optimizations for better read performance
// Run PRAGMA commands to optimize for read-heavy workloads
async function initializeDb() {
  try {
    // WAL mode is enabled once by the controlled startup migration. These
    // settings are connection-local and belong on each application process.
    await client.execute("PRAGMA busy_timeout = 10000");
    // Keep more data in memory
    await client.execute("PRAGMA cache_size = -64000"); // 64MB cache
    // Reduce fsync calls for reads
    await client.execute("PRAGMA synchronous = NORMAL");
    // Memory-map the database for faster reads
    await client.execute("PRAGMA mmap_size = 268435456"); // 256MB mmap
    console.log("[DB] SQLite connection optimizations applied");
  } catch (e) {
    console.error("[DB] Failed to apply optimizations:", e);
  }
}

// Initialize on first import
export const databaseReady = isProductionBuild ? Promise.resolve() : initializeDb();

// Query counter for debugging
let queryCount = 0;
let totalRowsRead = 0;

// Custom logger to track queries
const queryLogger = {
  logQuery: (query: string) => {
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
  const slowQueries = [...slowQuerySamples.entries()]
    .map(([statement, sample]) => ({ statement, ...sample }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 10);
  return { queryCount, totalRowsRead, slowQueryCount, slowestQueryMs, totalQueryMs, slowQueryThresholdMs, slowQueries };
}

export function resetQueryStats() {
  queryCount = 0;
  totalRowsRead = 0;
  slowQueryCount = 0;
  slowestQueryMs = 0;
  totalQueryMs = 0;
  slowQuerySamples.clear();
}
