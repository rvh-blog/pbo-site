import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";

const sqlite = new Database("./data/pbo.db");
const db = drizzle(sqlite, { schema });

// S9 Sunset Playoff Bracket
// Left side: Seed 1. Blasphemous vs London, Seed 4. Lion City vs Philadelphia
// Right side: Seed 2. Charleston vs Helsinki, Seed 3. Alabama vs Prophet

interface PlayoffMatchup {
  higherSeedTeam: string;
  lowerSeedTeam: string;
  bracketPosition: number;
}

const quarterfinalsMatchups: PlayoffMatchup[] = [
  // Left side
  { higherSeedTeam: "Blasphemous Blacephalons", lowerSeedTeam: "London Lunalas", bracketPosition: 1 },
  { higherSeedTeam: "Lion City Leech Life", lowerSeedTeam: "Philadelphia PZs", bracketPosition: 2 },
  // Right side
  { higherSeedTeam: "Charleston Chesnaughts", lowerSeedTeam: "Helsinki Jellicent Klub", bracketPosition: 3 },
  { higherSeedTeam: "Alabama Feraligatrs", lowerSeedTeam: "Prophet of the Pantheon", bracketPosition: 4 },
];

async function seedPlayoffs() {
  console.log("Seeding S9 Sunset playoff bracket...\n");

  // Get Season 9
  const season9 = await db.query.seasons.findFirst({
    where: eq(schema.seasons.name, "Season 9"),
  });

  if (!season9) {
    console.error("Season 9 not found!");
    process.exit(1);
  }

  // Get Sunset division
  const sunsetDiv = await db.query.divisions.findFirst({
    where: and(
      eq(schema.divisions.seasonId, season9.id),
      eq(schema.divisions.name, "Sunset")
    ),
  });

  if (!sunsetDiv) {
    console.error("Sunset division not found!");
    process.exit(1);
  }

  console.log(`Found Season 9 (ID: ${season9.id}) and Sunset division (ID: ${sunsetDiv.id})`);

  // Get all season coaches for Sunset division
  const seasonCoaches = await db.query.seasonCoaches.findMany({
    where: eq(schema.seasonCoaches.divisionId, sunsetDiv.id),
  });

  console.log(`Found ${seasonCoaches.length} teams in Sunset division`);

  // Create team name to ID map
  const teamMap = new Map<string, number>();
  for (const sc of seasonCoaches) {
    teamMap.set(sc.teamName, sc.id);
  }

  // Clear existing playoff matches for this division
  await db.delete(schema.playoffMatches).where(
    eq(schema.playoffMatches.divisionId, sunsetDiv.id)
  );
  console.log("Cleared existing playoff matches\n");

  // Create quarterfinal matches (Round 1)
  console.log("Creating Quarterfinal matches:");
  for (const matchup of quarterfinalsMatchups) {
    const higherSeedId = teamMap.get(matchup.higherSeedTeam);
    const lowerSeedId = teamMap.get(matchup.lowerSeedTeam);

    if (!higherSeedId) {
      console.error(`  Team not found: ${matchup.higherSeedTeam}`);
      continue;
    }
    if (!lowerSeedId) {
      console.error(`  Team not found: ${matchup.lowerSeedTeam}`);
      continue;
    }

    await db.insert(schema.playoffMatches).values({
      seasonId: season9.id,
      divisionId: sunsetDiv.id,
      round: 1, // Quarterfinals
      bracketPosition: matchup.bracketPosition,
      higherSeedId,
      lowerSeedId,
      winnerId: null,
      higherSeedWins: 0,
      lowerSeedWins: 0,
    });

    console.log(`  QF${matchup.bracketPosition}: ${matchup.higherSeedTeam} vs ${matchup.lowerSeedTeam}`);
  }

  // Create semifinal placeholders (Round 2)
  console.log("\nCreating Semifinal placeholders:");
  for (let i = 1; i <= 2; i++) {
    await db.insert(schema.playoffMatches).values({
      seasonId: season9.id,
      divisionId: sunsetDiv.id,
      round: 2, // Semifinals
      bracketPosition: i,
      higherSeedId: null,
      lowerSeedId: null,
      winnerId: null,
      higherSeedWins: 0,
      lowerSeedWins: 0,
    });
    console.log(`  SF${i}: TBD vs TBD`);
  }

  // Create finals placeholder (Round 3)
  console.log("\nCreating Finals placeholder:");
  await db.insert(schema.playoffMatches).values({
    seasonId: season9.id,
    divisionId: sunsetDiv.id,
    round: 3, // Finals
    bracketPosition: 1,
    higherSeedId: null,
    lowerSeedId: null,
    winnerId: null,
    higherSeedWins: 0,
    lowerSeedWins: 0,
  });
  console.log("  Finals: TBD vs TBD");

  console.log("\n✅ Playoff bracket seeded successfully!");
  process.exit(0);
}

seedPlayoffs().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
