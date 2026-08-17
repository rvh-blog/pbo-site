import type { ExperimentalStatsDataset, ExperimentalMatch } from "@/app/experimental-stats/experimental-stats-client";
import type { ExperimentalUrlFilters } from "@/lib/experimental-stats-data";

const DEMO_POKEMON = [
  { id: 984, name: "Great Tusk", sprite: 984, moves: ["Headlong Rush", "Close Combat", "Rapid Spin", "Knock Off"], item: "Booster Energy" },
  { id: 479, name: "Rotom-Wash", sprite: 479, moves: ["Volt Switch", "Hydro Pump", "Will-O-Wisp", "Pain Split"], item: "Leftovers" },
  { id: 887, name: "Dragapult", sprite: 887, moves: ["Draco Meteor", "Shadow Ball", "U-turn", "Thunder Wave"], item: "Choice Specs" },
  { id: 1000, name: "Gholdengo", sprite: 1000, moves: ["Make It Rain", "Shadow Ball", "Recover", "Nasty Plot"], item: "Air Balloon" },
  { id: 149, name: "Dragonite", sprite: 149, moves: ["Extreme Speed", "Earthquake", "Dragon Dance", "Roost"], item: "Heavy-Duty Boots" },
  { id: 445, name: "Garchomp", sprite: 445, moves: ["Earthquake", "Dragon Claw", "Stealth Rock", "Swords Dance"], item: "Rocky Helmet" },
  { id: 823, name: "Corviknight", sprite: 823, moves: ["Brave Bird", "U-turn", "Roost", "Defog"], item: "Leftovers" },
  { id: 36, name: "Clefable", sprite: 36, moves: ["Moonblast", "Moonlight", "Knock Off", "Thunder Wave"], item: "Life Orb" },
  { id: 1006, name: "Iron Valiant", sprite: 1006, moves: ["Moonblast", "Close Combat", "Encore", "Calm Mind"], item: "Booster Energy" },
  { id: 485, name: "Heatran", sprite: 485, moves: ["Magma Storm", "Earth Power", "Taunt", "Stealth Rock"], item: "Leftovers" },
  { id: 812, name: "Rillaboom", sprite: 812, moves: ["Grassy Glide", "Wood Hammer", "U-turn", "Knock Off"], item: "Choice Band" },
  { id: 145, name: "Zapdos", sprite: 145, moves: ["Hurricane", "Volt Switch", "Roost", "Heat Wave"], item: "Heavy-Duty Boots" },
];

const DEMO_COACHES = [
  { seasonCoachId: -101, coachId: -11, coachName: "Demo Aurora", teamName: "Aurora Articunos" },
  { seasonCoachId: -102, coachId: -12, coachName: "Demo Ember", teamName: "Ember Enteis" },
  { seasonCoachId: -103, coachId: -13, coachName: "Demo Marina", teamName: "Marina Manaphys" },
  { seasonCoachId: -104, coachId: -14, coachName: "Demo Summit", teamName: "Summit Salamences" },
];

function spriteUrl(id: number) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

function buildSnapshots(totalTurns: number, winner: "p1" | "p2") {
  return Array.from({ length: totalTurns + 1 }, (_, turn) => {
    if (turn === 0) return { turn, p1TotalHp: 600, p2TotalHp: 600 };
    const p1Base = 600 - Math.round((turn / totalTurns) * (winner === "p1" ? 365 : 600));
    const p2Base = 600 - Math.round((turn / totalTurns) * (winner === "p2" ? 350 : 600));
    const recovery = turn % 5 === 0 ? 24 : 0;
    return {
      turn,
      p1TotalHp: Math.max(0, Math.min(600, p1Base + (winner === "p1" ? recovery : 0))),
      p2TotalHp: Math.max(0, Math.min(600, p2Base + (winner === "p2" ? recovery : 0))),
    };
  });
}

export function createExperimentalDemoDataset(params: {
  seasons: ExperimentalStatsDataset["seasons"];
  divisions: ExperimentalStatsDataset["divisions"];
  currentSeasonId: number | null;
  filters: ExperimentalUrlFilters;
  includeTimeline: boolean;
}): ExperimentalStatsDataset {
  const { seasons, divisions, currentSeasonId, filters, includeTimeline } = params;
  const seasonId = filters.seasonId === "all" ? (currentSeasonId ?? seasons[0]?.id ?? -1) : filters.seasonId;
  const season = seasons.find((candidate) => candidate.id === seasonId) ?? seasons[0] ?? { id: seasonId, name: "Demo Season", seasonNumber: 0 };
  const division = filters.divisionId === "all"
    ? divisions.find((candidate) => candidate.seasonId === season.id) ?? { id: -1, seasonId: season.id, name: "Demo Division", displayOrder: 0 }
    : divisions.find((candidate) => candidate.id === filters.divisionId) ?? { id: filters.divisionId, seasonId: season.id, name: "Demo Division", displayOrder: 0 };

  const demoMatches: ExperimentalMatch[] = Array.from({ length: 14 }, (_, matchIndex) => {
    const coach1 = DEMO_COACHES[matchIndex % DEMO_COACHES.length];
    let coach2 = DEMO_COACHES[(matchIndex + 1 + Math.floor(matchIndex / 4)) % DEMO_COACHES.length];
    if (coach2.seasonCoachId === coach1.seasonCoachId) coach2 = DEMO_COACHES[(matchIndex + 2) % DEMO_COACHES.length];
    const winner: "p1" | "p2" = matchIndex % 3 === 0 ? "p2" : "p1";
    const totalTurns = 13 + ((matchIndex * 3) % 15);
    const faintTurns = [4, 7, 10, 13, Math.max(14, totalTurns - 3), totalTurns];
    const keyEvents = includeTimeline ? [
      ...faintTurns.map((turn, faintIndex) => {
        const player: "p1" | "p2" = faintIndex % 2 === 0 ? "p2" : "p1";
        const victim = DEMO_POKEMON[player === "p1" ? faintIndex % 6 : 6 + (faintIndex % 6)];
        const killer = DEMO_POKEMON[player === "p1" ? 6 + ((faintIndex + 1) % 6) : (faintIndex + 1) % 6];
        return { turn, type: "faint", player, pokemon: victim.name, killer: killer.name, move: killer.moves[faintIndex % killer.moves.length], cause: "move" };
      }),
      { turn: totalTurns, type: "win", player: winner },
    ] : [];

    return {
      id: -1000 - matchIndex,
      isDemo: true,
      seasonId: season.id,
      seasonName: season.name,
      divisionId: division.id,
      divisionName: division.name,
      week: matchIndex < 12 ? 1 + (matchIndex % 8) : 101 + (matchIndex - 12),
      winnerId: winner === "p1" ? coach1.seasonCoachId : coach2.seasonCoachId,
      isForfeit: false,
      playedAt: new Date(Date.UTC(2026, 3, 1 + matchIndex * 6)).toISOString(),
      replayUrl: "/experimental-stats?demo=1",
      zoroarkInvolved: matchIndex === 9,
      p1IsCoach1: true,
      turnSnapshots: includeTimeline ? buildSnapshots(totalTurns, winner) : [],
      keyEvents,
      coach1,
      coach2,
      pokemon: DEMO_POKEMON.map((pokemon, pokemonIndex) => {
        const owner = pokemonIndex < 6 ? coach1 : coach2;
        const won = owner.seasonCoachId === (winner === "p1" ? coach1.seasonCoachId : coach2.seasonCoachId);
        const variance = ((matchIndex + 2) * (pokemonIndex + 3)) % 47;
        const directDamage = 34 + variance * 2 + (won ? 18 : 0);
        const indirectDamage = (pokemonIndex + matchIndex) % 4 === 0 ? 18 + (variance % 24) : variance % 13;
        const movesUsed = Object.fromEntries(pokemon.moves.map((move, moveIndex) => [move, 1 + ((matchIndex + pokemonIndex + moveIndex) % (moveIndex === 0 ? 4 : 2))]));
        return {
          seasonCoachId: owner.seasonCoachId,
          pokemonId: pokemon.id,
          pokemonName: pokemon.name,
          spriteUrl: spriteUrl(pokemon.sprite),
          kills: (pokemonIndex + matchIndex) % 5 === 0 ? 2 : (pokemonIndex + matchIndex) % 3 === 0 ? 1 : 0,
          deaths: (pokemonIndex + matchIndex + (won ? 1 : 0)) % 4 === 0 ? 1 : 0,
          damageDealt: directDamage,
          damageDealtIndirect: indirectDamage,
          damageTaken: 48 + ((variance * 3) % 84),
          damageTakenIndirect: variance % 19,
          turnsActive: 5 + ((matchIndex * 2 + pokemonIndex * 3) % 15),
          hazardDamageTaken: variance % 25,
          setupMovesUsed: pokemon.moves.some((move) => ["Nasty Plot", "Dragon Dance", "Swords Dance", "Calm Mind"].includes(move)) ? (matchIndex + pokemonIndex) % 3 : 0,
          favorableCrits: (matchIndex + pokemonIndex) % 7 === 0 ? 1 : 0,
          favorableMisses: (matchIndex * 2 + pokemonIndex) % 9 === 0 ? 1 : 0,
          favorableFlinches: (matchIndex + pokemonIndex) % 13 === 0 ? 1 : 0,
          favorableParalysis: (matchIndex + pokemonIndex * 2) % 11 === 0 ? 1 : 0,
          favorableFreezes: matchIndex === 8 && pokemonIndex === 11 ? 1 : 0,
          favorableBurns: (matchIndex + pokemonIndex) % 17 === 0 ? 1 : 0,
          favorableSleep: 0,
          hpRestored: pokemon.moves.some((move) => ["Recover", "Roost", "Moonlight", "Pain Split"].includes(move)) ? 22 + (variance % 58) : variance % 9,
          movesUsed,
          moveDataRecorded: true,
          revealedItems: (matchIndex + pokemonIndex) % 5 === 0 ? [] : [{ item: pokemon.item, turn: 2 + ((matchIndex + pokemonIndex * 2) % Math.max(4, totalTurns - 1)), source: pokemon.item === "Leftovers" ? "-heal" : "item" }],
          itemDataRecorded: true,
        };
      }),
    };
  });

  return {
    isDemo: true,
    currentSeasonId: currentSeasonId ?? season.id,
    highestAvailableWeek: Math.max(1, ...demoMatches.map((match) => match.week)),
    highestAvailableWeekBySeason: { [season.id]: Math.max(1, ...demoMatches.map((match) => match.week)) },
    seasons,
    divisions,
    matches: demoMatches,
  };
}
