// ELO Rating System for PBO
// K-factor: 100 (matches league spreadsheet)
// Win probability uses base 3 (matches league spreadsheet)
// Formula: Elo change = 100 * (result - winProbability)
// where winProbability = 1 / (1 + 3^((opponentElo - ownElo) / 400))

const K_FACTOR = 100;
const DEFAULT_STARTING_ELO = 1000;
const MIN_FORFEIT_ELO_CHANGE = 15; // Minimum ELO change for forfeits
const DYNAMIC_PLACEMENT_START_SEASON = 11;
const PLACEMENT_ELO_OFFSET = 100;
const PLACEMENT_ELO_ROUNDING = 25;

// Placement ELO ratings by season and division
// Key format: "S{seasonNumber} {divisionName}"
const PLACEMENT_ELO: Record<string, number> = {
  // Season 10 (copied from S9)
  "S10 Stargazer": 2100,
  "S10 Sunset": 1850,
  "S10 Crystal": 1700,
  "S10 Neon": 1400,
  // Season 9
  "S9 Stargazer": 2100,
  "S9 Sunset": 1850,
  "S9 Crystal": 1700,
  "S9 Neon": 1400,
  // Season 8
  "S8 Stargazer": 2050,
  "S8 Sunset": 1800,
  "S8 Neon": 1500,
  // Season 7
  "S7 Stargazer": 2050,
  "S7 Sunset": 1850,
  "S7 Neon": 1500,
  // Season 6
  "S6 Stargazer": 1950,
  "S6 Sunset": 1850,
  "S6 Neon": 1650,
  // Season 5
  "S5 Unova": 2100,
  "S5 Kalos": 1700,
  // Season 4
  "S4 Unova": 2150,
  "S4 Kalos": 1800,
  // Season 3
  "S3 Unova": 2050,
  "S3 Kalos": 1800,
};

// Division-specific starting ELO overrides for coaches in multiple divisions per season
// Key: "coach_id:division_id", Value: starting ELO for that division
// Used when a coach plays in multiple divisions in the same season and ELO should not carry over
const DIVISION_COACH_OVERRIDES: Record<string, number> = {
  "80:26": 1683.92,  // Bee: S6 Neon (King Keldeos) starts from S6 Sunset end, not interleaved
};

// Match-specific starting ELO overrides for edge cases where match order causes issues
// Key: "match_id:coach_id", Value: starting ELO for that specific match
// Used when a coach's ELO should be different than their current tracked ELO
const MATCH_STARTING_ELO_OVERRIDES: Record<string, number> = {
  // Bee (coach 80) plays S6 Sunset (W1-W2) and S6 Neon (W1-W8) concurrently
  // Within W2, Neon match 2315 processes before Sunset match 2364, so after W2
  // Bee's ELO is set to Sunset W2 end. We need to reset for Neon W3.
  "2364:80": 1702.23,  // S6 Sunset W2: start from Sunset W1 end
  "2348:80": 1586.28,  // S6 Neon W3: reset to Neon W2 end (after this, no more Sunset matches)
};

export function getDivisionStartingElo(coachId: number, divisionId: number): number | undefined {
  const key = `${coachId}:${divisionId}`;
  return DIVISION_COACH_OVERRIDES[key];
}

export function getMatchStartingElo(matchId: number, coachId: number): number | undefined {
  const key = `${matchId}:${coachId}`;
  return MATCH_STARTING_ELO_OVERRIDES[key];
}

export function getPlacementElo(seasonNumber: number, divisionName: string): number {
  const key = `S${seasonNumber} ${divisionName}`;
  return PLACEMENT_ELO[key] ?? DEFAULT_STARTING_ELO;
}

export function usesDynamicPlacementElo(seasonNumber: number): boolean {
  return seasonNumber >= DYNAMIC_PLACEMENT_START_SEASON;
}

export function roundPlacementElo(value: number): number {
  return Math.round(value / PLACEMENT_ELO_ROUNDING) * PLACEMENT_ELO_ROUNDING;
}

export function calculateDynamicPlacementElo(returningCoachElos: number[]): number {
  if (returningCoachElos.length === 0) {
    return DEFAULT_STARTING_ELO;
  }

  const averageElo = returningCoachElos.reduce((sum, elo) => sum + elo, 0) / returningCoachElos.length;
  return roundPlacementElo(averageElo - PLACEMENT_ELO_OFFSET);
}

export function calculateExpectedScore(
  playerRating: number,
  opponentRating: number
): number {
  // Win probability = 1 / (1 + 3^((opponent - own) / 400))
  return 1 / (1 + Math.pow(3, (opponentRating - playerRating) / 400));
}

export function calculateNewRating(
  currentRating: number,
  expectedScore: number,
  actualScore: number, // 1 for win, 0.5 for draw, 0 for loss
  kFactor: number = K_FACTOR
): number {
  // Round to 2 decimal places to match spreadsheet precision
  return Math.round((currentRating + kFactor * (actualScore - expectedScore)) * 100) / 100;
}

export function calculateMatchElo(
  winnerRating: number,
  loserRating: number,
  kFactor: number = K_FACTOR,
  isForfeit: boolean = false
): { newWinnerRating: number; newLoserRating: number } {
  const winnerExpected = calculateExpectedScore(winnerRating, loserRating);
  const loserExpected = calculateExpectedScore(loserRating, winnerRating);

  // Forfeits use reduced impact: FFW = 0.75, FFL = 0.25
  // Regular matches use 1 for win, 0 for loss
  const winnerScore = isForfeit ? 0.75 : 1;
  const loserScore = isForfeit ? 0.25 : 0;

  let newWinnerRating = calculateNewRating(
    winnerRating,
    winnerExpected,
    winnerScore,
    kFactor
  );
  let newLoserRating = calculateNewRating(
    loserRating,
    loserExpected,
    loserScore,
    kFactor
  );

  // For forfeits, enforce minimum ELO change of ±15
  if (isForfeit) {
    const winnerChange = newWinnerRating - winnerRating;
    const loserChange = newLoserRating - loserRating;

    // If winner gained less than minimum, give them the minimum
    if (winnerChange < MIN_FORFEIT_ELO_CHANGE) {
      newWinnerRating = Math.round((winnerRating + MIN_FORFEIT_ELO_CHANGE) * 100) / 100;
    }
    // If loser lost less than minimum, make them lose the minimum
    if (loserChange > -MIN_FORFEIT_ELO_CHANGE) {
      newLoserRating = Math.round((loserRating - MIN_FORFEIT_ELO_CHANGE) * 100) / 100;
    }
  }

  return { newWinnerRating, newLoserRating };
}

export function calculateDoubleForfeitElo(
  coach1Rating: number,
  coach2Rating: number,
  kFactor: number = K_FACTOR
): { newCoach1Rating: number; newCoach2Rating: number } {
  // Double forfeit: both coaches get FFL (0.25 score), both lose ELO
  const coach1Expected = calculateExpectedScore(coach1Rating, coach2Rating);
  const coach2Expected = calculateExpectedScore(coach2Rating, coach1Rating);

  let newCoach1Rating = calculateNewRating(
    coach1Rating,
    coach1Expected,
    0.25, // FFL score
    kFactor
  );
  let newCoach2Rating = calculateNewRating(
    coach2Rating,
    coach2Expected,
    0.25, // FFL score
    kFactor
  );

  // Enforce minimum ELO loss of 15 for double forfeits
  const coach1Change = newCoach1Rating - coach1Rating;
  const coach2Change = newCoach2Rating - coach2Rating;

  if (coach1Change > -MIN_FORFEIT_ELO_CHANGE) {
    newCoach1Rating = Math.round((coach1Rating - MIN_FORFEIT_ELO_CHANGE) * 100) / 100;
  }
  if (coach2Change > -MIN_FORFEIT_ELO_CHANGE) {
    newCoach2Rating = Math.round((coach2Rating - MIN_FORFEIT_ELO_CHANGE) * 100) / 100;
  }

  return { newCoach1Rating, newCoach2Rating };
}

export function getStartingElo(): number {
  return DEFAULT_STARTING_ELO;
}

export function getKFactor(): number {
  return K_FACTOR;
}
