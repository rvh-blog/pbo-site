import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  divisions,
  pickEmParticipants,
  playoffBracketPicks,
  playoffMatches,
  seasons,
} from "@/lib/schema";
import { getSession, type SessionUser } from "@/lib/session";

type BracketPicks = Record<string, number>;

function parsePositiveId(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function bracketIsLocked(
  bracket: Array<{ round: number; winnerId: number | null; match: { scheduledAt: string | null } | null }>,
) {
  const now = Date.now();
  return bracket.some((slot) => (
    slot.round === 1 && (
      slot.winnerId !== null ||
      (slot.match?.scheduledAt && new Date(slot.match.scheduledAt).getTime() <= now)
    )
  ));
}

async function getParticipant(session: SessionUser, seasonId: number, create: boolean) {
  const identityCondition = session.type === "coach"
    ? eq(pickEmParticipants.coachId, session.id)
    : eq(pickEmParticipants.userId, session.id);
  let participant = await db.query.pickEmParticipants.findFirst({
    where: and(eq(pickEmParticipants.seasonId, seasonId), identityCondition),
  });

  if (!participant && session.type === "spectator") {
    participant = await db.query.pickEmParticipants.findFirst({
      where: and(
        eq(pickEmParticipants.seasonId, seasonId),
        eq(pickEmParticipants.name, session.name),
      ),
    });
    if (participant && !participant.userId && create) {
      [participant] = await db.update(pickEmParticipants)
        .set({ userId: session.id })
        .where(eq(pickEmParticipants.id, participant.id))
        .returning();
    }
  }

  if (!participant && create) {
    [participant] = await db.insert(pickEmParticipants).values({
      name: session.name,
      seasonId,
      coachId: session.type === "coach" ? session.id : null,
      userId: session.type === "spectator" ? session.id : null,
    }).returning();
  }

  return participant ?? null;
}

async function getBracket(seasonId: number, divisionId: number) {
  return db.query.playoffMatches.findMany({
    where: and(
      eq(playoffMatches.seasonId, seasonId),
      eq(playoffMatches.divisionId, divisionId),
    ),
    with: { match: true },
    orderBy: (slot, { asc }) => [asc(slot.round), asc(slot.bracketPosition)],
  });
}

function validateBracketPicks(
  bracket: Awaited<ReturnType<typeof getBracket>>,
  picks: BracketPicks,
) {
  const slots = new Map(bracket.map((slot) => [`${slot.round}-${slot.bracketPosition}`, slot]));
  const requiredKeys = ["1-1", "1-2", "1-3", "1-4", "2-1", "2-2", "3-1"];
  if (!requiredKeys.every((key) => slots.has(key) && parsePositiveId(picks[key]))) {
    return "Complete all seven bracket picks before saving.";
  }

  for (let position = 1; position <= 4; position += 1) {
    const slot = slots.get(`1-${position}`)!;
    const predicted = picks[`1-${position}`];
    if (!slot.higherSeedId || !slot.lowerSeedId) return "Quarterfinal matchups are not fully set yet.";
    if (predicted !== slot.higherSeedId && predicted !== slot.lowerSeedId) {
      return `Quarterfinal ${position} has an invalid winner.`;
    }
  }

  const semifinalOneOptions = [picks["1-1"], picks["1-2"]];
  const semifinalTwoOptions = [picks["1-3"], picks["1-4"]];
  if (!semifinalOneOptions.includes(picks["2-1"])) return "Semifinal 1 must use a predicted quarterfinal winner.";
  if (!semifinalTwoOptions.includes(picks["2-2"])) return "Semifinal 2 must use a predicted quarterfinal winner.";
  if (![picks["2-1"], picks["2-2"]].includes(picks["3-1"])) {
    return "The champion must be one of your predicted finalists.";
  }
  return null;
}

export async function GET(request: NextRequest) {
  const seasonId = parsePositiveId(request.nextUrl.searchParams.get("seasonId"));
  const divisionId = parsePositiveId(request.nextUrl.searchParams.get("divisionId"));
  if (!seasonId || !divisionId) {
    return NextResponse.json({ error: "seasonId and divisionId are required" }, { status: 400 });
  }

  const [session, season, division, bracket, entries] = await Promise.all([
    getSession(),
    db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) }),
    db.query.divisions.findFirst({ where: eq(divisions.id, divisionId) }),
    getBracket(seasonId, divisionId),
    db.query.playoffBracketPicks.findMany({
      where: and(
        eq(playoffBracketPicks.seasonId, seasonId),
        eq(playoffBracketPicks.divisionId, divisionId),
      ),
      with: { participant: true },
    }),
  ]);

  if (!season?.isPublic || !division || division.seasonId !== seasonId) {
    return NextResponse.json({ error: "Playoff bracket not found" }, { status: 404 });
  }

  const locked = bracketIsLocked(bracket);
  const participant = session ? await getParticipant(session, seasonId, false) : null;
  const mine = participant
    ? entries.find((entry) => entry.participantId === participant.id) ?? null
    : null;
  const completed = bracket.filter((slot) => slot.winnerId !== null);
  const leaderboard = locked
    ? entries.map((entry) => ({
        participantId: entry.participantId,
        name: entry.participant.name,
        correct: completed.filter((slot) => entry.picks[`${slot.round}-${slot.bracketPosition}`] === slot.winnerId).length,
        completed: completed.length,
        championCorrect: bracket.some((slot) => (
          slot.round === 3 && slot.winnerId !== null && entry.picks["3-1"] === slot.winnerId
        )),
      })).sort((a, b) => b.correct - a.correct || Number(b.championCorrect) - Number(a.championCorrect) || a.name.localeCompare(b.name))
    : [];

  return NextResponse.json({
    authenticated: !!session,
    locked,
    entryCount: entries.length,
    picks: mine?.picks ?? null,
    leaderboard,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to save a bracket." }, { status: 401 });

  const body = await request.json();
  const seasonId = parsePositiveId(body.seasonId);
  const divisionId = parsePositiveId(body.divisionId);
  const picks = body.picks && typeof body.picks === "object" && !Array.isArray(body.picks)
    ? body.picks as BracketPicks
    : null;
  if (!seasonId || !divisionId || !picks) {
    return NextResponse.json({ error: "seasonId, divisionId, and picks are required" }, { status: 400 });
  }

  const [season, division, bracket] = await Promise.all([
    db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) }),
    db.query.divisions.findFirst({ where: eq(divisions.id, divisionId) }),
    getBracket(seasonId, divisionId),
  ]);
  if (!season?.isPublic || !division || division.seasonId !== seasonId) {
    return NextResponse.json({ error: "Playoff bracket not found" }, { status: 404 });
  }
  if (bracketIsLocked(bracket)) {
    return NextResponse.json({ error: "This bracket is locked because the quarterfinals have started." }, { status: 409 });
  }
  const validationError = validateBracketPicks(bracket, picks);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const participant = await getParticipant(session, seasonId, true);
  if (!participant) return NextResponse.json({ error: "Could not create pick-em participant." }, { status: 500 });
  const now = new Date().toISOString();
  await db.insert(playoffBracketPicks).values({
    participantId: participant.id,
    seasonId,
    divisionId,
    picks,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [playoffBracketPicks.participantId, playoffBracketPicks.divisionId],
    set: { picks, updatedAt: now },
  });

  return NextResponse.json({ success: true, picks });
}
