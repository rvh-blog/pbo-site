// ELO Rating System for PBO
// K-factor: 32 (adjustable)
// Placement ELO based on first season/division

const K_FACTOR = 32;
const DEFAULT_STARTING_ELO = 1000;

// Placement ELO ratings by season and division
// Key format: "S{seasonNumber} {divisionName}"
const PLACEMENT_ELO: Record<string, number> = {
  "S4 Unova": 2150,
  "S5 Unova": 2100,
  "S9 Stargazer": 2100,
  "S7 Stargazer": 2050,
  "S8 Stargazer": 2050,
  "S9 Sunset": 2050,
  "S7 Sunset": 2000,
  "S6 Stargazer": 1950,
  "S6 Sunset": 1850,
  "S8 Sunset": 1800,
  "S4 Kalos": 1800,
  "S9 Crystal": 1750,
  "S5 Kalos": 1700,
  "S6 Neon": 1650,
  "S7 Neon": 1500,
  "S8 Neon": 1500,
  "S9 Neon": 1500,
};

export function getPlacementElo(seasonNumber: number, divisionName: string): number {
  const key = `S${seasonNumber} ${divisionName}`;
  return PLACEMENT_ELO[key] ?? DEFAULT_STARTING_ELO;
}

export function calculateExpectedScore(
  playerRating: number,
  opponentRating: number
): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

export function calculateNewRating(
  currentRating: number,
  expectedScore: number,
  actualScore: number, // 1 for win, 0.5 for draw, 0 for loss
  kFactor: number = K_FACTOR
): number {
  return Math.round(currentRating + kFactor * (actualScore - expectedScore));
}

export function calculateMatchElo(
  winnerRating: number,
  loserRating: number,
  kFactor: number = K_FACTOR
): { newWinnerRating: number; newLoserRating: number } {
  const winnerExpected = calculateExpectedScore(winnerRating, loserRating);
  const loserExpected = calculateExpectedScore(loserRating, winnerRating);

  const newWinnerRating = calculateNewRating(
    winnerRating,
    winnerExpected,
    1,
    kFactor
  );
  const newLoserRating = calculateNewRating(
    loserRating,
    loserExpected,
    0,
    kFactor
  );

  return { newWinnerRating, newLoserRating };
}

export function getStartingElo(): number {
  return DEFAULT_STARTING_ELO;
}

export function getKFactor(): number {
  return K_FACTOR;
}
