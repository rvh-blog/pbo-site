import { db } from "../src/lib/db";
import * as schema from "../src/lib/schema";
import { eq, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// Normalize team names (handle spelling variations and renames)
const TEAM_NAME_ALIASES: Record<string, string> = {
  // Team renames
  "boston bulbasurs": "Wailing Wailords",
  "boston bulbasaurs": "Wailing Wailords",
  "tampa bay- now kk": "Kingston Kleavors",
  "tampa bay now kk": "Kingston Kleavors",

  // Typos
  "mable falls miniors": "Marble Falls Miniors",
  "marble falls minors": "Marble Falls Miniors",
  "pittsburgh scizzors": "Pittsburgh Scizors",
  "pittsbutgh scizors": "Pittsburgh Scizors",
  "las vegas corvinights": "Las Vegas Corviknights",
  "mojave cacturnes": "Mojave Cacturns",
  "la pelippers": "Los Angeles Pelippers",
  "toronto staptors": "Toronto Staraptors",
  "kingston kleavors": "Kingston Kleavors", // normalize spacing
};

function normalizeTeamName(name: string): string {
  const lower = name.toLowerCase().trim();
  return TEAM_NAME_ALIASES[lower] || name.trim();
}

// Parse team name and differential from strings like "Team Name +3" or "Team Name+3"
function parseTeamResult(str: string): { team: string; differential: number; isWinner: boolean } | null {
  const trimmed = str.trim();
  if (!trimmed) return null;

  // Match pattern: "Team Name +/-N" or "Team Name+/-N" (with or without space)
  const match = trimmed.match(/^(.+?)\s*([+-]\d+)$/);
  if (match) {
    const team = normalizeTeamName(match[1]);
    const differential = parseInt(match[2]);
    return { team, differential: Math.abs(differential), isWinner: differential > 0 };
  }

  // No differential found - might be just team name
  return { team: normalizeTeamName(trimmed), differential: 0, isWinner: false };
}

async function main() {
  console.log("Importing S3 Kalos schedule...\n");

  // 1. Get S3 season and Kalos division
  const season = await db.query.seasons.findFirst({
    where: eq(schema.seasons.seasonNumber, 3),
    with: { divisions: true },
  });

  if (!season) {
    throw new Error("S3 not found!");
  }

  const kalosDivision = season.divisions.find(d => d.name === "Kalos");
  if (!kalosDivision) {
    throw new Error("Kalos division not found!");
  }

  console.log(`Found S3 (id: ${season.id}) with Kalos division (id: ${kalosDivision.id})`);

  // 2. Parse the schedule CSV
  const csvPath = path.join(__dirname, "../data/S3/PBO Kalos S3 DOC - SCHEDULE_Match Replays.csv");
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
  let pendingTeam2: { team: string; differential: number; isWinner: boolean } | null = null;
  let pendingWeek: number | null = null;
  let pendingTeam1: { team: string; differential: number; isWinner: boolean } | null = null;
  let pendingIsForfeit = false;

  for (let i = 25; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cols = line.split(",").map(s => s.trim());
    const weekStr = cols[0];
    const team1Str = cols[1];
    const team2Str = cols[2];
    const linkOrNote = cols[3] || "";

    // Handle continuation line (e.g., "Ottawa Donphans +3" on its own line)
    if (pendingTeam1 && !weekStr.match(/^\d+$|Week|Wildcard|Semi|Final/i) && team1Str) {
      // This might be team2 on a separate line
      const team2Result = parseTeamResult(weekStr + (team1Str ? " " + team1Str : ""));
      if (team2Result && team2Result.team) {
        teamNames.add(pendingTeam1.team);
        teamNames.add(team2Result.team);

        let winnerId: "team1" | "team2" | null = null;
        if (pendingTeam1.isWinner) winnerId = "team1";
        else if (team2Result.isWinner) winnerId = "team2";

        matches.push({
          week: pendingWeek!,
          team1: pendingTeam1.team,
          team2: team2Result.team,
          winnerId,
          team1Diff: pendingTeam1.isWinner ? pendingTeam1.differential : -team2Result.differential,
          team2Diff: team2Result.isWinner ? team2Result.differential : -pendingTeam1.differential,
          isForfeit: pendingIsForfeit,
          isPlayoff: pendingWeek! > 100,
        });

        pendingTeam1 = null;
        pendingWeek = null;
        pendingIsForfeit = false;
        continue;
      }
    }

    // Parse week number
    let week: number;
    let isPlayoff = false;

    if (weekStr.match(/^\d+$/)) {
      week = parseInt(weekStr);
    } else if (weekStr.toLowerCase().includes("wildcard")) {
      week = 101;
      isPlayoff = true;
    } else if (weekStr.toLowerCase().includes("semi")) {
      week = 102;
      isPlayoff = true;
    } else if (weekStr.toLowerCase() === "finals") {
      week = 103;
      isPlayoff = true;
    } else {
      continue;
    }

    const team1Result = parseTeamResult(team1Str);
    const team2Result = parseTeamResult(team2Str);

    if (!team1Result) continue;

    // Check if team2 is missing (might be on next line)
    if (!team2Result || !team2Result.team) {
      pendingTeam1 = team1Result;
      pendingWeek = week;
      pendingIsForfeit = linkOrNote.toLowerCase().includes("ff");
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
  const seasonCoachMap = new Map<string, number>();

  const existingSeasonCoaches = await db.query.seasonCoaches.findMany({
    where: eq(schema.seasonCoaches.divisionId, kalosDivision.id),
  });

  if (existingSeasonCoaches.length > 0) {
    console.log(`\nFound ${existingSeasonCoaches.length} existing season coaches`);
    for (const sc of existingSeasonCoaches) {
      seasonCoachMap.set(sc.teamName, sc.id);
    }
  }

  // Create missing teams
  for (const teamName of teamNames) {
    if (seasonCoachMap.has(teamName)) continue;

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

    const [seasonCoach] = await db.insert(schema.seasonCoaches).values({
      coachId: coach.id,
      divisionId: kalosDivision.id,
      teamName: teamName,
      isActive: true,
    }).returning();

    seasonCoachMap.set(teamName, seasonCoach.id);
    console.log(`Created seasonCoach: ${teamName} (id: ${seasonCoach.id})`);
  }

  // 4. Delete existing matches for this division
  const existingMatches = await db.query.matches.findMany({
    where: and(
      eq(schema.matches.seasonId, season.id),
      eq(schema.matches.divisionId, kalosDivision.id)
    ),
  });

  if (existingMatches.length > 0) {
    console.log(`\n⚠️  Found ${existingMatches.length} existing matches for S3 Kalos.`);
    console.log("Deleting existing matches...");
    await db.delete(schema.matches).where(
      and(
        eq(schema.matches.seasonId, season.id),
        eq(schema.matches.divisionId, kalosDivision.id)
      )
    );
  }

  // Also delete existing playoff_matches for this division
  await db.delete(schema.playoffMatches).where(
    and(
      eq(schema.playoffMatches.seasonId, season.id),
      eq(schema.playoffMatches.divisionId, kalosDivision.id)
    )
  );

  // 5. Create matches
  console.log(`\nCreating ${matches.length} matches...`);

  const playoffMatchIds: { week: number; matchId: number; coach1Id: number; coach2Id: number; winnerId: number | null }[] = [];

  for (const m of matches) {
    const coach1Id = seasonCoachMap.get(m.team1);
    const coach2Id = seasonCoachMap.get(m.team2);

    if (!coach1Id || !coach2Id) {
      console.error(`Missing seasonCoach for match: ${m.team1} vs ${m.team2}`);
      continue;
    }

    const winnerId = m.winnerId === "team1" ? coach1Id : m.winnerId === "team2" ? coach2Id : null;

    const [inserted] = await db.insert(schema.matches).values({
      seasonId: season.id,
      divisionId: kalosDivision.id,
      week: m.week,
      coach1SeasonId: coach1Id,
      coach2SeasonId: coach2Id,
      winnerId,
      coach1Differential: m.team1Diff,
      coach2Differential: m.team2Diff,
      isForfeit: m.isForfeit,
    }).returning();

    if (m.isPlayoff) {
      playoffMatchIds.push({ week: m.week, matchId: inserted.id, coach1Id, coach2Id, winnerId });
    }
  }

  // 6. Create playoff_matches entries
  if (playoffMatchIds.length > 0) {
    console.log(`\nCreating ${playoffMatchIds.length} playoff bracket entries...`);

    // Sort by week to get the right order
    playoffMatchIds.sort((a, b) => a.week - b.week);

    let bracketPos1 = 1, bracketPos2 = 1, bracketPos3 = 1;

    for (const pm of playoffMatchIds) {
      let round: number;
      let bracketPosition: number;

      if (pm.week === 101) {
        round = 1;
        bracketPosition = bracketPos1++;
      } else if (pm.week === 102) {
        round = 2;
        bracketPosition = bracketPos2++;
      } else {
        round = 3;
        bracketPosition = bracketPos3++;
      }

      await db.insert(schema.playoffMatches).values({
        seasonId: season.id,
        divisionId: kalosDivision.id,
        round,
        bracketPosition,
        higherSeedId: pm.coach1Id,
        lowerSeedId: pm.coach2Id,
        winnerId: pm.winnerId,
        matchId: pm.matchId,
      });
    }
  }

  // 7. Summary
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
