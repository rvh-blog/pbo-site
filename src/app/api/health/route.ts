import { NextResponse } from "next/server";
import { getQueryStats } from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    db: getQueryStats(),
  });
}
