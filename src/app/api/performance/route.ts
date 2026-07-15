import { NextRequest, NextResponse } from "next/server";
import { recordBrowserPerformanceMetric } from "@/lib/performance-monitor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid metric payload" }, { status: 400 });
    }

    recordBrowserPerformanceMetric({
      path: body.path,
      routeDurationMs: body.routeDurationMs,
      navigationDurationMs: body.navigationDurationMs,
      lcpMs: body.lcpMs,
      cls: body.cls,
      inpMs: body.inpMs,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Invalid metric payload" }, { status: 400 });
  }
}
