import * as fs from "fs";
import Database from "better-sqlite3";

const db = new Database("./pbo.db");

const csvPath = "./data/PBO Elo History - ELO Master Sheet.csv";
const content = fs.readFileSync(csvPath, "utf-8");
const lines = content.split("\n");

interface ForfeitMatch {
  team: string;
  opponent: string;
  week: string;
  result: string;
}

function parseForfeits(startLine: number, endLine: number): ForfeitMatch[] {
  const forfeits: ForfeitMatch[] = [];
  const weeks = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];

  for (let i = startLine - 1; i < endLine; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(",");
    const team = cols[0]?.trim();
    if (!team || !cols[1]?.match(/^\d+(\.\d+)?$/)) continue;

    for (let w = 0; w < 8; w++) {
      const baseIndex = 2 + (w * 7);
      const opponent = cols[baseIndex]?.trim();
      const result = cols[baseIndex + 3]?.trim();

      if (opponent && (result === "FFW" || result === "FFL")) {
        forfeits.push({ team, opponent, week: weeks[w], result });
      }
    }
  }
  return forfeits;
}

function normalizeTeam(name: string): string {
  return name
    .replace(/\s*\([^)]+\)/g, "")
    .replace(/München/g, "Munchen")
    .replace(/Unknowns/g, "Unowns")
    .trim();
}

const divisions = db.prepare(`
  SELECT d.id, d.name, s.season_number, s.id as season_id
  FROM divisions d JOIN seasons s ON d.season_id = s.id WHERE s.season_number = 6
`).all() as { id: number; name: string; season_number: number; season_id: number }[];

const seasonCoaches = db.prepare(`
  SELECT sc.id, sc.team_name, sc.division_id FROM season_coaches sc
  JOIN divisions d ON sc.division_id = d.id JOIN seasons s ON d.season_id = s.id WHERE s.season_number = 6
`).all() as { id: number; team_name: string; division_id: number }[];

function findSeasonCoach(teamName: string, divisionId: number): number | null {
  const normalized = normalizeTeam(teamName).toLowerCase();
  const match = seasonCoaches.find(sc => {
    if (sc.division_id !== divisionId) return false;
    const scNorm = normalizeTeam(sc.team_name).toLowerCase();
    return scNorm === normalized || scNorm.includes(normalized) || normalized.includes(scNorm);
  });
  return match?.id || null;
}

const existsStmt = db.prepare(`
  SELECT COUNT(*) as cnt FROM matches WHERE division_id = ? AND week = ?
  AND ((coach1_season_id = ? AND coach2_season_id = ?) OR (coach1_season_id = ? AND coach2_season_id = ?))
`);

const insertStmt = db.prepare(`
  INSERT INTO matches (season_id, division_id, week, coach1_season_id, coach2_season_id, winner_id)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const divisionConfigs = [
  { name: "Stargazer", startLine: 185, endLine: 199 },
  { name: "Neon", startLine: 271, endLine: 285 },
];

for (const config of divisionConfigs) {
  const div = divisions.find(d => d.name === config.name);
  if (!div) { console.log(`Division ${config.name} not found`); continue; }

  console.log(`\nProcessing ${config.name}...`);
  const forfeits = parseForfeits(config.startLine, config.endLine);
  console.log(`Found ${forfeits.length} forfeit entries`);

  let added = 0, skipped = 0;

  for (const f of forfeits) {
    const weekNum = parseInt(f.week.replace("W", ""));
    const team1Id = findSeasonCoach(f.team, div.id);
    const team2Id = findSeasonCoach(f.opponent, div.id);

    if (!team1Id || !team2Id) {
      console.log(`  Skip: Could not find - ${f.team} (${team1Id}) vs ${f.opponent} (${team2Id})`);
      skipped++;
      continue;
    }

    const existing = existsStmt.get(div.id, weekNum, team1Id, team2Id, team2Id, team1Id) as { cnt: number };
    if (existing.cnt > 0) { skipped++; continue; }

    const winnerId = f.result === "FFW" ? team1Id : team2Id;
    insertStmt.run(div.season_id, div.id, weekNum, team1Id, team2Id, winnerId);
    console.log(`  Added: W${weekNum} ${f.team} vs ${f.opponent} (${f.result})`);
    added++;
  }

  console.log(`Added ${added} matches, skipped ${skipped}`);
}

db.close();
console.log("\nDone!");
