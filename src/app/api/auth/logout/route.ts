import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/session";

// POST /api/auth/logout - clear session
export async function POST() {
  try {
    await deleteSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error logging out:", error);
    return NextResponse.json(
      { error: "Failed to logout" },
      { status: 500 }
    );
  }
}
