import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickEmPicks, pickEmParticipants, matches, seasonCoaches, bets, killBets, deathBets, coaches, eloHistory, siteSettings } from "@/lib/schema";
import { eq, and, isNull, sql, lt, desc, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get("seasonId");
    const participantId = searchParams.get("participantId");

    if (!seasonId) {
      return NextResponse.json(
        { error: "seasonId is required" },
        { status: 400 }
      );
    }

    const seasonIdNum = parseInt(seasonId);
    const participantIdNum = participantId ? parseInt(participantId) : null;

    // Run independent queries in parallel
    const [allSeasonMatches, participants, allBets, allKillBets, allDeathBets, myPicksRaw, allEloHistory, bettingSettingsRaw] = await Promise.all([
      // Fetch all matches (including completed ones)
      db.query.matches.findMany({
        where: eq(matches.seasonId, seasonIdNum),
        with: {
          division: true,
          coach1: {
            with: {
              coach: true,
            },
          },
          coach2: {
            with: {
              coach: true,
            },
          },
        },
        orderBy: (matches, { asc }) => [asc(matches.week), asc(matches.divisionId)],
      }),
      // Fetch all participants with picks and rewards
      db.query.pickEmParticipants.findMany({
        where: eq(pickEmParticipants.seasonId, seasonIdNum),
        with: {
          coach: true,
          picks: true,
          rewards: true,
        },
      }),
      // Fetch all bets for the season
      db.query.bets.findMany({
        where: sql`${bets.matchId} IN (SELECT id FROM matches WHERE season_id = ${seasonIdNum})`,
        with: {
          coach: true,
          user: true,
        },
      }),
      // Fetch all kill bets for the season
      db.query.killBets.findMany({
        where: sql`${killBets.matchId} IN (SELECT id FROM matches WHERE season_id = ${seasonIdNum})`,
        with: {
          coach: true,
          user: true,
          pokemon: {
            columns: { name: true, displayName: true },
          },
        },
      }),
      // Fetch all death bets for the season
      db.query.deathBets.findMany({
        where: sql`${deathBets.matchId} IN (SELECT id FROM matches WHERE season_id = ${seasonIdNum})`,
        with: {
          coach: true,
          user: true,
          pokemon: {
            columns: { name: true, displayName: true },
          },
        },
      }),
      // Fetch participant's picks if provided
      participantIdNum
        ? db.query.pickEmPicks.findMany({
            where: eq(pickEmPicks.participantId, participantIdNum),
          })
        : Promise.resolve([]),
      // Fetch all ELO history for coaches in this season (for prior ELO calculation)
      // This includes entries from previous seasons so we can find prior ELO for first matches
      db.query.eloHistory.findMany({
        where: sql`${eloHistory.coachId} IN (
          SELECT DISTINCT c.id FROM coaches c
          JOIN season_coaches sc ON sc.coach_id = c.id
          JOIN matches m ON (m.coach1_season_id = sc.id OR m.coach2_season_id = sc.id)
          WHERE m.season_id = ${seasonIdNum}
        )`,
        orderBy: [desc(eloHistory.id)],
      }),
      // Fetch betting settings
      db.query.siteSettings.findMany({
        where: (s, { inArray }) => inArray(s.key, ["betting_closed", "betting_ui_hidden"]),
      }),
    ]);

    // Parse betting settings
    const bettingSettingsMap = new Map(bettingSettingsRaw.map((s) => [s.key, s.value]));
    const bettingSettings = {
      bettingClosed: bettingSettingsMap.get("betting_closed") === "true",
      bettingUiHidden: bettingSettingsMap.get("betting_ui_hidden") === "true",
    };

    // Split into upcoming and completed for different purposes
    const upcomingMatches = allSeasonMatches.filter(m => m.winnerId === null);

    // Calculate standings per division
    const standingsMap = new Map<number, { wins: number; losses: number; diff: number }>();

    for (const match of allSeasonMatches) {
      // Initialize if not exists
      if (!standingsMap.has(match.coach1SeasonId)) {
        standingsMap.set(match.coach1SeasonId, { wins: 0, losses: 0, diff: 0 });
      }
      if (!standingsMap.has(match.coach2SeasonId)) {
        standingsMap.set(match.coach2SeasonId, { wins: 0, losses: 0, diff: 0 });
      }

      // Only count completed matches
      if (match.winnerId !== null) {
        const coach1Stats = standingsMap.get(match.coach1SeasonId)!;
        const coach2Stats = standingsMap.get(match.coach2SeasonId)!;

        if (match.winnerId === match.coach1SeasonId) {
          coach1Stats.wins++;
          coach2Stats.losses++;
        } else {
          coach2Stats.wins++;
          coach1Stats.losses++;
        }

        coach1Stats.diff += match.coach1Differential || 0;
        coach2Stats.diff += match.coach2Differential || 0;
      }
    }

    // Group coaches by division and calculate positions
    const divisionCoaches = new Map<number, number[]>();
    for (const match of upcomingMatches) {
      const divId = match.divisionId;
      if (!divisionCoaches.has(divId)) {
        divisionCoaches.set(divId, []);
      }
      const coaches = divisionCoaches.get(divId)!;
      if (!coaches.includes(match.coach1SeasonId)) coaches.push(match.coach1SeasonId);
      if (!coaches.includes(match.coach2SeasonId)) coaches.push(match.coach2SeasonId);
    }

    // Calculate positions within each division
    const positionMap = new Map<number, number>();
    for (const [divId, coachIds] of divisionCoaches) {
      const sorted = coachIds.sort((a, b) => {
        const aStats = standingsMap.get(a) || { wins: 0, losses: 0, diff: 0 };
        const bStats = standingsMap.get(b) || { wins: 0, losses: 0, diff: 0 };
        // Sort by wins desc, then diff desc
        if (bStats.wins !== aStats.wins) return bStats.wins - aStats.wins;
        return bStats.diff - aStats.diff;
      });
      sorted.forEach((coachId, index) => {
        positionMap.set(coachId, index + 1);
      });
    }

    // Fetch completed matches for pick scoring
    const completedMatches = allSeasonMatches.filter(m => m.winnerId !== null);

  const completedMap = new Map(
    completedMatches.map((m) => [m.id, m.winnerId])
  );

  // Map participant's picks from parallel query
  const myPicks = myPicksRaw.map((p) => ({
    matchId: p.matchId,
    predictedWinnerId: p.predictedWinnerId,
  }));

  // Build match metadata map for client-side filtering
  const matchMetadata: Record<number, { week: number; divisionId: number; winnerId: number | null }> = {};
  for (const match of allSeasonMatches) {
    matchMetadata[match.id] = {
      week: match.week,
      divisionId: match.divisionId,
      winnerId: match.winnerId,
    };
  }

  // Build participant picks map for client-side filtering
  const participantPicks: Record<number, { matchId: number; predictedWinnerId: number }[]> = {};
  for (const p of participants) {
    participantPicks[p.id] = p.picks.map((pick) => ({
      matchId: pick.matchId,
      predictedWinnerId: pick.predictedWinnerId,
    }));
  }

  // Calculate scores (full season)
  const leaderboard = participants
    .map((p) => {
      let correct = 0;
      let total = 0;
      let pending = 0;

      for (const pick of p.picks) {
        const winnerId = completedMap.get(pick.matchId);
        if (winnerId === undefined) {
          // Match not in completed list
          pending++;
        } else if (winnerId === null) {
          // Match not played yet
          pending++;
        } else {
          total++;
          if (pick.predictedWinnerId === winnerId) {
            correct++;
          }
        }
      }

      // Calculate total rewards for this participant
      const rewards = p.rewards?.reduce((sum, r) => sum + r.amount, 0) || 0;
      // Build rewards breakdown by week, division, and week+division
      const rewardsByWeek: Record<number, number> = {};
      const rewardsByDivision: Record<number, number> = {};
      const rewardsByWeekAndDivision: Record<string, number> = {}; // key: "week-divisionId"
      for (const r of p.rewards || []) {
        rewardsByWeek[r.week] = (rewardsByWeek[r.week] || 0) + r.amount;

        let effectiveDivisionId: number | null = r.divisionId;
        if (effectiveDivisionId === null && r.matchId !== null) {
          // GOTW rewards have divisionId=null but matchId set - look up the match's division
          const match = allSeasonMatches.find(m => m.id === r.matchId);
          if (match) {
            effectiveDivisionId = match.divisionId;
          }
        }

        if (effectiveDivisionId !== null) {
          rewardsByDivision[effectiveDivisionId] = (rewardsByDivision[effectiveDivisionId] || 0) + r.amount;
          // Also track by week+division for proper filtering
          const key = `${r.week}-${effectiveDivisionId}`;
          rewardsByWeekAndDivision[key] = (rewardsByWeekAndDivision[key] || 0) + r.amount;
        }
      }

      return {
        id: p.id,
        name: p.name,
        coachId: p.coachId,
        coachName: p.coach?.name || null,
        correct,
        total,
        pending,
        accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
        rewards,
        rewardsByWeek,
        rewardsByDivision,
        rewardsByWeekAndDivision,
      };
    })
    .sort((a, b) => {
      // Sort by correct desc, then by total desc (more picks is tiebreaker)
      if (b.correct !== a.correct) return b.correct - a.correct;
      return b.total - a.total;
    });

    // Build a map of matchId -> coachId -> eloBeforeMatch using pre-fetched eloHistory
    const priorEloMap = new Map<string, number>(); // key: `${matchId}-${coachId}`

    // Group ELO history by coach (already fetched in parallel)
    const eloByCoach = new Map<number, typeof allEloHistory>();
    for (const entry of allEloHistory) {
      if (!eloByCoach.has(entry.coachId)) {
        eloByCoach.set(entry.coachId, []);
      }
      eloByCoach.get(entry.coachId)!.push(entry);
    }

    // For each completed match, find the prior ELO for both coaches
    for (const match of completedMatches) {
      const coach1Id = match.coach1?.coachId;
      const coach2Id = match.coach2?.coachId;

      if (coach1Id) {
        const coach1Entries = eloByCoach.get(coach1Id) || [];
        const matchEntry = coach1Entries.find(e => e.matchId === match.id);
        if (matchEntry) {
          // Find the previous entry (lower ID) for this coach
          const prevEntry = coach1Entries
            .filter(e => e.id < matchEntry.id)
            .sort((a, b) => b.id - a.id)[0];
          if (prevEntry) {
            priorEloMap.set(`${match.id}-${coach1Id}`, prevEntry.eloRating);
          }
        }
      }

      if (coach2Id) {
        const coach2Entries = eloByCoach.get(coach2Id) || [];
        const matchEntry = coach2Entries.find(e => e.matchId === match.id);
        if (matchEntry) {
          const prevEntry = coach2Entries
            .filter(e => e.id < matchEntry.id)
            .sort((a, b) => b.id - a.id)[0];
          if (prevEntry) {
            priorEloMap.set(`${match.id}-${coach2Id}`, prevEntry.eloRating);
          }
        }
      }
    }

    // Group ALL matches by week and enrich with standings
    const matchesByWeek = new Map<number, typeof allSeasonMatches>();
    for (const match of allSeasonMatches) {
      const week = match.week;
      if (!matchesByWeek.has(week)) {
        matchesByWeek.set(week, []);
      }
      matchesByWeek.get(week)!.push(match);
    }

    const weeks = Array.from(matchesByWeek.entries())
      .map(([week, weekMatches]) => ({
        week,
        matches: weekMatches.map((match) => {
          const coach1Id = match.coach1?.coachId;
          const coach2Id = match.coach2?.coachId;
          return {
            ...match,
            coach1Standing: {
              position: positionMap.get(match.coach1SeasonId) || 0,
              ...(standingsMap.get(match.coach1SeasonId) || { wins: 0, losses: 0, diff: 0 }),
            },
            coach2Standing: {
              position: positionMap.get(match.coach2SeasonId) || 0,
              ...(standingsMap.get(match.coach2SeasonId) || { wins: 0, losses: 0, diff: 0 }),
            },
            // Prior ELO for completed matches (to show ELO as it was before the match)
            coach1EloBefore: coach1Id ? priorEloMap.get(`${match.id}-${coach1Id}`) || null : null,
            coach2EloBefore: coach2Id ? priorEloMap.get(`${match.id}-${coach2Id}`) || null : null,
          };
        }),
      }))
      .sort((a, b) => a.week - b.week);

    // Derive all picks from participants (already fetched with picks relation)
    const allPicks = participants.flatMap((p) => p.picks);

    // Calculate pick percentages per match
    const pickStats = new Map<number, { coach1Picks: number; coach2Picks: number; totalPicks: number }>();
    for (const match of allSeasonMatches) {
      pickStats.set(match.id, { coach1Picks: 0, coach2Picks: 0, totalPicks: 0 });
    }
    for (const pick of allPicks) {
      const stats = pickStats.get(pick.matchId);
      if (stats) {
        stats.totalPicks++;
        // Find the match to determine which coach was picked
        const match = allSeasonMatches.find((m) => m.id === pick.matchId);
        if (match) {
          if (pick.predictedWinnerId === match.coach1SeasonId) {
            stats.coach1Picks++;
          } else if (pick.predictedWinnerId === match.coach2SeasonId) {
            stats.coach2Picks++;
          }
        }
      }
    }

    // Convert to object for JSON
    const pickStatsObj: Record<number, { coach1Picks: number; coach2Picks: number; totalPicks: number }> = {};
    for (const [matchId, stats] of pickStats) {
      pickStatsObj[matchId] = stats;
    }

    // Calculate betting stats per bettor (coach or spectator)
    const bettingStatsMap = new Map<string, {
      bettorId: number;
      bettorType: "coach" | "spectator";
      bettorName: string;
      totalCoins: number;
      betsPlaced: number;
      betsWon: number;
      betsLost: number;
      betsPending: number;
      coinsWagered: number;
      coinsWon: number;
      coinsLost: number;
      profit: number;
    }>();

    for (const bet of allBets) {
      // Determine if this is a coach or spectator bet
      const isCoachBet = bet.coachId !== null && bet.coach;
      const isUserBet = bet.userId !== null && bet.user;

      if (!isCoachBet && !isUserBet) continue;

      const key = isCoachBet ? `coach-${bet.coachId}` : `user-${bet.userId}`;
      const bettorId = isCoachBet ? bet.coachId! : bet.userId!;
      const bettorName = isCoachBet ? bet.coach!.name : bet.user!.username;
      const totalCoins = isCoachBet ? bet.coach!.pboCoin : bet.user!.pboCoin;

      if (!bettingStatsMap.has(key)) {
        bettingStatsMap.set(key, {
          bettorId,
          bettorType: isCoachBet ? "coach" : "spectator",
          bettorName,
          totalCoins,
          betsPlaced: 0,
          betsWon: 0,
          betsLost: 0,
          betsPending: 0,
          coinsWagered: 0,
          coinsWon: 0,
          coinsLost: 0,
          profit: 0,
        });
      }

      const stats = bettingStatsMap.get(key)!;
      stats.betsPlaced++;
      stats.coinsWagered += bet.amount;

      if (bet.status === "won") {
        stats.betsWon++;
        const profit = (bet.payout || 0) - bet.amount;
        stats.coinsWon += profit;
        stats.profit += profit;
      } else if (bet.status === "lost") {
        stats.betsLost++;
        stats.coinsLost += bet.amount;
        stats.profit -= bet.amount;
      } else if (bet.status === "pending") {
        stats.betsPending++;
      }
      // refunded bets don't affect stats
    }

    // Process kill bets similarly
    for (const killBet of allKillBets) {
      // Determine if this is a coach or spectator bet
      const isCoachBet = killBet.coachId !== null && killBet.coach;
      const isUserBet = killBet.userId !== null && killBet.user;

      if (!isCoachBet && !isUserBet) continue;

      const key = isCoachBet ? `coach-${killBet.coachId}` : `user-${killBet.userId}`;
      const bettorId = isCoachBet ? killBet.coachId! : killBet.userId!;
      const bettorName = isCoachBet ? killBet.coach!.name : killBet.user!.username;
      const totalCoins = isCoachBet ? killBet.coach!.pboCoin : killBet.user!.pboCoin;

      if (!bettingStatsMap.has(key)) {
        bettingStatsMap.set(key, {
          bettorId,
          bettorType: isCoachBet ? "coach" : "spectator",
          bettorName,
          totalCoins,
          betsPlaced: 0,
          betsWon: 0,
          betsLost: 0,
          betsPending: 0,
          coinsWagered: 0,
          coinsWon: 0,
          coinsLost: 0,
          profit: 0,
        });
      }

      const stats = bettingStatsMap.get(key)!;
      stats.betsPlaced++;
      stats.coinsWagered += killBet.amount;

      if (killBet.status === "won") {
        stats.betsWon++;
        const profit = (killBet.payout || 0) - killBet.amount;
        stats.coinsWon += profit;
        stats.profit += profit;
      } else if (killBet.status === "lost") {
        stats.betsLost++;
        stats.coinsLost += killBet.amount;
        stats.profit -= killBet.amount;
      } else if (killBet.status === "pending") {
        stats.betsPending++;
      }
      // refunded bets don't affect stats
    }

    // Process death bets similarly
    for (const deathBet of allDeathBets) {
      // Determine if this is a coach or spectator bet
      const isCoachBet = deathBet.coachId !== null && deathBet.coach;
      const isUserBet = deathBet.userId !== null && deathBet.user;

      if (!isCoachBet && !isUserBet) continue;

      const key = isCoachBet ? `coach-${deathBet.coachId}` : `user-${deathBet.userId}`;
      const bettorId = isCoachBet ? deathBet.coachId! : deathBet.userId!;
      const bettorName = isCoachBet ? deathBet.coach!.name : deathBet.user!.username;
      const totalCoins = isCoachBet ? deathBet.coach!.pboCoin : deathBet.user!.pboCoin;

      if (!bettingStatsMap.has(key)) {
        bettingStatsMap.set(key, {
          bettorId,
          bettorType: isCoachBet ? "coach" : "spectator",
          bettorName,
          totalCoins,
          betsPlaced: 0,
          betsWon: 0,
          betsLost: 0,
          betsPending: 0,
          coinsWagered: 0,
          coinsWon: 0,
          coinsLost: 0,
          profit: 0,
        });
      }

      const stats = bettingStatsMap.get(key)!;
      stats.betsPlaced++;
      stats.coinsWagered += deathBet.amount;

      if (deathBet.status === "won") {
        stats.betsWon++;
        const profit = (deathBet.payout || 0) - deathBet.amount;
        stats.coinsWon += profit;
        stats.profit += profit;
      } else if (deathBet.status === "lost") {
        stats.betsLost++;
        stats.coinsLost += deathBet.amount;
        stats.profit -= deathBet.amount;
      } else if (deathBet.status === "pending") {
        stats.betsPending++;
      }
      // refunded bets don't affect stats
    }

    // Convert to sorted array (by profit desc, then by bets won desc)
    const bettingLeaderboard = Array.from(bettingStatsMap.values())
      .sort((a, b) => {
        if (b.profit !== a.profit) return b.profit - a.profit;
        return b.betsWon - a.betsWon;
      });

    // Also return raw bets for client-side filtering
    const allBetsData = allBets.map((bet) => {
      const isCoachBet = bet.coachId !== null && bet.coach;
      return {
        id: bet.id,
        matchId: bet.matchId,
        predictedWinnerId: bet.predictedWinnerId,
        bettorId: isCoachBet ? bet.coachId : bet.userId,
        bettorType: isCoachBet ? "coach" : "spectator",
        bettorName: isCoachBet ? bet.coach?.name || "Unknown" : bet.user?.username || "Unknown",
        totalCoins: isCoachBet ? bet.coach?.pboCoin || 0 : bet.user?.pboCoin || 0,
        amount: bet.amount,
        odds: bet.odds,
        status: bet.status,
        payout: bet.payout,
      };
    });

    // Also return kill bets for client-side filtering
    const allKillBetsData = allKillBets.map((killBet) => {
      const isCoachBet = killBet.coachId !== null && killBet.coach;
      return {
        id: killBet.id,
        matchId: killBet.matchId,
        pokemonId: killBet.pokemonId,
        pokemonName: killBet.pokemon?.displayName || killBet.pokemon?.name || "Unknown",
        seasonCoachId: killBet.seasonCoachId,
        killThreshold: killBet.killThreshold,
        betType: killBet.betType,
        bettorId: isCoachBet ? killBet.coachId : killBet.userId,
        bettorType: isCoachBet ? "coach" : "spectator",
        bettorName: isCoachBet ? killBet.coach?.name || "Unknown" : killBet.user?.username || "Unknown",
        totalCoins: isCoachBet ? killBet.coach?.pboCoin || 0 : killBet.user?.pboCoin || 0,
        amount: killBet.amount,
        odds: killBet.odds,
        status: killBet.status,
        payout: killBet.payout,
      };
    });

    // Also return death bets for client-side filtering
    const allDeathBetsData = allDeathBets.map((deathBet) => {
      const isCoachBet = deathBet.coachId !== null && deathBet.coach;
      return {
        id: deathBet.id,
        matchId: deathBet.matchId,
        pokemonId: deathBet.pokemonId,
        pokemonName: deathBet.pokemon?.displayName || deathBet.pokemon?.name || "Unknown",
        seasonCoachId: deathBet.seasonCoachId,
        betType: deathBet.betType,
        bettorId: isCoachBet ? deathBet.coachId : deathBet.userId,
        bettorType: isCoachBet ? "coach" : "spectator",
        bettorName: isCoachBet ? deathBet.coach?.name || "Unknown" : deathBet.user?.username || "Unknown",
        totalCoins: isCoachBet ? deathBet.coach?.pboCoin || 0 : deathBet.user?.pboCoin || 0,
        amount: deathBet.amount,
        odds: deathBet.odds,
        status: deathBet.status,
        payout: deathBet.payout,
      };
    });

    return NextResponse.json({
      weeks,
      myPicks,
      leaderboard,
      bettingLeaderboard,
      allBets: allBetsData,
      allKillBets: allKillBetsData,
      allDeathBets: allDeathBetsData,
      pickStats: pickStatsObj,
      matchMetadata,
      participantPicks,
      bettingSettings,
    });
  } catch (error) {
    console.error("Pick-ems API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { participantId, picks } = body;

  if (!participantId || typeof participantId !== "number") {
    return NextResponse.json(
      { error: "participantId is required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(picks) || picks.length === 0) {
    return NextResponse.json(
      { error: "picks array is required" },
      { status: 400 }
    );
  }

  // Validate picks format
  for (const pick of picks) {
    if (!pick.matchId || !pick.predictedWinnerId) {
      return NextResponse.json(
        { error: "Each pick must have matchId and predictedWinnerId" },
        { status: 400 }
      );
    }
  }

  // Check that matches are not yet completed and not underway
  const matchIds = picks.map((p: { matchId: number }) => p.matchId);
  const matchRecords = await db.query.matches.findMany({
    where: sql`${matches.id} IN (${sql.join(matchIds.map((id: number) => sql`${id}`), sql`, `)})`,
  });

  const now = Date.now();
  const completedMatchIds = matchRecords
    .filter((m) => m.winnerId !== null)
    .map((m) => m.id);

  const underwayMatchIds = matchRecords
    .filter((m) => m.winnerId === null && m.scheduledAt && new Date(m.scheduledAt).getTime() <= now)
    .map((m) => m.id);

  const blockedMatchIds = [...completedMatchIds, ...underwayMatchIds];

  if (blockedMatchIds.length > 0) {
    return NextResponse.json(
      {
        error: "Cannot submit picks for completed or underway matches",
        completedMatchIds: blockedMatchIds,
      },
      { status: 400 }
    );
  }

  // Upsert picks (delete existing + insert new for each match)
  for (const pick of picks) {
    // Delete existing pick for this participant+match
    await db
      .delete(pickEmPicks)
      .where(
        and(
          eq(pickEmPicks.participantId, participantId),
          eq(pickEmPicks.matchId, pick.matchId)
        )
      );

    // Insert new pick
    await db.insert(pickEmPicks).values({
      participantId,
      matchId: pick.matchId,
      predictedWinnerId: pick.predictedWinnerId,
    });
  }

  // Return updated picks for this participant
  const updatedPicks = await db.query.pickEmPicks.findMany({
    where: eq(pickEmPicks.participantId, participantId),
  });

  return NextResponse.json({
    success: true,
    picks: updatedPicks.map((p) => ({
      matchId: p.matchId,
      predictedWinnerId: p.predictedWinnerId,
    })),
  });
}
