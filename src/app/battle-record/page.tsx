import { db } from "@/lib/db";
import { unstable_cache } from "next/cache";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { matches, matchPokemon } from "@/lib/schema";
import { compareDivisionNames } from "@/lib/division-order";
import type { BattleRecordRow } from "./battle-record-table";
import { BattleRecordView, type BattleRecordTab, type PboRecordCategory, type PboRecordEntry } from "./battle-record-tabs";
import type { PokemonMoveDivision, PokemonMoveRecord } from "./pokemon-move-records";
import {
  applyBattleRecordOverrides,
  getBattleRecordOverrides,
} from "@/lib/battle-record-overrides";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Battle Record",
};

const divisionRecordNames = ["Infinity", "Stargazer", "Sunset", "Crystal", "Neon"] as const;
type DivisionRecordName = (typeof divisionRecordNames)[number];

type CoachRecordStats = {
  games: number;
  wins: number;
  differential: number;
  winDifferential: number;
  winCount: number;
  lossDifferential: number;
  lossCount: number;
  closeGames: number;
  closeWins: number;
  bigWins: number;
  recentResults: Array<{ won: boolean; sortValue: number }>;
};

async function getBattleRecords(): Promise<BattleRecordRow[]> {
  const [allCoaches, allSeasonCoaches, allMatches, allSeasons, allDivisions] = await Promise.all([
    db.query.coaches.findMany({
      columns: {
        id: true,
        name: true,
      },
    }),
    db.query.seasonCoaches.findMany({
      columns: {
        id: true,
        coachId: true,
        divisionId: true,
        teamLogoUrl: true,
        isActive: true,
      },
    }),
    db.query.matches.findMany({
      columns: {
        id: true,
        seasonId: true,
        week: true,
        coach1SeasonId: true,
        coach2SeasonId: true,
        winnerId: true,
        coach1Differential: true,
        coach2Differential: true,
        endedAt: true,
        playedAt: true,
        scheduledAt: true,
      },
      where: and(
        isNotNull(matches.winnerId),
        eq(matches.isForfeit, false),
        or(
          eq(matches.winnerId, matches.coach1SeasonId),
          eq(matches.winnerId, matches.coach2SeasonId)
        )
      ),
    }),
    db.query.seasons.findMany({
      columns: {
        id: true,
        seasonNumber: true,
      },
    }),
    db.query.divisions.findMany({
      columns: {
        id: true,
        seasonId: true,
      },
    }),
  ]);

  const coachBySeasonCoachId = new Map(allSeasonCoaches.map((sc) => [sc.id, sc.coachId]));
  const coachNameById = new Map(allCoaches.map((coach) => [coach.id, coach.name]));
  const seasonNumberById = new Map(allSeasons.map((season) => [season.id, season.seasonNumber]));
  const latestSeasonId = [...allSeasons].sort((a, b) => b.seasonNumber - a.seasonNumber)[0]?.id;
  const latestDivisionIds = new Set(
    allDivisions.filter((division) => division.seasonId === latestSeasonId).map((division) => division.id)
  );
  const activeCoachIds = new Set(
    allSeasonCoaches
      .filter((seasonCoach) => latestDivisionIds.has(seasonCoach.divisionId) && seasonCoach.isActive)
      .map((seasonCoach) => seasonCoach.coachId)
  );
  const coachLogoMap = new Map<number, string | null>();
  const sortedSeasonCoaches = [...allSeasonCoaches].sort((a, b) => b.id - a.id);

  for (const seasonCoach of sortedSeasonCoaches) {
    if (!coachLogoMap.has(seasonCoach.coachId) && seasonCoach.teamLogoUrl) {
      coachLogoMap.set(seasonCoach.coachId, seasonCoach.teamLogoUrl);
    }
  }

  const stats = new Map<number, CoachRecordStats>();

  function getStats(statsMap: Map<number, CoachRecordStats>, coachId: number) {
    const existing = statsMap.get(coachId);
    if (existing) return existing;

    const created = {
      games: 0,
      wins: 0,
      differential: 0,
      winDifferential: 0,
      winCount: 0,
      lossDifferential: 0,
      lossCount: 0,
      closeGames: 0,
      closeWins: 0,
      bigWins: 0,
      recentResults: [],
    };
    statsMap.set(coachId, created);
    return created;
  }

  for (const match of allMatches) {
    if (!match.winnerId) continue;

    const participants = [
      { seasonCoachId: match.coach1SeasonId, differential: match.coach1Differential ?? 0 },
      { seasonCoachId: match.coach2SeasonId, differential: match.coach2Differential ?? 0 },
    ];

    for (const participant of participants) {
      const coachId = coachBySeasonCoachId.get(participant.seasonCoachId);
      if (!coachId) continue;

      const won = match.winnerId === participant.seasonCoachId;
      const absDifferential = Math.abs(participant.differential);
      const playedTime = Date.parse(match.endedAt ?? match.playedAt ?? match.scheduledAt ?? "");
      const seasonNumber = seasonNumberById.get(match.seasonId) ?? 0;
      const sortValue = Number.isNaN(playedTime)
        ? seasonNumber * 100000 + match.week * 100 + match.id
        : playedTime;

      const coachStats = getStats(stats, coachId);
      coachStats.games += 1;
      coachStats.differential += participant.differential;
      coachStats.recentResults.push({ won, sortValue });

      if (won) {
        coachStats.wins += 1;
        coachStats.winCount += 1;
        coachStats.winDifferential += participant.differential;
        if (absDifferential === 5 || absDifferential === 6) {
          coachStats.bigWins += 1;
        }
      } else {
        coachStats.lossCount += 1;
        coachStats.lossDifferential += participant.differential;
      }

      if (absDifferential === 1 || absDifferential === 2) {
        coachStats.closeGames += 1;
        if (won) {
          coachStats.closeWins += 1;
        }
      }
    }
  }

  function buildRecordRows(statsMap: Map<number, CoachRecordStats>): BattleRecordRow[] {
    return [...statsMap.entries()]
    .map(([coachId, row]) => {
      const last15Results = row.recentResults
        .sort((a, b) => b.sortValue - a.sortValue)
        .slice(0, 15);
      const last15Wins = last15Results.filter((result) => result.won).length;
      const last15Losses = last15Results.length - last15Wins;

      return {
        coachId,
        coachName: coachNameById.get(coachId) ?? "Unknown",
        logoUrl: coachLogoMap.get(coachId) ?? null,
        isActive: activeCoachIds.has(coachId),
        games: row.games,
        averageDifferential: row.differential / row.games,
        averageWinDifference: row.winCount > 0 ? row.winDifferential / row.winCount : null,
        averageLossDifference: row.lossCount > 0 ? row.lossDifferential / row.lossCount : null,
        winningPercentage: (row.wins / row.games) * 100,
        last15Wins,
        last15Losses,
        last15WinPercentage: last15Results.length > 0 ? (last15Wins / last15Results.length) * 100 : null,
        closeGameWins: row.closeWins,
        closeGameLosses: row.closeGames - row.closeWins,
        closeGameWinPercentage: row.closeGames > 0 ? (row.closeWins / row.closeGames) * 100 : null,
        bigWins: row.bigWins,
        bigWinPercentage: (row.bigWins / row.games) * 100,
      };
    })
    .filter((row) => row.games > 0)
    .sort((a, b) =>
      b.games - a.games ||
      b.averageDifferential - a.averageDifferential ||
      a.coachName.localeCompare(b.coachName)
    );
  }

  return buildRecordRows(stats);
}

async function getPokemonMoveRecords(): Promise<{
  divisions: PokemonMoveDivision[];
}> {
  const rows = await db.query.matchPokemon.findMany({
    columns: {
      pokemonId: true,
      movesUsed: true,
    },
    with: {
      pokemon: {
        columns: { id: true, name: true, displayName: true, spriteUrl: true },
      },
      match: {
        columns: {
          id: true,
          divisionId: true,
          week: true,
          winnerId: true,
          coach1SeasonId: true,
          coach2SeasonId: true,
          isForfeit: true,
        },
        with: {
          season: { columns: { seasonNumber: true } },
          division: { columns: { name: true } },
        },
      },
    },
    where: isNotNull(matchPokemon.movesUsed),
  });

  type MoveUsageRow = (typeof rows)[number];
  const aggregateRecords = (sourceRows: MoveUsageRow[]): PokemonMoveRecord[] => {
    const records = new Map<number, {
      pokemonId: number;
      pokemonName: string;
      spriteUrl: string | null;
      games: number;
      moves: Map<string, { name: string; uses: number }>;
    }>();

    for (const row of sourceRows) {
      if (!row.movesUsed || !row.pokemon || !row.match?.season || !row.match.division) continue;
      const normalizedMoves = Object.entries(row.movesUsed)
        .map(([rawName, rawUses]) => ({
          name: rawName.trim().replace(/\s+/g, " "),
          uses: Number(rawUses),
        }))
        .filter((move) => move.name && Number.isFinite(move.uses) && move.uses > 0)
        .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

      const record = records.get(row.pokemonId) ?? {
        pokemonId: row.pokemonId,
        pokemonName: row.pokemon.displayName || row.pokemon.name || "Unknown",
        spriteUrl: row.pokemon.spriteUrl || null,
        games: 0,
        moves: new Map<string, { name: string; uses: number }>(),
      };
      record.games += 1;

      for (const usedMove of normalizedMoves) {
        const key = usedMove.name.toLowerCase();
        const move = record.moves.get(key) ?? { name: usedMove.name, uses: 0 };
        move.uses += usedMove.uses;
        record.moves.set(key, move);
      }

      records.set(row.pokemonId, record);
    }

    return [...records.values()]
      .map((record) => {
        const moves = [...record.moves.values()].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
        return {
          ...record,
          totalUses: moves.reduce((sum, move) => sum + move.uses, 0),
          moves,
        };
      })
      .filter((record) => record.totalUses > 0)
      .sort((a, b) => b.totalUses - a.totalUses || b.games - a.games || a.pokemonName.localeCompare(b.pokemonName));
  };

  const divisionRows = new Map<number, { seasonNumber: number; divisionName: string; rows: MoveUsageRow[] }>();
  for (const row of rows) {
    if (
      !row.match?.season
      || !row.match.division
      || row.match.season.seasonNumber < 9
      || row.match.winnerId === null
      || row.match.isForfeit
      || (row.match.winnerId !== row.match.coach1SeasonId && row.match.winnerId !== row.match.coach2SeasonId)
    ) continue;
    const existing = divisionRows.get(row.match.divisionId) ?? {
      seasonNumber: row.match.season.seasonNumber,
      divisionName: row.match.division.name,
      rows: [],
    };
    existing.rows.push(row);
    divisionRows.set(row.match.divisionId, existing);
  }

  return {
    divisions: [...divisionRows.entries()]
      .map(([divisionId, division]) => ({
        divisionId,
        seasonNumber: division.seasonNumber,
        divisionName: division.divisionName,
        records: aggregateRecords(division.rows),
      }))
      .filter((division) => division.records.length > 0)
      .sort(
        (a, b) =>
          b.seasonNumber - a.seasonNumber ||
          compareDivisionNames(a.divisionName, b.divisionName),
      ),
  };
}

type MatchRecord = {
  id: number;
  seasonId: number;
  divisionId: number;
  week: number;
  coach1SeasonId: number;
  coach2SeasonId: number;
  winnerId: number | null;
  coach1Differential: number | null;
  coach2Differential: number | null;
  isForfeit: boolean | null;
  playedAt: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  turnSnapshots: string | null;
  keyEvents: string | null;
};

function weekLabel(week: number) {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `W${week}`;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function parseTurnCount(match: Pick<MatchRecord, "turnSnapshots" | "keyEvents">) {
  let maxTurn = 0;

  for (const raw of [match.turnSnapshots, match.keyEvents]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Array<{ turn?: unknown }>;
      if (!Array.isArray(parsed)) continue;
      for (const entry of parsed) {
        if (typeof entry.turn === "number") {
          maxTurn = Math.max(maxTurn, entry.turn);
        }
      }
    } catch {
      // Ignore malformed historical replay metadata.
    }
  }

  return maxTurn;
}

type PboRecordScope = "regular-season" | "playoffs" | "overall";

type PeakEloRow = {
  coachId: number;
  eloRating: number;
  matchId: number | null;
};

type ChampionshipRow = {
  seasonId: number;
  divisionId: number;
  winnerId: number | null;
};

async function getPboRecordSourceData() {
  const [allCoaches, allSeasonCoaches, allMatches, allSeasons, allDivisions, allMatchPokemon, allEloHistory, championshipFinals] = await Promise.all([
    db.query.coaches.findMany({
      columns: {
        id: true,
        name: true,
      },
    }),
    db.query.seasonCoaches.findMany({
      columns: {
        id: true,
        coachId: true,
        divisionId: true,
        teamName: true,
      },
    }),
    db.query.matches.findMany({
      columns: {
        id: true,
        seasonId: true,
        divisionId: true,
        week: true,
        coach1SeasonId: true,
        coach2SeasonId: true,
        winnerId: true,
        coach1Differential: true,
        coach2Differential: true,
        isForfeit: true,
        playedAt: true,
        scheduledAt: true,
        startedAt: true,
        endedAt: true,
        turnSnapshots: true,
        keyEvents: true,
      },
      where: and(
        isNotNull(matches.winnerId),
        eq(matches.isForfeit, false),
        or(
          eq(matches.winnerId, matches.coach1SeasonId),
          eq(matches.winnerId, matches.coach2SeasonId)
        )
      ),
    }),
    db.query.seasons.findMany({
      columns: {
        id: true,
        seasonNumber: true,
      },
    }),
    db.query.divisions.findMany({
      columns: {
        id: true,
        seasonId: true,
        name: true,
      },
    }),
    db.query.matchPokemon.findMany({
      columns: {
        matchId: true,
        seasonCoachId: true,
        pokemonId: true,
        kills: true,
        deaths: true,
      },
      with: {
        pokemon: {
          columns: {
            name: true,
            displayName: true,
          },
        },
      },
    }),
    db.query.eloHistory.findMany({
      columns: {
        coachId: true,
        eloRating: true,
        matchId: true,
      },
    }),
    db.query.playoffMatches.findMany({
      columns: {
        seasonId: true,
        divisionId: true,
        winnerId: true,
        round: true,
      },
    }).then((rows) => rows.filter((row) => row.round === 3 && row.winnerId !== null)),
  ]);

  return { allCoaches, allSeasonCoaches, allMatches, allSeasons, allDivisions, allMatchPokemon, allEloHistory, championshipFinals };
}

type PboRecordSourceData = Awaited<ReturnType<typeof getPboRecordSourceData>>;

function getPboRecords(
  sourceData: PboRecordSourceData,
  scope: PboRecordScope,
  divisionRecordName?: DivisionRecordName,
): PboRecordCategory[] {
  const {
    allCoaches,
    allSeasonCoaches,
    allMatches: sourceMatches,
    allSeasons,
    allDivisions,
    allMatchPokemon,
    allEloHistory: sourceEloHistory,
    championshipFinals: sourceChampionshipFinals,
  } = sourceData;
  const sourceSeasonNumberById = new Map(allSeasons.map((season) => [season.id, season.seasonNumber]));
  const divisionIds = divisionRecordName
    ? new Set(
        allDivisions
          .filter((division) =>
            (sourceSeasonNumberById.get(division.seasonId) ?? 0) >= 6 &&
            division.name.trim().toLowerCase() === divisionRecordName.toLowerCase()
          )
          .map((division) => division.id)
      )
    : null;
  const allMatches = sourceMatches.filter((match) =>
    (scope === "regular-season" ? match.week <= 100 : scope === "playoffs" ? match.week > 100 : true) &&
    (!divisionIds || divisionIds.has(match.divisionId))
  );
  const completedMatchIds = new Set(allMatches.map((match) => match.id));
  const allEloHistory = scope === "overall"
    ? sourceEloHistory.filter((entry) => !divisionIds || (entry.matchId !== null && completedMatchIds.has(entry.matchId)))
    : [] as PeakEloRow[];
  const championshipFinals = scope === "regular-season"
    ? [] as ChampionshipRow[]
    : sourceChampionshipFinals.filter((final) => !divisionIds || divisionIds.has(final.divisionId));

  const coachById = new Map(allCoaches.map((coach) => [coach.id, coach]));
  const seasonCoachById = new Map(allSeasonCoaches.map((seasonCoach) => [seasonCoach.id, seasonCoach]));
  const seasonNumberById = new Map(allSeasons.map((season) => [season.id, season.seasonNumber]));
  const divisionNameById = new Map(allDivisions.map((division) => [division.id, division.name]));
  const completedMatchById = new Map(allMatches.map((match) => [match.id, match]));

  const matchSortValue = (match: MatchRecord) =>
    (seasonNumberById.get(match.seasonId) ?? 0) * 100000 + match.week * 100 + match.id;

  const matchLabel = (match: MatchRecord) => {
    const seasonNumber = seasonNumberById.get(match.seasonId) ?? "?";
    const divisionName = divisionNameById.get(match.divisionId) ?? "Unknown";
    const coach1 = seasonCoachById.get(match.coach1SeasonId)?.teamName ?? "Unknown";
    const coach2 = seasonCoachById.get(match.coach2SeasonId)?.teamName ?? "Unknown";
    return `S${seasonNumber} ${divisionName} ${weekLabel(match.week)}: ${coach1} vs ${coach2}`;
  };

  const seasonTeamLabel = (seasonCoachId: number, seasonId: number) => {
    const seasonCoach = seasonCoachById.get(seasonCoachId);
    const seasonNumber = seasonNumberById.get(seasonId) ?? "?";
    const divisionName = seasonCoach ? divisionNameById.get(seasonCoach.divisionId) : null;
    return `S${seasonNumber}${divisionName ? ` ${divisionName}` : ""} - ${seasonCoach?.teamName ?? "Unknown"}`;
  };

  const topThree = <T,>(rows: T[]) => rows.slice(0, 3);

  const coachCareerStats = new Map<number, {
    coachId: number;
    wins: number;
    losses: number;
    games: number;
  }>();

  const getCoachCareerStats = (coachId: number) => {
    const existing = coachCareerStats.get(coachId);
    if (existing) return existing;

    const created = { coachId, wins: 0, losses: 0, games: 0 };
    coachCareerStats.set(coachId, created);
    return created;
  };

  for (const match of allMatches) {
    for (const seasonCoachId of [match.coach1SeasonId, match.coach2SeasonId]) {
      const seasonCoach = seasonCoachById.get(seasonCoachId);
      if (!seasonCoach) continue;

      const stats = getCoachCareerStats(seasonCoach.coachId);
      const won = match.winnerId === seasonCoachId;
      stats.games += 1;
      stats.wins += won ? 1 : 0;
      stats.losses += won ? 0 : 1;
    }
  }

  const scopeName = divisionRecordName
    ? `Season 6+ ${divisionRecordName}${scope === "regular-season" ? " regular-season" : scope === "playoffs" ? " playoff" : ""}`
    : scope === "regular-season"
      ? "regular-season"
      : scope === "playoffs"
        ? "playoff"
        : "all-time";
  const formatCareerRecord = (
    row: { coachId: number; wins: number; losses: number; games: number },
    value: string,
  ): PboRecordEntry => ({
    title: `${coachById.get(row.coachId)?.name ?? "Unknown"} — ${value}`,
    detail: `${row.wins}-${row.losses} across ${row.games} ${scopeName} matches`,
    href: `/coaches/${row.coachId}`,
  });
  const careerRows = [...coachCareerStats.values()];
  const mostCareerWins = topThree(
    [...careerRows].sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.games - a.games),
  ).map((row) => formatCareerRecord(row, `${row.wins} wins`));
  const mostCareerLosses = topThree(
    [...careerRows].sort((a, b) => b.losses - a.losses || b.games - a.games || b.wins - a.wins),
  ).map((row) => formatCareerRecord(row, `${row.losses} losses`));
  const mostMatchesPlayed = topThree(
    [...careerRows].sort((a, b) => b.games - a.games || b.wins - a.wins || a.losses - b.losses),
  ).map((row) => formatCareerRecord(row, `${row.games} matches`));
  const championshipStats = new Map<number, { coachId: number; count: number; labels: string[] }>();
  for (const final of championshipFinals) {
    if (!final.winnerId) continue;
    const seasonCoach = seasonCoachById.get(final.winnerId);
    if (!seasonCoach) continue;

    const existing = championshipStats.get(seasonCoach.coachId) ?? {
      coachId: seasonCoach.coachId,
      count: 0,
      labels: [],
    };
    const seasonNumber = seasonNumberById.get(final.seasonId) ?? "?";
    const divisionName = divisionNameById.get(final.divisionId) ?? "Unknown";
    existing.count += 1;
    existing.labels.push(`S${seasonNumber} ${divisionName}`);
    championshipStats.set(seasonCoach.coachId, existing);
  }
  const mostChampionships = topThree(
    [...championshipStats.values()].sort((a, b) => b.count - a.count || a.coachId - b.coachId),
  ).map<PboRecordEntry>((row) => ({
    title: `${coachById.get(row.coachId)?.name ?? "Unknown"} — ${row.count} ${row.count === 1 ? "championship" : "championships"}`,
    detail: row.labels.join(", "),
    href: `/coaches/${row.coachId}`,
  }));

  const peakEloByCoach = new Map<number, PeakEloRow>();
  for (const entry of allEloHistory) {
    const current = peakEloByCoach.get(entry.coachId);
    if (!current || entry.eloRating > current.eloRating) peakEloByCoach.set(entry.coachId, entry);
  }
  const highestPeakElo = topThree(
    [...peakEloByCoach.values()].sort((a, b) => b.eloRating - a.eloRating || a.coachId - b.coachId),
  ).map<PboRecordEntry>((row) => ({
    title: `${coachById.get(row.coachId)?.name ?? "Unknown"} — ${Math.round(row.eloRating)} Elo`,
    detail: row.matchId ? `Peak recorded after match #${row.matchId}` : "Peak recorded at Elo placement",
    href: `/coaches/${row.coachId}`,
  }));

  const seasonsByCoach = new Map<number, Set<number>>();
  for (const match of allMatches) {
    const seasonNumber = seasonNumberById.get(match.seasonId);
    if (seasonNumber === undefined) continue;

    for (const seasonCoachId of [match.coach1SeasonId, match.coach2SeasonId]) {
      const seasonCoach = seasonCoachById.get(seasonCoachId);
      if (!seasonCoach) continue;
      const seasonNumbers = seasonsByCoach.get(seasonCoach.coachId) ?? new Set<number>();
      seasonNumbers.add(seasonNumber);
      seasonsByCoach.set(seasonCoach.coachId, seasonNumbers);
    }
  }
  const seasonStreaks: Array<{ coachId: number; count: number; startSeason: number; endSeason: number }> = [];
  for (const [coachId, seasonNumbers] of seasonsByCoach) {
    const ordered = [...seasonNumbers].sort((a, b) => a - b);
    let startSeason = ordered[0];
    let endSeason = ordered[0];
    for (const seasonNumber of ordered.slice(1)) {
      if (seasonNumber === endSeason + 1) {
        endSeason = seasonNumber;
      } else {
        seasonStreaks.push({ coachId, count: endSeason - startSeason + 1, startSeason, endSeason });
        startSeason = seasonNumber;
        endSeason = seasonNumber;
      }
    }
    if (startSeason !== undefined && endSeason !== undefined) {
      seasonStreaks.push({ coachId, count: endSeason - startSeason + 1, startSeason, endSeason });
    }
  }
  const mostConsecutiveSeasons = topThree(
    seasonStreaks.sort((a, b) => b.count - a.count || b.endSeason - a.endSeason || a.coachId - b.coachId),
  ).map<PboRecordEntry>((row) => ({
    title: `${coachById.get(row.coachId)?.name ?? "Unknown"} — ${row.count} consecutive ${row.count === 1 ? "season" : "seasons"}`,
    detail: row.startSeason === row.endSeason ? `S${row.startSeason}` : `S${row.startSeason} through S${row.endSeason}`,
    href: `/coaches/${row.coachId}`,
  }));

  const teamSeasonDifferential = new Map<number, {
    seasonCoachId: number;
    wins: number;
    losses: number;
    differential: number;
    lastMatchSort: number;
  }>();

  for (const match of allMatches) {
    for (const participant of [
      { seasonCoachId: match.coach1SeasonId, differential: match.coach1Differential ?? 0 },
      { seasonCoachId: match.coach2SeasonId, differential: match.coach2Differential ?? 0 },
    ]) {
      const existing = teamSeasonDifferential.get(participant.seasonCoachId) ?? {
        seasonCoachId: participant.seasonCoachId,
        wins: 0,
        losses: 0,
        differential: 0,
        lastMatchSort: 0,
      };
      const won = match.winnerId === participant.seasonCoachId;

      existing.wins += won ? 1 : 0;
      existing.losses += won ? 0 : 1;
      existing.differential += participant.differential;
      existing.lastMatchSort = Math.max(existing.lastMatchSort, matchSortValue(match));
      teamSeasonDifferential.set(participant.seasonCoachId, existing);
    }
  }

  const formatTeamSeasonDifferential = (row: {
    seasonCoachId: number;
    wins: number;
    losses: number;
    differential: number;
  }): PboRecordEntry => {
    const seasonCoach = seasonCoachById.get(row.seasonCoachId);
    const division = seasonCoach ? allDivisions.find((div) => div.id === seasonCoach.divisionId) : null;
    const seasonId = division?.seasonId;
    const seasonNumber = seasonId ? seasonNumberById.get(seasonId) : null;
    const signedDifferential = `${row.differential > 0 ? "+" : ""}${row.differential}`;

    return {
      title: `${seasonCoach?.teamName ?? "Unknown"} — ${row.wins}-${row.losses}, ${signedDifferential}`,
      detail: `S${seasonNumber ?? "?"}${division ? ` ${division.name}` : ""} — Final ${scope === "regular-season" ? "regular-season" : scope === "playoffs" ? "playoff" : "overall"} differential`,
      href: seasonCoach ? `/coaches/${seasonCoach.coachId}` : undefined,
    };
  };

  const bestDifferential = topThree(
    [...teamSeasonDifferential.values()].sort((a, b) =>
      b.differential - a.differential || b.wins - a.wins || a.losses - b.losses || b.lastMatchSort - a.lastMatchSort
    )
  ).map(formatTeamSeasonDifferential);

  const worstDifferential = topThree(
    [...teamSeasonDifferential.values()].sort((a, b) =>
      a.differential - b.differential || b.losses - a.losses || a.wins - b.wins || b.lastMatchSort - a.lastMatchSort
    )
  ).map(formatTeamSeasonDifferential);

  const streakMatchesByCoach = new Map<number, Array<{ match: MatchRecord; won: boolean; teamName: string }>>();
  for (const match of allMatches) {
    for (const seasonCoachId of [match.coach1SeasonId, match.coach2SeasonId]) {
      const seasonCoach = seasonCoachById.get(seasonCoachId);
      if (!seasonCoach) continue;
      const list = streakMatchesByCoach.get(seasonCoach.coachId) ?? [];
      list.push({
        match,
        won: match.winnerId === seasonCoachId,
        teamName: seasonCoach.teamName,
      });
      streakMatchesByCoach.set(seasonCoach.coachId, list);
    }
  }

  const streaks: Array<{
    coachId: number;
    teamName: string;
    type: "win" | "loss";
    count: number;
    start: MatchRecord;
    end: MatchRecord;
  }> = [];

  for (const [coachId, rows] of streakMatchesByCoach) {
    const ordered = rows.sort((a, b) => matchSortValue(a.match) - matchSortValue(b.match));
    let current: typeof streaks[number] | null = null;

    for (const row of ordered) {
      const type = row.won ? "win" : "loss";
      if (!current || current.type !== type) {
        current = {
          coachId,
          teamName: row.teamName,
          type,
          count: 1,
          start: row.match,
          end: row.match,
        };
        streaks.push(current);
      } else {
        current.count += 1;
        current.end = row.match;
        current.teamName = row.teamName;
      }
    }
  }

  const formatStreak = (streak: typeof streaks[number]): PboRecordEntry => ({
    title: `${streak.teamName} — ${streak.count} consecutive ${streak.type === "win" ? "wins" : "losses"}`,
    detail: `${coachById.get(streak.coachId)?.name ?? "Unknown"} — From ${matchLabel(streak.start)} through ${matchLabel(streak.end)}`,
    href: `/coaches/${streak.coachId}`,
  });

  const mostWinsInRow = topThree(
    streaks.filter((streak) => streak.type === "win").sort((a, b) => b.count - a.count || a.coachId - b.coachId)
  ).map(formatStreak);

  const mostLossesInRow = topThree(
    streaks.filter((streak) => streak.type === "loss").sort((a, b) => b.count - a.count || a.coachId - b.coachId)
  ).map(formatStreak);

  const playoffSeasonsByCoach = new Map<number, Map<number, string>>();
  if (scope === "playoffs") {
    for (const match of allMatches) {
      const seasonNumber = seasonNumberById.get(match.seasonId);
      if (seasonNumber === undefined) continue;

      for (const seasonCoachId of [match.coach1SeasonId, match.coach2SeasonId]) {
        const seasonCoach = seasonCoachById.get(seasonCoachId);
        if (!seasonCoach) continue;

        const seasons = playoffSeasonsByCoach.get(seasonCoach.coachId) ?? new Map<number, string>();
        seasons.set(seasonNumber, seasonCoach.teamName);
        playoffSeasonsByCoach.set(seasonCoach.coachId, seasons);
      }
    }
  }

  const playoffAppearanceStreaks: Array<{
    coachId: number;
    teamName: string;
    count: number;
    startSeason: number;
    endSeason: number;
  }> = [];

  for (const [coachId, seasonTeams] of playoffSeasonsByCoach) {
    const seasonNumbers = [...seasonTeams.keys()].sort((a, b) => a - b);
    let current: typeof playoffAppearanceStreaks[number] | null = null;

    for (const seasonNumber of seasonNumbers) {
      if (!current || seasonNumber !== current.endSeason + 1) {
        current = {
          coachId,
          teamName: seasonTeams.get(seasonNumber) ?? "Unknown",
          count: 1,
          startSeason: seasonNumber,
          endSeason: seasonNumber,
        };
        playoffAppearanceStreaks.push(current);
      } else {
        current.count += 1;
        current.endSeason = seasonNumber;
        current.teamName = seasonTeams.get(seasonNumber) ?? current.teamName;
      }
    }
  }

  const mostConsecutivePlayoffAppearances = topThree(
    playoffAppearanceStreaks.sort((a, b) =>
      b.count - a.count || b.endSeason - a.endSeason || a.coachId - b.coachId
    )
  ).map<PboRecordEntry>((streak) => ({
    title: `${coachById.get(streak.coachId)?.name ?? "Unknown"} — ${streak.count} consecutive ${streak.count === 1 ? "appearance" : "appearances"}`,
    detail: `${streak.teamName} — S${streak.startSeason}${streak.startSeason === streak.endSeason ? "" : ` through S${streak.endSeason}`}`,
    href: `/coaches/${streak.coachId}`,
  }));

  const longestByTurns = topThree(
    allMatches
      .map((match) => ({ match, turns: parseTurnCount(match) }))
      .filter((row) => row.turns > 0)
      .sort((a, b) => b.turns - a.turns || matchSortValue(b.match) - matchSortValue(a.match))
  ).map<PboRecordEntry>((row) => ({
    title: `${row.turns} turns`,
    detail: matchLabel(row.match),
    href: `/matches/${row.match.id}`,
  }));

  const fastestByTurns = topThree(
    allMatches
      .map((match) => ({ match, turns: parseTurnCount(match) }))
      .filter((row) => row.turns > 0)
      .sort((a, b) => a.turns - b.turns || matchSortValue(b.match) - matchSortValue(a.match))
  ).map<PboRecordEntry>((row) => ({
    title: `${row.turns} turns`,
    detail: matchLabel(row.match),
    href: `/matches/${row.match.id}`,
  }));

  const longestByTime = topThree(
    allMatches
      .map((match) => {
        const start = Date.parse(match.startedAt ?? "");
        const end = Date.parse(match.endedAt ?? "");
        return {
          match,
          durationMs: Number.isNaN(start) || Number.isNaN(end) ? 0 : end - start,
        };
      })
      .filter((row) => row.durationMs > 0)
      .sort((a, b) => b.durationMs - a.durationMs || matchSortValue(b.match) - matchSortValue(a.match))
  ).map<PboRecordEntry>((row) => ({
    title: formatDuration(row.durationMs),
    detail: matchLabel(row.match),
    href: `/matches/${row.match.id}`,
  }));

  const fastestByTime = topThree(
    allMatches
      .map((match) => {
        const start = Date.parse(match.startedAt ?? "");
        const end = Date.parse(match.endedAt ?? "");
        return {
          match,
          durationMs: Number.isNaN(start) || Number.isNaN(end) ? 0 : end - start,
        };
      })
      .filter((row) => row.durationMs > 0)
      .sort((a, b) => a.durationMs - b.durationMs || matchSortValue(b.match) - matchSortValue(a.match))
  ).map<PboRecordEntry>((row) => ({
    title: formatDuration(row.durationMs),
    detail: matchLabel(row.match),
    href: `/matches/${row.match.id}`,
  }));

  const pokemonSeasonStats = new Map<string, {
    seasonId: number;
    seasonCoachId: number;
    pokemonId: number;
    pokemonName: string;
    kills: number;
    deaths: number;
    games: number;
  }>();

  for (const row of allMatchPokemon) {
    const match = completedMatchById.get(row.matchId);
    if (!match) continue;

    const key = `${match.seasonId}-${row.seasonCoachId}-${row.pokemonId}`;
    const existing = pokemonSeasonStats.get(key) ?? {
      seasonId: match.seasonId,
      seasonCoachId: row.seasonCoachId,
      pokemonId: row.pokemonId,
      pokemonName: row.pokemon?.displayName || row.pokemon?.name || "Unknown",
      kills: 0,
      deaths: 0,
      games: 0,
    };
    existing.kills += row.kills ?? 0;
    existing.deaths += row.deaths ?? 0;
    existing.games += 1;
    pokemonSeasonStats.set(key, existing);
  }

  const mostDeaths = topThree(
    [...pokemonSeasonStats.values()]
      .filter((row) => row.deaths > 0)
      .sort((a, b) => b.deaths - a.deaths || a.kills - b.kills || b.games - a.games)
  ).map<PboRecordEntry>((row) => ({
    title: `${row.pokemonName} ${row.kills}-${row.deaths}`,
    detail: seasonTeamLabel(row.seasonCoachId, row.seasonId),
    href: `/pokemon/${row.pokemonId}`,
  }));

  const bestKd = topThree(
    [...pokemonSeasonStats.values()]
      .filter((row) => row.kills >= 5)
      .sort((a, b) => {
        const aInfinite = a.deaths === 0;
        const bInfinite = b.deaths === 0;
        if (aInfinite !== bInfinite) return aInfinite ? -1 : 1;
        const aRatio = a.deaths === 0 ? a.kills : a.kills / a.deaths;
        const bRatio = b.deaths === 0 ? b.kills : b.kills / b.deaths;
        return bRatio - aRatio || b.kills - a.kills || a.deaths - b.deaths;
      })
  ).map<PboRecordEntry>((row) => ({
    title: `${row.pokemonName} ${row.kills}/${row.deaths}`,
    detail: seasonTeamLabel(row.seasonCoachId, row.seasonId),
    href: `/pokemon/${row.pokemonId}`,
  }));

  const scopedRecordLabel = divisionRecordName
    ? `${divisionRecordName}${scope === "regular-season" ? " Regular-Season" : scope === "playoffs" ? " Playoff" : ""}`
    : scope === "regular-season"
      ? "Regular-Season"
      : scope === "playoffs"
        ? "Playoff"
        : "All-Time";
  const categories: PboRecordCategory[] = [
    { title: `Most ${scopedRecordLabel} Wins`, entries: mostCareerWins },
    { title: `Most ${scopedRecordLabel} Losses`, entries: mostCareerLosses },
    { title: scope === "overall" ? "Most Matches Played" : `Most ${scopedRecordLabel} Matches`, entries: mostMatchesPlayed },
  ];

  if (scope !== "regular-season" && !divisionRecordName) {
    categories.push({ title: "Most Championships", entries: mostChampionships });
  }

  if (scope === "overall" && !divisionRecordName) {
    categories.push(
      { title: "Highest Peak Elo", entries: highestPeakElo },
      { title: "Most Consecutive Seasons Played", entries: mostConsecutiveSeasons },
    );
  }

  if (scope === "playoffs") {
    categories.push({
      title: "Most Consecutive Playoff Appearances",
      entries: mostConsecutivePlayoffAppearances,
    });
  }

  categories.push(
    { title: "Most Wins in a Row", entries: mostWinsInRow },
    { title: "Most Losses in a Row", entries: mostLossesInRow },
    { title: "Best Differential", entries: bestDifferential },
  );

  if (scope !== "playoffs") {
    categories.push({ title: "Worst Differential", entries: worstDifferential });
  }

  categories.push(
    { title: "Most Deaths", entries: mostDeaths },
    { title: "Longest Game (Turns)", entries: longestByTurns },
    { title: "Longest Game (Duration)", entries: longestByTime },
    { title: "Fastest Game (Turns)", entries: fastestByTurns },
    { title: "Fastest Game (Duration)", entries: fastestByTime },
    { title: "Best K/D Ratio", entries: bestKd },
  );

  return categories;
}

const getCachedBattleRecords = unstable_cache(
  getBattleRecords,
  ["battle-record-coach-records-v1"],
  { revalidate: 60, tags: ["battle-record-public-data"] },
);

const getCachedPokemonMoveRecords = unstable_cache(
  getPokemonMoveRecords,
  ["battle-record-pokemon-moves-v1"],
  { revalidate: 60, tags: ["battle-record-public-data"] },
);

const getCachedPboRecordData = unstable_cache(
  async () => {
    const sourceData = await getPboRecordSourceData();
    return {
      regularSeasonRecords: getPboRecords(sourceData, "regular-season"),
      playoffRecords: getPboRecords(sourceData, "playoffs"),
      overallRecords: getPboRecords(sourceData, "overall"),
      divisionalRecords: divisionRecordNames.map((divisionName) => ({
        divisionName,
        regularSeasonRecords: getPboRecords(sourceData, "regular-season", divisionName),
        playoffRecords: getPboRecords(sourceData, "playoffs", divisionName),
        overallRecords: getPboRecords(sourceData, "overall", divisionName),
      })),
    };
  },
  ["battle-record-pbo-and-divisional-records-v1"],
  { revalidate: 60, tags: ["battle-record-public-data"] },
);

type BattleRecordPageProps = {
  searchParams: Promise<{ tab?: string; scope?: string; division?: string }>;
};

export default async function BattleRecordPage({ searchParams }: BattleRecordPageProps) {
  const { tab, scope, division } = await searchParams;
  const initialTab: BattleRecordTab = tab === "move-usage"
    ? "pokemon-moves"
    : tab === "divisional-records"
      ? "divisional-records"
    : tab === "pbo-records"
      ? "pbo-records"
      : "coach-records";
  const requestedScope: PboRecordScope | null = scope === "regular-season"
    ? "regular-season"
    : scope === "playoffs"
      ? "playoffs"
      : scope === "overall"
        ? "overall"
        : null;
  const initialPboScope = requestedScope ?? "regular-season";
  const initialDivisionScope = requestedScope ?? "overall";
  const [battleRecordData, pboRecordData, manualOverrides, pokemonMoveRecords] = await Promise.all([
    getCachedBattleRecords(),
    getCachedPboRecordData(),
    getBattleRecordOverrides(true),
    getCachedPokemonMoveRecords(),
  ]);
  const regularSeasonPboRecords = applyBattleRecordOverrides(
    pboRecordData.regularSeasonRecords,
    "regular-season",
    manualOverrides
  );
  const playoffPboRecords = applyBattleRecordOverrides(
    pboRecordData.playoffRecords,
    "playoffs",
    manualOverrides
  );

  return (
    <BattleRecordView
      key={`${initialTab}-${requestedScope ?? "default"}-${division ?? "all"}`}
      initialTab={initialTab}
      initialPboRecordScope={initialPboScope}
      initialDivisionRecordScope={initialDivisionScope}
      initialDivisionRecordName={division}
      records={battleRecordData}
      divisionalPboRecords={pboRecordData.divisionalRecords}
      regularSeasonPboRecords={regularSeasonPboRecords}
      playoffPboRecords={playoffPboRecords}
      overallPboRecords={pboRecordData.overallRecords}
      pokemonMoveDivisions={pokemonMoveRecords.divisions}
    />
  );
}
