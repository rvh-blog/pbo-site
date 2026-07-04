import { db } from "@/lib/db";
import { coaches, seasonCoaches, pokemon, seasonPokemonPrices, seasons } from "@/lib/schema";
import { eq, desc } from "drizzle-orm";
import { DraftPlanner } from "./draft-planner";
import { getSeasonPokemonMovesMap, movesForSeasonPokemon } from "@/lib/season-pokemon-moves";

interface PageProps {
  searchParams: Promise<{ coach?: string; season?: string }>;
}

type SeasonCoachWithRoster = {
  id: number;
  coachId: number;
  teamName: string;
  teamLogoUrl: string | null;
  division: {
    season: {
      id: number;
      draftBudget: number | null;
    } | null;
  } | null;
  rosters: Array<{
    id: number;
    pokemonId: number;
    price: number;
    isTeraCaptain: boolean | null;
    draftOrder: number | null;
    pokemon: {
      name: string;
      displayName: string | null;
      spriteUrl: string | null;
      artworkUrl: string | null;
      types: string[] | null;
      abilities: Array<{ name: string; isHidden: boolean }> | null;
      moves: string[] | null;
      hp: number | null;
      attack: number | null;
      defense: number | null;
      specialAttack: number | null;
      specialDefense: number | null;
      speed: number | null;
      baseStatTotal: number | null;
    } | null;
  }>;
};

type DraftPlannerRosterPokemon = {
  rosterId: number;
  pokemonId: number;
  name: string;
  displayName: string;
  spriteUrl: string | null;
  artworkUrl: string | null;
  types: string[];
  abilities: Array<{ name: string; isHidden: boolean }>;
  moves: string[];
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
  price: number;
  isTeraCaptain: boolean;
  draftOrder: number | null;
};

export default async function DraftPlannerPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const coachId = resolvedSearchParams.coach ? parseInt(resolvedSearchParams.coach) : null;
  const seasonIdParam = resolvedSearchParams.season ? parseInt(resolvedSearchParams.season) : null;

  // Run base queries in parallel (include season prices if seasonId is in URL)
  const [allPokemon, allMoves, allAbilities, allSeasons, urlSeasonPrices] = await Promise.all([
    db.query.pokemon.findMany({
      columns: {
        id: true,
        name: true,
        displayName: true,
        spriteUrl: true,
        artworkUrl: true,
        types: true,
        abilities: true,
        moves: true,
        hp: true,
        attack: true,
        defense: true,
        specialAttack: true,
        specialDefense: true,
        speed: true,
        baseStatTotal: true,
      },
      orderBy: pokemon.displayName,
    }),
    db.query.moves.findMany({
      columns: {
        name: true,
        type: true,
      },
    }),
    db.query.abilities.findMany({
      columns: {
        name: true,
        shortEffect: true,
      },
    }),
    db.query.seasons.findMany({
      orderBy: desc(seasons.seasonNumber),
    }),
    // Fetch prices in parallel if seasonId is known from URL
    seasonIdParam
      ? db.query.seasonPokemonPrices.findMany({
          where: eq(seasonPokemonPrices.seasonId, seasonIdParam),
        })
      : Promise.resolve([]),
  ]);

  // Coach-specific queries (only if coachId provided)
  let coach = null;
  let allSeasonCoaches: SeasonCoachWithRoster[] = [];

  if (coachId) {
    [coach, allSeasonCoaches] = await Promise.all([
      db.query.coaches.findFirst({
        where: eq(coaches.id, coachId),
      }),
      db.query.seasonCoaches.findMany({
        where: eq(seasonCoaches.coachId, coachId),
        with: {
          division: {
            with: { season: true },
          },
          rosters: {
            with: { pokemon: true },
          },
        },
        orderBy: desc(seasonCoaches.id),
      }),
    ]);
  }

  // Determine which season to use for prices
  let selectedSeasonId = seasonIdParam;
  let selectedSeasonCoach: SeasonCoachWithRoster | null = null;
  let rosterData: DraftPlannerRosterPokemon[] = [];
  let teamName = "";
  let teamLogo: string | null = null;
  let draftBudget = 120;

  if (coachId && coach && allSeasonCoaches.length > 0) {
    // Find the appropriate season coach
    selectedSeasonCoach = allSeasonCoaches[0];
    if (seasonIdParam) {
      const found = allSeasonCoaches.find((sc) => sc.division?.season?.id === seasonIdParam);
      if (found) {
        selectedSeasonCoach = found;
      }
    }

    selectedSeasonId = selectedSeasonCoach.division?.season?.id || null;
    teamName = selectedSeasonCoach.teamName;
    teamLogo = selectedSeasonCoach.teamLogoUrl;
    draftBudget = selectedSeasonCoach.division?.season?.draftBudget || 120;

    // Build roster data
    rosterData = selectedSeasonCoach.rosters.map((r) => {
      const poke = r.pokemon;
      return {
        rosterId: r.id,
        pokemonId: r.pokemonId,
        name: poke?.name || "",
        displayName: poke?.displayName || poke?.name || "",
        spriteUrl: poke?.spriteUrl || null,
        artworkUrl: poke?.artworkUrl || null,
        types: poke?.types || [],
        abilities: poke?.abilities || [],
        moves: poke?.moves || [],
        hp: poke?.hp || 0,
        attack: poke?.attack || 0,
        defense: poke?.defense || 0,
        specialAttack: poke?.specialAttack || 0,
        specialDefense: poke?.specialDefense || 0,
        speed: poke?.speed || 0,
        baseStatTotal: poke?.baseStatTotal || 0,
        price: r.price,
        isTeraCaptain: r.isTeraCaptain || false,
        draftOrder: r.draftOrder,
      };
    });

    // Sort by draft order
    rosterData.sort((a, b) => (a.draftOrder || 999) - (b.draftOrder || 999));
  } else {
    // No coach - use latest season for prices and budget
    if (!selectedSeasonId && allSeasons.length > 0) {
      selectedSeasonId = allSeasons[0].id;
      draftBudget = allSeasons[0].draftBudget || 120;
    }
  }

  // Use pre-fetched prices if available, otherwise fetch now
  const seasonPricesData =
    selectedSeasonId === seasonIdParam
      ? urlSeasonPrices // Already fetched in parallel
      : selectedSeasonId
        ? await db.query.seasonPokemonPrices.findMany({
            where: eq(seasonPokemonPrices.seasonId, selectedSeasonId),
          })
        : [];
  const seasonMoves = selectedSeasonId
    ? await getSeasonPokemonMovesMap(selectedSeasonId)
    : new Map<number, string[]>();

  const allPokemonForSeason = allPokemon.map((poke) => ({
    ...poke,
    moves: movesForSeasonPokemon(poke.id, poke.moves, seasonMoves),
  }));

  if (rosterData.length > 0) {
    rosterData = rosterData.map((poke) => ({
      ...poke,
      moves: movesForSeasonPokemon(poke.pokemonId, poke.moves, seasonMoves),
    }));
  }

  // Build price lookup
  const seasonPrices: Record<number, { price: number; teraCaptainCost: number | null; complexBanReason: string | null }> = {};
  for (const sp of seasonPricesData) {
    seasonPrices[sp.pokemonId] = {
      price: sp.price,
      teraCaptainCost: sp.teraCaptainCost,
      complexBanReason: sp.complexBanReason,
    };
  }

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

  return (
    <DraftPlanner
      coach={coach || null}
      teamName={teamName}
      teamLogo={teamLogo}
      roster={rosterData}
      draftBudget={draftBudget}
      allPokemon={allPokemonForSeason}
      moveTypes={moveTypes}
      abilityDescriptions={abilityDescriptions}
      seasonPrices={seasonPrices}
      allSeasons={allSeasons}
      currentSeasonId={selectedSeasonId}
    />
  );
}
