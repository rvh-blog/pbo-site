import { db } from "./db";
import {
  transactions,
  rosters,
  seasonCoaches,
  seasonPokemonPrices,
  pokemon,
  divisions,
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
    if (tx.type === "FA_PICKUP" || tx.type === "FA_SWAP") {
      // Pickups and swaps always cost a FA point
      faUsed++;
    } else if (tx.type === "TERA_SWAP" && tx.newTeraCaptainId) {
      // Tera changes only cost when adding/swapping a new captain, not removing
      faUsed++;
    } else if (tx.type === "P2P_TRADE") {
      p2pUsed++;
    }
    // FA_DROP and tera removes (no newTeraCaptainId) are free
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

// Get Pokemon not on any roster for a division (Free Agents)
// Free agent pools are division-specific, not season-wide
export async function getAvailableFreeAgents(seasonId: number, divisionId?: number) {
  // Get all Pokemon that have prices for this season
  const seasonPrices = await db.query.seasonPokemonPrices.findMany({
    where: eq(seasonPokemonPrices.seasonId, seasonId),
    with: {
      pokemon: true,
    },
  });

  // If no division specified, return all priced Pokemon (for backwards compatibility)
  if (!divisionId) {
    return seasonPrices
      .filter(sp => sp.price >= 0) // Exclude banned Pokemon (price = -1)
      .map(sp => ({
        ...sp.pokemon,
        price: sp.price,
        teraCaptainCost: sp.teraCaptainCost,
        teraBanned: sp.teraBanned,
      }));
  }

  // Get active season coaches for this specific division only
  const activeCoaches = await db.query.seasonCoaches.findMany({
    where: and(
      eq(seasonCoaches.divisionId, divisionId),
      eq(seasonCoaches.isActive, true)
    ),
    with: {
      rosters: true,
    },
  });

  // Get all Pokemon IDs currently on rosters in this division
  const ownedPokemonIds = new Set<number>();
  for (const coach of activeCoaches) {
    for (const roster of coach.rosters) {
      ownedPokemonIds.add(roster.pokemonId);
    }
  }

  // Return Pokemon with prices that are not owned in this division and not banned
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
      newTeraCaptainId: pickupIsTeraCaptain ? pickupPokemonId : null,
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
  team1IncomingTC?: Record<string, boolean>;  // TC overrides for Pokemon arriving at Team 1 (keyed by team2 rosterId)
  team2IncomingTC?: Record<string, boolean>;  // TC overrides for Pokemon arriving at Team 2 (keyed by team1 rosterId)
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
    team1IncomingTC = {},
    team2IncomingTC = {},
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

  // Compute TC adjustments
  // team2Rosters are arriving at Team 1 — check team1IncomingTC
  // team1Rosters are arriving at Team 2 — check team2IncomingTC
  type TCChange = { rosterId: number; pokemonId: number; originalTC: boolean; newTC: boolean; tcCost: number };
  const team1TCChanges: TCChange[] = [];
  const team2TCChanges: TCChange[] = [];
  let team1TCBudgetChange = 0;
  let team2TCBudgetChange = 0;

  for (const roster of team2Rosters) {
    const rosterIdStr = String(roster.id);
    if (rosterIdStr in team1IncomingTC && team1IncomingTC[rosterIdStr] !== !!roster.isTeraCaptain) {
      const newTC = team1IncomingTC[rosterIdStr];
      const priceData = await getPokemonSeasonPrice(seasonId, roster.pokemonId);
      if (newTC && (priceData?.teraBanned || priceData?.teraCaptainCost == null)) {
        throw new Error(`Cannot set TC on ${roster.pokemonId} — tera banned or no TC cost`);
      }
      const tcCost = priceData?.teraCaptainCost ?? 0;
      team1TCChanges.push({ rosterId: roster.id, pokemonId: roster.pokemonId, originalTC: !!roster.isTeraCaptain, newTC, tcCost });
      // TC removal refunds, TC addition charges
      team1TCBudgetChange += newTC ? -tcCost : tcCost;
    }
  }

  for (const roster of team1Rosters) {
    const rosterIdStr = String(roster.id);
    if (rosterIdStr in team2IncomingTC && team2IncomingTC[rosterIdStr] !== !!roster.isTeraCaptain) {
      const newTC = team2IncomingTC[rosterIdStr];
      const priceData = await getPokemonSeasonPrice(seasonId, roster.pokemonId);
      if (newTC && (priceData?.teraBanned || priceData?.teraCaptainCost == null)) {
        throw new Error(`Cannot set TC on ${roster.pokemonId} — tera banned or no TC cost`);
      }
      const tcCost = priceData?.teraCaptainCost ?? 0;
      team2TCChanges.push({ rosterId: roster.id, pokemonId: roster.pokemonId, originalTC: !!roster.isTeraCaptain, newTC, tcCost });
      team2TCBudgetChange += newTC ? -tcCost : tcCost;
    }
  }

  // Calculate point values (points follow Pokemon)
  const team1Value = team1Rosters.reduce((sum, r) => sum + r.price, 0);
  const team2Value = team2Rosters.reduce((sum, r) => sum + r.price, 0);

  // Team1 gives away team1Value (frees budget), receives team2Value (costs budget) + TC adjustments
  const team1NetChange = team1Value - team2Value + team1TCBudgetChange;
  // Team2 gives away team2Value (frees budget), receives team1Value (costs budget) + TC adjustments
  const team2NetChange = team2Value - team1Value + team2TCBudgetChange;

  // Check budgets (receiving Pokemon costs points)
  const team1NewBudget = (team1.remainingBudget || 0) + team1NetChange;
  const team2NewBudget = (team2.remainingBudget || 0) + team2NetChange;

  if (team1NewBudget < 0) {
    throw new Error(`Team 1 would have negative budget (${team1NewBudget})`);
  }
  if (team2NewBudget < 0) {
    throw new Error(`Team 2 would have negative budget (${team2NewBudget})`);
  }

  // Build TC metadata for undo support
  const tcMeta = (team1TCChanges.length > 0 || team2TCChanges.length > 0)
    ? { team1: team1TCChanges, team2: team2TCChanges, team2BudgetChange: team2TCBudgetChange }
    : null;
  const finalNotes = tcMeta
    ? (notes ? notes + " " : "") + `__TC_META__${JSON.stringify(tcMeta)}`
    : notes;

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
      notes: finalNotes,
    })
    .returning();

  // For 1-for-1 trades, swap draft orders so Pokemon inherits the slot of the traded-away Pokemon
  // For multi-Pokemon trades, use acquiredWeek instead
  const is1for1Trade = team1Rosters.length === 1 && team2Rosters.length === 1;

  // Build TC update sets keyed by roster ID for efficient lookup
  const tcUpdateMap = new Map<number, { isTeraCaptain: boolean; priceAdjust: number }>();
  for (const tc of team1TCChanges) {
    tcUpdateMap.set(tc.rosterId, {
      isTeraCaptain: tc.newTC,
      priceAdjust: tc.newTC ? tc.tcCost : -tc.tcCost,
    });
  }
  for (const tc of team2TCChanges) {
    tcUpdateMap.set(tc.rosterId, {
      isTeraCaptain: tc.newTC,
      priceAdjust: tc.newTC ? tc.tcCost : -tc.tcCost,
    });
  }

  if (is1for1Trade) {
    // Swap draft orders: incoming Pokemon takes the slot of the outgoing Pokemon
    const team1DraftOrder = team1Rosters[0].draftOrder;
    const team2DraftOrder = team2Rosters[0].draftOrder;

    // Team1's Pokemon goes to Team2, inherits Team2's Pokemon's draft slot
    const t1tc = tcUpdateMap.get(team1Rosters[0].id);
    await db
      .update(rosters)
      .set({
        seasonCoachId: team2SeasonCoachId,
        draftOrder: team2DraftOrder,
        acquiredWeek: week,
        acquiredVia: "P2P_TRADE",
        acquiredTransactionId: tx.id,
        ...(t1tc ? { isTeraCaptain: t1tc.isTeraCaptain, price: team1Rosters[0].price + t1tc.priceAdjust } : {}),
      })
      .where(eq(rosters.id, team1Rosters[0].id));

    // Team2's Pokemon goes to Team1, inherits Team1's Pokemon's draft slot
    const t2tc = tcUpdateMap.get(team2Rosters[0].id);
    await db
      .update(rosters)
      .set({
        seasonCoachId: team1SeasonCoachId,
        draftOrder: team1DraftOrder,
        acquiredWeek: week,
        acquiredVia: "P2P_TRADE",
        acquiredTransactionId: tx.id,
        ...(t2tc ? { isTeraCaptain: t2tc.isTeraCaptain, price: team2Rosters[0].price + t2tc.priceAdjust } : {}),
      })
      .where(eq(rosters.id, team2Rosters[0].id));
  } else {
    // Multi-Pokemon trade: clear draft orders, use acquiredWeek for sorting
    for (const roster of team1Rosters) {
      const tc = tcUpdateMap.get(roster.id);
      await db
        .update(rosters)
        .set({
          seasonCoachId: team2SeasonCoachId,
          draftOrder: null,
          acquiredWeek: week,
          acquiredVia: "P2P_TRADE",
          acquiredTransactionId: tx.id,
          ...(tc ? { isTeraCaptain: tc.isTeraCaptain, price: roster.price + tc.priceAdjust } : {}),
        })
        .where(eq(rosters.id, roster.id));
    }

    for (const roster of team2Rosters) {
      const tc = tcUpdateMap.get(roster.id);
      await db
        .update(rosters)
        .set({
          seasonCoachId: team1SeasonCoachId,
          draftOrder: null,
          acquiredWeek: week,
          acquiredVia: "P2P_TRADE",
          acquiredTransactionId: tx.id,
          ...(tc ? { isTeraCaptain: tc.isTeraCaptain, price: roster.price + tc.priceAdjust } : {}),
        })
        .where(eq(rosters.id, roster.id));
    }
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
// Can add TC, remove TC, or swap (both) - each costs 1 FA point
export async function executeTeraSwap(params: {
  seasonId: number;
  seasonCoachId: number;
  newTeraCaptainRosterId?: number; // Pokemon to make a TC (optional)
  oldTeraCaptainRosterId?: number; // Pokemon to remove TC status from (optional)
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

  if (!newTeraCaptainRosterId && !oldTeraCaptainRosterId) {
    throw new Error("Must specify a Pokemon to add or remove as Tera Captain");
  }

  // Get season coach
  const sc = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, seasonCoachId),
    with: { division: { with: { season: true } } },
  });

  if (!sc) {
    throw new Error("Season coach not found");
  }

  let newTCRoster = null;
  let oldTCRoster = null;
  let budgetChange = 0;
  let newTCCost = 0;
  let oldTCRefund = 0;

  // Handle removing old tera captain (refund the TC cost)
  if (oldTeraCaptainRosterId) {
    oldTCRoster = await db.query.rosters.findFirst({
      where: eq(rosters.id, oldTeraCaptainRosterId),
      with: { pokemon: true },
    });

    if (!oldTCRoster || oldTCRoster.seasonCoachId !== seasonCoachId) {
      throw new Error("Old tera captain not found or doesn't belong to this coach");
    }

    if (!oldTCRoster.isTeraCaptain) {
      throw new Error("Selected Pokemon is not currently a Tera Captain");
    }

    // Get the TC cost for the old Pokemon to calculate refund
    const oldPriceData = await getPokemonSeasonPrice(seasonId, oldTCRoster.pokemonId);
    if (oldPriceData?.teraCaptainCost) {
      oldTCRefund = oldPriceData.teraCaptainCost;
      budgetChange += oldTCRefund;
    }

    // Remove tera captain status
    await db
      .update(rosters)
      .set({ isTeraCaptain: false })
      .where(eq(rosters.id, oldTeraCaptainRosterId));

    // Update roster price to subtract the TC cost
    if (oldTCRefund > 0) {
      await db
        .update(rosters)
        .set({ price: oldTCRoster.price - oldTCRefund })
        .where(eq(rosters.id, oldTeraCaptainRosterId));
    }
  }

  // Handle adding new tera captain
  if (newTeraCaptainRosterId) {
    newTCRoster = await db.query.rosters.findFirst({
      where: eq(rosters.id, newTeraCaptainRosterId),
      with: { pokemon: true },
    });

    if (!newTCRoster || newTCRoster.seasonCoachId !== seasonCoachId) {
      throw new Error("New tera captain not found or doesn't belong to this coach");
    }

    if (newTCRoster.isTeraCaptain) {
      throw new Error("Selected Pokemon is already a Tera Captain");
    }

    // Check if Pokemon is tera banned
    const priceData = await getPokemonSeasonPrice(seasonId, newTCRoster.pokemonId);
    if (priceData?.teraBanned) {
      throw new Error("This Pokemon is Tera Banned and cannot be a Tera Captain");
    }

    // Calculate cost for new tera captain
    if (priceData?.teraCaptainCost) {
      newTCCost = priceData.teraCaptainCost;
      budgetChange -= newTCCost;
    }

    // Set new tera captain
    await db
      .update(rosters)
      .set({ isTeraCaptain: true })
      .where(eq(rosters.id, newTeraCaptainRosterId));

    // Update price to include tera captain cost
    if (newTCCost > 0) {
      await db
        .update(rosters)
        .set({ price: newTCRoster.price + newTCCost })
        .where(eq(rosters.id, newTeraCaptainRosterId));
    }
  }

  // Check budget after calculating net change
  const currentBudget = sc.remainingBudget || 0;
  const newBudget = currentBudget + budgetChange;
  if (newBudget < 0) {
    throw new Error(`Insufficient budget. Net cost: ${-budgetChange}, have ${currentBudget}`);
  }

  // Update budget
  await db
    .update(seasonCoaches)
    .set({ remainingBudget: newBudget })
    .where(eq(seasonCoaches.id, seasonCoachId));

  // Create transaction record
  const [tx] = await db
    .insert(transactions)
    .values({
      seasonId,
      type: "TERA_SWAP",
      week,
      seasonCoachId,
      teamAbbreviation: sc.teamAbbreviation,
      newTeraCaptainId: newTCRoster?.pokemonId || null,
      oldTeraCaptainId: oldTCRoster?.pokemonId || null,
      budgetChange,
      countsAgainstLimit,
      notes,
    })
    .returning();

  return tx;
}

// Execute Bulk FA Transaction (multiple swaps, drops, pickups, and TC changes)
// Creates individual transaction records for each change
export async function executeBulkFATransaction(params: {
  seasonId: number;
  divisionId: number;
  seasonCoachId: number;
  week: number;
  countsAgainstLimit: boolean;
  swaps: { dropRosterId: number; pickupPokemonId: number; isTeraCaptain: boolean }[];
  drops: number[]; // Roster IDs to drop (without pickup)
  pickups: { pokemonId: number; isTeraCaptain: boolean }[]; // Pickups without drop
  tcSwaps: { oldPokemonId: number; newPokemonId: number }[]; // Paired TC changes (1 remove + 1 add = 1 TERA_SWAP)
  tcChanges: { pokemonId: number; newStatus: boolean }[]; // Unpaired TC changes
  notes?: string;
}) {
  const {
    seasonId,
    divisionId,
    seasonCoachId,
    week,
    countsAgainstLimit,
    swaps,
    drops,
    pickups,
    tcSwaps,
    tcChanges,
  } = params;

  // Get season coach
  const sc = await db.query.seasonCoaches.findFirst({
    where: eq(seasonCoaches.id, seasonCoachId),
    with: { rosters: true },
  });

  if (!sc) {
    throw new Error("Season coach not found");
  }

  // First, validate everything before making changes
  // Batch fetch all needed data concurrently

  // Collect all roster IDs needed (swaps and drops)
  const rosterIdsToFetch = [
    ...(swaps || []).map(s => s.dropRosterId),
    ...(drops || []),
  ];

  // Collect all Pokemon IDs needed for pricing
  const pokemonIdsForPricing = new Set<number>([
    ...(swaps || []).map(s => s.pickupPokemonId),
    ...(pickups || []).map(p => p.pokemonId),
    ...(tcChanges || []).map(tc => tc.pokemonId),
    ...(tcSwaps || []).flatMap(tc => [tc.oldPokemonId, tc.newPokemonId]),
  ]);

  // Collect all Pokemon IDs needed for roster lookup (TC changes)
  const tcPokemonIds = [
    ...(tcChanges || []).map(tc => tc.pokemonId),
    ...(tcSwaps || []).flatMap(tc => [tc.oldPokemonId, tc.newPokemonId]),
  ];

  // Batch fetch all data concurrently
  const [rostersById, allSeasonPrices, tcRosters] = await Promise.all([
    // Fetch rosters by ID
    rosterIdsToFetch.length > 0
      ? db.query.rosters.findMany({
          where: inArray(rosters.id, rosterIdsToFetch),
        })
      : Promise.resolve([]),
    // Fetch all season prices needed
    pokemonIdsForPricing.size > 0
      ? db.query.seasonPokemonPrices.findMany({
          where: and(
            eq(seasonPokemonPrices.seasonId, seasonId),
            inArray(seasonPokemonPrices.pokemonId, Array.from(pokemonIdsForPricing))
          ),
        })
      : Promise.resolve([]),
    // Fetch rosters for TC changes (by pokemonId)
    tcPokemonIds.length > 0
      ? db.query.rosters.findMany({
          where: and(
            eq(rosters.seasonCoachId, seasonCoachId),
            inArray(rosters.pokemonId, tcPokemonIds)
          ),
        })
      : Promise.resolve([]),
  ]);

  // Create lookup maps for O(1) access
  const rosterByIdMap = new Map(rostersById.map(r => [r.id, r]));
  const priceByPokemonMap = new Map(allSeasonPrices.map(p => [p.pokemonId, p]));
  const tcRosterByPokemonMap = new Map(tcRosters.map(r => [r.pokemonId, r]));

  // Calculate total budget impact
  let totalBudgetChange = 0;

  // Validate swaps and calculate net costs
  const swapDetails: {
    dropRosterId: number;
    dropPokemonId: number;
    dropPrice: number;
    dropIsTeraCaptain: boolean;
    pickupPokemonId: number;
    pickupCost: number;
    pickupIsTeraCaptain: boolean;
    netChange: number;
  }[] = [];

  for (const swap of swaps || []) {
    const roster = rosterByIdMap.get(swap.dropRosterId);

    if (!roster || roster.seasonCoachId !== seasonCoachId) {
      throw new Error(`Roster entry ${swap.dropRosterId} not found or doesn't belong to this coach`);
    }

    const pickupPriceData = priceByPokemonMap.get(swap.pickupPokemonId);
    if (!pickupPriceData || pickupPriceData.price < 0) {
      throw new Error(`Pokemon ${swap.pickupPokemonId} not available for this season`);
    }

    let pickupCost = pickupPriceData.price;
    if (swap.isTeraCaptain && pickupPriceData.teraCaptainCost) {
      pickupCost += pickupPriceData.teraCaptainCost;
    }

    const netChange = roster.price - pickupCost;

    swapDetails.push({
      dropRosterId: swap.dropRosterId,
      dropPokemonId: roster.pokemonId,
      dropPrice: roster.price,
      dropIsTeraCaptain: roster.isTeraCaptain || false,
      pickupPokemonId: swap.pickupPokemonId,
      pickupCost,
      pickupIsTeraCaptain: swap.isTeraCaptain,
      netChange,
    });
    totalBudgetChange += netChange;
  }

  // Validate drops and calculate refunds
  const dropDetails: { rosterId: number; pokemonId: number; price: number; isTeraCaptain: boolean }[] = [];
  for (const dropRosterId of drops || []) {
    const roster = rosterByIdMap.get(dropRosterId);

    if (!roster || roster.seasonCoachId !== seasonCoachId) {
      throw new Error(`Roster entry ${dropRosterId} not found or doesn't belong to this coach`);
    }

    dropDetails.push({
      rosterId: dropRosterId,
      pokemonId: roster.pokemonId,
      price: roster.price,
      isTeraCaptain: roster.isTeraCaptain || false,
    });
    totalBudgetChange += roster.price;
  }

  // Validate pickups and calculate costs
  const pickupDetails: { pokemonId: number; cost: number; isTeraCaptain: boolean }[] = [];
  for (const pickup of pickups || []) {
    const priceData = priceByPokemonMap.get(pickup.pokemonId);
    if (!priceData || priceData.price < 0) {
      throw new Error(`Pokemon ${pickup.pokemonId} not available for this season`);
    }

    let cost = priceData.price;
    if (pickup.isTeraCaptain && priceData.teraCaptainCost) {
      cost += priceData.teraCaptainCost;
    }
    pickupDetails.push({ pokemonId: pickup.pokemonId, cost, isTeraCaptain: pickup.isTeraCaptain });
    totalBudgetChange -= cost;
  }

  // Validate TC removals and calculate refunds
  const tcRemoveDetails: { pokemonId: number; refund: number; rosterId: number }[] = [];
  for (const tc of (tcChanges || []).filter(t => !t.newStatus)) {
    const roster = tcRosterByPokemonMap.get(tc.pokemonId);
    if (!roster) continue;

    const priceData = priceByPokemonMap.get(tc.pokemonId);
    const refund = priceData?.teraCaptainCost || 0;
    tcRemoveDetails.push({ pokemonId: tc.pokemonId, refund, rosterId: roster.id });
    totalBudgetChange += refund;
  }

  // Validate TC additions and calculate costs
  const tcAddDetails: { pokemonId: number; cost: number; rosterId: number }[] = [];
  for (const tc of (tcChanges || []).filter(t => t.newStatus)) {
    const roster = tcRosterByPokemonMap.get(tc.pokemonId);
    if (!roster) continue;

    const priceData = priceByPokemonMap.get(tc.pokemonId);
    const cost = priceData?.teraCaptainCost || 0;
    tcAddDetails.push({ pokemonId: tc.pokemonId, cost, rosterId: roster.id });
    totalBudgetChange -= cost;
  }

  // Validate TC swaps (paired remove + add = 1 transaction)
  const tcSwapDetails: { oldPokemonId: number; oldRosterId: number; oldRefund: number; newPokemonId: number; newRosterId: number; newCost: number; netChange: number }[] = [];
  for (const tcSwap of tcSwaps || []) {
    const oldRoster = tcRosterByPokemonMap.get(tcSwap.oldPokemonId);
    const newRoster = tcRosterByPokemonMap.get(tcSwap.newPokemonId);

    if (!oldRoster || !newRoster) continue;

    const oldPriceData = priceByPokemonMap.get(tcSwap.oldPokemonId);
    const newPriceData = priceByPokemonMap.get(tcSwap.newPokemonId);
    const oldRefund = oldPriceData?.teraCaptainCost || 0;
    const newCost = newPriceData?.teraCaptainCost || 0;
    const netChange = oldRefund - newCost;

    tcSwapDetails.push({
      oldPokemonId: tcSwap.oldPokemonId,
      oldRosterId: oldRoster.id,
      oldRefund,
      newPokemonId: tcSwap.newPokemonId,
      newRosterId: newRoster.id,
      newCost,
      netChange,
    });
    totalBudgetChange += netChange;
  }

  // Check budget
  const newBudget = (sc.remainingBudget || 0) + totalBudgetChange;
  if (newBudget < 0) {
    throw new Error(`Insufficient budget. Would result in ${newBudget} pts`);
  }

  // Now execute all changes and create individual transaction records
  const createdTransactions: any[] = [];

  // Process swaps first (each swap = 1 FA_SWAP transaction)
  for (const swap of swapDetails) {
    // Create FA_SWAP transaction
    const [tx] = await db
      .insert(transactions)
      .values({
        seasonId,
        type: "FA_SWAP",
        week,
        seasonCoachId,
        teamAbbreviation: sc.teamAbbreviation,
        pokemonIn: [swap.pickupPokemonId],
        pokemonOut: [swap.dropPokemonId],
        oldTeraCaptainId: swap.dropIsTeraCaptain ? swap.dropPokemonId : null,
        newTeraCaptainId: swap.pickupIsTeraCaptain ? swap.pickupPokemonId : null,
        budgetChange: swap.netChange,
        countsAgainstLimit,
      })
      .returning();

    // Remove dropped Pokemon from roster
    await db.delete(rosters).where(eq(rosters.id, swap.dropRosterId));

    // Add picked up Pokemon to roster
    await db.insert(rosters).values({
      seasonCoachId,
      pokemonId: swap.pickupPokemonId,
      price: swap.pickupCost,
      isTeraCaptain: swap.pickupIsTeraCaptain,
      acquiredWeek: week,
      acquiredVia: "FA_PICKUP",
      acquiredTransactionId: tx.id,
    });

    createdTransactions.push(tx);
  }

  // Process drops (without pickup)
  for (const drop of dropDetails) {
    // Create FA_DROP transaction
    const [tx] = await db
      .insert(transactions)
      .values({
        seasonId,
        type: "FA_DROP",
        week,
        seasonCoachId,
        teamAbbreviation: sc.teamAbbreviation,
        pokemonIn: [],
        pokemonOut: [drop.pokemonId],
        oldTeraCaptainId: drop.isTeraCaptain ? drop.pokemonId : null,
        budgetChange: drop.price,
        countsAgainstLimit,
      })
      .returning();

    // Remove from roster
    await db.delete(rosters).where(eq(rosters.id, drop.rosterId));

    createdTransactions.push(tx);
  }

  // Process pickups (without drop)
  for (const pickup of pickupDetails) {
    // Create FA_PICKUP transaction
    const [tx] = await db
      .insert(transactions)
      .values({
        seasonId,
        type: "FA_PICKUP",
        week,
        seasonCoachId,
        teamAbbreviation: sc.teamAbbreviation,
        pokemonIn: [pickup.pokemonId],
        pokemonOut: [],
        newTeraCaptainId: pickup.isTeraCaptain ? pickup.pokemonId : null,
        budgetChange: -pickup.cost,
        countsAgainstLimit,
      })
      .returning();

    // Add to roster
    await db.insert(rosters).values({
      seasonCoachId,
      pokemonId: pickup.pokemonId,
      price: pickup.cost,
      isTeraCaptain: pickup.isTeraCaptain,
      acquiredWeek: week,
      acquiredVia: "FA_PICKUP",
      acquiredTransactionId: tx.id,
    });

    createdTransactions.push(tx);
  }

  // Process TC swaps (paired remove + add = 1 TERA_SWAP transaction)
  for (const tcSwap of tcSwapDetails) {
    // Create TERA_SWAP transaction with both old and new TC
    const [tx] = await db
      .insert(transactions)
      .values({
        seasonId,
        type: "TERA_SWAP",
        week,
        seasonCoachId,
        teamAbbreviation: sc.teamAbbreviation,
        oldTeraCaptainId: tcSwap.oldPokemonId,
        newTeraCaptainId: tcSwap.newPokemonId,
        budgetChange: tcSwap.netChange,
        countsAgainstLimit,
      })
      .returning();

    // Update old TC roster (remove TC status)
    const oldRoster = await db.query.rosters.findFirst({
      where: eq(rosters.id, tcSwap.oldRosterId),
    });
    if (oldRoster) {
      await db
        .update(rosters)
        .set({
          isTeraCaptain: false,
          price: oldRoster.price - tcSwap.oldRefund,
        })
        .where(eq(rosters.id, tcSwap.oldRosterId));
    }

    // Update new TC roster (add TC status)
    const newRoster = await db.query.rosters.findFirst({
      where: eq(rosters.id, tcSwap.newRosterId),
    });
    if (newRoster) {
      await db
        .update(rosters)
        .set({
          isTeraCaptain: true,
          price: newRoster.price + tcSwap.newCost,
        })
        .where(eq(rosters.id, tcSwap.newRosterId));
    }

    createdTransactions.push(tx);
  }

  // Process TC removals (unpaired)
  for (const tc of tcRemoveDetails) {
    // Create TERA_SWAP transaction for TC removal
    const [tx] = await db
      .insert(transactions)
      .values({
        seasonId,
        type: "TERA_SWAP",
        week,
        seasonCoachId,
        teamAbbreviation: sc.teamAbbreviation,
        oldTeraCaptainId: tc.pokemonId,
        newTeraCaptainId: null,
        budgetChange: tc.refund,
        countsAgainstLimit,
      })
      .returning();

    // Update roster
    const currentRoster = await db.query.rosters.findFirst({
      where: eq(rosters.id, tc.rosterId),
    });
    if (currentRoster) {
      await db
        .update(rosters)
        .set({
          isTeraCaptain: false,
          price: currentRoster.price - tc.refund,
        })
        .where(eq(rosters.id, tc.rosterId));
    }

    createdTransactions.push(tx);
  }

  // Process TC additions (unpaired)
  for (const tc of tcAddDetails) {
    // Create TERA_SWAP transaction for TC addition
    const [tx] = await db
      .insert(transactions)
      .values({
        seasonId,
        type: "TERA_SWAP",
        week,
        seasonCoachId,
        teamAbbreviation: sc.teamAbbreviation,
        oldTeraCaptainId: null,
        newTeraCaptainId: tc.pokemonId,
        budgetChange: -tc.cost,
        countsAgainstLimit,
      })
      .returning();

    // Update roster
    const currentRoster = await db.query.rosters.findFirst({
      where: eq(rosters.id, tc.rosterId),
    });
    if (currentRoster) {
      await db
        .update(rosters)
        .set({
          isTeraCaptain: true,
          price: currentRoster.price + tc.cost,
        })
        .where(eq(rosters.id, tc.rosterId));
    }

    createdTransactions.push(tx);
  }

  // Update budget
  await db
    .update(seasonCoaches)
    .set({ remainingBudget: newBudget })
    .where(eq(seasonCoaches.id, seasonCoachId));

  return { transactions: createdTransactions, count: createdTransactions.length };
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

  if (!primaryTeam) {
    throw new Error("Season coach not found");
  }

  // Capture values for use in helper functions
  const seasonId = tx.seasonId;
  const seasonCoachId = tx.seasonCoachId;

  // Helper to get season price for a Pokemon
  async function getSeasonPrice(pokemonId: number): Promise<{ price: number; teraCaptainCost: number | null }> {
    const priceData = await db.query.seasonPokemonPrices.findFirst({
      where: and(
        eq(seasonPokemonPrices.seasonId, seasonId),
        eq(seasonPokemonPrices.pokemonId, pokemonId)
      ),
    });
    return {
      price: priceData?.price || 0,
      teraCaptainCost: priceData?.teraCaptainCost || null,
    };
  }

  // Helper to restore a dropped Pokemon to the roster
  async function restoreDroppedPokemon(pokemonId: number, wasTeraCaptain: boolean) {
    const priceInfo = await getSeasonPrice(pokemonId);
    let price = priceInfo.price;
    if (wasTeraCaptain && priceInfo.teraCaptainCost) {
      price += priceInfo.teraCaptainCost;
    }

    await db.insert(rosters).values({
      seasonCoachId: seasonCoachId,
      pokemonId,
      price,
      isTeraCaptain: wasTeraCaptain,
      acquiredWeek: null,
      acquiredVia: null,
      acquiredTransactionId: null,
    });

    return price;
  }

  // Handle based on type
  switch (tx.type) {
    case "FA_PICKUP": {
      // Remove the Pokemon from roster - first try by transaction ID
      let roster = await db.query.rosters.findFirst({
        where: eq(rosters.acquiredTransactionId, transactionId),
      });

      // Fallback: find by Pokemon ID if not found by transaction ID
      if (!roster) {
        const pokemonInIds = (tx.pokemonIn as number[]) || [];
        if (pokemonInIds.length > 0) {
          roster = await db.query.rosters.findFirst({
            where: and(
              eq(rosters.seasonCoachId, seasonCoachId),
              eq(rosters.pokemonId, pokemonInIds[0])
            ),
          });
        }
      }

      if (roster) {
        await db.delete(rosters).where(eq(rosters.id, roster.id));
      } else {
        console.warn(`FA_PICKUP undo: Could not find roster entry to delete for transaction ${transactionId}`);
      }

      // Refund budget (budgetChange was negative for pickup, so subtract to reverse)
      await db
        .update(seasonCoaches)
        .set({
          remainingBudget: (primaryTeam.remainingBudget || 0) - (tx.budgetChange || 0),
        })
        .where(eq(seasonCoaches.id, tx.seasonCoachId));
      break;
    }

    case "FA_DROP": {
      // Restore the dropped Pokemon
      const pokemonOutIds = (tx.pokemonOut as number[]) || [];
      if (pokemonOutIds.length === 0) {
        throw new Error("No Pokemon recorded to restore");
      }

      // For FA_DROP, the budgetChange is the price that was refunded
      // We need to deduct it back when restoring
      const wasTeraCaptain = tx.oldTeraCaptainId === pokemonOutIds[0];
      await restoreDroppedPokemon(pokemonOutIds[0], wasTeraCaptain);

      // Reverse budget (deduct the refunded amount)
      await db
        .update(seasonCoaches)
        .set({
          remainingBudget: (primaryTeam.remainingBudget || 0) - (tx.budgetChange || 0),
        })
        .where(eq(seasonCoaches.id, tx.seasonCoachId));
      break;
    }

    case "FA_SWAP": {
      // Remove the picked up Pokemon - first try by transaction ID
      let pickupRosters = await db.query.rosters.findMany({
        where: eq(rosters.acquiredTransactionId, transactionId),
      });

      // Fallback: find by Pokemon IDs if not found by transaction ID
      if (pickupRosters.length === 0) {
        const pokemonInIds = (tx.pokemonIn as number[]) || [];
        if (pokemonInIds.length > 0) {
          pickupRosters = await db.query.rosters.findMany({
            where: and(
              eq(rosters.seasonCoachId, seasonCoachId),
              inArray(rosters.pokemonId, pokemonInIds)
            ),
          });
        }
      }

      for (const pickupRoster of pickupRosters) {
        await db.delete(rosters).where(eq(rosters.id, pickupRoster.id));
      }

      // Restore dropped Pokemon
      const pokemonOutIds = (tx.pokemonOut as number[]) || [];
      for (const droppedPokemonId of pokemonOutIds) {
        // Check if this dropped Pokemon was a TC
        const wasTeraCaptain = tx.oldTeraCaptainId === droppedPokemonId;
        await restoreDroppedPokemon(droppedPokemonId, wasTeraCaptain);
      }

      // Reverse budget
      await db
        .update(seasonCoaches)
        .set({
          remainingBudget: (primaryTeam.remainingBudget || 0) - (tx.budgetChange || 0),
        })
        .where(eq(seasonCoaches.id, tx.seasonCoachId));
      break;
    }

    case "P2P_TRADE": {
      // Parse TC metadata from notes if present
      let tcMeta: { team1: { rosterId: number; originalTC: boolean; tcCost: number }[]; team2: { rosterId: number; originalTC: boolean; tcCost: number }[]; team2BudgetChange: number } | null = null;
      const notesStr = tx.notes as string | null;
      if (notesStr) {
        const tcMetaIdx = notesStr.indexOf("__TC_META__");
        if (tcMetaIdx !== -1) {
          try {
            tcMeta = JSON.parse(notesStr.substring(tcMetaIdx + "__TC_META__".length));
          } catch { /* ignore parse errors */ }
        }
      }

      // Reverse the trade - swap Pokemon back
      const rostersMoved = await db.query.rosters.findMany({
        where: eq(rosters.acquiredTransactionId, transactionId),
      });

      // Build a map of TC changes to revert (rosterId -> original values)
      const tcRevertMap = new Map<number, { originalTC: boolean; tcCost: number }>();
      if (tcMeta) {
        for (const tc of tcMeta.team1) {
          tcRevertMap.set(tc.rosterId, { originalTC: tc.originalTC, tcCost: tc.tcCost });
        }
        for (const tc of tcMeta.team2) {
          tcRevertMap.set(tc.rosterId, { originalTC: tc.originalTC, tcCost: tc.tcCost });
        }
      }

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

        // Revert TC changes if applicable
        const tcRevert = tcRevertMap.get(roster.id);
        const tcFields = tcRevert
          ? {
              isTeraCaptain: tcRevert.originalTC,
              price: tcRevert.originalTC
                ? roster.price + tcRevert.tcCost   // was TC originally, current price has TC removed, add it back
                : roster.price - tcRevert.tcCost,  // was not TC originally, current price has TC added, remove it
            }
          : {};

        await db
          .update(rosters)
          .set({
            seasonCoachId: originalOwnerId,
            acquiredWeek: null,
            acquiredVia: null,
            acquiredTransactionId: null,
            ...tcFields,
          })
          .where(eq(rosters.id, roster.id));
      }

      // Reverse budget changes for primary team
      await db
        .update(seasonCoaches)
        .set({
          remainingBudget: (primaryTeam.remainingBudget || 0) - (tx.budgetChange || 0),
        })
        .where(eq(seasonCoaches.id, tx.seasonCoachId));

      // Reverse budget changes for trading partner
      if (tx.tradingPartnerSeasonCoachId) {
        const partnerTeam = await db.query.seasonCoaches.findFirst({
          where: eq(seasonCoaches.id, tx.tradingPartnerSeasonCoachId),
        });
        if (partnerTeam) {
          // team2NetChange = -(budgetChange - team1TCBudgetChange) + team2TCBudgetChange
          // To reverse, subtract team2NetChange from current partner budget
          const team1TCBudgetChange = tcMeta ? tcMeta.team1.reduce((sum: number, tc: { originalTC: boolean; tcCost: number }) => sum + (tc.originalTC ? tc.tcCost : -tc.tcCost), 0) : 0;
          const team2TCBudgetChange = tcMeta?.team2BudgetChange ?? 0;
          const team2NetChange = -(tx.budgetChange || 0) + team1TCBudgetChange + team2TCBudgetChange;
          await db
            .update(seasonCoaches)
            .set({
              remainingBudget: (partnerTeam.remainingBudget || 0) - team2NetChange,
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
      if (tx.budgetChange) {
        await db
          .update(seasonCoaches)
          .set({
            remainingBudget: (primaryTeam.remainingBudget || 0) - (tx.budgetChange || 0),
          })
          .where(eq(seasonCoaches.id, tx.seasonCoachId));
      }
      break;
    }

    default:
      throw new Error(`Unknown transaction type: ${tx.type}`);
  }

  // Delete the transaction record
  await db.delete(transactions).where(eq(transactions.id, transactionId));

  return { success: true };
}
