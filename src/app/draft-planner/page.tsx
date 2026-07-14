import { db } from "@/lib/db";
import { coaches, seasonCoaches, pokemon, seasonPokemonPrices, seasons } from "@/lib/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { DraftPlanner } from "./draft-planner";
import { getSeasonPokemonMovesMap, movesForSeasonPokemon } from "@/lib/season-pokemon-moves";
import { customPokemonAliasesForRow, getPokemonAliasMaps } from "@/lib/pokemon-name-aliases";
import { isHiddenPublicPokemonForm } from "@/lib/pokemon-name-utils";

interface PageProps {
  searchParams: Promise<{ coach?: string; season?: string }>;
}

type SeasonCoachWithRoster = {
  id: number;
  coachId: number;
  teamName: string;
  teamLogoUrl: string | null;
  division: {
    id: number;
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
  const [allPokemon, allMoves, allAbilities, allSeasons, urlSeasonPrices, aliasMaps, allDivisions] = await Promise.all([
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
      columns: { id: true, seasonNumber: true, name: true, draftBudget: true },
      orderBy: desc(seasons.seasonNumber),
    }),
    // Fetch prices in parallel if seasonId is known from URL
    seasonIdParam
      ? db.query.seasonPokemonPrices.findMany({
          columns: { pokemonId: true, price: true, teraCaptainCost: true, complexBanReason: true },
          where: eq(seasonPokemonPrices.seasonId, seasonIdParam),
        })
      : Promise.resolve([]),
    getPokemonAliasMaps(),
    db.query.divisions.findMany({
      columns: { id: true, name: true, seasonId: true, displayOrder: true },
      with: {
        seasonCoaches: {
          columns: { coachId: true, teamName: true },
        },
      },
    }),
  ]);

  // Coach-specific queries (only if coachId provided)
  let coach = null;
  let allSeasonCoaches: SeasonCoachWithRoster[] = [];

  if (coachId) {
    [coach, allSeasonCoaches] = await Promise.all([
      db.query.coaches.findFirst({
        columns: { id: true, name: true },
        where: eq(coaches.id, coachId),
      }),
      db.query.seasonCoaches.findMany({
        columns: {
          id: true,
          coachId: true,
          teamName: true,
          teamLogoUrl: true,
        },
        where: eq(seasonCoaches.coachId, coachId),
        with: {
          division: {
            columns: { id: true },
            with: { season: { columns: { id: true, draftBudget: true } } },
          },
          rosters: {
            columns: { id: true, pokemonId: true, price: true, isTeraCaptain: true, draftOrder: true },
            with: {
              pokemon: {
                columns: {
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
              },
            },
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
            columns: { pokemonId: true, price: true, teraCaptainCost: true, complexBanReason: true },
            where: eq(seasonPokemonPrices.seasonId, selectedSeasonId),
          })
        : [];
  const seasonMoves = selectedSeasonId
    ? await getSeasonPokemonMovesMap(selectedSeasonId)
    : new Map<number, string[]>();

  const allPokemonForSeason = allPokemon
    .filter((poke) => !isHiddenPublicPokemonForm(poke.name, poke.displayName))
    .map((poke) => ({
    ...poke,
    nameAliases: customPokemonAliasesForRow(poke, aliasMaps),
    moves: movesForSeasonPokemon(poke.id, poke.moves, seasonMoves),
    }));

  if (rosterData.length > 0) {
    rosterData = rosterData.map((poke) => ({
      ...poke,
      moves: movesForSeasonPokemon(poke.pokemonId, poke.moves, seasonMoves),
    }));
  }

  // Season/division/team directory for the header selectors
  const sortedDivisions = [...allDivisions].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const plannerDivisions = sortedDivisions.map((d) => ({ id: d.id, name: d.name, seasonId: d.seasonId }));
  const plannerTeams = sortedDivisions
    .flatMap((d) =>
      d.seasonCoaches.map((sc) => ({
        coachId: sc.coachId,
        teamName: sc.teamName,
        divisionId: d.id,
        seasonId: d.seasonId,
      }))
    )
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
  const currentDivisionId = selectedSeasonCoach?.division?.id ?? null;

  // Drafted Pokemon per division of the selected season, for the opt-in
  // availability filter (planning with drafted mons stays allowed by default)
  const seasonDivisionIds = plannerDivisions.filter((d) => d.seasonId === selectedSeasonId).map((d) => d.id);
  const draftedSeasonCoaches =
    seasonDivisionIds.length > 0
      ? await db.query.seasonCoaches.findMany({
          where: inArray(seasonCoaches.divisionId, seasonDivisionIds),
          columns: { divisionId: true, teamName: true, teamAbbreviation: true, teamLogoUrl: true },
          with: { rosters: { columns: { pokemonId: true } } },
        })
      : [];
  const draftedByDivision: Record<number, { pokemonId: number; team: string; logo: string | null }[]> = {};
  for (const sc of draftedSeasonCoaches) {
    const abbreviation =
      sc.teamAbbreviation ||
      sc.teamName
        .split(/\s+/)
        .map((word) => word[0])
        .join("")
        .slice(0, 3)
        .toUpperCase();
    if (!draftedByDivision[sc.divisionId]) draftedByDivision[sc.divisionId] = [];
    draftedByDivision[sc.divisionId].push(
      ...sc.rosters.map((r) => ({ pokemonId: r.pokemonId, team: abbreviation, logo: sc.teamLogoUrl }))
    );
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
      // Remount on preset changes so slots re-initialize from the newly
      // resolved roster (or the saved plan on a blank load).
      key={`${coach?.id ?? "none"}-${selectedSeasonId ?? "none"}`}
      coach={coach || null}
      divisions={plannerDivisions}
      teams={plannerTeams}
      draftedByDivision={draftedByDivision}
      currentDivisionId={currentDivisionId}
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
