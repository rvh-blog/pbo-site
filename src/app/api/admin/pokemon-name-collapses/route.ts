import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { isAuthenticated } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { logAdminAudit } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { pokemon, pokemonNameCollapses } from "@/lib/schema";
import { pokemonNameKey } from "@/lib/pokemon-name-utils";

async function requireAdmin() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const targetPokemonId = Number(body?.targetPokemonId);
    const sourceName = String(body?.sourceName ?? "").trim();
    const sourceKey = pokemonNameKey(sourceName);

    if (!Number.isInteger(targetPokemonId) || targetPokemonId <= 0) {
      return NextResponse.json({ error: "targetPokemonId is required" }, { status: 400 });
    }
    if (!sourceName || !sourceKey) {
      return NextResponse.json({ error: "Source name is required" }, { status: 400 });
    }

    const target = await db.query.pokemon.findFirst({
      where: eq(pokemon.id, targetPokemonId),
    });
    if (!target) {
      return NextResponse.json({ error: "Target Pokemon not found" }, { status: 404 });
    }

    const existing = await db.query.pokemonNameCollapses.findFirst({
      where: eq(pokemonNameCollapses.sourceKey, sourceKey),
    });
    if (existing) {
      if (existing.targetPokemonId === targetPokemonId) {
        return NextResponse.json({ collapse: existing, alreadyExists: true });
      }
      const existingTarget = await db.query.pokemon.findFirst({
        where: eq(pokemon.id, existing.targetPokemonId),
      });
      return NextResponse.json(
        {
          error: `Collapse already points to ${existingTarget?.displayName || existingTarget?.name || "another Pokemon"}`,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const [created] = await db
      .insert(pokemonNameCollapses)
      .values({
        targetPokemonId,
        sourceName,
        sourceKey,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await logAdminAudit({
      session: await getSession(),
      action: "pokemon_collapse_create",
      entityType: "pokemon",
      entityId: targetPokemonId,
      summary: `Added Pokemon name collapse "${sourceName}" -> ${target.displayName || target.name}`,
      details: { sourceName, sourceKey },
    });

    return NextResponse.json({ collapse: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add collapse" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const collapseId = Number(searchParams.get("id"));
  const targetPokemonId = Number(searchParams.get("targetPokemonId"));

  if (!Number.isInteger(collapseId) || collapseId <= 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!Number.isInteger(targetPokemonId) || targetPokemonId <= 0) {
    return NextResponse.json({ error: "targetPokemonId is required" }, { status: 400 });
  }

  const existing = await db.query.pokemonNameCollapses.findFirst({
    where: and(
      eq(pokemonNameCollapses.id, collapseId),
      eq(pokemonNameCollapses.targetPokemonId, targetPokemonId)
    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "Collapse not found" }, { status: 404 });
  }

  await db.delete(pokemonNameCollapses).where(eq(pokemonNameCollapses.id, collapseId));

  await logAdminAudit({
    session: await getSession(),
    action: "pokemon_collapse_delete",
    entityType: "pokemon",
    entityId: targetPokemonId,
    summary: `Deleted Pokemon name collapse "${existing.sourceName}"`,
    details: { sourceName: existing.sourceName, sourceKey: existing.sourceKey },
  });

  return NextResponse.json({ success: true });
}
