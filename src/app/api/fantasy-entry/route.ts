import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  fantasyEntries,
  fantasyEntryPicks,
  matches,
  rosters,
  seasonPokemonPrices,
  seasons,
} from "@/lib/schema";

const FANTASY_MIN_SEASON = 10;
const FANTASY_ROSTER_SIZE = 6;
const FANTASY_BUDGET = 90;
const FANTASY_SLOT_RULES = ["Infinity", "Stargazer", "Sunset", "Crystal", "Neon", null] as const;

function normalizeDivisionName(name: string | null | undefined) {
  return name?.trim().toLowerCase() || "";
}

function scorePokemonGame(mp: {
  kills: number | null;
  deaths: number | null;
  seasonCoachId: number;
  match: {
    winnerId: number | null;
  };
}) {
  const kills = mp.kills ?? 0;
  const deaths = mp.deaths ?? 0;
  const teamResult = mp.match.winnerId === mp.seasonCoachId ? 2 : -2;

  return kills * 5 - deaths + teamResult;
}

async function getFantasySeason(seasonId: number) {
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, seasonId),
  });

  if (!season || season.isPublic === false || season.seasonNumber < FANTASY_MIN_SEASON) {
    return null;
  }

  return season;
}

async function getPokemonScores(seasonId: number, seasonNumber: number, scoringWeek: number) {
  if (seasonNumber === 10 && scoringWeek === 8) {
    return new Map<number, number>();
  }

  const seasonMatches = await db.query.matches.findMany({
    where: eq(matches.seasonId, seasonId),
  });
  const scoringMatches = seasonMatches.filter((match) => match.week === scoringWeek);
  const matchIds = new Set(scoringMatches.map((match) => match.id));
  const matchesById = new Map(scoringMatches.map((match) => [match.id, match]));

  if (matchIds.size === 0) {
    return new Map<number, number>();
  }

  const allMatchPokemon = await db.query.matchPokemon.findMany();
  const scoreMap = new Map<number, number>();

  for (const mp of allMatchPokemon) {
    if (!matchIds.has(mp.matchId)) continue;
    const match = matchesById.get(mp.matchId);
    if (!match || !match.winnerId) continue;
    scoreMap.set(mp.pokemonId, (scoreMap.get(mp.pokemonId) ?? 0) + scorePokemonGame({ ...mp, match }));
  }

  return scoreMap;
}

async function getPriceMap(seasonId: number) {
  const prices = await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
  });

  return new Map(
    prices
      .filter((row) => row.price >= 0)
      .map((row) => [row.pokemonId, row.price])
  );
}

async function getPokemonDivisionMap(seasonId: number, pokemonIds: number[]) {
  const rosterRows = await db.query.rosters.findMany({
    where: inArray(rosters.pokemonId, pokemonIds),
    with: {
      seasonCoach: {
        with: {
          division: true,
        },
      },
    },
  });

  const divisionMap = new Map<number, Set<string>>();
  const seasonDivisions = new Set<string>();

  for (const row of rosterRows) {
    const division = row.seasonCoach?.division;
    if (!division || division.seasonId !== seasonId) continue;

    const divisionName = normalizeDivisionName(division.name);
    if (!divisionName) continue;

    seasonDivisions.add(divisionName);

    if (!divisionMap.has(row.pokemonId)) {
      divisionMap.set(row.pokemonId, new Set());
    }
    divisionMap.get(row.pokemonId)!.add(divisionName);
  }

  return { divisionMap, seasonDivisions };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = Number(searchParams.get("seasonId"));
    const requestedWeek = Number(searchParams.get("week"));

    if (!Number.isInteger(seasonId)) {
      return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    }

    const season = await getFantasySeason(seasonId);
    if (!season) {
      return NextResponse.json({ error: "Fantasy is only available for public seasons 10 and later" }, { status: 400 });
    }
    const scoringWeek = Number.isInteger(requestedWeek) && requestedWeek > 0
      ? requestedWeek
      : season.seasonNumber === 10
        ? 8
        : 1;

    const session = await getSession();

    const [entries, scoreMap] = await Promise.all([
      db.query.fantasyEntries.findMany({
        where: eq(fantasyEntries.seasonId, seasonId),
        with: {
          coach: true,
          user: true,
          picks: {
            with: {
              pokemon: true,
            },
          },
        },
      }),
      getPokemonScores(seasonId, season.seasonNumber, scoringWeek),
    ]);

    const leaderboard = entries
      .map((entry) => {
        const picks = entry.picks
          .slice()
          .sort((a, b) => a.slot - b.slot)
          .map((pick) => ({
            pokemonId: pick.pokemonId,
            name: pick.pokemon?.displayName || pick.pokemon?.name || "Unknown",
            spriteUrl: pick.pokemon?.spriteUrl || null,
            score: scoreMap.get(pick.pokemonId) ?? 0,
          }));

        return {
          id: entry.id,
          displayName: entry.displayName,
          coachId: entry.coachId,
          userId: entry.userId,
          totalScore: picks.reduce((sum, pick) => sum + pick.score, 0),
          picks,
          updatedAt: entry.updatedAt,
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);

    const myEntry = session
      ? entries.find((entry) =>
          session.type === "coach"
            ? entry.coachId === session.id
            : entry.userId === session.id
        )
      : null;

    return NextResponse.json({
      user: session,
      myEntry: myEntry
        ? {
            id: myEntry.id,
            displayName: myEntry.displayName,
            pokemonIds: myEntry.picks
              .slice()
              .sort((a, b) => a.slot - b.slot)
              .map((pick) => pick.pokemonId),
            updatedAt: myEntry.updatedAt,
          }
        : null,
      leaderboard,
      settings: {
        rosterSize: FANTASY_ROSTER_SIZE,
        budget: FANTASY_BUDGET,
        scoringWeek,
      },
    });
  } catch (error) {
    console.error("Fantasy entry GET error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "You must be signed in to play fantasy" }, { status: 401 });
    }

    const body = await request.json();
    const seasonId = Number(body.seasonId);
    const pokemonIds: number[] = Array.isArray(body.pokemonIds)
      ? body.pokemonIds.map((id: unknown) => Number(id))
      : [];

    if (!Number.isInteger(seasonId)) {
      return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    }

    const season = await getFantasySeason(seasonId);
    if (!season) {
      return NextResponse.json({ error: "Fantasy is only available for public seasons 10 and later" }, { status: 400 });
    }

    const uniquePokemonIds: number[] = [...new Set(pokemonIds)];
    if (
      uniquePokemonIds.length !== FANTASY_ROSTER_SIZE ||
      uniquePokemonIds.some((id) => !Number.isInteger(id))
    ) {
      return NextResponse.json(
        { error: `Choose exactly ${FANTASY_ROSTER_SIZE} different Pokemon` },
        { status: 400 }
      );
    }

    const priceMap = await getPriceMap(seasonId);
    const invalidPokemonIds = uniquePokemonIds.filter((id) => !priceMap.has(id));
    if (invalidPokemonIds.length > 0) {
      return NextResponse.json(
        { error: "One or more selected Pokemon are unavailable for this season" },
        { status: 400 }
      );
    }

    const totalCost = uniquePokemonIds.reduce((sum, id) => sum + (priceMap.get(id) ?? 0), 0);
    if (totalCost > FANTASY_BUDGET) {
      return NextResponse.json(
        { error: `Roster is over the ${FANTASY_BUDGET}-point budget` },
        { status: 400 }
      );
    }

    const { divisionMap, seasonDivisions } = await getPokemonDivisionMap(seasonId, uniquePokemonIds);
    const invalidSlotIndex = uniquePokemonIds.findIndex((pokemonId, index) => {
      const requiredDivision = FANTASY_SLOT_RULES[index];
      if (!requiredDivision) return false;

      const normalizedRequiredDivision = normalizeDivisionName(requiredDivision);
      if (!seasonDivisions.has(normalizedRequiredDivision)) {
        return false;
      }

      return !divisionMap.get(pokemonId)?.has(normalizedRequiredDivision);
    });

    if (invalidSlotIndex !== -1) {
      return NextResponse.json(
        { error: `Slot ${invalidSlotIndex + 1} must use a Pokemon from the ${FANTASY_SLOT_RULES[invalidSlotIndex]} Division` },
        { status: 400 }
      );
    }

    const existing = await db.query.fantasyEntries.findFirst({
      where: and(
        eq(fantasyEntries.seasonId, seasonId),
        session.type === "coach"
          ? eq(fantasyEntries.coachId, session.id)
          : eq(fantasyEntries.userId, session.id)
      ),
    });

    const now = new Date().toISOString();
    let entryId: number | undefined = existing?.id;

    if (existing) {
      await db
        .update(fantasyEntries)
        .set({
          displayName: session.name,
          updatedAt: now,
        })
        .where(eq(fantasyEntries.id, existing.id));

      await db
        .delete(fantasyEntryPicks)
        .where(eq(fantasyEntryPicks.entryId, existing.id));
    } else {
      const inserted = await db
        .insert(fantasyEntries)
        .values({
          seasonId,
          coachId: session.type === "coach" ? session.id : null,
          userId: session.type === "spectator" ? session.id : null,
          displayName: session.name,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      entryId = inserted[0].id;
    }

    if (!entryId) {
      return NextResponse.json({ error: "Failed to save fantasy roster" }, { status: 500 });
    }

    await db.insert(fantasyEntryPicks).values(
      uniquePokemonIds.map((pokemonId, index) => ({
        entryId,
        pokemonId,
        slot: index + 1,
        createdAt: now,
      }))
    );

    const savedPicks = await db.query.fantasyEntryPicks.findMany({
      where: eq(fantasyEntryPicks.entryId, entryId),
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: entryId,
        displayName: session.name,
        pokemonIds: uniquePokemonIds,
        totalCost,
        picksSaved: savedPicks.filter((pick) => pick.entryId === entryId).length,
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error("Fantasy entry POST error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
