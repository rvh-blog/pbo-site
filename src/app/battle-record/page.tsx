import { db } from "@/lib/db";
import { and, eq, gt, gte, isNotNull, lte } from "drizzle-orm";
import { divisions, matches, matchPokemon, pokemon, seasons } from "@/lib/schema";
import type { BattleRecordRow } from "./battle-record-table";
import { BattleRecordView, type PboRecordCategory, type PboRecordEntry } from "./battle-record-tabs";
import type { PokemonMoveDivision, PokemonMoveRecord } from "./pokemon-move-records";
import {
  applyBattleRecordOverrides,
  getBattleRecordOverrides,
} from "@/lib/battle-record-overrides";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Battle Record",
};

async function getBattleRecords(): Promise<BattleRecordRow[]> {
  const [allCoaches, allSeasonCoaches, allMatches, allSeasons] = await Promise.all([
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
        teamLogoUrl: true,
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
        eq(matches.isForfeit, false)
      ),
    }),
    db.query.seasons.findMany({
      columns: {
        id: true,
        seasonNumber: true,
      },
    }),
  ]);

  const coachBySeasonCoachId = new Map(allSeasonCoaches.map((sc) => [sc.id, sc.coachId]));
  const coachNameById = new Map(allCoaches.map((coach) => [coach.id, coach.name]));
  const seasonNumberById = new Map(allSeasons.map((season) => [season.id, season.seasonNumber]));
  const coachLogoMap = new Map<number, string | null>();
  const sortedSeasonCoaches = [...allSeasonCoaches].sort((a, b) => b.id - a.id);

  for (const seasonCoach of sortedSeasonCoaches) {
    if (!coachLogoMap.has(seasonCoach.coachId) && seasonCoach.teamLogoUrl) {
      coachLogoMap.set(seasonCoach.coachId, seasonCoach.teamLogoUrl);
    }
  }

  const stats = new Map<number, {
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
  }>();

  function getStats(coachId: number) {
    const existing = stats.get(coachId);
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
    stats.set(coachId, created);
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

      const coachStats = getStats(coachId);
      const won = match.winnerId === participant.seasonCoachId;
      const absDifferential = Math.abs(participant.differential);
      const playedTime = Date.parse(match.endedAt ?? match.playedAt ?? match.scheduledAt ?? "");
      const seasonNumber = seasonNumberById.get(match.seasonId) ?? 0;
      const sortValue = Number.isNaN(playedTime)
        ? seasonNumber * 100000 + match.week * 100 + match.id
        : playedTime;

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

  return [...stats.entries()]
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

async function getPokemonMoveRecords(): Promise<{
  records: PokemonMoveRecord[];
  divisions: PokemonMoveDivision[];
}> {
  const rows = await db
    .select({
      pokemonId: matchPokemon.pokemonId,
      movesUsed: matchPokemon.movesUsed,
      pokemonName: pokemon.name,
      pokemonDisplayName: pokemon.displayName,
      spriteUrl: pokemon.spriteUrl,
      divisionId: matches.divisionId,
      divisionName: divisions.name,
      seasonNumber: seasons.seasonNumber,
    })
    .from(matchPokemon)
    .innerJoin(matches, eq(matchPokemon.matchId, matches.id))
    .innerJoin(pokemon, eq(matchPokemon.pokemonId, pokemon.id))
    .innerJoin(divisions, eq(matches.divisionId, divisions.id))
    .innerJoin(seasons, eq(matches.seasonId, seasons.id))
    .where(and(
      isNotNull(matches.winnerId),
      eq(matches.isForfeit, false),
      gte(seasons.seasonNumber, 9),
      isNotNull(matchPokemon.movesUsed),
    ));

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
      if (!row.movesUsed) continue;

      const record = records.get(row.pokemonId) ?? {
        pokemonId: row.pokemonId,
        pokemonName: row.pokemonDisplayName || row.pokemonName || "Unknown",
        spriteUrl: row.spriteUrl || null,
        games: 0,
        moves: new Map<string, { name: string; uses: number }>(),
      };
      record.games += 1;

      for (const [rawName, rawUses] of Object.entries(row.movesUsed)) {
        const uses = Number(rawUses);
        if (!rawName.trim() || !Number.isFinite(uses) || uses <= 0) continue;
        const key = rawName.trim().replace(/\s+/g, " ").toLowerCase();
        const move = record.moves.get(key) ?? { name: rawName.trim().replace(/\s+/g, " "), uses: 0 };
        move.uses += uses;
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
    const existing = divisionRows.get(row.divisionId) ?? {
      seasonNumber: row.seasonNumber,
      divisionName: row.divisionName,
      rows: [],
    };
    existing.rows.push(row);
    divisionRows.set(row.divisionId, existing);
  }

  return {
    records: aggregateRecords(rows),
    divisions: [...divisionRows.entries()]
      .map(([divisionId, division]) => ({
        divisionId,
        seasonNumber: division.seasonNumber,
        divisionName: division.divisionName,
        records: aggregateRecords(division.rows),
      }))
      .filter((division) => division.records.length > 0)
      .sort((a, b) => b.seasonNumber - a.seasonNumber || a.divisionName.localeCompare(b.divisionName)),
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

type PboRecordScope = "regular-season" | "playoffs";

async function getPboRecords(scope: PboRecordScope): Promise<PboRecordCategory[]> {
  const [allCoaches, allSeasonCoaches, allMatches, allRegularSeasonMatches, allSeasons, allDivisions, allMatchPokemon] = await Promise.all([
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
        scope === "regular-season" ? lte(matches.week, 100) : gt(matches.week, 100)
      ),
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
      where: lte(matches.week, 100),
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
  ]);

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

  const teamSeasonDifferential = new Map<number, {
    seasonCoachId: number;
    wins: number;
    losses: number;
    differential: number;
    lastMatchSort: number;
  }>();

  const differentialMatches = scope === "regular-season" ? allRegularSeasonMatches : allMatches;

  for (const match of differentialMatches) {
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
      detail: `S${seasonNumber ?? "?"}${division ? ` ${division.name}` : ""} — Final ${scope === "regular-season" ? "regular-season" : "playoff"} differential`,
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
    streaks.filter((streak) => streak.type === "win").sort((a, b) => b.count - a.count)
  ).map(formatStreak);

  const mostLossesInRow = topThree(
    streaks.filter((streak) => streak.type === "loss").sort((a, b) => b.count - a.count)
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

  const categories: PboRecordCategory[] = [
    { title: "Most Wins in a Row", entries: mostWinsInRow },
    { title: "Most Losses in a Row", entries: mostLossesInRow },
    { title: "Best Differential", entries: bestDifferential },
    { title: "Worst Differential", entries: worstDifferential },
    { title: "Most Deaths", entries: mostDeaths },
    { title: "Longest Game (Turns)", entries: longestByTurns },
    { title: "Longest Game (Duration)", entries: longestByTime },
    { title: "Fastest Game (Turns)", entries: fastestByTurns },
    { title: "Best K/D Ratio", entries: bestKd },
  ];

  if (scope === "playoffs") {
    categories.splice(2, 0, {
      title: "Most Consecutive Playoff Appearances",
      entries: mostConsecutivePlayoffAppearances,
    });
  }

  return categories;
}

export default async function BattleRecordPage() {
  const [battleRecords, calculatedRegularSeasonRecords, calculatedPlayoffRecords, manualOverrides, pokemonMoveRecords] = await Promise.all([
    getBattleRecords(),
    getPboRecords("regular-season"),
    getPboRecords("playoffs"),
    getBattleRecordOverrides(true),
    getPokemonMoveRecords(),
  ]);
  const regularSeasonPboRecords = applyBattleRecordOverrides(
    calculatedRegularSeasonRecords,
    "regular-season",
    manualOverrides
  );
  const playoffPboRecords = applyBattleRecordOverrides(
    calculatedPlayoffRecords,
    "playoffs",
    manualOverrides
  );

  return (
    <BattleRecordView
      records={battleRecords}
      regularSeasonPboRecords={regularSeasonPboRecords}
      playoffPboRecords={playoffPboRecords}
      pokemonMoveRecords={pokemonMoveRecords.records}
      pokemonMoveDivisions={pokemonMoveRecords.divisions}
    />
  );
}
