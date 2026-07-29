import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { seasons } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { ItemUsageFilters } from "./item-usage-filters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Item Usage",
  description: "Most-used held items explicitly revealed in recorded PBO replays.",
};

type PageProps = {
  searchParams: Promise<{ season?: string; division?: string }>;
};

type ItemRow = {
  item: string;
  uses: number;
  pokemon: Array<{ id: number; name: string; uses: number }>;
  coaches: Array<{ id: number; name: string; uses: number }>;
};

export default async function ItemUsagePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedSeason = Number(params.season);
  const selectedSeason = Number.isInteger(requestedSeason) ? requestedSeason : null;
  const requestedDivision = Number(params.division);
  const selectedDivision = Number.isInteger(requestedDivision) ? requestedDivision : null;

  const [rows, allSeasons, allDivisions] = await Promise.all([
    db.query.matchPokemon.findMany({
      columns: {
        pokemonId: true,
        revealedItems: true,
      },
      with: {
        pokemon: {
          columns: { id: true, name: true, displayName: true },
        },
        seasonCoach: {
          columns: { coachId: true },
          with: {
            coach: {
              columns: { id: true, name: true },
            },
          },
        },
        match: {
          columns: { seasonId: true, divisionId: true },
          with: {
            season: {
              columns: { seasonNumber: true },
            },
          },
        },
      },
    }),
    db.query.seasons.findMany({
      columns: { id: true, name: true, seasonNumber: true, isPublic: true },
      orderBy: [desc(seasons.seasonNumber)],
    }),
    db.query.divisions.findMany({
      columns: { id: true, name: true, seasonId: true, displayOrder: true },
    }),
  ]);

  const itemMap = new Map<
    string,
    {
      item: string;
      uses: number;
      pokemon: Map<number, { id: number; name: string; uses: number }>;
      coaches: Map<number, { id: number; name: string; uses: number }>;
    }
  >();
  let trackedPokemonAppearances = 0;

  for (const row of rows) {
    if (
      !row.pokemon ||
      !row.match?.season ||
      row.match.season.seasonNumber < 5 ||
      (selectedSeason !== null && row.match.season.seasonNumber !== selectedSeason) ||
      (selectedDivision !== null && row.match.divisionId !== selectedDivision)
    ) {
      continue;
    }

    const distinctItems = new Map(
      (row.revealedItems || []).map((reveal) => [reveal.item.toLowerCase(), reveal.item])
    );
    if (distinctItems.size > 0) trackedPokemonAppearances++;

    for (const [key, item] of distinctItems) {
      let itemEntry = itemMap.get(key);
      if (!itemEntry) {
        itemEntry = {
          item,
          uses: 0,
          pokemon: new Map(),
          coaches: new Map(),
        };
        itemMap.set(key, itemEntry);
      }
      itemEntry.uses++;

      const pokemonEntry = itemEntry.pokemon.get(row.pokemon.id);
      if (pokemonEntry) {
        pokemonEntry.uses++;
      } else {
        itemEntry.pokemon.set(row.pokemon.id, {
          id: row.pokemon.id,
          name: row.pokemon.displayName || row.pokemon.name,
          uses: 1,
        });
      }

      const coach = row.seasonCoach?.coach;
      if (coach) {
        const coachEntry = itemEntry.coaches.get(coach.id);
        if (coachEntry) {
          coachEntry.uses++;
        } else {
          itemEntry.coaches.set(coach.id, {
            id: coach.id,
            name: coach.name,
            uses: 1,
          });
        }

      }
    }
  }

  const itemRows: ItemRow[] = Array.from(itemMap.values())
    .map((entry) => ({
      item: entry.item,
      uses: entry.uses,
      pokemon: Array.from(entry.pokemon.values())
        .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
        .slice(0, 3),
      coaches: Array.from(entry.coaches.values())
        .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
        .slice(0, 3),
    }))
    .sort((a, b) => b.uses - a.uses || a.item.localeCompare(b.item));
  const totalRevealedUses = itemRows.reduce((sum, item) => sum + item.uses, 0);
  const publicSeasons = allSeasons.filter(
    (season) => season.isPublic !== false && season.seasonNumber >= 5
  );
  const publicSeasonIds = new Set(publicSeasons.map((season) => season.id));
  const divisionsBySeason = new Map<number, typeof allDivisions>();
  for (const division of allDivisions) {
    if (!publicSeasonIds.has(division.seasonId)) continue;
    const seasonDivisions = divisionsBySeason.get(division.seasonId) || [];
    seasonDivisions.push(division);
    divisionsBySeason.set(division.seasonId, seasonDivisions);
  }
  for (const seasonDivisions of divisionsBySeason.values()) {
    seasonDivisions.sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name)
    );
  }

  return (
    <div className="space-y-6">
      <header className="poke-card p-5 sm:p-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
          <Link href="/leaderboards" className="hover:text-[var(--primary)]">
            PBO Stats
          </Link>
          <span>/</span>
          <span>Item Usage</span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-pixel text-xl text-white sm:text-2xl">Item Usage</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-muted)]">
              Most-used held items observed in saved PBO replays. Unrevealed items remain unknown
              and are not included. Historical tracking currently goes back to Season 5 because
              earlier seasons do not have saved replay links.
            </p>
          </div>
          <ItemUsageFilters
            seasons={publicSeasons.map((season) => ({
              id: season.id,
              seasonNumber: season.seasonNumber,
            }))}
            divisions={publicSeasons.flatMap(
              (season) => divisionsBySeason.get(season.id) || []
            )}
            selectedSeason={selectedSeason}
            selectedDivision={selectedDivision}
          />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="stat-card text-center">
          <div className="font-mono text-2xl font-bold text-white">{itemRows.length}</div>
          <div className="mt-1 text-[10px] font-bold uppercase text-[var(--foreground-muted)]">
            Distinct Items
          </div>
        </div>
        <div className="stat-card text-center">
          <div className="font-mono text-2xl font-bold text-[var(--primary)]">
            {totalRevealedUses}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase text-[var(--foreground-muted)]">
            Revealed Uses
          </div>
        </div>
        <div className="stat-card text-center">
          <div className="font-mono text-2xl font-bold text-white">
            {trackedPokemonAppearances}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase text-[var(--foreground-muted)]">
            Pokémon Appearances
          </div>
        </div>
      </div>

      <section className="poke-card overflow-hidden p-0">
        <div className="border-b-2 border-[var(--background-tertiary)] p-4 sm:p-5">
          <h2 className="font-pixel text-sm text-white">Most Used Items</h2>
          <div className="mt-4 hidden grid-cols-[3rem_minmax(9rem,1fr)_4rem_minmax(12rem,1fr)_minmax(12rem,1fr)] gap-3 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)] sm:grid">
            <span>Rank</span>
            <span>Item</span>
            <span className="text-right">Uses</span>
            <span>Top Pokémon</span>
            <span>Top Coaches</span>
          </div>
        </div>
        {itemRows.length ? (
          <div className="divide-y divide-[var(--background-tertiary)]">
            {itemRows.map((item, index) => (
              <div key={item.item}>
                <div className="grid grid-cols-[2rem_minmax(0,1fr)_3rem] items-center gap-3 px-4 py-3 sm:grid-cols-[3rem_minmax(9rem,1fr)_4rem_minmax(12rem,1fr)_minmax(12rem,1fr)] sm:px-5">
                  <div className="font-mono text-sm font-bold text-[var(--foreground-subtle)]">
                    #{index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-white">{item.item}</div>
                    <div className="mt-1 space-y-0.5 text-[11px] text-[var(--foreground-muted)] sm:hidden">
                      <div>
                        Pokémon:{" "}
                        {item.pokemon.map((pokemon) => `${pokemon.name} ${pokemon.uses}×`).join(" · ")}
                      </div>
                      <div>
                        Coaches:{" "}
                        {item.coaches.map((coach) => `${coach.name} ${coach.uses}×`).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono text-lg font-bold text-[var(--primary)]">
                    {item.uses}
                  </div>
                  <div className="hidden flex-wrap gap-1.5 sm:flex">
                    {item.pokemon.map((pokemon) => (
                      <Link
                        key={pokemon.id}
                        href={`/pokemon/${pokemon.id}`}
                        className="rounded-full border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1 text-[11px] text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-white"
                      >
                        {pokemon.name} <span className="font-mono">{pokemon.uses}×</span>
                      </Link>
                    ))}
                  </div>
                  <div className="hidden flex-wrap gap-1.5 sm:flex">
                    {item.coaches.map((coach) => (
                      <Link
                        key={coach.id}
                        href={`/coaches/${coach.id}`}
                        className="rounded-full border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1 text-[11px] text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-white"
                      >
                        {coach.name} <span className="font-mono">{coach.uses}×</span>
                      </Link>
                    ))}
                  </div>
                </div>

              </div>
            ))}
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-[var(--foreground-muted)]">
            No revealed item data is available for this season yet.
          </p>
        )}
      </section>
    </div>
  );
}
