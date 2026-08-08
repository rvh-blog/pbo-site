import type { MatchForStandings } from "@/lib/standings-sort";

export const PLAYOFF_SPOTS = 8;

export type CalculatorDivision = {
  id: number;
  name: string;
};

export type CalculatorTeam = {
  id: number;
  divisionId: number;
  teamName: string;
  teamAbbreviation: string | null;
  isActive: boolean;
  replacedById: number | null;
  eloRating: number | null;
};

export type CalculatorMatch = MatchForStandings & {
  id: number;
  divisionId: number;
};

export type Prediction = {
  winnerId: number;
  differential: number;
};

export type Predictions = Record<number, Prediction>;

export type Standing = CalculatorTeam & {
  wins: number;
  losses: number;
  differential: number;
  opponentActiveIds: number[];
};

export type QualificationStatus = "clinched" | "eliminated" | "alive";

export type TeamProjection = {
  teamId: number;
  playoffProbability: number;
  seedProbabilities: number[];
  bestSeed: number;
  worstSeed: number;
  minimumWins: number;
  maximumWins: number;
  status: QualificationStatus;
};

export type OddsResult = {
  projections: Map<number, TeamProjection>;
  method: "exact" | "simulation";
  scenarioCount: number;
};

export type MatchLeverage = {
  matchId: number;
  firstTeamOdds: number;
  secondTeamOdds: number;
  swing: number;
};

export function buildReplacementMap(teams: CalculatorTeam[]) {
  const replacementMap = new Map<number, number[]>();
  for (const team of teams) {
    if (!team.isActive && team.replacedById) {
      const predecessors = replacementMap.get(team.replacedById) ?? [];
      predecessors.push(team.id);
      replacementMap.set(team.replacedById, predecessors);
    }
  }
  return replacementMap;
}

const preparedTeamsCache = new WeakMap<CalculatorTeam[], {
  activeTeams: CalculatorTeam[];
  activeBySeasonTeamId: Map<number, number>;
}>();

function prepareTeams(teams: CalculatorTeam[]) {
  const cached = preparedTeamsCache.get(teams);
  if (cached) return cached;
  const activeTeams = teams.filter((team) => team.isActive);
  const replacementMap = buildReplacementMap(teams);
  const activeBySeasonTeamId = new Map<number, number>();
  for (const team of activeTeams) {
    activeBySeasonTeamId.set(team.id, team.id);
    for (const predecessorId of replacementMap.get(team.id) ?? []) activeBySeasonTeamId.set(predecessorId, team.id);
  }
  const prepared = { activeTeams, activeBySeasonTeamId };
  preparedTeamsCache.set(teams, prepared);
  return prepared;
}

function buildActiveResolver(teams: CalculatorTeam[]) {
  const replacementMap = buildReplacementMap(teams);
  const teamIds = new Map<number, Set<number>>();
  for (const team of teams.filter((candidate) => candidate.isActive)) {
    teamIds.set(team.id, new Set([team.id, ...(replacementMap.get(team.id) ?? [])]));
  }
  return (teamId: number) => {
    for (const [activeId, ids] of teamIds) {
      if (ids.has(teamId)) return activeId;
    }
    return null;
  };
}

export function applyPredictions(matches: CalculatorMatch[], predictions: Predictions) {
  return matches.map((match) => {
    const prediction = predictions[match.id];
    if (!prediction) return match;
    const coach1Won = prediction.winnerId === match.coach1SeasonId;
    return {
      ...match,
      winnerId: prediction.winnerId,
      isForfeit: false,
      coach1Differential: coach1Won ? prediction.differential : -prediction.differential,
      coach2Differential: coach1Won ? -prediction.differential : prediction.differential,
    };
  });
}

export function standingsFor(
  teams: CalculatorTeam[],
  matches: CalculatorMatch[],
  predictions: Predictions = {},
) {
  const { activeTeams, activeBySeasonTeamId } = prepareTeams(teams);

  const stats = new Map(activeTeams.map((team) => [team.id, {
    team,
    wins: 0,
    losses: 0,
    differential: 0,
    opponentActiveIds: [] as number[],
  }]));
  const headToHead = new Map<string, number>();

  for (const original of matches) {
    if (original.week > 100) continue;
    const override = predictions[original.id];
    const firstId = activeBySeasonTeamId.get(original.coach1SeasonId);
    const secondId = activeBySeasonTeamId.get(original.coach2SeasonId);
    if (!firstId || !secondId) continue;
    const first = stats.get(firstId)!;
    const second = stats.get(secondId)!;
    const coach1Won = override?.winnerId === original.coach1SeasonId;
    const winnerId = override?.winnerId ?? original.winnerId;
    const firstDifferential = override ? (coach1Won ? override.differential : -override.differential) : original.coach1Differential ?? 0;
    const secondDifferential = override ? -firstDifferential : original.coach2Differential ?? 0;
    first.differential += firstDifferential;
    second.differential += secondDifferential;

    if (winnerId) {
      const activeWinnerId = activeBySeasonTeamId.get(winnerId);
      if (!activeWinnerId) continue;
      const activeLoserId = activeWinnerId === firstId ? secondId : firstId;
      stats.get(activeWinnerId)!.wins += 1;
      stats.get(activeLoserId)!.losses += 1;
      first.opponentActiveIds.push(secondId);
      second.opponentActiveIds.push(firstId);
      const winnerKey = `${activeWinnerId}:${activeLoserId}`;
      const loserKey = `${activeLoserId}:${activeWinnerId}`;
      headToHead.set(winnerKey, (headToHead.get(winnerKey) ?? 0) + 1);
      headToHead.set(loserKey, (headToHead.get(loserKey) ?? 0) - 1);
    } else if (override ? false : original.isForfeit) {
      first.losses += 1;
      second.losses += 1;
      first.opponentActiveIds.push(secondId);
      second.opponentActiveIds.push(firstId);
    }
  }

  const standings = [...stats.values()].map(({ team, ...record }) => ({ ...team, ...record }));
  const records = new Map(standings.map((team) => [team.id, team.wins - team.losses]));
  standings.sort((left, right) => {
    if (right.wins !== left.wins) return right.wins - left.wins;
    if (right.differential !== left.differential) return right.differential - left.differential;
    if (left.losses !== right.losses) return left.losses - right.losses;
    const direct = headToHead.get(`${left.id}:${right.id}`) ?? 0;
    if (direct !== 0) return direct > 0 ? -1 : 1;
    const leftSchedule = left.opponentActiveIds.reduce((sum, id) => sum + (records.get(id) ?? 0), 0);
    const rightSchedule = right.opponentActiveIds.reduce((sum, id) => sum + (records.get(id) ?? 0), 0);
    return rightSchedule - leftSchedule;
  });
  return standings;
}

const standingsResultCache = new Map<string, Standing[]>();

export function standingsForCached(
  teams: CalculatorTeam[],
  matches: CalculatorMatch[],
  predictions: Predictions = {},
) {
  const key = JSON.stringify({
    teams: teams.map((team) => [team.id, team.isActive, team.replacedById]),
    matches: matches.map((match) => [match.id, match.winnerId, match.coach1Differential, match.coach2Differential, match.isForfeit]),
    predictions: Object.entries(predictions).sort(([left], [right]) => Number(left) - Number(right)),
  });
  const cached = standingsResultCache.get(key);
  if (cached) return cached;
  const result = standingsFor(teams, matches, predictions);
  standingsResultCache.set(key, result);
  if (standingsResultCache.size > 160) standingsResultCache.delete(standingsResultCache.keys().next().value!);
  return result;
}

export function averageWinningDifferentials(
  teams: CalculatorTeam[],
  matches: CalculatorMatch[],
) {
  const resolveActive = buildActiveResolver(teams);
  const totals = new Map<number, { total: number; count: number }>();
  for (const match of matches) {
    if (!match.winnerId || match.isForfeit) continue;
    const activeWinner = resolveActive(match.winnerId);
    if (!activeWinner) continue;
    const rawDifferential = match.winnerId === match.coach1SeasonId
      ? match.coach1Differential
      : match.coach2Differential;
    const differential = Math.max(1, Math.min(6, Math.abs(rawDifferential ?? 0) || 3));
    const current = totals.get(activeWinner) ?? { total: 0, count: 0 };
    current.total += differential;
    current.count += 1;
    totals.set(activeWinner, current);
  }
  return new Map(
    teams.filter((team) => team.isActive).map((team) => {
      const result = totals.get(team.id);
      return [team.id, result ? Math.max(1, Math.min(6, Math.round(result.total / result.count))) : 3];
    }),
  );
}

function hashScenario(predictions: Predictions) {
  let hash = 2166136261;
  for (const [matchId, prediction] of Object.entries(predictions).sort(([a], [b]) => Number(a) - Number(b))) {
    const text = `${matchId}:${prediction.winnerId}:${prediction.differential}`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type ProbabilityContext = {
  recentForm: Map<number, number>;
  scheduleStrength: Map<number, number>;
  headToHead: Map<string, number>;
};

function buildProbabilityContext(
  teams: CalculatorTeam[],
  matches: CalculatorMatch[],
  predictions: Predictions,
  standings: Standing[],
): ProbabilityContext {
  const resolveActive = buildActiveResolver(teams);
  const completed = applyPredictions(matches, predictions).filter((match) => match.winnerId && !match.isForfeit);
  const recentByTeam = new Map<number, Array<{ week: number; won: boolean }>>();
  const headToHead = new Map<string, number>();
  for (const match of completed) {
    const first = resolveActive(match.coach1SeasonId);
    const second = resolveActive(match.coach2SeasonId);
    const winner = match.winnerId ? resolveActive(match.winnerId) : null;
    if (!first || !second || !winner) continue;
    const loser = winner === first ? second : first;
    recentByTeam.set(first, [...(recentByTeam.get(first) ?? []), { week: match.week, won: winner === first }]);
    recentByTeam.set(second, [...(recentByTeam.get(second) ?? []), { week: match.week, won: winner === second }]);
    const winnerKey = `${winner}:${loser}`;
    const loserKey = `${loser}:${winner}`;
    headToHead.set(winnerKey, (headToHead.get(winnerKey) ?? 0) + 1);
    headToHead.set(loserKey, (headToHead.get(loserKey) ?? 0) - 1);
  }
  const recentForm = new Map(standings.map((team) => {
    const recent = (recentByTeam.get(team.id) ?? []).sort((a, b) => b.week - a.week).slice(0, 3);
    return [team.id, recent.reduce((score, result) => score + (result.won ? 1 : -1), 0)];
  }));
  const records = new Map(standings.map((team) => [team.id, team.wins - team.losses]));
  const scheduleStrength = new Map(standings.map((team) => [team.id, team.opponentActiveIds.reduce((sum, opponentId) => sum + (records.get(opponentId) ?? 0), 0)]));
  return { recentForm, scheduleStrength, headToHead };
}

function probabilityFor(
  first: Standing | undefined,
  second: Standing | undefined,
  context: ProbabilityContext,
) {
  if (!first || !second) return 0.5;
  const score = (first.wins - second.wins) * 0.48
    + (first.differential - second.differential) * 0.032
    + ((context.recentForm.get(first.id) ?? 0) - (context.recentForm.get(second.id) ?? 0)) * 0.13
    + ((context.scheduleStrength.get(first.id) ?? 0) - (context.scheduleStrength.get(second.id) ?? 0)) * 0.018
    + (context.headToHead.get(`${first.id}:${second.id}`) ?? 0) * 0.16;
  return Math.max(0.18, Math.min(0.82, 1 / (1 + Math.exp(-score))));
}

export function calculateQualificationBounds(
  teams: CalculatorTeam[],
  matches: CalculatorMatch[],
  predictions: Predictions,
) {
  const standings = standingsFor(teams, matches, predictions);
  const resolveActive = buildActiveResolver(teams);
  const openMatches = matches.filter((match) => !match.winnerId && !predictions[match.id] && !match.isForfeit);
  const remainingByTeam = new Map<number, number>();
  for (const match of openMatches) {
    const first = resolveActive(match.coach1SeasonId);
    const second = resolveActive(match.coach2SeasonId);
    if (first) remainingByTeam.set(first, (remainingByTeam.get(first) ?? 0) + 1);
    if (second) remainingByTeam.set(second, (remainingByTeam.get(second) ?? 0) + 1);
  }
  const bounds = new Map(standings.map((team) => [team.id, {
    minimumWins: team.wins,
    maximumWins: team.wins + (remainingByTeam.get(team.id) ?? 0),
  }]));

  return new Map(standings.map((team) => {
    const teamBounds = bounds.get(team.id)!;
    const couldReachOrPass = standings.filter((other) =>
      other.id !== team.id && bounds.get(other.id)!.maximumWins >= teamBounds.minimumWins
    ).length;
    const definitelyAbove = standings.filter((other) =>
      other.id !== team.id && bounds.get(other.id)!.minimumWins > teamBounds.maximumWins
    ).length;
    const status: QualificationStatus = couldReachOrPass < PLAYOFF_SPOTS
      ? "clinched"
      : definitelyAbove >= PLAYOFF_SPOTS
        ? "eliminated"
        : "alive";
    return [team.id, { ...teamBounds, status }];
  }));
}

export function simulatePlayoffOdds({
  teams,
  matches,
  predictions,
  iterations = 1500,
}: {
  teams: CalculatorTeam[];
  matches: CalculatorMatch[];
  predictions: Predictions;
  iterations?: number;
}) {
  const activeTeams = teams.filter((team) => team.isActive);
  const baselineStandings = standingsFor(teams, matches, predictions);
  const baselineById = new Map(baselineStandings.map((team) => [team.id, team]));
  const probabilityContext = buildProbabilityContext(teams, matches, predictions, baselineStandings);
  const averages = averageWinningDifferentials(teams, applyPredictions(matches, predictions));
  const openMatches = matches.filter((match) => !match.winnerId && !predictions[match.id] && !match.isForfeit);
  const seedCounts = new Map(activeTeams.map((team) => [team.id, Array(activeTeams.length).fill(0) as number[]]));
  const random = seededRandom(hashScenario(predictions) + matches.length * 97 + teams.length * 13);

  if (openMatches.length === 0) iterations = 1;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const simulated: Predictions = { ...predictions };
    for (const match of openMatches) {
      const first = baselineById.get(match.coach1SeasonId);
      const second = baselineById.get(match.coach2SeasonId);
      const firstWins = random() < probabilityFor(first, second, probabilityContext);
      const winnerId = firstWins ? match.coach1SeasonId : match.coach2SeasonId;
      const average = averages.get(winnerId) ?? 3;
      const differential = Math.max(1, Math.min(6, average + Math.floor(random() * 3) - 1));
      simulated[match.id] = { winnerId, differential };
    }
    standingsFor(teams, matches, simulated).forEach((team, seedIndex) => {
      seedCounts.get(team.id)![seedIndex] += 1;
    });
  }

  const bounds = calculateQualificationBounds(teams, matches, predictions);
  return new Map(activeTeams.map((team) => {
    const counts = seedCounts.get(team.id)!;
    const seedProbabilities = counts.map((count) => count / iterations);
    const possibleSeeds = counts.flatMap((count, index) => count > 0 ? [index + 1] : []);
    const teamBounds = bounds.get(team.id)!;
    const projection: TeamProjection = {
      teamId: team.id,
      playoffProbability: seedProbabilities.slice(0, PLAYOFF_SPOTS).reduce((sum, value) => sum + value, 0),
      seedProbabilities,
      bestSeed: possibleSeeds[0] ?? activeTeams.length,
      worstSeed: possibleSeeds.at(-1) ?? activeTeams.length,
      minimumWins: teamBounds.minimumWins,
      maximumWins: teamBounds.maximumWins,
      status: teamBounds.status,
    };
    return [team.id, projection];
  }));
}

export function calculatePlayoffOdds({
  teams,
  matches,
  predictions,
  exactLimit = 14,
  iterations = 1500,
}: {
  teams: CalculatorTeam[];
  matches: CalculatorMatch[];
  predictions: Predictions;
  exactLimit?: number;
  iterations?: number;
}): OddsResult {
  const activeTeams = teams.filter((team) => team.isActive);
  const openMatches = matches.filter((match) => !match.winnerId && !predictions[match.id] && !match.isForfeit);
  if (openMatches.length > exactLimit) {
    return {
      projections: simulatePlayoffOdds({ teams, matches, predictions, iterations }),
      method: "simulation",
      scenarioCount: iterations,
    };
  }

  const baseline = standingsFor(teams, matches, predictions);
  const baselineById = new Map(baseline.map((team) => [team.id, team]));
  const probabilityContext = buildProbabilityContext(teams, matches, predictions, baseline);
  const averages = averageWinningDifferentials(teams, applyPredictions(matches, predictions));
  const seedWeights = new Map(activeTeams.map((team) => [team.id, Array(activeTeams.length).fill(0) as number[]]));
  const branchPredictions: Predictions = { ...predictions };
  let totalWeight = 0;

  function visit(index: number, weight: number) {
    if (index === openMatches.length) {
      totalWeight += weight;
      standingsFor(teams, matches, branchPredictions).forEach((team, seedIndex) => {
        seedWeights.get(team.id)![seedIndex] += weight;
      });
      return;
    }
    const match = openMatches[index];
    const firstOdds = probabilityFor(
      baselineById.get(match.coach1SeasonId),
      baselineById.get(match.coach2SeasonId),
      probabilityContext,
    );
    branchPredictions[match.id] = {
      winnerId: match.coach1SeasonId,
      differential: averages.get(match.coach1SeasonId) ?? 3,
    };
    visit(index + 1, weight * firstOdds);
    branchPredictions[match.id] = {
      winnerId: match.coach2SeasonId,
      differential: averages.get(match.coach2SeasonId) ?? 3,
    };
    visit(index + 1, weight * (1 - firstOdds));
    delete branchPredictions[match.id];
  }

  visit(0, 1);
  const bounds = calculateQualificationBounds(teams, matches, predictions);
  const projections = new Map(activeTeams.map((team) => {
    const weights = seedWeights.get(team.id)!;
    const seedProbabilities = weights.map((weight) => totalWeight ? weight / totalWeight : 0);
    const possibleSeeds = weights.flatMap((weight, index) => weight > 1e-10 ? [index + 1] : []);
    const teamBounds = bounds.get(team.id)!;
    return [team.id, {
      teamId: team.id,
      playoffProbability: seedProbabilities.slice(0, PLAYOFF_SPOTS).reduce((sum, value) => sum + value, 0),
      seedProbabilities,
      bestSeed: possibleSeeds[0] ?? activeTeams.length,
      worstSeed: possibleSeeds.at(-1) ?? activeTeams.length,
      minimumWins: teamBounds.minimumWins,
      maximumWins: teamBounds.maximumWins,
      status: teamBounds.status,
    } satisfies TeamProjection];
  }));
  return { projections, method: "exact", scenarioCount: 2 ** openMatches.length };
}

export function calculateMatchLeverage({
  teamId,
  teams,
  matches,
  predictions,
}: {
  teamId: number;
  teams: CalculatorTeam[];
  matches: CalculatorMatch[];
  predictions: Predictions;
}) {
  const averages = averageWinningDifferentials(teams, applyPredictions(matches, predictions));
  const openMatches = matches.filter((match) => !match.winnerId && !predictions[match.id] && !match.isForfeit);
  if (!openMatches.length) return [];

  const baseline = standingsFor(teams, matches, predictions);
  const baselineById = new Map(baseline.map((team) => [team.id, team]));
  const probabilityContext = buildProbabilityContext(teams, matches, predictions, baseline);
  const random = seededRandom(hashScenario(predictions) + teamId * 131 + openMatches.length * 17);
  const iterations = 1200;
  const counts = openMatches.map(() => ({ first: 0, firstQualified: 0, second: 0, secondQualified: 0 }));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const simulated: Predictions = { ...predictions };
    const firstWon: boolean[] = [];
    openMatches.forEach((match, index) => {
      const firstWins = random() < probabilityFor(
        baselineById.get(match.coach1SeasonId),
        baselineById.get(match.coach2SeasonId),
        probabilityContext,
      );
      firstWon[index] = firstWins;
      const winnerId = firstWins ? match.coach1SeasonId : match.coach2SeasonId;
      const average = averages.get(winnerId) ?? 3;
      simulated[match.id] = {
        winnerId,
        differential: Math.max(1, Math.min(6, average + Math.floor(random() * 3) - 1)),
      };
    });
    const qualified = standingsFor(teams, matches, simulated).findIndex((team) => team.id === teamId) < PLAYOFF_SPOTS;
    firstWon.forEach((won, index) => {
      const count = counts[index];
      if (won) {
        count.first += 1;
        if (qualified) count.firstQualified += 1;
      } else {
        count.second += 1;
        if (qualified) count.secondQualified += 1;
      }
    });
  }

  return openMatches.map((match, index): MatchLeverage => {
    const count = counts[index];
    const firstTeamOdds = count.first ? count.firstQualified / count.first : 0;
    const secondTeamOdds = count.second ? count.secondQualified / count.second : 0;
    return { matchId: match.id, firstTeamOdds, secondTeamOdds, swing: Math.abs(firstTeamOdds - secondTeamOdds) };
  }).sort((left, right) => right.swing - left.swing);
}

export function inspectDataQuality(teams: CalculatorTeam[], matches: CalculatorMatch[]) {
  const warnings: string[] = [];
  const activeTeams = teams.filter((team) => team.isActive);
  if (activeTeams.length < PLAYOFF_SPOTS) warnings.push(`Only ${activeTeams.length} active teams are available for eight playoff spots.`);
  if (matches.length === 0) warnings.push("No regular-season match rows are available.");
  const scheduledCounts = new Map(activeTeams.map((team) => [team.id, 0]));
  for (const match of matches) {
    if (scheduledCounts.has(match.coach1SeasonId)) scheduledCounts.set(match.coach1SeasonId, scheduledCounts.get(match.coach1SeasonId)! + 1);
    if (scheduledCounts.has(match.coach2SeasonId)) scheduledCounts.set(match.coach2SeasonId, scheduledCounts.get(match.coach2SeasonId)! + 1);
    if (match.winnerId && !match.isForfeit && !match.coach1Differential && !match.coach2Differential) warnings.push(`Week ${match.week} match #${match.id} has a winner but no differential.`);
  }
  const counts = [...scheduledCounts.values()];
  if (counts.length && Math.max(...counts) - Math.min(...counts) > 1) warnings.push("Teams do not have an equal number of scheduled matches.");
  const seen = new Set<string>();
  for (const match of matches) {
    const pair = [match.coach1SeasonId, match.coach2SeasonId].sort((a, b) => a - b).join("-");
    const key = `${match.week}:${pair}`;
    if (seen.has(key)) warnings.push(`Week ${match.week} contains a duplicate matchup.`);
    seen.add(key);
  }
  for (const team of teams.filter((candidate) => !candidate.isActive && candidate.replacedById)) {
    if (!activeTeams.some((candidate) => candidate.id === team.replacedById)) warnings.push(`${team.teamName} points to an unresolved replacement team.`);
  }
  return [...new Set(warnings)];
}

export function explainRanking(higher: Standing, lower: Standing) {
  if (higher.wins !== lower.wins) return `${higher.teamName} leads in wins, ${higher.wins} to ${lower.wins}.`;
  if (higher.differential !== lower.differential) {
    const format = (value: number) => `${value > 0 ? "+" : ""}${value}`;
    return `Wins are tied. ${higher.teamName} leads on differential, ${format(higher.differential)} to ${format(lower.differential)}.`;
  }
  if (higher.losses !== lower.losses) return `Wins and differential are tied. ${higher.teamName} has fewer losses.`;
  return `Wins, differential, and losses are tied; head-to-head and then strength of schedule determine this order.`;
}
