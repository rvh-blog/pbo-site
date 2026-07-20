import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

// GET /api/admin/users - list all users (coaches + spectators)
export async function GET() {
  // Check admin auth
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all coaches
    const coaches = await db.query.coaches.findMany({
      columns: {
        id: true,
        name: true,
        passwordHash: true,
        isMod: true,
        isEditor: true,
        claimedAt: true,
        eloRating: true,
      },
      orderBy: (c, { asc }) => [asc(c.name)],
    });

    // Get all spectator users
    const spectators = await db.query.users.findMany({
      columns: {
        id: true,
        username: true,
        isMod: true,
        isEditor: true,
        createdAt: true,
      },
      orderBy: (u, { asc }) => [asc(u.username)],
    });

    // Format for response
    const allUsers = [
      ...coaches.map((c) => ({
        id: c.id,
        name: c.name,
        type: "coach" as const,
        isClaimed: !!c.passwordHash,
        isMod: c.isMod ?? false,
        isEditor: c.isEditor ?? false,
        claimedAt: c.claimedAt,
        eloRating: c.eloRating,
      })),
      ...spectators.map((u) => ({
        id: u.id,
        name: u.username,
        type: "spectator" as const,
        isClaimed: true, // spectators are always claimed
        isMod: u.isMod ?? false,
        isEditor: u.isEditor ?? false,
        claimedAt: u.createdAt,
        eloRating: null,
      })),
    ];

    // Also return spectators separately for the coaches page
    const spectatorsFormatted = spectators.map((u) => ({
      id: u.id,
      name: u.username,
      isMod: u.isMod ?? false,
      isEditor: u.isEditor ?? false,
      createdAt: u.createdAt,
    }));

    return NextResponse.json({ users: allUsers, spectators: spectatorsFormatted });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
