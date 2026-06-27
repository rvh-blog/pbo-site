import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  matches,
  seasonCoaches,
  seasonPokemonPrices,
  seasons,
  transactions,
} from "@/lib/schema";
import { getTimeSyncedRoster, type TimeSyncTransaction } from "@/lib/roster-utils";
import { MatchedHeightGrid } from "@/components/matched-height-grid";
import { desc, eq } from "drizzle-orm";
import { FantasyEntryClient, type FantasyPokemonOption } from "./fantasy-entry-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fantasy Scout",
};

const DIVISION_COLORS: Record<string, string> = {
  Stargazer: "#3b82f6",
  Sunset: "#fb923c",
  Crystal: "#c084fc",
  Neon: "#4ade80",
};

const MIN_FANTASY_SEASON_NUMBER = 10;
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
  teamNames: Set<string>;
  score: number;
  games: number;
  kills: number;
  deaths: number;
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

function pokemonName(row: { displayName: string | null; name: string }) {
  return row.displayName || row.name;
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
  cost: number | null
): PokemonFantasyRow {
  return {
    id: pokemonId,
    name: pokemonName(pokemon),
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

function getDivisionStats(row: PokemonFantasyRow, divisionName: string) {
  const normalizedName = normalizeDivisionName(divisionName);
  const key = normalizedName.toLowerCase();
  const existing = row.divisionStats.get(key);
  if (existing) return existing;

  const created: PokemonDivisionFantasyStats = {
    divisionName: normalizedName,
    teamNames: new Set<string>(),
    score: 0,
    games: 0,
    kills: 0,
    deaths: 0,
  };
  row.divisionStats.set(key, created);
  return created;
}

function scorePokemonGame(mp: {
  kills: number | null;
  deaths: number | null;
  seasonCoachId: number;
  match: {
    winnerId: number | null;
  };
}) {
  const kills = mp.kills ?? 0;
  const deaths = mp.deaths ?? 0;
  const teamResult = mp.match.winnerId === mp.seasonCoachId ? 2 : -2;

  return kills * 5 - deaths + teamResult;
}

function formatScore(value: number) {
  return value.toFixed(1);
}

function typeBadgeClass(type: string) {
  return `type-badge type-${type.toLowerCase()}`;
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
  const [
    seasonMatches,
    activeTeams,
    rosterRows,
    priceRows,
    seasonTransactions,
  ] = await Promise.all([
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
    db.query.rosters.findMany({
      with: {
        pokemon: true,
        seasonCoach: {
          with: {
            division: true,
          },
        },
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
  const seasonDivisionNames = [
    ...new Set(
      activeTeams
        .filter((team) => team.division?.seasonId === seasonId)
        .map((team) => normalizeDivisionName(team.division?.name))
        .filter(Boolean)
    ),
  ];
  const matchIds = new Set(seasonMatches.map((match) => match.id));
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
  const previousCompletedWeek = completedMatches
    .map((match) => match.week)
    .filter((week) => week < latestCompletedWeek)
    .sort((a, b) => b - a)[0] ?? 0;

  const allMatchPokemon = matchIds.size
    ? await db.query.matchPokemon.findMany({
        with: {
          pokemon: true,
          match: true,
          seasonCoach: {
            with: {
              coach: true,
              division: true,
            },
          },
        },
      })
    : [];

  const seasonMatchPokemon = allMatchPokemon.filter((mp) => matchIds.has(mp.matchId));
  const priceByPokemon = new Map<number, number | null>();
  for (const row of priceRows) {
    priceByPokemon.set(row.pokemonId, row.price >= 0 ? row.price : null);
  }

  const pokemonMap = new Map<number, PokemonFantasyRow>();
  for (const price of priceRows) {
    if (!price.pokemon) continue;
    pokemonMap.set(
      price.pokemonId,
      createFantasyRow(price.pokemonId, price.pokemon, price.price >= 0 ? price.price : null)
    );
  }

  for (const roster of rosterRows) {
    if (!roster.pokemon || !roster.seasonCoach || !seasonDivisionIds.has(roster.seasonCoach.divisionId)) {
      continue;
    }

    const row = pokemonMap.get(roster.pokemonId) ??
      createFantasyRow(roster.pokemonId, roster.pokemon, roster.price);

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
          createFantasyRow(roster.pokemonId, roster.pokemon, priceByPokemon.get(roster.pokemonId) ?? null);
        row.teamNames.add(team.teamName);
        row.divisionNames.add(normalizeDivisionName(team.divisionName));
        getDivisionStats(row, team.divisionName).teamNames.add(team.teamName);
        pokemonMap.set(roster.pokemonId, row);
      }

      for (const pokemon of droppedPokemonDetails) {
        const row = pokemonMap.get(pokemon.id) ??
          createFantasyRow(pokemon.id, pokemon, priceByPokemon.get(pokemon.id) ?? null);
        row.teamNames.add(team.teamName);
        row.divisionNames.add(normalizeDivisionName(team.divisionName));
        getDivisionStats(row, team.divisionName).teamNames.add(team.teamName);
        pokemonMap.set(pokemon.id, row);
      }
    })
  );

  for (const mp of seasonMatchPokemon) {
    if (!mp.pokemon || !mp.match || !seasonTeamIds.has(mp.seasonCoachId)) continue;

    const row = pokemonMap.get(mp.pokemonId) ??
      createFantasyRow(mp.pokemonId, mp.pokemon, priceByPokemon.get(mp.pokemonId) ?? null);

    const score = scorePokemonGame(mp);
    row.games += 1;
    row.kills += mp.kills ?? 0;
    row.deaths += mp.deaths ?? 0;
    row.damage += mp.damageDealt ?? 0;
    row.indirectDamage += mp.damageDealtIndirect ?? 0;
    row.healing += mp.hpRestored ?? 0;
    row.totalScore += score;
    if (mp.match.week === latestCompletedWeek) row.recentScore += score;
    if (mp.match.week === previousCompletedWeek) row.previousScore += score;
    const divisionName = normalizeDivisionName(mp.seasonCoach?.division?.name);
    if (divisionName && mp.match.winnerId && mp.match.week < targetWeek) {
      const divisionStats = getDivisionStats(row, divisionName);
      divisionStats.score += score;
      divisionStats.games += 1;
      divisionStats.kills += mp.kills ?? 0;
      divisionStats.deaths += mp.deaths ?? 0;
    }
    pokemonMap.set(mp.pokemonId, row);

    const team = teamMap.get(mp.seasonCoachId);
    if (team) {
      team.totalScore += score;
      if (mp.match.week === latestCompletedWeek) team.recentScore += score;
      team.games += 1;
      team.kills += mp.kills ?? 0;
      team.deaths += mp.deaths ?? 0;
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
    .filter((match) => !match.winnerId)
    .sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) {
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return a.week - b.week;
    });

  const recentResults = completedMatches
    .sort((a, b) => {
      if (b.week !== a.week) return b.week - a.week;
      return b.id - a.id;
    });

  return {
    totalTeams: teamMap.size,
    divisionNames: seasonDivisionNames,
    targetWeek,
    scoringThroughWeek,
    latestCompletedWeek,
    previousCompletedWeek,
    pokemonRows,
    teamRows,
    valueRows,
    starterSix,
    addedPokemonIds,
    droppedPokemonIds,
    latestTransactionWeek,
    upcomingMatches,
    recentResults,
  };
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

function MatchRow({
  match,
  isResult,
}: {
  match: Awaited<ReturnType<typeof getFantasyData>>["upcomingMatches"][number];
  isResult?: boolean;
}) {
  const divisionColor = match.division?.name ? DIVISION_COLORS[match.division.name] : undefined;
  const coach1Won = match.winnerId === match.coach1SeasonId;
  const coach2Won = match.winnerId === match.coach2SeasonId;

  return (
    <Link href={`/matches/${match.id}`} className="block">
      <div className="battle-log-item">
        <div className={`week-badge ${match.week > 100 ? "playoff" : ""}`}>
          <span>{match.week > 100 ? "Playoff" : "Week"}</span>
          <span>{match.week > 100 ? match.week - 100 : match.week}</span>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className={`flex min-w-0 items-center gap-2 ${coach1Won ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
            {match.coach1?.teamLogoUrl && (
              <Image src={match.coach1.teamLogoUrl} alt="" width={24} height={24} className="hidden rounded sm:block" />
            )}
            <span className="truncate text-xs font-bold sm:text-sm">{match.coach1?.teamName}</span>
          </div>
          <div className="score-display">
            {isResult ? `${match.coach1Differential ?? 0}-${match.coach2Differential ?? 0}` : "VS"}
          </div>
          <div className={`flex min-w-0 items-center justify-end gap-2 ${coach2Won ? "text-[var(--success)]" : "text-[var(--foreground-muted)]"}`}>
            <span className="truncate text-right text-xs font-bold sm:text-sm">{match.coach2?.teamName}</span>
            {match.coach2?.teamLogoUrl && (
              <Image src={match.coach2.teamLogoUrl} alt="" width={24} height={24} className="hidden rounded sm:block" />
            )}
          </div>
        </div>
        {match.division?.name && (
          <span
            className="hidden rounded px-2 py-1 text-[10px] font-bold uppercase sm:inline-block"
            style={{
              color: divisionColor ?? "var(--foreground-muted)",
              backgroundColor: divisionColor ? `${divisionColor}15` : "var(--background-tertiary)",
              border: `1px solid ${divisionColor ? `${divisionColor}30` : "var(--background-tertiary)"}`,
            }}
          >
            {match.division.name}
          </span>
        )}
      </div>
    </Link>
  );
}

export default async function FantasyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
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
  const data = await getFantasyData(selected.id, selected.seasonNumber, requestedWeek);
  const topPokemon = data.pokemonRows.slice(0, 8);
  const topValue = data.valueRows.slice(0, 6);
  const topAdded = data.addedPokemonIds
    .map((id) => data.pokemonRows.find((row) => row.id === id))
    .filter((row): row is PokemonFantasyRow => Boolean(row))
    .slice(0, 4);
  const topDropped = data.droppedPokemonIds
    .map((id) => data.pokemonRows.find((row) => row.id === id))
    .filter((row): row is PokemonFantasyRow => Boolean(row))
    .slice(0, 4);
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
        teamNames: [...stats.teamNames],
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
          <div className="min-h-0 flex-1 overflow-auto scrollbar-thin px-4 pb-4 sm:px-5 sm:pb-5">
            <table className="premium-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Pokemon</th>
                  <th>Cost</th>
                  <th>Recent</th>
                  <th>Total</th>
                  <th>Rostered</th>
                  <th>Trend</th>
                  <th>PPG</th>
                  <th>K/D</th>
                  <th>Damage</th>
                </tr>
              </thead>
              <tbody>
                {data.pokemonRows.slice(0, 60).map((row) => {
                  const rosteredPct = data.totalTeams
                    ? Math.round((row.rosteredTeams.size / data.totalTeams) * 100)
                    : 0;
                  const trend = row.recentScore - row.previousScore;
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/pokemon/${row.id}`} className="flex items-center gap-3">
                          <PokemonAvatar row={row} />
                          <div className="min-w-0">
                            <div className="truncate font-bold text-white">{row.name}</div>
                            <div className="mt-1 flex gap-1">
                              {row.types.slice(0, 2).map((type) => (
                                <span key={type} className={typeBadgeClass(type)}>
                                  {type}
                                </span>
                              ))}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="font-mono font-bold text-[var(--accent)]">
                        {row.cost ?? "--"}
                      </td>
                      <td className="font-mono text-white">{formatScore(row.recentScore)}</td>
                      <td className="font-mono font-bold text-white">{formatScore(row.totalScore)}</td>
                      <td>
                        <div className="font-mono text-white">{rosteredPct}%</div>
                        <div className="text-[10px] text-[var(--foreground-subtle)]">
                          {row.rosteredTeams.size}/{data.totalTeams}
                        </div>
                      </td>
                      <td className={`font-mono font-bold ${trend >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                        {trend >= 0 ? "+" : ""}
                        {formatScore(trend)}
                      </td>
                      <td className="font-mono text-white">
                        {row.games ? formatScore(row.totalScore / row.games) : "--"}
                      </td>
                      <td className="font-mono text-white">
                        {row.kills}/{row.deaths}
                      </td>
                      <td className="font-mono text-white">{row.damage + row.indirectDamage}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        }

        rightContent={
        <aside className="space-y-6">
          <div className="poke-card p-4 sm:p-5">
            <div className="section-title">
              <div className="section-title-icon">
                <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              </div>
              <h3>Trending</h3>
            </div>
            <div className="space-y-5">
              <div>
                <h4 className="mb-3 text-xs font-bold uppercase text-[var(--foreground-muted)]">
                  Top Scores
                </h4>
                <div className="space-y-2">
                  {topPokemon.slice(0, 5).map((row, index) => (
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
          <div className="space-y-2">
            {data.teamRows.slice(0, 10).map((team, index) => {
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

        <div className="poke-card p-4 sm:p-5">
          <div className="section-title">
            <div className="section-title-icon">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3>Schedule</h3>
          </div>
          <div className="space-y-3">
            {(data.upcomingMatches.length ? data.upcomingMatches.slice(0, 5) : data.recentResults.slice(0, 5)).map((match) => (
              <MatchRow key={match.id} match={match} isResult={!data.upcomingMatches.length} />
            ))}
            {!data.upcomingMatches.length && !data.recentResults.length && (
              <p className="py-6 text-center text-sm text-[var(--foreground-muted)]">
                No matches found for this season.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="poke-card p-4 sm:p-5">
        <div className="section-title">
          <div className="section-title-icon">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
            </svg>
          </div>
          <h3>About</h3>
        </div>
        <div className="grid gap-3 text-sm leading-6 text-[var(--foreground-muted)] md:grid-cols-3">
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
            <h4 className="mb-2 font-bold uppercase text-white">Scoring</h4>
            <p>
              Scoring is 5 per KO, -1 per death, +2 for a team win, and -2
              for a team loss.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
            <h4 className="mb-2 font-bold uppercase text-white">Ownership</h4>
            <p>
              Rostered percent is based on active teams in the selected season. Costs
              come from season prices, with roster price used as a fallback.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
            <h4 className="mb-2 font-bold uppercase text-white">Fantasy Rosters</h4>
            <p>
              Signed-in coaches and spectators can save one six-Pokemon roster per
              season under the 90-point budget, then track it on the leaderboard.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
