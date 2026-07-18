import Image from "next/image";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  matches,
  rosters,
  seasonCoaches,
  seasonPokemonPrices,
  seasons,
  transactions,
} from "@/lib/schema";
import { getTimeSyncedRoster, type TimeSyncTransaction } from "@/lib/roster-utils";
import { MatchedHeightGrid } from "@/components/matched-height-grid";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { FantasyPokemonOption } from "./fantasy-entry-client";
import { PokemonBoardClient, type PokemonBoardRow } from "./pokemon-board-client";
import { ScheduleBoardClient, type FantasyScheduleRow } from "./schedule-board-client";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import { getSession } from "@/lib/session";
import { formatPokemonDisplayName, shouldUseFriendlyMegaNamesForSeason } from "@/lib/pokemon-name-utils";
import { FantasyAbout } from "./fantasy-about";
import { getFantasyWeeklyStatsForWeeks } from "@/lib/fantasy-stats";

const FantasyEntryClient = nextDynamic(
  () => import("./fantasy-entry-client").then((module) => module.FantasyEntryClient),
  {
    loading: () => <div className="poke-card min-h-24 animate-pulse" />,
  }
);

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fantasy Scout",
};

const DIVISION_COLORS: Record<string, string> = {
  Infinity: "#E2A3C7",
  Infinty: "#E2A3C7",
  Stargazer: "#3b82f6",
  Sunset: "#fb923c",
  Crystal: "#c084fc",
  Neon: "#4ade80",
};

const MIN_FANTASY_SEASON_NUMBER = 11;
const FANTASY_BUDGET = 90;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type PokemonFantasyRow = {
  id: number;
  name: string;
  spriteUrl: string | null;
  types: string[];
  cost: number | null;
  rosteredTeams: Set<number>;
  teamNames: Set<string>;
  divisionNames: Set<string>;
  divisionStats: Map<string, PokemonDivisionFantasyStats>;
  games: number;
  kills: number;
  deaths: number;
  damage: number;
  indirectDamage: number;
  healing: number;
  totalScore: number;
  recentScore: number;
  previousScore: number;
};

type PokemonDivisionFantasyStats = {
  divisionName: string;
  seasonCoachId: number;
  teamName: string;
  score: number;
  recentScore: number;
  previousScore: number;
  games: number;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
  damage: number;
  indirectDamage: number;
};

type TeamFantasyRow = {
  id: number;
  coachId: number;
  teamName: string;
  coachName: string;
  teamLogoUrl: string | null;
  divisionName: string;
  totalScore: number;
  recentScore: number;
  games: number;
  kills: number;
  deaths: number;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pokemonName(row: { displayName: string | null; name: string }, seasonNumber: number) {
  return formatPokemonDisplayName(row.name, row.displayName, {
    friendlyMegaNames: shouldUseFriendlyMegaNamesForSeason(seasonNumber),
  });
}

function normalizeDivisionName(name: string | null | undefined) {
  return name?.trim() || "";
}

function createFantasyRow(
  pokemonId: number,
  pokemon: {
    displayName: string | null;
    name: string;
    spriteUrl: string | null;
    types: string[] | null;
  },
  cost: number | null,
  seasonNumber: number
): PokemonFantasyRow {
  return {
    id: pokemonId,
    name: pokemonName(pokemon, seasonNumber),
    spriteUrl: pokemon.spriteUrl,
    types: pokemon.types ?? [],
    cost,
    rosteredTeams: new Set<number>(),
    teamNames: new Set<string>(),
    divisionNames: new Set<string>(),
    divisionStats: new Map<string, PokemonDivisionFantasyStats>(),
    games: 0,
    kills: 0,
    deaths: 0,
    damage: 0,
    indirectDamage: 0,
    healing: 0,
    totalScore: 0,
    recentScore: 0,
    previousScore: 0,
  };
}

function getDivisionStats(
  row: PokemonFantasyRow,
  divisionName: string,
  seasonCoachId: number,
  teamName: string
) {
  const normalizedName = normalizeDivisionName(divisionName);
  const key = `${normalizedName.toLowerCase()}:${seasonCoachId}`;
  const existing = row.divisionStats.get(key);
  if (existing) return existing;

  const created: PokemonDivisionFantasyStats = {
    divisionName: normalizedName,
    seasonCoachId,
    teamName,
    score: 0,
    recentScore: 0,
    previousScore: 0,
    games: 0,
    kills: 0,
    deaths: 0,
    wins: 0,
    losses: 0,
    damage: 0,
    indirectDamage: 0,
  };
  row.divisionStats.set(key, created);
  return created;
}

function formatScore(value: number) {
  return value.toFixed(1);
}

function isFantasySeason(
  season: { isPublic: boolean | null; seasonNumber: number } | undefined
): season is { isPublic: boolean | null; seasonNumber: number } {
  if (!season) return false;
  return season.isPublic !== false && season.seasonNumber >= MIN_FANTASY_SEASON_NUMBER;
}

async function getSelectedSeason(searchParams: SearchParams) {
  const params = await searchParams;
  const seasonId = Number(firstParam(params.seasonId));

  const [allSeasons, currentSeason, latestSeason] = await Promise.all([
    db.query.seasons.findMany({
      orderBy: [desc(seasons.seasonNumber)],
    }),
    db.query.seasons.findFirst({
      where: eq(seasons.isCurrent, true),
    }),
    db.query.seasons.findFirst({
      orderBy: [desc(seasons.seasonNumber)],
    }),
  ]);

  const fantasySeasons = allSeasons.filter(
    (season) =>
      season.isPublic !== false &&
      season.seasonNumber >= MIN_FANTASY_SEASON_NUMBER
  );
  const selected =
    fantasySeasons.find((season) => season.id === seasonId) ||
    (isFantasySeason(currentSeason) ? currentSeason : null) ||
    (isFantasySeason(latestSeason) ? latestSeason : null) ||
    fantasySeasons[0];

  return { selected, seasons: fantasySeasons };
}

function getRequestedWeek(params: Record<string, string | string[] | undefined>) {
  const week = Number(firstParam(params.week));
  return Number.isInteger(week) && week > 0 ? week : null;
}

async function getFantasyData(
  seasonId: number,
  seasonNumber: number,
  requestedWeek: number | null
) {
  const [seasonMatches, activeTeams, priceRows, seasonTransactions] = await Promise.all([
    db.query.matches.findMany({
      where: eq(matches.seasonId, seasonId),
      with: {
        coach1: true,
        coach2: true,
        division: true,
      },
    }),
    db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.isActive, true),
      with: {
        coach: true,
        division: true,
      },
    }),
    db.query.seasonPokemonPrices.findMany({
      where: eq(seasonPokemonPrices.seasonId, seasonId),
      with: {
        pokemon: true,
      },
    }),
    db.query.transactions.findMany({
      where: eq(transactions.seasonId, seasonId),
      orderBy: [desc(transactions.week)],
      with: {
        seasonCoach: true,
      },
    }),
  ]);

  const seasonDivisionIds = new Set(
    activeTeams
      .filter((team) => team.division?.seasonId === seasonId)
      .map((team) => team.divisionId)
  );
  const seasonTeamIds = new Set(
    activeTeams
      .filter((team) => team.division?.seasonId === seasonId)
    .map((team) => team.id)
  );
  const rosterRows = seasonTeamIds.size
    ? await db.query.rosters.findMany({
        where: inArray(rosters.seasonCoachId, [...seasonTeamIds]),
        with: {
          pokemon: true,
          seasonCoach: {
            with: {
              division: true,
            },
          },
        },
      })
    : [];
  const seasonDivisionNames = [
    ...new Set(
      activeTeams
        .filter((team) => team.division?.seasonId === seasonId)
      .map((team) => normalizeDivisionName(team.division?.name))
      .filter(Boolean)
    ),
  ];
  const regularSeasonMatches = seasonMatches.filter(
    (match) => match.week > 0 && match.week < 100
  );
  const completedMatches = regularSeasonMatches.filter((match) => match.winnerId);
  const latestCompletedWeek = completedMatches.length
    ? Math.max(...completedMatches.map((match) => match.week))
    : 0;
  const nextUnplayedWeek = regularSeasonMatches
    .filter((match) => !match.winnerId)
    .sort((a, b) => a.week - b.week)[0]?.week;
  const defaultScoutingWeek = seasonNumber === 10 ? 8 : nextUnplayedWeek ?? (latestCompletedWeek || 1);
  const targetWeek = requestedWeek ?? defaultScoutingWeek;
  const scoringThroughWeek = Math.max(targetWeek - 1, 0);
  const latestScoutingCompletedWeek = completedMatches
    .map((match) => match.week)
    .filter((week) => week < targetWeek)
    .sort((a, b) => b - a)[0] ?? 0;
  const previousCompletedWeek = completedMatches
    .map((match) => match.week)
    .filter((week) => week < latestScoutingCompletedWeek)
    .sort((a, b) => b - a)[0] ?? 0;

  const priceByPokemon = new Map<number, number | null>();
  for (const row of priceRows) {
    priceByPokemon.set(row.pokemonId, row.price >= 0 ? row.price : null);
  }

  const pokemonMap = new Map<number, PokemonFantasyRow>();
  const rosteredInstanceKeys = new Set<string>();
  for (const price of priceRows) {
    if (!price.pokemon) continue;
    pokemonMap.set(
      price.pokemonId,
      createFantasyRow(price.pokemonId, price.pokemon, price.price >= 0 ? price.price : null, seasonNumber)
    );
  }

  for (const roster of rosterRows) {
    if (!roster.pokemon || !roster.seasonCoach || !seasonDivisionIds.has(roster.seasonCoach.divisionId)) {
      continue;
    }

    const row = pokemonMap.get(roster.pokemonId) ??
      createFantasyRow(roster.pokemonId, roster.pokemon, roster.price, seasonNumber);

    row.rosteredTeams.add(roster.seasonCoachId);
    row.teamNames.add(roster.seasonCoach.teamName);
    row.divisionNames.add(normalizeDivisionName(roster.seasonCoach.division?.name));
    row.cost = row.cost ?? roster.price;
    pokemonMap.set(roster.pokemonId, row);
  }

  const teamMap = new Map<number, TeamFantasyRow>();
  for (const team of activeTeams) {
    if (!team.division || team.division.seasonId !== seasonId) continue;
    teamMap.set(team.id, {
      id: team.id,
      coachId: team.coachId,
      teamName: team.teamName,
      coachName: team.coach?.name ?? "Unknown",
      teamLogoUrl: team.teamLogoUrl,
      divisionName: team.division.name,
      totalScore: 0,
      recentScore: 0,
      games: 0,
      kills: 0,
      deaths: 0,
    });
  }

  const seasonRosterRows = rosterRows.filter(
    (roster) => roster.seasonCoach && seasonTeamIds.has(roster.seasonCoachId)
  );
  await Promise.all(
    [...teamMap.values()].map(async (team) => {
      const currentTeamRosters = seasonRosterRows.filter(
        (roster) => roster.seasonCoachId === team.id
      );
      const teamTransactions = seasonTransactions.filter(
        (transaction) =>
          transaction.seasonCoachId === team.id ||
          (transaction.type === "P2P_TRADE" &&
            transaction.tradingPartnerSeasonCoachId === team.id)
      );
      const { filteredRosters, droppedPokemonDetails } = await getTimeSyncedRoster(
        team.id,
        targetWeek,
        currentTeamRosters,
        teamTransactions as TimeSyncTransaction[]
      );

      for (const roster of filteredRosters) {
        if (!roster.pokemon) continue;

        const row = pokemonMap.get(roster.pokemonId) ??
          createFantasyRow(roster.pokemonId, roster.pokemon, priceByPokemon.get(roster.pokemonId) ?? null, seasonNumber);
        const divisionName = normalizeDivisionName(team.divisionName);
        rosteredInstanceKeys.add(`${roster.pokemonId}:${team.id}`);
        row.rosteredTeams.add(team.id);
        row.teamNames.add(team.teamName);
        row.divisionNames.add(divisionName);
        getDivisionStats(row, team.divisionName, team.id, team.teamName);
        pokemonMap.set(roster.pokemonId, row);
      }

      for (const pokemon of droppedPokemonDetails) {
        const row = pokemonMap.get(pokemon.id) ??
          createFantasyRow(pokemon.id, pokemon, priceByPokemon.get(pokemon.id) ?? null, seasonNumber);
        const divisionName = normalizeDivisionName(team.divisionName);
        rosteredInstanceKeys.add(`${pokemon.id}:${team.id}`);
        row.rosteredTeams.add(team.id);
        row.teamNames.add(team.teamName);
        row.divisionNames.add(divisionName);
        getDivisionStats(row, team.divisionName, team.id, team.teamName);
        pokemonMap.set(pokemon.id, row);
      }
    })
  );

  const scoutingScoringWeeks = [
    ...new Set(
      completedMatches
        .filter((match) => match.week < targetWeek)
        .map((match) => match.week)
    ),
  ];
  const teamScoringWeeks = [
    ...new Set(
      completedMatches
        .filter((match) => match.week <= targetWeek)
        .map((match) => match.week)
    ),
  ];
  const scoutingScoringWeekSet = new Set(scoutingScoringWeeks);
  const latestTeamCompletedWeek = teamScoringWeeks.length
    ? Math.max(...teamScoringWeeks)
    : 0;
  const weeklyStats = await getFantasyWeeklyStatsForWeeks(seasonId, teamScoringWeeks);
  for (const [week, stats] of weeklyStats) {
    for (const stat of stats) {
      if (!seasonTeamIds.has(stat.seasonCoachId)) continue;
      if (!rosteredInstanceKeys.has(`${stat.pokemonId}:${stat.seasonCoachId}`)) continue;

      const row = pokemonMap.get(stat.pokemonId);
      const team = teamMap.get(stat.seasonCoachId);
      if (!row || !team) continue;

      if (scoutingScoringWeekSet.has(week)) {
        row.games += stat.games;
        row.kills += stat.kills;
        row.deaths += stat.deaths;
        row.damage += stat.damage;
        row.indirectDamage += stat.indirectDamage;
        row.totalScore += stat.score;
        if (week === latestScoutingCompletedWeek) row.recentScore += stat.score;
        if (week === previousCompletedWeek) row.previousScore += stat.score;

        const divisionStats = getDivisionStats(row, team.divisionName, stat.seasonCoachId, team.teamName);
        divisionStats.score += stat.score;
        if (week === latestScoutingCompletedWeek) divisionStats.recentScore += stat.score;
        if (week === previousCompletedWeek) divisionStats.previousScore += stat.score;
        divisionStats.games += stat.games;
        divisionStats.kills += stat.kills;
        divisionStats.deaths += stat.deaths;
        divisionStats.wins += stat.wins;
        divisionStats.losses += stat.losses;
        divisionStats.damage += stat.damage;
        divisionStats.indirectDamage += stat.indirectDamage;
      }

      team.totalScore += stat.score;
      if (week === latestTeamCompletedWeek) team.recentScore += stat.score;
      team.games += stat.games;
      team.kills += stat.kills;
      team.deaths += stat.deaths;
    }
  }

  const pokemonRows = [...pokemonMap.values()].sort((a, b) => b.totalScore - a.totalScore);
  const teamRows = [...teamMap.values()].sort((a, b) => b.totalScore - a.totalScore);
  const valueRows = pokemonRows
    .filter((row) => row.cost && row.cost > 0 && row.games > 0)
    .sort((a, b) => b.totalScore / (b.cost || 1) - a.totalScore / (a.cost || 1));

  const starterSix = [...valueRows]
    .filter((row) => row.cost !== null)
    .sort((a, b) => {
      const aValue = a.totalScore / Math.max(a.cost ?? 1, 1);
      const bValue = b.totalScore / Math.max(b.cost ?? 1, 1);
      return bValue - aValue;
    })
    .reduce<{ picks: PokemonFantasyRow[]; cost: number }>(
      (acc, row) => {
        if (acc.picks.length >= 6 || !row.cost) return acc;
        if (acc.cost + row.cost > FANTASY_BUDGET) return acc;
        acc.picks.push(row);
        acc.cost += row.cost;
        return acc;
      },
      { picks: [], cost: 0 }
    );

  const latestTransactionWeek = seasonTransactions[0]?.week ?? null;
  const recentTransactions = latestTransactionWeek === null
    ? []
    : seasonTransactions.filter((transaction) => transaction.week === latestTransactionWeek);
  const addedPokemonIds = recentTransactions.flatMap((transaction) => transaction.pokemonIn ?? []);
  const droppedPokemonIds = recentTransactions.flatMap((transaction) => transaction.pokemonOut ?? []);

  const upcomingMatches = seasonMatches
    .filter(
      (match) =>
        !match.winnerId ||
        (match.week >= targetWeek && match.week > 0 && match.week < 100)
    )
    .sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) {
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return a.week - b.week;
    });

  const recentResults = completedMatches
    .filter((match) => match.week < targetWeek)
    .sort((a, b) => {
      if (b.week !== a.week) return b.week - a.week;
      return b.id - a.id;
    });
  const scheduleMatches = seasonMatches
    .filter((match) => match.week === targetWeek)
    .sort((a, b) => {
      const divisionCompare = (a.division?.name ?? "").localeCompare(b.division?.name ?? "");
      if (divisionCompare !== 0) return divisionCompare;
      return a.id - b.id;
    });

  return {
    totalTeams: teamMap.size,
    divisionNames: seasonDivisionNames,
    defaultScheduleDivisionName: null,
    targetWeek,
    scoringThroughWeek,
    latestCompletedWeek,
    latestScoutingCompletedWeek,
    previousCompletedWeek,
    pokemonRows,
    teamRows,
    valueRows,
    starterSix,
    addedPokemonIds,
    droppedPokemonIds,
    latestTransactionWeek,
    scheduleMatches,
    upcomingMatches,
    recentResults,
  };
}

type FantasyData = Awaited<ReturnType<typeof getFantasyData>>;
type SerializedPokemonFantasyRow = Omit<
  PokemonFantasyRow,
  "rosteredTeams" | "teamNames" | "divisionNames" | "divisionStats"
> & {
  rosteredTeams: number[];
  teamNames: string[];
  divisionNames: string[];
  divisionStats: PokemonDivisionFantasyStats[];
};
type SerializedFantasyData = Omit<FantasyData, "pokemonRows" | "valueRows" | "starterSix"> & {
  pokemonRows: SerializedPokemonFantasyRow[];
  valueRows: SerializedPokemonFantasyRow[];
  starterSix: {
    picks: SerializedPokemonFantasyRow[];
    cost: number;
  };
};

function serializePokemonFantasyRow(row: PokemonFantasyRow): SerializedPokemonFantasyRow {
  return {
    ...row,
    rosteredTeams: [...row.rosteredTeams],
    teamNames: [...row.teamNames],
    divisionNames: [...row.divisionNames],
    divisionStats: [...row.divisionStats.values()],
  };
}

function serializeFantasyData(data: FantasyData): SerializedFantasyData {
  return {
    ...data,
    pokemonRows: data.pokemonRows.map(serializePokemonFantasyRow),
    valueRows: data.valueRows.map(serializePokemonFantasyRow),
    starterSix: {
      picks: data.starterSix.picks.map(serializePokemonFantasyRow),
      cost: data.starterSix.cost,
    },
  };
}

function hydratePokemonFantasyRow(row: SerializedPokemonFantasyRow): PokemonFantasyRow {
  return {
    ...row,
    rosteredTeams: new Set(row.rosteredTeams),
    teamNames: new Set(row.teamNames),
    divisionNames: new Set(row.divisionNames),
    divisionStats: new Map(
      row.divisionStats.map((stats) => [
        `${normalizeDivisionName(stats.divisionName)}:${stats.seasonCoachId}`,
        stats,
      ])
    ),
  };
}

function hydrateFantasyData(data: SerializedFantasyData): FantasyData {
  return {
    ...data,
    pokemonRows: data.pokemonRows.map(hydratePokemonFantasyRow),
    valueRows: data.valueRows.map(hydratePokemonFantasyRow),
    starterSix: {
      picks: data.starterSix.picks.map(hydratePokemonFantasyRow),
      cost: data.starterSix.cost,
    },
  };
}

const getCachedFantasyData = unstable_cache(
  async (seasonId: number, seasonNumber: number, requestedWeek: number | null) =>
    serializeFantasyData(await getFantasyData(seasonId, seasonNumber, requestedWeek)),
  ["fantasy-public-data-v1"],
  { revalidate: 60, tags: ["fantasy-public-data"] }
);

async function getDefaultScheduleDivisionName(seasonId: number) {
  const session = await getSession();
  if (session?.type !== "coach") return null;

  const team = await db.query.seasonCoaches.findFirst({
    where: and(
      eq(seasonCoaches.coachId, session.id),
      eq(seasonCoaches.isActive, true)
    ),
    with: { division: true },
  });

  return team?.division?.seasonId === seasonId ? team.division.name : null;
}

function PokemonAvatar({ row, size = 40 }: { row: PokemonFantasyRow; size?: number }) {
  return row.spriteUrl ? (
    <Image
      src={row.spriteUrl}
      alt=""
      width={size}
      height={size}
      className="object-contain"
    />
  ) : (
    <div
      className="rounded-full bg-[var(--background-tertiary)]"
      style={{ width: size, height: size }}
    />
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/60 px-3 py-2">
      <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">{label}</div>
      <div className="font-mono text-sm font-bold text-white">{value}</div>
    </div>
  );
}

export default async function FantasyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const featureSettings = await getSiteFeatureSettings();
  if (featureSettings.fantasyUiHidden) {
    return (
      <div className="poke-card p-8 text-center">
        <h1 className="font-pixel text-lg text-white">Fantasy Scout</h1>
        <p className="mt-3 text-[var(--foreground-muted)]">Fantasy is currently unavailable.</p>
      </div>
    );
  }

  const { selected, seasons: seasonOptions } = await getSelectedSeason(searchParams);

  if (!selected) {
    return (
      <div className="poke-card p-8 text-center">
        <h1 className="font-pixel text-lg text-white">Fantasy Scout</h1>
        <p className="mt-3 text-[var(--foreground-muted)]">No public seasons are available yet.</p>
      </div>
    );
  }

  const requestedWeek = getRequestedWeek(params);
  const [serializedData, defaultScheduleDivisionName] = await Promise.all([
    getCachedFantasyData(selected.id, selected.seasonNumber, requestedWeek),
    getDefaultScheduleDivisionName(selected.id),
  ]);
  const data = hydrateFantasyData(serializedData);
  const pokemonBoardRows: PokemonBoardRow[] = data.pokemonRows
    .flatMap((row) =>
      [...row.divisionStats.values()].map((stats) => ({
        pokemonId: row.id,
        name: row.name,
        spriteUrl: row.spriteUrl,
        types: row.types,
        cost: row.cost,
        divisionName: stats.divisionName,
        seasonCoachId: stats.seasonCoachId,
        teamName: stats.teamName,
        score: stats.score,
        recentScore: stats.recentScore,
        previousScore: stats.previousScore,
        games: stats.games,
        kills: stats.kills,
        deaths: stats.deaths,
        wins: stats.wins,
        losses: stats.losses,
        damage: stats.damage,
        indirectDamage: stats.indirectDamage,
      }))
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
  const scheduleRows: FantasyScheduleRow[] = data.scheduleMatches.map((match) => {
    const divisionName = normalizeDivisionName(match.division?.name);
    return {
      id: match.id,
      week: match.week,
      divisionName: divisionName || null,
      divisionColor: divisionName ? DIVISION_COLORS[divisionName] ?? null : null,
      coach1SeasonId: match.coach1SeasonId,
      coach2SeasonId: match.coach2SeasonId,
      winnerId: match.week >= data.targetWeek && match.week > 0 && match.week < 100 ? null : match.winnerId,
      coach1Differential: match.coach1Differential,
      coach2Differential: match.coach2Differential,
      coach1TeamName: match.coach1?.teamName ?? null,
      coach2TeamName: match.coach2?.teamName ?? null,
      coach1TeamLogoUrl: match.coach1?.teamLogoUrl ?? null,
      coach2TeamLogoUrl: match.coach2?.teamLogoUrl ?? null,
    };
  });
  const topPokemon = data.pokemonRows.slice(0, 8);
  const topValue = data.valueRows.slice(0, 6);
  const topAdded = data.addedPokemonIds
    .map((id) => data.pokemonRows.find((row) => row.id === id))
    .filter((row): row is PokemonFantasyRow => Boolean(row));
  const topDropped = data.droppedPokemonIds
    .map((id) => data.pokemonRows.find((row) => row.id === id))
    .filter((row): row is PokemonFantasyRow => Boolean(row));
  const fantasyPokemonOptions: FantasyPokemonOption[] = data.pokemonRows
    .filter((row) => row.cost !== null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      spriteUrl: row.spriteUrl,
      cost: row.cost,
      divisionNames: [...row.divisionNames],
      divisionStats: [...row.divisionStats.values()].map((stats) => ({
        divisionName: stats.divisionName,
        seasonCoachId: stats.seasonCoachId,
        teamName: stats.teamName,
        score: stats.score,
        games: stats.games,
        kills: stats.kills,
        deaths: stats.deaths,
      })),
      totalScore: row.totalScore,
      games: row.games,
      kills: row.kills,
      deaths: row.deaths,
    }));

  return (
    <div className="space-y-5">
      <section className="poke-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm">
              <Link href="/" className="text-[var(--foreground-muted)] hover:text-[var(--primary)]">
                Home
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">Fantasy Scout</span>
            </div>
            <h1 className="font-pixel text-xl leading-relaxed text-white md:text-2xl">
              Fantasy Scout
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--foreground-muted)]">
              A Pokemon-adjusted fantasy hub for scouting value picks, recent form,
              roster ownership, team output, and upcoming matchups.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {seasonOptions.slice(0, 6).map((season) => (
              <Link
                key={season.id}
                href={`/fantasy?seasonId=${season.id}&week=${data.targetWeek}`}
                className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase transition-colors ${
                  season.id === selected.id
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                S{season.seasonNumber}
              </Link>
            ))}
          </div>
        </div>

        <FantasyAbout />
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <StatPill label="Season" value={selected.name} />
        <StatPill label="Scouting Week" value={`Week ${data.targetWeek}`} />
        <StatPill label="Stats Through" value={data.scoringThroughWeek ? `Week ${data.scoringThroughWeek}` : "--"} />
        <StatPill label="Pokemon Scouted" value={data.pokemonRows.length} />
      </section>

      <FantasyEntryClient
        seasonId={selected.id}
        divisionNames={data.divisionNames}
        targetWeek={data.targetWeek}
        scoringThroughWeek={data.scoringThroughWeek}
        pokemon={fantasyPokemonOptions}
      />

      <MatchedHeightGrid
        leftContent={
        <div className="poke-card flex h-full min-h-0 flex-col overflow-hidden p-0">
          <div className="section-title mx-4 mt-4 sm:mx-5 sm:mt-5">
            <div className="section-title-icon">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17a4 4 0 100-8 4 4 0 000 8zm0 0v4m0-18v2m8 6h2M1 11h2m13.657-6.657l1.414 1.414M3.929 18.071l1.414-1.414m0-12.314L3.929 5.757m14.142 12.314l-1.414-1.414" />
              </svg>
            </div>
            <h3>Pokemon Board</h3>
          </div>
          <PokemonBoardClient
            divisionNames={data.divisionNames}
            rows={pokemonBoardRows}
            seasonId={selected.id}
            targetWeek={data.targetWeek}
          />
        </div>
        }

        rightContent={
        <aside className="min-h-0">
          <div className="poke-card flex max-h-[980px] min-h-0 flex-col overflow-hidden p-4 sm:p-5">
            <div className="section-title shrink-0">
              <div className="section-title-icon">
                <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              </div>
              <h3>Trending</h3>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-2">
              <div>
                <h4 className="mb-3 text-xs font-bold uppercase text-[var(--foreground-muted)]">
                  Top Scores
                </h4>
                <div className="space-y-2">
                  {topPokemon.map((row, index) => (
                    <Link key={row.id} href={`/pokemon/${row.id}`} className="trainer-card">
                      <div className={`rank-badge ${index === 0 ? "rank-1" : index === 1 ? "rank-2" : index === 2 ? "rank-3" : "bg-[var(--background)] text-[var(--foreground-subtle)]"}`}>
                        {index + 1}
                      </div>
                      <PokemonAvatar row={row} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-white">{row.name}</div>
                        <div className="text-[10px] text-[var(--foreground-subtle)]">{row.games} games</div>
                      </div>
                      <div className="font-mono font-bold text-[var(--accent)]">{formatScore(row.totalScore)}</div>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <h4 className="mb-3 text-xs font-bold uppercase text-[var(--foreground-muted)]">
                    Added {data.latestTransactionWeek ? `W${data.latestTransactionWeek}` : ""}
                  </h4>
                  <div className="space-y-2">
                    {(topAdded.length ? topAdded : topValue.slice(0, 3)).map((row) => (
                      <Link key={row.id} href={`/pokemon/${row.id}`} className="trainer-card">
                        <PokemonAvatar row={row} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-white">{row.name}</div>
                          <div className="text-[10px] text-[var(--foreground-subtle)]">Cost {row.cost ?? "--"}</div>
                        </div>
                        <span className="text-xs font-bold text-[var(--success)]">+</span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="mb-3 text-xs font-bold uppercase text-[var(--foreground-muted)]">
                    Dropped {data.latestTransactionWeek ? `W${data.latestTransactionWeek}` : ""}
                  </h4>
                  <div className="space-y-2">
                    {(topDropped.length ? topDropped : data.pokemonRows.filter((row) => row.recentScore < row.previousScore).slice(0, 3)).map((row) => (
                      <Link key={row.id} href={`/pokemon/${row.id}`} className="trainer-card">
                        <PokemonAvatar row={row} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-white">{row.name}</div>
                          <div className="text-[10px] text-[var(--foreground-subtle)]">
                            Trend {formatScore(row.recentScore - row.previousScore)}
                          </div>
                        </div>
                        <span className="text-xs font-bold text-[var(--error)]">-</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
        }
      />

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="poke-card p-4 sm:p-5">
          <div className="section-title">
            <div className="section-title-icon">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 15l4-4 4 4 5-8" />
              </svg>
            </div>
            <h3>Team Leaderboard</h3>
          </div>
          <div className="max-h-[642px] space-y-2 overflow-y-auto overscroll-contain pr-2">
            {data.teamRows.map((team, index) => {
              const color = DIVISION_COLORS[team.divisionName];
              return (
                <Link key={team.id} href={`/coaches/${team.coachId}`} className="trainer-card">
                  <div className={`rank-badge ${index === 0 ? "rank-1" : index === 1 ? "rank-2" : index === 2 ? "rank-3" : "bg-[var(--background)] text-[var(--foreground-subtle)]"}`}>
                    {index + 1}
                  </div>
                  {team.teamLogoUrl && (
                    <Image src={team.teamLogoUrl} alt="" width={34} height={34} className="rounded object-contain" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">{team.teamName}</div>
                    <div className="text-[10px] font-bold uppercase" style={{ color: color ?? "var(--foreground-subtle)" }}>
                      {team.divisionName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-[var(--accent)]">{formatScore(team.totalScore)}</div>
                    <div className="text-[10px] text-[var(--foreground-subtle)]">{team.kills}/{team.deaths}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

          <ScheduleBoardClient
          defaultDivisionName={defaultScheduleDivisionName}
          divisionNames={data.divisionNames}
          matches={scheduleRows}
        />
      </section>

    </div>
  );
}
