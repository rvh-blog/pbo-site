import { db } from "@/lib/db";
import {
  coaches,
  seasons,
  divisions,
  seasonCoaches,
  matches,
  matchPokemon,
  pokemon,
} from "@/lib/schema";
import { eq, and, like, desc, sql } from "drizzle-orm";
import { computeAndSortStandings } from "@/lib/standings-sort";

// ============= ELO QUERIES =============

export interface EloEntry {
  rank: number;
  name: string;
  elo: number;
  coachId: number;
}

/**
 * Get top 10 ELO rankings
 */
export async function getTopElo(limit: number = 10): Promise<EloEntry[]> {
  const result = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      elo: coaches.eloRating,
    })
    .from(coaches)
    .orderBy(desc(coaches.eloRating))
    .limit(limit);

  return result.map((c, i) => ({
    rank: i + 1,
    name: c.name,
    elo: Math.round(c.elo),
    coachId: c.id,
  }));
}

/**
 * Get ELO for coaches in a specific division
 */
export async function getDivisionElo(
  seasonNum: number,
  divisionName: string
): Promise<EloEntry[] | null> {
  // Find the season
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.seasonNumber, seasonNum),
  });

  if (!season) return null;

  // Find the division (case-insensitive partial match)
  const division = await db.query.divisions.findFirst({
    where: and(
      eq(divisions.seasonId, season.id),
      like(sql`lower(${divisions.name})`, `%${divisionName.toLowerCase()}%`)
    ),
  });

  if (!division) return null;

  // Get season coaches for this division with their coach info
  const result = await db
    .select({
      coachId: coaches.id,
      name: coaches.name,
      elo: coaches.eloRating,
      teamName: seasonCoaches.teamName,
    })
    .from(seasonCoaches)
    .innerJoin(coaches, eq(seasonCoaches.coachId, coaches.id))
    .where(
      and(
        eq(seasonCoaches.divisionId, division.id),
        eq(seasonCoaches.isActive, true)
      )
    )
    .orderBy(desc(coaches.eloRating));

  return result.map((c, i) => ({
    rank: i + 1,
    name: c.name,
    elo: Math.round(c.elo),
    coachId: c.coachId,
  }));
}

/**
 * Get ELO for a specific coach by name
 */
export async function getCoachElo(
  coachName: string
): Promise<{ name: string; elo: number; rank: number; coachId: number } | null> {
  // Find coach by name (case-insensitive partial match)
  const coach = await db.query.coaches.findFirst({
    where: like(sql`lower(${coaches.name})`, `%${coachName.toLowerCase()}%`),
  });

  if (!coach) return null;

  // Get their rank
  const [rankResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(coaches)
    .where(sql`${coaches.eloRating} > ${coach.eloRating}`);

  const rank = (rankResult?.count || 0) + 1;

  return {
    name: coach.name,
    elo: Math.round(coach.eloRating),
    rank,
    coachId: coach.id,
  };
}

// ============= STANDINGS QUERIES =============

export interface StandingsEntry {
  rank: number;
  teamName: string;
  coachName: string;
  wins: number;
  losses: number;
  differential: number;
  seasonCoachId: number;
}

export interface StandingsResult {
  seasonName: string;
  divisionName: string;
  teams: StandingsEntry[];
}

/**
 * Get standings for a specific division
 */
export async function getStandings(
  seasonNum: number,
  divisionName: string
): Promise<StandingsResult | null> {
  // Find the season
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.seasonNumber, seasonNum),
  });

  if (!season) return null;

  // Find the division (case-insensitive partial match)
  const division = await db.query.divisions.findFirst({
    where: and(
      eq(divisions.seasonId, season.id),
      like(sql`lower(${divisions.name})`, `%${divisionName.toLowerCase()}%`)
    ),
  });

  if (!division) return null;

  // Get all matches for this division
  const divisionMatches = await db.query.matches.findMany({
    where: eq(matches.divisionId, division.id),
  });

  // Get all season coaches for this division (including inactive for replacement mapping)
  const allDivisionCoaches = await db
    .select({
      id: seasonCoaches.id,
      teamName: seasonCoaches.teamName,
      coachName: coaches.name,
      isActive: seasonCoaches.isActive,
      replacedById: seasonCoaches.replacedById,
    })
    .from(seasonCoaches)
    .innerJoin(coaches, eq(seasonCoaches.coachId, coaches.id))
    .where(eq(seasonCoaches.divisionId, division.id));

  // Build replacement map
  const replacementMap = new Map<number, number[]>();
  for (const sc of allDivisionCoaches) {
    if (!sc.isActive && sc.replacedById) {
      const predecessors = replacementMap.get(sc.replacedById) || [];
      predecessors.push(sc.id);
      replacementMap.set(sc.replacedById, predecessors);
    }
  }

  const activeCoaches = allDivisionCoaches.filter((sc) => sc.isActive);
  const sorted = computeAndSortStandings(activeCoaches, replacementMap, divisionMatches);

  const teams: StandingsEntry[] = sorted.map((s) => {
    const coach = allDivisionCoaches.find((c) => c.id === s.id)!;
    return {
      rank: 0,
      teamName: coach.teamName,
      coachName: coach.coachName,
      wins: s.wins,
      losses: s.losses,
      differential: s.differential,
      seasonCoachId: s.id,
    };
  });

  // Assign ranks
  teams.forEach((team, i) => {
    team.rank = i + 1;
  });

  return {
    seasonName: season.name,
    divisionName: division.name,
    teams,
  };
}

// ============= KILLS QUERIES =============

export interface KillsEntry {
  rank: number;
  pokemonName: string;
  pokemonId: number;
  kills: number;
  deaths: number;
  kd: string;
}

/**
 * Get top Pokemon by kills (all time)
 */
export async function getTopKills(limit: number = 10): Promise<KillsEntry[]> {
  const result = await db
    .select({
      pokemonId: matchPokemon.pokemonId,
      name: pokemon.displayName,
      internalName: pokemon.name,
      kills: sql<number>`sum(${matchPokemon.kills})`,
      deaths: sql<number>`sum(${matchPokemon.deaths})`,
    })
    .from(matchPokemon)
    .innerJoin(pokemon, eq(matchPokemon.pokemonId, pokemon.id))
    .groupBy(matchPokemon.pokemonId)
    .orderBy(desc(sql`sum(${matchPokemon.kills})`))
    .limit(limit);

  return result.map((p, i) => ({
    rank: i + 1,
    pokemonName: p.name || p.internalName,
    pokemonId: p.pokemonId,
    kills: p.kills || 0,
    deaths: p.deaths || 0,
    kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toString(),
  }));
}

/**
 * Get top Pokemon by kills for a specific season
 */
export async function getSeasonKills(
  seasonNum: number,
  limit: number = 10
): Promise<KillsEntry[] | null> {
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.seasonNumber, seasonNum),
  });

  if (!season) return null;

  const result = await db
    .select({
      pokemonId: matchPokemon.pokemonId,
      name: pokemon.displayName,
      internalName: pokemon.name,
      kills: sql<number>`sum(${matchPokemon.kills})`,
      deaths: sql<number>`sum(${matchPokemon.deaths})`,
    })
    .from(matchPokemon)
    .innerJoin(matches, eq(matchPokemon.matchId, matches.id))
    .innerJoin(pokemon, eq(matchPokemon.pokemonId, pokemon.id))
    .where(eq(matches.seasonId, season.id))
    .groupBy(matchPokemon.pokemonId)
    .orderBy(desc(sql`sum(${matchPokemon.kills})`))
    .limit(limit);

  return result.map((p, i) => ({
    rank: i + 1,
    pokemonName: p.name || p.internalName,
    pokemonId: p.pokemonId,
    kills: p.kills || 0,
    deaths: p.deaths || 0,
    kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toString(),
  }));
}

/**
 * Get top Pokemon by kills for a specific division
 */
export async function getDivisionKills(
  seasonNum: number,
  divisionName: string,
  limit: number = 10
): Promise<KillsEntry[] | null> {
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.seasonNumber, seasonNum),
  });

  if (!season) return null;

  const division = await db.query.divisions.findFirst({
    where: and(
      eq(divisions.seasonId, season.id),
      like(sql`lower(${divisions.name})`, `%${divisionName.toLowerCase()}%`)
    ),
  });

  if (!division) return null;

  const result = await db
    .select({
      pokemonId: matchPokemon.pokemonId,
      name: pokemon.displayName,
      internalName: pokemon.name,
      kills: sql<number>`sum(${matchPokemon.kills})`,
      deaths: sql<number>`sum(${matchPokemon.deaths})`,
    })
    .from(matchPokemon)
    .innerJoin(matches, eq(matchPokemon.matchId, matches.id))
    .innerJoin(pokemon, eq(matchPokemon.pokemonId, pokemon.id))
    .where(eq(matches.divisionId, division.id))
    .groupBy(matchPokemon.pokemonId)
    .orderBy(desc(sql`sum(${matchPokemon.kills})`))
    .limit(limit);

  return result.map((p, i) => ({
    rank: i + 1,
    pokemonName: p.name || p.internalName,
    pokemonId: p.pokemonId,
    kills: p.kills || 0,
    deaths: p.deaths || 0,
    kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toString(),
  }));
}

/**
 * Get top Pokemon by kills for a specific coach
 */
export async function getCoachKills(
  coachName: string,
  limit: number = 10
): Promise<{ coachName: string; kills: KillsEntry[] } | null> {
  // Find coach by name
  const coach = await db.query.coaches.findFirst({
    where: like(sql`lower(${coaches.name})`, `%${coachName.toLowerCase()}%`),
  });

  if (!coach) return null;

  // Get all season coach IDs for this coach
  const coachSeasons = await db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.coachId, coach.id),
  });

  const seasonCoachIds = coachSeasons.map((sc) => sc.id);

  if (seasonCoachIds.length === 0) {
    return { coachName: coach.name, kills: [] };
  }

  const result = await db
    .select({
      pokemonId: matchPokemon.pokemonId,
      name: pokemon.displayName,
      internalName: pokemon.name,
      kills: sql<number>`sum(${matchPokemon.kills})`,
      deaths: sql<number>`sum(${matchPokemon.deaths})`,
    })
    .from(matchPokemon)
    .innerJoin(pokemon, eq(matchPokemon.pokemonId, pokemon.id))
    .where(sql`${matchPokemon.seasonCoachId} IN (${sql.join(seasonCoachIds, sql`, `)})`)
    .groupBy(matchPokemon.pokemonId)
    .orderBy(desc(sql`sum(${matchPokemon.kills})`))
    .limit(limit);

  return {
    coachName: coach.name,
    kills: result.map((p, i) => ({
      rank: i + 1,
      pokemonName: p.name || p.internalName,
      pokemonId: p.pokemonId,
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toString(),
    })),
  };
}
