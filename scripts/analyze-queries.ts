import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, desc, and, count, inArray, or, isNotNull, lte } from "drizzle-orm";
import * as schema from "../src/lib/schema";

const client = createClient({ url: "file:pbo.db" });

let queryCount = 0;
let totalRows = 0;

// Wrap execute to count queries and rows
const originalExecute = client.execute.bind(client);
client.execute = async (sql: any) => {
  queryCount++;
  const result = await originalExecute(sql);
  const rows = result.rows?.length || 0;
  totalRows += rows;
  const queryStr = typeof sql === 'string' ? sql : sql.sql;
  console.log(`  Query #${queryCount}: ${rows} rows - ${queryStr.slice(0, 80)}...`);
  return result;
};

const db = drizzle(client, { schema });

function resetStats() {
  queryCount = 0;
  totalRows = 0;
}

function printStats(pageName: string) {
  console.log(`\n  📊 ${pageName}: ${queryCount} queries, ${totalRows} total rows read\n`);
  console.log("=".repeat(80));
}

async function simulateHomePage() {
  console.log("\n🏠 HOME PAGE (/)");
  resetStats();

  // From src/app/page.tsx - getCurrentSeason()
  await db.query.seasons.findFirst({
    where: eq(schema.seasons.isCurrent, true),
    with: { divisions: true },
  });

  // getRecentMatches()
  const recentMatches = await db.query.matches.findMany({
    where: isNotNull(schema.matches.winnerId),
    orderBy: [desc(schema.matches.playedAt)],
    limit: 5,
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
      division: { with: { season: true } },
    },
  });

  // getTopCoaches()
  await db.query.coaches.findMany({
    orderBy: [desc(schema.coaches.eloRating)],
    limit: 5,
  });

  // getSeasonStats() - multiple queries
  const currentSeason = await db.query.seasons.findFirst({
    where: eq(schema.seasons.isCurrent, true),
  });
  if (currentSeason) {
    await db.select({ count: count() }).from(schema.seasonCoaches)
      .innerJoin(schema.divisions, eq(schema.seasonCoaches.divisionId, schema.divisions.id))
      .where(eq(schema.divisions.seasonId, currentSeason.id));

    await db.select({ count: count() }).from(schema.matches)
      .where(and(eq(schema.matches.seasonId, currentSeason.id), isNotNull(schema.matches.winnerId)));
  }

  printStats("Home Page");
}

async function simulateCoachesPage() {
  console.log("\n👥 COACHES PAGE (/coaches)");
  resetStats();

  // From src/app/coaches/page.tsx - getCoachesWithStats()
  const allCoaches = await db.query.coaches.findMany();

  const latestSeason = await db.query.seasons.findFirst({
    orderBy: [desc(schema.seasons.seasonNumber)],
  });

  // For each coach, get their season entries
  for (const coach of allCoaches.slice(0, 10)) { // Limit to 10 for testing
    await db.query.seasonCoaches.findMany({
      where: eq(schema.seasonCoaches.coachId, coach.id),
      with: {
        division: { with: { season: true } },
      },
    });
  }

  console.log(`  ... (simulated ${allCoaches.length} coaches, showing first 10)`);
  printStats("Coaches Page (10 coaches)");
  console.log(`  ⚠️  Full page with ${allCoaches.length} coaches would be ~${queryCount * (allCoaches.length / 10)} queries`);
}

async function simulateLeaderboardsPage() {
  console.log("\n🏆 LEADERBOARDS PAGE (/leaderboards)");
  resetStats();

  // From src/app/leaderboards/page.tsx
  await db.query.coaches.findFirst({
    orderBy: [desc(schema.coaches.eloRating)],
  });

  await db.query.coaches.findMany({
    orderBy: [desc(schema.coaches.eloRating)],
    limit: 50,
  });

  // Get all seasons for tabs
  const allSeasons = await db.query.seasons.findMany({
    with: { divisions: true },
    orderBy: [desc(schema.seasons.seasonNumber)],
  });

  // For current season - get standings per division
  const currentSeason = allSeasons.find(s => s.isCurrent);
  if (currentSeason) {
    for (const div of currentSeason.divisions) {
      await db.query.seasonCoaches.findMany({
        where: eq(schema.seasonCoaches.divisionId, div.id),
        with: { coach: true },
      });
    }
  }

  printStats("Leaderboards Page");
}

async function simulateSeasonsPage() {
  console.log("\n📅 SEASONS PAGE (/seasons)");
  resetStats();

  // From src/app/seasons/page.tsx
  const allSeasons = await db.query.seasons.findMany({
    with: { divisions: true },
    orderBy: [desc(schema.seasons.seasonNumber)],
  });

  // For each season, count coaches per division (N+1 problem!)
  for (const season of allSeasons) {
    for (const div of season.divisions) {
      await db.select({ count: count() })
        .from(schema.seasonCoaches)
        .where(eq(schema.seasonCoaches.divisionId, div.id));
    }
  }

  printStats("Seasons Page");
}

async function simulateDraftBoard() {
  console.log("\n📋 DRAFT BOARD (/seasons/10/draft)");
  resetStats();

  // From src/app/seasons/[id]/draft/page.tsx
  await db.query.seasons.findFirst({
    where: eq(schema.seasons.id, 10),
    with: { divisions: true },
  });

  // Get ALL Pokemon prices for this season
  const prices = await db.query.seasonPokemonPrices.findMany({
    where: eq(schema.seasonPokemonPrices.seasonId, 10),
    with: { pokemon: true },
  });

  // Get rosters for each division
  const divisions = await db.query.divisions.findMany({
    where: eq(schema.divisions.seasonId, 10),
  });

  for (const div of divisions) {
    await db.query.seasonCoaches.findMany({
      where: eq(schema.seasonCoaches.divisionId, div.id),
      with: { rosters: true },
    });
  }

  printStats("Draft Board");
  console.log(`  📦 Pokemon prices loaded: ${prices.length} rows`);
}

async function simulateCoachProfile() {
  console.log("\n👤 COACH PROFILE (/coaches/1)");
  resetStats();

  // From src/app/coaches/[id]/page.tsx - this is complex!
  const coachId = 1;

  await db.query.coaches.findFirst({
    where: eq(schema.coaches.id, coachId),
  });

  await db.query.eloHistory.findMany({
    where: eq(schema.eloHistory.coachId, coachId),
    orderBy: [desc(schema.eloHistory.recordedAt)],
    limit: 20,
  });

  const seasons = await db.query.seasonCoaches.findMany({
    where: eq(schema.seasonCoaches.coachId, coachId),
    with: {
      division: { with: { season: true } },
      rosters: { with: { pokemon: true } },
    },
  });

  // Get ALL matches (then filter in JS)
  const allMatches = await db.query.matches.findMany({
    with: {
      coach1: { with: { coach: true } },
      coach2: { with: { coach: true } },
      division: { with: { season: true } },
    },
  });

  // Get match Pokemon
  const seasonCoachIds = seasons.map(s => s.id);
  if (seasonCoachIds.length > 0) {
    await db.query.matchPokemon.findMany({
      where: inArray(schema.matchPokemon.seasonCoachId, seasonCoachIds),
      with: { pokemon: true },
    });
  }

  // Get ALL transactions (then filter in JS)
  await db.query.transactions.findMany({
    orderBy: [desc(schema.transactions.createdAt)],
  });

  // Get Pokemon prices for selected season
  if (seasons[0]?.division?.season?.id) {
    await db.query.seasonPokemonPrices.findMany({
      where: eq(schema.seasonPokemonPrices.seasonId, seasons[0].division.season.id),
    });
  }

  printStats("Coach Profile");
}

async function main() {
  console.log("=".repeat(80));
  console.log("🔍 DATABASE QUERY ANALYSIS");
  console.log("=".repeat(80));

  await simulateHomePage();
  await simulateCoachesPage();
  await simulateLeaderboardsPage();
  await simulateSeasonsPage();
  await simulateDraftBoard();
  await simulateCoachProfile();

  console.log("\n" + "=".repeat(80));
  console.log("📈 SUMMARY - Estimated rows read per page load:");
  console.log("=".repeat(80));
  console.log(`
If hot reload triggers ALL pages to re-render, and you save files frequently:
- 100 file saves × queries per save = massive read count

Key issues to fix:
1. Coaches page: N+1 queries (1 query per coach)
2. Seasons page: N+1 queries (1 query per division)
3. Coach profile: Loads ALL matches then filters in JS
4. Draft board: Loads 1200+ Pokemon prices per load
`);

  process.exit(0);
}

main().catch(console.error);
