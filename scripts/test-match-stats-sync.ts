import { syncMatchStatsToSheet } from "../src/lib/sheets-match-stats-sync";

const TEST_SHEET_ID = "1mNAJ3BwV-4AKveLJVT_T4eYQZU3wkLMEtP8wV-If600";
const NEON_S10_DIVISION_ID = 32;

async function main() {
  console.log("Testing match stats sync to Google Sheets...\n");
  console.log(`Sheet ID: ${TEST_SHEET_ID}`);
  console.log(`Division ID: ${NEON_S10_DIVISION_ID} (Neon S10)\n`);

  const result = await syncMatchStatsToSheet(TEST_SHEET_ID, NEON_S10_DIVISION_ID);

  console.log("\n=== Results ===");
  console.log(`Success: ${result.success}`);
  console.log(`Matches updated: ${result.matchesUpdated}`);

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach((e) => console.log(`  - ${e}`));
  }

  console.log("\nDone! Check the sheet to verify the sync.");
}

main().catch(console.error);
