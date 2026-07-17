import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seasons, divisions, seasonPokemonPrices, pokemon } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { filterPublicDivisions, getPublicVisibilityState, isPublicSeasonVisible } from "@/lib/public-visibility";
import { compareDivisions } from "@/lib/division-order";

const PUBLIC_READ_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=120, s-maxage=600, stale-while-revalidate=1800",
};

const PRIVATE_READ_CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const publicOnly = searchParams.get("publicOnly") === "true";
  const session = await getSession();
  const canSeePrivate = session?.isMod ?? false;
  const visibility = await getPublicVisibilityState();

  const allSeasons = await db.query.seasons.findMany({
    with: {
      divisions: true,
    },
    orderBy: (seasons, { desc }) => [desc(seasons.seasonNumber)],
  });
  const orderedSeasons = allSeasons.map((season) => ({
    ...season,
    divisions: [...season.divisions].sort(compareDivisions),
  }));

  // Public callers only see revealed seasons and divisions. Mods can still use
  // the unfiltered endpoint for admin tools unless publicOnly is requested.
  if (publicOnly || !canSeePrivate) {
    return NextResponse.json(
      orderedSeasons
        .filter(isPublicSeasonVisible)
        .map((season) => ({
          ...season,
          divisions: filterPublicDivisions(season.divisions, visibility).sort(compareDivisions),
        })),
      { headers: PUBLIC_READ_CACHE_HEADERS }
    );
  }

  return NextResponse.json(orderedSeasons, { headers: PRIVATE_READ_CACHE_HEADERS });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, seasonNumber, draftBudget, isCurrent, isPublic, movesetFormat, divisionNames, draftBoard } = body;

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
      movesetFormat: movesetFormat === "national-dex" ? "national-dex" : "scarlet-violet",
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
  const { id, name, seasonNumber, draftBudget, isCurrent, isPublic, isSchedulePublic, movesetFormat, divisions: divisionUpdates, draftBoard } = body;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // If this season is becoming current, unset other current seasons
  if (isCurrent) {
    await db.update(seasons).set({ isCurrent: false });
  }

  // Build update object with only provided fields
  const updateData: Partial<typeof seasons.$inferInsert> = {};
  if (name !== undefined) updateData.name = name;
  if (seasonNumber !== undefined) updateData.seasonNumber = seasonNumber;
  if (draftBudget !== undefined) updateData.draftBudget = draftBudget;
  if (isCurrent !== undefined) updateData.isCurrent = isCurrent;
  if (isPublic !== undefined) updateData.isPublic = isPublic;
  if (isSchedulePublic !== undefined) updateData.isSchedulePublic = isSchedulePublic;
  if (movesetFormat !== undefined) {
    updateData.movesetFormat = movesetFormat === "national-dex" ? "national-dex" : "scarlet-violet";
  }

  const [season] = await db
    .update(seasons)
    .set(updateData)
    .where(eq(seasons.id, id))
    .returning();

  // Process division updates if provided
  if (divisionUpdates && Array.isArray(divisionUpdates)) {
    // Get current divisions
    const currentDivisions = await db.query.divisions.findMany({
      where: eq(divisions.seasonId, id),
    });
    const currentIds = new Set(currentDivisions.map(d => d.id));
    const updatedIds = new Set<number>();

    for (const div of divisionUpdates) {
      if (div.id > 0) {
        // Update existing division
        await db.update(divisions)
          .set({
            name: div.name,
            logoUrl: div.logoUrl || null,
            displayOrder: div.displayOrder,
          })
          .where(eq(divisions.id, div.id));
        updatedIds.add(div.id);
      } else {
        // Create new division (negative ID means new)
        await db.insert(divisions).values({
          seasonId: id,
          name: div.name,
          logoUrl: div.logoUrl || null,
          displayOrder: div.displayOrder,
        });
      }
    }

    // Delete divisions that were removed (not in updated list)
    for (const existingId of currentIds) {
      if (!updatedIds.has(existingId)) {
        await db.delete(divisions).where(eq(divisions.id, existingId));
      }
    }
  }

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
