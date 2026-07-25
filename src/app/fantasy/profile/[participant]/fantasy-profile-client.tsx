"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type FantasyPick = {
  pokemonId: number;
  seasonCoachId: number | null;
  name: string;
  spriteUrl: string | null;
  score: number;
  teamName: string;
  divisionName: string;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
};

type FantasyHistoryWeek = {
  week: number;
  score: number;
  rank: number;
  rewardAmount: number;
  picks: FantasyPick[];
};

type FantasyProfileEntry = {
  displayName: string;
  coachId: number | null;
  userId: number | null;
  rank: number;
  seasonTotal: number;
  weeksEntered: number;
  averageScore: number;
  weeklyHistory: FantasyHistoryWeek[];
};

function formatScore(value: number) {
  return value.toFixed(1);
}

function scoreBreakdown(pick: FantasyPick) {
  if (pick.kills === 0 && pick.deaths === 0 && pick.wins === 0 && pick.losses === 0) {
    return "Not brought · 0 points";
  }
  const resultPoints = pick.wins > 0 ? 2 : pick.losses > 0 ? -2 : 0;
  return `${pick.kills} KO${pick.kills === 1 ? "" : "s"} × 5 − ${pick.deaths} death${pick.deaths === 1 ? "" : "s"} ${resultPoints >= 0 ? "+" : "−"} ${Math.abs(resultPoints)} result`;
}

export function FantasyProfileClient({
  participantType,
  participantId,
  seasonId,
}: {
  participantType: "coach" | "user";
  participantId: number;
  seasonId: number;
}) {
  const [entry, setEntry] = useState<FantasyProfileEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const participantKey = `${participantType}:${participantId}`;
        const response = await fetch(
          `/api/fantasy-entry?seasonId=${seasonId}&leaderboardWeek=overall&mode=details&participant=${encodeURIComponent(participantKey)}`
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load Fantasy profile");
        const profile = data.detail as FantasyProfileEntry | null;
        if (!cancelled) {
          if (profile) setEntry(profile);
          else setError("No Fantasy history was found for this participant and season.");
        }
      } catch (profileError) {
        if (!cancelled) {
          setError(profileError instanceof Error ? profileError.message : "Unable to load Fantasy profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [participantId, participantType, seasonId]);

  const profileStats = useMemo(() => {
    if (!entry) return null;
    const sortedWeeks = [...entry.weeklyHistory].sort((a, b) => a.week - b.week);
    const bestWeek = [...sortedWeeks].sort((a, b) => b.score - a.score)[0] ?? null;
    const worstWeek = [...sortedWeeks].sort((a, b) => a.score - b.score)[0] ?? null;
    const rewards = sortedWeeks.reduce((sum, week) => sum + week.rewardAmount, 0);
    const pokemonTotals = new Map<string, { name: string; spriteUrl: string | null; score: number; appearances: number }>();
    for (const week of sortedWeeks) {
      for (const pick of week.picks) {
        const existing = pokemonTotals.get(pick.name) ?? {
          name: pick.name,
          spriteUrl: pick.spriteUrl,
          score: 0,
          appearances: 0,
        };
        existing.score += pick.score;
        existing.appearances += 1;
        pokemonTotals.set(pick.name, existing);
      }
    }
    const bestPokemon = [...pokemonTotals.values()].sort((a, b) => b.score - a.score)[0] ?? null;
    return { sortedWeeks, bestWeek, worstWeek, rewards, bestPokemon };
  }, [entry]);

  if (loading) {
    return <div className="poke-card p-8 text-center text-sm text-[var(--foreground-muted)]">Loading Fantasy profile...</div>;
  }

  if (!entry || !profileStats) {
    return (
      <div className="poke-card p-8 text-center">
        <h1 className="font-pixel text-lg text-white">Fantasy Profile</h1>
        <p className="mt-3 text-sm text-[var(--error)]">{error || "Fantasy profile not found."}</p>
        <Link href={`/fantasy?seasonId=${seasonId}`} className="btn-retro-secondary mt-5 inline-block px-4 py-2 text-[9px]">
          Back to Fantasy
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="poke-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href={`/fantasy?seasonId=${seasonId}`} className="text-xs font-bold uppercase text-[var(--foreground-muted)] hover:text-white">
              ← Fantasy leaderboard
            </Link>
            <h1 className="mt-3 font-pixel text-xl text-white">{entry.displayName}</h1>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">Season Fantasy profile and lineup history</p>
          </div>
          {entry.coachId && (
            <Link href={`/coaches/${entry.coachId}`} className="btn-retro-secondary px-4 py-2 text-[9px]">
              Coach Profile
            </Link>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="poke-card p-3">
          <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Season rank</div>
          <div className="mt-1 font-mono text-xl font-bold text-white">#{entry.rank}</div>
        </div>
        <div className="poke-card p-3">
          <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Season points</div>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--accent)]">{formatScore(entry.seasonTotal)}</div>
        </div>
        <div className="poke-card p-3">
          <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Average</div>
          <div className="mt-1 font-mono text-xl font-bold text-white">{formatScore(entry.averageScore)}</div>
          <div className="text-[10px] text-[var(--foreground-subtle)]">{entry.weeksEntered} weeks entered</div>
        </div>
        <div className="poke-card p-3">
          <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Rewards</div>
          <div className="mt-1 font-mono text-xl font-bold text-amber-300">{profileStats.rewards}</div>
          <div className="text-[10px] text-[var(--foreground-subtle)]">PBO Coin</div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="poke-card p-4">
          <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Best week</div>
          <div className="mt-2 text-sm font-bold text-white">Week {profileStats.bestWeek?.week}</div>
          <div className="font-mono text-lg font-bold text-[var(--accent)]">{formatScore(profileStats.bestWeek?.score ?? 0)}</div>
        </div>
        <div className="poke-card p-4">
          <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Lowest week</div>
          <div className="mt-2 text-sm font-bold text-white">Week {profileStats.worstWeek?.week}</div>
          <div className="font-mono text-lg font-bold text-white">{formatScore(profileStats.worstWeek?.score ?? 0)}</div>
        </div>
        <div className="poke-card p-4">
          <div className="text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">Top Pokemon</div>
          <div className="mt-2 flex items-center gap-2">
            {profileStats.bestPokemon?.spriteUrl && (
              <Image src={profileStats.bestPokemon.spriteUrl} alt="" width={34} height={34} className="object-contain" />
            )}
            <div>
              <div className="text-sm font-bold text-white">{profileStats.bestPokemon?.name ?? "--"}</div>
              <div className="text-[10px] text-[var(--foreground-subtle)]">
                {formatScore(profileStats.bestPokemon?.score ?? 0)} points · {profileStats.bestPokemon?.appearances ?? 0} appearance(s)
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="poke-card p-4 sm:p-5">
        <div className="section-title">
          <div className="section-title-icon">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
            </svg>
          </div>
          <h2 className="font-pixel text-sm text-white">Weekly History</h2>
        </div>
        <div className="space-y-3">
          {profileStats.sortedWeeks.map((week) => (
            <details key={week.week} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)]/50 p-3">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-white">Week {week.week} · Rank #{week.rank}</div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-[var(--accent)]">{formatScore(week.score)}</div>
                    {week.rewardAmount > 0 && <div className="text-[9px] font-bold text-amber-300">+{week.rewardAmount} Coin</div>}
                  </div>
                </div>
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {week.picks.map((pick, index) => (
                  <div key={`${pick.pokemonId}:${pick.seasonCoachId}`} className="trainer-card">
                    <span className="rank-badge bg-[var(--background-tertiary)] text-[var(--foreground-muted)]">{index + 1}</span>
                    {pick.spriteUrl && <Image src={pick.spriteUrl} alt="" width={30} height={30} className="object-contain" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-white">{pick.name}</div>
                      <div className="truncate text-[9px] text-[var(--foreground-subtle)]">{pick.teamName} · {pick.divisionName}</div>
                      <div className="truncate text-[9px] text-[var(--foreground-subtle)]">{scoreBreakdown(pick)}</div>
                    </div>
                    <div className="font-mono text-xs font-bold text-[var(--accent)]">{formatScore(pick.score)}</div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
