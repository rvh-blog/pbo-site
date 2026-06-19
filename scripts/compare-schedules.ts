import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../src/lib/schema";
import * as fs from "fs";
import * as path from "path";

const client = createClient({ url: "file:pbo.db" });
const db = drizzle(client, { schema });

// Master sheet structure: each row has 7 columns per week
// Col 1: Team, Col 2: Starting ELO, then per week: Opponent, OppELO, WinProb, Result, Score, Change, EndELO

interface MasterMatch {
  team: string;
  week: number;
  opponent: string;
  result: string; // W, L, FFW, FFL
}

interface DbMatch {
  team1: string;
  team2: string;
  week: number;
  winner: string | null;
  isForfeit: boolean;
}

function parseMasterSheet(): Map<string, MasterMatch[]> {
  const csvPath = path.join(__dirname, "../data/PBO Elo History - ELO Master Sheet.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n");

  const matchesByDivision = new Map<string, MasterMatch[]>();

  // Track which section we're in based on placement ELO
  const placementToDivision: Record<string, string> = {
    "2150.00": "S5 Unova", // S4 Unova teams continue to S5
    "2100.00": "S5 Unova",
    "1800.00": "S5 Kalos", // Could also be S4 Kalos
    "1700.00": "S5 Kalos",
    "1950.00": "S6 Stargazer",
    "1850.00": "S6 Sunset", // or S7 Sunset
    "1650.00": "S6 Neon",
    "2050.00": "S7 Stargazer", // or S8/S9
    "2000.00": "S7 Sunset",
    "1500.00": "S7 Neon", // or S8/S9 Neon
    "1750.00": "S9 Crystal",
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    const cols = line.split(",");
    const teamName = cols[0]?.trim();
    const placementElo = cols[1]?.trim();

    // Skip non-team rows
    if (!teamName || !placementElo || !teamName.match(/^[A-Z]/)) continue;
    if (placementElo.includes("#N/A") || !placementElo.match(/^\d/)) continue;

    // Extract matches for weeks 1-10
    for (let week = 1; week <= 10; week++) {
      const baseCol = 2 + (week - 1) * 7;
      const opponent = cols[baseCol]?.trim();
      const result = cols[baseCol + 3]?.trim();

      if (!opponent || opponent === "#N/A" || !result) continue;

      // Determine division based on context (this is approximate)
      // We'll refine by matching with DB later
    }
  }

  return matchesByDivision;
}

async function getDbMatches(): Promise<Map<string, DbMatch[]>> {
  const matches = await db.query.matches.findMany({
    with: {
      coach1: true,
      coach2: true,
      division: { with: { season: true } },
    },
  });

  const matchesByDivision = new Map<string, DbMatch[]>();

  for (const m of matches) {
    const seasonNum = m.division?.season?.seasonNumber ?? 0;
    const divName = m.division?.name ?? "";
    const key = `S${seasonNum} ${divName}`;

    if (!matchesByDivision.has(key)) {
      matchesByDivision.set(key, []);
    }

    let winner: string | null = null;
    if (m.winnerId === m.coach1SeasonId) {
      winner = m.coach1?.teamName ?? null;
    } else if (m.winnerId === m.coach2SeasonId) {
      winner = m.coach2?.teamName ?? null;
    }

    matchesByDivision.get(key)!.push({
      team1: m.coach1?.teamName ?? "",
      team2: m.coach2?.teamName ?? "",
      week: m.week,
      winner,
      isForfeit: m.isForfeit === true,
    });
  }

  return matchesByDivision;
}

async function main() {
  console.log("Fetching database matches...\n");
  const dbMatches = await getDbMatches();

  // Print summary
  for (const [div, matches] of dbMatches) {
    console.log(`${div}: ${matches.length} matches`);
  }

  process.exit(0);
}

main().catch(console.error);
