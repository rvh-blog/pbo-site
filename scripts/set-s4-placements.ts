import Database from "better-sqlite3";

const db = new Database("./pbo.db");

// S4 end-of-season ELOs from the CSV
const s4EndElos: Record<string, number> = {
  // S4 Unova
  "Abbotsford Aggrons": 2163.11,
  "Alabama Alakazams": 2259.61,
  "Charleston Chesnaughts": 2196.19,
  "Frederick Klefkis": 2302.36,
  "Kingston Shadows": 2160.03, // CSV has "Kingston Shadow"
  "New York Malamars": 2100.55,
  "New York Nickits": 2189.09, // LilHill
  "Norwalk Noiverns": 2009.06,
  "Pittsburgh Scizors": 2072.47,
  "Sunnyside Suicunes": 2196.17,
  "Vancouver Valiants": 2068.42,
  "Virginia Zekroms": 1990.26,
  "Worcester Woopers": 2296.33,
  "Philadelphia Pinsirs": 2076.13,

  // S4 Kalos
  "Caborca Gengars": 1843.28,
  "Detroit Zoroarks": 1629.92, // CSV has "Cleveland Cursolas" - same coach?
  "Gros Morne Growlithes": 1806.02, // CSV has "Delaware Dusknoirs"
  "Glamorgan Vale Great Tusks": 1885.06,
  "Luscious Lopunnies": 1919.76,
  "New Jersey Dracos": 1756.29,
  "Ottawa Donphans": 1619.97,
  "Sin City Sableye": 1869.21,
  "Tokyo Teddiursas": 1659.43,
  "Toronto Staraptors": 1788.67,
};

// Get all coaches who were placed in S5 (their first season in our DB)
const s5PlacedCoaches = db.prepare(`
  SELECT DISTINCT c.id as coach_id, c.name as coach_name, sc.team_name
  FROM coaches c
  JOIN season_coaches sc ON c.id = sc.coach_id
  JOIN divisions d ON sc.division_id = d.id
  JOIN seasons s ON d.season_id = s.id
  WHERE s.season_number = 5
  AND c.id IN (
    SELECT eh.coach_id FROM elo_history eh WHERE eh.match_id IS NULL
  )
`).all() as { coach_id: number; coach_name: string; team_name: string }[];

console.log("Coaches placed in S5 who may have S4 history:\n");

let updated = 0;
for (const coach of s5PlacedCoaches) {
  // Check if this team has an S4 end ELO
  const teamName = coach.team_name;

  // Try exact match first
  let s4Elo = s4EndElos[teamName];

  // Try normalized matches
  if (!s4Elo) {
    const normalized = teamName.toLowerCase();
    for (const [name, elo] of Object.entries(s4EndElos)) {
      if (name.toLowerCase() === normalized ||
          name.toLowerCase().includes(normalized.substring(0, 10)) ||
          normalized.includes(name.toLowerCase().substring(0, 10))) {
        s4Elo = elo;
        break;
      }
    }
  }

  if (s4Elo) {
    console.log(`${coach.coach_name} (${coach.team_name}): S4 end ELO = ${s4Elo}`);

    // Update the placement entry
    db.prepare(`
      UPDATE elo_history
      SET elo_rating = ?
      WHERE coach_id = ? AND match_id IS NULL
    `).run(s4Elo, coach.coach_id);

    updated++;
  } else {
    console.log(`${coach.coach_name} (${coach.team_name}): No S4 data found`);
  }
}

console.log(`\nUpdated ${updated} placement ELOs with S4 end-of-season values`);

db.close();
