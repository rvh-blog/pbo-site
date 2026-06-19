import * as fs from "fs";
import Database from "better-sqlite3";

const db = new Database("./pbo.db");
const csvPath = "./data/PBO Elo History - ELO Master Sheet.csv";
const content = fs.readFileSync(csvPath, "utf-8");
const lines = content.split("\n");

// CSV section mappings
const sections = [
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

interface TeamElo {
  team: string;
  season: number;
  division: string;
  startElo: number;
  endElo: number;
}

function parseSection(dataStart: number, dataEnd: number, season: number, division: string): TeamElo[] {
  const teams: TeamElo[] = [];

  for (let i = dataStart - 1; i < dataEnd; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(",");
    const team = cols[0]?.trim();
    const startElo = parseFloat(cols[1]);

    if (!team || isNaN(startElo)) continue;

    // Find the last valid ELO (end of season)
    // ELO columns are at indices: 8 (W1 end), 15 (W2 end), 22 (W3 end), etc.
    let endElo = startElo;
    for (let w = 10; w >= 0; w--) {
      const eloIndex = 8 + (w * 7);
      const elo = parseFloat(cols[eloIndex]);
      if (!isNaN(elo) && elo > 0) {
        endElo = elo;
        break;
      }
    }

    teams.push({ team, season, division, startElo, endElo });
  }

  return teams;
}

// Parse all sections
const allTeams: TeamElo[] = [];
for (const section of sections) {
  const teams = parseSection(section.dataStart, section.dataEnd, section.season, section.division);
  allTeams.push(...teams);
}

// Group by season
const bySeason = new Map<number, TeamElo[]>();
for (const team of allTeams) {
  if (!bySeason.has(team.season)) {
    bySeason.set(team.season, []);
  }
  bySeason.get(team.season)!.push(team);
}

// Find ELO continuity matches between consecutive seasons
console.log("=".repeat(80));
console.log("ELO CONTINUITY ANALYSIS - Finding coaches across seasons");
console.log("=".repeat(80));

interface Match {
  team1: string;
  season1: number;
  div1: string;
  endElo: number;
  team2: string;
  season2: number;
  div2: string;
  startElo: number;
}

const matches: Match[] = [];

for (let s = 4; s <= 8; s++) {
  const currentSeason = bySeason.get(s) || [];
  const nextSeason = bySeason.get(s + 1) || [];

  for (const current of currentSeason) {
    for (const next of nextSeason) {
      // Check if end ELO matches start ELO (within small tolerance for rounding)
      const diff = Math.abs(current.endElo - next.startElo);
      if (diff < 0.5) {
        matches.push({
          team1: current.team,
          season1: current.season,
          div1: current.division,
          endElo: current.endElo,
          team2: next.team,
          season2: next.season,
          div2: next.division,
          startElo: next.startElo,
        });
      }
    }
  }
}

console.log(`\nFound ${matches.length} ELO continuity matches:\n`);

// Get database coach info
const dbCoaches = db.prepare(`
  SELECT sc.id, sc.team_name, sc.coach_id, c.name as coach_name, s.season_number, d.name as division
  FROM season_coaches sc
  JOIN coaches c ON sc.coach_id = c.id
  JOIN divisions d ON sc.division_id = d.id
  JOIN seasons s ON d.season_id = s.id
  ORDER BY s.season_number, d.name
`).all() as { id: number; team_name: string; coach_id: number; coach_name: string; season_number: number; division: string }[];

function normalizeTeam(name: string): string {
  return name
    .replace(/\s*\([^)]+\)/g, "")
    .replace(/München/g, "Munchen")
    .toLowerCase()
    .trim();
}

function findDbCoach(teamName: string, season: number): typeof dbCoaches[0] | undefined {
  const normalized = normalizeTeam(teamName);
  return dbCoaches.find(c =>
    c.season_number === season &&
    normalizeTeam(c.team_name).includes(normalized.substring(0, 10))
  );
}

// Check which matches have different coach_ids in DB
const missingMerges: { match: Match; coach1: typeof dbCoaches[0]; coach2: typeof dbCoaches[0] }[] = [];

for (const match of matches) {
  const coach1 = findDbCoach(match.team1, match.season1);
  const coach2 = findDbCoach(match.team2, match.season2);

  if (coach1 && coach2 && coach1.coach_id !== coach2.coach_id) {
    missingMerges.push({ match, coach1, coach2 });
  }
}

console.log("\n" + "=".repeat(80));
console.log("POTENTIAL MISSING MERGES (different coach_id but same ELO continuity)");
console.log("=".repeat(80) + "\n");

if (missingMerges.length === 0) {
  console.log("No missing merges found - all ELO continuities have matching coach IDs!\n");
} else {
  for (const { match, coach1, coach2 } of missingMerges) {
    console.log(`S${match.season1} ${match.team1} (${coach1.coach_name}, id=${coach1.coach_id})`);
    console.log(`  -> S${match.season2} ${match.team2} (${coach2.coach_name}, id=${coach2.coach_id})`);
    console.log(`  ELO: ${match.endElo.toFixed(2)} -> ${match.startElo.toFixed(2)}`);
    console.log();
  }
}

db.close();
