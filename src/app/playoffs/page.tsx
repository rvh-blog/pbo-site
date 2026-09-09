import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { matches, playoffMatches } from "@/lib/schema";
import { compareDivisions, getDivisionHierarchyIndex } from "@/lib/division-order";
import { filterPublicDivisions, getPublicVisibilityState, isPublicSeasonVisible } from "@/lib/public-visibility";
import { scoreFantasyPokemonGame } from "@/lib/fantasy-scoring";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Playoff Hub",
  description: "Explore PBO playoff leaders, historical brackets, champions, and promotions.",
  alternates: { canonical: "/playoffs" },
};

function positiveId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

type PlayoffPokemonStat = {
  id: number;
  name: string;
  spriteUrl: string | null;
  kills: number;
  deaths: number;
  appearances: number;
  mvpScore: number;
};

function PokemonTable({
  title,
  rows,
  value,
}: {
  title: string;
  rows: PlayoffPokemonStat[];
  value: (row: PlayoffPokemonStat) => string;
}) {
  return (
    <section className="poke-card overflow-hidden p-0">
      <h2 className="border-b-2 border-[var(--background-tertiary)] p-4 text-sm font-bold uppercase text-white">{title}</h2>
      {rows.length ? <ol className="divide-y divide-[var(--background-tertiary)]">{rows.map((row, index) => (
        <li key={row.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
          <span className="w-5 text-center font-mono text-xs text-[var(--foreground-subtle)]">{index + 1}</span>
          {row.spriteUrl ? <Image src={row.spriteUrl} alt="" width={36} height={36} className="h-9 w-9 object-contain" /> : <div className="h-9 w-9" />}
          <span className="min-w-0 flex-1 whitespace-normal text-sm font-bold text-white">{row.name}</span>
          <span className="font-mono text-sm font-bold text-[var(--accent)]">{value(row)}</span>
        </li>
      ))}</ol> : <p className="p-6 text-sm text-[var(--foreground-muted)]">No replay statistics recorded for this postseason.</p>}
    </section>
  );
}
export default async function PlayoffHubPage({ searchParams }: { searchParams: Promise<{ seasonId?: string }> }) {
  const params = await searchParams;
  const [allSeasons, visibility] = await Promise.all([
    db.query.seasons.findMany({
      with: { divisions: true },
      orderBy: (season, { desc }) => [desc(season.seasonNumber)],
    }),
    getPublicVisibilityState(),
  ]);
  const publicSeasons = allSeasons.filter(isPublicSeasonVisible).map((season) => ({
    ...season,
    divisions: filterPublicDivisions(season.divisions, visibility).sort(compareDivisions),
  }));
  const requestedSeasonId = positiveId(params.seasonId);
  const selectedSeason = publicSeasons.find((season) => season.id === requestedSeasonId)
    ?? publicSeasons.find((season) => season.isCurrent)
    ?? publicSeasons[0];

  if (!selectedSeason) {
    return <div className="poke-card p-8 text-center text-[var(--foreground-muted)]">No public playoff seasons are available.</div>;
  }

  const visibleDivisionIds = new Set(selectedSeason.divisions.map((division) => division.id));
  const [seasonMatches, allFinals] = await Promise.all([
    db.query.matches.findMany({
      where: and(eq(matches.seasonId, selectedSeason.id), gte(matches.week, 101)),
      columns: {
        id: true,
        divisionId: true,
        coach1SeasonId: true,
        coach2SeasonId: true,
        winnerId: true,
        coach1Differential: true,
        coach2Differential: true,
      },
      with: {
        division: true,
        coach1: { with: { coach: true } },
        coach2: { with: { coach: true } },
        matchPokemon: {
          columns: {
            pokemonId: true,
            seasonCoachId: true,
            kills: true,
            deaths: true,
          },
          with: {
            pokemon: {
              columns: { name: true, displayName: true, spriteUrl: true },
            },
          },
        },
      },
    }),
    db.query.playoffMatches.findMany({
      where: eq(playoffMatches.round, 3),
      with: {
        season: true,
        division: true,
        higherSeed: { with: { coach: true } },
        lowerSeed: { with: { coach: true } },
        winner: { with: { coach: true } },
      },
      orderBy: (final, { desc }) => [desc(final.seasonId), desc(final.divisionId)],
    }),
  ]);

  const playoffMatchesForSeason = seasonMatches.filter((match) => visibleDivisionIds.has(match.divisionId));
  const teamStats = new Map<number, { id: number; name: string; coach: string; division: string; differential: number; wins: number; games: number }>();
  const pokemonStats = new Map<number, PlayoffPokemonStat>();

  for (const match of playoffMatchesForSeason) {
    for (const team of [match.coach1, match.coach2]) {
      if (!team) continue;
      const current = teamStats.get(team.id) ?? {
        id: team.id,
        name: team.teamName,
        coach: team.coach?.name ?? "Unknown coach",
        division: match.division?.name ?? "Unknown division",
        differential: 0,
        wins: 0,
        games: 0,
      };
      current.games += match.winnerId !== null ? 1 : 0;
      current.wins += match.winnerId === team.id ? 1 : 0;
      current.differential += team.id === match.coach1SeasonId
        ? match.coach1Differential ?? 0
        : match.coach2Differential ?? 0;
      teamStats.set(team.id, current);
    }

    if (match.winnerId === null) continue;
    for (const appearance of match.matchPokemon) {
      if (!appearance.pokemon) continue;
      const current = pokemonStats.get(appearance.pokemonId) ?? {
        id: appearance.pokemonId,
        name: appearance.pokemon.displayName || appearance.pokemon.name,
        spriteUrl: appearance.pokemon.spriteUrl,
        kills: 0,
        deaths: 0,
        appearances: 0,
        mvpScore: 0,
      };
      current.kills += appearance.kills ?? 0;
      current.deaths += appearance.deaths ?? 0;
      current.appearances += 1;
      current.mvpScore += scoreFantasyPokemonGame({
        kills: appearance.kills,
        deaths: appearance.deaths,
        seasonCoachId: appearance.seasonCoachId,
        winnerId: match.winnerId,
      });
      pokemonStats.set(appearance.pokemonId, current);
    }
  }

  const pokemonRows = [...pokemonStats.values()];
  const killLeaders = [...pokemonRows].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name)).slice(0, 10);
  const usageLeaders = [...pokemonRows].sort((a, b) => b.appearances - a.appearances || b.kills - a.kills || a.name.localeCompare(b.name)).slice(0, 10);
  const mvpLeaders = [...pokemonRows].sort((a, b) => b.mvpScore - a.mvpScore || b.kills - a.kills || a.name.localeCompare(b.name)).slice(0, 10);
  const differentialLeaders = [...teamStats.values()].filter((row) => row.games > 0).sort((a, b) => b.differential - a.differential || b.wins - a.wins || a.name.localeCompare(b.name)).slice(0, 10);

  const publicDivisionIds = new Set(publicSeasons.flatMap((season) => season.divisions.map((division) => division.id)));
  const archiveBySeason = new Map<number, typeof allFinals>();
  for (const final of allFinals) {
    if (!final.season || !isPublicSeasonVisible(final.season) || !publicDivisionIds.has(final.divisionId)) continue;
    const group = archiveBySeason.get(final.seasonId) ?? [];
    group.push(final);
    archiveBySeason.set(final.seasonId, group);
  }

  return (
    <div className="space-y-10">
      <header className="poke-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">Postseason center</p>
            <h1 className="mt-2 font-pixel text-xl leading-relaxed text-white sm:text-2xl">Playoff Hub</h1>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">Playoff-only leaders plus every recorded bracket, champion, and promotion.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/seasons/${selectedSeason.id}/playoffs`} className="btn-retro inline-flex min-h-11 items-center px-4 text-[10px]">View bracket</Link>
            <Link href="/pick-ems" className="btn-retro-secondary inline-flex min-h-11 items-center px-4 text-[10px]">Round picks</Link>
          </div>
        </div>
      </header>

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Playoff leaderboards</h2>
            <p className="text-xs text-[var(--foreground-muted)]">Only matches labeled Quarterfinals, Semifinals, or Finals are counted.</p>
          </div>
          <form className="flex gap-2">
            <label htmlFor="playoff-season" className="sr-only">Season</label>
            <select id="playoff-season" name="seasonId" defaultValue={selectedSeason.id} className="min-h-11 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 text-sm text-white">
              {publicSeasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
            </select>
            <button className="btn-retro-secondary min-h-11 px-4 text-[10px]">View</button>
          </form>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <PokemonTable title="Pokémon KOs" rows={killLeaders} value={(row) => `${row.kills} KOs`} />
          <section className="poke-card overflow-hidden p-0">
            <h2 className="border-b-2 border-[var(--background-tertiary)] p-4 text-sm font-bold uppercase text-white">Team differential</h2>
            {differentialLeaders.length ? <ol className="divide-y divide-[var(--background-tertiary)]">{differentialLeaders.map((row, index) => (
              <li key={row.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <span className="w-5 text-center font-mono text-xs text-[var(--foreground-subtle)]">{index + 1}</span>
                <span className="min-w-0 flex-1"><span className="block whitespace-normal text-sm font-bold text-white">{row.name}</span><span className="block text-[10px] text-[var(--foreground-subtle)]">{row.coach} · {row.division} · {row.wins}-{row.games - row.wins}</span></span>
                <span className="font-mono text-sm font-bold text-[var(--accent)]">{signed(row.differential)}</span>
              </li>
            ))}</ol> : <p className="p-6 text-sm text-[var(--foreground-muted)]">No completed playoff matches recorded.</p>}
          </section>
          <PokemonTable title="Playoff MVP" rows={mvpLeaders} value={(row) => `${row.mvpScore} pts`} />
          <PokemonTable title="Pokémon usage" rows={usageLeaders} value={(row) => `${row.appearances} games`} />
        </div>
        <p className="mt-3 text-[10px] text-[var(--foreground-subtle)]">MVP uses the established fantasy score: 5 points per KO, −1 per death, +2 for a team win, and −2 for a team loss.</p>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-white">Historical bracket archive</h2>
          <p className="text-xs text-[var(--foreground-muted)]">Completed championship rounds and promotion outcomes from recorded seasons.</p>
        </div>
        <div className="space-y-5">
          {publicSeasons.filter((season) => archiveBySeason.has(season.id)).map((season) => {
            const finals = (archiveBySeason.get(season.id) ?? []).sort((a, b) => compareDivisions(a.division, b.division));
            return (
              <article key={season.id} className="poke-card p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-pixel text-sm leading-relaxed text-white">{season.name}</h3>
                  <Link href={`/seasons/${season.id}/playoffs`} className="inline-flex min-h-11 items-center text-xs font-bold text-[var(--primary)] hover:text-white">Open full bracket</Link>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {finals.map((final) => {
                    const runnerUp = final.winnerId === final.higherSeedId ? final.lowerSeed : final.higherSeed;
                    const isStargazerBeforePromotionEra = final.division.name.trim().toLowerCase() === "stargazer"
                      && season.seasonNumber < 11;
                    const promotionHistoryIsAvailable = season.seasonNumber > 5;
                    const promotes = promotionHistoryIsAvailable
                      && getDivisionHierarchyIndex(final.division.name) > 0
                      && !isStargazerBeforePromotionEra;
                    return (
                      <div key={final.id} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-subtle)]">{final.division.name}</p>
                        <p className="mt-2 whitespace-normal text-sm font-bold text-yellow-400">Champion: {final.winner?.teamName ?? "Not recorded"}</p>
                        <p className="mt-1 whitespace-normal text-xs text-[var(--foreground-muted)]">Runner-up: {runnerUp?.teamName ?? "Not recorded"}</p>
                        {promotes && final.winner && runnerUp && <p className="mt-2 text-[10px] font-bold uppercase text-[var(--success)]">Promoted: {final.winner.teamAbbreviation || final.winner.teamName} & {runnerUp.teamAbbreviation || runnerUp.teamName}</p>}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
