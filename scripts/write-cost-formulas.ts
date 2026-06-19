import { google } from "googleapis";
import path from "path";

const TEST_SHEET_ID = "1mNAJ3BwV-4AKveLJVT_T4eYQZU3wkLMEtP8wV-If600";
const CREDENTIALS_PATH = path.join(process.cwd(), ".secrets", "google-credentials", "pbo-site-2c91419be737.json");

interface SheetTeamPosition {
  teamName: string;
  abbr: string;
  abbrColIdx: number;
  headerRow: number;
}

function colIdxToLetter(idx: number): string {
  let result = "";
  while (idx >= 0) {
    result = String.fromCharCode(65 + (idx % 26)) + result;
    idx = Math.floor(idx / 26) - 1;
  }
  return result;
}

async function main() {
  console.log("Writing cost formulas to all teams...\n");

  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client as any });

  // Read sheet to find team positions
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: TEST_SHEET_ID,
    range: "Rosters!A1:BZ35",
  });
  const data = response.data.values;
  if (!data) {
    console.log("No data found");
    return;
  }

  const positions = new Map<string, SheetTeamPosition>();

  const processRow = (row: any[], headerRow: number) => {
    if (!row) return;
    row.forEach((cell: any, idx: number) => {
      if (cell && typeof cell === "string" && /^[A-Z]{2,4}$/.test(cell)) {
        const teamNameIdx = idx - 4;
        const teamName = teamNameIdx >= 0 ? row[teamNameIdx] : null;
        if (teamName && typeof teamName === "string") {
          const normalizedName = teamName.toLowerCase().trim();
          positions.set(normalizedName, {
            teamName,
            abbr: cell,
            abbrColIdx: idx,
            headerRow,
          });
        }
      }
    });
  };

  processRow(data[1], 2);
  processRow(data[17], 18);

  console.log(`Found ${positions.size} teams in sheet\n`);

  // First, clear all the price column ranges to allow ARRAYFORMULA to expand
  const clearRanges: string[] = [];
  const formulaUpdates: { range: string; values: string[][] }[] = [];

  for (const [name, position] of positions) {
    const { abbrColIdx, headerRow, teamName, abbr } = position;

    const priceColIdx = abbrColIdx - 5;
    const pokemonColIdx = abbrColIdx - 3;
    const teraColIdx = abbrColIdx - 1;

    const priceCol = colIdxToLetter(priceColIdx);
    const pokemonCol = colIdxToLetter(pokemonColIdx);
    const teraCol = colIdxToLetter(teraColIdx);

    const pokemonStartRow = headerRow + 2;
    const formulaEndRow = pokemonStartRow + 11;

    // Clear the entire price column range first (so ARRAYFORMULA can expand)
    clearRanges.push(`Rosters!${priceCol}${pokemonStartRow}:${priceCol}${formulaEndRow}`);

    // Price formula: looks up base price, adds tera cost if tera marker present
    const priceFormula = `=ARRAYFORMULA(IF(${pokemonCol}${pokemonStartRow}:${pokemonCol}${formulaEndRow}="","",IF(${teraCol}${pokemonStartRow}:${teraCol}${formulaEndRow}<>"",XLOOKUP(${pokemonCol}${pokemonStartRow}:${pokemonCol}${formulaEndRow},'Pokédex'!$S$3:$S,'Pokédex'!$O$3:$O)+XLOOKUP(${pokemonCol}${pokemonStartRow}:${pokemonCol}${formulaEndRow},'Pokédex'!$S$3:$S,'Pokédex'!$N$3:$N,0),XLOOKUP(${pokemonCol}${pokemonStartRow}:${pokemonCol}${formulaEndRow},'Pokédex'!$S$3:$S,'Pokédex'!$O$3:$O))))`;

    console.log(`${teamName} (${abbr}): Clear ${priceCol}${pokemonStartRow}:${priceCol}${formulaEndRow}, then write formula`);

    formulaUpdates.push({
      range: `Rosters!${priceCol}${pokemonStartRow}`,
      values: [[priceFormula]],
    });
  }

  // Step 1: Clear all price ranges
  console.log(`\nStep 1: Clearing ${clearRanges.length} price column ranges...`);
  try {
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId: TEST_SHEET_ID,
      requestBody: {
        ranges: clearRanges,
      },
    });
    console.log("  Cleared successfully");
  } catch (error: any) {
    console.error("Error clearing:", error.message);
    return;
  }

  // Step 2: Write all formulas
  console.log(`\nStep 2: Writing ${formulaUpdates.length} formulas...`);
  try {
    const batchResponse = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: TEST_SHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: formulaUpdates.map((u) => ({
          range: u.range,
          values: u.values,
        })),
      },
    });

    console.log(`  Total updated cells: ${batchResponse.data.totalUpdatedCells}`);
  } catch (error: any) {
    console.error("Error writing formulas:", error.message);
    if (error.response?.data) {
      console.error("API Error:", JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log("\n✅ Done! Check the sheet to verify the formulas.");
}

main().catch(console.error);
