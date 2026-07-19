import assert from "node:assert/strict";
import {
  aggregateSeasonTeamPokemonLeaderboard,
  type SeasonTeamMatchPokemonRow,
} from "../src/lib/pokemon-leaderboard";

function row(
  matchId: number,
  seasonCoachId: number,
  teamName: string,
  kills: number
): SeasonTeamMatchPokemonRow {
  return {
    matchId,
    seasonCoachId,
    pokemonId: 1,
    kills,
    deaths: 1,
    pokemon: {
      id: 1,
      name: "Raging-bolt",
      displayName: "Raging Bolt",
      spriteUrl: null,
    },
    match: {
      id: matchId,
      week: matchId,
      coach1SeasonId: seasonCoachId,
      coach2SeasonId: 999,
      winnerId: seasonCoachId,
      replayUrl: `https://replay.pokemonshowdown.com/test-${matchId}`,
      playedAt: null,
      coach1: {
        id: seasonCoachId,
        teamName,
      },
      coach2: {
        id: 999,
        teamName: "Test Opponent",
      },
    },
    seasonCoach: {
      id: seasonCoachId,
      teamName,
      teamAbbreviation: null,
      coach: {
        id: seasonCoachId,
        name: `Coach ${seasonCoachId}`,
      },
      division: {
        name: seasonCoachId === 10 ? "Crystal" : "Sunset",
        season: {
          id: 11,
          name: "Season 11",
        },
      },
    },
  };
}

const leaderboard = aggregateSeasonTeamPokemonLeaderboard(
  new Set([1, 2, 3]),
  [
    row(1, 10, "Sydney Sylveons", 8),
    row(2, 10, "Sydney Sylveons", 7),
    row(3, 20, "Timekeepers", 10),
    row(999, 30, "Outside Season", 99),
  ]
);

assert.equal(leaderboard.length, 2, "The same species on different teams must produce separate rows");
assert.equal(leaderboard[0].teamName, "Sydney Sylveons");
assert.equal(leaderboard[0].kills, 15, "One team's Pokémon must aggregate across its season matches");
assert.equal(leaderboard[0].killsPerGame, 7.5);
assert.equal(leaderboard[0].games.length, 2);
assert.equal(leaderboard[0].games[0].opponentTeamName, "Test Opponent");
assert.equal(leaderboard[1].teamName, "Timekeepers");
assert.equal(leaderboard[1].kills, 10);

const regularSeason = aggregateSeasonTeamPokemonLeaderboard(
  new Set([1, 2]),
  [
    row(1, 10, "Sydney Sylveons", 8),
    row(2, 10, "Sydney Sylveons", 7),
    row(3, 20, "Timekeepers", 10),
  ]
);
const playoffs = aggregateSeasonTeamPokemonLeaderboard(
  new Set([3]),
  [
    row(1, 10, "Sydney Sylveons", 8),
    row(2, 10, "Sydney Sylveons", 7),
    row(3, 20, "Timekeepers", 10),
  ]
);

assert.equal(regularSeason.length, 1);
assert.equal(regularSeason[0].teamName, "Sydney Sylveons");
assert.equal(regularSeason[0].kills, 15);
assert.equal(playoffs.length, 1);
assert.equal(playoffs[0].teamName, "Timekeepers");
assert.equal(playoffs[0].kills, 10);

console.log("Comprehensive leaderboard checks passed");
