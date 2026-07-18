import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Individual blog posting permissions are no longer used" },
    { status: 410 }
  );
}
