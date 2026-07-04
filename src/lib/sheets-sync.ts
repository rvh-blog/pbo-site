import { google, sheets_v4 } from "googleapis";
import path from "path";

// Sheet configuration
const CREDENTIALS_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(process.cwd(), ".secrets", "google-credentials", "pbo-site-2c91419be737.json");

// Initialize the Google Sheets API client
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  
  return google.sheets({ version: "v4", auth });
}

// Read a range from the sheet
export async function readSheetRange(spreadsheetId: string, range: string) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return response.data.values;
}

// Write to multiple ranges in one batch
export async function batchWriteToSheet(
  spreadsheetId: string,
  updates: { range: string; values: (string | number | null)[][] }[]
) {
  const sheets = await getSheetsClient();
  
  const response = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.map((u) => ({
        range: u.range,
        values: u.values,
      })),
    },
  });
  
  return response.data;
}

// Read multiple ranges in one batch
export async function batchReadFromSheet(spreadsheetId: string, ranges: string[]) {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
  });

  return response.data.valueRanges;
}

// Get a map of sheet names to their numeric sheet IDs (needed for formatting API)
export async function getSheetIdMap(spreadsheetId: string): Promise<Map<string, number>> {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId",
  });

  const map = new Map<string, number>();
  for (const sheet of response.data.sheets || []) {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;
    if (title != null && sheetId != null) {
      map.set(title, sheetId);
    }
  }
  return map;
}

// Execute a batchUpdate with formatting requests (updateBorders, etc.)
export async function batchUpdateFormatting(
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[]
) {
  if (requests.length === 0) return;
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

// Check if sync is enabled in the Config tab
export async function isSyncEnabled(spreadsheetId: string): Promise<boolean> {
  const data = await readSheetRange(spreadsheetId, "Config!B2");
  if (!data || !data[0] || !data[0][0]) {
    console.log("Config!B2 not found, defaulting to sync disabled");
    return false;
  }

  const value = String(data[0][0]).toUpperCase().trim();
  return value === "TRUE";
}
