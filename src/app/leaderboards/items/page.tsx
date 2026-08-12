import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { seasons } from "@/lib/schema";
import { desc } from "drizzle-orm";
import { ItemUsageFilters } from "./item-usage-filters";
import { isTransferredItemReveal } from "@/lib/revealed-items";

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
  games: ItemGame[];
};

type ItemGame = {
  matchId: number;
  seasonNumber: number;
  divisionName: string;
  week: number;
  replayUrl: string | null;
  pokemon: { id: number; name: string };
  coach: { id: number; name: string } | null;
  teamName: string;
  opponentTeamName: string;
  reveals: Array<{ turn: number; source: string }>;
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
        matchId: true,
        pokemonId: true,
        revealedItems: true,
      },
      with: {
        pokemon: {
          columns: { id: true, name: true, displayName: true },
        },
        seasonCoach: {
          columns: { id: true, coachId: true, teamName: true },
          with: {
            coach: {
              columns: { id: true, name: true },
            },
          },
        },
        match: {
          columns: {
            id: true,
            seasonId: true,
            divisionId: true,
            week: true,
            replayUrl: true,
          },
          with: {
            season: {
              columns: { seasonNumber: true },
            },
            division: {
              columns: { name: true },
            },
            coach1: {
              columns: { id: true, teamName: true },
            },
            coach2: {
              columns: { id: true, teamName: true },
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
      games: ItemGame[];
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

    const distinctItems = new Map<
      string,
      { item: string; reveals: Array<{ turn: number; source: string }> }
    >();
    for (const reveal of row.revealedItems || []) {
      if (isTransferredItemReveal(reveal.source)) continue;

      const key = reveal.item.toLowerCase();
      const existing = distinctItems.get(key);
      if (existing) {
        existing.reveals.push({ turn: reveal.turn, source: reveal.source });
      } else {
        distinctItems.set(key, {
          item: reveal.item,
          reveals: [{ turn: reveal.turn, source: reveal.source }],
        });
      }
    }
    if (distinctItems.size > 0) trackedPokemonAppearances++;

    for (const [key, revealedItem] of distinctItems) {
      let itemEntry = itemMap.get(key);
      if (!itemEntry) {
        itemEntry = {
          item: revealedItem.item,
          uses: 0,
          pokemon: new Map(),
          coaches: new Map(),
          games: [],
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

      const holderTeam = row.seasonCoach;
      const opponentTeam =
        row.match.coach1?.id === holderTeam?.id ? row.match.coach2 : row.match.coach1;
      itemEntry.games.push({
        matchId: row.match.id,
        seasonNumber: row.match.season.seasonNumber,
        divisionName: row.match.division?.name || "Unknown division",
        week: row.match.week,
        replayUrl: row.match.replayUrl,
        pokemon: {
          id: row.pokemon.id,
          name: row.pokemon.displayName || row.pokemon.name,
        },
        coach: holderTeam?.coach
          ? { id: holderTeam.coach.id, name: holderTeam.coach.name }
          : null,
        teamName: holderTeam?.teamName || "Unknown team",
        opponentTeamName: opponentTeam?.teamName || "Unknown opponent",
        reveals: revealedItem.reveals.sort(
          (a, b) => a.turn - b.turn || a.source.localeCompare(b.source)
        ),
      });
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
      games: entry.games.sort(
        (a, b) =>
          b.seasonNumber - a.seasonNumber ||
          b.week - a.week ||
          b.matchId - a.matchId ||
          a.pokemon.name.localeCompare(b.pokemon.name)
      ),
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
              and are not included. Items revealed only after being received through Trick or
              Switcheroo are also excluded. Historical tracking currently goes back to Season 5
              because earlier seasons do not have saved replay links.
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

                <details className="group border-t border-[var(--background-tertiary)]/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-xs font-bold text-[var(--foreground-muted)] hover:bg-[var(--background-secondary)] hover:text-white sm:px-5">
                    <span>
                      View game sources{" "}
                      <span className="font-mono font-normal">({item.games.length})</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-base text-[var(--primary)] transition-transform group-open:rotate-180"
                    >
                      ▾
                    </span>
                  </summary>
                  <div className="border-t border-[var(--background-tertiary)] bg-[var(--background)]/40 px-4 py-3 sm:px-5">
                    <div className="mb-3 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                      Each use is one Pokémon appearance. The source shows the replay event that
                      revealed the item.
                    </div>
                    <div className="space-y-2">
                      {item.games.map((game) => (
                        <div
                          key={`${game.matchId}-${game.pokemon.id}`}
                          className="grid gap-2 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-3 text-xs sm:grid-cols-[minmax(10rem,0.9fr)_minmax(12rem,1.3fr)_minmax(10rem,1fr)_auto] sm:items-center"
                        >
                          <div>
                            <div className="font-bold text-white">
                              Season {game.seasonNumber} · {formatWeek(game.week)}
                            </div>
                            <div className="mt-0.5 text-[var(--foreground-subtle)]">
                              {game.divisionName}
                            </div>
                          </div>
                          <div>
                            <div className="font-medium text-white">
                              {game.teamName} vs {game.opponentTeamName}
                            </div>
                            <div className="mt-0.5 text-[var(--foreground-muted)]">
                              <Link
                                href={`/pokemon/${game.pokemon.id}`}
                                className="hover:text-[var(--primary)]"
                              >
                                {game.pokemon.name}
                              </Link>
                              {game.coach ? (
                                <>
                                  {" · "}
                                  <Link
                                    href={`/coaches/${game.coach.id}`}
                                    className="hover:text-[var(--primary)]"
                                  >
                                    {game.coach.name}
                                  </Link>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="font-mono text-[11px] text-[var(--foreground-muted)]">
                            {game.reveals.map((reveal, revealIndex) => (
                              <div key={`${reveal.turn}-${reveal.source}-${revealIndex}`}>
                                Turn {reveal.turn} · {reveal.source}
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Link
                              href={`/matches/${game.matchId}`}
                              className="rounded-md border border-[var(--background-tertiary)] px-2.5 py-1.5 font-bold text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-white"
                            >
                              Match
                            </Link>
                            {game.replayUrl ? (
                              <a
                                href={game.replayUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-[var(--primary)]/60 px-2.5 py-1.5 font-bold text-[var(--primary)] hover:border-[var(--primary)] hover:text-white"
                              >
                                Replay ↗
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
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

function formatWeek(week: number) {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  if (week > 100) return `Playoff Round ${week - 100}`;
  return `Week ${week}`;
}
