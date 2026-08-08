import Link from "next/link";
import { db } from "@/lib/db";

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

  // Get Season 11 IDs
  const allSeasons = await db.query.seasons.findMany();
  const seasonNumberById = new Map(allSeasons.map((season) => [season.id, season.seasonNumber]));
  const season11Ids = new Set(allSeasons.filter((s) => s.seasonNumber === 11).map((s) => s.id));

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

  const s11Matches = allMatches.filter((m) => season11Ids.has(m.seasonId) && m.winnerId);
  const s11KillEvents = rawKillEvents.filter((k) => k.match && season11Ids.has(k.match.seasonId));

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
  for (const m of s11Matches) {
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
      label: "The Timekeeper",
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
  for (const m of s11Matches) {
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
      label: "King Clutch",
      value: `${topClutchCoach[1].count} wins by 1`,
      description: `${topClutchCoach[1].name} loves making it close`,
      coachName: topClutchCoach[1].name,
      coachId: topClutchCoach[0],
    });
  }

  // 3. Iron Wall — fewest kills given up per game (min 3 games, no forfeits)
  const nonForfeitMatches = s11Matches.filter(m => !m.isForfeit);
  const nonForfeitMatchIds = new Set(nonForfeitMatches.map(m => m.id));
  const killsGivenUp = new Map<number, { total: number; games: number; name: string }>();
  for (const k of s11KillEvents) {
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
  for (const k of s11KillEvents) {
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
  for (const k of s11KillEvents) {
    const current = turnCounts.get(k.matchId) || 0;
    if (k.turn > current) turnCounts.set(k.matchId, k.turn);
  }
  const overtimeMap = new Map<number, { count: number; name: string }>();
  for (const m of s11Matches) {
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

  // 6. Team Player - most games where 4+ different Pokemon got a KO
  const pokemonKillersByMatchCoach = new Map<string, Set<number>>();
  for (const k of s11KillEvents) {
    if (!k.killerSeasonCoachId || !k.killerPokemonId || !nonForfeitMatchIds.has(k.matchId)) continue;
    const key = `${k.matchId}-${k.killerSeasonCoachId}`;
    const set = pokemonKillersByMatchCoach.get(key) || new Set<number>();
    set.add(k.killerPokemonId);
    pokemonKillersByMatchCoach.set(key, set);
  }

  const teamPlayerMap = new Map<number, { count: number; name: string }>();
  for (const [key, pokemonIds] of pokemonKillersByMatchCoach) {
    if (pokemonIds.size < 4) continue;
    const scId = parseInt(key.split("-")[1]);
    const coach = scToCoach.get(scId);
    if (!coach) continue;
    const existing = teamPlayerMap.get(coach.coachId) || { count: 0, name: coach.name };
    existing.count += 1;
    teamPlayerMap.set(coach.coachId, existing);
  }
  const topTeamPlayer = [...teamPlayerMap.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topTeamPlayer) {
    entries.push({
      label: "Team Player",
      value: `${topTeamPlayer[1].count} balanced games`,
      description: `${topTeamPlayer[1].name} most often has 4+ Pokemon record a KO`,
      coachName: topTeamPlayer[1].name,
      coachId: topTeamPlayer[0],
    });
  }

  // 7. Heartbreaker - most losses by exactly 1 Pokemon
  const heartbreaks = new Map<number, { count: number; name: string }>();
  for (const m of nonForfeitMatches) {
    if (!m.winnerId) continue;
    const winnerDiff = m.winnerId === m.coach1SeasonId
      ? (m.coach1Differential || 0)
      : (m.coach2Differential || 0);
    if (winnerDiff !== 1) continue;

    const loserId = m.winnerId === m.coach1SeasonId ? m.coach2SeasonId : m.coach1SeasonId;
    const coach = scToCoach.get(loserId);
    if (!coach) continue;
    const existing = heartbreaks.get(coach.coachId) || { count: 0, name: coach.name };
    existing.count += 1;
    heartbreaks.set(coach.coachId, existing);
  }
  const topHeartbreaker = [...heartbreaks.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topHeartbreaker) {
    entries.push({
      label: "Heartbreaker",
      value: `${topHeartbreaker[1].count} losses by 1`,
      description: `${topHeartbreaker[1].name} has the most narrow losses`,
      coachName: topHeartbreaker[1].name,
      coachId: topHeartbreaker[0],
    });
  }

  // 8. Bounce Back - most wins immediately after a loss
  const matchHistory = new Map<number, { won: boolean; seasonNumber: number; week: number; matchId: number; name: string }[]>();
  for (const m of nonForfeitMatches) {
    if (!m.winnerId) continue;
    const seasonNumber = seasonNumberById.get(m.seasonId) ?? 0;
    for (const scId of [m.coach1SeasonId, m.coach2SeasonId]) {
      const coach = scToCoach.get(scId);
      if (!coach) continue;
      const list = matchHistory.get(coach.coachId) || [];
      list.push({
        won: m.winnerId === scId,
        seasonNumber,
        week: m.week,
        matchId: m.id,
        name: coach.name,
      });
      matchHistory.set(coach.coachId, list);
    }
  }

  const bounceBackMap = new Map<number, { count: number; name: string }>();
  for (const [coachId, history] of matchHistory) {
    const sortedHistory = history.sort((a, b) =>
      a.seasonNumber - b.seasonNumber || a.week - b.week || a.matchId - b.matchId
    );
    let count = 0;
    for (let i = 1; i < sortedHistory.length; i += 1) {
      if (!sortedHistory[i - 1].won && sortedHistory[i].won) {
        count += 1;
      }
    }
    if (count > 0) {
      bounceBackMap.set(coachId, { count, name: sortedHistory[0].name });
    }
  }
  const topBounceBack = [...bounceBackMap.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topBounceBack) {
    entries.push({
      label: "Bounce Back",
      value: `${topBounceBack[1].count} rebound wins`,
      description: `${topBounceBack[1].name} wins most often right after a loss`,
      coachName: topBounceBack[1].name,
      coachId: topBounceBack[0],
    });
  }

  // 9. Late Game Closer - most KOs after turn 20
  const lateGameClosers = new Map<number, { count: number; name: string }>();
  for (const k of s11KillEvents) {
    if (!k.killerSeasonCoachId || k.turn <= 20 || !nonForfeitMatchIds.has(k.matchId)) continue;
    const coach = scToCoach.get(k.killerSeasonCoachId);
    if (!coach) continue;
    const existing = lateGameClosers.get(coach.coachId) || { count: 0, name: coach.name };
    existing.count += 1;
    lateGameClosers.set(coach.coachId, existing);
  }
  const topLateGameCloser = [...lateGameClosers.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (topLateGameCloser) {
    entries.push({
      label: "Late Game Closer",
      value: `${topLateGameCloser[1].count} late KOs`,
      description: `${topLateGameCloser[1].name} has the most KOs after turn 20`,
      coachName: topLateGameCloser[1].name,
      coachId: topLateGameCloser[0],
    });
  }

  // 10. Most unique Pokemon used
  const scByCoach = new Map<number, number[]>();
  for (const sc of allSeasonCoaches) {
    if (!season11Ids.has(sc.divisionId ? (allMatches.find(m => m.divisionId === sc.divisionId)?.seasonId || 0) : 0)) {
      // Use a different approach — check if any S11 match references this seasonCoach
    }
    const list = scByCoach.get(sc.coachId) || [];
    list.push(sc.id);
    scByCoach.set(sc.coachId, list);
  }
  // Use matchPokemon to find unique pokemon per coach
  const s11MP = rawMP.filter((mp) => mp.match && season11Ids.has(mp.match.seasonId));
  const uniquePokemonByCoach = new Map<number, Set<number>>();
  for (const mp of s11MP) {
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="poke-card p-4 sm:p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm sm:text-base">
          <Link
            href="/leaderboards"
            className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
          >
            Leaderboards
          </Link>
          <span className="text-[var(--foreground-subtle)]">/</span>
        </div>
        <h1 className="font-pixel text-2xl text-white sm:text-3xl md:text-4xl">
          Coach Battle Stats
        </h1>
        <p className="mt-1 text-base text-[var(--foreground-muted)]">
          Fun facts and records from Season 11
        </p>
      </div>

      {/* Fun Facts */}
      {funFacts.length > 0 && (
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
              {funFacts.map((stat, i) => {
                const content = (
                  <>
                    {stat.logoUrl && (
                      <img src={stat.logoUrl} alt="" className="mb-2 h-10 w-10 shrink-0 object-contain" />
                    )}
                    <p className="mb-1 break-words text-sm font-bold uppercase tracking-wide text-[var(--foreground-muted)]">{stat.label}</p>
                    <p className="break-words text-xl font-bold leading-tight text-[var(--accent)] sm:text-2xl">{stat.value}</p>
                    <p className="mt-1 break-words text-sm leading-snug text-[var(--foreground-muted)]">{stat.description}</p>
                  </>
                );
                return (
                  <div key={i} className="min-w-0 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] transition-colors hover:border-[var(--primary)]/30">
                    {stat.coachId ? (
                      <Link href={`/coaches/${stat.coachId}`} className="block h-full min-w-0 p-3 sm:p-4">{content}</Link>
                    ) : (
                      <div className="min-w-0 p-3 sm:p-4">{content}</div>
                    )}
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
