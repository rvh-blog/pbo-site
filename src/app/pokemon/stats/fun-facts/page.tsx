import Link from "next/link";
import { getPokemonFunFacts } from "../page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pokemon Fun Facts",
};

export default async function PokemonFunFactsPage() {
  const miscStats = await getPokemonFunFacts();

  return (
    <div className="space-y-6">
      <div className="poke-card p-6">
        <div className="flex items-center gap-2 mb-2 text-sm">
          <Link
            href="/leaderboards"
            className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
          >
            Leaderboards
          </Link>
          <span className="text-[var(--foreground-subtle)]">/</span>
          <Link
            href="/pokemon/stats"
            className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
          >
            Pokemon Battle Stats
          </Link>
          <span className="text-[var(--foreground-subtle)]">/</span>
        </div>
        <h1 className="font-pixel text-xl md:text-2xl text-white">
          Pokemon Fun Facts
        </h1>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">
          Odd records and standout moments from Season 10 onwards
        </p>
      </div>

      {miscStats.length > 0 && (
        <div className="poke-card p-0 overflow-hidden">
          <div className="p-6 border-b-2 border-[var(--background-tertiary)]">
            <div className="section-title !mb-0">
              <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: "0 4px 0 #a16207" }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <h3>Fun Facts</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {miscStats.map((stat, i) => (
                <div key={i} className="p-4 rounded-xl bg-[var(--background-secondary)] border border-[var(--background-tertiary)] hover:border-[var(--primary)]/30 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    {stat.pokemon1?.spriteUrl && (
                      <img src={stat.pokemon1.spriteUrl} alt="" className="w-8 h-8 object-contain" />
                    )}
                    {stat.pokemon2?.spriteUrl && (
                      <>
                        <span className="text-[10px] text-[var(--foreground-subtle)] font-bold">vs</span>
                        <img src={stat.pokemon2.spriteUrl} alt="" className="w-8 h-8 object-contain" />
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide font-bold mb-1">{stat.label}</p>
                  <p className="text-lg font-bold text-[var(--accent)]">{stat.value}</p>
                  <p className="text-[11px] text-[var(--foreground-muted)] mt-1 leading-snug">{stat.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
