/// <reference lib="webworker" />

import {
  averageWinningDifferentials,
  calculateMatchLeverage,
  calculatePlayoffOdds,
  type CalculatorMatch,
  type CalculatorTeam,
  type PredictionModel,
  type Predictions,
  type TeamProjection,
} from "./playoff-calculator-engine";

export type MatrixCell = {
  firstWinnerId: number;
  secondWinnerId: number;
  odds: number;
  bestSeed: number;
  worstSeed: number;
};

export type WorkerRequest = {
  requestId: number;
  task: "odds" | "leverage" | "matrix";
  teams: CalculatorTeam[];
  matches: CalculatorMatch[];
  predictions: Predictions;
  model: PredictionModel;
  teamId?: number;
  matrixMatchIds?: [number, number];
};

export type WorkerResponse = {
  requestId: number;
  task: WorkerRequest["task"];
  durationMs: number;
  cacheHit: boolean;
  error?: string;
  odds?: {
    method: "exact" | "simulation";
    scenarioCount: number;
    projections: Array<[number, TeamProjection]>;
  };
  leverage?: ReturnType<typeof calculateMatchLeverage>;
  matrix?: MatrixCell[];
};

const responseCache = new Map<string, Omit<WorkerResponse, "requestId" | "durationMs" | "cacheHit">>();

function cacheKey(request: WorkerRequest) {
  return JSON.stringify({
    task: request.task,
    teamId: request.teamId,
    matrixMatchIds: request.matrixMatchIds,
    model: request.model,
    teams: request.teams.map((team) => [team.id, team.isActive, team.replacedById, team.eloRating]),
    matches: request.matches.map((match) => [match.id, match.winnerId, match.coach1Differential, match.coach2Differential, match.isForfeit]),
    predictions: Object.entries(request.predictions).sort(([left], [right]) => Number(left) - Number(right)),
  });
}

function remember(key: string, value: Omit<WorkerResponse, "requestId" | "durationMs" | "cacheHit">) {
  responseCache.set(key, value);
  if (responseCache.size > 64) responseCache.delete(responseCache.keys().next().value!);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const startedAt = performance.now();
  const key = cacheKey(request);
  const cached = responseCache.get(key);
  if (cached) {
    self.postMessage({ ...cached, requestId: request.requestId, durationMs: performance.now() - startedAt, cacheHit: true } satisfies WorkerResponse);
    return;
  }

  try {
    let result: Omit<WorkerResponse, "requestId" | "durationMs" | "cacheHit">;
    if (request.task === "odds") {
      const odds = calculatePlayoffOdds({ teams: request.teams, matches: request.matches, predictions: request.predictions, model: request.model });
      result = { task: request.task, odds: { method: odds.method, scenarioCount: odds.scenarioCount, projections: [...odds.projections] } };
    } else if (request.task === "leverage") {
      result = { task: request.task, leverage: request.teamId ? calculateMatchLeverage({ teamId: request.teamId, teams: request.teams, matches: request.matches, predictions: request.predictions, model: request.model }) : [] };
    } else {
      const [firstId, secondId] = request.matrixMatchIds ?? [];
      const first = request.matches.find((match) => match.id === firstId);
      const second = request.matches.find((match) => match.id === secondId);
      const averages = averageWinningDifferentials(request.teams, request.matches);
      const matrix: MatrixCell[] = [];
      if (first && second && request.teamId) {
        for (const firstWinnerId of [first.coach1SeasonId, first.coach2SeasonId]) {
          for (const secondWinnerId of [second.coach1SeasonId, second.coach2SeasonId]) {
            const predictions = {
              ...request.predictions,
              [first.id]: { winnerId: firstWinnerId, differential: averages.get(firstWinnerId) ?? 3 },
              [second.id]: { winnerId: secondWinnerId, differential: averages.get(secondWinnerId) ?? 3 },
            };
            const odds = calculatePlayoffOdds({ teams: request.teams, matches: request.matches, predictions, model: request.model, iterations: 300 });
            const projection = odds.projections.get(request.teamId);
            matrix.push({ firstWinnerId, secondWinnerId, odds: projection?.playoffProbability ?? 0, bestSeed: projection?.bestSeed ?? 0, worstSeed: projection?.worstSeed ?? 0 });
          }
        }
      }
      result = { task: request.task, matrix };
    }
    remember(key, result);
    self.postMessage({ ...result, requestId: request.requestId, durationMs: performance.now() - startedAt, cacheHit: false } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({ requestId: request.requestId, task: request.task, durationMs: performance.now() - startedAt, cacheHit: false, error: error instanceof Error ? error.message : "Unknown worker error" } satisfies WorkerResponse);
  }
};

export {};
