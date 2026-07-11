import Link from "next/link";
import { db } from "@/lib/db";
import { seasons, divisions, playoffMatches, seasonCoaches, matches } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { computeAndSortStandings } from "@/lib/standings-sort";
import { getSession } from "@/lib/session";
import { filterPublicDivisions, getPublicVisibilityState, isPublicSeasonVisible } from "@/lib/public-visibility";

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

async function getPlayoffData(seasonId: number, visibleDivisionIds?: Set<number>) {
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
    if (visibleDivisionIds && !visibleDivisionIds.has(p.divisionId)) continue;
    if (!byDivision[p.divisionId]) {
      byDivision[p.divisionId] = [];
    }
    byDivision[p.divisionId].push(p);
  }

  return byDivision;
}

// Get standings for each division to determine seeding
async function getStandingsByDivision(seasonId: number, visibleDivisionIds?: Set<number>) {
  // Fetch all data in parallel - no N+1 queries!
  const [allDivisions, allSeasonCoaches, allMatches] = await Promise.all([
    db.query.divisions.findMany({
      where: eq(divisions.seasonId, seasonId),
    }),
    db.query.seasonCoaches.findMany(),
    db.query.matches.findMany(),
  ]);

  // Build lookups for in-memory processing
  const coachesByDivision = new Map<number, typeof allSeasonCoaches>();
  for (const sc of allSeasonCoaches) {
    const list = coachesByDivision.get(sc.divisionId) || [];
    list.push(sc);
    coachesByDivision.set(sc.divisionId, list);
  }

  const matchesByDivision = new Map<number, typeof allMatches>();
  for (const m of allMatches) {
    const list = matchesByDivision.get(m.divisionId) || [];
    list.push(m);
    matchesByDivision.set(m.divisionId, list);
  }

  const standingsMap: Record<number, Map<number, number>> = {}; // divisionId -> Map<seasonCoachId, rank>

  const visibleDivisions = visibleDivisionIds
    ? allDivisions.filter((division) => visibleDivisionIds.has(division.id))
    : allDivisions;

  for (const div of visibleDivisions) {
    const divCoaches = coachesByDivision.get(div.id) || [];
    const divMatches = matchesByDivision.get(div.id) || [];

    // Build replacement map
    const replacementMap = new Map<number, number[]>();
    for (const sc of divCoaches) {
      if (!sc.isActive && sc.replacedById) {
        const predecessors = replacementMap.get(sc.replacedById) || [];
        predecessors.push(sc.id);
        replacementMap.set(sc.replacedById, predecessors);
      }
    }

    const activeCoaches = divCoaches.filter((sc) => sc.isActive);
    const standings = computeAndSortStandings(activeCoaches, replacementMap, divMatches);

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
  compact = false,
}: {
  match: PlayoffMatch;
  roundName: string;
  seedingMap?: Map<number, number>;
  compact?: boolean;
}) {
  const higherSeedTeam = match.higherSeed;
  const lowerSeedTeam = match.lowerSeed;
  const hasWinner = !!match.winnerId;

  // Get actual seeding from standings
  const higherSeedRank = higherSeedTeam && seedingMap ? seedingMap.get(match.higherSeedId!) : null;
  const lowerSeedRank = lowerSeedTeam && seedingMap ? seedingMap.get(match.lowerSeedId!) : null;

  return (
    <div className={`bg-[var(--background-secondary)] rounded-lg border-2 border-[var(--background-tertiary)] overflow-hidden ${compact ? 'flex-1' : 'min-w-[200px]'}`}>
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
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-5 h-5 rounded bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0 border border-[var(--primary)]/30">
              <span className="text-[10px] font-bold text-[var(--primary)]">
                {higherSeedRank || (higherSeedTeam ? '-' : '?')}
              </span>
            </div>
            {higherSeedTeam?.teamLogoUrl && (
              <img src={higherSeedTeam.teamLogoUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
            )}
            <span className={`font-bold truncate ${compact ? 'text-xs' : 'text-sm'}`}>
              {higherSeedTeam?.teamAbbreviation || higherSeedTeam?.teamName || 'TBD'}
            </span>
          </div>
          {hasWinner && (
            <span className={`font-bold w-5 text-center shrink-0 ${match.winnerId === match.higherSeedId ? 'text-[var(--success)]' : 'text-[var(--foreground-muted)]'}`}>
              {match.higherSeedWins || 0}
            </span>
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
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-5 h-5 rounded bg-[var(--background-tertiary)] flex items-center justify-center flex-shrink-0 border border-[var(--background-tertiary)]">
              <span className="text-[10px] font-bold text-[var(--foreground-muted)]">
                {lowerSeedRank || (lowerSeedTeam ? '-' : '?')}
              </span>
            </div>
            {lowerSeedTeam?.teamLogoUrl && (
              <img src={lowerSeedTeam.teamLogoUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
            )}
            <span className={`font-bold truncate ${compact ? 'text-xs' : 'text-sm'}`}>
              {lowerSeedTeam?.teamAbbreviation || lowerSeedTeam?.teamName || 'TBD'}
            </span>
          </div>
          {hasWinner && (
            <span className={`font-bold w-5 text-center shrink-0 ${match.winnerId === match.lowerSeedId ? 'text-[var(--success)]' : 'text-[var(--foreground-muted)]'}`}>
              {match.lowerSeedWins || 0}
            </span>
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

  // Check if this division promotes finalists
  const divisionTier = DIVISION_TIERS[divisionName] || 2;
  const canPromote = divisionTier > 1; // Not top division

  return (
    <div className="poke-card p-4 sm:p-6 overflow-x-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-pixel text-sm text-white leading-relaxed">{divisionName}</h2>
          {canPromote && (
            <span className="text-[10px] px-2 py-1 rounded bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30 font-bold uppercase">
              Finalists promote
            </span>
          )}
        </div>
        {champion && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 self-start sm:self-auto">
            <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            <span className="font-bold text-yellow-400 text-sm">{champion.teamName}</span>
          </div>
        )}
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
        <>
          {/* Mobile Layout - Vertical Stacked Rounds */}
          <div className="lg:hidden space-y-6">
            {/* Quarterfinals */}
            <div>
              <div className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider mb-3">
                Quarterfinals
              </div>
              <div className="grid grid-cols-2 gap-2">
                {quarterfinals.map((match) => (
                  <PlayoffMatchCard key={match.id} match={match} roundName={`QF${match.bracketPosition}`} seedingMap={seedingMap} compact />
                ))}
              </div>
            </div>

            {/* Arrow down */}
            <div className="flex justify-center">
              <svg className="w-6 h-6 text-[var(--background-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>

            {/* Semifinals */}
            <div>
              <div className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider mb-3">
                Semifinals
              </div>
              <div className="grid grid-cols-2 gap-2">
                {semifinals.map((match) => (
                  <PlayoffMatchCard key={match.id} match={match} roundName={`SF${match.bracketPosition}`} seedingMap={seedingMap} compact />
                ))}
              </div>
            </div>

            {/* Arrow down */}
            <div className="flex justify-center">
              <svg className="w-6 h-6 text-[var(--background-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>

            {/* Finals + Champion */}
            <div>
              <div className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider mb-3">
                Championship
              </div>
              <div className="flex flex-col items-center gap-4">
                {finals.length > 0 ? (
                  <div className="w-full max-w-xs">
                    <PlayoffMatchCard match={finals[0]} roundName="Finals" seedingMap={seedingMap} compact />
                  </div>
                ) : (
                  <div className="bg-[var(--background-secondary)] rounded-lg border-2 border-dashed border-[var(--background-tertiary)] p-4 w-full max-w-xs text-center">
                    <span className="text-sm text-[var(--foreground-muted)] font-bold">TBD</span>
                  </div>
                )}

                {/* Champion Badge */}
                <div className="flex flex-col items-center">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 ${
                    champion
                      ? 'bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-400'
                      : 'bg-[var(--background-secondary)] border-dashed border-[var(--background-tertiary)]'
                  }`}>
                    {champion ? (
                      <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                      </svg>
                    ) : (
                      <span className="text-xl text-[var(--foreground-muted)] font-pixel">?</span>
                    )}
                  </div>
                  <span className="mt-2 text-[10px] font-bold text-yellow-400 uppercase">Champion</span>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Layout - Horizontal Bracket */}
          <div className="hidden lg:block min-w-[900px]">
            {/* Round Headers */}
            <div className="flex items-end gap-6 mb-4">
              <div className="w-[220px] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider">
                Quarterfinals
              </div>
              <div className="w-[40px]"></div>
              <div className="w-[220px] text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider">
                Semifinals
              </div>
              <div className="w-[40px]"></div>
              <div className="w-[220px] text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider">
                Finals
              </div>
              <div className="w-[80px] text-[10px] font-bold text-yellow-400 uppercase tracking-wider text-center">
                Champion
              </div>
            </div>

            {/* Bracket Structure */}
            <div className="flex items-stretch gap-6">
              {/* Quarterfinals */}
              <div className="flex flex-col justify-around gap-3 w-[220px]">
                <div className="flex flex-col gap-3">
                  {quarterfinals.slice(0, 2).map((match) => (
                    <PlayoffMatchCard key={match.id} match={match} roundName={`QF ${match.bracketPosition}`} seedingMap={seedingMap} />
                  ))}
                </div>
                <div className="flex flex-col gap-3">
                  {quarterfinals.slice(2, 4).map((match) => (
                    <PlayoffMatchCard key={match.id} match={match} roundName={`QF ${match.bracketPosition}`} seedingMap={seedingMap} />
                  ))}
                </div>
              </div>

              {/* Bracket connector QF -> SF */}
              <div className="flex flex-col justify-around w-[40px]">
                <svg width="40" height="100" className="text-[var(--background-tertiary)]">
                  <path d="M0 25 H15 V50 H40" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M0 75 H15 V50 H40" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
                <svg width="40" height="100" className="text-[var(--background-tertiary)]">
                  <path d="M0 25 H15 V50 H40" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M0 75 H15 V50 H40" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>

              {/* Semifinals */}
              <div className="flex flex-col justify-around w-[220px]">
                {semifinals.map((match) => (
                  <PlayoffMatchCard key={match.id} match={match} roundName={`SF ${match.bracketPosition}`} seedingMap={seedingMap} />
                ))}
              </div>

              {/* Bracket connector SF -> Finals */}
              <div className="flex items-center w-[40px]">
                <svg width="40" height="200" className="text-[var(--background-tertiary)]">
                  <path d="M0 50 H15 V100 H40" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M0 150 H15 V100 H40" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>

              {/* Finals */}
              <div className="flex items-center w-[220px]">
                {finals.length > 0 ? (
                  <PlayoffMatchCard match={finals[0]} roundName="Championship" seedingMap={seedingMap} />
                ) : (
                  <div className="bg-[var(--background-secondary)] rounded-lg border-2 border-dashed border-[var(--background-tertiary)] p-4 w-full text-center">
                    <span className="text-sm text-[var(--foreground-muted)] font-bold">TBD</span>
                  </div>
                )}
              </div>

              {/* Champion */}
              <div className="flex items-center justify-center w-[80px]">
                <div className="flex flex-col items-center">
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
                    <span className="mt-2 font-bold text-xs text-center text-yellow-400 max-w-[80px] truncate">{champion.teamName}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default async function PlayoffsPage({ params }: PageProps) {
  const resolvedParams = await params;
  const seasonId = parseInt(resolvedParams.id);

  // Fetch all data in parallel
  const [season, session, visibility] = await Promise.all([
    getSeason(seasonId),
    getSession(),
    getPublicVisibilityState(),
  ]);

  if (!season || (!session?.isMod && !isPublicSeasonVisible(season))) {
    notFound();
  }

  if (!session?.isMod) {
    season.divisions = filterPublicDivisions(season.divisions, visibility);
  }

  const visibleDivisionIds = new Set(season.divisions.map((division) => division.id));
  const [playoffsByDivision, standingsByDivision] = await Promise.all([
    getPlayoffData(seasonId, visibleDivisionIds),
    getStandingsByDivision(seasonId, visibleDivisionIds),
  ]);

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
            <p>The top eight teams from the regular season qualify. Higher seeds choose their opponents.</p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--background)]/50 border border-[var(--background-tertiary)]">
            <p className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider">Format</p>
            <p>A single-elimination bracket. Quarterfinals → Semifinals → Finals determine the champion.</p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--background)]/50 border border-[var(--background-tertiary)]">
            <p className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider">Promotion</p>
            <p>Both finalists—the champion and runner-up—are promoted to the next division. Stargazer is the top division.</p>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t-2 border-[var(--background-tertiary)]">
          <p className="text-xs text-[var(--foreground-muted)]">
            <span className="font-bold text-white uppercase">Division Hierarchy:</span>{" "}
            <span className="text-blue-500">Stargazer</span> (Top) → <span className="text-orange-400">Sunset</span> → <span className="text-purple-400">Crystal</span> → <span className="text-green-400">Neon</span> (Bottom)
          </p>
        </div>
      </div>
    </div>
  );
}
