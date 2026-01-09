import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pokemon, seasonPokemonPrices, seasons } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");

  if (seasonId) {
    // Get pokemon with prices for specific season
    const allPokemon = await db.query.pokemon.findMany({
      with: {
        seasonPrices: {
          where: eq(seasonPokemonPrices.seasonId, parseInt(seasonId)),
        },
      },
    });

    return NextResponse.json(
      allPokemon.map((p) => ({
        ...p,
        price: p.seasonPrices[0]?.price ?? null,
        teraCaptainCost: p.seasonPrices[0]?.teraCaptainCost ?? null,
        teraBanned: p.seasonPrices[0]?.teraBanned ?? false,
      }))
    );
  }

  const allPokemon = await db.select().from(pokemon);
  return NextResponse.json(allPokemon);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, types, spriteUrl } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Generate sprite URL from PokeAPI if not provided
  const sprite =
    spriteUrl ||
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")}.png`;

  const [result] = await db
    .insert(pokemon)
    .values({
      name,
      types: types || [],
      spriteUrl: sprite,
    })
    .returning();

  return NextResponse.json(result);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, types, spriteUrl, seasonId, price } = body;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // Update pokemon info
  if (name || types || spriteUrl) {
    await db
      .update(pokemon)
      .set({
        ...(name && { name }),
        ...(types && { types }),
        ...(spriteUrl && { spriteUrl }),
      })
      .where(eq(pokemon.id, id));
  }

  // Update or create season price
  if (seasonId && price !== undefined) {
    const existing = await db.query.seasonPokemonPrices.findFirst({
      where: and(
        eq(seasonPokemonPrices.seasonId, seasonId),
        eq(seasonPokemonPrices.pokemonId, id)
      ),
    });

    if (existing) {
      await db
        .update(seasonPokemonPrices)
        .set({ price })
        .where(eq(seasonPokemonPrices.id, existing.id));
    } else {
      await db.insert(seasonPokemonPrices).values({
        seasonId,
        pokemonId: id,
        price,
      });
    }
  }

  const updated = await db.query.pokemon.findFirst({
    where: eq(pokemon.id, id),
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // Delete season prices first
  await db
    .delete(seasonPokemonPrices)
    .where(eq(seasonPokemonPrices.pokemonId, parseInt(id)));
  await db.delete(pokemon).where(eq(pokemon.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
