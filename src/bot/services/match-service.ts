import { db } from "@/lib/db";
import {
  matches,
  matchPokemon,
  seasonCoaches,
  rosters,
  pokemon,
  transactions,
  killEvents,
  playoffMatches,
} from "@/lib/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { updateEloForMatch } from "@/lib/elo-service";
import { awardMatchCoins, resolveBetsForMatch, refundBetsForMatch } from "@/lib/betting";
import { resolveKillBetsForMatch, refundKillBetsForMatch } from "@/lib/kill-betting";
import { resolveDeathBetsForMatch, refundDeathBetsForMatch } from "@/lib/death-betting";
import { getTimeSyncedRoster, type TimeSyncTransaction } from "@/lib/roster-utils";
import { checkAndAwardPickEmRewards, awardGotwBonus } from "@/lib/pick-em-rewards";
import { syncDivision } from "@/lib/sheets-sync-all";
import {
  getPokemonAliasMaps,
} from "@/lib/pokemon-name-aliases";
import {
  findMatchingRosterPokemon,
  type ReplayRosterPokemon,
} from "@/lib/replay-roster-matching";

export interface FixtureOption {
  matchId: number;
  week: number;
  team1Name: string;
  team2Name: string;
  coach1SeasonId: number;
  coach2SeasonId: number;
  hasResult: boolean;
  scheduledAt: string | null;
}

export interface MatchResult {
  winnerId: number;
  coach1Differential: number;
  coach2Differential: number;
  replayUrl?: string;
  pokemonData?: {
    seasonCoachId: number;
    pokemonId: number;
    kills: number;
    deaths: number;
  }[];
}

interface PokemonStats {
  name: string;
  kills: number;
  deaths: number;
  revealedItems: Array<{ item: string; turn: number; source: string }>;
  damageDealt: number;
    damageDealtIndirect: number;
    damageTaken: number;
    damageTakenIndirect: number;
    turnsActive: number;
    hazardDamageTaken: number;
    setupMovesUsed: number;
    favorableCrits: number;
    favorableMisses: number;
    favorableFlinches: number;
    favorableParalysis: number;
    favorableFreezes: number;
    favorableBurns: number;
    favorableSleep: number;
    hpRestored: number;
  }

interface TurnSnapshot {
  turn: number;
  p1TotalHp: number;
  p2TotalHp: number;
}

interface KeyEvent {
  turn: number;
  type: "faint" | "win";
  player: "p1" | "p2";
  pokemon?: string;
  killer?: string;
  killerPlayer?: "p1" | "p2";
  move?: string;
  cause?: string;
}

interface ParsedReplay {
  p1Username: string;
  p2Username: string;
  p1Team: PokemonStats[];
  p2Team: PokemonStats[];
  winner: "p1" | "p2" | null;
  p1Remaining: number;
  p2Remaining: number;
  startedAt: string | null;
  endedAt: string | null;
  zoroarkInvolved: boolean;
  turnSnapshots: TurnSnapshot[];
  keyEvents: KeyEvent[];
}

/**
 * Get all weeks with fixtures in a division
 */
export async function getWeeksInDivision(
  divisionId: number
): Promise<number[]> {
  const fixtures = await db
    .select({ week: matches.week })
    .from(matches)
    .where(eq(matches.divisionId, divisionId))
    .groupBy(matches.week)
    .orderBy(matches.week);

  return fixtures.map((f) => f.week);
}

/**
 * Get fixtures for a specific week in a division
 */
export async function getFixturesForWeek(
  divisionId: number,
  week: number
): Promise<FixtureOption[]> {
  const fixtures = await db
    .select({
      matchId: matches.id,
      week: matches.week,
      team1Name: seasonCoaches.teamName,
      coach1SeasonId: matches.coach1SeasonId,
      coach2SeasonId: matches.coach2SeasonId,
      winnerId: matches.winnerId,
      scheduledAt: matches.scheduledAt,
    })
    .from(matches)
    .innerJoin(seasonCoaches, eq(matches.coach1SeasonId, seasonCoaches.id))
    .where(and(eq(matches.divisionId, divisionId), eq(matches.week, week)))
    .orderBy(matches.id);

  // Get team2 names separately
  const result: FixtureOption[] = [];
  for (const f of fixtures) {
    const team2 = await db
      .select({ teamName: seasonCoaches.teamName })
      .from(seasonCoaches)
      .where(eq(seasonCoaches.id, f.coach2SeasonId))
      .limit(1);

    result.push({
      matchId: f.matchId,
      week: f.week,
      team1Name: f.team1Name,
      team2Name: team2[0]?.teamName || "Unknown",
      coach1SeasonId: f.coach1SeasonId,
      coach2SeasonId: f.coach2SeasonId,
      hasResult: f.winnerId !== null,
      scheduledAt: f.scheduledAt,
    });
  }

  return result;
}

/**
 * Get match details by ID
 */
export async function getMatchDetails(matchId: number): Promise<{
  id: number;
  week: number;
  divisionId: number;
  team1Name: string;
  team2Name: string;
  coach1SeasonId: number;
  coach2SeasonId: number;
  coach1Name: string;
  coach2Name: string;
  winnerId: number | null;
  replayUrl: string | null;
} | null> {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
    with: {
      coach1: {
        with: { coach: true },
      },
      coach2: {
        with: { coach: true },
      },
    },
  });

  if (!match) return null;

  return {
    id: match.id,
    week: match.week,
    divisionId: match.divisionId,
    team1Name: match.coach1.teamName,
    team2Name: match.coach2.teamName,
    coach1SeasonId: match.coach1SeasonId,
    coach2SeasonId: match.coach2SeasonId,
    coach1Name: match.coach1.coach.name,
    coach2Name: match.coach2.coach.name,
    winnerId: match.winnerId,
    replayUrl: match.replayUrl,
  };
}

/**
 * Parse a Pokemon Showdown replay URL using the shared API endpoint
 */
export async function parseReplay(replayUrl: string): Promise<ParsedReplay | null> {
  try {
    // Use the same replay scraper API that the admin page uses
    // In production, this will be the deployed URL; in development, localhost
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";

    const response = await fetch(`${baseUrl}/api/replay-scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ replayUrl }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("[Match Service] Replay scrape failed:", error);
      return null;
    }

    const data = await response.json();
    return data as ParsedReplay;
  } catch (error) {
    console.error("[Match Service] Error parsing replay:", error);
    return null;
  }
}

/**
 * Match replay players to coaches using roster-based matching.
 * When matchWeek is provided, uses time-synced rosters for accurate historical matching.
 */
export async function matchUsernamesToCoaches(
  coach1SeasonId: number,
  coach2SeasonId: number,
  p1Username: string,
  p2Username: string,
  p1Team?: { name: string }[],
  p2Team?: { name: string }[],
  matchWeek?: number
): Promise<{
  p1IsCoach1: boolean;
  matched: boolean;
}> {
  // Get rosters for both coaches (time-synced if matchWeek provided)
  const coach1Roster = await getCoachRoster(coach1SeasonId, matchWeek);
  const coach2Roster = await getCoachRoster(coach2SeasonId, matchWeek);
  const aliasMaps = await getPokemonAliasMaps();

  // If we have team data, use roster-based matching (more reliable)
  if (p1Team && p2Team && coach1Roster.length > 0 && coach2Roster.length > 0) {
    let p1MatchesCoach1 = 0;
    let p1MatchesCoach2 = 0;
    let p2MatchesCoach1 = 0;
    let p2MatchesCoach2 = 0;

    for (const replayPoke of p1Team) {
      if (findMatchingRosterPokemon(coach1Roster, replayPoke.name, aliasMaps)) {
        p1MatchesCoach1++;
      }
      if (findMatchingRosterPokemon(coach2Roster, replayPoke.name, aliasMaps)) {
        p1MatchesCoach2++;
      }
    }

    for (const replayPoke of p2Team) {
      if (findMatchingRosterPokemon(coach1Roster, replayPoke.name, aliasMaps)) {
        p2MatchesCoach1++;
      }
      if (findMatchingRosterPokemon(coach2Roster, replayPoke.name, aliasMaps)) {
        p2MatchesCoach2++;
      }
    }

    // Determine mapping: does replay p1 = our coach1 or coach2?
    const p1IsCoach1Score = p1MatchesCoach1 + p2MatchesCoach2;
    const p1IsCoach2Score = p1MatchesCoach2 + p2MatchesCoach1;

    if (p1IsCoach1Score > p1IsCoach2Score) {
      return { p1IsCoach1: true, matched: true };
    } else if (p1IsCoach2Score > p1IsCoach1Score) {
      return { p1IsCoach1: false, matched: true };
    }
    // If tied, fall through to username matching
  }

  // Fallback: try to match by username similarity
  const coach1 = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, coach1SeasonId),
    with: { coach: true },
  });

  const coach2 = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, coach2SeasonId),
    with: { coach: true },
  });

  if (!coach1 || !coach2) {
    return { p1IsCoach1: true, matched: false };
  }

  const c1Name = coach1.coach.name.toLowerCase().replace(/\s+/g, "");
  const c2Name = coach2.coach.name.toLowerCase().replace(/\s+/g, "");
  const p1Lower = p1Username.toLowerCase().replace(/\s+/g, "");

  const p1MatchesCoach1 = p1Lower.includes(c1Name) || c1Name.includes(p1Lower);
  const p1MatchesCoach2 = p1Lower.includes(c2Name) || c2Name.includes(p1Lower);

  if (p1MatchesCoach1 && !p1MatchesCoach2) {
    return { p1IsCoach1: true, matched: true };
  }
  if (p1MatchesCoach2 && !p1MatchesCoach1) {
    return { p1IsCoach1: false, matched: true };
  }

  // Default to assuming p1 is coach1 if we can't determine
  return { p1IsCoach1: true, matched: false };
}

/**
 * Helper to insert kill events from keyEvents data
 */
async function insertKillEvents(
  matchId: number,
  keyEventsData: KeyEvent[],
  pokemonDataArray: { seasonCoachId: number; pokemonId: number }[],
  coach1SeasonId: number,
  coach2SeasonId: number,
  winnerId: number
): Promise<void> {
  // Only process faint events
  const faintEvents = keyEventsData.filter(e => e.type === "faint");
  if (faintEvents.length === 0) return;

  // Build lookup maps for Pokemon IDs from pokemonData
  const pokemonIds = pokemonDataArray.map(p => p.pokemonId);
  const pokemonRecords = await db.query.pokemon.findMany({
    where: (pokemon, { inArray }) => inArray(pokemon.id, pokemonIds),
  });

  // Map pokemonId to displayName and name
  const pokemonNameMap = new Map<number, { name: string; displayName: string | null }>();
  for (const p of pokemonRecords) {
    pokemonNameMap.set(p.id, { name: p.name, displayName: p.displayName });
  }

  // Build coach roster entries from the Pokemon that were recorded for this
  // match. Kill events must use the same form-aware matching as replay teams:
  // Showdown can leave a drafted Mega in its base form for the entire battle.
  const pokemonByCoach = new Map<number, ReplayRosterPokemon[]>();
  for (const poke of pokemonDataArray) {
    if (!pokemonByCoach.has(poke.seasonCoachId)) {
      pokemonByCoach.set(poke.seasonCoachId, []);
    }
    const pokemonInfo = pokemonNameMap.get(poke.pokemonId);
    if (pokemonInfo) {
      pokemonByCoach.get(poke.seasonCoachId)!.push({
        pokemonId: poke.pokemonId,
        name: pokemonInfo.name,
        displayName: pokemonInfo.displayName,
      });
    }
  }
  const aliasMaps = await getPokemonAliasMaps();

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

    const victimSeasonCoachId = event.player === "p1" ? p1SeasonCoachId : p2SeasonCoachId;
    const victimRoster = pokemonByCoach.get(victimSeasonCoachId) || [];
    const victimPokemonId = findMatchingRosterPokemon(
      victimRoster,
      event.pokemon,
      aliasMaps
    )?.pokemonId;

    if (!victimPokemonId) continue;

    let killerPokemonId: number | null = null;
    let killerSeasonCoachId: number | null = null;

    if (event.killer && event.killerPlayer) {
      killerSeasonCoachId = event.killerPlayer === "p1" ? p1SeasonCoachId : p2SeasonCoachId;
      const killerRoster = pokemonByCoach.get(killerSeasonCoachId) || [];
      killerPokemonId = findMatchingRosterPokemon(
        killerRoster,
        event.killer,
        aliasMaps
      )?.pokemonId || null;
    }

    let moveId: number | null = null;
    if (event.move) {
      const moveLookupName = event.move.toLowerCase().replace(/\s+/g, "-");
      moveId = moveIdMap.get(moveLookupName) || moveIdMap.get(event.move.toLowerCase()) || null;
    }

    let cause = "move";
    if (event.cause) {
      const causeLower = event.cause.toLowerCase();
      if (causeLower.includes("stealth rock") || causeLower.includes("spikes")) cause = "hazard";
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

/**
 * Record match result
 */
export async function recordMatchResult(
  matchId: number,
  winnerId: number,
  differential1: number,
  differential2: number,
  replayUrl?: string,
  pokemonData?: {
    seasonCoachId: number;
    pokemonId: number;
    kills: number;
    deaths: number;
    damageDealt?: number;
    damageDealtIndirect?: number;
    damageTaken?: number;
    damageTakenIndirect?: number;
    turnsActive?: number;
    hazardDamageTaken?: number;
    setupMovesUsed?: number;
    favorableCrits?: number;
    favorableMisses?: number;
    favorableFlinches?: number;
    favorableParalysis?: number;
    favorableFreezes?: number;
    favorableBurns?: number;
    favorableSleep?: number;
    hpRestored?: number;
    revealedItems?: Array<{ item: string; turn: number; source: string }>;
  }[],
  startedAt?: string | null,
  endedAt?: string | null,
  turnSnapshots?: TurnSnapshot[] | null,
  keyEvents?: KeyEvent[] | null,
  zoroarkInvolved?: boolean
): Promise<{ success: boolean; error?: string; needsFullRecalc?: boolean }> {
  try {
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });

    if (!match) {
      return { success: false, error: "Match not found" };
    }

    // Validate winner is one of the participants
    if (winnerId !== match.coach1SeasonId && winnerId !== match.coach2SeasonId) {
      return { success: false, error: "Invalid winner - must be one of the match participants" };
    }

    // Update the match
    await db
      .update(matches)
      .set({
        winnerId,
        coach1Differential: differential1,
        coach2Differential: differential2,
        replayUrl: replayUrl || match.replayUrl,
        playedAt: new Date().toISOString(),
        startedAt: startedAt || null,
        endedAt: endedAt || null,
        turnSnapshots: turnSnapshots ? JSON.stringify(turnSnapshots) : null,
        keyEvents: keyEvents ? JSON.stringify(keyEvents) : null,
        zoroarkInvolved: zoroarkInvolved || false,
      })
      .where(eq(matches.id, matchId));

    // Update Pokemon data if provided
    if (pokemonData && pokemonData.length > 0) {
      // Delete existing Pokemon data for this match
      await db.delete(matchPokemon).where(eq(matchPokemon.matchId, matchId));

      // Insert new Pokemon data
      for (const poke of pokemonData) {
        if (poke.pokemonId) {
          await db.insert(matchPokemon).values({
            matchId,
            seasonCoachId: poke.seasonCoachId,
            pokemonId: poke.pokemonId,
            kills: poke.kills || 0,
            deaths: poke.deaths || 0,
            damageDealt: poke.damageDealt ?? null,
            damageDealtIndirect: poke.damageDealtIndirect ?? null,
            damageTaken: poke.damageTaken ?? null,
            damageTakenIndirect: poke.damageTakenIndirect ?? null,
            turnsActive: poke.turnsActive ?? null,
            hazardDamageTaken: poke.hazardDamageTaken ?? null,
            setupMovesUsed: poke.setupMovesUsed ?? null,
            favorableCrits: poke.favorableCrits ?? null,
            favorableMisses: poke.favorableMisses ?? null,
            favorableFlinches: poke.favorableFlinches ?? null,
            favorableParalysis: poke.favorableParalysis ?? null,
            favorableFreezes: poke.favorableFreezes ?? null,
            favorableBurns: poke.favorableBurns ?? null,
            favorableSleep: poke.favorableSleep ?? null,
            hpRestored: poke.hpRestored ?? null,
            revealedItems: poke.revealedItems ?? null,
          });
        }
      }

      // Insert kill events if keyEvents are provided (wrapped in try-catch as these are supplementary stats)
      if (keyEvents && keyEvents.length > 0) {
        try {
          // Delete existing kill events for this match
          await db.delete(killEvents).where(eq(killEvents.matchId, matchId));
          await insertKillEvents(matchId, keyEvents, pokemonData, match.coach1SeasonId, match.coach2SeasonId, winnerId);
        } catch (err) {
          console.error("[Match Service] Error inserting kill events:", err);
        }
      }
    }

    // Update ELO
    const eloResult = await updateEloForMatch(matchId);

    // Award coins to players (+10 each, but loser gets nothing if forfeit)
    const loserId = winnerId === match.coach1SeasonId ? match.coach2SeasonId : match.coach1SeasonId;
    await awardMatchCoins(winnerId, loserId, match.isForfeit || false);

    // Resolve bets - if forfeit, refund; otherwise pay out
    if (match.isForfeit) {
      await refundBetsForMatch(matchId);
      await refundKillBetsForMatch(matchId);
      await refundDeathBetsForMatch(matchId);
    } else {
      await resolveBetsForMatch(matchId, winnerId);
      await resolveKillBetsForMatch(matchId);
      await resolveDeathBetsForMatch(matchId);
    }

    // Check and award pick-em rewards if week/division completed
    try {
      const pickEmResult = await checkAndAwardPickEmRewards(matchId);
      if (pickEmResult.awarded.length > 0) {
        console.log("[Match Service] Pick-em rewards awarded:", pickEmResult.awarded);
      }
    } catch (pickEmError) {
      // Don't fail the match recording if pick-em rewards fail
      console.error("[Match Service] Error awarding pick-em rewards:", pickEmError);
    }

    // Award GOTW bonus if this is a Game of the Week match
    try {
      const gotwResult = await awardGotwBonus(matchId, winnerId);
      if (gotwResult.length > 0) {
        console.log("[Match Service] GOTW bonus awarded:", gotwResult);
      }
    } catch (gotwError) {
      console.error("[Match Service] Error awarding GOTW bonus:", gotwError);
    }

    // Fire-and-forget: sync division sheet in background (don't block Discord response)
    syncDivision(match.divisionId)
      .then((syncResult) => {
        if (syncResult.success) {
          console.log(`[Match Service] Sheet sync completed for division ${match.divisionId}`);
        } else if (syncResult.error && !syncResult.error.includes("No sheet sync configuration")) {
          console.log(`[Match Service] Sheet sync skipped: ${syncResult.error}`);
        }
      })
      .catch((syncError) => {
        console.error("[Match Service] Error syncing sheet:", syncError);
      });

    // Sync playoff tables if this is a playoff match (week > 100)
    if (match.week > 100) {
      try {
        await syncPlayoffResult({ ...match, coach1Differential: differential1, coach2Differential: differential2 }, winnerId);
        console.log(`[Match Service] Playoff sync completed for match ${matchId}`);
      } catch (playoffError) {
        console.error("[Match Service] Error syncing playoff result:", playoffError);
      }
    }

    return { success: true, needsFullRecalc: eloResult.needsFullRecalc };
  } catch (error) {
    console.error("[Match Service] Error recording result:", error);
    return { success: false, error: "Database error" };
  }
}

/**
 * Sync a playoff match result to the playoffMatches table and propagate the winner
 * to the next round (QF→SF→Finals).
 */
async function syncPlayoffResult(
  match: { id: number; week: number; seasonId: number; divisionId: number; coach1SeasonId: number; coach2SeasonId: number; coach1Differential: number | null; coach2Differential: number | null },
  winnerId: number
) {
  const round = match.week - 100; // 101→1 (QF), 102→2 (SF), 103→3 (Finals)

  // Find the playoff entry that corresponds to this match
  const allPlayoffs = await db.query.playoffMatches.findMany({
    where: and(
      eq(playoffMatches.seasonId, match.seasonId),
      eq(playoffMatches.divisionId, match.divisionId),
      eq(playoffMatches.round, round),
    ),
  });

  // Find by matchId link first, then by team matchup
  let playoffEntry = allPlayoffs.find((pm) => pm.matchId === match.id);
  if (!playoffEntry) {
    playoffEntry = allPlayoffs.find((pm) =>
      (pm.higherSeedId === match.coach1SeasonId && pm.lowerSeedId === match.coach2SeasonId) ||
      (pm.higherSeedId === match.coach2SeasonId && pm.lowerSeedId === match.coach1SeasonId)
    );
  }

  if (!playoffEntry) {
    console.warn(`[Match Service] No playoff entry found for match ${match.id} (round ${round})`);
    return;
  }

  // Determine win counts from differentials (matches admin logic)
  // Only the winner gets their differential as win count; loser gets 0
  const coach1IsHigherSeed = playoffEntry.higherSeedId === match.coach1SeasonId;
  const higherSeedDiff = Math.abs(coach1IsHigherSeed ? (match.coach1Differential || 0) : (match.coach2Differential || 0));
  const lowerSeedDiff = Math.abs(coach1IsHigherSeed ? (match.coach2Differential || 0) : (match.coach1Differential || 0));
  const higherSeedWins = winnerId === playoffEntry.higherSeedId ? higherSeedDiff : 0;
  const lowerSeedWins = winnerId === playoffEntry.lowerSeedId ? lowerSeedDiff : 0;

  // Update the playoff entry with the winner and scores
  await db
    .update(playoffMatches)
    .set({
      winnerId,
      matchId: match.id,
      higherSeedWins,
      lowerSeedWins,
    })
    .where(eq(playoffMatches.id, playoffEntry.id));

  // Propagate winner to next round
  if (round >= 3) return; // Finals — no next round

  let nextRound: number;
  let nextPosition: number;
  let isHigherSeedSlot: boolean;

  if (round === 1) {
    nextRound = 2;
    nextPosition = playoffEntry.bracketPosition <= 2 ? 1 : 2;
    isHigherSeedSlot = playoffEntry.bracketPosition === 1 || playoffEntry.bracketPosition === 3;
  } else {
    nextRound = 3;
    nextPosition = 1;
    isHigherSeedSlot = playoffEntry.bracketPosition === 1;
  }

  // Find or create the next round match
  const nextMatches = await db.query.playoffMatches.findMany({
    where: and(
      eq(playoffMatches.seasonId, match.seasonId),
      eq(playoffMatches.divisionId, match.divisionId),
      eq(playoffMatches.round, nextRound),
      eq(playoffMatches.bracketPosition, nextPosition),
    ),
  });

  if (nextMatches.length > 0) {
    const nextMatch = nextMatches[0];
    await db
      .update(playoffMatches)
      .set(isHigherSeedSlot ? { higherSeedId: winnerId } : { lowerSeedId: winnerId })
      .where(eq(playoffMatches.id, nextMatch.id));

    // Check if both seeds are now filled — if so, create the match fixture
    const updatedHigher = isHigherSeedSlot ? winnerId : nextMatch.higherSeedId;
    const updatedLower = isHigherSeedSlot ? nextMatch.lowerSeedId : winnerId;

    if (updatedHigher && updatedLower && !nextMatch.matchId) {
      const week = 100 + nextRound;

      // Check for existing fixture to avoid duplicates — must match the specific teams
      const existingFixture = await db.query.matches.findFirst({
        where: and(
          eq(matches.seasonId, match.seasonId),
          eq(matches.divisionId, match.divisionId),
          eq(matches.week, week),
          or(
            and(
              eq(matches.coach1SeasonId, updatedHigher),
              eq(matches.coach2SeasonId, updatedLower),
            ),
            and(
              eq(matches.coach1SeasonId, updatedLower),
              eq(matches.coach2SeasonId, updatedHigher),
            ),
          ),
        ),
      });

      if (existingFixture) {
        await db.update(playoffMatches).set({ matchId: existingFixture.id }).where(eq(playoffMatches.id, nextMatch.id));
        console.log(`[Match Service] Linked existing fixture ${existingFixture.id} to SF/F playoff entry`);
      } else {
        const [newFixture] = await db.insert(matches).values({
          seasonId: match.seasonId,
          divisionId: match.divisionId,
          week,
          coach1SeasonId: updatedHigher,
          coach2SeasonId: updatedLower,
        }).returning();
        await db.update(playoffMatches).set({ matchId: newFixture.id }).where(eq(playoffMatches.id, nextMatch.id));
        console.log(`[Match Service] Created match fixture ${newFixture.id} for week ${week}`);
      }
    }
  } else {
    await db.insert(playoffMatches).values({
      seasonId: match.seasonId,
      divisionId: match.divisionId,
      round: nextRound,
      bracketPosition: nextPosition,
      ...(isHigherSeedSlot ? { higherSeedId: winnerId } : { lowerSeedId: winnerId }),
    });
  }
}

/**
 * Update the scheduled time for a match
 */
export async function updateMatchSchedule(
  matchId: number,
  scheduledAt: string | null,
  expectedScheduledAt: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const updated = await db
      .update(matches)
      .set({ scheduledAt })
      .where(and(
        eq(matches.id, matchId),
        isNull(matches.winnerId),
        expectedScheduledAt === null
          ? isNull(matches.scheduledAt)
          : eq(matches.scheduledAt, expectedScheduledAt)
      ))
      .returning({ id: matches.id });

    if (updated.length === 0) {
      return {
        success: false,
        error: "This match was played or its schedule changed while you were editing it. Run /schedule again to review the latest time.",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[Match Service] Error updating schedule:", error);
    return { success: false, error: "Database error" };
  }
}

/**
 * Get Pokemon on a coach's roster for kill tracking.
 * When matchWeek is provided, returns the time-synced roster as it was at that week,
 * including Pokemon that were dropped after matchWeek.
 */
export async function getCoachRoster(seasonCoachId: number, matchWeek?: number): Promise<{
  pokemonId: number;
  name: string;
  displayName: string | null;
}[]> {
  if (matchWeek === undefined) {
    // No time-sync needed — return current roster
    const roster = await db
      .select({
        pokemonId: rosters.pokemonId,
        name: pokemon.name,
        displayName: pokemon.displayName,
      })
      .from(rosters)
      .innerJoin(pokemon, eq(rosters.pokemonId, pokemon.id))
      .where(eq(rosters.seasonCoachId, seasonCoachId));

    return roster;
  }

  // Fetch current rosters with full pokemon relation (needed by getTimeSyncedRoster)
  const currentRosters = await db.query.rosters.findMany({
    where: eq(rosters.seasonCoachId, seasonCoachId),
    with: { pokemon: true },
  });

  // Fetch transactions for this coach's season (go through division to get seasonId)
  const sc = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, seasonCoachId),
    with: { division: true },
  });
  const [primaryTxs, partnerP2PTxs] = sc
    ? await Promise.all([
        db.query.transactions.findMany({
          where: and(
            eq(transactions.seasonId, sc.division.seasonId),
            eq(transactions.seasonCoachId, seasonCoachId)
          ),
        }),
        db.query.transactions.findMany({
          where: and(
            eq(transactions.seasonId, sc.division.seasonId),
            eq(transactions.type, "P2P_TRADE"),
            eq(transactions.tradingPartnerSeasonCoachId, seasonCoachId)
          ),
        }),
      ])
    : [[], []];
  const coachTxs = [...primaryTxs, ...partnerP2PTxs];

  const { filteredRosters, droppedPokemonDetails } = await getTimeSyncedRoster(
    seasonCoachId,
    matchWeek,
    currentRosters as Parameters<typeof getTimeSyncedRoster>[2],
    coachTxs as TimeSyncTransaction[]
  );

  // Combine active + dropped Pokemon for matching
  const result = [
    ...filteredRosters.map((r) => ({
      pokemonId: r.pokemonId,
      name: r.pokemon?.name || "",
      displayName: r.pokemon?.displayName || null,
    })),
    ...droppedPokemonDetails.map((p) => ({
      pokemonId: p.id,
      name: p.name,
      displayName: p.displayName,
    })),
  ];

  return result;
}

/**
 * Match replay Pokemon to roster and build Pokemon data for match recording.
 * When matchWeek is provided, uses time-synced rosters for accurate historical matching.
 */
export async function buildPokemonDataFromReplay(
  coach1SeasonId: number,
  coach2SeasonId: number,
  replayData: ParsedReplay,
  p1IsCoach1: boolean,
  matchWeek?: number
): Promise<{
  seasonCoachId: number;
  pokemonId: number;
  kills: number;
  deaths: number;
  damageDealt?: number;
  damageDealtIndirect?: number;
  damageTaken?: number;
  damageTakenIndirect?: number;
  turnsActive?: number;
  hazardDamageTaken?: number;
  setupMovesUsed?: number;
  favorableCrits?: number;
  favorableMisses?: number;
  favorableFlinches?: number;
  favorableParalysis?: number;
  favorableFreezes?: number;
  favorableBurns?: number;
  favorableSleep?: number;
  hpRestored?: number;
  revealedItems?: Array<{ item: string; turn: number; source: string }>;
}[]> {
  const coach1Roster = await getCoachRoster(coach1SeasonId, matchWeek);
  const coach2Roster = await getCoachRoster(coach2SeasonId, matchWeek);
  const aliasMaps = await getPokemonAliasMaps();

  // Map replay teams to our coaches
  const coach1ReplayTeam = p1IsCoach1 ? replayData.p1Team : replayData.p2Team;
  const coach2ReplayTeam = p1IsCoach1 ? replayData.p2Team : replayData.p1Team;

  const pokemonData: {
    seasonCoachId: number;
    pokemonId: number;
    kills: number;
    deaths: number;
    damageDealt?: number;
    damageDealtIndirect?: number;
    damageTaken?: number;
    damageTakenIndirect?: number;
    turnsActive?: number;
    hazardDamageTaken?: number;
    setupMovesUsed?: number;
    favorableCrits?: number;
    favorableMisses?: number;
    favorableFlinches?: number;
    favorableParalysis?: number;
    favorableFreezes?: number;
    favorableBurns?: number;
    favorableSleep?: number;
    hpRestored?: number;
    revealedItems?: Array<{ item: string; turn: number; source: string }>;
  }[] = [];

  // Match coach1's Pokemon
  for (const replayPoke of coach1ReplayTeam) {
    const matchingRoster = findMatchingRosterPokemon(coach1Roster, replayPoke.name, aliasMaps);
    if (matchingRoster) {
      pokemonData.push({
        seasonCoachId: coach1SeasonId,
        pokemonId: matchingRoster.pokemonId,
        kills: replayPoke.kills,
        deaths: replayPoke.deaths,
        damageDealt: replayPoke.damageDealt,
        damageDealtIndirect: replayPoke.damageDealtIndirect,
        damageTaken: replayPoke.damageTaken,
        damageTakenIndirect: replayPoke.damageTakenIndirect,
        turnsActive: replayPoke.turnsActive,
        hazardDamageTaken: replayPoke.hazardDamageTaken,
        setupMovesUsed: replayPoke.setupMovesUsed,
        favorableCrits: replayPoke.favorableCrits,
        favorableMisses: replayPoke.favorableMisses,
        favorableFlinches: replayPoke.favorableFlinches,
        favorableParalysis: replayPoke.favorableParalysis,
        favorableFreezes: replayPoke.favorableFreezes,
        favorableBurns: replayPoke.favorableBurns,
        favorableSleep: replayPoke.favorableSleep,
        hpRestored: replayPoke.hpRestored,
        revealedItems: replayPoke.revealedItems,
      });
    } else {
      console.warn(
        `[Match Service] Could not match replay Pokemon "${replayPoke.name}" to coach ${coach1SeasonId}'s roster`
      );
    }
  }

  // Match coach2's Pokemon
  for (const replayPoke of coach2ReplayTeam) {
    const matchingRoster = findMatchingRosterPokemon(coach2Roster, replayPoke.name, aliasMaps);
    if (matchingRoster) {
      pokemonData.push({
        seasonCoachId: coach2SeasonId,
        pokemonId: matchingRoster.pokemonId,
        kills: replayPoke.kills,
        deaths: replayPoke.deaths,
        damageDealt: replayPoke.damageDealt,
        damageDealtIndirect: replayPoke.damageDealtIndirect,
        damageTaken: replayPoke.damageTaken,
        damageTakenIndirect: replayPoke.damageTakenIndirect,
        turnsActive: replayPoke.turnsActive,
        hazardDamageTaken: replayPoke.hazardDamageTaken,
        setupMovesUsed: replayPoke.setupMovesUsed,
        favorableCrits: replayPoke.favorableCrits,
        favorableMisses: replayPoke.favorableMisses,
        favorableFlinches: replayPoke.favorableFlinches,
        favorableParalysis: replayPoke.favorableParalysis,
        favorableFreezes: replayPoke.favorableFreezes,
        favorableBurns: replayPoke.favorableBurns,
        favorableSleep: replayPoke.favorableSleep,
        hpRestored: replayPoke.hpRestored,
        revealedItems: replayPoke.revealedItems,
      });
    } else {
      console.warn(
        `[Match Service] Could not match replay Pokemon "${replayPoke.name}" to coach ${coach2SeasonId}'s roster`
      );
    }
  }

  return pokemonData;
}

/**
 * Validate every replay Pokemon against the time-synced roster it was mapped
 * to. This is read-only and is intended for confirmation UIs before a result
 * write occurs.
 */
export async function validateReplayRosterMatches(
  coach1SeasonId: number,
  coach2SeasonId: number,
  replayData: ParsedReplay,
  p1IsCoach1: boolean,
  matchWeek?: number
): Promise<{
  coach1Unmatched: string[];
  coach2Unmatched: string[];
}> {
  const [coach1Roster, coach2Roster, aliasMaps] = await Promise.all([
    getCoachRoster(coach1SeasonId, matchWeek),
    getCoachRoster(coach2SeasonId, matchWeek),
    getPokemonAliasMaps(),
  ]);
  const coach1ReplayTeam = p1IsCoach1 ? replayData.p1Team : replayData.p2Team;
  const coach2ReplayTeam = p1IsCoach1 ? replayData.p2Team : replayData.p1Team;

  return {
    coach1Unmatched: coach1ReplayTeam
      .filter((pokemon) =>
        !findMatchingRosterPokemon(coach1Roster, pokemon.name, aliasMaps)
      )
      .map((pokemon) => pokemon.name),
    coach2Unmatched: coach2ReplayTeam
      .filter((pokemon) =>
        !findMatchingRosterPokemon(coach2Roster, pokemon.name, aliasMaps)
      )
      .map((pokemon) => pokemon.name),
  };
}
