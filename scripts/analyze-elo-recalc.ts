import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, asc } from "drizzle-orm";
import * as schema from "../src/lib/schema";

const client = createClient({ url: "file:pbo.db" });

let queryCount = 0;
let totalRows = 0;

// Wrap execute to count
const originalExecute = client.execute.bind(client);
client.execute = async (sql: any) => {
  queryCount++;
  const result = await originalExecute(sql);
  const rows = result.rows?.length || 0;
  totalRows += rows;
  const queryStr = typeof sql === 'string' ? sql : sql.sql;
  const isWrite = queryStr.trim().toUpperCase().startsWith("INSERT") ||
                  queryStr.trim().toUpperCase().startsWith("UPDATE") ||
                  queryStr.trim().toUpperCase().startsWith("DELETE");
  console.log(`Query #${queryCount}: ${isWrite ? "WRITE" : `READ ${rows} rows`} - ${queryStr.slice(0, 60)}...`);
  return result;
};

const db = drizzle(client, { schema });

async function analyzeEloRecalc() {
  console.log("=".repeat(80));
  console.log("🔍 ANALYZING ELO RECALCULATION QUERIES");
  console.log("=".repeat(80));
  console.log("\nStep 1: Load all matches with relations...\n");

  // This is what the ELO recalc does - load ALL matches with deep relations
  const allMatches = await db.query.matches.findMany({
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
      division: { with: { season: true } },
    },
    orderBy: [asc(schema.matches.seasonId), asc(schema.matches.week), asc(schema.matches.id)],
  });

  console.log(`\n📊 After loading matches: ${queryCount} queries, ${totalRows} rows read`);
  console.log(`   Matches loaded: ${allMatches.length}`);

  const step1Queries = queryCount;
  const step1Rows = totalRows;

  console.log("\n" + "=".repeat(80));
  console.log("\nStep 2: Load all coaches...\n");

  const allCoaches = await db.query.coaches.findMany();

  console.log(`\n📊 After loading coaches: ${queryCount - step1Queries} additional queries, ${totalRows - step1Rows} additional rows`);
  console.log(`   Coaches loaded: ${allCoaches.length}`);

  const step2Queries = queryCount;
  const step2Rows = totalRows;

  console.log("\n" + "=".repeat(80));
  console.log("\nStep 3: Simulating per-match operations (INSERTs)...\n");

  // In the real script, for each match it does:
  // - 2 INSERT INTO elo_history
  // Let's simulate just a few
  console.log("   (Each match = 2 INSERT statements for elo_history)");
  console.log(`   Total matches: ${allMatches.length}`);
  console.log(`   Total INSERTs would be: ${allMatches.length * 2}`);

  console.log("\n" + "=".repeat(80));
  console.log("\nStep 4: Final UPDATE for each coach...\n");

  console.log(`   Total UPDATEs would be: ~${allCoaches.length}`);

  console.log("\n" + "=".repeat(80));
  console.log("📈 SUMMARY");
  console.log("=".repeat(80));
  console.log(`
Total READ operations in ELO recalc:
- Loading matches with relations: ${step1Queries} queries, ${step1Rows} rows
- Loading coaches: ${queryCount - step1Queries} queries, ${totalRows - step2Rows + (totalRows - step1Rows)} rows
- TOTAL READS: ${totalRows} rows

Total WRITE operations:
- DELETE elo_history: 1 query
- INSERT elo_history: ${allMatches.length * 2} queries
- UPDATE coaches: ~${allCoaches.length} queries

Even if we ran this 100 times: ${totalRows * 100} rows = ${(totalRows * 100 / 1000000).toFixed(2)}M rows
To hit 500M would need: ${Math.ceil(500000000 / totalRows)} runs of ELO recalc
`);

  process.exit(0);
}

analyzeEloRecalc().catch(console.error);
