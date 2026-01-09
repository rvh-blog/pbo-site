import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seasons, divisions, seasonPokemonPrices, pokemon } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const publicOnly = searchParams.get("publicOnly") === "true";

  const allSeasons = await db.query.seasons.findMany({
    with: {
      divisions: true,
    },
    orderBy: (seasons, { desc }) => [desc(seasons.seasonNumber)],
  });

  // Filter to public seasons only if requested
  if (publicOnly) {
    return NextResponse.json(allSeasons.filter((s) => s.isPublic));
  }

  return NextResponse.json(allSeasons);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, seasonNumber, draftBudget, isCurrent, isPublic, divisionNames, draftBoard } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // If this season is current, unset other current seasons
  if (isCurrent) {
    await db.update(seasons).set({ isCurrent: false });
  }

  const [season] = await db
    .insert(seasons)
    .values({
      name,
      seasonNumber: seasonNumber || 1,
      draftBudget: draftBudget || 100,
      isCurrent: isCurrent || false,
      isPublic: isPublic !== false, // Default to true
    })
    .returning();

  // Create divisions if provided (can be array of strings or objects with name/logoUrl)
  if (divisionNames && Array.isArray(divisionNames)) {
    for (let i = 0; i < divisionNames.length; i++) {
      const div = divisionNames[i];
      if (typeof div === "string") {
        if (div.trim()) {
          await db.insert(divisions).values({
            seasonId: season.id,
            name: div.trim(),
            displayOrder: i,
          });
        }
      } else if (div && div.name && div.name.trim()) {
        await db.insert(divisions).values({
          seasonId: season.id,
          name: div.name.trim(),
          logoUrl: div.logoUrl || null,
          displayOrder: i,
        });
      }
    }
  }

  // Process draft board data if provided
  if (draftBoard && Array.isArray(draftBoard)) {
    await processDraftBoard(season.id, draftBoard);
  }

  return NextResponse.json(season);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, seasonNumber, draftBudget, isCurrent, isPublic, draftBoard } = body;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // If this season is becoming current, unset other current seasons
  if (isCurrent) {
    await db.update(seasons).set({ isCurrent: false });
  }

  // Build update object with only provided fields
  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (seasonNumber !== undefined) updateData.seasonNumber = seasonNumber;
  if (draftBudget !== undefined) updateData.draftBudget = draftBudget;
  if (isCurrent !== undefined) updateData.isCurrent = isCurrent;
  if (isPublic !== undefined) updateData.isPublic = isPublic;

  const [season] = await db
    .update(seasons)
    .set(updateData)
    .where(eq(seasons.id, id))
    .returning();

  // Process draft board data if provided (replaces existing)
  if (draftBoard && Array.isArray(draftBoard)) {
    // Delete existing prices for this season
    await db.delete(seasonPokemonPrices).where(eq(seasonPokemonPrices.seasonId, id));
    await processDraftBoard(id, draftBoard);
  }

  return NextResponse.json(season);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const seasonId = parseInt(id);

  // Delete season pokemon prices
  await db.delete(seasonPokemonPrices).where(eq(seasonPokemonPrices.seasonId, seasonId));
  // Delete divisions
  await db.delete(divisions).where(eq(divisions.seasonId, seasonId));
  // Delete the season
  await db.delete(seasons).where(eq(seasons.id, seasonId));

  return NextResponse.json({ success: true });
}

// Helper function to process draft board CSV data
async function processDraftBoard(
  seasonId: number,
  draftBoard: Array<{
    name: string;
    price: number;
    teraBanned?: boolean;
    teraCaptainCost?: number | null;
    complexBanReason?: string | null;
  }>
) {
  for (const entry of draftBoard) {
    if (!entry.name) continue;

    // Find the pokemon by name (case-insensitive)
    let poke = await db.query.pokemon.findFirst({
      where: eq(pokemon.name, entry.name),
    });

    // If not found, try case-insensitive search
    if (!poke) {
      const allPokemon = await db.select().from(pokemon);
      poke = allPokemon.find(
        (p) => p.name.toLowerCase() === entry.name.toLowerCase()
      );
    }

    // Skip if pokemon doesn't exist in the database
    if (!poke) {
      console.warn(`Pokemon not found: ${entry.name}`);
      continue;
    }

    // Check if entry already exists
    const existing = await db.query.seasonPokemonPrices.findFirst({
      where: and(
        eq(seasonPokemonPrices.seasonId, seasonId),
        eq(seasonPokemonPrices.pokemonId, poke.id)
      ),
    });

    const priceData = {
      seasonId,
      pokemonId: poke.id,
      price: entry.price,
      teraBanned: entry.teraBanned || false,
      teraCaptainCost: entry.teraCaptainCost ?? null,
      complexBanReason: entry.complexBanReason || null,
    };

    if (existing) {
      await db
        .update(seasonPokemonPrices)
        .set(priceData)
        .where(eq(seasonPokemonPrices.id, existing.id));
    } else {
      await db.insert(seasonPokemonPrices).values(priceData);
    }
  }
}
