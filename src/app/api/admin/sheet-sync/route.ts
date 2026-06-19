import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { divisionSheetSync, seasons } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getServiceAccountEmail } from "@/lib/sheets-sync-all";

// GET /api/admin/sheet-sync - get all sync configurations
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.isMod) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get only current seasons with their divisions
    const allSeasons = await db.query.seasons.findMany({
      where: eq(seasons.isCurrent, true),
      with: {
        divisions: {
          with: {
            sheetSync: true,
          },
        },
      },
      orderBy: (seasons, { desc }) => [desc(seasons.id)],
    });

    const serviceAccountEmail = getServiceAccountEmail();

    return NextResponse.json({
      seasons: allSeasons.map((season) => ({
        id: season.id,
        name: season.name,
        isCurrent: season.isCurrent,
        divisions: season.divisions.map((div) => ({
          id: div.id,
          name: div.name,
          sheetSync: div.sheetSync
            ? {
                id: div.sheetSync.id,
                spreadsheetId: div.sheetSync.spreadsheetId,
                syncEnabled: div.sheetSync.syncEnabled,
                syncMatchResultsEnabled: div.sheetSync.syncMatchResultsEnabled,
                syncRostersTransactionsEnabled: div.sheetSync.syncRostersTransactionsEnabled,
                lastSyncAt: div.sheetSync.lastSyncAt,
                lastSyncStatus: div.sheetSync.lastSyncStatus,
                lastSyncError: div.sheetSync.lastSyncError,
              }
            : null,
        })),
      })),
      serviceAccountEmail,
    });
  } catch (error) {
    console.error("Error getting sheet sync config:", error);
    return NextResponse.json(
      { error: "Failed to get sheet sync config" },
      { status: 500 }
    );
  }
}

// POST /api/admin/sheet-sync - create or update sync config for a division
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.isMod) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      divisionId,
      spreadsheetId,
      syncEnabled,
      syncMatchResultsEnabled,
      syncRostersTransactionsEnabled,
    } = body;

    if (!divisionId || !spreadsheetId) {
      return NextResponse.json(
        { error: "divisionId and spreadsheetId are required" },
        { status: 400 }
      );
    }

    // Check if config already exists
    const existing = await db.query.divisionSheetSync.findFirst({
      where: eq(divisionSheetSync.divisionId, divisionId),
    });

    if (existing) {
      // Update existing
      await db
        .update(divisionSheetSync)
        .set({
          spreadsheetId,
          syncEnabled: syncEnabled ?? existing.syncEnabled ?? true,
          syncMatchResultsEnabled:
            syncMatchResultsEnabled ?? existing.syncMatchResultsEnabled ?? true,
          syncRostersTransactionsEnabled:
            syncRostersTransactionsEnabled ?? existing.syncRostersTransactionsEnabled ?? true,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(divisionSheetSync.id, existing.id));
    } else {
      // Create new
      await db.insert(divisionSheetSync).values({
        divisionId,
        spreadsheetId,
        syncEnabled: syncEnabled ?? true,
        syncMatchResultsEnabled: syncMatchResultsEnabled ?? true,
        syncRostersTransactionsEnabled: syncRostersTransactionsEnabled ?? true,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving sheet sync config:", error);
    return NextResponse.json(
      { error: "Failed to save sheet sync config" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/sheet-sync - remove sync config for a division
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session?.isMod) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const divisionId = searchParams.get("divisionId");

    if (!divisionId) {
      return NextResponse.json(
        { error: "divisionId is required" },
        { status: 400 }
      );
    }

    await db
      .delete(divisionSheetSync)
      .where(eq(divisionSheetSync.divisionId, parseInt(divisionId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting sheet sync config:", error);
    return NextResponse.json(
      { error: "Failed to delete sheet sync config" },
      { status: 500 }
    );
  }
}
