import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matches, matchPokemon, eloHistory } from "@/lib/schema";
import { eq, or } from "drizzle-orm";
import { recalculateAllElo } from "@/lib/elo-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");
  const divisionId = searchParams.get("divisionId");

  let query = db.query.matches.findMany({
    with: {
      coach1: {
        with: {
          coach: true,
          rosters: {
            with: { pokemon: true },
          },
        },
      },
      coach2: {
        with: {
          coach: true,
          rosters: {
            with: { pokemon: true },
          },
        },
      },
      winner: true,
      division: true,
      matchPokemon: {
        with: { pokemon: true, seasonCoach: true },
      },
    },
    orderBy: (matches, { desc }) => [desc(matches.week), desc(matches.id)],
  });

  const allMatches = await query;

  // Filter if needed
  let filtered = allMatches;
  if (seasonId) {
    filtered = filtered.filter((m) => m.seasonId === parseInt(seasonId));
  }
  if (divisionId) {
    filtered = filtered.filter((m) => m.divisionId === parseInt(divisionId));
  }

  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    seasonId,
    divisionId,
    week,
    coach1SeasonId,
    coach2SeasonId,
    winnerId,
    coach1Differential,
    coach2Differential,
    isForfeit,
    replayUrl,
    pokemonData, // Array of { seasonCoachId, pokemonId, kills, deaths }
  } = body;

  if (!seasonId || !divisionId || !coach1SeasonId || !coach2SeasonId) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Create match
  const [match] = await db
    .insert(matches)
    .values({
      seasonId,
      divisionId,
      week: week || 1,
      coach1SeasonId,
      coach2SeasonId,
      winnerId,
      coach1Differential: coach1Differential || 0,
      coach2Differential: coach2Differential || 0,
      isForfeit: isForfeit || false,
      replayUrl: replayUrl || null,
      playedAt: new Date().toISOString(),
    })
    .returning();

  // Add Pokemon data if provided
  if (pokemonData && Array.isArray(pokemonData)) {
    for (const poke of pokemonData) {
      await db.insert(matchPokemon).values({
        matchId: match.id,
        seasonCoachId: poke.seasonCoachId,
        pokemonId: poke.pokemonId,
        kills: poke.kills || 0,
        deaths: poke.deaths || 0,
      });
    }
  }

  // Recalculate all ELO ratings if there's a winner
  if (winnerId) {
    await recalculateAllElo();
  }

  return NextResponse.json(match);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const {
    id,
    winnerId,
    coach1Differential,
    coach2Differential,
    isForfeit,
    replayUrl,
    pokemonData,
  } = body;

  if (!id) {
    return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (winnerId !== undefined) updateData.winnerId = winnerId;
  if (coach1Differential !== undefined) updateData.coach1Differential = coach1Differential;
  if (coach2Differential !== undefined) updateData.coach2Differential = coach2Differential;
  if (isForfeit !== undefined) updateData.isForfeit = isForfeit;
  if (replayUrl !== undefined) updateData.replayUrl = replayUrl;

  const [updated] = await db
    .update(matches)
    .set(updateData)
    .where(eq(matches.id, id))
    .returning();

  // Update Pokemon data if provided
  if (pokemonData && Array.isArray(pokemonData)) {
    // Delete existing Pokemon data for this match
    await db.delete(matchPokemon).where(eq(matchPokemon.matchId, id));

    // Insert new Pokemon data
    for (const poke of pokemonData) {
      if (poke.pokemonId) {
        await db.insert(matchPokemon).values({
          matchId: id,
          seasonCoachId: poke.seasonCoachId,
          pokemonId: poke.pokemonId,
          kills: poke.kills || 0,
          deaths: poke.deaths || 0,
        });
      }
    }
  }

  // Recalculate ELO if winner changed
  if (winnerId !== undefined) {
    await recalculateAllElo();
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    const matchId = parseInt(id);

    // Delete elo_history records that reference this match
    await db.delete(eloHistory).where(eq(eloHistory.matchId, matchId));

    // Delete match Pokemon
    await db.delete(matchPokemon).where(eq(matchPokemon.matchId, matchId));

    // Delete match
    await db.delete(matches).where(eq(matches.id, matchId));

    // Recalculate all ELO ratings
    await recalculateAllElo();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting match:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete match" },
      { status: 500 }
    );
  }
}
