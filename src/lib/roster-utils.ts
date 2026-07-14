import { db } from "@/lib/db";
import { pokemon } from "@/lib/schema";
import { inArray } from "drizzle-orm";

interface RosterEntry {
  id: number;
  pokemonId: number;
  seasonCoachId: number;
  acquiredWeek: number | null;
  acquiredVia: string | null;
  isTeraCaptain: boolean | null;
  pokemon: {
    id: number;
    name: string;
    displayName: string | null;
    spriteUrl: string | null;
    types: string[] | null;
    abilities: { name: string; isHidden: boolean }[] | null;
    hp: number | null;
    attack: number | null;
    defense: number | null;
    specialAttack: number | null;
    specialDefense: number | null;
    speed: number | null;
    baseStatTotal: number | null;
    moves: string[] | null;
  } | null;
}

export interface TimeSyncTransaction {
  id: number;
  type: string;
  week: number;
  seasonCoachId: number;
  tradingPartnerSeasonCoachId?: number | null;
  pokemonIn: number[] | null;
  pokemonOut: number[] | null;
  newTeraCaptainId: number | null;
  oldTeraCaptainId: number | null;
}

interface Pokemon {
  id: number;
  name: string;
  displayName: string | null;
  spriteUrl: string | null;
  types: string[] | null;
  abilities: { name: string; isHidden: boolean }[] | null;
  hp: number | null;
  attack: number | null;
  defense: number | null;
  specialAttack: number | null;
  specialDefense: number | null;
  speed: number | null;
  baseStatTotal: number | null;
  moves: string[] | null;
}

/**
 * Get time-synced roster for a coach at a specific match week.
 * Handles transactions to show the correct roster composition and Tera Captain at the time of the match.
 *
 * @param seasonCoachId - The coach's season ID
 * @param matchWeek - The week of the match
 * @param currentRosters - All roster entries for the coach
 * @param coachTransactions - All transactions for this coach (optional, for optimization)
 */
export async function getTimeSyncedRoster(
  seasonCoachId: number,
  matchWeek: number,
  currentRosters: RosterEntry[],
  coachTransactions?: TimeSyncTransaction[]
): Promise<{
  filteredRosters: RosterEntry[];
  droppedPokemonDetails: (Pokemon & { isTeraCaptain: boolean })[];
}> {
  // Use provided transactions or fetch them
  // Normalize P2P trades where this coach is the trading partner:
  // flip pokemonIn/pokemonOut so they represent this coach's perspective
  const txs = (coachTransactions || []).map(tx => {
    if (tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId === seasonCoachId && tx.seasonCoachId !== seasonCoachId) {
      return { ...tx, pokemonIn: tx.pokemonOut, pokemonOut: tx.pokemonIn };
    }
    return tx;
  });

  // Filter rosters to only show Pokemon acquired before or during match week
  let filteredRosters = currentRosters.filter((r) => {
    if (!r.acquiredWeek) return true; // Original draft, always show
    return r.acquiredWeek <= matchWeek;
  });

  // Time-sync Tera Captain status based on TERA_SWAP transactions
  // Start with current TC set from roster (this is the FINAL state after all swaps)
  const teraCaptainIds = new Set<number>(
    currentRosters.filter((r) => r.isTeraCaptain).map((r) => r.pokemonId)
  );

  // Get future transactions that affected TC status (week > matchWeek) and reverse them
  // This includes TERA_SWAP and FA_SWAP/FA_DROP that removed a TC (oldTeraCaptainId set)
  const futureTeraChanges = txs
    .filter((tx) => tx.week > matchWeek && (tx.type === "TERA_SWAP" || tx.oldTeraCaptainId || tx.newTeraCaptainId))
    .sort((a, b) => b.week !== a.week ? b.week - a.week : b.id - a.id); // Sort descending

  // Reverse each future change to get the state at matchWeek
  for (const tx of futureTeraChanges) {
    if (tx.newTeraCaptainId) {
      teraCaptainIds.delete(tx.newTeraCaptainId);
    }
    if (tx.oldTeraCaptainId) {
      teraCaptainIds.add(tx.oldTeraCaptainId);
    }
  }

  // Update isTeraCaptain on filtered rosters
  filteredRosters = filteredRosters.map((r) => ({
    ...r,
    isTeraCaptain: teraCaptainIds.has(r.pokemonId),
  }));

  // Find Pokemon dropped/traded away after this match's week (should still show in roster)
  // But only if they were acquired before or during matchWeek
  const droppedPokemonIds: number[] = [];
  for (const tx of txs) {
    if ((tx.type === "FA_DROP" || tx.type === "FA_SWAP" || tx.type === "P2P_TRADE") && tx.week > matchWeek) {
      const pokemonOut = tx.pokemonOut;
      if (pokemonOut) {
        for (const pokemonId of pokemonOut) {
          // Find when this Pokemon was acquired (if via transaction) BEFORE this drop/trade
          // This handles re-acquisitions correctly - only look at acquisitions before this drop
          const acquisitionTx = txs.find(t =>
            (t.type === "FA_PICKUP" || t.type === "FA_SWAP" || t.type === "P2P_TRADE") &&
            t.week < tx.week &&
            t.pokemonIn?.includes(pokemonId)
          );

          if (acquisitionTx) {
            // Acquired via transaction - only show if acquired <= matchWeek
            if (acquisitionTx.week <= matchWeek) {
              droppedPokemonIds.push(pokemonId);
            }
          } else {
            // Not acquired via transaction = drafted
            // Check if there was a prior drop/trade <= matchWeek (meaning it was gone before)
            const priorDrop = txs.find(t =>
              (t.type === "FA_DROP" || t.type === "FA_SWAP" || t.type === "P2P_TRADE") &&
              t.week <= matchWeek &&
              t.id !== tx.id &&
              t.pokemonOut?.includes(pokemonId)
            );
            if (!priorDrop) {
              droppedPokemonIds.push(pokemonId);
            }
          }
        }
      }
    }
  }

  // Fetch dropped Pokemon details with TC status
  let droppedPokemonDetails: (Pokemon & { isTeraCaptain: boolean })[] = [];
  if (droppedPokemonIds.length > 0) {
    const rawDropped = await db.query.pokemon.findMany({
      where: inArray(pokemon.id, droppedPokemonIds),
    }) as Pokemon[];
    droppedPokemonDetails = rawDropped.map(p => ({
      ...p,
      isTeraCaptain: teraCaptainIds.has(p.id),
    }));
  }

  return { filteredRosters, droppedPokemonDetails };
}

/**
 * Sort roster by price (highest first), with Tera Captains at the top
 */
export function sortRosterByPrice(
  rosters: RosterEntry[],
  priceMap: Map<number, number>,
  teraCostMap: Map<number, number | null>
): RosterEntry[] {
  return [...rosters].sort((a, b) => {
    const priceA = priceMap.get(a.pokemonId) || 0;
    const priceB = priceMap.get(b.pokemonId) || 0;
    const tcCostA = a.isTeraCaptain ? (teraCostMap.get(a.pokemonId) || 0) : 0;
    const tcCostB = b.isTeraCaptain ? (teraCostMap.get(b.pokemonId) || 0) : 0;
    return (priceB + tcCostB) - (priceA + tcCostA);
  });
}
