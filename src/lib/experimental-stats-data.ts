import "server-only";

import { and, desc, eq, gt, gte, inArray, isNotNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { battleEvents, matches } from "@/lib/schema";
import type { ExperimentalStatsDataset } from "@/app/experimental-stats/experimental-stats-client";
import { createExperimentalDemoDataset } from "@/lib/experimental-stats-demo";
import { inferMegaItemForRosterPokemon } from "@/lib/mega-item-inference";

export type ExperimentalModuleSlug = "pokemon" | "coaches" | "compare" | "insights" | "trends" | "leaderboards" | "replays" | "battle-visualizer" | "rare-events" | "signature-stats" | "team-stats" | "top-plays" | "visuals" | "glossary";

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
type EventQueryRow = {
  matchId: number;
  turn: number;
  sequence: number;
  eventType: string;
  count?: number | null;
  player?: "p1" | "p2" | null;
  actorNickname?: string | null;
  targetPlayer?: "p1" | "p2" | null;
  targetNickname?: string | null;
  pokemonName?: string | null;
  moveName?: string | null;
  itemName?: string | null;
  abilityName?: string | null;
  statusName?: string | null;
  fieldName?: string | null;
  value?: number | null;
  source?: string | null;
  rawLine?: string | null;
  metadata?: Record<string, unknown> | null;
};

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const positiveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const nonZeroInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed !== 0 ? parsed : fallback;
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
    coachId: coachValue === "all" || !coachValue ? "all" : nonZeroInteger(coachValue, 0) || "all",
    pokemonId: pokemonValue === "all" || !pokemonValue ? "all" : nonZeroInteger(pokemonValue, 0) || "all",
    move: first(searchParams.move) || "all",
    item: first(searchParams.item) || "all",
    minimumAppearances: Math.max(3, positiveNumber(first(searchParams.min), 3)),
    result: resultValue === "wins" || resultValue === "losses" ? resultValue : "all",
    stage: stageValue === "regular" || stageValue === "playoffs" ? stageValue : "all",
    includeForfeits: first(searchParams.forfeits) === "1",
  };
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

type RosterTransactionRow = {
  id: number;
  seasonId: number;
  type: string;
  week: number;
  seasonCoachId: number;
  tradingPartnerSeasonCoachId: number | null;
  pokemonIn: number[] | null;
  pokemonOut: number[] | null;
};

function buildRosterEligibility(seasonTeamRows: Array<{ id: number; division: { seasonId: number }; rosters: Array<{ pokemonId: number; acquiredWeek: number | null }> }>, transactionRows: RosterTransactionRow[]) {
  const windows: Array<{ seasonCoachId: number; seasonId: number; pokemonId: number; startWeek: number; endWeek: number | null }> = [];
  seasonTeamRows.forEach((team) => {
    const teamTransactions = transactionRows
      .filter((transaction) => transaction.seasonId === team.division.seasonId && (
        transaction.seasonCoachId === team.id ||
        (transaction.type === "P2P_TRADE" && transaction.tradingPartnerSeasonCoachId === team.id)
      ))
      .map((transaction) => transaction.tradingPartnerSeasonCoachId === team.id && transaction.seasonCoachId !== team.id
        ? { ...transaction, pokemonIn: transaction.pokemonOut, pokemonOut: transaction.pokemonIn }
        : transaction)
      .sort((a, b) => a.week - b.week || a.id - b.id);
    const starts = new Map<number, Set<number>>();
    const addStart = (pokemonId: number, startWeek: number) => {
      const startWeeks = starts.get(pokemonId) ?? new Set<number>();
      startWeeks.add(startWeek);
      starts.set(pokemonId, startWeeks);
    };
    team.rosters.forEach((roster) => addStart(roster.pokemonId, roster.acquiredWeek ?? 1));
    teamTransactions.forEach((transaction) => transaction.pokemonIn?.forEach((pokemonId) => addStart(pokemonId, transaction.week)));
    teamTransactions.forEach((transaction) => transaction.pokemonOut?.forEach((pokemonId) => {
      if (!starts.has(pokemonId)) addStart(pokemonId, 1);
    }));
    starts.forEach((startWeeks, pokemonId) => startWeeks.forEach((startWeek) => {
      const drop = teamTransactions.find((transaction) => transaction.week >= startWeek && transaction.pokemonOut?.includes(pokemonId));
      windows.push({ seasonCoachId: team.id, seasonId: team.division.seasonId, pokemonId, startWeek, endWeek: drop?.week ?? null });
    }));
  });
  return windows;
}

export async function getExperimentalStatsPageData(module: ExperimentalModuleSlug, searchParams: SearchParams) {
  const [seasons, divisions, seasonTeamRows, transactionRows] = await Promise.all([
    db.query.seasons.findMany({ columns: { id: true, name: true, seasonNumber: true, isCurrent: true } }),
    db.query.divisions.findMany({ columns: { id: true, seasonId: true, name: true, displayOrder: true } }),
    db.query.seasonCoaches.findMany({
      columns: { id: true, coachId: true, divisionId: true, teamName: true, isActive: true, replacedById: true },
      with: {
        coach: { columns: { name: true } },
        division: { columns: { seasonId: true, name: true }, with: { season: { columns: { name: true } } } },
        rosters: { columns: { pokemonId: true, acquiredWeek: true } },
      },
    }),
    db.query.transactions.findMany({
      columns: { id: true, seasonId: true, type: true, week: true, seasonCoachId: true, tradingPartnerSeasonCoachId: true, pokemonIn: true, pokemonOut: true },
    }),
  ]);
  const rosterEligibility = buildRosterEligibility(seasonTeamRows, transactionRows);
  const currentSeasonId = seasons.find((season) => season.isCurrent)?.id ?? null;
  const filters = parseExperimentalFilters(searchParams, currentSeasonId);
  const requestedMatchId = positiveNumber(first(searchParams.match), 0);
  if (module === "coaches" && first(searchParams.forfeits) === undefined) filters.includeForfeits = true;
  if (!first(searchParams.season) && (module === "pokemon" || module === "coaches" || module === "insights" || module === "signature-stats" || module === "team-stats" || module === "top-plays" || module === "visuals")) {
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
        seasonTeams: seasonTeamRows.map((team) => ({ seasonCoachId: team.id, coachId: team.coachId, coachName: team.coach?.name ?? "Unknown Coach", teamName: team.teamName, seasonId: team.division.seasonId, seasonName: team.division.season?.name ?? `Season ${team.division.seasonId}`, divisionId: team.divisionId, divisionName: team.division.name, isActive: Boolean(team.isActive), replacedById: team.replacedById ?? null })),
        matches: [],
      } satisfies ExperimentalStatsDataset,
    };
  }

  const conditions: SQL[] = [
    isNotNull(matches.winnerId),
    or(eq(matches.winnerId, matches.coach1SeasonId), eq(matches.winnerId, matches.coach2SeasonId))!,
  ];
  if (module !== "coaches") conditions.push(isNotNull(matches.replayUrl), ne(matches.replayUrl, ""));
  if (filters.seasonId !== "all") conditions.push(eq(matches.seasonId, filters.seasonId));
  if (filters.divisionId !== "all") conditions.push(eq(matches.divisionId, filters.divisionId));
  conditions.push(gte(matches.week, filters.weekStart), lte(matches.week, filters.weekEnd));
  if (filters.stage === "regular") conditions.push(lte(matches.week, 100));
  if (filters.stage === "playoffs") conditions.push(gt(matches.week, 100));
  if (!filters.includeForfeits) conditions.push(eq(matches.isForfeit, false));

  // Full timelines are large, so only send them to reports that draw or inspect
  // them. Other modules still receive a compact final-turn value.
  const includeTimeline = module === "insights" || module === "battle-visualizer" || module === "rare-events" || module === "top-plays" || module === "visuals";
  const includeKeyEvents = includeTimeline || module === "leaderboards" || module === "team-stats";
  const includeProtocolEvents = module === "battle-visualizer" || module === "rare-events" || module === "team-stats" || module === "visuals";
  const includeTeamEventSummary = module === "team-stats" || module === "visuals";
  if (demoMode) {
    return {
      filters,
      dataset: createExperimentalDemoDataset({
        seasons: seasons.map(({ id, name, seasonNumber }) => ({ id, name, seasonNumber })).sort((a, b) => b.seasonNumber - a.seasonNumber),
        divisions: divisions.map(({ id, seasonId, name, displayOrder }) => ({ id, seasonId, name, displayOrder: displayOrder ?? 0 })),
        currentSeasonId,
        filters,
        includeTimeline: includeTimeline || module === "coaches" || module === "team-stats",
      }),
    };
  }
  const availableWeekRows = await db.query.matches.findMany({
    where: and(
      ...(module === "coaches" ? [] : [isNotNull(matches.replayUrl), ne(matches.replayUrl, "")]),
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
      ...(includeTimeline ? { turnSnapshots: true } : {}),
      ...(includeKeyEvents ? { keyEvents: true } : {}),
      zoroarkInvolved: true,
      needsReview: true,
      reviewNotes: true,
    },
    with: {
      coach1: { columns: { id: true, coachId: true, teamName: true, isActive: true, replacedById: true }, with: { coach: { columns: { id: true, name: true } } } },
      coach2: { columns: { id: true, coachId: true, teamName: true, isActive: true, replacedById: true }, with: { coach: { columns: { id: true, name: true } } } },
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

  const selectedEventMatch = replayMatches.find((match) => match.id === requestedMatchId) ?? replayMatches[0];
  const eventMatchIds = module === "battle-visualizer"
    ? selectedEventMatch ? [selectedEventMatch.id] : []
    : replayMatches.map((match) => match.id);
  const totalTurnRows = module === "coaches" && eventMatchIds.length
    ? await db.select({
      matchId: battleEvents.matchId,
      totalTurns: sql<number>`max(${battleEvents.turn})`,
    }).from(battleEvents).where(inArray(battleEvents.matchId, eventMatchIds)).groupBy(battleEvents.matchId).catch(() => [])
    : [];
  const totalTurnsByMatch = new Map(totalTurnRows.map((row) => [row.matchId, Number(row.totalTurns)]));
  const eventRows: EventQueryRow[] = includeProtocolEvents && eventMatchIds.length ? await (module === "rare-events"
    ? (async () => {
      const [density, rareCounts] = await Promise.all([
        db.select({ matchId: battleEvents.matchId, turn: battleEvents.turn, count: sql<number>`count(*)` }).from(battleEvents).where(inArray(battleEvents.matchId, eventMatchIds)).groupBy(battleEvents.matchId, battleEvents.turn).catch(() => []),
        db.select({ matchId: battleEvents.matchId, eventType: battleEvents.eventType, count: sql<number>`count(*)` }).from(battleEvents).where(and(inArray(battleEvents.matchId, eventMatchIds), or(eq(battleEvents.eventType, "switch"), eq(battleEvents.eventType, "drag"), eq(battleEvents.eventType, "terastallize")))).groupBy(battleEvents.matchId, battleEvents.eventType).catch(() => []),
      ]);
      return [
        ...density.map((row) => ({ matchId: row.matchId, turn: row.turn, sequence: row.turn, eventType: "__turn_density", value: Number(row.count) })),
        ...rareCounts.map((row) => ({ matchId: row.matchId, turn: 0, sequence: 0, eventType: row.eventType === "terastallize" ? "__tera_count" : "__switch_count", value: Number(row.count) })),
      ];
    })()
    : includeTeamEventSummary
      ? db.select({
        matchId: battleEvents.matchId,
        turn: sql<number>`0`,
        sequence: sql<number>`0`,
        eventType: battleEvents.eventType,
        player: battleEvents.player,
        count: sql<number>`count(*)`,
      }).from(battleEvents).where(and(
        inArray(battleEvents.matchId, eventMatchIds),
        or(eq(battleEvents.eventType, "switch"), eq(battleEvents.eventType, "drag"), eq(battleEvents.eventType, "terastallize")),
      )).groupBy(battleEvents.matchId, battleEvents.eventType, battleEvents.player).catch(() => [])
      : db.select({
      matchId: battleEvents.matchId,
      turn: battleEvents.turn,
      sequence: battleEvents.sequence,
      eventType: battleEvents.eventType,
      player: battleEvents.player,
      actorNickname: battleEvents.actorNickname,
      targetPlayer: battleEvents.targetPlayer,
      targetNickname: battleEvents.targetNickname,
      pokemonName: battleEvents.pokemonName,
      moveName: battleEvents.moveName,
      itemName: battleEvents.itemName,
      abilityName: battleEvents.abilityName,
      statusName: battleEvents.statusName,
      fieldName: battleEvents.fieldName,
      value: battleEvents.value,
      source: battleEvents.source,
      rawLine: battleEvents.rawLine,
      metadata: battleEvents.metadata,
    }).from(battleEvents).where(inArray(battleEvents.matchId, eventMatchIds)).orderBy(battleEvents.matchId, battleEvents.sequence).catch(() => [])) : [];
  const eventsByMatch = new Map<number, typeof eventRows>();
  for (const event of eventRows) {
    const rows = eventsByMatch.get(event.matchId) ?? [];
    rows.push(event);
    eventsByMatch.set(event.matchId, rows);
  }

  const seasonNames = new Map(seasons.map((season) => [season.id, season.name]));
  const divisionNames = new Map(divisions.map((division) => [division.id, division.name]));
  const dataset: ExperimentalStatsDataset = {
    currentSeasonId,
    selectedMatchId: module === "battle-visualizer" ? selectedEventMatch?.id ?? null : null,
    highestAvailableWeek,
    highestAvailableWeekBySeason,
    seasons: seasons.map(({ id, name, seasonNumber }) => ({ id, name, seasonNumber })).sort((a, b) => b.seasonNumber - a.seasonNumber),
    divisions: divisions.map(({ id, seasonId, name, displayOrder }) => ({ id, seasonId, name, displayOrder: displayOrder ?? 0 })).sort((a, b) => a.seasonId - b.seasonId || a.displayOrder - b.displayOrder),
    rosterEligibility,
    seasonTeams: seasonTeamRows.map((team) => ({ seasonCoachId: team.id, coachId: team.coachId, coachName: team.coach?.name ?? "Unknown Coach", teamName: team.teamName, seasonId: team.division.seasonId, seasonName: team.division.season?.name ?? `Season ${team.division.seasonId}`, divisionId: team.divisionId, divisionName: team.division.name, isActive: Boolean(team.isActive), replacedById: team.replacedById ?? null })),
    matches: replayMatches.map((match) => {
      const timelineJson = "turnSnapshots" in match && typeof match.turnSnapshots === "string"
        ? match.turnSnapshots
        : null;
      const keyEventsJson = "keyEvents" in match && typeof match.keyEvents === "string"
        ? match.keyEvents
        : null;
      const parsedSnapshots = includeTimeline
        ? parseJsonArray<TurnSnapshot>(timelineJson).sort((a, b) => a.turn - b.turn)
        : [];
      const snapshots = includeTimeline ? parsedSnapshots : [];
      const events = includeKeyEvents ? parseJsonArray<KeyEvent>(keyEventsJson) : [];
      const winEvent = events.find((event) => event.type === "win");
      const winnerIsCoach1 = match.winnerId === match.coach1.id;
      const derivedMegaReviewNotes = match.matchPokemon.flatMap((entry) => {
        if (!entry.pokemon) return [];
        const inference = inferMegaItemForRosterPokemon({
          pokemonId: entry.pokemonId,
          name: entry.pokemon.name,
          displayName: entry.pokemon.displayName,
        }, entry.revealedItems ?? []);
        return inference.conflict ? [inference.conflict] : [];
      });
      const mergedReviewNotes = [
        match.reviewNotes?.trim() || "",
        ...derivedMegaReviewNotes,
      ].filter(Boolean).filter((note, index, notes) => notes.indexOf(note) === index).join("\n");
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
        needsReview: Boolean(match.needsReview) || derivedMegaReviewNotes.length > 0,
        reviewNotes: mergedReviewNotes || null,
        p1IsCoach1: winEvent?.player ? (winEvent.player === "p1") === winnerIsCoach1 : null,
        totalTurns: parsedSnapshots.length
          ? parsedSnapshots.reduce((maximum, snapshot) => Math.max(maximum, snapshot.turn), 0)
          : totalTurnsByMatch.get(match.id) ?? null,
        turnSnapshots: snapshots,
        keyEvents: events,
        battleEvents: eventsByMatch.get(match.id)?.map((event) => module === "rare-events"
          ? {
            turn: event.turn,
            sequence: event.sequence,
            eventType: event.eventType,
            player: null,
            actorNickname: null,
            targetPlayer: null,
            targetNickname: null,
            pokemonName: null,
            moveName: null,
            itemName: null,
            abilityName: null,
            statusName: null,
            fieldName: null,
            value: event.value ?? null,
            count: event.count ?? null,
            source: null,
            rawLine: "",
            metadata: null,
          }
          : {
            turn: event.turn,
            sequence: event.sequence,
            eventType: event.eventType,
            player: event.player ?? null,
            actorNickname: event.actorNickname ?? null,
            targetPlayer: event.targetPlayer ?? null,
            targetNickname: event.targetNickname ?? null,
            pokemonName: event.pokemonName ?? null,
            moveName: event.moveName ?? null,
            itemName: event.itemName ?? null,
            abilityName: event.abilityName ?? null,
            statusName: event.statusName ?? null,
            fieldName: event.fieldName ?? null,
            value: event.value ?? null,
            count: event.count ?? null,
            source: event.source ?? null,
            rawLine: event.rawLine ?? "",
            metadata: event.metadata ?? null,
          }) ?? [],
        coach1: { seasonCoachId: match.coach1.id, coachId: match.coach1.coachId, coachName: match.coach1.coach?.name ?? "Unknown Coach", teamName: match.coach1.teamName, isActive: Boolean(match.coach1.isActive), replacedById: match.coach1.replacedById ?? null },
        coach2: { seasonCoachId: match.coach2.id, coachId: match.coach2.coachId, coachName: match.coach2.coach?.name ?? "Unknown Coach", teamName: match.coach2.teamName, isActive: Boolean(match.coach2.isActive), replacedById: match.coach2.replacedById ?? null },
        pokemon: match.matchPokemon.flatMap((entry) => entry.pokemon ? (() => {
          const storedReveals = entry.revealedItems ?? [];
          const megaInference = inferMegaItemForRosterPokemon({
            pokemonId: entry.pokemonId,
            name: entry.pokemon.name,
            displayName: entry.pokemon.displayName,
          }, storedReveals);
          return [{
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
          revealedItems: megaInference.revealedItems,
          itemDataRecorded: entry.revealedItems !== null || megaInference.assumed,
          itemDataInferred: megaInference.assumed,
          }];
        })() : []),
      };
    }),
  };
  return { filters, dataset };
}
