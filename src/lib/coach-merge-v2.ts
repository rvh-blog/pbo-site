import { db } from "./db";
import { coaches, seasonCoaches, eloHistory } from "./schema";
import { eq, sql, inArray } from "drizzle-orm";

// Based on battle record sheets - each array represents ONE coach across seasons
// Format: [primaryId, ...duplicateIds, "reason"]
// The first ID will be kept, others will be merged into it
// Updated after S6 reseed (January 2026)
const COACH_MERGES: (number | string)[][] = [
  // === S6 Stargazer duplicates (IDs 160-165) ===

  // Clonbrook Kyogres sheet: smergleee (S6) -> clonbrookkyogres (S7-9)
  [55, 160, "clonbrookkyogres <- smergleee (Clonbrook Kyogres)"],

  // Frederick Klefkis sheet: Going Forward (S6) -> Orange (S5,S7,S9)
  [28, 161, "Orange <- Going Forward (Frederick Klefkis)"],

  // Luscious Lopunnies sheet: Hisato Noromi (S6) -> Merry (S5,S7-9)
  [38, 162, "Merry <- Hisato Noromi (Luscious Lopunnies)"],

  // Pittsburgh Scizors sheet: IntoTheVoid13 (S6) -> IntoTheVoid (S5,S7-9)
  [48, 163, "IntoTheVoid <- IntoTheVoid13 (Pittsburgh Scizors)"],

  // Charleston Chesnaughts sheet: doncolbus (S6) -> Doncolbus (S5,S7-9)
  [142, 164, "Doncolbus <- doncolbus (Charleston Chesnaughts)"],

  // Adelaide Arbolivas sheet: FireAnt78 (S6) -> FireAnt (S5,S7-8)
  [72, 165, "FireAnt <- FireAnt78 (Adelaide Arbolivas)"],

  // === S6 Sunset duplicates (IDs 166-176) ===

  // Sin City Sableye sheet: Drew876 (S6) -> Drew (S5)
  [145, 166, "Drew <- Drew876 (Sin City Sableye)"],

  // Sunnyside Suicunes/Screamtails sheet: Iammug (S6 both divisions) -> Mug (S5,S7)
  [90, 167, "Mug <- Iammug (Sunnyside Screamtails)"],

  // Tokyo Teddiursas sheet: VI Tokens (S6) -> Kuma (S5,S7-9)
  [151, 168, "Kuma <- VI Tokens (Tokyo Teddiursas)"],

  // Phoenix Sandshrews sheet: Hotpepper22 (S6) -> hotpepper22 (S7-9) - case difference
  [14, 169, "hotpepper22 <- Hotpepper22 (Phoenix Sandshrews)"],

  // Gholdengo Champions sheet: demon nub (S6) -> Nigthamarish (S7-8)
  [81, 170, "Nigthamarish <- demon nub (Gholdengo Champions)"],

  // Edinburgh Enamorus sheet: Geotarou (S6) -> Geo (S7-9)
  [13, 171, "Geo <- Geotarou (Edinburgh Enamorus/Scarborough Sceptiles)"],

  // Swindon Swamperts sheet: platanopower420 (S6) -> platano_power_420 (S7-9)
  [68, 172, "platano_power_420 <- platanopower420 (Swindon Swamperts)"],

  // Syracuse Snorlax sheet: KingFrankTank (S6) -> TheITB (S7-9)
  [15, 173, "TheITB <- KingFrankTank (Syracuse Snorlax)"],

  // Orlando Magikarps sheet: Libraries (S6) -> Shhnico (S7-9)
  [39, 174, "Shhnico <- Libraries (Orlando Magikarps)"],

  // Canberra Cacturnes sheet: carlsht (S6) -> CarlSHT (S7)
  [96, 175, "CarlSHT <- carlsht (Canberra Cacturnes)"],

  // Worcester Woopers sheet: nattii (S6) -> Lemon (S5,S7-9)
  [33, 176, "Lemon <- nattii (Worcester Woopers)"],

  // === S6 Neon duplicates (IDs 177-184) ===

  // Milwaukee Beedrills sheet: apointlessbee (S6) -> BumbleZ (S5-7)
  [101, 177, "BumbleZ <- apointlessbee (Milwaukee Beedrills)"],

  // Blasphemous Blacephalons sheet: b33pb00p (S6) -> beeboop (S8-9)
  [17, 178, "beeboop <- b33pb00p (Blasphemous Blacephalons)"],

  // Derby Drednaws sheet: Dayx2 (S6) -> DayX (S5)
  [157, 179, "DayX <- Dayx2 (Derby Drednaws)"],

  // Sydney Sylveons sheet: WASDShiftlock (S6) -> Mystic Mew (S7,S9)
  [41, 180, "Mystic Mew <- WASDShiftlock (Sydney Sylveons)"],

  // Carolina Cetitans sheet: GuyoShiMaa (S6) -> Gage (S7-9)
  [67, 181, "Gage <- GuyoShiMaa (Carolina Cetitans)"],

  // Caborca Gengars sheet: holiss77 (S6) -> holiss7795 (S5,S7-9)
  [84, 182, "holiss7795 <- holiss77 (Caborca Gengars)"],

  // Uncertain Unowns sheet: SoupBoiRex (S6) -> Rexx (S7-9)
  [61, 183, "Rexx <- SoupBoiRex (Uncertain Unowns)"],

  // Boston Banettes sheet: whitestraven (S6) -> Raven (S5,S7-9)
  [29, 184, "Raven <- whitestraven (Boston Banettes)"],
];

export async function mergeCoachesV2(dryRun = true) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`MERGING COACHES BASED ON BATTLE RECORDS ${dryRun ? "(DRY RUN)" : ""}`);
  console.log(`${"=".repeat(60)}\n`);

  let totalMerged = 0;
  let totalSeasonCoachesUpdated = 0;
  let totalEloUpdated = 0;

  for (const merge of COACH_MERGES) {
    const reason = merge[merge.length - 1] as string;
    const primaryId = merge[0] as number;
    const duplicateIds = merge.slice(1, -1) as number[];

    console.log(`\n${reason}`);
    console.log(`  Primary ID: ${primaryId}`);
    console.log(`  Duplicate IDs: ${duplicateIds.join(", ")}`);

    // Check if primary coach exists
    const primaryCoach = await db.query.coaches.findFirst({
      where: eq(coaches.id, primaryId),
    });

    if (!primaryCoach) {
      console.log(`  SKIP: Primary coach ${primaryId} not found`);
      continue;
    }

    for (const dupId of duplicateIds) {
      const dupCoach = await db.query.coaches.findFirst({
        where: eq(coaches.id, dupId),
      });

      if (!dupCoach) {
        console.log(`  SKIP: Duplicate coach ${dupId} not found (already merged?)`);
        continue;
      }

      // Count affected records
      const scCount = await db.select({ count: sql<number>`count(*)` })
        .from(seasonCoaches)
        .where(eq(seasonCoaches.coachId, dupId));

      const eloCount = await db.select({ count: sql<number>`count(*)` })
        .from(eloHistory)
        .where(eq(eloHistory.coachId, dupId));

      console.log(`  ${dupCoach.name} (${dupId}):`);
      console.log(`    Season entries: ${scCount[0].count}`);
      console.log(`    ELO history: ${eloCount[0].count}`);

      if (!dryRun) {
        // Update season_coaches
        await db.update(seasonCoaches)
          .set({ coachId: primaryId })
          .where(eq(seasonCoaches.coachId, dupId));

        // Update elo_history
        await db.update(eloHistory)
          .set({ coachId: primaryId })
          .where(eq(eloHistory.coachId, dupId));

        // Delete duplicate coach
        await db.delete(coaches).where(eq(coaches.id, dupId));

        console.log(`    MERGED into ${primaryCoach.name} (${primaryId})`);
        totalMerged++;
        totalSeasonCoachesUpdated += scCount[0].count;
        totalEloUpdated += eloCount[0].count;
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`MERGE SUMMARY`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Coaches merged: ${totalMerged}`);
  console.log(`Season entries updated: ${totalSeasonCoachesUpdated}`);
  console.log(`ELO history entries updated: ${totalEloUpdated}`);

  if (dryRun) {
    console.log(`\nThis was a DRY RUN. Run with dryRun=false to apply changes.`);
  }
}

// Note: Philadelphia Flygons has different coaches in different seasons:
// Dr.Rizz (S5), Rizzadelphia (S6), sam610 (S8-9) - these are DIFFERENT people

export async function runMergeV2(dryRun = true) {
  await mergeCoachesV2(dryRun);

  if (!dryRun) {
    console.log("\nRecalculating ELO ratings...");
    const { recalculateAllElo } = await import("./elo-service");
    const result = await recalculateAllElo();
    console.log(`Processed ${result.matchesProcessed} matches, updated ${result.coachesUpdated} coaches`);
  }
}

// Run directly: npx tsx src/lib/coach-merge-v2.ts [--apply]
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = !process.argv.includes("--apply");
  runMergeV2(dryRun).then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
