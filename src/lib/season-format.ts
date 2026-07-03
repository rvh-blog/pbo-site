export interface SeasonFormat {
  expectedDivisions: number | null;
  teamsPerDivision: number | null;
  regularSeasonWeeks: number;
  playoffRounds: number;
  fixturesPerRegularWeek: number | null;
}

export const LEGACY_REGULAR_SEASON_WEEKS = 8;
export const PLAYOFF_ROUNDS = 3;
export const SEASON_11_DIVISIONS = 5;
export const SEASON_11_TEAMS_PER_DIVISION = 16;
export const SEASON_11_FIXTURES_PER_WEEK = SEASON_11_TEAMS_PER_DIVISION / 2;

export function getSeasonFormat(seasonNumber: number | null | undefined): SeasonFormat {
  if ((seasonNumber ?? 0) >= 11) {
    return {
      expectedDivisions: SEASON_11_DIVISIONS,
      teamsPerDivision: SEASON_11_TEAMS_PER_DIVISION,
      regularSeasonWeeks: LEGACY_REGULAR_SEASON_WEEKS,
      playoffRounds: PLAYOFF_ROUNDS,
      fixturesPerRegularWeek: SEASON_11_FIXTURES_PER_WEEK,
    };
  }

  return {
    expectedDivisions: null,
    teamsPerDivision: null,
    regularSeasonWeeks: LEGACY_REGULAR_SEASON_WEEKS,
    playoffRounds: PLAYOFF_ROUNDS,
    fixturesPerRegularWeek: null,
  };
}
