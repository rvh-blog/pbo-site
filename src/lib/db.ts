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
    // WAL mode for better concurrency
    await client.execute("PRAGMA journal_mode = WAL");
    // Keep more data in memory
    await client.execute("PRAGMA cache_size = -64000"); // 64MB cache
    // Reduce fsync calls for reads
    await client.execute("PRAGMA synchronous = NORMAL");
    // Memory-map the database for faster reads
    await client.execute("PRAGMA mmap_size = 268435456"); // 256MB mmap
    await ensurePerformanceIndexes();
    console.log("[DB] SQLite optimizations applied");
  } catch (e) {
    console.error("[DB] Failed to apply optimizations:", e);
  }
}

async function ensurePerformanceIndexes() {
  const statements = [
    "CREATE INDEX IF NOT EXISTS idx_seasons_current_public_number ON seasons(is_current, is_public, season_number)",
    "CREATE INDEX IF NOT EXISTS idx_divisions_season_order ON divisions(season_id, display_order)",
    "CREATE INDEX IF NOT EXISTS idx_season_coaches_division_active ON season_coaches(division_id, is_active)",
    "CREATE INDEX IF NOT EXISTS idx_season_coaches_replaced_by_id ON season_coaches(replaced_by_id)",
    "CREATE INDEX IF NOT EXISTS idx_rosters_season_coach_pokemon ON rosters(season_coach_id, pokemon_id)",
    "CREATE INDEX IF NOT EXISTS idx_matches_coach1_season_id ON matches(coach1_season_id)",
    "CREATE INDEX IF NOT EXISTS idx_matches_coach2_season_id ON matches(coach2_season_id)",
    "CREATE INDEX IF NOT EXISTS idx_matches_division_week ON matches(division_id, week)",
    "CREATE INDEX IF NOT EXISTS idx_matches_season_week ON matches(season_id, week)",
    "CREATE INDEX IF NOT EXISTS idx_matches_move_records_filter ON matches(is_forfeit, winner_id, played_at)",
    "CREATE INDEX IF NOT EXISTS idx_match_pokemon_season_coach_pokemon ON match_pokemon(season_coach_id, pokemon_id)",
    "CREATE INDEX IF NOT EXISTS idx_transactions_season_coach ON transactions(season_id, season_coach_id)",
    "CREATE INDEX IF NOT EXISTS idx_playoff_matches_division_id ON playoff_matches(division_id)",
    "CREATE INDEX IF NOT EXISTS idx_playoff_matches_higher_seed_id ON playoff_matches(higher_seed_id)",
    "CREATE INDEX IF NOT EXISTS idx_playoff_matches_lower_seed_id ON playoff_matches(lower_seed_id)",
    "CREATE INDEX IF NOT EXISTS idx_kill_events_killer_season_coach_id ON kill_events(killer_season_coach_id)",
    "CREATE INDEX IF NOT EXISTS idx_kill_events_victim_season_coach_id ON kill_events(victim_season_coach_id)",
    "CREATE INDEX IF NOT EXISTS idx_transactions_trading_partner_season_coach_id ON transactions(trading_partner_season_coach_id)",
    "CREATE INDEX IF NOT EXISTS idx_pick_em_picks_predicted_winner_id ON pick_em_picks(predicted_winner_id)",
    "CREATE INDEX IF NOT EXISTS idx_bets_predicted_winner_id ON bets(predicted_winner_id)",
    "CREATE INDEX IF NOT EXISTS idx_kill_bets_season_coach_id ON kill_bets(season_coach_id)",
    "CREATE INDEX IF NOT EXISTS idx_death_bets_season_coach_id ON death_bets(season_coach_id)",
    "CREATE INDEX IF NOT EXISTS idx_season_pokemon_prices_season_pokemon ON season_pokemon_prices(season_id, pokemon_id)",
  ];

  for (const statement of statements) {
    await client.execute(statement);
  }
}

// Initialize on first import
if (!isProductionBuild) {
  initializeDb();
}

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
