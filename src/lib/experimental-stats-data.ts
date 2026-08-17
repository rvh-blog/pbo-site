import "server-only";

import { and, desc, eq, gt, gte, isNotNull, lte, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { matches } from "@/lib/schema";
import type { ExperimentalStatsDataset } from "@/app/experimental-stats/experimental-stats-client";
import { createExperimentalDemoDataset } from "@/lib/experimental-stats-demo";

export type ExperimentalModuleSlug = "pokemon" | "coaches" | "compare" | "trends" | "leaderboards" | "replays" | "battle-visualizer" | "rare-events" | "glossary";

export interface ExperimentalUrlFilters {
  seasonId: number | "all";
  divisionId: number | "all";
  weekStart: number;
  weekEnd: number;
  coachId: number | "all";
  pokemonId: number | "all";
  move: string | "all";
  item: string | "all";
  minimumAppearances: number;
  result: "all" | "wins" | "losses";
  stage: "all" | "regular" | "playoffs";
  includeForfeits: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;
type TurnSnapshot = { turn: number; p1TotalHp: number; p2TotalHp: number };
type KeyEvent = { turn: number; type: string; player?: "p1" | "p2"; pokemon?: string; cause?: string; killer?: string; move?: string };

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const positiveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function parseExperimentalFilters(searchParams: SearchParams, currentSeasonId: number | null): ExperimentalUrlFilters {
  const seasonValue = first(searchParams.season);
  const divisionValue = first(searchParams.division);
  const coachValue = first(searchParams.coach);
  const pokemonValue = first(searchParams.pokemon);
  const resultValue = first(searchParams.result);
  const stageValue = first(searchParams.stage);
  return {
    seasonId: seasonValue === "all" ? "all" : positiveNumber(seasonValue, currentSeasonId ?? 0) || "all",
    divisionId: divisionValue === "all" || !divisionValue ? "all" : positiveNumber(divisionValue, 0) || "all",
    weekStart: positiveNumber(first(searchParams.weekStart), 1),
    weekEnd: positiveNumber(first(searchParams.weekEnd), 999),
    coachId: coachValue === "all" || !coachValue ? "all" : positiveNumber(coachValue, 0) || "all",
    pokemonId: pokemonValue === "all" || !pokemonValue ? "all" : positiveNumber(pokemonValue, 0) || "all",
    move: first(searchParams.move) || "all",
    item: first(searchParams.item) || "all",
    minimumAppearances: positiveNumber(first(searchParams.min), 3),
    result: resultValue === "wins" || resultValue === "losses" ? resultValue : "all",
    stage: stageValue === "regular" || stageValue === "playoffs" ? stageValue : "all",
    includeForfeits: first(searchParams.forfeits) === "1",
  };
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export async function getExperimentalStatsPageData(module: ExperimentalModuleSlug, searchParams: SearchParams) {
  const [seasons, divisions] = await Promise.all([
    db.query.seasons.findMany({ columns: { id: true, name: true, seasonNumber: true, isCurrent: true } }),
    db.query.divisions.findMany({ columns: { id: true, seasonId: true, name: true, displayOrder: true } }),
  ]);
  const currentSeasonId = seasons.find((season) => season.isCurrent)?.id ?? null;
  const filters = parseExperimentalFilters(searchParams, currentSeasonId);
  if (!first(searchParams.season) && (module === "pokemon" || module === "coaches")) {
    filters.seasonId = "all";
  }
  const demoMode = first(searchParams.demo) === "1";

  if (module === "glossary") {
    return {
      filters,
      dataset: {
        isDemo: demoMode,
        currentSeasonId,
        highestAvailableWeek: 1,
        highestAvailableWeekBySeason: {},
        seasons: seasons.map(({ id, name, seasonNumber }) => ({ id, name, seasonNumber })).sort((a, b) => b.seasonNumber - a.seasonNumber),
        divisions: divisions.map(({ id, seasonId, name, displayOrder }) => ({ id, seasonId, name, displayOrder: displayOrder ?? 0 })),
        matches: [],
      } satisfies ExperimentalStatsDataset,
    };
  }

  const conditions: SQL[] = [
    isNotNull(matches.replayUrl),
    ne(matches.replayUrl, ""),
    isNotNull(matches.winnerId),
    or(eq(matches.winnerId, matches.coach1SeasonId), eq(matches.winnerId, matches.coach2SeasonId))!,
  ];
  if (filters.seasonId !== "all") conditions.push(eq(matches.seasonId, filters.seasonId));
  if (filters.divisionId !== "all") conditions.push(eq(matches.divisionId, filters.divisionId));
  conditions.push(gte(matches.week, filters.weekStart), lte(matches.week, filters.weekEnd));
  if (filters.stage === "regular") conditions.push(lte(matches.week, 100));
  if (filters.stage === "playoffs") conditions.push(gt(matches.week, 100));
  if (!filters.includeForfeits) conditions.push(eq(matches.isForfeit, false));

  const includeTimeline = module === "coaches" || module === "replays" || module === "battle-visualizer" || module === "rare-events";
  if (demoMode) {
    return {
      filters,
      dataset: createExperimentalDemoDataset({
        seasons: seasons.map(({ id, name, seasonNumber }) => ({ id, name, seasonNumber })).sort((a, b) => b.seasonNumber - a.seasonNumber),
        divisions: divisions.map(({ id, seasonId, name, displayOrder }) => ({ id, seasonId, name, displayOrder: displayOrder ?? 0 })),
        currentSeasonId,
        filters,
        includeTimeline,
      }),
    };
  }
  const availableWeekRows = await db.query.matches.findMany({
    where: and(
      isNotNull(matches.replayUrl),
      ne(matches.replayUrl, ""),
      isNotNull(matches.winnerId),
      or(eq(matches.winnerId, matches.coach1SeasonId), eq(matches.winnerId, matches.coach2SeasonId))!,
      ...(filters.includeForfeits ? [] : [eq(matches.isForfeit, false)]),
    ),
    columns: { seasonId: true, week: true },
  });
  const highestAvailableWeekBySeason: Record<number, number> = {};
  for (const row of availableWeekRows) {
    highestAvailableWeekBySeason[row.seasonId] = Math.max(highestAvailableWeekBySeason[row.seasonId] ?? 1, row.week);
  }
  const highestAvailableWeek = Math.max(1, ...availableWeekRows.map((row) => row.week));
  const replayMatches = await db.query.matches.findMany({
    where: and(...conditions),
    orderBy: [desc(matches.playedAt), desc(matches.id)],
    columns: {
      id: true,
      seasonId: true,
      divisionId: true,
      week: true,
      winnerId: true,
      isForfeit: true,
      playedAt: true,
      replayUrl: true,
      turnSnapshots: true,
      keyEvents: true,
      zoroarkInvolved: true,
    },
    with: {
      coach1: { columns: { id: true, coachId: true, teamName: true }, with: { coach: { columns: { id: true, name: true } } } },
      coach2: { columns: { id: true, coachId: true, teamName: true }, with: { coach: { columns: { id: true, name: true } } } },
      matchPokemon: {
        columns: {
          seasonCoachId: true,
          pokemonId: true,
          kills: true,
          deaths: true,
          damageDealt: true,
          damageDealtIndirect: true,
          damageTaken: true,
          damageTakenIndirect: true,
          turnsActive: true,
          hazardDamageTaken: true,
          setupMovesUsed: true,
          favorableCrits: true,
          favorableMisses: true,
          favorableFlinches: true,
          favorableParalysis: true,
          favorableFreezes: true,
          favorableBurns: true,
          favorableSleep: true,
          hpRestored: true,
          movesUsed: true,
          revealedItems: true,
        },
        with: { pokemon: { columns: { id: true, name: true, displayName: true, spriteUrl: true } } },
      },
    },
  });

  const seasonNames = new Map(seasons.map((season) => [season.id, season.name]));
  const divisionNames = new Map(divisions.map((division) => [division.id, division.name]));
  const dataset: ExperimentalStatsDataset = {
    currentSeasonId,
    highestAvailableWeek,
    highestAvailableWeekBySeason,
    seasons: seasons.map(({ id, name, seasonNumber }) => ({ id, name, seasonNumber })).sort((a, b) => b.seasonNumber - a.seasonNumber),
    divisions: divisions.map(({ id, seasonId, name, displayOrder }) => ({ id, seasonId, name, displayOrder: displayOrder ?? 0 })).sort((a, b) => a.seasonId - b.seasonId || a.displayOrder - b.displayOrder),
    matches: replayMatches.map((match) => {
      const snapshots = includeTimeline ? parseJsonArray<TurnSnapshot>(match.turnSnapshots).sort((a, b) => a.turn - b.turn) : [];
      const events = includeTimeline ? parseJsonArray<KeyEvent>(match.keyEvents) : [];
      const winEvent = events.find((event) => event.type === "win");
      const winnerIsCoach1 = match.winnerId === match.coach1.id;
      return {
        id: match.id,
        seasonId: match.seasonId,
        seasonName: seasonNames.get(match.seasonId) ?? `Season ${match.seasonId}`,
        divisionId: match.divisionId,
        divisionName: divisionNames.get(match.divisionId) ?? "Unknown Division",
        week: match.week,
        winnerId: match.winnerId,
        isForfeit: Boolean(match.isForfeit),
        playedAt: match.playedAt,
        replayUrl: match.replayUrl ?? "",
        zoroarkInvolved: Boolean(match.zoroarkInvolved),
        p1IsCoach1: winEvent?.player ? (winEvent.player === "p1") === winnerIsCoach1 : null,
        turnSnapshots: snapshots,
        keyEvents: events,
        coach1: { seasonCoachId: match.coach1.id, coachId: match.coach1.coachId, coachName: match.coach1.coach?.name ?? "Unknown Coach", teamName: match.coach1.teamName },
        coach2: { seasonCoachId: match.coach2.id, coachId: match.coach2.coachId, coachName: match.coach2.coach?.name ?? "Unknown Coach", teamName: match.coach2.teamName },
        pokemon: match.matchPokemon.flatMap((entry) => entry.pokemon ? [{
          seasonCoachId: entry.seasonCoachId,
          pokemonId: entry.pokemonId,
          pokemonName: entry.pokemon.displayName || entry.pokemon.name,
          spriteUrl: entry.pokemon.spriteUrl,
          kills: entry.kills ?? 0,
          deaths: entry.deaths ?? 0,
          damageDealt: entry.damageDealt,
          damageDealtIndirect: entry.damageDealtIndirect,
          damageTaken: entry.damageTaken,
          damageTakenIndirect: entry.damageTakenIndirect,
          turnsActive: entry.turnsActive,
          hazardDamageTaken: entry.hazardDamageTaken,
          setupMovesUsed: entry.setupMovesUsed,
          favorableCrits: entry.favorableCrits,
          favorableMisses: entry.favorableMisses,
          favorableFlinches: entry.favorableFlinches,
          favorableParalysis: entry.favorableParalysis,
          favorableFreezes: entry.favorableFreezes,
          favorableBurns: entry.favorableBurns,
          favorableSleep: entry.favorableSleep,
          hpRestored: entry.hpRestored,
          movesUsed: entry.movesUsed ?? {},
          moveDataRecorded: entry.movesUsed !== null,
          revealedItems: entry.revealedItems ?? [],
          itemDataRecorded: entry.revealedItems !== null,
        }] : []),
      };
    }),
  };
  return { filters, dataset };
}
