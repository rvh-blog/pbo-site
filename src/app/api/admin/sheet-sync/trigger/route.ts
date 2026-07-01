import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { syncDivision, syncAllDivisions } from "@/lib/sheets-sync-all";
import { logAdminAudit } from "@/lib/admin-audit";

// POST /api/admin/sheet-sync/trigger - trigger sync for one or all divisions
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.isMod) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { divisionId } = body;

    if (divisionId) {
      // Sync single division
      console.log(`Manual sync triggered for division ${divisionId}`);
      const result = await syncDivision(divisionId);
      await logAdminAudit({
        session,
        action: "sheets_sync_division",
        entityType: "division",
        entityId: divisionId,
        summary: `Triggered manual Sheets sync for division ${divisionId}`,
        details: { result },
      });
      return NextResponse.json({ results: [result] });
    } else {
      // Sync all divisions
      console.log("Manual sync triggered for all divisions");
      const { results, totalSuccess, totalFailed } = await syncAllDivisions();
      await logAdminAudit({
        session,
        action: "sheets_sync_all",
        entityType: "sheets_sync",
        entityId: "all",
        summary: `Triggered manual Sheets sync for all divisions`,
        details: { totalSuccess, totalFailed, results },
      });
      return NextResponse.json({ results, totalSuccess, totalFailed });
    }
  } catch (error) {
    console.error("Error triggering sync:", error);
    return NextResponse.json(
      { error: "Failed to trigger sync" },
      { status: 500 }
    );
  }
}
