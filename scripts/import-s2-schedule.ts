import { db } from "../src/lib/db";
import * as schema from "../src/lib/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// Team name normalization - treat these as the same team
const TEAM_NAME_ALIASES: Record<string, string> = {
  "El Paso Charizards": "Madrid Metagross", // Renamed mid-season
};

async function main() {
  console.log("Importing S2 schedule...\n");

  // 1. Get S2 season
  const season = await db.query.seasons.findFirst({
    where: eq(schema.seasons.seasonNumber, 2),
  });

  if (!season) {
    throw new Error("S2 not found! Run seed-s2.ts first.");
  }

  console.log(`Found S2 with id: ${season.id}`);

  // 2. Check if division already exists, create if not
  let division = await db.query.divisions.findFirst({
    where: eq(schema.divisions.seasonId, season.id),
  });

  if (!division) {
    console.log("Creating division for S2...");
    const [newDiv] = await db.insert(schema.divisions).values({
      seasonId: season.id,
      name: "Season 2",
      displayOrder: 0,
    }).returning();
    division = newDiv;
    console.log(`Created division with id: ${division.id}`);
  } else {
    console.log(`Found existing division with id: ${division.id}`);
  }

  // 3. Parse the schedule CSV
  const csvPath = path.join(__dirname, "../data/S2/S2 Schedule - Sheet1.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").slice(1); // Skip header

  // Collect all unique team names (normalized)
  const teamNames = new Set<string>();
  const matches: { week: number; team1: string; team2: string }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const [weekStr, team1Raw, team2Raw] = line.split(",").map(s => s.trim());
    const week = parseInt(weekStr);

    // Normalize team names
    const team1 = TEAM_NAME_ALIASES[team1Raw] || team1Raw;
    const team2 = TEAM_NAME_ALIASES[team2Raw] || team2Raw;

    teamNames.add(team1);
    teamNames.add(team2);
    matches.push({ week, team1, team2 });
  }

  console.log(`\nFound ${teamNames.size} unique teams:`);
  for (const name of [...teamNames].sort()) {
    console.log(`  - ${name}`);
  }

  // 4. Create coaches and seasonCoaches for each team
  const seasonCoachMap = new Map<string, number>(); // teamName -> seasonCoachId

  // Check for existing seasonCoaches in this division
  const existingSeasonCoaches = await db.query.seasonCoaches.findMany({
    where: eq(schema.seasonCoaches.divisionId, division.id),
  });

  if (existingSeasonCoaches.length > 0) {
    console.log(`\nFound ${existingSeasonCoaches.length} existing season coaches`);
    for (const sc of existingSeasonCoaches) {
      seasonCoachMap.set(sc.teamName, sc.id);
    }
  }

  // Create missing teams
  for (const teamName of teamNames) {
    if (seasonCoachMap.has(teamName)) {
      continue;
    }

    // Create a new coach with the team name
    // For legacy seasons, coach name = team name (we don't have actual coach names)
    let coach = await db.query.coaches.findFirst({
      where: eq(schema.coaches.name, teamName),
    });

    if (!coach) {
      const [newCoach] = await db.insert(schema.coaches).values({
        name: teamName,
        eloRating: 1000,
      }).returning();
      coach = newCoach;
      console.log(`Created coach: ${teamName} (id: ${coach.id})`);
    }

    // Create seasonCoach
    const [seasonCoach] = await db.insert(schema.seasonCoaches).values({
      coachId: coach.id,
      divisionId: division.id,
      teamName: teamName,
      isActive: true,
    }).returning();

    seasonCoachMap.set(teamName, seasonCoach.id);
    console.log(`Created seasonCoach: ${teamName} (id: ${seasonCoach.id})`);
  }

  // 5. Check for existing matches
  const existingMatches = await db.query.matches.findMany({
    where: eq(schema.matches.seasonId, season.id),
  });

  if (existingMatches.length > 0) {
    console.log(`\n⚠️  Found ${existingMatches.length} existing matches for S2.`);
    console.log("Deleting existing matches to re-import...");
    await db.delete(schema.matches).where(eq(schema.matches.seasonId, season.id));
  }

  // 6. Create matches
  console.log(`\nCreating ${matches.length} matches...`);

  for (const m of matches) {
    const coach1Id = seasonCoachMap.get(m.team1);
    const coach2Id = seasonCoachMap.get(m.team2);

    if (!coach1Id || !coach2Id) {
      console.error(`Missing seasonCoach for match: ${m.team1} vs ${m.team2}`);
      continue;
    }

    await db.insert(schema.matches).values({
      seasonId: season.id,
      divisionId: division.id,
      week: m.week,
      coach1SeasonId: coach1Id,
      coach2SeasonId: coach2Id,
    });
  }

  // 7. Summary
  const matchesByWeek = new Map<number, number>();
  for (const m of matches) {
    matchesByWeek.set(m.week, (matchesByWeek.get(m.week) || 0) + 1);
  }

  console.log("\n✅ Import complete!");
  console.log("\nMatches by week:");
  for (const [week, count] of [...matchesByWeek.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Week ${week}: ${count} matches`);
  }
}

main().catch(console.error);
