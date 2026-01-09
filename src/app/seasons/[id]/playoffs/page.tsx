import Link from "next/link";
import { db } from "@/lib/db";
import { seasons, divisions, playoffMatches, seasonCoaches, matches } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";

// Division hierarchy (1 = top, 4 = bottom)
const DIVISION_TIERS: Record<string, number> = {
  "Stargazer": 1,
  "Sunset": 2,
  "Crystal": 3,
  "Neon": 4,
};

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getSeason(id: number) {
  const season = await db.query.seasons.findFirst({
    where: eq(seasons.id, id),
    with: {
      divisions: true,
    },
  });

  if (season) {
    season.divisions.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }

  return season;
}

async function getPlayoffData(seasonId: number) {
  const playoffs = await db.query.playoffMatches.findMany({
    where: eq(playoffMatches.seasonId, seasonId),
    with: {
      division: true,
      higherSeed: { with: { coach: true } },
      lowerSeed: { with: { coach: true } },
      winner: { with: { coach: true } },
    },
    orderBy: (p, { asc }) => [asc(p.divisionId), asc(p.round), asc(p.bracketPosition)],
  });

  // Group by division
  const byDivision: Record<number, typeof playoffs> = {};
  for (const p of playoffs) {
    if (!byDivision[p.divisionId]) {
      byDivision[p.divisionId] = [];
    }
    byDivision[p.divisionId].push(p);
  }

  return byDivision;
}

// Get standings for each division to determine seeding
async function getStandingsByDivision(seasonId: number) {
  const allDivisions = await db.query.divisions.findMany({
    where: eq(divisions.seasonId, seasonId),
  });

  const standingsMap: Record<number, Map<number, number>> = {}; // divisionId -> Map<seasonCoachId, rank>

  for (const div of allDivisions) {
    const allCoaches = await db.query.seasonCoaches.findMany({
      where: eq(seasonCoaches.divisionId, div.id),
    });

    // Build replacement map
    const replacementMap = new Map<number, number[]>();
    for (const sc of allCoaches) {
      if (!sc.isActive && sc.replacedById) {
        const predecessors = replacementMap.get(sc.replacedById) || [];
        predecessors.push(sc.id);
        replacementMap.set(sc.replacedById, predecessors);
      }
    }

    const activeCoaches = allCoaches.filter((sc) => sc.isActive);

    const standings = await Promise.all(
      activeCoaches.map(async (sc) => {
        const teamIds = [sc.id, ...(replacementMap.get(sc.id) || [])];
        let wins = 0;
        let differential = 0;

        for (const teamId of teamIds) {
          const matchesAsCoach1 = await db.query.matches.findMany({
            where: and(
              eq(matches.coach1SeasonId, teamId),
              eq(matches.divisionId, div.id)
            ),
          });
          const matchesAsCoach2 = await db.query.matches.findMany({
            where: and(
              eq(matches.coach2SeasonId, teamId),
              eq(matches.divisionId, div.id)
            ),
          });

          for (const m of matchesAsCoach1) {
            // Skip playoff matches (week > 100)
            if (m.week > 100) continue;
            if (m.winnerId === teamId) wins++;
            differential += m.coach1Differential || 0;
          }
          for (const m of matchesAsCoach2) {
            // Skip playoff matches (week > 100)
            if (m.week > 100) continue;
            if (m.winnerId === teamId) wins++;
            differential += m.coach2Differential || 0;
          }
        }

        return { id: sc.id, wins, differential };
      })
    );

    // Sort by wins, then differential
    standings.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.differential - a.differential;
    });

    // Create rank map
    const rankMap = new Map<number, number>();
    standings.forEach((s, idx) => {
      rankMap.set(s.id, idx + 1);
    });

    standingsMap[div.id] = rankMap;
  }

  return standingsMap;
}

type PlayoffMatch = Awaited<ReturnType<typeof getPlayoffData>>[number][number];

function PlayoffMatchCard({
  match,
  roundName,
  seedingMap,
}: {
  match: PlayoffMatch;
  roundName: string;
  seedingMap?: Map<number, number>;
}) {
  const higherSeedTeam = match.higherSeed;
  const lowerSeedTeam = match.lowerSeed;
  const hasWinner = !!match.winnerId;

  // Get actual seeding from standings
  const higherSeedRank = higherSeedTeam && seedingMap ? seedingMap.get(match.higherSeedId!) : null;
  const lowerSeedRank = lowerSeedTeam && seedingMap ? seedingMap.get(match.lowerSeedId!) : null;

  return (
    <div className="bg-[var(--background-secondary)] rounded-lg border-2 border-[var(--background-tertiary)] overflow-hidden min-w-[200px]">
      <div className="px-3 py-1.5 bg-[var(--background-tertiary)] border-b-2 border-[var(--background-tertiary)]">
        <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider">{roundName}</span>
      </div>
      <div className="divide-y-2 divide-[var(--background-tertiary)]">
        {/* Higher seed */}
        <div className={`flex items-center justify-between px-3 py-2 ${
          hasWinner && match.winnerId === match.higherSeedId
            ? 'bg-[var(--success)]/10'
            : hasWinner && match.winnerId !== match.higherSeedId
            ? 'opacity-50'
            : ''
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0 border border-[var(--primary)]/30">
              <span className="text-[10px] font-bold text-[var(--primary)]">
                {higherSeedRank || (higherSeedTeam ? '-' : '?')}
              </span>
            </div>
            <span className="font-bold text-sm truncate max-w-[120px]">
              {higherSeedTeam?.teamName || 'TBD'}
            </span>
          </div>
          {hasWinner && (
            <div className="flex items-center gap-1">
              <span className={`font-bold ${match.winnerId === match.higherSeedId ? 'text-[var(--success)]' : 'text-[var(--foreground-muted)]'}`}>
                {match.higherSeedWins || 0}
              </span>
              {match.winnerId === match.higherSeedId && (
                <svg className="w-4 h-4 text-[var(--success)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              )}
            </div>
          )}
        </div>
        {/* Lower seed */}
        <div className={`flex items-center justify-between px-3 py-2 ${
          hasWinner && match.winnerId === match.lowerSeedId
            ? 'bg-[var(--success)]/10'
            : hasWinner && match.winnerId !== match.lowerSeedId
            ? 'opacity-50'
            : ''
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[var(--background-tertiary)] flex items-center justify-center flex-shrink-0 border border-[var(--background-tertiary)]">
              <span className="text-[10px] font-bold text-[var(--foreground-muted)]">
                {lowerSeedRank || (lowerSeedTeam ? '-' : '?')}
              </span>
            </div>
            <span className="font-bold text-sm truncate max-w-[120px]">
              {lowerSeedTeam?.teamName || 'TBD'}
            </span>
          </div>
          {hasWinner && (
            <div className="flex items-center gap-1">
              <span className={`font-bold ${match.winnerId === match.lowerSeedId ? 'text-[var(--success)]' : 'text-[var(--foreground-muted)]'}`}>
                {match.lowerSeedWins || 0}
              </span>
              {match.winnerId === match.lowerSeedId && (
                <svg className="w-4 h-4 text-[var(--success)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayoffBracket({
  matches,
  divisionName,
  seedingMap,
}: {
  matches: PlayoffMatch[];
  divisionName: string;
  seedingMap?: Map<number, number>;
}) {
  // Organize matches by round
  const quarterfinals = matches.filter(m => m.round === 1).sort((a, b) => a.bracketPosition - b.bracketPosition);
  const semifinals = matches.filter(m => m.round === 2).sort((a, b) => a.bracketPosition - b.bracketPosition);
  const finals = matches.filter(m => m.round === 3);

  // Get champion and finalist (runner-up)
  const champion = finals[0]?.winner;
  const finalist = finals[0] ? (
    finals[0].winnerId === finals[0].higherSeedId ? finals[0].lowerSeed : finals[0].higherSeed
  ) : null;

  // Check if this division promotes finalists
  const divisionTier = DIVISION_TIERS[divisionName] || 2;
  const canPromote = divisionTier > 1; // Not top division

  return (
    <div className="poke-card p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-pixel text-sm text-white leading-relaxed">{divisionName}</h2>
          {canPromote && (
            <span className="text-[10px] px-2 py-1 rounded bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30 font-bold uppercase">
              Finalists promote
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {champion && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              <span className="font-bold text-yellow-400">{champion.teamName}</span>
            </div>
          )}
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12 text-[var(--foreground-muted)]">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="font-bold">Playoffs not yet started</p>
          <p className="text-sm">Bracket will appear once quarterfinal matchups are set</p>
        </div>
      ) : (
        <div className="flex items-center gap-8 min-w-[800px]">
          {/* Quarterfinals */}
          <div className="flex flex-col gap-8">
            <div className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider mb-2">
              Quarterfinals
            </div>
            <div className="flex flex-col gap-4">
              {quarterfinals.slice(0, 2).map((match) => (
                <PlayoffMatchCard key={match.id} match={match} roundName={`QF ${match.bracketPosition}`} seedingMap={seedingMap} />
              ))}
            </div>
            <div className="flex flex-col gap-4">
              {quarterfinals.slice(2, 4).map((match) => (
                <PlayoffMatchCard key={match.id} match={match} roundName={`QF ${match.bracketPosition}`} seedingMap={seedingMap} />
              ))}
            </div>
          </div>

          {/* Bracket connector */}
          <div className="flex flex-col items-center justify-center gap-[120px]">
            <svg width="40" height="80" className="text-[var(--background-tertiary)]">
              <path d="M0 20 H20 V40 H40" fill="none" stroke="currentColor" strokeWidth="3" />
              <path d="M0 60 H20 V40 H40" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
            <svg width="40" height="80" className="text-[var(--background-tertiary)]">
              <path d="M0 20 H20 V40 H40" fill="none" stroke="currentColor" strokeWidth="3" />
              <path d="M0 60 H20 V40 H40" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
          </div>

          {/* Semifinals */}
          <div className="flex flex-col gap-[120px]">
            <div className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider mb-2">
              Semifinals
            </div>
            {semifinals.map((match) => (
              <PlayoffMatchCard key={match.id} match={match} roundName={`SF ${match.bracketPosition}`} seedingMap={seedingMap} />
            ))}
          </div>

          {/* Bracket connector to finals */}
          <div className="flex items-center">
            <svg width="40" height="160" className="text-[var(--background-tertiary)]">
              <path d="M0 40 H20 V80 H40" fill="none" stroke="currentColor" strokeWidth="3" />
              <path d="M0 120 H20 V80 H40" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
          </div>

          {/* Finals */}
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider mb-2">
              Finals
            </div>
            {finals.length > 0 ? (
              <PlayoffMatchCard match={finals[0]} roundName="Championship" seedingMap={seedingMap} />
            ) : (
              <div className="bg-[var(--background-secondary)] rounded-lg border-2 border-dashed border-[var(--background-tertiary)] p-4 min-w-[200px] text-center">
                <span className="text-sm text-[var(--foreground-muted)] font-bold">TBD</span>
              </div>
            )}
          </div>

          {/* Champion */}
          <div className="flex flex-col items-center ml-4">
            <div className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider mb-2">
              Champion
            </div>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center border-4 ${
              champion
                ? 'bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-400'
                : 'bg-[var(--background-secondary)] border-dashed border-[var(--background-tertiary)]'
            }`}>
              {champion ? (
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              ) : (
                <span className="text-2xl text-[var(--foreground-muted)] font-pixel">?</span>
              )}
            </div>
            {champion && (
              <span className="mt-2 font-bold text-sm text-center text-yellow-400">{champion.teamName}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function PlayoffsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const seasonId = parseInt(resolvedParams.id);
  const season = await getSeason(seasonId);

  if (!season) {
    notFound();
  }

  const playoffsByDivision = await getPlayoffData(seasonId);
  const standingsByDivision = await getStandingsByDivision(seasonId);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-3 text-sm">
              <Link
                href="/seasons"
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                Seasons
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <Link
                href={`/seasons/${seasonId}`}
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors"
              >
                {season.name}
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
              <span className="text-[var(--foreground-subtle)]">Playoffs</span>
            </div>

            {/* Title */}
            <div className="flex items-center gap-4">
              <svg className="w-8 h-8 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
                Playoffs
              </h1>
            </div>

            <p className="text-[var(--foreground-muted)] mt-2">
              Top 8 teams compete for the championship
            </p>
          </div>

          {/* Action Button */}
          <Link href={`/seasons/${seasonId}`}>
            <button className="btn-retro-secondary py-2 px-4 text-[10px] flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Season
            </button>
          </Link>
        </div>
      </div>

      {/* Playoff Brackets */}
      <div className="space-y-8">
        {season.divisions.map((div) => (
          <PlayoffBracket
            key={div.id}
            matches={playoffsByDivision[div.id] || []}
            divisionName={div.name}
            seedingMap={standingsByDivision[div.id]}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="poke-card p-6">
        <div className="section-title mb-4">
          <div className="section-title-icon">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3>How Playoffs Work</h3>
        </div>
        <div className="grid gap-6 md:grid-cols-3 text-sm text-[var(--foreground-muted)]">
          <div className="p-4 rounded-lg bg-[var(--background)]/50 border border-[var(--background-tertiary)]">
            <p className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider">Seeding</p>
            <p>Top 8 teams from regular season qualify. Higher seeds choose their opponents.</p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--background)]/50 border border-[var(--background-tertiary)]">
            <p className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider">Format</p>
            <p>Single elimination bracket. QF → SF → Finals to determine champion.</p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--background)]/50 border border-[var(--background-tertiary)]">
            <p className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider">Promotion</p>
            <p>Both finalists (champion + runner-up) promote to the next division up. Stargazer is the top division.</p>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t-2 border-[var(--background-tertiary)]">
          <p className="text-xs text-[var(--foreground-muted)]">
            <span className="font-bold text-white uppercase">Division Hierarchy:</span>{" "}
            <span className="text-yellow-400">Stargazer</span> (Top) → <span className="text-orange-400">Sunset</span> → <span className="text-cyan-400">Crystal</span> → <span className="text-pink-400">Neon</span> (Bottom)
          </p>
        </div>
      </div>
    </div>
  );
}
