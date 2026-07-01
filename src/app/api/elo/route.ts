import { NextRequest, NextResponse } from "next/server";
import { recalculateAllElo } from "@/lib/elo-service";
import { getSession } from "@/lib/session";
import { logAdminAudit } from "@/lib/admin-audit";

export async function POST(request: NextRequest) {
  const session = await getSession();
  const body = await request.json();
  const { action } = body;

  if (action === "recalculateAll") {
    try {
      const result = await recalculateAllElo();
      await logAdminAudit({
        session,
        action: "elo_recalculate_all",
        entityType: "elo",
        entityId: "all",
        summary: `Recalculated ELO for ${result.coachesUpdated} coaches`,
        details: {
          matchesProcessed: result.matchesProcessed,
          coachesUpdated: result.coachesUpdated,
        },
      });
      return NextResponse.json({
        success: true,
        matchesProcessed: result.matchesProcessed,
        coachesUpdated: result.coachesUpdated,
        message: `Recalculated ELO for ${result.coachesUpdated} coaches across ${result.matchesProcessed} matches`,
      });
    } catch (error: unknown) {
      console.error("ELO recalculation error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to recalculate ELO" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
