import { google } from "googleapis";
import path from "path";

const TEST_SHEET_ID = "1mNAJ3BwV-4AKveLJVT_T4eYQZU3wkLMEtP8wV-If600";
const CREDENTIALS_PATH = path.join(process.cwd(), ".secrets", "google-credentials", "pbo-site-2c91419be737.json");

async function main() {
  console.log("Testing formula write...\n");

  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client as any });

  // Test writing a simple formula to E4 (New England Porygonz cost column)
  const formula = `=ARRAYFORMULA(IF(D4:D15="","",IF(F4:F15<>"",XLOOKUP(D4:D15,'Pokédex'!$S$3:$S,'Pokédex'!$O$3:$O)+XLOOKUP(D4:D15,'Pokédex'!$S$3:$S,'Pokédex'!$N$3:$N,0),XLOOKUP(D4:D15,'Pokédex'!$S$3:$S,'Pokédex'!$O$3:$O))))`;

  console.log("Writing formula to Rosters!E4:");
  console.log(formula);
  console.log("");

  try {
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: TEST_SHEET_ID,
      range: "Rosters!E4",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[formula]],
      },
    });

    console.log("Response:", JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.response?.data) {
      console.error("API Error:", JSON.stringify(error.response.data, null, 2));
    }
  }

  // Now read back what's in E4
  console.log("\nReading back E4...");
  const readResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: TEST_SHEET_ID,
    range: "Rosters!E4",
    valueRenderOption: "FORMULA",
  });
  console.log("E4 contains:", readResponse.data.values);
}

main().catch(console.error);
