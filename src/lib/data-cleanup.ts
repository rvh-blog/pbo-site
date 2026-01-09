import { db } from "./db";
import { coaches, seasonCoaches, eloHistory, matches } from "./schema";
import { eq, sql } from "drizzle-orm";

// Duplicate coaches to merge: [keepId, deleteId, reason]
const DUPLICATE_COACHES: [number, number, string][] = [
  // Case differences and name variations
  [84, 57, "holiss7795 <- holiss77 (Caborca Gengars)"],
  [81, 102, "Nigthamarish <- nigthamarish (Boston Bulbasaurs)"],
  [80, 117, "Bee <- apointlessbee (King Keldeos)"],
  [80, 153, "Bee <- ApointlessBee (King Keldeos)"],
  [61, 86, "Rexx <- RexxRexx (Uncertain Unowns)"],
  [41, 100, "Mystic Mew <- MysticMew (Sydney Sylveons)"],
  [151, 93, "Kuma <- kuma (Tokyo Teddiursas)"],
  [63, 99, "BigWill <- bigwill0207 (East Coast Krooks)"],
  [68, 130, "platano_power_420 <- platanopower420 (Chicago Chimchars)"],
  [14, 113, "hotpepper22 <- Hotpepper22 (Cherry Hill Bellsprouts)"],
  [96, 104, "CarlSHT <- carlsht (Manila Manectrics)"],
  [55, 91, "clonbrookkyogres <- Clonbrookkyogres (Clonbrook Kyogres)"],
  [142, 76, "Doncolbus <- doncolbus (Charleston Chesnaughts)"],
  [53, 94, "Kalib_32 <- Kalib (New York Nickits)"],
  [12, 73, "shadow2054 <- Shadow2054 (Lion City Leech Life)"],
  [48, 126, "IntoTheVoid <- IntoTheVoid13 (Pittsburgh Scizors)"],
  [48, 109, "IntoTheVoid <- \"IntoTheVoid13 \" (Pittsburgh Scizors)"],
  [72, 127, "FireAnt <- FireAnt78 (Vancouver Valiants)"],
  [157, 119, "DayX <- Dayx2 (Indianapolis Incineroars)"],
  [67, 82, "Gage <- TheyCallMeGage (Carolina Cetitans)"],
];

// S5 Team Name Updates: [coachName, correctTeamName, division]
const S5_TEAM_UPDATES: [string, string, string][] = [
  // Kalos
  ["Kingdozo", "GVGT", "Kalos"],
  ["Trainerblack", "Tottenham Hoothoots", "Kalos"],
  ["H7795", "Caborca Gengars", "Kalos"],
  ["NickNob", "Memphis Magcargos", "Kalos"],
  ["Dr.Rizz", "Philadelphia Flygons", "Kalos"],
  ["WhiteRaven", "Boston Banettes", "Kalos"],
  ["DayX", "Indianapolis Incineroars", "Kalos"],
  ["ApointlessBee", "Gros Morne Growlithes", "Kalos"],
  // Unova
  ["Nightmare", "Abbotsford Aggrons", "Unova"],
  ["Taye", "Kingston Shadows", "Unova"],
  ["Natty", "Worcester Woopers", "Unova"],
  ["Void", "Pittsburgh Scizors", "Unova"],
  ["Fix", "Virginia Zekroms", "Unova"],
  ["Drew", "Sin City Sableye", "Unova"],
  ["Krook", "New Jersey Dracos", "Unova"],
];

export async function mergeCoaches(dryRun = true) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`MERGING DUPLICATE COACHES ${dryRun ? "(DRY RUN)" : ""}`);
  console.log(`${"=".repeat(60)}\n`);

  for (const [keepId, deleteId, reason] of DUPLICATE_COACHES) {
    console.log(`\nProcessing: ${reason}`);
    console.log(`  Keep ID: ${keepId}, Delete ID: ${deleteId}`);

    // Check if both coaches exist
    const keepCoach = await db.query.coaches.findFirst({
      where: eq(coaches.id, keepId),
    });
    const deleteCoach = await db.query.coaches.findFirst({
      where: eq(coaches.id, deleteId),
    });

    if (!keepCoach) {
      console.log(`  SKIP: Keep coach ${keepId} not found`);
      continue;
    }
    if (!deleteCoach) {
      console.log(`  SKIP: Delete coach ${deleteId} not found`);
      continue;
    }

    // Count affected records
    const seasonCoachCount = await db.select({ count: sql<number>`count(*)` })
      .from(seasonCoaches)
      .where(eq(seasonCoaches.coachId, deleteId));

    const eloCount = await db.select({ count: sql<number>`count(*)` })
      .from(eloHistory)
      .where(eq(eloHistory.coachId, deleteId));

    console.log(`  Season entries to update: ${seasonCoachCount[0].count}`);
    console.log(`  ELO history entries to update: ${eloCount[0].count}`);

    if (!dryRun) {
      // Update season_coaches to point to kept coach
      await db.update(seasonCoaches)
        .set({ coachId: keepId })
        .where(eq(seasonCoaches.coachId, deleteId));

      // Update elo_history to point to kept coach
      await db.update(eloHistory)
        .set({ coachId: keepId })
        .where(eq(eloHistory.coachId, deleteId));

      // Delete the duplicate coach
      await db.delete(coaches).where(eq(coaches.id, deleteId));

      console.log(`  MERGED: ${deleteCoach.name} -> ${keepCoach.name}`);
    } else {
      console.log(`  Would merge: ${deleteCoach.name} -> ${keepCoach.name}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Coach merge ${dryRun ? "preview" : ""} complete`);
  console.log(`${"=".repeat(60)}\n`);
}

export async function updateS5TeamNames(dryRun = true) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`UPDATING S5 TEAM NAMES ${dryRun ? "(DRY RUN)" : ""}`);
  console.log(`${"=".repeat(60)}\n`);

  // Get S5 season
  const s5 = await db.query.seasons.findFirst({
    where: eq(sql`season_number`, 5),
  });

  if (!s5) {
    console.log("S5 season not found!");
    return;
  }

  for (const [coachName, correctTeamName, divisionName] of S5_TEAM_UPDATES) {
    // Find the coach
    const coach = await db.query.coaches.findFirst({
      where: eq(coaches.name, coachName),
    });

    if (!coach) {
      console.log(`Coach not found: ${coachName}`);
      continue;
    }

    // Find their S5 season entry
    const seasonEntry = await db.query.seasonCoaches.findFirst({
      where: eq(seasonCoaches.coachId, coach.id),
      with: {
        division: {
          with: {
            season: true,
          },
        },
      },
    });

    if (!seasonEntry || seasonEntry.division?.season?.id !== s5.id) {
      // Try to find by joining
      const entries = await db.select()
        .from(seasonCoaches)
        .where(eq(seasonCoaches.coachId, coach.id));

      for (const entry of entries) {
        const div = await db.query.divisions.findFirst({
          where: eq(sql`id`, entry.divisionId),
          with: { season: true },
        });

        if (div?.season?.id === s5.id && div.name === divisionName) {
          console.log(`\n${coachName} (${divisionName}):`);
          console.log(`  Current: "${entry.teamName}"`);
          console.log(`  New: "${correctTeamName}"`);

          if (!dryRun) {
            await db.update(seasonCoaches)
              .set({ teamName: correctTeamName })
              .where(eq(seasonCoaches.id, entry.id));
            console.log(`  UPDATED`);
          }
          break;
        }
      }
      continue;
    }

    console.log(`\n${coachName}:`);
    console.log(`  Current: "${seasonEntry.teamName}"`);
    console.log(`  New: "${correctTeamName}"`);

    if (!dryRun) {
      await db.update(seasonCoaches)
        .set({ teamName: correctTeamName })
        .where(eq(seasonCoaches.id, seasonEntry.id));
      console.log(`  UPDATED`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`S5 team name update ${dryRun ? "preview" : ""} complete`);
  console.log(`${"=".repeat(60)}\n`);
}

export async function runDataCleanup(dryRun = true) {
  console.log("\n" + "=".repeat(60));
  console.log("PBO DATA CLEANUP");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE (applying changes)"}`);

  await mergeCoaches(dryRun);
  await updateS5TeamNames(dryRun);

  console.log("\nData cleanup complete!");
  if (dryRun) {
    console.log("Run with dryRun=false to apply changes.");
  }
}
