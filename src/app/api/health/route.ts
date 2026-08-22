import { NextResponse } from "next/server";
import { databaseReady, getQueryStats, rawClient } from "@/lib/db";
import { getBrowserPerformanceStats } from "@/lib/performance-monitor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await databaseReady;
    await rawClient.execute("SELECT 1");

    return NextResponse.json(
      {
        status: "ok",
        uptimeSeconds: Math.round(process.uptime()),
        db: getQueryStats(),
        browserPerformance: getBrowserPerformanceStats(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[Health] Database readiness check failed:", error);
    return NextResponse.json(
      { status: "error", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
