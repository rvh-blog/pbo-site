import { db } from "../src/lib/db";
import * as schema from "../src/lib/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// Normalize team names (handle spelling variations)
const TEAM_NAME_ALIASES: Record<string, string> = {
  "carribbean crawdaunts": "Caribbean Crawdaunts",
  "caribbean crawdaunts": "Caribbean Crawdaunts",
  "carribean crawdaunts": "Caribbean Crawdaunts",
  "new york malamars": "New York Malamars",
  "new york malamar": "New York Malamars",
  "alabama alakazams": "Alabama Alakazams",
  "alabama alakazam": "Alabama Alakazams",
};

function normalizeTeamName(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_NAME_ALIASES[lower] || name.trim();
}

// Parse team name and differential from strings like "Carribbean Crawdaunts +3"
function parseTeamResult(str: string): { team: string; differential: number; isWinner: boolean } | null {
  const trimmed = str.trim();
  if (!trimmed) return null;

  // Match pattern: "Team Name +/-N" or "Team Name" (no differential)
  const match = trimmed.match(/^(.+?)\s*([+-]\d+)$/);
  if (match) {
    const team = normalizeTeamName(match[1]);
    const differential = parseInt(match[2]);
    return { team, differential: Math.abs(differential), isWinner: differential > 0 };
  }

  // No differential found
  return { team: normalizeTeamName(trimmed), differential: 0, isWinner: false };
}

async function main() {
  console.log("Importing S3 Unova schedule...\n");

  // 1. Get S3 season and Unova division
  const season = await db.query.seasons.findFirst({
    where: eq(schema.seasons.seasonNumber, 3),
    with: { divisions: true },
  });

  if (!season) {
    throw new Error("S3 not found! Run seed-s3.ts first.");
  }

  const unovaDivision = season.divisions.find(d => d.name === "Unova");
  if (!unovaDivision) {
    throw new Error("Unova division not found!");
  }

  console.log(`Found S3 (id: ${season.id}) with Unova division (id: ${unovaDivision.id})`);

  // 2. Parse the schedule CSV
  const csvPath = path.join(__dirname, "../data/S3/PBO Unova S3 Doc - OFFICIAL SCHEDULE_Replay Links.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n");

  // Collect all unique team names and matches
  const teamNames = new Set<string>();
  const matches: {
    week: number;
    team1: string;
    team2: string;
    winnerId: "team1" | "team2" | null;
    team1Diff: number;
    team2Diff: number;
    isForfeit: boolean;
    isPlayoff: boolean;
  }[] = [];

  // Process lines starting from row 26 (index 25)
  for (let i = 26; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = line.split(",").map(s => s.trim());
    const weekStr = cols[0];
    const team1Str = cols[1];
    const team2Str = cols[2];
    const linkOrNote = cols[3] || "";

    if (!weekStr || !team1Str || !team2Str) continue;

    // Parse week number
    let week: number;
    let isPlayoff = false;

    if (weekStr.match(/^\d+$/)) {
      week = parseInt(weekStr);
    } else if (weekStr.includes("Wildcard")) {
      week = 101; // Playoffs start at week 101
      isPlayoff = true;
    } else if (weekStr.includes("Semi-Final")) {
      week = 102;
      isPlayoff = true;
    } else if (weekStr === "Finals") {
      week = 103;
      isPlayoff = true;
    } else {
      console.log(`Skipping unknown week format: ${weekStr}`);
      continue;
    }

    const team1Result = parseTeamResult(team1Str);
    const team2Result = parseTeamResult(team2Str);

    if (!team1Result || !team2Result) {
      console.log(`Skipping line with invalid team format: ${line}`);
      continue;
    }

    teamNames.add(team1Result.team);
    teamNames.add(team2Result.team);

    // Check if forfeit
    const isForfeit = linkOrNote.toLowerCase().includes("ff");

    // Determine winner based on differential
    let winnerId: "team1" | "team2" | null = null;
    if (team1Result.isWinner) winnerId = "team1";
    else if (team2Result.isWinner) winnerId = "team2";

    matches.push({
      week,
      team1: team1Result.team,
      team2: team2Result.team,
      winnerId,
      team1Diff: team1Result.isWinner ? team1Result.differential : -team2Result.differential,
      team2Diff: team2Result.isWinner ? team2Result.differential : -team1Result.differential,
      isForfeit,
      isPlayoff,
    });
  }

  console.log(`\nFound ${teamNames.size} unique teams:`);
  for (const name of [...teamNames].sort()) {
    console.log(`  - ${name}`);
  }
  console.log(`\nFound ${matches.length} matches`);

  // 3. Create coaches and seasonCoaches for each team
  const seasonCoachMap = new Map<string, number>(); // teamName -> seasonCoachId

  // Check for existing seasonCoaches in this division
  const existingSeasonCoaches = await db.query.seasonCoaches.findMany({
    where: eq(schema.seasonCoaches.divisionId, unovaDivision.id),
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
      divisionId: unovaDivision.id,
      teamName: teamName,
      isActive: true,
    }).returning();

    seasonCoachMap.set(teamName, seasonCoach.id);
    console.log(`Created seasonCoach: ${teamName} (id: ${seasonCoach.id})`);
  }

  // 4. Check for existing matches and delete them
  const existingMatches = await db.query.matches.findMany({
    where: and(
      eq(schema.matches.seasonId, season.id),
      eq(schema.matches.divisionId, unovaDivision.id)
    ),
  });

  if (existingMatches.length > 0) {
    console.log(`\n⚠️  Found ${existingMatches.length} existing matches for S3 Unova.`);
    console.log("Deleting existing matches to re-import...");
    await db.delete(schema.matches).where(
      and(
        eq(schema.matches.seasonId, season.id),
        eq(schema.matches.divisionId, unovaDivision.id)
      )
    );
  }

  // 5. Create matches
  console.log(`\nCreating ${matches.length} matches...`);

  for (const m of matches) {
    const coach1Id = seasonCoachMap.get(m.team1);
    const coach2Id = seasonCoachMap.get(m.team2);

    if (!coach1Id || !coach2Id) {
      console.error(`Missing seasonCoach for match: ${m.team1} vs ${m.team2}`);
      continue;
    }

    const winnerId = m.winnerId === "team1" ? coach1Id : m.winnerId === "team2" ? coach2Id : null;

    await db.insert(schema.matches).values({
      seasonId: season.id,
      divisionId: unovaDivision.id,
      week: m.week,
      coach1SeasonId: coach1Id,
      coach2SeasonId: coach2Id,
      winnerId,
      coach1Differential: m.team1Diff,
      coach2Differential: m.team2Diff,
      isForfeit: m.isForfeit,
    });
  }

  // 6. Summary
  const regularMatches = matches.filter(m => !m.isPlayoff);
  const playoffMatches = matches.filter(m => m.isPlayoff);

  const matchesByWeek = new Map<number, number>();
  for (const m of regularMatches) {
    matchesByWeek.set(m.week, (matchesByWeek.get(m.week) || 0) + 1);
  }

  console.log("\n✅ Import complete!");
  console.log("\nRegular season matches by week:");
  for (const [week, count] of [...matchesByWeek.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Week ${week}: ${count} matches`);
  }
  console.log(`\nPlayoff matches: ${playoffMatches.length}`);
}

main().catch(console.error);
