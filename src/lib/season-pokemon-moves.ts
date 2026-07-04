import { db } from "@/lib/db";
import { seasonPokemonMoves } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function getSeasonPokemonMovesMap(seasonId: number) {
  const overrides = await db.query.seasonPokemonMoves.findMany({
    where: eq(seasonPokemonMoves.seasonId, seasonId),
  });

  return new Map(overrides.map((override) => [override.pokemonId, override.moves]));
}

export function movesForSeasonPokemon(
  pokemonId: number,
  defaultMoves: string[] | null | undefined,
  seasonMoves: Map<number, string[]>
) {
  return seasonMoves.get(pokemonId) || defaultMoves || [];
}
