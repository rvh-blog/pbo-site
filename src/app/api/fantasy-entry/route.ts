import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  fantasyEntries,
  fantasyEntryPicks,
  matches,
  seasonCoaches,
  seasonPokemonPrices,
  seasons,
} from "@/lib/schema";
import { getSiteFeatureSettings } from "@/lib/site-settings";

const FANTASY_MIN_SEASON = 10;
const FANTASY_ROSTER_SIZE = 6;
const FANTASY_BUDGET = 90;
const FANTASY_LEADERBOARD_WEEKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
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

function fantasyPickKey(pick: { pokemonId: number; seasonCoachId: number | null }) {
  return `${pick.pokemonId}:${pick.seasonCoachId ?? 0}`;
}

function fantasyParticipantKey(entry: { coachId: number | null; userId: number | null; displayName: string }) {
  if (entry.coachId !== null) return `coach:${entry.coachId}`;
  if (entry.userId !== null) return `user:${entry.userId}`;
  return `name:${entry.displayName}`;
}

async function getPokemonScores(
  seasonId: number,
  seasonNumber: number,
  scoringWeek: number
): Promise<Map<string, number>> {
  if (seasonNumber === 10 && scoringWeek === 8) {
    return new Map<string, number>();
  }

  const seasonMatches = await db.query.matches.findMany({
    where: eq(matches.seasonId, seasonId),
  });
  const scoringMatches = seasonMatches.filter((match) => match.week === scoringWeek);
  const matchIds = new Set(scoringMatches.map((match) => match.id));
  const matchesById = new Map(scoringMatches.map((match) => [match.id, match]));

  if (matchIds.size === 0) {
    return new Map<string, number>();
  }

  const allMatchPokemon = await db.query.matchPokemon.findMany();
  const scoreMap = new Map<string, number>();

  for (const mp of allMatchPokemon) {
    if (!matchIds.has(mp.matchId)) continue;
    const match = matchesById.get(mp.matchId);
    if (!match || !match.winnerId) continue;
    const key = fantasyPickKey(mp);
    scoreMap.set(key, (scoreMap.get(key) ?? 0) + scorePokemonGame({ ...mp, match }));
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

async function getSeasonCoachDivisionMap(seasonId: number, seasonCoachIds: number[]) {
  const rows = await db.query.seasonCoaches.findMany({
    where: inArray(seasonCoaches.id, seasonCoachIds),
    with: {
      division: true,
    },
  });

  const divisionMap = new Map<number, string>();
  const seasonDivisions = new Set<string>();

  for (const row of rows) {
    if (!row.division || row.division.seasonId !== seasonId) continue;

    const divisionName = normalizeDivisionName(row.division.name);
    if (!divisionName) continue;

    divisionMap.set(row.id, divisionName);
    seasonDivisions.add(divisionName);
  }

  return { divisionMap, seasonDivisions };
}

function entryBelongsToSession(
  entry: { coachId: number | null; userId: number | null },
  session: Awaited<ReturnType<typeof getSession>>
) {
  if (!session) return false;
  return session.type === "coach"
    ? entry.coachId === session.id
    : entry.userId === session.id;
}

async function getSeasonFantasyEntries(seasonId: number) {
  return db.query.fantasyEntries.findMany({
    where: eq(fantasyEntries.seasonId, seasonId),
    with: {
      coach: true,
      user: true,
      picks: {
        with: {
          pokemon: true,
          seasonCoach: {
            with: {
              division: true,
            },
          },
        },
      },
    },
  });
}

type FantasyEntryWithPicks = Awaited<ReturnType<typeof getSeasonFantasyEntries>>[number];

function buildWeekLeaderboard(
  entries: FantasyEntryWithPicks[],
  scoreMap: Map<string, number>,
  week: number
) {
  return entries
    .filter((entry) => entry.week === week)
    .map((entry) => {
      const picks = entry.picks
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((pick) => ({
          pokemonId: pick.pokemonId,
          seasonCoachId: pick.seasonCoachId,
          name: pick.pokemon?.displayName || pick.pokemon?.name || "Unknown",
          spriteUrl: pick.pokemon?.spriteUrl || null,
          score: scoreMap.get(fantasyPickKey(pick)) ?? 0,
        }));

      return {
        id: entry.id,
        displayName: entry.displayName,
        coachId: entry.coachId,
        userId: entry.userId,
        week,
        totalScore: picks.reduce((sum, pick) => sum + pick.score, 0),
        picks,
        updatedAt: entry.updatedAt,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

async function buildOverallLeaderboard(
  entries: FantasyEntryWithPicks[],
  seasonId: number,
  seasonNumber: number
) {
  const scoreMapsByWeek = new Map<number, Map<string, number>>();
  await Promise.all(
    FANTASY_LEADERBOARD_WEEKS.map(async (week) => {
      scoreMapsByWeek.set(week, await getPokemonScores(seasonId, seasonNumber, week));
    })
  );

  const leaderboardByParticipant = new Map<
    string,
    {
      id: number;
      displayName: string;
      coachId: number | null;
      userId: number | null;
      week: null;
      totalScore: number;
      picks: {
        pokemonId: number;
        seasonCoachId: number | null;
        name: string;
        spriteUrl: string | null;
        score: number;
      }[];
      displayWeek: number;
      updatedAt: string;
    }
  >();

  const weeklyEntries = entries
    .filter((entry) => FANTASY_LEADERBOARD_WEEKS.includes(entry.week as typeof FANTASY_LEADERBOARD_WEEKS[number]))
    .sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      return a.updatedAt.localeCompare(b.updatedAt);
    });

  for (const entry of weeklyEntries) {
    const participantKey = fantasyParticipantKey(entry);
    const scoreMap = scoreMapsByWeek.get(entry.week) ?? new Map<string, number>();
    const entryPicks = entry.picks
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((pick) => ({
        pokemonId: pick.pokemonId,
        seasonCoachId: pick.seasonCoachId,
        name: pick.pokemon?.displayName || pick.pokemon?.name || "Unknown",
        spriteUrl: pick.pokemon?.spriteUrl || null,
        score: scoreMap.get(fantasyPickKey(pick)) ?? 0,
      }));
    const entryScore = entryPicks.reduce((sum, pick) => sum + pick.score, 0);
    const existing = leaderboardByParticipant.get(participantKey);

    if (existing) {
      existing.totalScore += entryScore;
      if (entry.week > existing.displayWeek || (entry.week === existing.displayWeek && entry.updatedAt > existing.updatedAt)) {
        existing.picks = entryPicks;
        existing.displayWeek = entry.week;
        existing.updatedAt = entry.updatedAt;
      }
    } else {
      leaderboardByParticipant.set(participantKey, {
        id: entry.id,
        displayName: entry.displayName,
        coachId: entry.coachId,
        userId: entry.userId,
        week: null,
        totalScore: entryScore,
        picks: entryPicks,
        displayWeek: entry.week,
        updatedAt: entry.updatedAt,
      });
    }
  }

  return [...leaderboardByParticipant.values()].sort((a, b) => b.totalScore - a.totalScore);
}

export async function GET(request: NextRequest) {
  try {
    const featureSettings = await getSiteFeatureSettings();
    if (featureSettings.fantasyUiHidden) {
      return NextResponse.json({ error: "Fantasy is currently unavailable" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const seasonId = Number(searchParams.get("seasonId"));
    const requestedWeek = Number(searchParams.get("week"));
    const leaderboardWeekParam = searchParams.get("leaderboardWeek");

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
    const requestedLeaderboardWeek = Number(leaderboardWeekParam);
    const leaderboardWeek: number | "overall" =
      leaderboardWeekParam === "overall"
        ? "overall"
        : Number.isInteger(requestedLeaderboardWeek) &&
            FANTASY_LEADERBOARD_WEEKS.includes(requestedLeaderboardWeek as typeof FANTASY_LEADERBOARD_WEEKS[number])
          ? requestedLeaderboardWeek
          : scoringWeek;

    const session = await getSession();

    const allEntries = await getSeasonFantasyEntries(seasonId);
    const entries = allEntries.filter((entry) => entry.week === scoringWeek);
    const leaderboard = leaderboardWeek === "overall"
      ? await buildOverallLeaderboard(allEntries, seasonId, season.seasonNumber)
      : buildWeekLeaderboard(
          allEntries,
          await getPokemonScores(seasonId, season.seasonNumber, leaderboardWeek),
          leaderboardWeek
        );

    const myEntry = session ? entries.find((entry) => entryBelongsToSession(entry, session)) : null;
    const usedInstances = session
      ? allEntries
          .filter((entry) => entry.week < scoringWeek && entryBelongsToSession(entry, session))
          .flatMap((entry) => entry.picks)
          .filter((pick) => pick.seasonCoachId !== null)
          .map((pick) => ({
            pokemonId: pick.pokemonId,
            seasonCoachId: pick.seasonCoachId!,
          }))
      : [];

    return NextResponse.json({
      user: session,
      myEntry: myEntry
        ? {
            id: myEntry.id,
            displayName: myEntry.displayName,
            picks: myEntry.picks
              .slice()
              .sort((a, b) => a.slot - b.slot)
              .filter((pick) => pick.seasonCoachId !== null)
              .map((pick) => ({
                pokemonId: pick.pokemonId,
                seasonCoachId: pick.seasonCoachId!,
              })),
            pokemonIds: myEntry.picks
              .slice()
              .sort((a, b) => a.slot - b.slot)
              .map((pick) => pick.pokemonId),
            seasonCoachIds: myEntry.picks
              .slice()
              .sort((a, b) => a.slot - b.slot)
              .map((pick) => pick.seasonCoachId),
            updatedAt: myEntry.updatedAt,
          }
        : null,
      usedInstances,
      leaderboard,
      settings: {
        rosterSize: FANTASY_ROSTER_SIZE,
        budget: FANTASY_BUDGET,
        scoringWeek,
        leaderboardWeek,
        leaderboardWeeks: FANTASY_LEADERBOARD_WEEKS,
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
    const featureSettings = await getSiteFeatureSettings();
    if (featureSettings.fantasyUiHidden) {
      return NextResponse.json({ error: "Fantasy is currently unavailable" }, { status: 404 });
    }

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "You must be signed in to play fantasy" }, { status: 401 });
    }

    const body = await request.json();
    const seasonId = Number(body.seasonId);
    const requestedWeek = Number(body.week);
    const picks: { pokemonId: number; seasonCoachId: number }[] = Array.isArray(body.picks)
      ? body.picks.map((pick: { pokemonId?: unknown; seasonCoachId?: unknown }) => ({
          pokemonId: Number(pick.pokemonId),
          seasonCoachId: Number(pick.seasonCoachId),
        }))
      : Array.isArray(body.pokemonIds)
        ? body.pokemonIds.map((id: unknown, index: number) => ({
            pokemonId: Number(id),
            seasonCoachId: Number(body.seasonCoachIds?.[index]),
          }))
        : [];
    const pokemonIds = picks.map((pick) => pick.pokemonId);
    const seasonCoachIds = picks.map((pick) => pick.seasonCoachId);

    if (!Number.isInteger(seasonId)) {
      return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    }

    const season = await getFantasySeason(seasonId);
    if (!season) {
      return NextResponse.json({ error: "Fantasy is only available for public seasons 10 and later" }, { status: 400 });
    }
    const entryWeek = Number.isInteger(requestedWeek) && requestedWeek > 0
      ? requestedWeek
      : season.seasonNumber === 10
        ? 8
        : 1;

    const uniquePokemonIds: number[] = [...new Set(pokemonIds)];
    const uniqueInstanceKeys = new Set(picks.map(fantasyPickKey));
    if (
      picks.length !== FANTASY_ROSTER_SIZE ||
      uniquePokemonIds.length !== FANTASY_ROSTER_SIZE ||
      uniqueInstanceKeys.size !== FANTASY_ROSTER_SIZE ||
      picks.some((pick) => !Number.isInteger(pick.pokemonId) || !Number.isInteger(pick.seasonCoachId))
    ) {
      return NextResponse.json(
        { error: `Choose exactly ${FANTASY_ROSTER_SIZE} different Pokemon from valid team instances` },
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

    const { divisionMap, seasonDivisions } = await getSeasonCoachDivisionMap(seasonId, seasonCoachIds);
    if (seasonCoachIds.some((id) => !divisionMap.has(id))) {
      return NextResponse.json(
        { error: "One or more selected Pokemon team instances are unavailable for this season" },
        { status: 400 }
      );
    }

    const invalidSlotIndex = picks.findIndex((pick, index) => {
      const requiredDivision = FANTASY_SLOT_RULES[index];
      if (!requiredDivision) return false;

      const normalizedRequiredDivision = normalizeDivisionName(requiredDivision);
      if (!seasonDivisions.has(normalizedRequiredDivision)) {
        return false;
      }

      return divisionMap.get(pick.seasonCoachId) !== normalizedRequiredDivision;
    });

    if (invalidSlotIndex !== -1) {
      return NextResponse.json(
        { error: `Slot ${invalidSlotIndex + 1} must use a Pokemon from the ${FANTASY_SLOT_RULES[invalidSlotIndex]} Division` },
        { status: 400 }
      );
    }

    const seasonEntries = await getSeasonFantasyEntries(seasonId);
    const blockedPriorPick = seasonEntries
      .filter((entry) => entry.week < entryWeek && entryBelongsToSession(entry, session))
      .flatMap((entry) => entry.picks)
      .find((pick) => picks.some((selectedPick) => (
        selectedPick.pokemonId === pick.pokemonId &&
        selectedPick.seasonCoachId === pick.seasonCoachId
      )));

    if (blockedPriorPick) {
      return NextResponse.json(
        { error: "That Pokemon from that team was already used in a prior fantasy week" },
        { status: 400 }
      );
    }

    const existing = await db.query.fantasyEntries.findFirst({
      where: and(
        eq(fantasyEntries.seasonId, seasonId),
        eq(fantasyEntries.week, entryWeek),
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
          week: entryWeek,
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
          week: entryWeek,
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
      picks.map((pick, index) => ({
        entryId,
        pokemonId: pick.pokemonId,
        seasonCoachId: pick.seasonCoachId,
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
        week: entryWeek,
        pokemonIds,
        picks,
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
