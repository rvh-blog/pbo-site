import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { matchPokemon } from "@/lib/schema";

function optionalPositiveInteger(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const getCachedMoveSourceRows = unstable_cache(
  (pokemonId: number) => db.query.matchPokemon.findMany({
    columns: {
      pokemonId: true,
      movesUsed: true,
    },
    with: {
      seasonCoach: {
        columns: { id: true, teamName: true },
        with: {
          coach: {
            columns: { id: true, name: true },
          },
        },
      },
      match: {
        columns: {
          id: true,
          divisionId: true,
          week: true,
          winnerId: true,
          coach1SeasonId: true,
          coach2SeasonId: true,
          isForfeit: true,
          replayUrl: true,
        },
        with: {
          season: { columns: { seasonNumber: true } },
          division: { columns: { name: true } },
          coach1: { columns: { id: true, teamName: true } },
          coach2: { columns: { id: true, teamName: true } },
        },
      },
    },
    where: and(
      eq(matchPokemon.pokemonId, pokemonId),
      isNotNull(matchPokemon.movesUsed),
    ),
  }),
  ["battle-record-move-source-rows-v1"],
  { revalidate: 60, tags: ["battle-record-public-data"] },
);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pokemonId = optionalPositiveInteger(params.get("pokemonId"));
  const seasonNumber = optionalPositiveInteger(params.get("season"));
  const divisionId = optionalPositiveInteger(params.get("division"));

  if (pokemonId === null || pokemonId === undefined) {
    return NextResponse.json({ error: "A valid pokemonId is required" }, { status: 400 });
  }
  if (seasonNumber === undefined || divisionId === undefined) {
    return NextResponse.json({ error: "Season and division filters must be positive integers" }, { status: 400 });
  }

  const rows = await getCachedMoveSourceRows(pokemonId);

  const sources = rows.flatMap((row) => {
    const match = row.match;
    if (
      !row.movesUsed
      || !match?.season
      || !match.division
      || match.season.seasonNumber < 9
      || match.winnerId === null
      || match.isForfeit
      || (match.winnerId !== match.coach1SeasonId && match.winnerId !== match.coach2SeasonId)
      || (seasonNumber !== null && match.season.seasonNumber !== seasonNumber)
      || (divisionId !== null && match.divisionId !== divisionId)
    ) {
      return [];
    }

    const moves = Object.entries(row.movesUsed)
      .map(([rawName, rawUses]) => ({
        name: rawName.trim().replace(/\s+/g, " "),
        uses: Number(rawUses),
      }))
      .filter((move) => move.name && Number.isFinite(move.uses) && move.uses > 0)
      .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

    const holderTeam = row.seasonCoach;
    const opponentTeam = match.coach1?.id === holderTeam?.id ? match.coach2 : match.coach1;
    return [{
      matchId: match.id,
      seasonNumber: match.season.seasonNumber,
      divisionName: match.division.name,
      week: match.week,
      replayUrl: match.replayUrl,
      teamName: holderTeam?.teamName || "Unknown team",
      opponentTeamName: opponentTeam?.teamName || "Unknown opponent",
      coach: holderTeam?.coach ? { id: holderTeam.coach.id, name: holderTeam.coach.name } : null,
      moves,
    }];
  }).sort(
    (a, b) => b.seasonNumber - a.seasonNumber || b.week - a.week || b.matchId - a.matchId
  );

  return NextResponse.json(
    { sources },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
