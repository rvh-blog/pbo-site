import { db } from "@/lib/db";
import {
  seasonCoaches,
  rosters,
  seasonPokemonPrices,
  pokemon,
  coaches,
  divisions,
  seasons,
} from "@/lib/schema";
import { eq, and, notInArray, sql } from "drizzle-orm";

export interface TeamOption {
  id: number;
  teamName: string;
  teamAbbreviation: string | null;
  coachName: string;
  remainingBudget: number;
}

export interface PokemonOption {
  id: number;
  name: string;
  displayName: string | null;
  price: number;
  teraCaptainCost: number | null;
  spriteUrl: string | null;
}

/**
 * Get active teams in a division
 */
export async function getTeamsInDivision(
  divisionId: number
): Promise<TeamOption[]> {
  const teams = await db
    .select({
      id: seasonCoaches.id,
      teamName: seasonCoaches.teamName,
      teamAbbreviation: seasonCoaches.teamAbbreviation,
      coachName: coaches.name,
      remainingBudget: seasonCoaches.remainingBudget,
    })
    .from(seasonCoaches)
    .innerJoin(coaches, eq(seasonCoaches.coachId, coaches.id))
    .where(
      and(
        eq(seasonCoaches.divisionId, divisionId),
        eq(seasonCoaches.isActive, true)
      )
    )
    .orderBy(seasonCoaches.teamName);

  return teams.map((t) => ({
    id: t.id,
    teamName: t.teamName,
    teamAbbreviation: t.teamAbbreviation,
    coachName: t.coachName,
    remainingBudget: t.remainingBudget || 0,
  }));
}

/**
 * Get available Pokemon for draft (not already drafted by any team in the division)
 */
export async function getAvailablePokemon(
  divisionId: number,
  searchQuery?: string
): Promise<PokemonOption[]> {
  // Get the season for this division
  const division = await db.query.divisions.findFirst({
    where: eq(divisions.id, divisionId),
    with: { season: true },
  });

  if (!division) return [];

  const seasonId = division.seasonId;

  // Get all Pokemon IDs already drafted in this division
  const draftedPokemonIds = await db
    .select({ pokemonId: rosters.pokemonId })
    .from(rosters)
    .innerJoin(seasonCoaches, eq(rosters.seasonCoachId, seasonCoaches.id))
    .where(
      and(
        eq(seasonCoaches.divisionId, divisionId),
        eq(seasonCoaches.isActive, true)
      )
    );

  const draftedIds = draftedPokemonIds.map((r) => r.pokemonId);

  // Get available Pokemon with their season prices
  let query = db
    .select({
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      price: seasonPokemonPrices.price,
      teraCaptainCost: seasonPokemonPrices.teraCaptainCost,
      spriteUrl: pokemon.spriteUrl,
    })
    .from(seasonPokemonPrices)
    .innerJoin(pokemon, eq(seasonPokemonPrices.pokemonId, pokemon.id))
    .where(
      and(
        eq(seasonPokemonPrices.seasonId, seasonId),
        sql`${seasonPokemonPrices.price} > 0`, // Exclude banned Pokemon (price <= 0)
        draftedIds.length > 0
          ? notInArray(pokemon.id, draftedIds)
          : sql`1=1`
      )
    )
    .orderBy(pokemon.name);

  const results = await query;

  // Filter by search query if provided
  let filtered = results;
  if (searchQuery && searchQuery.length > 0) {
    const lowerQuery = searchQuery.toLowerCase();
    filtered = results.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        (p.displayName && p.displayName.toLowerCase().includes(lowerQuery))
    );
  }

  return filtered.slice(0, 25).map((p) => ({
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    price: p.price,
    teraCaptainCost: p.teraCaptainCost,
    spriteUrl: p.spriteUrl,
  }));
}

/**
 * Add a draft pick to a team's roster
 */
export async function addDraftPick(params: {
  seasonCoachId: number;
  pokemonId: number;
  price: number;
  isTeraCaptain: boolean;
  teraCaptainCost: number;
}): Promise<{ success: boolean; error?: string }> {
  const { seasonCoachId, pokemonId, price, isTeraCaptain, teraCaptainCost } = params;

  try {
    // Get current team data
    const team = await db.query.seasonCoaches.findFirst({
      where: eq(seasonCoaches.id, seasonCoachId),
    });

    if (!team) {
      return { success: false, error: "Team not found" };
    }

    // Calculate total cost
    const totalCost = price + (isTeraCaptain ? teraCaptainCost : 0);

    // Check budget
    const currentBudget = team.remainingBudget || 0;
    if (currentBudget < totalCost) {
      return {
        success: false,
        error: `Insufficient budget. Need ${totalCost}, have ${currentBudget}`,
      };
    }

    // Check if Pokemon is already on roster
    const existing = await db.query.rosters.findFirst({
      where: and(
        eq(rosters.seasonCoachId, seasonCoachId),
        eq(rosters.pokemonId, pokemonId)
      ),
    });

    if (existing) {
      return { success: false, error: "Pokemon already on roster" };
    }

    // Get current roster size for draft order
    const currentRoster = await db.query.rosters.findMany({
      where: eq(rosters.seasonCoachId, seasonCoachId),
    });
    const draftOrder = currentRoster.length + 1;

    // Add to roster
    await db.insert(rosters).values({
      seasonCoachId,
      pokemonId,
      price: totalCost,
      draftOrder,
      isTeraCaptain,
      acquiredVia: "DRAFT",
    });

    // Update budget
    await db
      .update(seasonCoaches)
      .set({ remainingBudget: currentBudget - totalCost })
      .where(eq(seasonCoaches.id, seasonCoachId));

    return { success: true };
  } catch (error) {
    console.error("[Draft Service] Error adding draft pick:", error);
    return { success: false, error: "Database error" };
  }
}

/**
 * Find who owns a Pokemon in a division (if drafted)
 */
export async function findPokemonOwner(
  divisionId: number,
  searchQuery: string
): Promise<{ pokemonName: string; teamName: string; coachName: string } | null> {
  // First find Pokemon matching the search
  const searchPattern = `%${searchQuery.toLowerCase()}%`;
  const matchingPokemon = await db
    .select({
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
    })
    .from(pokemon)
    .where(
      sql`(LOWER(${pokemon.name}) LIKE ${searchPattern} OR LOWER(${pokemon.displayName}) LIKE ${searchPattern})`
    )
    .limit(10);

  if (matchingPokemon.length === 0) return null;

  // Check if any of these Pokemon are drafted in this division
  for (const mon of matchingPokemon) {
    const owner = await db
      .select({
        teamName: seasonCoaches.teamName,
        coachName: coaches.name,
      })
      .from(rosters)
      .innerJoin(seasonCoaches, eq(rosters.seasonCoachId, seasonCoaches.id))
      .innerJoin(coaches, eq(seasonCoaches.coachId, coaches.id))
      .where(
        and(
          eq(rosters.pokemonId, mon.id),
          eq(seasonCoaches.divisionId, divisionId),
          eq(seasonCoaches.isActive, true)
        )
      )
      .limit(1);

    if (owner.length > 0) {
      return {
        pokemonName: mon.displayName || mon.name,
        teamName: owner[0].teamName,
        coachName: owner[0].coachName,
      };
    }
  }

  return null;
}

/**
 * Get Pokemon details by ID for confirmation
 */
export async function getPokemonDetails(
  pokemonId: number,
  seasonId: number
): Promise<PokemonOption | null> {
  const result = await db
    .select({
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      price: seasonPokemonPrices.price,
      teraCaptainCost: seasonPokemonPrices.teraCaptainCost,
      spriteUrl: pokemon.spriteUrl,
    })
    .from(seasonPokemonPrices)
    .innerJoin(pokemon, eq(seasonPokemonPrices.pokemonId, pokemon.id))
    .where(
      and(
        eq(seasonPokemonPrices.seasonId, seasonId),
        eq(pokemon.id, pokemonId)
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Get team details by ID
 */
export async function getTeamDetails(seasonCoachId: number): Promise<{
  id: number;
  teamName: string;
  coachName: string;
  remainingBudget: number;
  divisionName: string;
  seasonName: string;
} | null> {
  const result = await db
    .select({
      id: seasonCoaches.id,
      teamName: seasonCoaches.teamName,
      coachName: coaches.name,
      remainingBudget: seasonCoaches.remainingBudget,
      divisionName: divisions.name,
      seasonName: seasons.name,
    })
    .from(seasonCoaches)
    .innerJoin(coaches, eq(seasonCoaches.coachId, coaches.id))
    .innerJoin(divisions, eq(seasonCoaches.divisionId, divisions.id))
    .innerJoin(seasons, eq(divisions.seasonId, seasons.id))
    .where(eq(seasonCoaches.id, seasonCoachId))
    .limit(1);

  return result[0]
    ? {
        ...result[0],
        remainingBudget: result[0].remainingBudget || 0,
      }
    : null;
}
