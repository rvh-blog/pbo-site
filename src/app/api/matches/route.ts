import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matches, matchPokemon, eloHistory, playoffMatches, bets, killBets, deathBets, killEvents, moves, pokemon } from "@/lib/schema";
import { eq, or } from "drizzle-orm";
import { updateEloForMatch } from "@/lib/elo-service";
import { resolveBetsForMatch, refundBetsForMatch, awardMatchCoins } from "@/lib/betting";
import { resolveKillBetsForMatch, refundKillBetsForMatch } from "@/lib/kill-betting";
import { resolveDeathBetsForMatch, refundDeathBetsForMatch } from "@/lib/death-betting";
import { reResolveBetsForMatch } from "@/lib/bet-resolution";
import { checkAndAwardPickEmRewards, reResolvePickEmRewards, awardGotwBonus, reverseGotwBonus } from "@/lib/pick-em-rewards";

interface KeyEventData {
  turn: number;
  type: "faint" | "win";
  player: "p1" | "p2";
  pokemon?: string;
  killer?: string;
  killerPlayer?: "p1" | "p2";
  move?: string;
  cause?: string;
}

interface PokemonDataEntry {
  seasonCoachId: number;
  pokemonId: number;
  kills?: number;
  deaths?: number;
}

// Helper to insert kill events from keyEvents data
async function insertKillEvents(
  matchId: number,
  keyEventsData: KeyEventData[],
  pokemonDataArray: PokemonDataEntry[],
  coach1SeasonId: number,
  coach2SeasonId: number,
  winnerId: number | null
): Promise<void> {
  // Only process faint events
  const faintEvents = keyEventsData.filter(e => e.type === "faint");
  if (faintEvents.length === 0) return;

  // Build lookup maps for Pokemon IDs from pokemonData
  // pokemonData has seasonCoachId and pokemonId
  const pokemonIdsByCoach = new Map<number, Map<string, number>>();

  // We need Pokemon names, so fetch the Pokemon for this match
  const pokemonIds = pokemonDataArray.map(p => p.pokemonId);
  const pokemonRecords = await db.query.pokemon.findMany({
    where: (pokemon, { inArray }) => inArray(pokemon.id, pokemonIds),
  });

  // Map pokemonId to displayName and name
  const pokemonNameMap = new Map<number, { name: string; displayName: string | null }>();
  for (const p of pokemonRecords) {
    pokemonNameMap.set(p.id, { name: p.name, displayName: p.displayName });
  }

  // Build coach -> pokemonName -> pokemonId lookup
  for (const poke of pokemonDataArray) {
    if (!pokemonIdsByCoach.has(poke.seasonCoachId)) {
      pokemonIdsByCoach.set(poke.seasonCoachId, new Map());
    }
    const pokemonInfo = pokemonNameMap.get(poke.pokemonId);
    if (pokemonInfo) {
      // Add both display name and internal name for lookup
      if (pokemonInfo.displayName) {
        pokemonIdsByCoach.get(poke.seasonCoachId)!.set(pokemonInfo.displayName.toLowerCase(), poke.pokemonId);
      }
      pokemonIdsByCoach.get(poke.seasonCoachId)!.set(pokemonInfo.name.toLowerCase(), poke.pokemonId);
    }
  }

  // Map p1/p2 to seasonCoachId using the win event and winnerId
  let p1SeasonCoachId = coach1SeasonId;
  let p2SeasonCoachId = coach2SeasonId;

  // Determine correct mapping from win event
  const winEvent = keyEventsData.find(e => e.type === "win");
  if (winEvent && winnerId) {
    // The win event tells us which player (p1/p2) won
    // winnerId tells us which coach won
    if (winEvent.player === "p1") {
      // p1 won, so p1 = winnerId
      p1SeasonCoachId = winnerId;
      p2SeasonCoachId = winnerId === coach1SeasonId ? coach2SeasonId : coach1SeasonId;
    } else {
      // p2 won, so p2 = winnerId
      p2SeasonCoachId = winnerId;
      p1SeasonCoachId = winnerId === coach1SeasonId ? coach2SeasonId : coach1SeasonId;
    }
  }

  // Fetch move IDs for direct kills
  const moveNames = faintEvents
    .filter(e => e.move)
    .map(e => e.move!.toLowerCase().replace(/\s+/g, "-"));

  const moveRecords = moveNames.length > 0
    ? await db.query.moves.findMany({
        where: (moves, { inArray }) => inArray(moves.name, moveNames),
      })
    : [];

  const moveIdMap = new Map<string, number>();
  for (const m of moveRecords) {
    moveIdMap.set(m.name.toLowerCase(), m.id);
    if (m.displayName) {
      moveIdMap.set(m.displayName.toLowerCase(), m.id);
    }
  }

  // Insert kill events
  for (const event of faintEvents) {
    if (!event.pokemon) continue;

    // Determine victim info
    const victimSeasonCoachId = event.player === "p1" ? p1SeasonCoachId : p2SeasonCoachId;
    const victimLookup = pokemonIdsByCoach.get(victimSeasonCoachId);
    const victimPokemonId = victimLookup?.get(event.pokemon.toLowerCase());

    if (!victimPokemonId) continue; // Skip if we can't find the victim

    // Determine killer info (if available)
    let killerPokemonId: number | null = null;
    let killerSeasonCoachId: number | null = null;

    if (event.killer && event.killerPlayer) {
      killerSeasonCoachId = event.killerPlayer === "p1" ? p1SeasonCoachId : p2SeasonCoachId;
      const killerLookup = pokemonIdsByCoach.get(killerSeasonCoachId);
      killerPokemonId = killerLookup?.get(event.killer.toLowerCase()) || null;
    }

    // Determine move ID (for direct kills)
    let moveId: number | null = null;
    if (event.move) {
      const moveLookupName = event.move.toLowerCase().replace(/\s+/g, "-");
      moveId = moveIdMap.get(moveLookupName) || moveIdMap.get(event.move.toLowerCase()) || null;
    }

    // Determine cause
    let cause = "move";
    if (event.cause) {
      const causeLower = event.cause.toLowerCase();
      if (causeLower.includes("stealth rock")) cause = "hazard";
      else if (causeLower.includes("spikes")) cause = "hazard";
      else if (causeLower.includes("sandstorm") || causeLower.includes("hail")) cause = "weather";
      else if (causeLower === "psn" || causeLower === "tox" || causeLower === "brn") cause = "status";
      else if (causeLower.includes("leech seed") || causeLower.includes("salt cure") || causeLower.includes("curse")) cause = "status";
      else if (causeLower.includes("recoil")) cause = "recoil";
      else if (causeLower.includes("rocky helmet") || causeLower.includes("rough skin") || causeLower.includes("iron barbs")) cause = "contact";
      else if (causeLower.includes("future sight") || causeLower.includes("doom desire")) cause = "move";
      else cause = "other";
    }

    await db.insert(killEvents).values({
      matchId,
      turn: event.turn,
      killerPokemonId,
      killerSeasonCoachId,
      victimPokemonId,
      victimSeasonCoachId,
      moveId,
      moveName: event.move || null,
      cause,
    });
  }
}

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
    pokemonData, // Array of { seasonCoachId, pokemonId, kills, deaths, damageDealt?, damageDealtIndirect?, damageTaken?, damageTakenIndirect?, hpRestored? }
    startedAt, // Match start time from replay (for anti-cheat betting)
    endedAt, // Match end time from replay
    turnSnapshots, // Array of { turn, p1TotalHp, p2TotalHp } for HP charts
    keyEvents, // Array of { turn, type, description } for key events timeline
    zoroarkInvolved, // Boolean flag for Zoroark games (inaccurate K/D warning)
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
      startedAt: startedAt || null,
      endedAt: endedAt || null,
      turnSnapshots: turnSnapshots ? JSON.stringify(turnSnapshots) : null,
      keyEvents: keyEvents ? JSON.stringify(keyEvents) : null,
      zoroarkInvolved: zoroarkInvolved || false,
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
        damageDealt: poke.damageDealt ?? null,
        damageDealtIndirect: poke.damageDealtIndirect ?? null,
        damageTaken: poke.damageTaken ?? null,
        damageTakenIndirect: poke.damageTakenIndirect ?? null,
        hpRestored: poke.hpRestored ?? null,
      });
    }

    // Insert kill events if keyEvents are provided
    if (keyEvents && Array.isArray(keyEvents)) {
      try {
        await insertKillEvents(match.id, keyEvents, pokemonData, coach1SeasonId, coach2SeasonId, winnerId || null);
      } catch (err) {
        console.error("[Matches API] Error inserting kill events:", err);
      }
    }
  }

  // Update ELO ratings if there's a winner (uses optimized calculation when possible)
  let needsFullRecalc = false;
  if (winnerId) {
    const eloResult = await updateEloForMatch(match.id);
    needsFullRecalc = eloResult.needsFullRecalc;

    // Award coins to players (+5 each, but loser gets nothing if forfeit)
    const loserId = winnerId === coach1SeasonId ? coach2SeasonId : coach1SeasonId;
    await awardMatchCoins(winnerId, loserId, isForfeit || false);

    // Resolve bets - if forfeit, refund; otherwise pay out
    if (isForfeit) {
      await refundBetsForMatch(match.id);
      await refundKillBetsForMatch(match.id);
      await refundDeathBetsForMatch(match.id);
    } else {
      await resolveBetsForMatch(match.id, winnerId);
      await resolveKillBetsForMatch(match.id);
      await resolveDeathBetsForMatch(match.id);
    }
  }

  return NextResponse.json({ ...match, needsFullRecalc });
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
    startedAt, // Match start time from replay (for anti-cheat betting)
    endedAt, // Match end time from replay
    turnSnapshots, // Array of { turn, p1TotalHp, p2TotalHp } for HP charts
    keyEvents, // Array of { turn, type, description } for key events timeline
    zoroarkInvolved, // Boolean flag for Zoroark games (inaccurate K/D warning)
  } = body;

  if (!id) {
    return NextResponse.json({ error: "Match ID is required" }, { status: 400 });
  }

  // Get the current match state before updating (to check if winner is being set for first time)
  const previousMatch = await db.query.matches.findFirst({
    where: eq(matches.id, id),
  });
  const hadPreviousWinner = previousMatch?.winnerId !== null && previousMatch?.winnerId !== undefined;

  const updateData: Record<string, unknown> = {};
  if (winnerId !== undefined) updateData.winnerId = winnerId;
  if (coach1Differential !== undefined) updateData.coach1Differential = coach1Differential;
  if (coach2Differential !== undefined) updateData.coach2Differential = coach2Differential;
  if (isForfeit !== undefined) updateData.isForfeit = isForfeit;
  if (replayUrl !== undefined) updateData.replayUrl = replayUrl;
  if (startedAt !== undefined) updateData.startedAt = startedAt;
  if (endedAt !== undefined) updateData.endedAt = endedAt;
  if (turnSnapshots !== undefined) updateData.turnSnapshots = turnSnapshots ? JSON.stringify(turnSnapshots) : null;
  if (keyEvents !== undefined) updateData.keyEvents = keyEvents ? JSON.stringify(keyEvents) : null;
  if (zoroarkInvolved !== undefined) updateData.zoroarkInvolved = zoroarkInvolved;

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
          damageDealt: poke.damageDealt ?? null,
          damageDealtIndirect: poke.damageDealtIndirect ?? null,
          damageTaken: poke.damageTaken ?? null,
          damageTakenIndirect: poke.damageTakenIndirect ?? null,
          hpRestored: poke.hpRestored ?? null,
        });
      }
    }

    // Insert kill events if keyEvents are provided (wrapped in try-catch as these are supplementary stats)
    if (keyEvents !== undefined && previousMatch) {
      const eventsToProcess = keyEvents || (previousMatch.keyEvents ? JSON.parse(previousMatch.keyEvents as string) : null);
      if (eventsToProcess && Array.isArray(eventsToProcess)) {
        try {
          // Delete existing kill events for this match
          await db.delete(killEvents).where(eq(killEvents.matchId, id));
          // Use the new winnerId if provided, otherwise use previous winner
          const effectiveWinnerId = winnerId !== undefined ? winnerId : previousMatch.winnerId;
          await insertKillEvents(id, eventsToProcess, pokemonData, previousMatch.coach1SeasonId, previousMatch.coach2SeasonId, effectiveWinnerId);
        } catch (err) {
          console.error("[Matches API] Error inserting kill events:", err);
        }
      }
    }
  }

  // Update ELO if winner changed (uses optimized calculation when possible)
  let needsFullRecalc = false;
  let betsReResolved = false;

  if (winnerId !== undefined && winnerId !== null) {
    const eloResult = await updateEloForMatch(id);
    // Always prompt recalc when editing an existing result (not first-time entry)
    needsFullRecalc = hadPreviousWinner || eloResult.needsFullRecalc;

    if (!hadPreviousWinner && previousMatch) {
      // FIRST time setting a winner: award coins and resolve bets
      const loserId = winnerId === previousMatch.coach1SeasonId
        ? previousMatch.coach2SeasonId
        : previousMatch.coach1SeasonId;
      const matchIsForfeit = isForfeit !== undefined ? isForfeit : previousMatch.isForfeit;
      await awardMatchCoins(winnerId, loserId, matchIsForfeit || false);

      // Resolve bets - if forfeit, refund; otherwise pay out
      if (matchIsForfeit) {
        await refundBetsForMatch(id);
        await refundKillBetsForMatch(id);
        await refundDeathBetsForMatch(id);
      } else {
        await resolveBetsForMatch(id, winnerId);
        await resolveKillBetsForMatch(id);
        await resolveDeathBetsForMatch(id);
      }

      // Check and award pick-em rewards if week/division completed
      try {
        const pickEmResult = await checkAndAwardPickEmRewards(id);
        if (pickEmResult.awarded.length > 0) {
          console.log("[Matches API] Pick-em rewards awarded:", pickEmResult.awarded);
        }
      } catch (pickEmError) {
        console.error("[Matches API] Error awarding pick-em rewards:", pickEmError);
      }

      // Award GOTW bonus if this is a Game of the Week match
      try {
        const gotwResult = await awardGotwBonus(id, winnerId);
        if (gotwResult.length > 0) {
          console.log("[Matches API] GOTW bonus awarded:", gotwResult);
        }
      } catch (gotwError) {
        console.error("[Matches API] Error awarding GOTW bonus:", gotwError);
      }
    } else if (hadPreviousWinner) {
      // EDITING a match that already had results: re-resolve all bets
      // This handles cases where winner changed or Pokemon K/D data was corrected
      const matchIsForfeit = isForfeit !== undefined ? isForfeit : previousMatch?.isForfeit;

      if (matchIsForfeit) {
        // If now forfeit, undo resolutions and refund
        await reResolveBetsForMatch(id, null); // Undo only
        await refundBetsForMatch(id);
        await refundKillBetsForMatch(id);
        await refundDeathBetsForMatch(id);
      } else {
        // Re-resolve with new data
        await reResolveBetsForMatch(id, winnerId);
      }
      betsReResolved = true;

      // Re-resolve pick-em rewards if winner actually changed
      const winnerChanged = previousMatch?.winnerId !== winnerId;
      if (winnerChanged) {
        try {
          const pickEmResult = await reResolvePickEmRewards(id);
          if (pickEmResult.reversed.length > 0 || pickEmResult.awarded.length > 0) {
            console.log("[Matches API] Pick-em rewards re-resolved:", pickEmResult);
          }
        } catch (pickEmError) {
          console.error("[Matches API] Error re-resolving pick-em rewards:", pickEmError);
        }
      }

      // Always re-resolve GOTW bonus on any edit (handles GOTW set after result)
      try {
        const gotwReversed = await reverseGotwBonus(id);
        if (gotwReversed.length > 0) {
          console.log("[Matches API] GOTW bonus reversed:", gotwReversed);
        }
        if (winnerId) {
          const gotwAwarded = await awardGotwBonus(id, winnerId);
          if (gotwAwarded.length > 0) {
            console.log("[Matches API] GOTW bonus re-awarded:", gotwAwarded);
          }
        }
      } catch (gotwError) {
        console.error("[Matches API] Error re-resolving GOTW bonus:", gotwError);
      }

      // Also check for overall pick-em rewards (in case this edit completes a week)
      try {
        const pickEmResult = await checkAndAwardPickEmRewards(id);
        if (pickEmResult.awarded.length > 0) {
          console.log("[Matches API] Pick-em rewards awarded on edit:", pickEmResult.awarded);
        }
      } catch (pickEmError) {
        console.error("[Matches API] Error checking pick-em rewards on edit:", pickEmError);
      }
    }
  }

  return NextResponse.json({ ...updated, needsFullRecalc, betsReResolved });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    const matchId = parseInt(id);

    // Check if match had ELO impact before deleting
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });
    const hadEloImpact = match?.winnerId !== null && match?.winnerId !== undefined;

    // Refund any pending bets on this match
    await refundBetsForMatch(matchId);
    await refundKillBetsForMatch(matchId);
    await refundDeathBetsForMatch(matchId);

    // Delete elo_history records that reference this match
    await db.delete(eloHistory).where(eq(eloHistory.matchId, matchId));

    // Delete any resolved bets for this match (after refunding pending ones)
    await db.delete(bets).where(eq(bets.matchId, matchId));
    await db.delete(killBets).where(eq(killBets.matchId, matchId));
    await db.delete(deathBets).where(eq(deathBets.matchId, matchId));

    // Delete kill events for this match (wrapped in try-catch as table may not exist yet)
    try {
      await db.delete(killEvents).where(eq(killEvents.matchId, matchId));
    } catch {
      // Table may not exist yet, ignore
    }

    // Delete match Pokemon
    await db.delete(matchPokemon).where(eq(matchPokemon.matchId, matchId));

    // Delete any playoff_matches entry that references this match (for Week 101+ fixtures)
    await db.delete(playoffMatches).where(eq(playoffMatches.matchId, matchId));

    // Delete match
    await db.delete(matches).where(eq(matches.id, matchId));

    // Don't auto-recalculate - let UI handle showing recalc prompt
    return NextResponse.json({ success: true, needsFullRecalc: hadEloImpact });
  } catch (error) {
    console.error("Error deleting match:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete match" },
      { status: 500 }
    );
  }
}
