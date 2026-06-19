import { NextRequest, NextResponse } from "next/server";
import { recalculateAllElo } from "@/lib/elo-service";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === "recalculateAll") {
    try {
      const result = await recalculateAllElo();
      return NextResponse.json({
        success: true,
        matchesProcessed: result.matchesProcessed,
        coachesUpdated: result.coachesUpdated,
        message: `Recalculated ELO for ${result.coachesUpdated} coaches across ${result.matchesProcessed} matches`,
      });
    } catch (error: any) {
      console.error("ELO recalculation error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to recalculate ELO" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
