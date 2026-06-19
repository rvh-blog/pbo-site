import Link from "next/link";
import { db } from "@/lib/db";
import { matches, coaches, seasonCoaches, seasons, matchPokemon, killEvents } from "@/lib/schema";
import { isNotNull, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coach Battle Stats",
};

interface MiscStatEntry {
  label: string;
  value: string;
  description: string;
  coachName?: string;
  coachId?: number;
  logoUrl?: string | null;
}

async function getCoachFunFacts(): Promise<MiscStatEntry[]> {
  const entries: MiscStatEntry[] = [];

  // Get S10+ season IDs
  const allSeasons = await db.query.seasons.findMany();
  const s10SeasonIds = new Set(allSeasons.filter(s => s.seasonNumber >= 10).map(s => s.id));

  // Run all queries in parallel
  const [allMatches, allSeasonCoaches, allCoaches, rawKillEvents, rawMP] = await Promise.all([
    db.query.matches.findMany(),
    db.query.seasonCoaches.findMany({ with: { coach: true } }),
    db.query.coaches.findMany(),
    db.query.killEvents.findMany({
      with: { match: true, killerSeasonCoach: { with: { coach: true } }, victimSeasonCoach: { with: { coach: true } } },
    }),
    db.query.matchPokemon.findMany({ with: { match: true } }),
  ]);

  const s10Matches = allMatches.filter(m => s10SeasonIds.has(m.seasonId) && m.winnerId);
  const s10KillEvents = rawKillEvents.filter(k => k.match && s10SeasonIds.has(k.match.seasonId));

  // Build coach lookup from seasonCoachId -> coachId -> coach name
  const scToCoach = new Map<number, { coachId: number; name: string }>();
  for (const sc of allSeasonCoaches) {
    if (sc.coach) {
      scToCoach.set(sc.id, { coachId: sc.coachId, name: sc.coach.name });
    }
  }

  // Build coachId -> latest team logo (from most recent season coach entry)
  const coachLogoMap = new Map<number, string | null>();
  const sortedSC = [...allSeasonCoaches].sort((a, b) => b.id - a.id); // newest first by ID
  for (const sc of sortedSC) {
    if (!coachLogoMap.has(sc.coachId) && sc.teamLogoUrl) {
      coachLogoMap.set(sc.coachId, sc.teamLogoUrl);
    }
  }

  // 1. Longest average game time (no forfeits)
  const gameTimes = new Map<number, { totalMs: number; count: number; name: string }>();
  for (const m of s10Matches) {
    if (m.isForfeit || !m.startedAt || !m.endedAt) continue;
    const duration = new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime();
    if (duration <= 0 || duration > 3600000) continue; // skip invalid (>1hr)

    for (const scId of [m.coach1SeasonId, m.coach2SeasonId]) {
      const coach = scToCoach.get(scId);
      if (!coach) continue;
      const existing = gameTimes.get(coach.coachId) || { totalMs: 0, count: 0, name: coach.name };
      existing.totalMs += duration;
      existing.count += 1;
      gameTimes.set(coach.coachId, existing);
    }
  }

  const longestAvg = [...gameTimes.entries()]
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => (b[1].totalMs / b[1].count) - (a[1].totalMs / a[1].count))[0];
  if (longestAvg) {
    const avgMs = longestAvg[1].totalMs / longestAvg[1].count;
    const mins = Math.floor(avgMs / 60000);
    const secs = Math.round((avgMs % 60000) / 1000);
    entries.push({
      label: "Slowest Coach",
      value: `${mins}m ${secs}s avg`,
      description: `${longestAvg[1].name}'s games take the longest on average`,
      coachName: longestAvg[1].name,
      coachId: longestAvg[0],
    });
  }

  const shortestAvg = [...gameTimes.entries()]
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => (a[1].totalMs / a[1].count) - (b[1].totalMs / b[1].count))[0];
  if (shortestAvg && shortestAvg[0] !== longestAvg?.[0]) {
    const avgMs = shortestAvg[1].totalMs / shortestAvg[1].count;
    const mins = Math.floor(avgMs / 60000);
    const secs = Math.round((avgMs % 60000) / 1000);
    entries.push({
      label: "Speed Demon",
      value: `${mins}m ${secs}s avg`,
      description: `${shortestAvg[1].name} gets it done quick`,
      coachName: shortestAvg[1].name,
      coachId: shortestAvg[0],
    });
  }

  // 2. Clutch King — most wins by exactly 1 mon remaining
  const clutchWins = new Map<number, { count: number; name: string }>();
  for (const m of s10Matches) {
    if (!m.winnerId) continue;
    const diff = m.winnerId === m.coach1SeasonId
      ? (m.coach1Differential || 0)
      : (m.coach2Differential || 0);
    if (diff === 1) {
      const coach = scToCoach.get(m.winnerId);
      if (!coach) continue;
      const existing = clutchWins.get(coach.coachId) || { count: 0, name: coach.name };
      existing.count += 1;
      clutchWins.set(coach.coachId, existing);
    }
  }
  const topClutchCoach = [...clutchWins.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topClutchCoach) {
    entries.push({
      label: "Clutch King",
      value: `${topClutchCoach[1].count} wins by 1`,
      description: `${topClutchCoach[1].name} loves making it close`,
      coachName: topClutchCoach[1].name,
      coachId: topClutchCoach[0],
    });
  }

  // 3. Iron Wall — fewest kills given up per game (min 3 games, no forfeits)
  const nonForfeitMatches = s10Matches.filter(m => !m.isForfeit);
  const nonForfeitMatchIds = new Set(nonForfeitMatches.map(m => m.id));
  const killsGivenUp = new Map<number, { total: number; games: number; name: string }>();
  for (const k of s10KillEvents) {
    if (!k.victimSeasonCoachId || !nonForfeitMatchIds.has(k.matchId)) continue;
    const coach = scToCoach.get(k.victimSeasonCoachId);
    if (!coach) continue;
    const existing = killsGivenUp.get(coach.coachId) || { total: 0, games: 0, name: coach.name };
    existing.total += 1;
    killsGivenUp.set(coach.coachId, existing);
  }
  // Count non-forfeit games per coach
  for (const m of nonForfeitMatches) {
    for (const scId of [m.coach1SeasonId, m.coach2SeasonId]) {
      const coach = scToCoach.get(scId);
      if (!coach) continue;
      const existing = killsGivenUp.get(coach.coachId);
      if (existing) existing.games += 1;
    }
  }
  const ironWall = [...killsGivenUp.entries()]
    .filter(([, v]) => v.games >= 3)
    .sort((a, b) => (a[1].total / a[1].games) - (b[1].total / b[1].games))[0];
  if (ironWall) {
    const avg = (ironWall[1].total / ironWall[1].games).toFixed(1);
    entries.push({
      label: "Iron Wall",
      value: `${avg} deaths/game`,
      description: `${ironWall[1].name}'s team is the hardest to take down`,
      coachName: ironWall[1].name,
      coachId: ironWall[0],
    });
  }

  // 4. One Mon Army — coach with most games where a single Pokemon got 3+ kills
  const killsByMatchCoachPokemon = new Map<string, number>();
  for (const k of s10KillEvents) {
    if (!k.killerSeasonCoachId || !k.killerPokemonId) continue;
    const key = `${k.matchId}-${k.killerSeasonCoachId}-${k.killerPokemonId}`;
    killsByMatchCoachPokemon.set(key, (killsByMatchCoachPokemon.get(key) || 0) + 1);
  }
  const oneMonArmyMap = new Map<number, { count: number; name: string }>();
  for (const [key, kills] of killsByMatchCoachPokemon) {
    if (kills < 3) continue;
    const scId = parseInt(key.split('-')[1]);
    const coach = scToCoach.get(scId);
    if (!coach) continue;
    const existing = oneMonArmyMap.get(coach.coachId) || { count: 0, name: coach.name };
    existing.count += 1;
    oneMonArmyMap.set(coach.coachId, existing);
  }
  const topOneMonArmy = [...oneMonArmyMap.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topOneMonArmy) {
    entries.push({
      label: "One Mon Army",
      value: `${topOneMonArmy[1].count} carry games`,
      description: `${topOneMonArmy[1].name} often has a single Pokemon get 3+ KOs`,
      coachName: topOneMonArmy[1].name,
      coachId: topOneMonArmy[0],
    });
  }

  // 5. Overtime Specialist — most games past 30 turns
  const turnCounts = new Map<number, number>(); // matchId -> max turn
  for (const k of s10KillEvents) {
    const current = turnCounts.get(k.matchId) || 0;
    if (k.turn > current) turnCounts.set(k.matchId, k.turn);
  }
  const overtimeMap = new Map<number, { count: number; name: string }>();
  for (const m of s10Matches) {
    const maxTurn = turnCounts.get(m.id) || 0;
    if (maxTurn < 30) continue;
    for (const scId of [m.coach1SeasonId, m.coach2SeasonId]) {
      const coach = scToCoach.get(scId);
      if (!coach) continue;
      const existing = overtimeMap.get(coach.coachId) || { count: 0, name: coach.name };
      existing.count += 1;
      overtimeMap.set(coach.coachId, existing);
    }
  }
  const topOvertime = [...overtimeMap.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topOvertime) {
    entries.push({
      label: "Overtime Specialist",
      value: `${topOvertime[1].count} long games`,
      description: `${topOvertime[1].name} has the most games going 30+ turns`,
      coachName: topOvertime[1].name,
      coachId: topOvertime[0],
    });
  }

  // 6. Most forfeits received
  const forfeitWins = new Map<number, { count: number; name: string }>();
  for (const m of s10Matches) {
    if (!m.isForfeit || !m.winnerId) continue;
    const coach = scToCoach.get(m.winnerId);
    if (!coach) continue;
    const existing = forfeitWins.get(coach.coachId) || { count: 0, name: coach.name };
    existing.count += 1;
    forfeitWins.set(coach.coachId, existing);
  }
  const topForfeitReceiver = [...forfeitWins.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topForfeitReceiver && topForfeitReceiver[1].count >= 2) {
    entries.push({
      label: "Intimidation Factor",
      value: `${topForfeitReceiver[1].count} opponents forfeited`,
      description: `${topForfeitReceiver[1].name} scares people into quitting`,
      coachName: topForfeitReceiver[1].name,
      coachId: topForfeitReceiver[0],
    });
  }

  // 7. Most unique Pokemon used
  const pokemonUsed = new Map<number, { count: number; name: string }>();
  const scByCoach = new Map<number, number[]>();
  for (const sc of allSeasonCoaches) {
    if (!s10SeasonIds.has(sc.divisionId ? (allMatches.find(m => m.divisionId === sc.divisionId)?.seasonId || 0) : 0)) {
      // Use a different approach — check if any S10+ match references this seasonCoach
    }
    const list = scByCoach.get(sc.coachId) || [];
    list.push(sc.id);
    scByCoach.set(sc.coachId, list);
  }
  // Use matchPokemon to find unique pokemon per coach
  const s10MP = rawMP.filter(mp => mp.match && s10SeasonIds.has(mp.match.seasonId));
  const uniquePokemonByCoach = new Map<number, Set<number>>();
  for (const mp of s10MP) {
    const coach = scToCoach.get(mp.seasonCoachId);
    if (!coach) continue;
    const set = uniquePokemonByCoach.get(coach.coachId) || new Set();
    set.add(mp.pokemonId);
    uniquePokemonByCoach.set(coach.coachId, set);
  }
  const mostVariety = [...uniquePokemonByCoach.entries()]
    .sort((a, b) => b[1].size - a[1].size)[0];
  if (mostVariety) {
    const coach = allCoaches.find(c => c.id === mostVariety[0]);
    if (coach) {
      entries.push({
        label: "Variety Pack",
        value: `${mostVariety[1].size} different Pokemon`,
        description: `${coach.name} has fielded the most unique Pokemon`,
        coachName: coach.name,
        coachId: coach.id,
      });
    }
  }

  // Attach logos to all entries
  for (const entry of entries) {
    if (entry.coachId) {
      entry.logoUrl = coachLogoMap.get(entry.coachId) || null;
    }
  }

  return entries;
}

export default async function CoachStatsPage() {
  const funFacts = await getCoachFunFacts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="poke-card p-6">
        <div className="flex items-center gap-2 mb-2 text-sm">
          <Link
            href="/leaderboards"
            className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
          >
            Leaderboards
          </Link>
          <span className="text-[var(--foreground-subtle)]">/</span>
        </div>
        <h1 className="font-pixel text-xl md:text-2xl text-white">
          Coach Battle Stats
        </h1>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">
          Fun facts and records from Season 10 onwards
        </p>
      </div>

      {/* Fun Facts */}
      {funFacts.length > 0 && (
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
              {funFacts.map((stat, i) => {
                const content = (
                  <>
                    {stat.logoUrl && (
                      <img src={stat.logoUrl} alt="" className="w-10 h-10 object-contain mb-2" />
                    )}
                    <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wide font-bold mb-1">{stat.label}</p>
                    <p className="text-lg font-bold text-[var(--accent)]">{stat.value}</p>
                    <p className="text-[11px] text-[var(--foreground-muted)] mt-1 leading-snug">{stat.description}</p>
                  </>
                );
                return (
                  <div key={i} className="p-4 rounded-xl bg-[var(--background-secondary)] border border-[var(--background-tertiary)] hover:border-[var(--primary)]/30 transition-colors">
                    {stat.coachId ? (
                      <Link href={`/coaches/${stat.coachId}`} className="block">{content}</Link>
                    ) : content}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
