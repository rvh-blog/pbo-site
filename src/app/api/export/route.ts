import { NextResponse } from "next/server";
import { rawClient } from "@/lib/db";
import * as XLSX from "xlsx";

// Columns to strip from specific tables (auth secrets)
const EXCLUDED_COLUMNS: Record<string, string[]> = {
  coaches: ["password_hash"],
  users: ["password_hash"],
  user_sessions: ["token"],
};

// Internal/system tables to skip
const SKIP_TABLES = new Set([
  "__drizzle_migrations",
  "sqlite_sequence",
]);

export async function GET() {
  try {
    // Discover all user tables from SQLite metadata
    const tablesResult = await rawClient.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%' ORDER BY name"
    );

    const tableNames = tablesResult.rows
      .map((row) => row.name as string)
      .filter((name) => !SKIP_TABLES.has(name));

    const workbook = XLSX.utils.book_new();

    for (const table of tableNames) {
      // Fetch all rows from this table
      const result = await rawClient.execute(`SELECT * FROM "${table}"`);

      if (result.rows.length === 0) {
        const ws = XLSX.utils.aoa_to_sheet([["No data"]]);
        XLSX.utils.book_append_sheet(workbook, ws, table);
        continue;
      }

      // Get column names, excluding any auth secrets for this table
      const excluded = EXCLUDED_COLUMNS[table] || [];
      const columns = result.columns.filter((col) => !excluded.includes(col));

      // Build row objects with only allowed columns, stringify any JSON values
      const rows = result.rows.map((row) => {
        const obj: Record<string, any> = {};
        for (const col of columns) {
          const val = row[col];
          obj[col] =
            Array.isArray(val) || (typeof val === "object" && val !== null)
              ? JSON.stringify(val)
              : val;
        }
        return obj;
      });

      const ws = XLSX.utils.json_to_sheet(rows);

      // Auto-size columns (capped at 40 chars)
      ws["!cols"] = columns.map((header) => {
        let maxLen = header.length;
        for (const row of rows) {
          const len = row[header] != null ? String(row[header]).length : 0;
          if (len > maxLen) maxLen = len;
        }
        return { wch: Math.min(maxLen + 2, 40) };
      });

      XLSX.utils.book_append_sheet(workbook, ws, table);
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const date = new Date().toISOString().split("T")[0];
    const filename = `pbo-data-export-${date}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}
