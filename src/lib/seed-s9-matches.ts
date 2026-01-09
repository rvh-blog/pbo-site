import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import * as fs from "fs";

const sqlite = new Database("./data/pbo.db");
const db = drizzle(sqlite, { schema });

// Mid-season replacements (week they started)
// Original team -> Replacement team, starting week
const REPLACEMENTS: Record<string, { replacedBy: string; startWeek: number }> = {
  "Birmingham Buizels": { replacedBy: "Helsinki Jellicent Klub", startWeek: 4 },
  "Placeholder 1": { replacedBy: "Alabama Feraligatrs", startWeek: 2 },
  "Placeholder 2": { replacedBy: "Dreary Lane Darmanitans", startWeek: 4 },
  "Placeholder 3": { replacedBy: "Milton Keynes M'Ladies", startWeek: 5 },
};

// Reverse lookup: replacement -> original
const REPLACEMENT_REVERSE: Record<string, string> = {};
for (const [original, { replacedBy }] of Object.entries(REPLACEMENTS)) {
  REPLACEMENT_REVERSE[replacedBy] = original;
}

interface MatchData {
  week: number;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  team1Diff: number;
  team2Diff: number;
  winner: "team1" | "team2";
  team1Pokemon: { name: string; kills: number; deaths: number }[];
  team2Pokemon: { name: string; kills: number; deaths: number }[];
}

function parseCSV(): MatchData[] {
  const content = fs.readFileSync("./data/Sunset S9 - Match Stats.csv", "utf-8");
  const lines = content.split("\n").map((l) => l.split(","));

  const matches: MatchData[] = [];

  // Process each block of 7 matches (there are 8 weeks × 7 matches per block)
  // But the CSV has them arranged differently - 7 matches per row group, 8 weeks across

  // The structure is:
  // - Row 4, 17, 30, 43, 56, 69, 82: Score rows for 7 different match groups
  // - Each row group has 8 weeks of data horizontally

  const matchGroupStartRows = [4, 17, 30, 43, 56, 69, 82]; // 0-indexed: 3, 16, 29, 42, 55, 68, 81

  for (const startRow of matchGroupStartRows) {
    const scoreRow = lines[startRow - 1]; // -1 for 0-indexed
    const teamRow = lines[startRow];
    const pokemonHeaderRow = lines[startRow + 1];
    const pokemon1Row = lines[startRow + 2];
    const pokemon2Row = lines[startRow + 3];
    const pokemon3Row = lines[startRow + 4];
    const pokemon4Row = lines[startRow + 5];
    const pokemon5Row = lines[startRow + 6];
    const pokemon6Row = lines[startRow + 7];
    const resultRow = lines[startRow + 8];

    // Each week takes about 14 columns (with some spacing)
    // Week positions: 2, 16, 30, 44, 58, 72, 86, 100 (approximately)
    const weekOffsets = [2, 16, 30, 44, 58, 72, 86, 100];

    for (let weekIdx = 0; weekIdx < 8; weekIdx++) {
      const offset = weekOffsets[weekIdx];
      const week = weekIdx + 1;

      // Get team names
      const team1Name = teamRow[offset]?.trim();
      const team2Name = teamRow[offset + 4]?.trim();

      if (!team1Name || !team2Name || team1Name === "" || team2Name === "") {
        continue; // Skip empty matches
      }

      // Get scores from score row
      const team1Score = parseInt(scoreRow[offset] || "0") || 0;
      const team2Score = parseInt(scoreRow[offset + 4] || "0") || 0;

      // Get result from result row
      const resultStr = resultRow[offset]?.trim();
      const diffStr = resultRow[offset + 1]?.trim();

      let team1Diff = 0;
      let team2Diff = 0;
      let winner: "team1" | "team2" = "team1";

      if (resultStr === "W") {
        winner = "team1";
        team1Diff = parseInt(diffStr?.replace(/[^\d-]/g, "") || "0") || 0;
        team2Diff = -team1Diff;
      } else if (resultStr === "L") {
        winner = "team2";
        team1Diff = parseInt(diffStr?.replace(/[^\d-]/g, "") || "0") || 0;
        team2Diff = -team1Diff;
      }

      // Get Pokemon data
      const team1Pokemon: { name: string; kills: number; deaths: number }[] = [];
      const team2Pokemon: { name: string; kills: number; deaths: number }[] = [];

      const pokemonRows = [pokemon1Row, pokemon2Row, pokemon3Row, pokemon4Row, pokemon5Row, pokemon6Row];

      for (const row of pokemonRows) {
        // Team 1 Pokemon: column offset, offset+1 (K), offset+2 (D)
        const t1Name = row[offset]?.trim();
        const t1Kills = parseInt(row[offset + 1] || "0") || 0;
        const t1Deaths = parseInt(row[offset + 2] || "0") || 0;

        if (t1Name && t1Name !== "" && t1Name !== "Abra") {
          team1Pokemon.push({ name: t1Name, kills: t1Kills, deaths: t1Deaths });
        }

        // Team 2 Pokemon: column offset+4 (D), offset+5 (K), offset+6 (name)
        // Actually looking at the CSV format: ,,D,K,Pokemon
        const t2Deaths = parseInt(row[offset + 4] || "0") || 0;
        const t2Kills = parseInt(row[offset + 5] || "0") || 0;
        const t2Name = row[offset + 6]?.trim();

        if (t2Name && t2Name !== "" && t2Name !== "Abra") {
          team2Pokemon.push({ name: t2Name, kills: t2Kills, deaths: t2Deaths });
        }
      }

      matches.push({
        week,
        team1Name,
        team2Name,
        team1Score,
        team2Score,
        team1Diff,
        team2Diff,
        winner,
        team1Pokemon,
        team2Pokemon,
      });
    }
  }

  return matches;
}

// Get the actual team that played (accounting for replacements)
function getActualTeam(displayName: string, week: number): string {
  // If this team is a replacement, check if they had started by this week
  const originalTeam = REPLACEMENT_REVERSE[displayName];
  if (originalTeam) {
    const replacement = REPLACEMENTS[originalTeam];
    if (week < replacement.startWeek) {
      // Before replacement started, it was the original team
      return originalTeam;
    }
  }
  return displayName;
}

async function seedMatches() {
  console.log("Parsing match CSV...");
  const matches = parseCSV();
  console.log(`Found ${matches.length} matches`);

  // Get Season 9 and Sunset division
  const season9 = await db.query.seasons.findFirst({
    where: eq(schema.seasons.name, "Season 9"),
  });

  if (!season9) {
    console.error("Season 9 not found!");
    process.exit(1);
  }

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

  console.log(`Season 9 ID: ${season9.id}, Sunset Division ID: ${sunsetDiv.id}`);

  // Clear existing matches for this division
  const existingMatches = await db.query.matches.findMany({
    where: eq(schema.matches.divisionId, sunsetDiv.id),
  });

  for (const m of existingMatches) {
    await db.delete(schema.matchPokemon).where(eq(schema.matchPokemon.matchId, m.id));
  }
  await db.delete(schema.matches).where(eq(schema.matches.divisionId, sunsetDiv.id));
  console.log("Cleared existing match data");

  // Get all existing season coaches
  const existingCoaches = await db.query.seasonCoaches.findMany({
    where: eq(schema.seasonCoaches.divisionId, sunsetDiv.id),
    with: { coach: true },
  });

  const teamToSeasonCoach = new Map<string, number>();
  for (const sc of existingCoaches) {
    teamToSeasonCoach.set(sc.teamName, sc.id);
  }

  // Create placeholder teams for originals that were replaced
  for (const [original, { replacedBy }] of Object.entries(REPLACEMENTS)) {
    if (!teamToSeasonCoach.has(original)) {
      // Check if coach exists for original
      let coach = await db.query.coaches.findFirst({
        where: eq(schema.coaches.name, original),
      });

      if (!coach) {
        const [newCoach] = await db
          .insert(schema.coaches)
          .values({ name: original })
          .returning();
        coach = newCoach;
      }

      // Get the replacement season coach ID
      const replacementScId = teamToSeasonCoach.get(replacedBy);

      // Create season coach for original (inactive)
      const [newSc] = await db
        .insert(schema.seasonCoaches)
        .values({
          coachId: coach.id,
          divisionId: sunsetDiv.id,
          teamName: original,
          teamAbbreviation: original.substring(0, 3).toUpperCase(),
          isActive: false,
          replacedById: replacementScId,
          remainingBudget: 0,
        })
        .returning();

      teamToSeasonCoach.set(original, newSc.id);
      console.log(`Created placeholder team: ${original} (replaced by ${replacedBy})`);
    }
  }

  // Get Pokemon mapping
  const allPokemon = await db.query.pokemon.findMany();
  const pokemonByName = new Map<string, number>();
  for (const p of allPokemon) {
    pokemonByName.set(p.name.toLowerCase(), p.id);
  }

  // Helper to find pokemon ID
  function findPokemonId(name: string): number | null {
    const normalized = name.toLowerCase().replace(/ /g, "-");

    // Direct match
    if (pokemonByName.has(normalized)) {
      return pokemonByName.get(normalized)!;
    }

    // Try various normalizations
    const variations = [
      name.toLowerCase(),
      name.toLowerCase().replace(/ /g, "-"),
      name.toLowerCase().replace(/-/g, ""),
    ];

    for (const v of variations) {
      if (pokemonByName.has(v)) {
        return pokemonByName.get(v)!;
      }
    }

    // Special cases for regional forms and variants
    const specialCases: Record<string, string> = {
      // Ogerpon masks
      "ogerpon-w": "ogerpon-wellspring-mask",
      "ogerpon-t": "ogerpon",
      "ogerpon-h": "ogerpon-hearthflame-mask",
      // Ursaluna
      "ursaluna-bm": "ursaluna-bloodmoon",
      // Galarian forms
      "galarian slowking": "slowking-galar",
      "galarian zapdos": "zapdos-galar",
      "galarian moltres": "moltres-galar",
      "galarian weezing": "weezing-galar",
      // Alolan forms
      "alolan ninetales": "ninetales-alola",
      "alolan persian": "persian-alola",
      "alolan muk": "muk-alola",
      // Hisuian forms
      "hisuian samurott": "samurott-hisui",
      "hisuian electrode": "electrode-hisui",
      "hisuian qwilfish": "qwilfish-hisui",
      "hisuian zoroark": "zoroark-hisui",
      "hisuian goodra": "goodra-hisui",
      // Base forms that need suffixes
      "landorus": "landorus-incarnate",
      "thundurus": "thundurus-incarnate",
      "enamorus": "enamorus-incarnate",
      "palafin": "palafin-hero",
      "meloetta": "meloetta-aria",
      "keldeo": "keldeo-ordinary",
      "basculegion": "basculegion-male",
      // Therian forms
      "thundurus-therian": "thundurus-therian",
      "landorus-therian": "landorus-therian",
      "enamorus-therian": "enamorus-therian",
    };

    const lower = name.toLowerCase();
    if (specialCases[lower] && pokemonByName.has(specialCases[lower])) {
      return pokemonByName.get(specialCases[lower])!;
    }

    return null;
  }

  // Insert matches
  let matchesAdded = 0;
  let pokemonStatsAdded = 0;

  for (const match of matches) {
    // Get actual teams (accounting for mid-season replacements)
    const actualTeam1 = getActualTeam(match.team1Name, match.week);
    const actualTeam2 = getActualTeam(match.team2Name, match.week);

    const team1ScId = teamToSeasonCoach.get(actualTeam1);
    const team2ScId = teamToSeasonCoach.get(actualTeam2);

    if (!team1ScId || !team2ScId) {
      console.warn(`Could not find teams: ${actualTeam1} or ${actualTeam2}`);
      continue;
    }

    const winnerId = match.winner === "team1" ? team1ScId : team2ScId;

    // Create match
    const [newMatch] = await db
      .insert(schema.matches)
      .values({
        seasonId: season9.id,
        divisionId: sunsetDiv.id,
        week: match.week,
        coach1SeasonId: team1ScId,
        coach2SeasonId: team2ScId,
        winnerId,
        coach1Differential: match.team1Diff,
        coach2Differential: match.team2Diff,
        isForfeit: false,
      })
      .returning();

    matchesAdded++;

    // Add Pokemon stats for team 1
    for (const poke of match.team1Pokemon) {
      const pokeId = findPokemonId(poke.name);
      if (pokeId) {
        await db.insert(schema.matchPokemon).values({
          matchId: newMatch.id,
          seasonCoachId: team1ScId,
          pokemonId: pokeId,
          kills: poke.kills,
          deaths: poke.deaths,
        });
        pokemonStatsAdded++;
      } else {
        console.warn(`Pokemon not found: ${poke.name}`);
      }
    }

    // Add Pokemon stats for team 2
    for (const poke of match.team2Pokemon) {
      const pokeId = findPokemonId(poke.name);
      if (pokeId) {
        await db.insert(schema.matchPokemon).values({
          matchId: newMatch.id,
          seasonCoachId: team2ScId,
          pokemonId: pokeId,
          kills: poke.kills,
          deaths: poke.deaths,
        });
        pokemonStatsAdded++;
      } else {
        console.warn(`Pokemon not found: ${poke.name}`);
      }
    }
  }

  console.log(`\n✅ Seed complete!`);
  console.log(`   Matches added: ${matchesAdded}`);
  console.log(`   Pokemon stats added: ${pokemonStatsAdded}`);

  process.exit(0);
}

seedMatches().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
