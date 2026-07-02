import Link from "next/link";
import { db } from "@/lib/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { matches } from "@/lib/schema";
import { BattleRecordTable, type BattleRecordRow } from "./battle-record-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Battle Record",
};

async function getBattleRecords(): Promise<BattleRecordRow[]> {
  const [allCoaches, allSeasonCoaches, allMatches, allSeasons] = await Promise.all([
    db.query.coaches.findMany({
      columns: {
        id: true,
        name: true,
      },
    }),
    db.query.seasonCoaches.findMany({
      columns: {
        id: true,
        coachId: true,
        teamLogoUrl: true,
      },
    }),
    db.query.matches.findMany({
      columns: {
        id: true,
        seasonId: true,
        week: true,
        coach1SeasonId: true,
        coach2SeasonId: true,
        winnerId: true,
        coach1Differential: true,
        coach2Differential: true,
        endedAt: true,
        playedAt: true,
        scheduledAt: true,
      },
      where: and(
        isNotNull(matches.winnerId),
        eq(matches.isForfeit, false)
      ),
    }),
    db.query.seasons.findMany({
      columns: {
        id: true,
        seasonNumber: true,
      },
    }),
  ]);

  const coachBySeasonCoachId = new Map(allSeasonCoaches.map((sc) => [sc.id, sc.coachId]));
  const coachNameById = new Map(allCoaches.map((coach) => [coach.id, coach.name]));
  const seasonNumberById = new Map(allSeasons.map((season) => [season.id, season.seasonNumber]));
  const coachLogoMap = new Map<number, string | null>();
  const sortedSeasonCoaches = [...allSeasonCoaches].sort((a, b) => b.id - a.id);

  for (const seasonCoach of sortedSeasonCoaches) {
    if (!coachLogoMap.has(seasonCoach.coachId) && seasonCoach.teamLogoUrl) {
      coachLogoMap.set(seasonCoach.coachId, seasonCoach.teamLogoUrl);
    }
  }

  const stats = new Map<number, {
    games: number;
    wins: number;
    differential: number;
    winDifferential: number;
    winCount: number;
    lossDifferential: number;
    lossCount: number;
    closeGames: number;
    closeWins: number;
    bigWins: number;
    recentResults: Array<{ won: boolean; sortValue: number }>;
  }>();

  function getStats(coachId: number) {
    const existing = stats.get(coachId);
    if (existing) return existing;

    const created = {
      games: 0,
      wins: 0,
      differential: 0,
      winDifferential: 0,
      winCount: 0,
      lossDifferential: 0,
      lossCount: 0,
      closeGames: 0,
      closeWins: 0,
      bigWins: 0,
      recentResults: [],
    };
    stats.set(coachId, created);
    return created;
  }

  for (const match of allMatches) {
    if (!match.winnerId) continue;

    const participants = [
      { seasonCoachId: match.coach1SeasonId, differential: match.coach1Differential ?? 0 },
      { seasonCoachId: match.coach2SeasonId, differential: match.coach2Differential ?? 0 },
    ];

    for (const participant of participants) {
      const coachId = coachBySeasonCoachId.get(participant.seasonCoachId);
      if (!coachId) continue;

      const coachStats = getStats(coachId);
      const won = match.winnerId === participant.seasonCoachId;
      const absDifferential = Math.abs(participant.differential);
      const playedTime = Date.parse(match.endedAt ?? match.playedAt ?? match.scheduledAt ?? "");
      const seasonNumber = seasonNumberById.get(match.seasonId) ?? 0;
      const sortValue = Number.isNaN(playedTime)
        ? seasonNumber * 100000 + match.week * 100 + match.id
        : playedTime;

      coachStats.games += 1;
      coachStats.differential += participant.differential;
      coachStats.recentResults.push({ won, sortValue });

      if (won) {
        coachStats.wins += 1;
        coachStats.winCount += 1;
        coachStats.winDifferential += participant.differential;
        if (absDifferential === 5 || absDifferential === 6) {
          coachStats.bigWins += 1;
        }
      } else {
        coachStats.lossCount += 1;
        coachStats.lossDifferential += participant.differential;
      }

      if (absDifferential === 1 || absDifferential === 2) {
        coachStats.closeGames += 1;
        if (won) {
          coachStats.closeWins += 1;
        }
      }
    }
  }

  return [...stats.entries()]
    .map(([coachId, row]) => {
      const last15Results = row.recentResults
        .sort((a, b) => b.sortValue - a.sortValue)
        .slice(0, 15);
      const last15Wins = last15Results.filter((result) => result.won).length;
      const last15Losses = last15Results.length - last15Wins;

      return {
        coachId,
        coachName: coachNameById.get(coachId) ?? "Unknown",
        logoUrl: coachLogoMap.get(coachId) ?? null,
        games: row.games,
        averageDifferential: row.differential / row.games,
        averageWinDifference: row.winCount > 0 ? row.winDifferential / row.winCount : null,
        averageLossDifference: row.lossCount > 0 ? row.lossDifferential / row.lossCount : null,
        winningPercentage: (row.wins / row.games) * 100,
        last15Wins,
        last15Losses,
        last15WinPercentage: last15Results.length > 0 ? (last15Wins / last15Results.length) * 100 : null,
        closeGameWins: row.closeWins,
        closeGameLosses: row.closeGames - row.closeWins,
        closeGameWinPercentage: row.closeGames > 0 ? (row.closeWins / row.closeGames) * 100 : null,
        bigWins: row.bigWins,
        bigWinPercentage: (row.bigWins / row.games) * 100,
      };
    })
    .filter((row) => row.games > 0)
    .sort((a, b) =>
      b.games - a.games ||
      b.averageDifferential - a.averageDifferential ||
      a.coachName.localeCompare(b.coachName)
    );
}

export default async function BattleRecordPage() {
  const battleRecords = await getBattleRecords();

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
        </div>
        <h1 className="font-pixel text-2xl text-white sm:text-3xl md:text-4xl">
          Battle Record
        </h1>
        <p className="mt-1 text-base text-[var(--foreground-muted)]">
          All-time coach scoreline records from completed non-forfeit matches.
        </p>
      </div>

      <div className="poke-card overflow-hidden p-0 shadow-[0_0_28px_rgba(255,255,255,0.18)] ring-1 ring-white/10">
        <div className="border-b-2 border-[var(--background-tertiary)] p-4 sm:p-6">
          <div className="section-title !mb-0">
            <div className="section-title-icon !bg-[var(--primary)]">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19V5m0 14h16M8 16V9m4 7V7m4 9v-5" />
              </svg>
            </div>
            <h2 className="text-xl">Coach Records</h2>
          </div>
        </div>

        <BattleRecordTable records={battleRecords} />
      </div>
    </div>
  );
}
