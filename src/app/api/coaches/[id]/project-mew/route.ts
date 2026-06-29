import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { coaches } from "@/lib/schema";
import { getSession } from "@/lib/session";
import { isProjectMewReleased, PROJECT_MEW_RELEASE_AT } from "@/lib/project-mew";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  if (!isProjectMewReleased()) {
    return NextResponse.json(
      { error: "Project MEW confirmation is not available yet", releaseAt: PROJECT_MEW_RELEASE_AT },
      { status: 404 }
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const coachId = Number(id);
  if (!Number.isInteger(coachId)) {
    return NextResponse.json({ error: "Invalid coach id" }, { status: 400 });
  }

  const canUpdate =
    session.isMod ||
    (session.type === "coach" && session.id === coachId);

  if (!canUpdate) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  if (
    typeof body.projectMewConfirmed !== "boolean" &&
    typeof body.projectMewPromptSeen !== "boolean"
  ) {
    return NextResponse.json(
      { error: "projectMewConfirmed or projectMewPromptSeen must be a boolean" },
      { status: 400 }
    );
  }

  const updateValues: {
    projectMewConfirmed?: boolean;
    projectMewPromptSeen?: boolean;
  } = {};
  if (typeof body.projectMewConfirmed === "boolean") {
    updateValues.projectMewConfirmed = body.projectMewConfirmed;
  }
  if (typeof body.projectMewPromptSeen === "boolean") {
    updateValues.projectMewPromptSeen = body.projectMewPromptSeen;
  }

  const [updated] = await db
    .update(coaches)
    .set(updateValues)
    .where(eq(coaches.id, coachId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: updated.id,
    projectMewConfirmed: updated.projectMewConfirmed ?? false,
    projectMewPromptSeen: updated.projectMewPromptSeen ?? false,
  });
}
