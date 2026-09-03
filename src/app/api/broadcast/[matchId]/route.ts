import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matches, transactions } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getDivisionColor } from "@/lib/division-colors";
import { getTimeSyncedRoster } from "@/lib/roster-utils";
import { isCompletedMatchResult } from "@/lib/match-result-utils";
import {
  customPokemonAliasesForRow,
  getPokemonAliasMaps,
  pokemonLookupKeysForRowWithAliases,
  serializePokemonAliasMaps,
} from "@/lib/pokemon-name-aliases";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const id = parseInt(matchId);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid match ID" }, { status: 400 });
  }

  const match = await db.query.matches.findFirst({
    where: eq(matches.id, id),
    with: {
      season: true,
      division: true,
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
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const coach1 = match.coach1;
  const coach2 = match.coach2;

  // Get time-synced rosters (filtered by match week)
  const [coach1Txs, coach2Txs] = await Promise.all([
    Promise.all([
      db.query.transactions.findMany({
        where: eq(transactions.seasonCoachId, match.coach1SeasonId),
      }),
      db.query.transactions.findMany({
        where: and(
          eq(transactions.type, "P2P_TRADE"),
          eq(transactions.tradingPartnerSeasonCoachId, match.coach1SeasonId),
        ),
      }),
    ]),
    Promise.all([
      db.query.transactions.findMany({
        where: eq(transactions.seasonCoachId, match.coach2SeasonId),
      }),
      db.query.transactions.findMany({
        where: and(
          eq(transactions.type, "P2P_TRADE"),
          eq(transactions.tradingPartnerSeasonCoachId, match.coach2SeasonId),
        ),
      }),
    ]),
  ]);

  const [roster1Result, roster2Result, aliasMaps] = await Promise.all([
    getTimeSyncedRoster(
      match.coach1SeasonId,
      match.week,
      coach1?.rosters || [],
      [...coach1Txs[0], ...coach1Txs[1]] as any
    ),
    getTimeSyncedRoster(
      match.coach2SeasonId,
      match.week,
      coach2?.rosters || [],
      [...coach2Txs[0], ...coach2Txs[1]] as any
    ),
    getPokemonAliasMaps(),
  ]);

  // Compute W-L record for each coach within their division
  const divisionMatches = await db.query.matches.findMany({
    where: eq(matches.divisionId, match.divisionId),
  });

  function getRecord(seasonCoachId: number) {
    let wins = 0;
    let losses = 0;
    for (const m of divisionMatches) {
      if (!isCompletedMatchResult(m.winnerId, m.isForfeit)) continue;
      if (m.coach1SeasonId === seasonCoachId || m.coach2SeasonId === seasonCoachId) {
        if (m.winnerId === seasonCoachId) wins++;
        else losses++;
      }
    }
    return { wins, losses };
  }

  const coach1Record = getRecord(match.coach1SeasonId);
  const coach2Record = getRecord(match.coach2SeasonId);

  const divisionColor = getDivisionColor(match.division?.name || "");

  // Build roster arrays with the data overlay needs
  function buildRoster(result: typeof roster1Result) {
    const allRosters = [
      ...result.filteredRosters.map((r) => ({
        pokemonId: r.pokemonId,
        name: r.pokemon?.name || "",
        displayName: r.pokemon?.displayName || r.pokemon?.name || "",
        spriteUrl: r.pokemon?.spriteUrl || null,
        types: r.pokemon?.types || [],
        isTeraCaptain: r.isTeraCaptain ?? false,
        nameAliases: customPokemonAliasesForRow({ id: r.pokemonId }, aliasMaps),
        lookupKeys: Array.from(pokemonLookupKeysForRowWithAliases({
          id: r.pokemonId,
          name: r.pokemon?.name || "",
          displayName: r.pokemon?.displayName || r.pokemon?.name || "",
        }, aliasMaps)),
      })),
      ...result.droppedPokemonDetails.map((p) => ({
        pokemonId: p.id,
        name: p.name,
        displayName: p.displayName || p.name,
        spriteUrl: p.spriteUrl || null,
        types: p.types || [],
        isTeraCaptain: (p as any).isTeraCaptain ?? false,
        nameAliases: customPokemonAliasesForRow(p, aliasMaps),
        lookupKeys: Array.from(pokemonLookupKeysForRowWithAliases({
          id: p.id,
          name: p.name,
          displayName: p.displayName || p.name,
        }, aliasMaps)),
      })),
    ];
    return allRosters;
  }

  return NextResponse.json({
    matchId: match.id,
    week: match.week,
    seasonName: match.season?.name || "",
    divisionName: match.division?.name || "",
    divisionColor,
    pokemonNameAliases: serializePokemonAliasMaps(aliasMaps),
    team1: {
      seasonCoachId: match.coach1SeasonId,
      teamName: coach1?.teamName || "",
      teamAbbreviation: coach1?.teamAbbreviation || "",
      teamLogoUrl: coach1?.teamLogoUrl || null,
      coachName: coach1?.coach?.name || "",
      eloRating: Math.round(coach1?.coach?.eloRating || 1000),
      record: coach1Record,
      roster: buildRoster(roster1Result),
    },
    team2: {
      seasonCoachId: match.coach2SeasonId,
      teamName: coach2?.teamName || "",
      teamAbbreviation: coach2?.teamAbbreviation || "",
      teamLogoUrl: coach2?.teamLogoUrl || null,
      coachName: coach2?.coach?.name || "",
      eloRating: Math.round(coach2?.coach?.eloRating || 1000),
      record: coach2Record,
      roster: buildRoster(roster2Result),
    },
  });
}
