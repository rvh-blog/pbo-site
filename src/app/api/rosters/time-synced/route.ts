import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rosters, transactions, seasonCoaches } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getTimeSyncedRoster } from "@/lib/roster-utils";

// GET /api/rosters/time-synced?seasonCoachId=X&week=Y
// Returns the roster as it was at a specific match week, including dropped Pokemon
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const seasonCoachId = parseInt(searchParams.get("seasonCoachId") || "");
  const week = parseInt(searchParams.get("week") || "");

  if (!seasonCoachId || !week) {
    return NextResponse.json(
      { error: "seasonCoachId and week are required" },
      { status: 400 }
    );
  }

  // Fetch current rosters with pokemon relation
  const currentRosters = await db.query.rosters.findMany({
    where: eq(rosters.seasonCoachId, seasonCoachId),
    with: { pokemon: true },
  });

  // Fetch seasonCoach with division to get seasonId
  const sc = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, seasonCoachId),
    with: { division: true },
  });

  if (!sc) {
    return NextResponse.json({ roster: [], dropped: [] });
  }

  // Fetch transactions for this coach (as primary or trading partner)
  const [primaryTxs, partnerTxs] = await Promise.all([
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
  ]);
  const coachTxs = [...primaryTxs, ...partnerTxs];

  const { filteredRosters, droppedPokemonDetails } = await getTimeSyncedRoster(
    seasonCoachId,
    week,
    currentRosters as any,
    coachTxs as any
  );

  // Format for client: same shape as roster entries the admin page expects
  const rosterEntries = filteredRosters.map((r) => ({
    id: r.id,
    pokemonId: r.pokemonId,
    pokemon: r.pokemon
      ? {
          id: r.pokemon.id,
          name: r.pokemon.name,
          displayName: r.pokemon.displayName,
          spriteUrl: r.pokemon.spriteUrl,
        }
      : null,
  }));

  const droppedEntries = droppedPokemonDetails.map((p) => ({
    id: 0, // synthetic roster entry
    pokemonId: p.id,
    pokemon: {
      id: p.id,
      name: p.name,
      displayName: p.displayName,
      spriteUrl: p.spriteUrl,
    },
  }));

  return NextResponse.json({
    roster: rosterEntries,
    dropped: droppedEntries,
  });
}
