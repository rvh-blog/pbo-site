import { db } from "@/lib/db";
import type { Metadata } from "next";
/* eslint-disable @typescript-eslint/no-explicit-any -- Existing matchup prep data shaping uses broad Drizzle result objects. */
import {
  seasons,
  matches,
  seasonCoaches,
  transactions,
  seasonPokemonPrices,
  abilities,
  moves,
  coachPurchases,
  storeItems,
  matchPokemon,
} from "@/lib/schema";
import { eq, desc, and, or, inArray } from "drizzle-orm";
import { MatchupPrepClient } from "./matchup-prep-client";
import { getTimeSyncedRoster } from "@/lib/roster-utils";
import { getSeasonPokemonMovesMap, movesForSeasonPokemon } from "@/lib/season-pokemon-moves";
import { pokemonNameKey } from "@/lib/pokemon-name-utils";
import { getDistinctHeldItemNames } from "@/lib/revealed-items";

export const metadata: Metadata = {
  title: "Match Prep",
  description: "Compare PBO rosters, speeds, moves, abilities, and matchup notes for an upcoming battle.",
  alternates: { canonical: "/matchup-prep" },
};

export const dynamic = "force-dynamic";

type PokemonAbility = { name: string; isHidden: boolean };

// PokeAPI stores event-only abilities on separate form records even when PBO
// drafts the base species. Include those legal options on matchup-prep cards.
const EVENT_ABILITIES_BY_POKEMON: Record<string, PokemonAbility[]> = {
  greninja: [{ name: "battle-bond", isHidden: false }],
};

function abilitiesForMatchupPrep(
  pokemonName: string,
  abilities: PokemonAbility[] | null | undefined
): PokemonAbility[] {
  const combined = [...(abilities || [])];
  const knownAbilityNames = new Set(combined.map((ability) => ability.name.toLowerCase()));

  for (const eventAbility of EVENT_ABILITIES_BY_POKEMON[pokemonNameKey(pokemonName)] || []) {
    if (!knownAbilityNames.has(eventAbility.name.toLowerCase())) {
      combined.push(eventAbility);
    }
  }

  return combined;
}

interface PageProps {
  searchParams: Promise<{
    matchId?: string;
    seasonId?: string;
    divisionId?: string;
  }>;
}

export default async function MatchupPrepPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const matchId = params.matchId ? parseInt(params.matchId) : null;

  // Parallel fetch: base data AND match data (if matchId provided)
  const [allSeasons, allPrices, allAbilities, allMoves, match] = await Promise.all([
    db.query.seasons.findMany({
      where: eq(seasons.isPublic, true),
      with: { divisions: true },
      orderBy: [desc(seasons.seasonNumber)],
    }),
    db.query.seasonPokemonPrices.findMany(),
    db.query.abilities.findMany({
      columns: { name: true, shortEffect: true },
    }),
    db.query.moves.findMany({
      columns: { name: true, type: true },
    }),
    // Fetch match in parallel if matchId exists
    matchId
      ? db.query.matches.findFirst({
          where: eq(matches.id, matchId),
          with: {
            division: {
              with: { season: true },
            },
            coach1: {
              with: {
                coach: true,
                rosters: { with: { pokemon: true } },
              },
            },
            coach2: {
              with: {
                coach: true,
                rosters: { with: { pokemon: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  // Build move type lookup
  const moveTypes: Record<string, string> = {};
  for (const m of allMoves) {
    if (m.type) moveTypes[m.name] = m.type;
  }

  // Build ability description lookup
  const abilityDescriptions: Record<string, string> = {};
  for (const a of allAbilities) {
    if (a.shortEffect) abilityDescriptions[a.name] = a.shortEffect;
  }

  // If match found, fetch match-specific data
  let matchData = null;
  let coach1Roster: any[] = [];
  let coach2Roster: any[] = [];
  let coach1DroppedPokemon: any[] = [];
  let coach2DroppedPokemon: any[] = [];
  let divisionMatches: any[] = [];
  let revealedItemScouting: Record<"coach1" | "coach2", Array<{
    pokemonId: number;
    pokemonName: string;
    spriteUrl: string | null;
    items: Array<{ item: string; reveals: number }>;
  }>> = { coach1: [], coach2: [] };
  const teamSidePurchases: { coach1BlueTeam: boolean; coach1RedTeam: boolean; coach2BlueTeam: boolean; coach2RedTeam: boolean } = {
    coach1BlueTeam: false,
    coach1RedTeam: false,
    coach2BlueTeam: false,
    coach2RedTeam: false,
  };

  if (match) {
    // Get coach IDs for purchase lookup
    const coach1Id = match.coach1?.coach?.id;
    const coach2Id = match.coach2?.coach?.id;
    const coachIds = [coach1Id, coach2Id].filter((id): id is number => id !== undefined);

    // Fetch transactions, division matches, and coach purchases in parallel
    const [seasonTxs, divMatches, purchases, itemRows] = await Promise.all([
      db.query.transactions.findMany({
        where: eq(transactions.seasonId, match.seasonId),
      }),
      db.query.matches.findMany({
        where: eq(matches.divisionId, match.divisionId),
        with: {
          coach1: { with: { coach: true } },
          coach2: { with: { coach: true } },
        },
        orderBy: [matches.week, matches.id],
      }),
      // Fetch blue-team and red-team purchases for both coaches
      coachIds.length > 0
        ? db.query.coachPurchases.findMany({
            where: and(
              inArray(coachPurchases.coachId, coachIds),
              eq(coachPurchases.isActive, true)
            ),
            with: {
              item: true,
            },
          })
        : Promise.resolve([]),
      db.query.matchPokemon.findMany({
        where: inArray(matchPokemon.seasonCoachId, [
          match.coach1SeasonId,
          match.coach2SeasonId,
        ]),
        columns: {
          seasonCoachId: true,
          pokemonId: true,
          revealedItems: true,
        },
        with: {
          pokemon: {
            columns: { name: true, displayName: true, spriteUrl: true },
          },
          match: {
            columns: { seasonId: true, week: true },
          },
        },
      }),
    ]);

    const buildItemScouting = (seasonCoachId: number) => {
      const pokemonMap = new Map<number, {
        pokemonId: number;
        pokemonName: string;
        spriteUrl: string | null;
        itemCounts: Map<string, { item: string; reveals: number }>;
      }>();

      for (const row of itemRows) {
        if (
          row.seasonCoachId !== seasonCoachId ||
          row.match?.seasonId !== match.seasonId ||
          row.match.week >= match.week ||
          !row.revealedItems?.length
        ) continue;

        let entry = pokemonMap.get(row.pokemonId);
        if (!entry) {
          entry = {
            pokemonId: row.pokemonId,
            pokemonName: row.pokemon?.displayName || row.pokemon?.name || "Unknown",
            spriteUrl: row.pokemon?.spriteUrl || null,
            itemCounts: new Map(),
          };
          pokemonMap.set(row.pokemonId, entry);
        }

        for (const item of getDistinctHeldItemNames(row.revealedItems)) {
          const key = item.toLowerCase();
          const existing = entry.itemCounts.get(key);
          if (existing) existing.reveals += 1;
          else entry.itemCounts.set(key, { item, reveals: 1 });
        }
      }

      return Array.from(pokemonMap.values())
        .map(({ itemCounts, ...entry }) => ({
          ...entry,
          items: Array.from(itemCounts.values()).sort((a, b) => b.reveals - a.reveals),
        }))
        .sort((a, b) => b.items.reduce((sum, item) => sum + item.reveals, 0) -
          a.items.reduce((sum, item) => sum + item.reveals, 0));
    };

    revealedItemScouting = {
      coach1: buildItemScouting(match.coach1SeasonId),
      coach2: buildItemScouting(match.coach2SeasonId),
    };

    // Process team side purchases
    for (const purchase of purchases) {
      if (purchase.item?.slug === "blue-team") {
        if (purchase.coachId === coach1Id) teamSidePurchases.coach1BlueTeam = true;
        if (purchase.coachId === coach2Id) teamSidePurchases.coach2BlueTeam = true;
      }
      if (purchase.item?.slug === "red-team") {
        if (purchase.coachId === coach1Id) teamSidePurchases.coach1RedTeam = true;
        if (purchase.coachId === coach2Id) teamSidePurchases.coach2RedTeam = true;
      }
    }

    // Filter transactions for each coach (include partner P2P trades — getTimeSyncedRoster handles the pokemonIn/Out swap)
    const coach1Txs = [
      ...seasonTxs.filter((tx) => tx.seasonCoachId === match.coach1SeasonId),
      ...seasonTxs.filter((tx) => tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId === match.coach1SeasonId),
    ];
    const coach2Txs = [
      ...seasonTxs.filter((tx) => tx.seasonCoachId === match.coach2SeasonId),
      ...seasonTxs.filter((tx) => tx.type === "P2P_TRADE" && tx.tradingPartnerSeasonCoachId === match.coach2SeasonId),
    ];

    // Get time-synced rosters in parallel
    const [coach1Result, coach2Result] = await Promise.all([
      getTimeSyncedRoster(
        match.coach1SeasonId,
        match.week,
        match.coach1?.rosters || [],
        coach1Txs as any
      ),
      getTimeSyncedRoster(
        match.coach2SeasonId,
        match.week,
        match.coach2?.rosters || [],
        coach2Txs as any
      ),
    ]);

    coach1Roster = coach1Result.filteredRosters;
    coach2Roster = coach2Result.filteredRosters;
    coach1DroppedPokemon = coach1Result.droppedPokemonDetails;
    coach2DroppedPokemon = coach2Result.droppedPokemonDetails;
    divisionMatches = divMatches;

    const getTeamRecord = (seasonCoachId: number) => divMatches.reduce(
      (record, divisionMatch) => {
        if (
          divisionMatch.winnerId !== null &&
          (divisionMatch.coach1SeasonId === seasonCoachId ||
            divisionMatch.coach2SeasonId === seasonCoachId)
        ) {
          if (divisionMatch.winnerId === seasonCoachId) record.wins += 1;
          else record.losses += 1;
        }
        return record;
      },
      { wins: 0, losses: 0 }
    );

    matchData = {
      id: match.id,
      week: match.week,
      seasonId: match.seasonId,
      divisionId: match.divisionId,
      divisionName: match.division?.name || "",
      seasonName: match.division?.season?.name || "",
      coach1: {
        seasonCoachId: match.coach1SeasonId,
        coachId: match.coach1?.coach?.id,
        coachName: match.coach1?.coach?.name || "Unknown",
        teamName: match.coach1?.teamName || "Unknown",
        teamAbbreviation: match.coach1?.teamAbbreviation || "",
        teamLogoUrl: match.coach1?.teamLogoUrl,
        record: getTeamRecord(match.coach1SeasonId),
      },
      coach2: {
        seasonCoachId: match.coach2SeasonId,
        coachId: match.coach2?.coach?.id,
        coachName: match.coach2?.coach?.name || "Unknown",
        teamName: match.coach2?.teamName || "Unknown",
        teamAbbreviation: match.coach2?.teamAbbreviation || "",
        teamLogoUrl: match.coach2?.teamLogoUrl,
        record: getTeamRecord(match.coach2SeasonId),
      },
    };
  }

  const seasonMoves = matchData
    ? await getSeasonPokemonMovesMap(matchData.seasonId)
    : new Map<number, string[]>();

  // Build price lookup maps
  const pricesBySeasonPokemon = new Map<string, { price: number; teraCost: number | null }>();
  for (const p of allPrices) {
    pricesBySeasonPokemon.set(`${p.seasonId}-${p.pokemonId}`, {
      price: p.price,
      teraCost: p.teraCaptainCost,
    });
  }

  // Format seasons for client (include schedule visibility)
  const seasonsData = allSeasons.map((s) => ({
    id: s.id,
    name: s.name,
    seasonNumber: s.seasonNumber,
    isSchedulePublic: s.isSchedulePublic ?? true,
    divisions: s.divisions.map((d) => ({
      id: d.id,
      name: d.name,
      logoUrl: d.logoUrl,
    })),
  }));

  // Format matches for client
  const matchesData = divisionMatches.map((m) => ({
    id: m.id,
    week: m.week,
    coach1Name: m.coach1?.coach?.name || "Unknown",
    coach2Name: m.coach2?.coach?.name || "Unknown",
    coach1TeamName: m.coach1?.teamName || "Unknown",
    coach2TeamName: m.coach2?.teamName || "Unknown",
    winnerId: m.winnerId,
  }));

  // Format roster data for client
  const formatRoster = (rosters: any[], seasonId: number) =>
    rosters.map((r) => {
      const priceData = pricesBySeasonPokemon.get(`${seasonId}-${r.pokemonId}`);
      return {
        id: r.id,
        pokemonId: r.pokemonId,
        isTeraCaptain: r.isTeraCaptain || false,
        price: priceData?.price || 0,
        teraCost: priceData?.teraCost || 0,
        pokemon: r.pokemon
          ? {
              id: r.pokemon.id,
              name: r.pokemon.name,
              displayName: r.pokemon.displayName,
              spriteUrl: r.pokemon.spriteUrl,
              types: r.pokemon.types || [],
              abilities: abilitiesForMatchupPrep(r.pokemon.name, r.pokemon.abilities),
              hp: r.pokemon.hp || 0,
              attack: r.pokemon.attack || 0,
              defense: r.pokemon.defense || 0,
              specialAttack: r.pokemon.specialAttack || 0,
              specialDefense: r.pokemon.specialDefense || 0,
              speed: r.pokemon.speed || 0,
              baseStatTotal: r.pokemon.baseStatTotal || 0,
              moves: movesForSeasonPokemon(r.pokemon.id, r.pokemon.moves, seasonMoves),
            }
          : null,
      };
    });

  const formatDroppedPokemon = (pokemon: any[], seasonId: number) =>
    pokemon.map((p) => {
      const priceData = pricesBySeasonPokemon.get(`${seasonId}-${p.id}`);
      return {
        id: p.id,
        name: p.name,
        displayName: p.displayName,
        spriteUrl: p.spriteUrl,
        types: p.types || [],
        abilities: abilitiesForMatchupPrep(p.name, p.abilities),
        hp: p.hp || 0,
        attack: p.attack || 0,
        defense: p.defense || 0,
        specialAttack: p.specialAttack || 0,
        specialDefense: p.specialDefense || 0,
        speed: p.speed || 0,
        baseStatTotal: p.baseStatTotal || 0,
        moves: movesForSeasonPokemon(p.id, p.moves, seasonMoves),
        price: priceData?.price || 0,
        teraCost: priceData?.teraCost || 0,
        isDropped: false,
        isTeraCaptain: p.isTeraCaptain || false,
      };
    });

  return (
    <MatchupPrepClient
      seasons={seasonsData}
      initialMatch={matchData}
      initialMatches={matchesData}
      coach1Roster={matchData ? formatRoster(coach1Roster, matchData.seasonId) : []}
      coach2Roster={matchData ? formatRoster(coach2Roster, matchData.seasonId) : []}
      coach1DroppedPokemon={matchData ? formatDroppedPokemon(coach1DroppedPokemon, matchData.seasonId) : []}
      coach2DroppedPokemon={matchData ? formatDroppedPokemon(coach2DroppedPokemon, matchData.seasonId) : []}
      abilityDescriptions={abilityDescriptions}
      moveTypes={moveTypes}
      teamSidePurchases={teamSidePurchases}
      revealedItemScouting={revealedItemScouting}
    />
  );
}
