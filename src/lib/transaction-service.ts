import { db } from "./db";
import {
  transactions,
  rosters,
  seasonCoaches,
  seasonPokemonPrices,
  pokemon,
} from "./schema";
import { eq, and, inArray, isNull, notInArray } from "drizzle-orm";

// Transaction types
export type TransactionType = "FA_PICKUP" | "FA_DROP" | "FA_SWAP" | "P2P_TRADE" | "TERA_SWAP";

// Get transaction counts for a season coach
export async function getTransactionCounts(seasonCoachId: number) {
  const txs = await db.query.transactions.findMany({
    where: and(
      eq(transactions.seasonCoachId, seasonCoachId),
      eq(transactions.countsAgainstLimit, true)
    ),
  });

  // Also count trades where this coach was the trading partner
  const partnerTxs = await db.query.transactions.findMany({
    where: and(
      eq(transactions.tradingPartnerSeasonCoachId, seasonCoachId),
      eq(transactions.countsAgainstLimit, true),
      eq(transactions.type, "P2P_TRADE")
    ),
  });

  let faUsed = 0;
  let p2pUsed = 0;

  for (const tx of txs) {
    if (tx.type === "FA_PICKUP" || tx.type === "FA_DROP" || tx.type === "FA_SWAP" || tx.type === "TERA_SWAP") {
      faUsed++;
    } else if (tx.type === "P2P_TRADE") {
      p2pUsed++;
    }
  }

  // Partner trades count against P2P limit
  p2pUsed += partnerTxs.length;

  return {
    faUsed,
    faRemaining: Math.max(0, 6 - faUsed),
    p2pUsed,
    p2pRemaining: Math.max(0, 6 - p2pUsed),
  };
}

// Check if Pokemon is trade locked (2-week lock after acquisition)
export async function isTradeLocked(
  rosterId: number,
  currentWeek: number
): Promise<{
  locked: boolean;
  unlocksWeek?: number;
  acquiredWeek?: number;
  acquiredVia?: string;
}> {
  const roster = await db.query.rosters.findFirst({
    where: eq(rosters.id, rosterId),
  });

  if (!roster || !roster.acquiredWeek || !roster.acquiredVia) {
    // Draft picks are never locked
    return { locked: false };
  }

  // Only FA_PICKUP and P2P_TRADE acquisitions are locked
  if (roster.acquiredVia === "DRAFT") {
    return { locked: false };
  }

  const lockDuration = 2;
  const unlocksWeek = roster.acquiredWeek + lockDuration;
  const locked = currentWeek < unlocksWeek;

  return {
    locked,
    unlocksWeek,
    acquiredWeek: roster.acquiredWeek,
    acquiredVia: roster.acquiredVia,
  };
}

// Get Pokemon not on any roster for a season (Free Agents)
export async function getAvailableFreeAgents(seasonId: number) {
  // Get all Pokemon that have prices for this season
  const seasonPrices = await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
    with: {
      pokemon: true,
    },
  });

  // Get all divisions for this season
  const seasonDivisions = await db.query.divisions.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
  });

  // Get all active season coaches for this season's divisions
  const divisionIds = seasonDivisions.map(d => d.id);

  if (divisionIds.length === 0) {
    // Return all priced Pokemon if no divisions yet
    return seasonPrices
      .filter(sp => sp.price >= 0) // Exclude banned Pokemon (price = -1)
      .map(sp => ({
        ...sp.pokemon,
        price: sp.price,
        teraCaptainCost: sp.teraCaptainCost,
        teraBanned: sp.teraBanned,
      }));
  }

  const activeCoaches = await db.query.seasonCoaches.findMany({
    where: and(
      inArray(seasonCoaches.divisionId, divisionIds),
      eq(seasonCoaches.isActive, true)
    ),
    with: {
      rosters: true,
    },
  });

  // Get all Pokemon IDs currently on rosters
  const ownedPokemonIds = new Set<number>();
  for (const coach of activeCoaches) {
    for (const roster of coach.rosters) {
      ownedPokemonIds.add(roster.pokemonId);
    }
  }

  // Return Pokemon with prices that are not owned and not banned
  return seasonPrices
    .filter(sp => sp.price >= 0 && !ownedPokemonIds.has(sp.pokemonId))
    .map(sp => ({
      ...sp.pokemon,
      price: sp.price,
      teraCaptainCost: sp.teraCaptainCost,
      teraBanned: sp.teraBanned,
    }));
}

// Get season price for a Pokemon
export async function getPokemonSeasonPrice(seasonId: number, pokemonId: number) {
  const price = await db.query.seasonPokemonPrices.findFirst({
    where: and(
      eq(seasonPokemonPrices.seasonId, seasonId),
      eq(seasonPokemonPrices.pokemonId, pokemonId)
    ),
  });
  return price;
}

// Execute FA Swap (combined pickup and drop in one action)
// Actions count = max(pickups, drops)
export async function executeFASwap(params: {
  seasonId: number;
  seasonCoachId: number;
  pickupPokemonId?: number; // Pokemon to pick up from FA
  pickupIsTeraCaptain?: boolean;
  dropRosterId?: number; // Roster entry to drop to FA
  week: number;
  countsAgainstLimit: boolean;
  notes?: string;
}) {
  const {
    seasonId,
    seasonCoachId,
    pickupPokemonId,
    pickupIsTeraCaptain,
    dropRosterId,
    week,
    countsAgainstLimit,
    notes,
  } = params;

  if (!pickupPokemonId && !dropRosterId) {
    throw new Error("Must specify at least one Pokemon to pick up or drop");
  }

  // Get season coach details
  const sc = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, seasonCoachId),
  });

  if (!sc) {
    throw new Error("Season coach not found");
  }

  let budgetChange = 0;
  let pickupCost = 0;
  let dropRefund = 0;
  let droppedPokemonId: number | null = null;
  let droppedTeraCaptain = false;

  // Handle drop first (to free up budget)
  if (dropRosterId) {
    const roster = await db.query.rosters.findFirst({
      where: eq(rosters.id, dropRosterId),
      with: { pokemon: true },
    });

    if (!roster || roster.seasonCoachId !== seasonCoachId) {
      throw new Error("Roster entry not found or doesn't belong to this coach");
    }

    droppedPokemonId = roster.pokemonId;
    droppedTeraCaptain = roster.isTeraCaptain || false;
    dropRefund = roster.price;
    budgetChange += dropRefund;

    // Remove from roster
    await db.delete(rosters).where(eq(rosters.id, dropRosterId));
  }

  // Handle pickup
  if (pickupPokemonId) {
    const priceData = await getPokemonSeasonPrice(seasonId, pickupPokemonId);
    if (!priceData || priceData.price < 0) {
      throw new Error("Pokemon not available for this season");
    }

    pickupCost = priceData.price;
    if (pickupIsTeraCaptain && priceData.teraCaptainCost) {
      pickupCost += priceData.teraCaptainCost;
    }

    // Check budget (after potential refund from drop)
    const availableBudget = (sc.remainingBudget || 0) + dropRefund;
    if (availableBudget < pickupCost) {
      // If we already dropped, we need to restore it - but this is complex
      // For now, just throw an error
      throw new Error(`Insufficient budget. Need ${pickupCost}, have ${availableBudget}`);
    }

    budgetChange -= pickupCost;
  }

  // Determine transaction type
  const hasPickup = !!pickupPokemonId;
  const hasDrop = !!dropRosterId;
  const txType = hasPickup && hasDrop ? "FA_SWAP" : hasPickup ? "FA_PICKUP" : "FA_DROP";

  // Create transaction record
  const [tx] = await db
    .insert(transactions)
    .values({
      seasonId,
      type: txType,
      week,
      seasonCoachId,
      teamAbbreviation: sc.teamAbbreviation,
      pokemonIn: pickupPokemonId ? [pickupPokemonId] : [],
      pokemonOut: droppedPokemonId ? [droppedPokemonId] : [],
      oldTeraCaptainId: droppedTeraCaptain ? droppedPokemonId : null,
      budgetChange,
      countsAgainstLimit,
      notes,
    })
    .returning();

  // Add picked up Pokemon to roster
  if (pickupPokemonId) {
    await db.insert(rosters).values({
      seasonCoachId,
      pokemonId: pickupPokemonId,
      price: pickupCost,
      isTeraCaptain: pickupIsTeraCaptain || false,
      acquiredWeek: week,
      acquiredVia: "FA_PICKUP",
      acquiredTransactionId: tx.id,
    });
  }

  // Update budget
  await db
    .update(seasonCoaches)
    .set({ remainingBudget: (sc.remainingBudget || 0) + budgetChange })
    .where(eq(seasonCoaches.id, seasonCoachId));

  return tx;
}

// Execute FA Pickup
export async function executeFAPickup(params: {
  seasonId: number;
  seasonCoachId: number;
  pokemonId: number;
  isTeraCaptain: boolean;
  week: number;
  countsAgainstLimit: boolean;
  notes?: string;
}) {
  const { seasonId, seasonCoachId, pokemonId, isTeraCaptain, week, countsAgainstLimit, notes } = params;

  // Get season coach details
  const sc = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, seasonCoachId),
  });

  if (!sc) {
    throw new Error("Season coach not found");
  }

  // Get Pokemon price for this season
  const priceData = await getPokemonSeasonPrice(seasonId, pokemonId);
  if (!priceData || priceData.price < 0) {
    throw new Error("Pokemon not available for this season");
  }

  // Calculate total cost
  let totalCost = priceData.price;
  if (isTeraCaptain && priceData.teraCaptainCost) {
    totalCost += priceData.teraCaptainCost;
  }

  // Check budget
  const currentBudget = sc.remainingBudget || 0;
  if (currentBudget < totalCost) {
    throw new Error(`Insufficient budget. Need ${totalCost}, have ${currentBudget}`);
  }

  // Create transaction record
  const [tx] = await db
    .insert(transactions)
    .values({
      seasonId,
      type: "FA_PICKUP",
      week,
      seasonCoachId,
      teamAbbreviation: sc.teamAbbreviation,
      pokemonIn: [pokemonId],
      pokemonOut: [],
      budgetChange: -totalCost,
      countsAgainstLimit,
      notes,
    })
    .returning();

  // Add to roster
  await db.insert(rosters).values({
    seasonCoachId,
    pokemonId,
    price: totalCost,
    isTeraCaptain,
    acquiredWeek: week,
    acquiredVia: "FA_PICKUP",
    acquiredTransactionId: tx.id,
  });

  // Update budget
  await db
    .update(seasonCoaches)
    .set({ remainingBudget: currentBudget - totalCost })
    .where(eq(seasonCoaches.id, seasonCoachId));

  return tx;
}

// Execute FA Drop
export async function executeFADrop(params: {
  seasonId: number;
  seasonCoachId: number;
  rosterId: number;
  week: number;
  countsAgainstLimit: boolean;
  notes?: string;
}) {
  const { seasonId, seasonCoachId, rosterId, week, countsAgainstLimit, notes } = params;

  // Get roster entry
  const roster = await db.query.rosters.findFirst({
    where: eq(rosters.id, rosterId),
    with: { pokemon: true },
  });

  if (!roster || roster.seasonCoachId !== seasonCoachId) {
    throw new Error("Roster entry not found or doesn't belong to this coach");
  }

  // Get season coach
  const sc = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, seasonCoachId),
  });

  if (!sc) {
    throw new Error("Season coach not found");
  }

  // Create transaction record
  const [tx] = await db
    .insert(transactions)
    .values({
      seasonId,
      type: "FA_DROP",
      week,
      seasonCoachId,
      teamAbbreviation: sc.teamAbbreviation,
      pokemonIn: [],
      pokemonOut: [roster.pokemonId],
      oldTeraCaptainId: roster.isTeraCaptain ? roster.pokemonId : null,
      budgetChange: roster.price,
      countsAgainstLimit,
      notes,
    })
    .returning();

  // Remove from roster
  await db.delete(rosters).where(eq(rosters.id, rosterId));

  // Refund budget
  await db
    .update(seasonCoaches)
    .set({ remainingBudget: (sc.remainingBudget || 0) + roster.price })
    .where(eq(seasonCoaches.id, seasonCoachId));

  return tx;
}

// Execute P2P Trade
export async function executeP2PTrade(params: {
  seasonId: number;
  team1SeasonCoachId: number;
  team1RosterIds: number[];
  team2SeasonCoachId: number;
  team2RosterIds: number[];
  week: number;
  countsAgainstLimit: boolean;
  notes?: string;
}) {
  const {
    seasonId,
    team1SeasonCoachId,
    team1RosterIds,
    team2SeasonCoachId,
    team2RosterIds,
    week,
    countsAgainstLimit,
    notes,
  } = params;

  // Validate max 3 Pokemon per side
  if (team1RosterIds.length > 3 || team2RosterIds.length > 3) {
    throw new Error("Maximum 3 Pokemon per side in a trade");
  }

  // Get both coaches
  const [team1, team2] = await Promise.all([
    db.query.seasonCoaches.findFirst({
      where: eq(seasonCoaches.id, team1SeasonCoachId),
    }),
    db.query.seasonCoaches.findFirst({
      where: eq(seasonCoaches.id, team2SeasonCoachId),
    }),
  ]);

  if (!team1 || !team2) {
    throw new Error("One or both teams not found");
  }

  // Get roster entries for both sides
  const [team1Rosters, team2Rosters] = await Promise.all([
    db.query.rosters.findMany({
      where: inArray(rosters.id, team1RosterIds),
    }),
    db.query.rosters.findMany({
      where: inArray(rosters.id, team2RosterIds),
    }),
  ]);

  // Validate ownership
  if (team1Rosters.some(r => r.seasonCoachId !== team1SeasonCoachId)) {
    throw new Error("Some Pokemon don't belong to Team 1");
  }
  if (team2Rosters.some(r => r.seasonCoachId !== team2SeasonCoachId)) {
    throw new Error("Some Pokemon don't belong to Team 2");
  }

  // Calculate point values (points follow Pokemon)
  const team1Value = team1Rosters.reduce((sum, r) => sum + r.price, 0);
  const team2Value = team2Rosters.reduce((sum, r) => sum + r.price, 0);

  // Team1 gives away team1Value, receives team2Value
  const team1NetChange = team2Value - team1Value;
  // Team2 gives away team2Value, receives team1Value
  const team2NetChange = team1Value - team2Value;

  // Check budgets (receiving Pokemon costs points)
  const team1NewBudget = (team1.remainingBudget || 0) + team1NetChange;
  const team2NewBudget = (team2.remainingBudget || 0) + team2NetChange;

  if (team1NewBudget < 0) {
    throw new Error(`Team 1 would have negative budget (${team1NewBudget})`);
  }
  if (team2NewBudget < 0) {
    throw new Error(`Team 2 would have negative budget (${team2NewBudget})`);
  }

  // Create transaction for Team 1 (primary record)
  const [tx] = await db
    .insert(transactions)
    .values({
      seasonId,
      type: "P2P_TRADE",
      week,
      seasonCoachId: team1SeasonCoachId,
      teamAbbreviation: team1.teamAbbreviation,
      tradingPartnerSeasonCoachId: team2SeasonCoachId,
      tradingPartnerAbbreviation: team2.teamAbbreviation,
      pokemonIn: team2Rosters.map(r => r.pokemonId),
      pokemonOut: team1Rosters.map(r => r.pokemonId),
      budgetChange: team1NetChange,
      countsAgainstLimit,
      notes,
    })
    .returning();

  // Update roster ownership: Team1's Pokemon go to Team2
  for (const roster of team1Rosters) {
    await db
      .update(rosters)
      .set({
        seasonCoachId: team2SeasonCoachId,
        acquiredWeek: week,
        acquiredVia: "P2P_TRADE",
        acquiredTransactionId: tx.id,
      })
      .where(eq(rosters.id, roster.id));
  }

  // Update roster ownership: Team2's Pokemon go to Team1
  for (const roster of team2Rosters) {
    await db
      .update(rosters)
      .set({
        seasonCoachId: team1SeasonCoachId,
        acquiredWeek: week,
        acquiredVia: "P2P_TRADE",
        acquiredTransactionId: tx.id,
      })
      .where(eq(rosters.id, roster.id));
  }

  // Update budgets
  await db
    .update(seasonCoaches)
    .set({ remainingBudget: team1NewBudget })
    .where(eq(seasonCoaches.id, team1SeasonCoachId));

  await db
    .update(seasonCoaches)
    .set({ remainingBudget: team2NewBudget })
    .where(eq(seasonCoaches.id, team2SeasonCoachId));

  return tx;
}

// Execute Tera Swap (change tera captain on same team)
export async function executeTeraSwap(params: {
  seasonId: number;
  seasonCoachId: number;
  newTeraCaptainRosterId: number;
  oldTeraCaptainRosterId?: number;
  week: number;
  countsAgainstLimit: boolean;
  notes?: string;
}) {
  const {
    seasonId,
    seasonCoachId,
    newTeraCaptainRosterId,
    oldTeraCaptainRosterId,
    week,
    countsAgainstLimit,
    notes,
  } = params;

  // Get season coach
  const sc = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, seasonCoachId),
    with: { division: { with: { season: true } } },
  });

  if (!sc) {
    throw new Error("Season coach not found");
  }

  // Get new tera captain roster entry
  const newTCRoster = await db.query.rosters.findFirst({
    where: eq(rosters.id, newTeraCaptainRosterId),
    with: { pokemon: true },
  });

  if (!newTCRoster || newTCRoster.seasonCoachId !== seasonCoachId) {
    throw new Error("New tera captain not found or doesn't belong to this coach");
  }

  // Check if Pokemon is tera banned
  const priceData = await getPokemonSeasonPrice(seasonId, newTCRoster.pokemonId);
  if (priceData?.teraBanned) {
    throw new Error("This Pokemon is Tera Banned and cannot be a Tera Captain");
  }

  let oldTCRoster = null;
  let budgetChange = 0;

  // If removing old tera captain
  if (oldTeraCaptainRosterId) {
    oldTCRoster = await db.query.rosters.findFirst({
      where: eq(rosters.id, oldTeraCaptainRosterId),
      with: { pokemon: true },
    });

    if (!oldTCRoster || oldTCRoster.seasonCoachId !== seasonCoachId) {
      throw new Error("Old tera captain not found or doesn't belong to this coach");
    }

    // Remove tera captain status
    await db
      .update(rosters)
      .set({ isTeraCaptain: false })
      .where(eq(rosters.id, oldTeraCaptainRosterId));
  }

  // Calculate cost for new tera captain
  if (priceData?.teraCaptainCost) {
    budgetChange = -priceData.teraCaptainCost;

    // Check budget
    const currentBudget = sc.remainingBudget || 0;
    if (currentBudget < priceData.teraCaptainCost) {
      throw new Error(`Insufficient budget for tera captain cost. Need ${priceData.teraCaptainCost}, have ${currentBudget}`);
    }

    // Update budget
    await db
      .update(seasonCoaches)
      .set({ remainingBudget: currentBudget - priceData.teraCaptainCost })
      .where(eq(seasonCoaches.id, seasonCoachId));
  }

  // Set new tera captain
  await db
    .update(rosters)
    .set({ isTeraCaptain: true })
    .where(eq(rosters.id, newTeraCaptainRosterId));

  // Update price to include tera captain cost
  if (priceData?.teraCaptainCost) {
    await db
      .update(rosters)
      .set({ price: newTCRoster.price + priceData.teraCaptainCost })
      .where(eq(rosters.id, newTeraCaptainRosterId));
  }

  // Create transaction record
  const [tx] = await db
    .insert(transactions)
    .values({
      seasonId,
      type: "TERA_SWAP",
      week,
      seasonCoachId,
      teamAbbreviation: sc.teamAbbreviation,
      newTeraCaptainId: newTCRoster.pokemonId,
      oldTeraCaptainId: oldTCRoster?.pokemonId || null,
      budgetChange,
      countsAgainstLimit,
      notes,
    })
    .returning();

  return tx;
}

// Undo a transaction (admin only)
export async function undoTransaction(transactionId: number) {
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });

  if (!tx) {
    throw new Error("Transaction not found");
  }

  // Get current budget for the primary team
  const primaryTeam = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, tx.seasonCoachId),
  });

  // Handle based on type
  switch (tx.type) {
    case "FA_PICKUP": {
      // Remove the Pokemon from roster
      const roster = await db.query.rosters.findFirst({
        where: eq(rosters.acquiredTransactionId, transactionId),
      });
      if (roster) {
        await db.delete(rosters).where(eq(rosters.id, roster.id));
      }
      // Refund budget (budgetChange was negative for pickup, so subtract to reverse)
      if (primaryTeam) {
        await db
          .update(seasonCoaches)
          .set({
            remainingBudget: (primaryTeam.remainingBudget || 0) - (tx.budgetChange || 0),
          })
          .where(eq(seasonCoaches.id, tx.seasonCoachId));
      }
      break;
    }

    case "FA_DROP": {
      // This is complex - we'd need to re-add the Pokemon
      // For now, just throw an error
      throw new Error("Undoing FA drops is not supported. Please manually re-add the Pokemon.");
    }

    case "FA_SWAP": {
      // Remove the picked up Pokemon if there was one
      const pickupRoster = await db.query.rosters.findFirst({
        where: eq(rosters.acquiredTransactionId, transactionId),
      });
      if (pickupRoster) {
        await db.delete(rosters).where(eq(rosters.id, pickupRoster.id));
      }
      // Cannot restore dropped Pokemon - warn user
      if ((tx.pokemonOut as number[])?.length > 0) {
        console.warn("FA_SWAP undo: Dropped Pokemon cannot be restored automatically");
      }
      // Refund budget
      if (primaryTeam) {
        await db
          .update(seasonCoaches)
          .set({
            remainingBudget: (primaryTeam.remainingBudget || 0) - (tx.budgetChange || 0),
          })
          .where(eq(seasonCoaches.id, tx.seasonCoachId));
      }
      break;
    }

    case "P2P_TRADE": {
      // Reverse the trade - swap Pokemon back
      const rostersMoved = await db.query.rosters.findMany({
        where: eq(rosters.acquiredTransactionId, transactionId),
      });

      for (const roster of rostersMoved) {
        // Determine original owner
        const pokemonId = roster.pokemonId;
        const wasInPokemonIn = (tx.pokemonIn as number[])?.includes(pokemonId);
        const wasInPokemonOut = (tx.pokemonOut as number[])?.includes(pokemonId);

        let originalOwnerId: number;
        if (wasInPokemonIn) {
          // This Pokemon was received by team1, so it came from team2
          originalOwnerId = tx.tradingPartnerSeasonCoachId!;
        } else if (wasInPokemonOut) {
          // This Pokemon was given by team1, so it belonged to team1
          originalOwnerId = tx.seasonCoachId;
        } else {
          continue; // Shouldn't happen
        }

        await db
          .update(rosters)
          .set({
            seasonCoachId: originalOwnerId,
            acquiredWeek: null,
            acquiredVia: null,
            acquiredTransactionId: null,
          })
          .where(eq(rosters.id, roster.id));
      }

      // Reverse budget changes for primary team
      if (primaryTeam) {
        await db
          .update(seasonCoaches)
          .set({
            remainingBudget: (primaryTeam.remainingBudget || 0) - (tx.budgetChange || 0),
          })
          .where(eq(seasonCoaches.id, tx.seasonCoachId));
      }

      // Reverse budget changes for trading partner
      if (tx.tradingPartnerSeasonCoachId) {
        const partnerTeam = await db.query.seasonCoaches.findFirst({
          where: eq(seasonCoaches.id, tx.tradingPartnerSeasonCoachId),
        });
        if (partnerTeam) {
          await db
            .update(seasonCoaches)
            .set({
              remainingBudget: (partnerTeam.remainingBudget || 0) + (tx.budgetChange || 0),
            })
            .where(eq(seasonCoaches.id, tx.tradingPartnerSeasonCoachId));
        }
      }
      break;
    }

    case "TERA_SWAP": {
      // Reverse tera captain change
      if (tx.newTeraCaptainId) {
        const newTCRoster = await db.query.rosters.findFirst({
          where: and(
            eq(rosters.seasonCoachId, tx.seasonCoachId),
            eq(rosters.pokemonId, tx.newTeraCaptainId)
          ),
        });
        if (newTCRoster) {
          await db
            .update(rosters)
            .set({ isTeraCaptain: false })
            .where(eq(rosters.id, newTCRoster.id));
        }
      }
      if (tx.oldTeraCaptainId) {
        const oldTCRoster = await db.query.rosters.findFirst({
          where: and(
            eq(rosters.seasonCoachId, tx.seasonCoachId),
            eq(rosters.pokemonId, tx.oldTeraCaptainId)
          ),
        });
        if (oldTCRoster) {
          await db
            .update(rosters)
            .set({ isTeraCaptain: true })
            .where(eq(rosters.id, oldTCRoster.id));
        }
      }
      // Refund tera captain cost
      if (tx.budgetChange && primaryTeam) {
        await db
          .update(seasonCoaches)
          .set({
            remainingBudget: (primaryTeam.remainingBudget || 0) - (tx.budgetChange || 0),
          })
          .where(eq(seasonCoaches.id, tx.seasonCoachId));
      }
      break;
    }
  }

  // Delete the transaction record
  await db.delete(transactions).where(eq(transactions.id, transactionId));

  return { success: true };
}
