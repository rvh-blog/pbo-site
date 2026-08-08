"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CalculatorMatch,
  CalculatorTeam,
  MatchLeverage,
  Predictions,
  TeamProjection,
} from "./playoff-calculator-engine";
import type { MatrixCell, WorkerRequest, WorkerResponse } from "./playoff-calculator.worker";

export type CalculationTiming = {
  task: WorkerRequest["task"];
  durationMs: number;
  cacheHit: boolean;
};

export function usePlayoffWorker({
  teams,
  matches,
  predictions,
  teamId,
  analysisEnabled,
  primaryMatchId,
}: {
  teams: CalculatorTeam[];
  matches: CalculatorMatch[];
  predictions: Predictions;
  teamId: number | null;
  analysisEnabled: boolean;
  primaryMatchId?: number;
}) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const latestByTaskRef = useRef<Record<WorkerRequest["task"], number>>({ odds: 0, leverage: 0, matrix: 0 });
  const latestInputsRef = useRef({ teams, matches, predictions, teamId, primaryMatchId });
  latestInputsRef.current = { teams, matches, predictions, teamId, primaryMatchId };
  const [odds, setOdds] = useState<{ method: "exact" | "simulation"; scenarioCount: number; projections: Map<number, TeamProjection> } | null>(null);
  const [leverage, setLeverage] = useState<MatchLeverage[]>([]);
  const [matrix, setMatrix] = useState<MatrixCell[]>([]);
  const [timings, setTimings] = useState<CalculationTiming[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Set<WorkerRequest["task"]>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./playoff-calculator.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (latestByTaskRef.current[response.task] !== response.requestId) return;
      setPendingTasks((current) => { const next = new Set(current); next.delete(response.task); return next; });
      setTimings((current) => [{ task: response.task, durationMs: response.durationMs, cacheHit: response.cacheHit }, ...current.filter((timing) => timing.task !== response.task)].slice(0, 3));
      if (response.error) { setError(response.error); return; }
      setError(null);
      if (response.odds) setOdds({ ...response.odds, projections: new Map(response.odds.projections) });
      if (response.leverage) {
        setLeverage(response.leverage);
        const inputs = latestInputsRef.current;
        const secondMatchId = response.leverage.find((entry) => entry.matchId !== inputs.primaryMatchId)?.matchId;
        if (inputs.teamId && inputs.primaryMatchId && secondMatchId) {
          const requestId = ++requestIdRef.current;
          latestByTaskRef.current.matrix = requestId;
          setPendingTasks((current) => new Set(current).add("matrix"));
          worker.postMessage({ requestId, task: "matrix", teams: inputs.teams, matches: inputs.matches, predictions: inputs.predictions, teamId: inputs.teamId, matrixMatchIds: [inputs.primaryMatchId, secondMatchId] } satisfies WorkerRequest);
        }
      }
      if (response.matrix) setMatrix(response.matrix);
    };
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  function schedule(task: WorkerRequest["task"], delay: number, extra: Partial<WorkerRequest> = {}) {
    return window.setTimeout(() => {
      const requestId = ++requestIdRef.current;
      latestByTaskRef.current[task] = requestId;
      setPendingTasks((current) => new Set(current).add(task));
      workerRef.current?.postMessage({ requestId, task, teams, matches, predictions, ...extra } satisfies WorkerRequest);
    }, delay);
  }

  useEffect(() => {
    const timeout = schedule("odds", 160);
    return () => window.clearTimeout(timeout);
    // schedule is intentionally recreated with the serialized analysis inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, predictions, teams]);

  useEffect(() => {
    if (!analysisEnabled || !teamId) return;
    const timeout = schedule("leverage", 220, { teamId });
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisEnabled, matches, predictions, teamId, teams]);

  return { odds, leverage, matrix, timings, pendingTasks, error };
}
