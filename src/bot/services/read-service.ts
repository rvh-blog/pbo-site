import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  coaches,
  matchPokemon,
  matches,
  pokemon,
  rosters,
  seasonCoaches,
} from "@/lib/schema";

export interface TeamSummary {
  id: number;
  teamName: string;
  coachName: string;
  remainingBudget: number;
}

export interface TeamProfile extends TeamSummary {
  wins: number;
  losses: number;
  differential: number;
  roster: Array<{
    name: string;
    price: number;
    isTeraCaptain: boolean;
  }>;
  nextMatch: {
    matchId: number;
    week: number;
    opponent: string;
    scheduledAt: string | null;
  } | null;
}

export async function getDivisionTeams(divisionId: number): Promise<TeamSummary[]> {
  const rows = await db
    .select({
      id: seasonCoaches.id,
      teamName: seasonCoaches.teamName,
      coachName: coaches.name,
      remainingBudget: seasonCoaches.remainingBudget,
    })
    .from(seasonCoaches)
    .innerJoin(coaches, eq(seasonCoaches.coachId, coaches.id))
    .where(and(
      eq(seasonCoaches.divisionId, divisionId),
      eq(seasonCoaches.isActive, true)
    ))
    .orderBy(asc(seasonCoaches.teamName));

  return rows.map((row) => ({
    ...row,
    remainingBudget: row.remainingBudget ?? 0,
  }));
}

export async function getTeamProfile(
  divisionId: number,
  seasonCoachId: number
): Promise<TeamProfile | null> {
  const teams = await getDivisionTeams(divisionId);
  const selected = teams.find((team) => team.id === seasonCoachId);
  if (!selected) return null;

  const [rosterRows, divisionMatches] = await Promise.all([
    db
      .select({
        name: sql<string>`coalesce(${pokemon.displayName}, ${pokemon.name})`,
        price: rosters.price,
        isTeraCaptain: rosters.isTeraCaptain,
      })
      .from(rosters)
      .innerJoin(pokemon, eq(rosters.pokemonId, pokemon.id))
      .where(eq(rosters.seasonCoachId, seasonCoachId))
      .orderBy(asc(rosters.draftOrder), asc(pokemon.name)),
    db
      .select()
      .from(matches)
      .where(eq(matches.divisionId, divisionId)),
  ]);

  const completed = divisionMatches.filter((match) =>
    match.winnerId !== null &&
    (match.coach1SeasonId === seasonCoachId || match.coach2SeasonId === seasonCoachId)
  );
  const wins = completed.filter((match) => match.winnerId === seasonCoachId).length;
  const losses = completed.length - wins;
  const differential = completed.reduce((total, match) => {
    return total + (match.coach1SeasonId === seasonCoachId
      ? (match.coach1Differential ?? 0)
      : (match.coach2Differential ?? 0));
  }, 0);

  const next = divisionMatches
    .filter((match) => match.winnerId === null &&
      (match.coach1SeasonId === seasonCoachId || match.coach2SeasonId === seasonCoachId))
    .sort((a, b) => {
      const aScheduled = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bScheduled = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aScheduled - bScheduled || a.week - b.week || a.id - b.id;
    })[0];
  const teamNames = new Map(teams.map((team) => [team.id, team.teamName]));

  return {
    ...selected,
    wins,
    losses,
    differential,
    roster: rosterRows.map((row) => ({
      name: row.name,
      price: row.price,
      isTeraCaptain: row.isTeraCaptain ?? false,
    })),
    nextMatch: next ? {
      matchId: next.id,
      week: next.week,
      opponent: teamNames.get(
        next.coach1SeasonId === seasonCoachId
          ? next.coach2SeasonId
          : next.coach1SeasonId
      ) ?? "Unknown opponent",
      scheduledAt: next.scheduledAt,
    } : null,
  };
}

export async function getDivisionStandings(divisionId: number): Promise<Array<{
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  differential: number;
}>> {
  const [teams, divisionMatches] = await Promise.all([
    getDivisionTeams(divisionId),
    db.select().from(matches).where(eq(matches.divisionId, divisionId)),
  ]);

  return teams.map((team) => {
    const completed = divisionMatches.filter((match) =>
      match.winnerId !== null &&
      (match.coach1SeasonId === team.id || match.coach2SeasonId === team.id)
    );
    return {
      teamId: team.id,
      teamName: team.teamName,
      wins: completed.filter((match) => match.winnerId === team.id).length,
      losses: completed.filter((match) => match.winnerId !== team.id).length,
      differential: completed.reduce((total, match) =>
        total + (match.coach1SeasonId === team.id
          ? (match.coach1Differential ?? 0)
          : (match.coach2Differential ?? 0)), 0),
    };
  }).sort((a, b) =>
    b.wins - a.wins ||
    a.losses - b.losses ||
    b.differential - a.differential ||
    a.teamName.localeCompare(b.teamName)
  );
}

export async function getUpcomingDivisionMatches(divisionId: number): Promise<Array<{
  matchId: number;
  week: number;
  team1Name: string;
  team2Name: string;
  team1Id: number;
  team2Id: number;
  scheduledAt: string | null;
}>> {
  const [teams, rows] = await Promise.all([
    getDivisionTeams(divisionId),
    db.select().from(matches).where(and(
      eq(matches.divisionId, divisionId),
      sql`${matches.winnerId} is null`
    )),
  ]);
  const names = new Map(teams.map((team) => [team.id, team.teamName]));
  return rows.map((match) => ({
    matchId: match.id,
    week: match.week,
    team1Name: names.get(match.coach1SeasonId) ?? "Unknown",
    team2Name: names.get(match.coach2SeasonId) ?? "Unknown",
    team1Id: match.coach1SeasonId,
    team2Id: match.coach2SeasonId,
    scheduledAt: match.scheduledAt,
  })).sort((a, b) => {
    const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime || a.week - b.week || a.matchId - b.matchId;
  });
}

export async function getPokemonPerformance(
  divisionId: number,
  search: string,
  seasonCoachId?: number
): Promise<{
  name: string;
  spriteUrl: string | null;
  types: string[];
  games: number;
  kills: number;
  deaths: number;
  wins: number;
  itemCounts: Array<{ item: string; count: number }>;
} | null> {
  const query = `%${search.toLowerCase()}%`;
  const candidates = await db
    .select({
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      spriteUrl: pokemon.spriteUrl,
      types: pokemon.types,
    })
    .from(pokemon)
    .where(or(
      like(sql`lower(${pokemon.name})`, query),
      like(sql`lower(coalesce(${pokemon.displayName}, ''))`, query)
    ))
    .limit(10);
  const found = candidates.sort((a, b) => {
    const aName = (a.displayName ?? a.name).toLowerCase();
    const bName = (b.displayName ?? b.name).toLowerCase();
    return Number(bName === search.toLowerCase()) - Number(aName === search.toLowerCase());
  })[0];
  if (!found) return null;

  const performanceConditions = [
    eq(matches.divisionId, divisionId),
    eq(matchPokemon.pokemonId, found.id),
  ];
  if (seasonCoachId !== undefined) {
    performanceConditions.push(eq(matchPokemon.seasonCoachId, seasonCoachId));
  }
  const rows = await db
    .select({
      kills: matchPokemon.kills,
      deaths: matchPokemon.deaths,
      seasonCoachId: matchPokemon.seasonCoachId,
      winnerId: matches.winnerId,
      revealedItems: matchPokemon.revealedItems,
    })
    .from(matchPokemon)
    .innerJoin(matches, eq(matchPokemon.matchId, matches.id))
    .where(and(...performanceConditions));
  const itemMap = new Map<string, { item: string; count: number }>();
  for (const row of rows) {
    const uniqueItems = new Set((row.revealedItems ?? []).map((item) => item.item));
    for (const item of uniqueItems) {
      const key = item.toLowerCase();
      const current = itemMap.get(key) ?? { item, count: 0 };
      current.count += 1;
      itemMap.set(key, current);
    }
  }

  return {
    name: found.displayName ?? found.name,
    spriteUrl: found.spriteUrl,
    types: found.types ?? [],
    games: rows.length,
    kills: rows.reduce((sum, row) => sum + (row.kills ?? 0), 0),
    deaths: rows.reduce((sum, row) => sum + (row.deaths ?? 0), 0),
    wins: rows.filter((row) => row.winnerId === row.seasonCoachId).length,
    itemCounts: [...itemMap.values()].sort((a, b) => b.count - a.count || a.item.localeCompare(b.item)),
  };
}

export async function getDivisionItemUsage(
  divisionId: number,
  seasonCoachId?: number
): Promise<Array<{
  item: string;
  reveals: number;
  pokemon: string[];
}>> {
  const itemConditions = [eq(matches.divisionId, divisionId)];
  if (seasonCoachId !== undefined) {
    itemConditions.push(eq(matchPokemon.seasonCoachId, seasonCoachId));
  }
  const rows = await db
    .select({
      pokemonName: sql<string>`coalesce(${pokemon.displayName}, ${pokemon.name})`,
      revealedItems: matchPokemon.revealedItems,
    })
    .from(matchPokemon)
    .innerJoin(matches, eq(matchPokemon.matchId, matches.id))
    .innerJoin(pokemon, eq(matchPokemon.pokemonId, pokemon.id))
    .where(and(...itemConditions));
  const itemMap = new Map<string, { item: string; reveals: number; pokemon: Set<string> }>();
  for (const row of rows) {
    const uniqueItems = new Set((row.revealedItems ?? []).map((item) => item.item));
    for (const item of uniqueItems) {
      const key = item.toLowerCase();
      const current = itemMap.get(key) ?? { item, reveals: 0, pokemon: new Set<string>() };
      current.reveals += 1;
      current.pokemon.add(row.pokemonName);
      itemMap.set(key, current);
    }
  }
  return [...itemMap.values()]
    .map((entry) => ({
      item: entry.item,
      reveals: entry.reveals,
      pokemon: [...entry.pokemon].sort(),
    }))
    .sort((a, b) => b.reveals - a.reveals || a.item.localeCompare(b.item));
}
