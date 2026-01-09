/**
 * Script to fix existing playoff bracket scores
 * Run with: npx tsx src/lib/fix-playoff-scores.ts
 */

import { db } from "./db";
import { playoffMatches, matches as matchesTable } from "./schema";
import { eq, and } from "drizzle-orm";

async function fixPlayoffScores() {
  console.log("Fixing playoff bracket scores...\n");

  // Get all playoff matches with winners
  const allPlayoffs = await db.query.playoffMatches.findMany({
    with: {
      higherSeed: true,
      lowerSeed: true,
    },
  });

  for (const playoff of allPlayoffs) {
    if (!playoff.winnerId) {
      console.log(`Skipping playoff ${playoff.id} (no winner yet)`);
      continue;
    }

    // Find the corresponding match in the matches table
    const playoffWeek = 100 + playoff.round;
    const match = await db.query.matches.findFirst({
      where: and(
        eq(matchesTable.divisionId, playoff.divisionId),
        eq(matchesTable.week, playoffWeek),
        eq(matchesTable.coach1SeasonId, playoff.higherSeedId!),
        eq(matchesTable.coach2SeasonId, playoff.lowerSeedId!)
      ),
    });

    if (!match) {
      console.log(`No match found for playoff ${playoff.id} (round ${playoff.round}, position ${playoff.bracketPosition})`);
      continue;
    }

    // Determine the correct scores from the match differentials
    const higherSeedWon = playoff.winnerId === playoff.higherSeedId;
    const higherSeedWins = higherSeedWon
      ? Math.abs(match.coach1Differential || 0)
      : 0;
    const lowerSeedWins = !higherSeedWon
      ? Math.abs(match.coach2Differential || 0)
      : 0;

    console.log(`Playoff ${playoff.id}: ${playoff.higherSeed?.teamName} vs ${playoff.lowerSeed?.teamName}`);
    console.log(`  Match differentials: ${match.coach1Differential} / ${match.coach2Differential}`);
    console.log(`  Old scores: ${playoff.higherSeedWins}-${playoff.lowerSeedWins}`);
    console.log(`  New scores: ${higherSeedWins}-${lowerSeedWins}`);

    // Update the playoff match with correct scores
    await db
      .update(playoffMatches)
      .set({
        higherSeedWins,
        lowerSeedWins,
      })
      .where(eq(playoffMatches.id, playoff.id));

    console.log(`  Updated!\n`);
  }

  console.log("Done!");
  process.exit(0);
}

fixPlayoffScores().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
