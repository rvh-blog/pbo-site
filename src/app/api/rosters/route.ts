import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  rosters,
  seasonCoaches,
  coaches,
  divisions,
  seasons,
  pokemon,
  matches,
} from "@/lib/schema";
import { eq, and, inArray, gte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");
  const seasonCoachId = searchParams.get("seasonCoachId");

  if (seasonCoachId) {
    const roster = await db.query.rosters.findMany({
      where: eq(rosters.seasonCoachId, parseInt(seasonCoachId)),
      with: {
        pokemon: true,
      },
    });
    return NextResponse.json(roster);
  }

  const divisionId = searchParams.get("divisionId");

  if (divisionId) {
    const seasonCoachesList = await db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.divisionId, parseInt(divisionId)),
      with: {
        coach: true,
        division: true,
        rosters: {
          with: {
            pokemon: true,
          },
        },
      },
    });
    return NextResponse.json(seasonCoachesList);
  }

  if (seasonId) {
    // First get all division IDs for this season
    const seasonDivisions = await db.query.divisions.findMany({
      where: eq(divisions.seasonId, parseInt(seasonId)),
    });
    const divisionIds = seasonDivisions.map((d) => d.id);

    if (divisionIds.length === 0) {
      return NextResponse.json([]);
    }

    // Get all season coaches with their rosters for all divisions in the season
    const seasonCoachesList = await db.query.seasonCoaches.findMany({
      where: inArray(seasonCoaches.divisionId, divisionIds),
      with: {
        coach: true,
        division: true,
        rosters: {
          with: {
            pokemon: true,
          },
        },
      },
    });
    return NextResponse.json(seasonCoachesList);
  }

  const allRosters = await db.query.rosters.findMany({
    with: {
      pokemon: true,
      seasonCoach: {
        with: {
          coach: true,
          division: true,
        },
      },
    },
  });
  return NextResponse.json(allRosters);
}

// Add a season coach (assign coach to division)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, ...data } = body;

  if (action === "addSeasonCoach") {
    const { coachId, divisionId, teamName, teamAbbreviation, teamLogoUrl, budget } = data;

    if (!coachId || !divisionId || !teamName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get the season budget if budget not provided
    const division = await db.query.divisions.findFirst({
      where: eq(divisions.id, divisionId),
      with: { season: true },
    });

    const [result] = await db
      .insert(seasonCoaches)
      .values({
        coachId,
        divisionId,
        teamName,
        teamAbbreviation: teamAbbreviation || teamName.substring(0, 3).toUpperCase(),
        teamLogoUrl: teamLogoUrl || null,
        remainingBudget: budget || division?.season?.draftBudget || 100,
        isActive: true,
      })
      .returning();

    return NextResponse.json(result);
  }

  if (action === "updateSeasonCoach") {
    const { seasonCoachId, teamName, teamAbbreviation, teamLogoUrl } = data;

    if (!seasonCoachId) {
      return NextResponse.json(
        { error: "Season coach ID required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {};
    if (teamName !== undefined) updateData.teamName = teamName;
    if (teamAbbreviation !== undefined) updateData.teamAbbreviation = teamAbbreviation;
    if (teamLogoUrl !== undefined) updateData.teamLogoUrl = teamLogoUrl;

    const [result] = await db
      .update(seasonCoaches)
      .set(updateData)
      .where(eq(seasonCoaches.id, seasonCoachId))
      .returning();

    return NextResponse.json(result);
  }

  if (action === "midSeasonReplacement") {
    const { originalSeasonCoachId, newCoachId, newTeamName, newTeamLogoUrl, newTeamAbbreviation, replacementWeek } = data;

    if (!originalSeasonCoachId || !newCoachId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get the original season coach
    const originalSC = await db.query.seasonCoaches.findFirst({
      where: eq(seasonCoaches.id, originalSeasonCoachId),
      with: { division: { with: { season: true } }, rosters: true },
    });

    if (!originalSC) {
      return NextResponse.json(
        { error: "Original season coach not found" },
        { status: 400 }
      );
    }

    // Check if the new coach is already active in this division
    const existingInDivision = await db.query.seasonCoaches.findFirst({
      where: and(
        eq(seasonCoaches.coachId, newCoachId),
        eq(seasonCoaches.divisionId, originalSC.divisionId),
        eq(seasonCoaches.isActive, true)
      ),
    });

    if (existingInDivision) {
      return NextResponse.json(
        { error: "This coach is already active in this division" },
        { status: 400 }
      );
    }

    // Create the new season coach entry
    const [newSeasonCoach] = await db
      .insert(seasonCoaches)
      .values({
        coachId: newCoachId,
        divisionId: originalSC.divisionId,
        teamName: newTeamName || originalSC.teamName,
        teamAbbreviation: newTeamAbbreviation || originalSC.teamAbbreviation,
        teamLogoUrl: newTeamLogoUrl !== undefined ? newTeamLogoUrl : originalSC.teamLogoUrl,
        remainingBudget: originalSC.remainingBudget,
        isActive: true,
      })
      .returning();

    // Copy the roster from original to new coach
    for (const roster of originalSC.rosters) {
      await db.insert(rosters).values({
        seasonCoachId: newSeasonCoach.id,
        pokemonId: roster.pokemonId,
        price: roster.price,
        draftOrder: roster.draftOrder,
        isTeraCaptain: roster.isTeraCaptain,
      });
    }

    // Mark the original as inactive and link to replacement
    await db
      .update(seasonCoaches)
      .set({
        isActive: false,
        replacedById: newSeasonCoach.id,
      })
      .where(eq(seasonCoaches.id, originalSeasonCoachId));

    // Reassign future matches from the original coach to the new coach
    if (replacementWeek) {
      // Update matches where original coach is coach1
      await db
        .update(matches)
        .set({ coach1SeasonId: newSeasonCoach.id })
        .where(
          and(
            eq(matches.coach1SeasonId, originalSeasonCoachId),
            gte(matches.week, replacementWeek)
          )
        );

      // Update matches where original coach is coach2
      await db
        .update(matches)
        .set({ coach2SeasonId: newSeasonCoach.id })
        .where(
          and(
            eq(matches.coach2SeasonId, originalSeasonCoachId),
            gte(matches.week, replacementWeek)
          )
        );
    }

    return NextResponse.json({
      success: true,
      newSeasonCoach,
      message: `${originalSC.teamName} has been replaced`,
    });
  }

  if (action === "addToRoster") {
    const { seasonCoachId, pokemonId, price, draftOrder, isTeraCaptain } = data;

    if (!seasonCoachId || !pokemonId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Add to roster
    const [roster] = await db
      .insert(rosters)
      .values({
        seasonCoachId,
        pokemonId,
        price: price || 0,
        draftOrder,
        isTeraCaptain: isTeraCaptain || false,
      })
      .returning();

    // Update remaining budget
    if (price) {
      const sc = await db.query.seasonCoaches.findFirst({
        where: eq(seasonCoaches.id, seasonCoachId),
      });
      if (sc) {
        await db
          .update(seasonCoaches)
          .set({ remainingBudget: (sc.remainingBudget || 0) - price })
          .where(eq(seasonCoaches.id, seasonCoachId));
      }
    }

    return NextResponse.json(roster);
  }

  if (action === "bulkUpdateDivision") {
    const { divisionId, draftBudget, teams } = data;

    if (!divisionId || !teams || !Array.isArray(teams)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    try {
      for (const team of teams) {
        // Handle deleted teams
        if (team.isDeleted && team.id) {
          // Delete rosters first
          await db.delete(rosters).where(eq(rosters.seasonCoachId, team.id));
          // Delete season coach
          await db.delete(seasonCoaches).where(eq(seasonCoaches.id, team.id));
          continue;
        }

        // Skip deleted teams without ID (shouldn't happen, but safety check)
        if (team.isDeleted) continue;

        // Calculate remaining budget
        const totalSpent = team.roster.reduce(
          (sum: number, r: any) => sum + (r.price || 0),
          0
        );
        const remainingBudget = (draftBudget || 100) - totalSpent;

        let seasonCoachId = team.id;

        if (!team.id) {
          // Create new season coach
          const [newCoach] = await db
            .insert(seasonCoaches)
            .values({
              coachId: team.coachId,
              divisionId,
              teamName: team.teamName,
              teamAbbreviation:
                team.teamAbbreviation ||
                team.teamName.substring(0, 3).toUpperCase(),
              teamLogoUrl: team.teamLogoUrl || null,
              remainingBudget,
              isActive: true,
            })
            .returning();
          seasonCoachId = newCoach.id;
        } else {
          // Update existing season coach
          await db
            .update(seasonCoaches)
            .set({
              coachId: team.coachId,
              teamName: team.teamName,
              teamAbbreviation:
                team.teamAbbreviation ||
                team.teamName.substring(0, 3).toUpperCase(),
              teamLogoUrl: team.teamLogoUrl || null,
              remainingBudget,
            })
            .where(eq(seasonCoaches.id, team.id));

          // Get existing rosters to preserve transaction metadata
          const existingRosters = await db.query.rosters.findMany({
            where: eq(rosters.seasonCoachId, team.id),
          });
          const existingByPokemonId = new Map(
            existingRosters.map((r) => [r.pokemonId, r])
          );

          // Determine which Pokemon are in the new roster
          const newPokemonIds = new Set(
            (team.roster || [])
              .filter((r: any) => r.pokemonId)
              .map((r: any) => r.pokemonId)
          );

          // Delete rosters for Pokemon no longer on the team
          for (const existing of existingRosters) {
            if (!newPokemonIds.has(existing.pokemonId)) {
              await db.delete(rosters).where(eq(rosters.id, existing.id));
            }
          }

          // Update or insert rosters
          if (team.roster && team.roster.length > 0) {
            for (let i = 0; i < team.roster.length; i++) {
              const r = team.roster[i];
              if (r.pokemonId) {
                const existing = existingByPokemonId.get(r.pokemonId);
                if (existing) {
                  // Update existing roster - preserve transaction metadata
                  await db
                    .update(rosters)
                    .set({
                      price: r.price || 0,
                      draftOrder: i + 1,
                      isTeraCaptain: r.isTeraCaptain || false,
                      // Preserve: acquiredWeek, acquiredVia, acquiredTransactionId
                    })
                    .where(eq(rosters.id, existing.id));
                } else {
                  // Insert new roster entry
                  await db.insert(rosters).values({
                    seasonCoachId,
                    pokemonId: r.pokemonId,
                    price: r.price || 0,
                    draftOrder: i + 1,
                    isTeraCaptain: r.isTeraCaptain || false,
                  });
                }
              }
            }
          }
          continue; // Skip the insert block below for existing teams
        }

        // Insert new rosters (only for newly created teams)
        if (team.roster && team.roster.length > 0) {
          for (let i = 0; i < team.roster.length; i++) {
            const r = team.roster[i];
            if (r.pokemonId) {
              await db.insert(rosters).values({
                seasonCoachId,
                pokemonId: r.pokemonId,
                price: r.price || 0,
                draftOrder: i + 1,
                isTeraCaptain: r.isTeraCaptain || false,
              });
            }
          }
        }
      }

      return NextResponse.json({ success: true });
    } catch (error: any) {
      console.error("Bulk update error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to save changes" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rosterId = searchParams.get("rosterId");
  const seasonCoachId = searchParams.get("seasonCoachId");

  if (rosterId) {
    // Get roster entry to refund budget
    const roster = await db.query.rosters.findFirst({
      where: eq(rosters.id, parseInt(rosterId)),
    });

    if (roster) {
      // Refund budget
      const sc = await db.query.seasonCoaches.findFirst({
        where: eq(seasonCoaches.id, roster.seasonCoachId),
      });
      if (sc) {
        await db
          .update(seasonCoaches)
          .set({ remainingBudget: (sc.remainingBudget || 0) + roster.price })
          .where(eq(seasonCoaches.id, roster.seasonCoachId));
      }

      await db.delete(rosters).where(eq(rosters.id, parseInt(rosterId)));
    }
    return NextResponse.json({ success: true });
  }

  if (seasonCoachId) {
    // Delete all rosters for a season coach
    await db
      .delete(rosters)
      .where(eq(rosters.seasonCoachId, parseInt(seasonCoachId)));
    await db
      .delete(seasonCoaches)
      .where(eq(seasonCoaches.id, parseInt(seasonCoachId)));
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Missing ID" }, { status: 400 });
}
