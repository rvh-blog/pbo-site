import * as fs from "fs";
import Database from "better-sqlite3";

const db = new Database("./pbo.db");
const csvPath = "./data/PBO Elo History - ELO Master Sheet.csv";
const content = fs.readFileSync(csvPath, "utf-8");
const lines = content.split("\n");

// CSV section mappings (header line, data start line, data end line)
const sections: { season: number; division: string; dataStart: number; dataEnd: number }[] = [
  { season: 4, division: "Unova", dataStart: 24, dataEnd: 38 },
  { season: 4, division: "Kalos", dataStart: 65, dataEnd: 78 },
  { season: 5, division: "Unova", dataStart: 105, dataEnd: 118 },
  { season: 5, division: "Kalos", dataStart: 145, dataEnd: 158 },
  { season: 6, division: "Stargazer", dataStart: 185, dataEnd: 199 },
  { season: 6, division: "Sunset", dataStart: 226, dataEnd: 241 },
  { season: 6, division: "Neon", dataStart: 271, dataEnd: 285 },
  { season: 7, division: "Stargazer", dataStart: 312, dataEnd: 327 },
  { season: 7, division: "Sunset", dataStart: 356, dataEnd: 371 },
  { season: 7, division: "Neon", dataStart: 399, dataEnd: 414 },
  { season: 8, division: "Stargazer", dataStart: 443, dataEnd: 458 },
  { season: 8, division: "Sunset", dataStart: 487, dataEnd: 502 },
  { season: 8, division: "Neon", dataStart: 530, dataEnd: 545 },
  { season: 9, division: "Stargazer", dataStart: 573, dataEnd: 588 },
  { season: 9, division: "Sunset", dataStart: 617, dataEnd: 634 },
  { season: 9, division: "Crystal", dataStart: 664, dataEnd: 681 },
  { season: 9, division: "Neon", dataStart: 711, dataEnd: 728 },
];

interface CSVMatch {
  team: string;
  opponent: string;
  week: number;
  result: string; // W, L, FFW, FFL
}

function normalizeTeamName(name: string): string {
  return name
    .replace(/\s*\([^)]+\)/g, "") // Remove (Kalib) etc
    .replace(/München/g, "Munchen")
    .replace(/Unknowns/g, "Unowns")
    .replace(/Teddirursas/g, "Teddiursas")
    .replace(/Swadlooons/g, "Swadloons")
    .replace(/Sincity/g, "Sin City")
    .toLowerCase()
    .trim();
}

function parseCSVSection(dataStart: number, dataEnd: number): CSVMatch[] {
  const matches: CSVMatch[] = [];

  for (let i = dataStart - 1; i < dataEnd; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(",");
    const team = cols[0]?.trim();
    if (!team || !cols[1]?.match(/^\d+(\.\d+)?$/)) continue;

    // Parse W1-W8 (columns: 2=W1Opp, 5=W1Result, then +7 for each week)
    for (let w = 0; w < 8; w++) {
      const oppIndex = 2 + (w * 7);
      const resultIndex = 5 + (w * 7);
      const opponent = cols[oppIndex]?.trim();
      const result = cols[resultIndex]?.trim();

      if (opponent && result && !opponent.includes("#N/A") && result !== "#N/A") {
        matches.push({
          team,
          opponent,
          week: w + 1,
          result
        });
      }
    }
  }
  return matches;
}

// Get database matches
function getDBMatches(seasonNum: number, divisionName: string) {
  const query = `
    SELECT
      m.week,
      sc1.team_name as team1,
      sc2.team_name as team2,
      CASE
        WHEN m.winner_id = m.coach1_season_id THEN sc1.team_name
        WHEN m.winner_id = m.coach2_season_id THEN sc2.team_name
        ELSE NULL
      END as winner
    FROM matches m
    JOIN divisions d ON m.division_id = d.id
    JOIN seasons s ON d.season_id = s.id
    JOIN season_coaches sc1 ON m.coach1_season_id = sc1.id
    JOIN season_coaches sc2 ON m.coach2_season_id = sc2.id
    WHERE s.season_number = ? AND d.name = ? AND m.week <= 8
    ORDER BY m.week, m.id
  `;

  return db.prepare(query).all(seasonNum, divisionName) as {
    week: number;
    team1: string;
    team2: string;
    winner: string | null;
  }[];
}

console.log("=" .repeat(80));
console.log("DATABASE VS CSV COMPARISON");
console.log("=".repeat(80));

let totalDiscrepancies = 0;

for (const section of sections) {
  console.log(`\n### S${section.season} ${section.division} ###\n`);

  const csvMatches = parseCSVSection(section.dataStart, section.dataEnd);
  const dbMatches = getDBMatches(section.season, section.division);

  if (dbMatches.length === 0) {
    console.log("  ⚠️  No database matches found");
    continue;
  }

  // Build CSV lookup: normalized team -> week -> {opponent, result}
  const csvLookup = new Map<string, Map<number, { opponent: string; result: string }>>();
  for (const m of csvMatches) {
    const teamKey = normalizeTeamName(m.team);
    if (!csvLookup.has(teamKey)) {
      csvLookup.set(teamKey, new Map());
    }
    csvLookup.get(teamKey)!.set(m.week, { opponent: m.opponent, result: m.result });
  }

  const discrepancies: string[] = [];

  for (const dbMatch of dbMatches) {
    const team1Key = normalizeTeamName(dbMatch.team1);
    const team2Key = normalizeTeamName(dbMatch.team2);

    // Check from team1's perspective
    const team1Csv = csvLookup.get(team1Key)?.get(dbMatch.week);

    if (team1Csv) {
      const csvOppKey = normalizeTeamName(team1Csv.opponent);

      // Check opponent match
      if (csvOppKey !== team2Key) {
        discrepancies.push(
          `W${dbMatch.week} OPPONENT: ${dbMatch.team1} - DB says vs "${dbMatch.team2}", CSV says vs "${team1Csv.opponent}"`
        );
      }

      // Check winner
      if (dbMatch.winner) {
        const dbTeam1Won = normalizeTeamName(dbMatch.winner) === team1Key;
        const csvTeam1Won = team1Csv.result === "W" || team1Csv.result === "FFW";

        if (dbTeam1Won !== csvTeam1Won) {
          discrepancies.push(
            `W${dbMatch.week} WINNER: ${dbMatch.team1} vs ${dbMatch.team2} - DB: ${dbMatch.winner} won, CSV: ${dbMatch.team1} ${team1Csv.result}`
          );
        }
      }
    } else {
      // Team not found in CSV - might be a replacement team issue
      // Check if it's one of the known replacement situations
      const knownReplacements = [
        "harbour rockruffs", "santa cruz swadloons", "manila manectrics", "sunnyside screamtails"
      ];
      if (!knownReplacements.includes(team1Key)) {
        discrepancies.push(
          `W${dbMatch.week} MISSING: ${dbMatch.team1} not found in CSV for this week`
        );
      }
    }
  }

  // Also check for CSV matches not in DB
  const dbMatchSet = new Set<string>();
  for (const m of dbMatches) {
    const key1 = `${m.week}:${normalizeTeamName(m.team1)}:${normalizeTeamName(m.team2)}`;
    const key2 = `${m.week}:${normalizeTeamName(m.team2)}:${normalizeTeamName(m.team1)}`;
    dbMatchSet.add(key1);
    dbMatchSet.add(key2);
  }

  for (const csvMatch of csvMatches) {
    const key = `${csvMatch.week}:${normalizeTeamName(csvMatch.team)}:${normalizeTeamName(csvMatch.opponent)}`;
    if (!dbMatchSet.has(key)) {
      // Check if it's a known replacement team
      const knownReplacements = [
        "harbour rockruffs", "santa cruz swadloons"
      ];
      const teamKey = normalizeTeamName(csvMatch.team);
      if (!knownReplacements.includes(teamKey)) {
        // Only report if not already covered by another discrepancy
        const reverseKey = `${csvMatch.week}:${normalizeTeamName(csvMatch.opponent)}:${normalizeTeamName(csvMatch.team)}`;
        if (!dbMatchSet.has(reverseKey)) {
          discrepancies.push(
            `W${csvMatch.week} CSV ONLY: ${csvMatch.team} vs ${csvMatch.opponent} (${csvMatch.result}) not in DB`
          );
        }
      }
    }
  }

  // Deduplicate discrepancies
  const uniqueDiscrepancies = [...new Set(discrepancies)];

  if (uniqueDiscrepancies.length === 0) {
    console.log("  ✓ No discrepancies found");
  } else {
    console.log(`  Found ${uniqueDiscrepancies.length} discrepancies:\n`);
    for (const d of uniqueDiscrepancies.slice(0, 20)) {
      console.log(`    - ${d}`);
    }
    if (uniqueDiscrepancies.length > 20) {
      console.log(`    ... and ${uniqueDiscrepancies.length - 20} more`);
    }
    totalDiscrepancies += uniqueDiscrepancies.length;
  }
}

console.log("\n" + "=".repeat(80));
console.log(`TOTAL DISCREPANCIES: ${totalDiscrepancies}`);
console.log("=".repeat(80));

db.close();
