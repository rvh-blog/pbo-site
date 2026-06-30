import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { playoffMatches, matches, divisions, eloHistory, matchPokemon } from "@/lib/schema";
import { eq, and, or } from "drizzle-orm";
import { updateEloForMatch } from "@/lib/elo-service";
import { getSession } from "@/lib/session";
import { getPublicVisibilityState, isDivisionPubliclyVisible, isPublicSeasonVisible } from "@/lib/public-visibility";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");
  const divisionId = searchParams.get("divisionId");
  const fixStructure = searchParams.get("fixStructure");
  const session = await getSession();
  const canSeePrivate = session?.isMod ?? false;
  const visibility = await getPublicVisibilityState();

  // If fixStructure=true, ensure playoff bracket structure is complete for existing data
  if (fixStructure === "true" && seasonId && canSeePrivate) {
    const seasonDivisions = await db.query.divisions.findMany({
      where: eq(divisions.seasonId, parseInt(seasonId)),
    });

    for (const div of seasonDivisions) {
      // Check if this division has any playoff matches
      const existingPlayoffs = await db.query.playoffMatches.findMany({
        where: eq(playoffMatches.divisionId, div.id),
      });

      if (existingPlayoffs.length > 0) {
        // Ensure full structure exists
        await ensurePlayoffBracketStructure(parseInt(seasonId), div.id);

        // Also create matches entries for any playoff matches that don't have them
        for (const pm of existingPlayoffs) {
          if (pm.higherSeedId && pm.lowerSeedId && !pm.matchId) {
            const week = 100 + pm.round;
            const [newMatch] = await db
              .insert(matches)
              .values({
                seasonId: pm.seasonId,
                divisionId: pm.divisionId,
                week,
                coach1SeasonId: pm.higherSeedId,
                coach2SeasonId: pm.lowerSeedId,
              })
              .returning();

            await db
              .update(playoffMatches)
              .set({ matchId: newMatch.id })
              .where(eq(playoffMatches.id, pm.id));
          }
        }
      }
    }
  }

  const allMatches = await db.query.playoffMatches.findMany({
    with: {
      higherSeed: {
        with: { coach: true },
      },
      lowerSeed: {
        with: { coach: true },
      },
      winner: true,
      division: { with: { season: true } },
    },
    orderBy: (pm, { asc }) => [asc(pm.round), asc(pm.bracketPosition)],
  });

  let filtered = allMatches;
  if (seasonId) {
    filtered = filtered.filter((m) => m.seasonId === parseInt(seasonId));
  }
  if (divisionId) {
    filtered = filtered.filter((m) => m.divisionId === parseInt(divisionId));
  }
  if (!canSeePrivate) {
    filtered = filtered.filter((match) =>
      match.division &&
      isDivisionPubliclyVisible(match.division, visibility) &&
      match.division.season &&
      isPublicSeasonVisible(match.division.season)
    );
  }

  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    seasonId,
    divisionId,
    round,
    bracketPosition,
    higherSeedId,
    lowerSeedId,
  } = body;

  if (!seasonId || !divisionId) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const actualRound = round || 1;
  const actualPosition = bracketPosition || 1;

  // Create the playoff match entry
  let matchId: number | null = null;

  // If both teams are assigned, also create a matches entry for the fixture
  if (higherSeedId && lowerSeedId) {
    const week = 100 + actualRound;

    // First check if a match already exists (prevents duplicates)
    const existingMatch = await db.query.matches.findFirst({
      where: and(
        eq(matches.seasonId, seasonId),
        eq(matches.divisionId, divisionId),
        eq(matches.week, week),
        or(
          and(
            eq(matches.coach1SeasonId, higherSeedId),
            eq(matches.coach2SeasonId, lowerSeedId)
          ),
          and(
            eq(matches.coach1SeasonId, lowerSeedId),
            eq(matches.coach2SeasonId, higherSeedId)
          )
        )
      ),
    });

    if (existingMatch) {
      matchId = existingMatch.id;
    } else {
      const [newMatch] = await db
        .insert(matches)
        .values({
          seasonId,
          divisionId,
          week,
          coach1SeasonId: higherSeedId,
          coach2SeasonId: lowerSeedId,
        })
        .returning();
      matchId = newMatch.id;
    }
  }

  const [playoffMatch] = await db
    .insert(playoffMatches)
    .values({
      seasonId,
      divisionId,
      round: actualRound,
      bracketPosition: actualPosition,
      higherSeedId: higherSeedId || null,
      lowerSeedId: lowerSeedId || null,
      matchId,
    })
    .returning();

  // Ensure SF and Finals placeholders exist whenever any playoff match is added
  await ensurePlayoffBracketStructure(seasonId, divisionId);

  return NextResponse.json(playoffMatch);
}

// Helper to ensure the full playoff bracket structure exists for a division
async function ensurePlayoffBracketStructure(seasonId: number, divisionId: number) {
  // Check existing playoff matches for this division
  const existingMatches = await db.query.playoffMatches.findMany({
    where: and(
      eq(playoffMatches.seasonId, seasonId),
      eq(playoffMatches.divisionId, divisionId)
    ),
  });

  // Check if SF matches exist (round 2, positions 1 and 2)
  const sf1 = existingMatches.find((m) => m.round === 2 && m.bracketPosition === 1);
  const sf2 = existingMatches.find((m) => m.round === 2 && m.bracketPosition === 2);
  const finals = existingMatches.find((m) => m.round === 3 && m.bracketPosition === 1);

  // Create SF1 if doesn't exist
  if (!sf1) {
    await db.insert(playoffMatches).values({
      seasonId,
      divisionId,
      round: 2,
      bracketPosition: 1,
      higherSeedId: null,
      lowerSeedId: null,
    });
  }

  // Create SF2 if doesn't exist
  if (!sf2) {
    await db.insert(playoffMatches).values({
      seasonId,
      divisionId,
      round: 2,
      bracketPosition: 2,
      higherSeedId: null,
      lowerSeedId: null,
    });
  }

  // Create Finals if doesn't exist
  if (!finals) {
    await db.insert(playoffMatches).values({
      seasonId,
      divisionId,
      round: 3,
      bracketPosition: 1,
      higherSeedId: null,
      lowerSeedId: null,
    });
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const {
    id,
    higherSeedId,
    lowerSeedId,
    winnerId,
    higherSeedWins,
    lowerSeedWins,
  } = body;

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // Fetch current playoff match to check current state
  const currentMatch = await db.query.playoffMatches.findFirst({
    where: eq(playoffMatches.id, id),
  });

  if (!currentMatch) {
    return NextResponse.json({ error: "Playoff match not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (higherSeedId !== undefined) updateData.higherSeedId = higherSeedId;
  if (lowerSeedId !== undefined) updateData.lowerSeedId = lowerSeedId;
  if (winnerId !== undefined) updateData.winnerId = winnerId;
  if (higherSeedWins !== undefined) updateData.higherSeedWins = higherSeedWins;
  if (lowerSeedWins !== undefined) updateData.lowerSeedWins = lowerSeedWins;

  // Determine final team IDs after update
  const finalHigherSeedId = higherSeedId !== undefined ? higherSeedId : currentMatch.higherSeedId;
  const finalLowerSeedId = lowerSeedId !== undefined ? lowerSeedId : currentMatch.lowerSeedId;

  // If both teams are now assigned and no match exists yet, create one
  if (finalHigherSeedId && finalLowerSeedId && !currentMatch.matchId) {
    // Week is 100 + round (101 = QF, 102 = SF, 103 = Finals)
    const week = 100 + currentMatch.round;

    // First check if a match already exists for this playoff (could have been created by frontend)
    const existingMatch = await db.query.matches.findFirst({
      where: and(
        eq(matches.seasonId, currentMatch.seasonId),
        eq(matches.divisionId, currentMatch.divisionId),
        eq(matches.week, week),
        or(
          and(
            eq(matches.coach1SeasonId, finalHigherSeedId),
            eq(matches.coach2SeasonId, finalLowerSeedId)
          ),
          and(
            eq(matches.coach1SeasonId, finalLowerSeedId),
            eq(matches.coach2SeasonId, finalHigherSeedId)
          )
        )
      ),
    });

    if (existingMatch) {
      // Link to existing match instead of creating duplicate
      updateData.matchId = existingMatch.id;
    } else {
      const [newMatch] = await db
        .insert(matches)
        .values({
          seasonId: currentMatch.seasonId,
          divisionId: currentMatch.divisionId,
          week,
          coach1SeasonId: finalHigherSeedId,
          coach2SeasonId: finalLowerSeedId,
        })
        .returning();

      updateData.matchId = newMatch.id;
    }
  }

  // If winner is being set, also update the corresponding match
  if (winnerId !== undefined && currentMatch.matchId) {
    // For schedule display, we want +X vs -X format (not bracket 3-0 format)
    // Winner gets positive differential, loser gets negative
    const winnerScore = higherSeedWins || lowerSeedWins || currentMatch.higherSeedWins || currentMatch.lowerSeedWins || 0;
    const coach1IsWinner = winnerId === finalHigherSeedId;

    await db
      .update(matches)
      .set({
        winnerId,
        coach1Differential: coach1IsWinner ? winnerScore : -winnerScore,
        coach2Differential: coach1IsWinner ? -winnerScore : winnerScore,
      })
      .where(eq(matches.id, currentMatch.matchId));
  }

  const [updated] = await db
    .update(playoffMatches)
    .set(updateData)
    .where(eq(playoffMatches.id, id))
    .returning();

  // Ensure SF and Finals placeholders exist (fixes existing data)
  await ensurePlayoffBracketStructure(currentMatch.seasonId, currentMatch.divisionId);

  // Update ELO if winner changed (uses optimized calculation when possible)
  let needsFullRecalc = false;
  if (winnerId !== undefined) {
    const matchIdForElo = updated.matchId || currentMatch.matchId;
    if (matchIdForElo) {
      const eloResult = await updateEloForMatch(matchIdForElo);
      needsFullRecalc = eloResult.needsFullRecalc;
    }
  }

  return NextResponse.json({ ...updated, needsFullRecalc });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    const playoffId = parseInt(id);

    // First, get the playoff match to find the associated match
    const playoffMatch = await db.query.playoffMatches.findFirst({
      where: eq(playoffMatches.id, playoffId),
    });

    if (!playoffMatch) {
      return NextResponse.json({ error: "Playoff match not found" }, { status: 404 });
    }

    const matchIdToDelete = playoffMatch.matchId;

    // Check if this match had ELO impact (had a winner)
    const hadEloImpact = playoffMatch.winnerId !== null;

    // Delete the playoff match entry first (due to FK constraint)
    await db.delete(playoffMatches).where(eq(playoffMatches.id, playoffId));

    // If there was an associated match (Week 101/102/103 fixture), clean it up too
    if (matchIdToDelete) {
      // Delete elo_history for this match
      await db.delete(eloHistory).where(eq(eloHistory.matchId, matchIdToDelete));
      // Delete match_pokemon for this match
      await db.delete(matchPokemon).where(eq(matchPokemon.matchId, matchIdToDelete));
      // Delete the match itself
      await db.delete(matches).where(eq(matches.id, matchIdToDelete));
    }

    // Don't auto-recalculate - let UI handle showing recalc prompt
    // Only flag needsFullRecalc if the deleted match had ELO impact
    return NextResponse.json({
      success: true,
      deletedMatchId: matchIdToDelete,
      needsFullRecalc: hadEloImpact,
    });
  } catch (error) {
    console.error("Error deleting playoff match:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete playoff match" },
      { status: 500 }
    );
  }
}
