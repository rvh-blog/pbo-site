import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, rosters, seasonCoaches, pokemon, seasonPokemonPrices } from "@/lib/schema";
import { eq, and, or, desc } from "drizzle-orm";
import {
  getTransactionCounts,
  getAvailableFreeAgents,
  isTradeLocked,
  executeFAPickup,
  executeFADrop,
  executeFASwap,
  executeP2PTrade,
  executeTeraSwap,
  executeBulkFATransaction,
  undoTransaction,
} from "@/lib/transaction-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get("seasonId");
  const seasonCoachId = searchParams.get("seasonCoachId");
  const type = searchParams.get("type");
  const action = searchParams.get("action");

  // Get transaction counts for a coach
  if (action === "counts" && seasonCoachId) {
    const counts = await getTransactionCounts(parseInt(seasonCoachId));
    return NextResponse.json(counts);
  }

  // Get available free agents (division-specific)
  if (action === "freeAgents" && seasonId) {
    const divisionId = searchParams.get("divisionId");
    const freeAgents = await getAvailableFreeAgents(
      parseInt(seasonId),
      divisionId ? parseInt(divisionId) : undefined
    );
    return NextResponse.json(freeAgents);
  }

  // Get season Pokemon prices (for TC cost lookups)
  if (action === "seasonPrices" && seasonId) {
    const prices = await db.query.seasonPokemonPrices.findMany({
      where: eq(seasonPokemonPrices.seasonId, parseInt(seasonId)),
    });
    return NextResponse.json(prices);
  }

  // Check trade lock status
  if (action === "tradeLock" && searchParams.get("rosterId") && searchParams.get("week")) {
    const rosterId = parseInt(searchParams.get("rosterId")!);
    const week = parseInt(searchParams.get("week")!);
    const lockStatus = await isTradeLocked(rosterId, week);
    return NextResponse.json(lockStatus);
  }

  // Get transactions with filters
  let query: Parameters<typeof db.query.transactions.findMany>[0] = {
    with: {
      seasonCoach: {
        with: {
          coach: true,
        },
      },
      tradingPartner: {
        with: {
          coach: true,
        },
      },
    },
    orderBy: [desc(transactions.createdAt)],
  };

  // Build where conditions
  const conditions = [];
  if (seasonId) {
    conditions.push(eq(transactions.seasonId, parseInt(seasonId)));
  }
  if (seasonCoachId) {
    // Get transactions where coach is either primary or trading partner
    conditions.push(
      or(
        eq(transactions.seasonCoachId, parseInt(seasonCoachId)),
        eq(transactions.tradingPartnerSeasonCoachId, parseInt(seasonCoachId))
      )!
    );
  }
  if (type) {
    conditions.push(eq(transactions.type, type));
  }

  if (conditions.length > 0) {
    query.where = and(...conditions);
  }

  const txs = await db.query.transactions.findMany(query);

  // Enhance with Pokemon details
  const enhancedTxs = await Promise.all(
    txs.map(async (tx) => {
      // Get Pokemon details for pokemonIn (check array has items, not just exists)
      const pokemonInIds = (tx.pokemonIn as number[]) || [];
      const pokemonInDetails = pokemonInIds.length > 0
        ? await db.query.pokemon.findMany({
            where: or(
              ...pokemonInIds.map((id) => eq(pokemon.id, id))
            ),
          })
        : [];

      // Get Pokemon details for pokemonOut (check array has items, not just exists)
      const pokemonOutIds = (tx.pokemonOut as number[]) || [];
      const pokemonOutDetails = pokemonOutIds.length > 0
        ? await db.query.pokemon.findMany({
            where: or(
              ...pokemonOutIds.map((id) => eq(pokemon.id, id))
            ),
          })
        : [];

      // Get new/old tera captain details
      const newTC = tx.newTeraCaptainId
        ? await db.query.pokemon.findFirst({
            where: eq(pokemon.id, tx.newTeraCaptainId),
          })
        : null;

      const oldTC = tx.oldTeraCaptainId
        ? await db.query.pokemon.findFirst({
            where: eq(pokemon.id, tx.oldTeraCaptainId),
          })
        : null;

      return {
        ...tx,
        pokemonInDetails,
        pokemonOutDetails,
        newTeraCaptainDetails: newTC,
        oldTeraCaptainDetails: oldTC,
      };
    })
  );

  return NextResponse.json(enhancedTxs);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case "faPickup": {
        const {
          seasonId,
          seasonCoachId,
          pokemonId,
          isTeraCaptain,
          week,
          countsAgainstLimit = true,
          notes,
        } = data;

        if (!seasonId || !seasonCoachId || !pokemonId || week === undefined) {
          return NextResponse.json(
            { error: "Missing required fields" },
            { status: 400 }
          );
        }

        const tx = await executeFAPickup({
          seasonId,
          seasonCoachId,
          pokemonId,
          isTeraCaptain: isTeraCaptain || false,
          week,
          countsAgainstLimit,
          notes,
        });

        return NextResponse.json(tx);
      }

      case "faDrop": {
        const {
          seasonId,
          seasonCoachId,
          rosterId,
          week,
          countsAgainstLimit = true,
          notes,
        } = data;

        if (!seasonId || !seasonCoachId || !rosterId || week === undefined) {
          return NextResponse.json(
            { error: "Missing required fields" },
            { status: 400 }
          );
        }

        const tx = await executeFADrop({
          seasonId,
          seasonCoachId,
          rosterId,
          week,
          countsAgainstLimit,
          notes,
        });

        return NextResponse.json(tx);
      }

      case "faSwap": {
        const {
          seasonId,
          seasonCoachId,
          pickupPokemonId,
          pickupIsTeraCaptain,
          dropRosterId,
          week,
          countsAgainstLimit = true,
          notes,
        } = data;

        if (!seasonId || !seasonCoachId || week === undefined) {
          return NextResponse.json(
            { error: "Missing required fields" },
            { status: 400 }
          );
        }

        if (!pickupPokemonId && !dropRosterId) {
          return NextResponse.json(
            { error: "Must specify at least one Pokemon to pick up or drop" },
            { status: 400 }
          );
        }

        const tx = await executeFASwap({
          seasonId,
          seasonCoachId,
          pickupPokemonId,
          pickupIsTeraCaptain: pickupIsTeraCaptain || false,
          dropRosterId,
          week,
          countsAgainstLimit,
          notes,
        });

        return NextResponse.json(tx);
      }

      case "p2pTrade": {
        const {
          seasonId,
          team1SeasonCoachId,
          team1RosterIds,
          team2SeasonCoachId,
          team2RosterIds,
          team1IncomingTC,
          team2IncomingTC,
          week,
          countsAgainstLimit = true,
          notes,
        } = data;

        if (
          !seasonId ||
          !team1SeasonCoachId ||
          !team2SeasonCoachId ||
          !team1RosterIds?.length ||
          !team2RosterIds?.length ||
          week === undefined
        ) {
          return NextResponse.json(
            { error: "Missing required fields" },
            { status: 400 }
          );
        }

        const tx = await executeP2PTrade({
          seasonId,
          team1SeasonCoachId,
          team1RosterIds,
          team2SeasonCoachId,
          team2RosterIds,
          team1IncomingTC: team1IncomingTC || {},
          team2IncomingTC: team2IncomingTC || {},
          week,
          countsAgainstLimit,
          notes,
        });

        return NextResponse.json(tx);
      }

      case "teraSwap": {
        const {
          seasonId,
          seasonCoachId,
          newTeraCaptainRosterId,
          oldTeraCaptainRosterId,
          week,
          countsAgainstLimit = true,
          notes,
        } = data;

        if (
          !seasonId ||
          !seasonCoachId ||
          week === undefined ||
          (!newTeraCaptainRosterId && !oldTeraCaptainRosterId)
        ) {
          return NextResponse.json(
            { error: "Missing required fields. Must specify at least one Pokemon to add or remove as TC." },
            { status: 400 }
          );
        }

        const tx = await executeTeraSwap({
          seasonId,
          seasonCoachId,
          newTeraCaptainRosterId,
          oldTeraCaptainRosterId,
          week,
          countsAgainstLimit,
          notes,
        });

        return NextResponse.json(tx);
      }

      case "bulkFATransaction": {
        const {
          seasonId,
          divisionId,
          seasonCoachId,
          week,
          countsAgainstLimit = true,
          swaps,
          drops,
          pickups,
          tcSwaps,
          tcChanges,
          notes,
        } = data;

        if (!seasonId || !divisionId || !seasonCoachId || week === undefined) {
          return NextResponse.json(
            { error: "Missing required fields" },
            { status: 400 }
          );
        }

        // Ensure at least one change
        if (
          (!swaps || swaps.length === 0) &&
          (!drops || drops.length === 0) &&
          (!pickups || pickups.length === 0) &&
          (!tcSwaps || tcSwaps.length === 0) &&
          (!tcChanges || tcChanges.length === 0)
        ) {
          return NextResponse.json(
            { error: "Must specify at least one swap, drop, pickup, or TC change" },
            { status: 400 }
          );
        }

        const tx = await executeBulkFATransaction({
          seasonId,
          divisionId,
          seasonCoachId,
          week,
          countsAgainstLimit,
          swaps: swaps || [],
          drops: drops || [],
          pickups: pickups || [],
          tcSwaps: tcSwaps || [],
          tcChanges: tcChanges || [],
          notes,
        });

        return NextResponse.json(tx);
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Transaction error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transaction failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Transaction ID required" }, { status: 400 });
  }

  try {
    await undoTransaction(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Undo transaction error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to undo transaction" },
      { status: 500 }
    );
  }
}
