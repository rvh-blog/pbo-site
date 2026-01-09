import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("./data/pbo.db");
const db = drizzle(sqlite, { schema });

const sampleCoaches = [
  "DragonMaster",
  "ThunderBolt",
  "AquaKing",
  "FlameQueen",
  "GrassGuru",
  "PsychicSage",
  "SteelDefender",
  "GhostHunter",
];

const samplePokemon = [
  { name: "Charizard", types: ["Fire", "Flying"] },
  { name: "Blastoise", types: ["Water"] },
  { name: "Venusaur", types: ["Grass", "Poison"] },
  { name: "Pikachu", types: ["Electric"] },
  { name: "Dragonite", types: ["Dragon", "Flying"] },
  { name: "Gengar", types: ["Ghost", "Poison"] },
  { name: "Alakazam", types: ["Psychic"] },
  { name: "Machamp", types: ["Fighting"] },
  { name: "Gyarados", types: ["Water", "Flying"] },
  { name: "Tyranitar", types: ["Rock", "Dark"] },
  { name: "Salamence", types: ["Dragon", "Flying"] },
  { name: "Metagross", types: ["Steel", "Psychic"] },
  { name: "Garchomp", types: ["Dragon", "Ground"] },
  { name: "Lucario", types: ["Fighting", "Steel"] },
  { name: "Togekiss", types: ["Fairy", "Flying"] },
  { name: "Rotom", types: ["Electric", "Ghost"] },
  { name: "Hydreigon", types: ["Dark", "Dragon"] },
  { name: "Volcarona", types: ["Bug", "Fire"] },
  { name: "Excadrill", types: ["Ground", "Steel"] },
  { name: "Ferrothorn", types: ["Grass", "Steel"] },
];

async function seed() {
  console.log("Seeding database...");

  // Clear existing data
  console.log("Clearing existing data...");
  sqlite.exec("DELETE FROM elo_history");
  sqlite.exec("DELETE FROM match_pokemon");
  sqlite.exec("DELETE FROM matches");
  sqlite.exec("DELETE FROM rosters");
  sqlite.exec("DELETE FROM season_coaches");
  sqlite.exec("DELETE FROM season_pokemon_prices");
  sqlite.exec("DELETE FROM divisions");
  sqlite.exec("DELETE FROM seasons");
  sqlite.exec("DELETE FROM pokemon");
  sqlite.exec("DELETE FROM coaches");

  // Add coaches
  console.log("Adding coaches...");
  const coachIds: number[] = [];
  for (const name of sampleCoaches) {
    const [coach] = await db
      .insert(schema.coaches)
      .values({ name })
      .returning();
    coachIds.push(coach.id);
  }

  // Add Pokemon
  console.log("Adding Pokemon...");
  const pokemonIds: number[] = [];
  for (const poke of samplePokemon) {
    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${poke.name.toLowerCase()}.png`;
    const [p] = await db
      .insert(schema.pokemon)
      .values({
        name: poke.name,
        types: poke.types,
        spriteUrl,
      })
      .returning();
    pokemonIds.push(p.id);
  }

  // Create Season 9 (past)
  console.log("Creating Season 9...");
  const [season9] = await db
    .insert(schema.seasons)
    .values({
      name: "Season 9",
      draftBudget: 100,
      isCurrent: false,
    })
    .returning();

  // Create Season 10 (current)
  console.log("Creating Season 10...");
  const [season10] = await db
    .insert(schema.seasons)
    .values({
      name: "Season 10",
      draftBudget: 100,
      isCurrent: true,
    })
    .returning();

  // Add divisions for Season 9
  const s9Divisions: number[] = [];
  for (const divName of ["Division A", "Division B"]) {
    const [div] = await db
      .insert(schema.divisions)
      .values({ seasonId: season9.id, name: divName })
      .returning();
    s9Divisions.push(div.id);
  }

  // Add divisions for Season 10
  const s10Divisions: number[] = [];
  for (const divName of [
    "Division A",
    "Division B",
    "Division C",
    "Division D",
  ]) {
    const [div] = await db
      .insert(schema.divisions)
      .values({ seasonId: season10.id, name: divName })
      .returning();
    s10Divisions.push(div.id);
  }

  // Add Pokemon prices for Season 10
  console.log("Setting Pokemon prices...");
  const prices = [30, 28, 26, 15, 25, 22, 20, 18, 24, 27, 26, 28, 29, 21, 19, 16, 25, 23, 20, 17];
  for (let i = 0; i < pokemonIds.length; i++) {
    await db.insert(schema.seasonPokemonPrices).values({
      seasonId: season10.id,
      pokemonId: pokemonIds[i],
      price: prices[i],
    });
  }

  // Add season coaches for Season 10
  console.log("Adding season coaches...");
  const seasonCoachIds: number[] = [];
  const teamNames = [
    "Dragon Force",
    "Thunder Strikers",
    "Aqua Raiders",
    "Flame Legion",
    "Grass Guardians",
    "Mind Masters",
    "Steel Wall",
    "Shadow Hunters",
  ];

  for (let i = 0; i < coachIds.length; i++) {
    const divisionIndex = i % s10Divisions.length;
    const [sc] = await db
      .insert(schema.seasonCoaches)
      .values({
        coachId: coachIds[i],
        divisionId: s10Divisions[divisionIndex],
        teamName: teamNames[i],
        remainingBudget: 40, // Spent 60 on roster
        isActive: true,
      })
      .returning();
    seasonCoachIds.push(sc.id);
  }

  // Add some rosters
  console.log("Adding rosters...");
  // Each coach gets 3-4 Pokemon
  for (let i = 0; i < seasonCoachIds.length; i++) {
    const startIdx = (i * 2) % pokemonIds.length;
    const pokemonForCoach = [
      pokemonIds[startIdx],
      pokemonIds[(startIdx + 1) % pokemonIds.length],
      pokemonIds[(startIdx + 5) % pokemonIds.length],
    ];

    for (let j = 0; j < pokemonForCoach.length; j++) {
      await db.insert(schema.rosters).values({
        seasonCoachId: seasonCoachIds[i],
        pokemonId: pokemonForCoach[j],
        price: 20,
        draftOrder: j + 1,
      });
    }
  }

  // Add some matches for Season 10
  console.log("Adding sample matches...");
  // Week 1 matches in Division A
  const divACoaches = seasonCoachIds.filter((_, i) => i % 4 === 0);
  if (divACoaches.length >= 2) {
    // Match 1
    const [match1] = await db
      .insert(schema.matches)
      .values({
        seasonId: season10.id,
        divisionId: s10Divisions[0],
        week: 1,
        coach1SeasonId: divACoaches[0],
        coach2SeasonId: divACoaches.length > 1 ? divACoaches[1] : seasonCoachIds[1],
        winnerId: divACoaches[0],
        coach1Differential: 3,
        coach2Differential: -3,
        isForfeit: false,
        playedAt: new Date().toISOString(),
      })
      .returning();

    // Add ELO for match
    await db.insert(schema.eloHistory).values([
      { coachId: coachIds[0], eloRating: 1016, matchId: match1.id },
      { coachId: coachIds[1], eloRating: 984, matchId: match1.id },
    ]);
  }

  // Add initial ELO for all coaches
  console.log("Setting initial ELO ratings...");
  for (const coachId of coachIds) {
    const existing = await db.query.eloHistory.findFirst({
      where: (elo, { eq }) => eq(elo.coachId, coachId),
    });
    if (!existing) {
      await db.insert(schema.eloHistory).values({
        coachId,
        eloRating: 1000,
        matchId: null,
      });
    }
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
