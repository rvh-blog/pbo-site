import { NextRequest, NextResponse } from "next/server";
import { recordBrowserPerformanceMetric } from "@/lib/performance-monitor";

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 2048) {
      return NextResponse.json({ error: "Metric payload is too large" }, { status: 413 });
    }

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid metric payload" }, { status: 400 });
    }

    const recorded = recordBrowserPerformanceMetric({
      path: body.path,
      id: body.id,
      name: body.name,
      value: body.value,
      rating: body.rating,
      navigationType: body.navigationType,
    });
    if (!recorded) {
      return NextResponse.json({ error: "Invalid metric payload" }, { status: 400 });
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Invalid metric payload" }, { status: 400 });
  }
}
