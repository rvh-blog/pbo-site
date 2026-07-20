import type { CombinationLeaderboards, PokemonCombination } from "@/lib/pokemon-combinations";
import Link from "next/link";
import Image from "next/image";

export function PokemonCombinationRankings({
  leaderboards,
  title = "Most Used Battle Combinations",
  description = "Pokémon brought together by the same team in the same battle. Each lineup counts once.",
  allTimeHref,
}: {
  leaderboards: CombinationLeaderboards;
  title?: string;
  description?: string;
  allTimeHref?: string;
}) {
  return (
    <section className="poke-card p-6">
      <div className="section-title mb-2">
        <div className="section-title-icon !bg-amber-200" style={{ boxShadow: "0 4px 0 #ca8a04" }}>
          <svg className="h-5 w-5 text-amber-950" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M5 12h14M8 17h8" />
          </svg>
        </div>
        <h3>{title}</h3>
        {allTimeHref && (
          <Link href={allTimeHref} className="ml-auto text-[10px] font-bold uppercase text-[var(--primary)] hover:text-white">
            All PBO Seasons →
          </Link>
        )}
      </div>
      <p className="mb-4 text-sm text-[var(--foreground-muted)]">{description}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <CombinationLeaderboard title="Pairs" entries={leaderboards[2]} />
        <CombinationLeaderboard title="Trios" entries={leaderboards[3]} />
        <CombinationLeaderboard title="Quartets" entries={leaderboards[4]} />
      </div>
    </section>
  );
}

function CombinationLeaderboard({ title, entries }: { title: string; entries: PokemonCombination[] }) {
  return (
    <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
      <h4 className="mb-3 font-pixel text-xs uppercase text-white">{title}</h4>
      {entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div key={entry.pokemon.map((pokemon) => pokemon.pokemonId).join("-")} className="flex items-center gap-2 rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-2">
              <span className="rank-badge h-5 w-5 shrink-0 text-[10px]">{index + 1}</span>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {entry.pokemon.map((pokemon) => (
                  <div key={pokemon.pokemonId} className="flex min-w-0 items-center" title={pokemon.pokemonDisplayName || pokemon.pokemonName}>
                    {pokemon.spriteUrl ? <Image src={pokemon.spriteUrl} alt="" width={28} height={28} sizes="28px" className="h-7 w-7 object-contain" /> : <span className="flex h-7 w-7 items-center justify-center text-xs">?</span>}
                  </div>
                ))}
                <span className="ml-1 truncate text-xs font-bold text-[var(--foreground-muted)]">
                  {entry.pokemon.map((pokemon) => pokemon.pokemonDisplayName || pokemon.pokemonName).join(" + ")}
                </span>
              </div>
              <span className="flex shrink-0 flex-col items-end font-mono text-[10px] font-bold leading-tight">
                <span className="text-[var(--primary)]">{entry.uses}×</span>
                <span className="text-[var(--success)]">{entry.winRate}% W</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-[var(--foreground-subtle)]">No combinations recorded.</p>
      )}
    </div>
  );
}
