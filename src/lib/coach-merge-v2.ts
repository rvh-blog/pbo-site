import { db } from "./db";
import { coaches, seasonCoaches, eloHistory } from "./schema";
import { eq, sql, inArray } from "drizzle-orm";

// Based on battle record sheets - each array represents ONE coach across seasons
// Format: [primaryId, ...duplicateIds, "reason"]
// The first ID will be kept, others will be merged into it
const COACH_MERGES: (number | string)[][] = [
  // Abbotsford Aggrons sheet: Nightmare (S5) = Nightmarehall (S6-7)
  [88, 140, "Nightmarehall <- Nightmare (Abbotsford Aggrons)"],

  // Blasphemous Blacephalons sheet: b33pb00p (S6) = beeboop (S8)
  [17, 118, "beeboop <- b33pb00p (Blasphemous Blacephalons)"],

  // Boston Banettes sheet: WhiteRaven (S5) = whitestraven (S6) = Raven (S7-8)
  [29, 156, 138, "Raven <- WhiteRaven, whitestraven (Boston Banettes)"],

  // Caborca Gengars sheet: H7795 (S5) = holiss7795 (S6-8)
  [84, 150, "holiss7795 <- H7795 (Caborca Gengars)"],

  // Carolina Cetitans sheet: GuyoShiMaa (S6) = Gage (S7-8)
  [67, 136, "Gage <- GuyoShiMaa (Carolina Cetitans)"],

  // Charleston Chesnaughts sheet: Doncolbus (S5,S6,S8) = Don (S7)
  [142, 92, "Doncolbus <- Don (Charleston Chesnaughts)"],

  // Clonbrook Kyogres sheet: smergleee (S6) = clonbrookkyogres (S7-8)
  [55, 120, "clonbrookkyogres <- smergleee (Clonbrook Kyogres)"],

  // Edinburgh Enamorus sheet: Geotarou (S6) = Geo (S7-8)
  [13, 129, "Geo <- Geotarou (Edinburgh Enamorus/Scarborough Sceptiles)"],

  // Frederick Klefkis sheet: Orange (S5,S7) = Going Forward (S6)
  [28, 121, "Orange <- Going Forward (Frederick Klefkis)"],

  // Gholdengo Champions sheet: demon nub (S6) = Nigthamarish (S7-8 Boston Bulbasaurs)
  [81, 114, "Nigthamarish <- demon nub (Gholdengo Champions/Boston Bulbasaurs)"],

  // Luscious Lopunnies sheet: Merry (S5,S7-8) = Hisato Noromi (S6)
  [38, 123, "Merry <- Hisato Noromi (Luscious Lopunnies)"],

  // Orlando Magikarps sheet: Libraries (S6) = Shhnico (S7-8)
  [39, 133, "Shhnico <- Libraries (Orlando Magikarps)"],

  // Pittsburgh Scizors sheet: Void (S5) = IntoTheVoid (S6-8)
  [48, 144, "IntoTheVoid <- Void (Pittsburgh Scizors)"],

  // Syracuse Snorlax sheet: KingFrankTank (S6) = TheITB (S7-8)
  [15, 132, "TheITB <- KingFrankTank (Syracuse Snorlax)"],

  // Tokyo Teddiursas sheet: Kuma (S5,S7) = VI Tokens (S6) = kumabe4r (S8)
  [151, 112, 78, "Kuma <- VI Tokens, kumabe4r (Tokyo Teddiursas)"],

  // Sin City Sableye sheet: Drew (S5) = Drew876 (S6)
  [145, 110, "Drew <- Drew876 (Sin City Sableye)"],

  // Sunnyside Suicunes sheet: Mug (S5,S7) = Iammug (S6)
  [90, 111, "Mug <- Iammug (Sunnyside Suicunes)"],

  // Sydney Sylveons sheet: WASDShiftlock (S6) = Mystic Mew (S7)
  [41, 135, "Mystic Mew <- WASDShiftlock (Sydney Sylveons)"],

  // Tottenham Hoothoots sheet: Trainerblack (S5) = TripleStarHunter (S7-8)
  [31, 149, "TripleStarHunter <- Trainerblack (Tottenham Hoothoots)"],

  // Uncertain Unowns sheet: SoupBoiRex (S6) = Rexx (S7-8)
  [61, 137, "Rexx <- SoupBoiRex (Uncertain Unowns)"],

  // Worcester Woopers sheet: Natty (S5) = nattii (S6) = Lemon (S7-8)
  [33, 143, 105, "Lemon <- Natty, nattii (Worcester Woopers)"],
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

// Also need to handle Philadelphia Flygons case - different coaches in different seasons
// Dr.Rizz (S5) might be different from Rizzadelphia (S6) and sam610 (S8)
// Need user input on this one

export async function runMergeV2(dryRun = true) {
  await mergeCoachesV2(dryRun);

  if (!dryRun) {
    console.log("\nRecalculating ELO ratings...");
    // ELO recalculation would happen here
  }
}
