import * as fs from "fs";
import Database from "better-sqlite3";

const db = new Database("./pbo.db");

// Parse the ELO history CSV and extract fixtures
function parseEloHistoryCSV(csvPath: string) {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n");

  const sections: Array<{
    seasonDivision: string;
    fixtures: Array<{
      team: string;
      week: string;
      opponent: string;
      result: string;
    }>;
  }> = [];

  let currentSection: typeof sections[0] | null = null;
  let inDataRows = false;
  let headerLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(",");

    // Detect section headers like "Stargazer S6 Placement Elo" or "Unova S4 Elo"
    if (cols[1]?.match(/S\d+.*Elo|Placement Elo/i) && !cols[2]?.includes("Opponent")) {
      // Look back to find the division name
      const divMatch = cols[1].match(/(Stargazer|Sunset|Neon|Crystal|Unova|Kalos)\s*S(\d+)/i);
      if (divMatch) {
        if (currentSection && currentSection.fixtures.length > 0) {
          sections.push(currentSection);
        }
        currentSection = {
          seasonDivision: `S${divMatch[2]} ${divMatch[1]}`,
          fixtures: [],
        };
        inDataRows = false;
      }
    }

    // Detect header row with "Placement Elo" or "Starting / Placement Elo" and "W1 Opponent"
    if (cols[1]?.includes("Placement Elo") && cols[2]?.includes("W1 Opponent")) {
      headerLineIndex = i;
      inDataRows = true;
      continue;
    }

    // Parse data rows (team name in col 0, placement elo in col 1, then week data)
    if (inDataRows && cols[0]?.trim() && cols[1]?.match(/^\d+(\.\d+)?$/)) {
      const team = cols[0].trim();

      // Week columns: W1 Opponent at index 2, W1 Result at index 5
      // Pattern: Opponent, OpponentElo, WinProb, Result, LossEffect, EloChange, EndElo (7 cols per week)
      const weeks = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "QF", "SF", "Finals"];

      for (let w = 0; w < weeks.length; w++) {
        const baseIndex = 2 + (w * 7);
        const opponent = cols[baseIndex]?.trim();
        const result = cols[baseIndex + 3]?.trim(); // Result column

        if (opponent && result && result !== "#N/A" && opponent !== "#N/A") {
          currentSection?.fixtures.push({
            team,
            week: weeks[w],
            opponent,
            result,
          });
        }
      }
    }

    // End of data section (empty team name after data)
    if (inDataRows && !cols[0]?.trim() && !cols[1]?.match(/^\d+(\.\d+)?$/)) {
      inDataRows = false;
    }
  }

  if (currentSection && currentSection.fixtures.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

// Get database fixtures
function getDBFixtures() {
  const query = `
    SELECT
      m.week,
      s.season_number,
      d.name as division_name,
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
    WHERE m.week <= 100
    ORDER BY s.season_number, d.name, m.week, m.id
  `;

  return db.prepare(query).all() as Array<{
    week: number;
    season_number: number;
    division_name: string;
    team1: string;
    team2: string;
    winner: string | null;
  }>;
}

// Normalize team names for comparison
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/['']/g, "'")
    .replace(/chestnaughts/i, "chesnaughts")
    .replace(/worsester/i, "worcester")
    .replace(/sincity/i, "sin city")
    .replace(/teddirursas/i, "teddiursas")
    .replace(/swadlooons/i, "swadloons")
    .replace(/pinsirs/i, "pinsirs")
    .replace(/\s*\([^)]+\)/g, "") // Remove parenthetical notes like "(LilHill)"
    .trim();
}

// Main comparison
async function main() {
  console.log("Parsing ELO History CSV...\n");
  const csvPath = "./data/PBO Elo History - ELO Master Sheet.csv";
  const sections = parseEloHistoryCSV(csvPath);

  console.log("Found sections:");
  for (const section of sections) {
    console.log(`  ${section.seasonDivision}: ${section.fixtures.length} fixtures`);
  }

  console.log("\nGetting database fixtures...\n");
  const dbFixtures = getDBFixtures();

  // Group DB fixtures by season/division
  const dbBySeasonDiv = new Map<string, typeof dbFixtures>();
  for (const f of dbFixtures) {
    const key = `S${f.season_number} ${f.division_name}`;
    if (!dbBySeasonDiv.has(key)) {
      dbBySeasonDiv.set(key, []);
    }
    dbBySeasonDiv.get(key)!.push(f);
  }

  console.log("Database seasons/divisions:");
  for (const [key, fixtures] of dbBySeasonDiv) {
    console.log(`  ${key}: ${fixtures.length} matches`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("COMPARISON RESULTS");
  console.log("=".repeat(80) + "\n");

  // Compare each section
  for (const section of sections) {
    console.log(`\n### ${section.seasonDivision} ###\n`);

    const dbMatches = dbBySeasonDiv.get(section.seasonDivision) || [];

    if (dbMatches.length === 0) {
      console.log("  WARNING: No database matches found for this season/division\n");
      continue;
    }

    // Build a lookup of CSV fixtures: team -> week -> {opponent, result}
    const csvLookup = new Map<string, Map<string, { opponent: string; result: string }>>();
    for (const f of section.fixtures) {
      const teamKey = normalizeTeamName(f.team);
      if (!csvLookup.has(teamKey)) {
        csvLookup.set(teamKey, new Map());
      }
      csvLookup.get(teamKey)!.set(f.week, { opponent: f.opponent, result: f.result });
    }

    // Compare DB matches against CSV
    const discrepancies: string[] = [];

    for (const dbMatch of dbMatches) {
      const weekStr = dbMatch.week <= 8 ? `W${dbMatch.week}` :
                      dbMatch.week === 101 ? "QF" :
                      dbMatch.week === 102 ? "SF" :
                      dbMatch.week === 103 ? "Finals" : `W${dbMatch.week}`;

      const team1Key = normalizeTeamName(dbMatch.team1);
      const team2Key = normalizeTeamName(dbMatch.team2);

      // Check team1's perspective
      const team1Csv = csvLookup.get(team1Key)?.get(weekStr);
      if (team1Csv) {
        const csvOpponent = normalizeTeamName(team1Csv.opponent);
        if (csvOpponent !== team2Key) {
          discrepancies.push(
            `${weekStr}: ${dbMatch.team1} - DB says vs "${dbMatch.team2}", CSV says vs "${team1Csv.opponent}"`
          );
        }

        // Check winner
        if (dbMatch.winner) {
          const dbTeam1Won = normalizeTeamName(dbMatch.winner) === team1Key;
          const csvTeam1Won = team1Csv.result === "W" || team1Csv.result === "FFW";
          if (dbTeam1Won !== csvTeam1Won) {
            discrepancies.push(
              `${weekStr}: ${dbMatch.team1} vs ${dbMatch.team2} - DB winner: ${dbMatch.winner}, CSV result for ${dbMatch.team1}: ${team1Csv.result}`
            );
          }
        }
      }
    }

    if (discrepancies.length === 0) {
      console.log("  ✓ No discrepancies found\n");
    } else {
      console.log(`  Found ${discrepancies.length} discrepancies:\n`);
      for (const d of discrepancies) {
        console.log(`    - ${d}`);
      }
      console.log();
    }
  }

  db.close();
}

main().catch(console.error);
