import { db } from "@/lib/db";
import { divisionSheetSync } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { syncRostersToSheet, buildPokemonNameMapping } from "./sheets-roster-sync";
import { syncMatchStatsToSheet } from "./sheets-match-stats-sync";
import { syncTransactionsToSheet } from "./sheets-transaction-sync";
import { isSyncEnabled } from "./sheets-sync";
import { sheetNameMappingOptionsForSeason } from "./sheets-pokemon-name-mapping";

interface SyncResult {
  divisionId: number;
  divisionName: string;
  spreadsheetId: string;
  success: boolean;
  rosterResult?: { teamsUpdated: number; errors: string[] };
  matchStatsResult?: { matchesUpdated: number; errors: string[] };
  transactionsResult?: { transactionsUpdated: number; errors: string[] };
  error?: string;
}

/**
 * Sync a single division to its configured Google Sheet
 */
export async function syncDivision(divisionId: number): Promise<SyncResult> {
  // Get sync config for this division
  const config = await db.query.divisionSheetSync.findFirst({
    where: eq(divisionSheetSync.divisionId, divisionId),
    with: {
      division: {
        with: {
          season: true,
        },
      },
    },
  });

  if (!config) {
    return {
      divisionId,
      divisionName: "Unknown",
      spreadsheetId: "",
      success: false,
      error: "No sheet sync configuration found for this division",
    };
  }

  if (!config.syncEnabled) {
    // Update status but don't sync
    await db
      .update(divisionSheetSync)
      .set({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: "disabled",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(divisionSheetSync.id, config.id));

    return {
      divisionId,
      divisionName: config.division.name,
      spreadsheetId: config.spreadsheetId,
      success: true,
      error: "Sync disabled for this division",
    };
  }

  const result: SyncResult = {
    divisionId,
    divisionName: config.division.name,
    spreadsheetId: config.spreadsheetId,
    success: true,
  };

  try {
    // Check if sync is enabled in the sheet's Config tab (single API call)
    console.log(`Checking sync status for ${config.division.name}...`);
    const sheetSyncEnabled = await isSyncEnabled(config.spreadsheetId);
    if (!sheetSyncEnabled) {
      console.log("Sync is disabled in sheet Config tab, skipping");
      return {
        ...result,
        error: "Sync disabled in sheet Config tab",
      };
    }

    // Build Pokemon name mapping once (single API call, shared by both syncs)
    console.log("Building shared Pokemon name mapping...");
    const pokemonNameMapping = await buildPokemonNameMapping(
      config.spreadsheetId,
      sheetNameMappingOptionsForSeason(config.division.season?.seasonNumber)
    );
    console.log(`Loaded ${pokemonNameMapping.size} Pokemon name mappings`);

    if (config.syncRostersTransactionsEnabled) {
      // Run roster sync (passes shared mapping, skips redundant checks)
      console.log(`Syncing rosters for ${config.division.name}...`);
      const rosterResult = await syncRostersToSheet(
        config.spreadsheetId,
        divisionId,
        { pokemonNameMapping, skipSyncCheck: true }
      );
      result.rosterResult = {
        teamsUpdated: rosterResult.teamsUpdated,
        errors: rosterResult.errors,
      };

      if (!rosterResult.success) {
        result.success = false;
      }
    } else {
      console.log(`Roster sync disabled for ${config.division.name}`);
    }

    if (config.syncMatchResultsEnabled) {
      // Run match stats sync (passes shared mapping, skips redundant checks)
      console.log(`Syncing match stats for ${config.division.name}...`);
      const matchStatsResult = await syncMatchStatsToSheet(
        config.spreadsheetId,
        divisionId,
        { pokemonNameMapping, skipSyncCheck: true }
      );
      result.matchStatsResult = {
        matchesUpdated: matchStatsResult.matchesUpdated,
        errors: matchStatsResult.errors,
      };

      if (!matchStatsResult.success) {
        result.success = false;
      }
    } else {
      console.log(`Match stats sync disabled for ${config.division.name}`);
    }

    if (config.syncRostersTransactionsEnabled) {
      // Run transactions sync (passes shared mapping, skips redundant checks)
      console.log(`Syncing transactions for ${config.division.name}...`);
      const transactionsResult = await syncTransactionsToSheet(
        config.spreadsheetId,
        divisionId,
        { pokemonNameMapping, skipSyncCheck: true }
      );
      result.transactionsResult = {
        transactionsUpdated: transactionsResult.transactionsUpdated,
        errors: transactionsResult.errors,
      };

      if (!transactionsResult.success) {
        result.success = false;
      }
    } else {
      console.log(`Transactions sync disabled for ${config.division.name}`);
    }

    // Update sync status in database
    const allErrors = [
      ...(result.rosterResult?.errors || []),
      ...(result.matchStatsResult?.errors || []),
      ...(result.transactionsResult?.errors || []),
    ];

    await db
      .update(divisionSheetSync)
      .set({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: result.success ? "success" : "error",
        lastSyncError:
          allErrors.length > 0 ? allErrors.slice(0, 5).join("; ") : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(divisionSheetSync.id, config.id));
  } catch (error) {
    result.success = false;
    result.error = String(error);

    // Update sync status with error
    await db
      .update(divisionSheetSync)
      .set({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: "error",
        lastSyncError: String(error),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(divisionSheetSync.id, config.id));
  }

  return result;
}

/**
 * Sync all divisions from current seasons that have sheet sync configured
 */
export async function syncAllDivisions(): Promise<{
  results: SyncResult[];
  totalSuccess: number;
  totalFailed: number;
}> {
  // Get all divisions with sync configured, filtered to current seasons only
  const configs = await db.query.divisionSheetSync.findMany({
    with: {
      division: {
        with: {
          season: true,
        },
      },
    },
  });

  // Filter to only current seasons
  const currentSeasonConfigs = configs.filter(
    (config) => config.division.season?.isCurrent
  );

  console.log(
    `Found ${currentSeasonConfigs.length} divisions with sheet sync configured (current seasons only)`
  );

  const results: SyncResult[] = [];
  let totalSuccess = 0;
  let totalFailed = 0;

  for (const config of currentSeasonConfigs) {
    console.log(`\n=== Syncing ${config.division.name} ===`);
    const result = await syncDivision(config.divisionId);
    results.push(result);

    if (result.success) {
      totalSuccess++;
      console.log(
        `  Rosters: ${result.rosterResult?.teamsUpdated || 0} teams updated`
      );
      console.log(
        `  Match Stats: ${result.matchStatsResult?.matchesUpdated || 0} matches updated`
      );
      console.log(
        `  Transactions: ${result.transactionsResult?.transactionsUpdated || 0} transactions updated`
      );
    } else {
      totalFailed++;
      console.log(`  ERROR: ${result.error || "Unknown error"}`);
    }
  }

  console.log(`\n=== Sync Complete ===`);
  console.log(`Success: ${totalSuccess}, Failed: ${totalFailed}`);

  return { results, totalSuccess, totalFailed };
}

/**
 * Get the service account email for display in admin UI
 */
export function getServiceAccountEmail(): string {
  // This is extracted from the credentials file
  // In a real setup, you might want to read this from the JSON file
  return "pbo-sheets-sync@pbo-site.iam.gserviceaccount.com";
}
