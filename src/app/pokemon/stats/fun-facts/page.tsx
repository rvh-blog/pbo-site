import Link from "next/link";
import { getPokemonFunFacts } from "../page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pokemon Fun Facts",
};

export default async function PokemonFunFactsPage() {
  const miscStats = await getPokemonFunFacts();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="poke-card p-4 sm:p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm sm:text-base">
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
        <h1 className="font-pixel text-2xl text-white sm:text-3xl md:text-4xl">
          Pokemon Fun Facts
        </h1>
        <p className="mt-1 text-base text-[var(--foreground-muted)]">
          Odd records and standout moments from Season 10
        </p>
      </div>

      {miscStats.length > 0 && (
        <div className="poke-card p-0 overflow-hidden">
          <div className="border-b-2 border-[var(--background-tertiary)] p-4 sm:p-6">
            <div className="section-title !mb-0">
              <div className="section-title-icon !bg-[var(--accent)]" style={{ boxShadow: "0 4px 0 #a16207" }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <h3 className="text-xl">Fun Facts</h3>
            </div>
          </div>
          <div className="p-3 sm:p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {miscStats.map((stat, i) => (
                <div key={i} className="min-w-0 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-3 transition-colors hover:border-[var(--primary)]/30 sm:p-4">
                  <div className="mb-2 flex min-h-8 items-center gap-2">
                    {stat.pokemon1?.spriteUrl && (
                      <img src={stat.pokemon1.spriteUrl} alt="" className="h-8 w-8 shrink-0 object-contain" />
                    )}
                    {stat.pokemon2?.spriteUrl && (
                      <>
                        <span className="shrink-0 text-sm font-bold text-[var(--foreground-subtle)]">vs</span>
                        <img src={stat.pokemon2.spriteUrl} alt="" className="h-8 w-8 shrink-0 object-contain" />
                      </>
                    )}
                  </div>
                  <p className="mb-1 break-words text-sm font-bold uppercase tracking-wide text-[var(--foreground-muted)]">{stat.label}</p>
                  <p className="break-words text-xl font-bold leading-tight text-[var(--accent)] sm:text-2xl">{stat.value}</p>
                  <p className="mt-1 break-words text-sm leading-snug text-[var(--foreground-muted)]">{stat.description}</p>
                  {stat.contributors?.length ? (
                    <div className="mt-3 border-t border-[var(--background-tertiary)] pt-2">
                      <p className="mb-1 text-sm font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                        Contributors
                      </p>
                      <div className="max-h-24 overflow-y-auto pr-1">
                        <div className="flex flex-wrap gap-1.5">
                          {stat.contributors.map((contributor) => (
                            <Link
                              key={contributor.coachId}
                              href={`/coaches/${contributor.coachId}`}
                              className="min-w-0 max-w-full rounded-md border border-[var(--background-tertiary)] bg-[var(--background)] px-2 py-1 text-sm font-bold text-[var(--foreground-muted)] transition-colors hover:border-[var(--primary)]/50 hover:text-white"
                            >
                              <span className="break-words">
                                {contributor.name}
                                {contributor.count > 1 ? ` (${contributor.count})` : ""}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
