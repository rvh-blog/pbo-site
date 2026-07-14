import { db } from "@/lib/db";
import { coaches, seasons, divisions, seasonCoaches, pokemon, moves } from "@/lib/schema";
import { and, like, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getPublicVisibilityState } from "@/lib/public-visibility";
import { customPokemonAliasesForRow, getPokemonAliasMaps, type PokemonAliasMaps } from "@/lib/pokemon-name-aliases";
import { isHiddenPublicPokemonForm, pokemonSearchAliases } from "@/lib/pokemon-name-utils";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim().toLowerCase();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const searchPattern = `%${query}%`;
  const visibility = await getPublicVisibilityState();
  const publicSeasonFilter = sql`${seasons.isPublic} IS NOT 0`;
  const publicDivisionFilter = visibility.hiddenDivisionNames.has("infinity")
    ? sql`lower(${divisions.name}) <> 'infinity'`
    : sql`1 = 1`;
  const exactCoachNameRank = sql`CASE WHEN lower(${coaches.name}) = ${query} THEN 0 ELSE 1 END`;
  const exactTeamNameRank = sql`CASE WHEN lower(${seasonCoaches.teamName}) = ${query} THEN 0 ELSE 1 END`;
  const currentSeasonRank = sql`CASE WHEN ${seasons.isCurrent} THEN 0 ELSE 1 END`;

  // Search coaches by name
  const coachByNameResults = await db
    .select({
      id: coaches.id,
      name: coaches.name,
    })
    .from(coaches)
    .where(like(sql`lower(${coaches.name})`, searchPattern))
    .orderBy(exactCoachNameRank, sql`${coaches.name} ASC`)
    .limit(5);

  // Search coaches by team name (find the coach who owns a matching team)
  const coachByTeamResults = await db
    .selectDistinct({
      id: coaches.id,
      name: coaches.name,
      teamName: seasonCoaches.teamName,
    })
    .from(seasonCoaches)
    .innerJoin(coaches, sql`${seasonCoaches.coachId} = ${coaches.id}`)
    .innerJoin(divisions, sql`${seasonCoaches.divisionId} = ${divisions.id}`)
    .innerJoin(seasons, sql`${divisions.seasonId} = ${seasons.id}`)
    .where(and(
      like(sql`lower(${seasonCoaches.teamName})`, searchPattern),
      publicSeasonFilter,
      publicDivisionFilter
    ))
    .orderBy(exactTeamNameRank, currentSeasonRank, sql`${seasons.seasonNumber} DESC`)
    .limit(5);

  // Merge coach results, prioritizing team name matches, then deduping
  const seenCoachIds = new Set<number>();
  const coachResults: { id: number; name: string; teamName?: string | null }[] = [];

  // Add coaches found by team name first (more relevant when searching team names)
  for (const c of coachByTeamResults) {
    if (!seenCoachIds.has(c.id)) {
      seenCoachIds.add(c.id);
      coachResults.push(c);
    }
  }
  // Then add coaches found by name
  for (const c of coachByNameResults) {
    if (!seenCoachIds.has(c.id)) {
      seenCoachIds.add(c.id);
      coachResults.push({ ...c, teamName: null });
    }
  }

  // Search teams (season_coaches with team names - for division links)
  const teamResults = await db
    .select({
      id: seasonCoaches.id,
      teamName: seasonCoaches.teamName,
      coachName: coaches.name,
      coachId: coaches.id,
      seasonId: seasons.id,
      seasonName: seasons.name,
      divisionId: divisions.id,
      divisionName: divisions.name,
    })
    .from(seasonCoaches)
    .innerJoin(coaches, sql`${seasonCoaches.coachId} = ${coaches.id}`)
    .innerJoin(divisions, sql`${seasonCoaches.divisionId} = ${divisions.id}`)
    .innerJoin(seasons, sql`${divisions.seasonId} = ${seasons.id}`)
    .where(and(
      like(sql`lower(${seasonCoaches.teamName})`, searchPattern),
      publicSeasonFilter,
      publicDivisionFilter
    ))
    .orderBy(exactTeamNameRank, currentSeasonRank, sql`${seasons.seasonNumber} DESC`)
    .limit(8);

  // Search seasons
  const seasonResults = await db
    .select({
      id: seasons.id,
      name: seasons.name,
      seasonNumber: seasons.seasonNumber,
    })
    .from(seasons)
    .where(and(
      like(sql`lower(${seasons.name})`, searchPattern),
      publicSeasonFilter
    ))
    .orderBy(
      sql`CASE WHEN lower(${seasons.name}) = ${query} THEN 0 ELSE 1 END`,
      currentSeasonRank,
      sql`${seasons.seasonNumber} DESC`
    )
    .limit(5);

  // Search divisions
  const divisionResults = await db
    .select({
      id: divisions.id,
      name: divisions.name,
      seasonId: seasons.id,
      seasonName: seasons.name,
    })
    .from(divisions)
    .innerJoin(seasons, sql`${divisions.seasonId} = ${seasons.id}`)
    .where(and(
      like(sql`lower(${divisions.name})`, searchPattern),
      publicSeasonFilter,
      publicDivisionFilter
    ))
    .orderBy(
      sql`CASE WHEN lower(${divisions.name}) = ${query} THEN 0 ELSE 1 END`,
      currentSeasonRank,
      sql`${seasons.seasonNumber} DESC`,
      sql`${divisions.displayOrder} ASC`
    )
    .limit(8);

  // Search Pokemon, including admin-configured aliases.
  const allPokemonForSearch = await db
    .select({
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      spriteUrl: pokemon.spriteUrl,
    })
    .from(pokemon);
  let aliasMaps: PokemonAliasMaps;
  try {
    aliasMaps = await getPokemonAliasMaps();
  } catch {
    // Older local databases may not have the optional custom alias tables yet.
    aliasMaps = {
      aliasKeyToCanonicalName: new Map(),
      pokemonIdToAliases: new Map(),
      collapseKeyToCanonicalName: new Map(),
      pokemonIdToCollapseSources: new Map(),
    };
  }
  const pokemonResults = allPokemonForSearch
    .filter((row) => !isHiddenPublicPokemonForm(row.name, row.displayName))
    .map((row) => ({
      ...row,
      aliases: [
        ...pokemonSearchAliases(row.name, row.displayName),
        ...customPokemonAliasesForRow(row, aliasMaps),
      ].map((alias) => alias.toLowerCase()),
    }))
    .filter((row) => row.aliases.some((alias) => alias.includes(query)))
    .sort((a, b) => {
      const aExact = a.aliases.some((alias) => alias === query) ? 0 : 1;
      const bExact = b.aliases.some((alias) => alias === query) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return (a.displayName || a.name).localeCompare(b.displayName || b.name);
    })
    .slice(0, 8);

  // Search for draft boards if query matches "draft"
  let draftResults: { id: number; name: string }[] = [];
  if ("draft".includes(query) || query.includes("draft")) {
    draftResults = await db
      .select({
        id: seasons.id,
        name: seasons.name,
      })
      .from(seasons)
      .where(publicSeasonFilter)
      .orderBy(sql`${seasons.seasonNumber} DESC`)
      .limit(10);
  }

  // Search for rosters pages if query matches "roster"
  let rosterResults: { divisionId: number; divisionName: string; seasonId: number; seasonName: string }[] = [];
  if ("roster".includes(query) || "rosters".includes(query) || query.includes("roster")) {
    rosterResults = await db
      .select({
        divisionId: divisions.id,
        divisionName: divisions.name,
        seasonId: seasons.id,
        seasonName: seasons.name,
      })
      .from(divisions)
      .innerJoin(seasons, sql`${divisions.seasonId} = ${seasons.id}`)
      .where(and(publicSeasonFilter, publicDivisionFilter))
      .orderBy(sql`${seasons.seasonNumber} DESC`, sql`${divisions.displayOrder} ASC`)
      .limit(12);
  }

  // Search for transactions pages if query matches "transaction"
  let transactionResults: { divisionId: number; divisionName: string; seasonId: number; seasonName: string }[] = [];
  if ("transaction".includes(query) || "transactions".includes(query) || query.includes("transaction")) {
    transactionResults = await db
      .select({
        divisionId: divisions.id,
        divisionName: divisions.name,
        seasonId: seasons.id,
        seasonName: seasons.name,
      })
      .from(divisions)
      .innerJoin(seasons, sql`${divisions.seasonId} = ${seasons.id}`)
      .where(and(publicSeasonFilter, publicDivisionFilter))
      .orderBy(sql`${seasons.seasonNumber} DESC`, sql`${divisions.displayOrder} ASC`)
      .limit(12);
  }

  // Search for power rankings if query matches
  let powerRankingsResult = false;
  const prKeywords = ["power ranking", "power rankings", "pr", "prs"];
  if (prKeywords.some(k => k.includes(query) || query.includes(k))) {
    powerRankingsResult = true;
  }

  // Search for broadcast overlay if query matches
  let broadcastResult = false;
  const broadcastKeywords = ["broadcast", "overlay", "obs", "stream"];
  if (broadcastKeywords.some(k => k.includes(query) || query.includes(k))) {
    broadcastResult = true;
  }

  // Search moves (lowest priority, so searched last)
  const moveResults = await db
    .select({
      id: moves.id,
      name: moves.name,
      displayName: moves.displayName,
      type: moves.type,
    })
    .from(moves)
    .where(
      or(
        like(sql`lower(${moves.name})`, searchPattern),
        like(sql`lower(${moves.displayName})`, searchPattern)
      )
    )
    .orderBy(sql`CASE WHEN lower(${moves.name}) = ${query} OR lower(${moves.displayName}) = ${query} THEN 0 ELSE 1 END`)
    .limit(8);

  return NextResponse.json({
    results: {
      coaches: coachResults.map((c) => ({
        type: "coach" as const,
        id: c.id,
        name: c.name,
        subtitle: c.teamName || undefined,
        href: `/coaches/${c.id}`,
      })),
      teams: teamResults.map((t) => ({
        type: "team" as const,
        id: t.id,
        name: t.teamName,
        subtitle: `${t.coachName} - ${t.seasonName} ${t.divisionName}`,
        href: `/seasons/${t.seasonId}/divisions/${t.divisionId}`,
      })),
      seasons: seasonResults.map((s) => ({
        type: "season" as const,
        id: s.id,
        name: s.name,
        href: `/seasons/${s.id}`,
      })),
      divisions: divisionResults.map((d) => ({
        type: "division" as const,
        id: d.id,
        name: d.name,
        subtitle: d.seasonName,
        href: `/seasons/${d.seasonId}/divisions/${d.id}`,
      })),
      pokemon: pokemonResults.map((p) => ({
        type: "pokemon" as const,
        id: p.id,
        name: p.displayName || p.name,
        sprite: p.spriteUrl,
        href: `/pokemon/${p.id}`,
      })),
      drafts: draftResults.map((s) => ({
        type: "draft" as const,
        id: s.id,
        name: `${s.name} Draft Board`,
        href: `/seasons/${s.id}/draft`,
      })),
      rosters: rosterResults.map((r) => ({
        type: "roster" as const,
        id: r.divisionId,
        name: `${r.divisionName} Rosters`,
        subtitle: r.seasonName,
        href: `/seasons/${r.seasonId}/divisions/${r.divisionId}/rosters`,
      })),
      transactions: transactionResults.map((t) => ({
        type: "transaction" as const,
        id: t.divisionId,
        name: `${t.divisionName} Transactions`,
        subtitle: t.seasonName,
        href: `/seasons/${t.seasonId}/divisions/${t.divisionId}/transactions`,
      })),
      moves: moveResults.map((m) => ({
        type: "move" as const,
        id: m.id,
        name: m.displayName || m.name,
        subtitle: m.type ? m.type.charAt(0).toUpperCase() + m.type.slice(1) : undefined,
        href: `/moves/${m.id}`,
      })),
      powerRankings: [
        ...(powerRankingsResult
          ? [
              {
                type: "powerRanking" as const,
                id: 0,
                name: "Power Rankings",
                subtitle: "Create YouTube-ready power ranking slideshows",
                href: "/power-rankings",
              },
            ]
          : []),
        ...(broadcastResult
          ? [
              {
                type: "powerRanking" as const,
                id: 1,
                name: "Broadcast Overlay",
                subtitle: "Set up a live OBS overlay for match broadcasts",
                href: "/broadcast",
              },
            ]
          : []),
      ],
    },
  });
}
