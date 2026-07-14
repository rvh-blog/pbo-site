import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { isAuthenticated } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { logAdminAudit } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { pokemon, pokemonNameAliases } from "@/lib/schema";
import { invalidatePokemonAliasMapsCache } from "@/lib/pokemon-name-aliases";
import {
  getHardcodedPokemonNameAliases,
  normalizePokemonName,
  pokemonExactLookupAliases,
  pokemonExactLookupKeys,
  pokemonNameKey,
} from "@/lib/pokemon-name-utils";

function hardcodedAliasVariants(value: string | null | undefined): string[] {
  const trimmed = String(value || "").trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/[\s_-]+/).filter(Boolean);
  if (parts.length <= 1) return [trimmed];

  return [
    parts.join("-"),
    parts.join(" "),
    parts.join("_"),
    pokemonNameKey(trimmed),
  ];
}

async function requireAdmin() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const pokemonId = Number(searchParams.get("pokemonId"));
  if (!Number.isInteger(pokemonId) || pokemonId <= 0) {
    return NextResponse.json({ error: "pokemonId is required" }, { status: 400 });
  }

  const selected = await db.query.pokemon.findFirst({
    where: eq(pokemon.id, pokemonId),
  });
  if (!selected) {
    return NextResponse.json({ error: "Pokemon not found" }, { status: 404 });
  }

  const aliases = await db.query.pokemonNameAliases.findMany({
    where: eq(pokemonNameAliases.pokemonId, pokemonId),
  });
  const collapses = await db.query.pokemonNameCollapses.findMany();
  const allPokemon = await db.query.pokemon.findMany();
  const selectedCanonical = normalizePokemonName(selected.displayName || selected.name);
  const selectedKeys = new Set([
    pokemonNameKey(selected.displayName || selected.name),
    pokemonNameKey(selected.name),
  ]);
  const targetKey = pokemonNameKey(selectedCanonical);
  const canonicalTarget = allPokemon.find((row) => (
    pokemonNameKey(row.displayName || row.name) === targetKey
    || pokemonNameKey(row.name) === targetKey
  ));
  const canonicalTargetName = canonicalTarget?.displayName || canonicalTarget?.name || selectedCanonical;
  const collapseSourceMap = new Map<string, { pokemonId: number; sourceName: string }>();
  for (const row of allPokemon
    .flatMap((row) => [
      { pokemonId: row.id, sourceName: row.displayName || row.name },
      ...(row.displayName && row.displayName !== row.name
        ? [{ pokemonId: row.id, sourceName: row.name }]
        : []),
    ])) {
    const sourceKey = pokemonNameKey(row.sourceName);
    if (!collapseSourceMap.has(sourceKey)) {
      collapseSourceMap.set(sourceKey, row);
    }
  }
  const hardcodedCollapses = Array.from(collapseSourceMap.values())
    .filter((row) => {
      const sourceKey = pokemonNameKey(row.sourceName);
      return sourceKey !== targetKey
        && pokemonNameKey(normalizePokemonName(row.sourceName)) === targetKey;
    })
    .map((row) => ({
      ...row,
      sourceKey: pokemonNameKey(row.sourceName),
      targetPokemonId: canonicalTarget?.id ?? null,
      targetName: canonicalTargetName,
      normalizedTargetName: selectedCanonical,
      source: "hardcoded" as const,
    }))
    .sort((a, b) => a.sourceName.localeCompare(b.sourceName));
  const pokemonById = new Map(allPokemon.map((row) => [row.id, row]));
  const customCollapses = collapses
    .filter((collapse) => (
      collapse.targetPokemonId === pokemonId
      || selectedKeys.has(collapse.sourceKey)
    ))
    .map((collapse) => {
      const target = pokemonById.get(collapse.targetPokemonId);
      return {
        ...collapse,
        targetName: target?.displayName || target?.name || "Pokemon",
      };
    })
    .sort((a, b) => a.sourceName.localeCompare(b.sourceName));
  const hardcodedAliasMap = new Map<string, string>();
  for (const alias of [
    ...hardcodedAliasVariants(selected.displayName),
    ...hardcodedAliasVariants(selected.name),
    ...hardcodedAliasVariants(normalizePokemonName(selected.displayName || selected.name)),
    ...pokemonExactLookupAliases(selected.name, { friendlyMegaNames: true }).flatMap(hardcodedAliasVariants),
    ...pokemonExactLookupAliases(selected.displayName, { friendlyMegaNames: true }).flatMap(hardcodedAliasVariants),
    ...getHardcodedPokemonNameAliases(selected.displayName || selected.name).flatMap(hardcodedAliasVariants),
  ]) {
    const key = alias.toLowerCase();
    if (!hardcodedAliasMap.has(key)) hardcodedAliasMap.set(key, alias);
  }
  const hardcodedAliases = Array.from(hardcodedAliasMap.values()).map((alias) => ({
    alias,
    aliasKey: pokemonNameKey(alias),
    source: "hardcoded" as const,
  }));

  return NextResponse.json({
    pokemon: selected,
    builtinKeys: Array.from(
      new Set([
        ...pokemonExactLookupKeys(selected.name, { friendlyMegaNames: true }),
        ...pokemonExactLookupKeys(selected.displayName, { friendlyMegaNames: true }),
      ])
    ).sort(),
    hardcodedAliases,
    hardcodedCollapses,
    customCollapses,
    aliases: aliases.sort((a, b) => a.alias.localeCompare(b.alias)),
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const pokemonId = Number(body?.pokemonId);
    const alias = String(body?.alias ?? "").trim();
    const aliasKey = pokemonNameKey(alias);

    if (!Number.isInteger(pokemonId) || pokemonId <= 0) {
      return NextResponse.json({ error: "pokemonId is required" }, { status: 400 });
    }
    if (!alias || !aliasKey) {
      return NextResponse.json({ error: "Alias is required" }, { status: 400 });
    }

    const selected = await db.query.pokemon.findFirst({
      where: eq(pokemon.id, pokemonId),
    });
    if (!selected) {
      return NextResponse.json({ error: "Pokemon not found" }, { status: 404 });
    }

    const existing = await db.query.pokemonNameAliases.findFirst({
      where: eq(pokemonNameAliases.aliasKey, aliasKey),
    });
    if (existing) {
      if (existing.pokemonId === pokemonId) {
        return NextResponse.json({ alias: existing, alreadyExists: true });
      }
      const existingPokemon = await db.query.pokemon.findFirst({
        where: eq(pokemon.id, existing.pokemonId),
      });
      return NextResponse.json(
        {
          error: `Alias already points to ${existingPokemon?.displayName || existingPokemon?.name || "another Pokemon"}`,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const [created] = await db
      .insert(pokemonNameAliases)
      .values({
        pokemonId,
        alias,
        aliasKey,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    invalidatePokemonAliasMapsCache();

    await logAdminAudit({
      session: await getSession(),
      action: "pokemon_alias_create",
      entityType: "pokemon",
      entityId: pokemonId,
      summary: `Added Pokemon name alias "${alias}" for ${selected.displayName || selected.name}`,
      details: { alias, aliasKey },
    });

    return NextResponse.json({ alias: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add alias" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const aliasId = Number(searchParams.get("id"));
  const pokemonId = Number(searchParams.get("pokemonId"));

  if (!Number.isInteger(aliasId) || aliasId <= 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!Number.isInteger(pokemonId) || pokemonId <= 0) {
    return NextResponse.json({ error: "pokemonId is required" }, { status: 400 });
  }

  const existing = await db.query.pokemonNameAliases.findFirst({
    where: and(
      eq(pokemonNameAliases.id, aliasId),
      eq(pokemonNameAliases.pokemonId, pokemonId)
    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "Alias not found" }, { status: 404 });
  }

  await db.delete(pokemonNameAliases).where(eq(pokemonNameAliases.id, aliasId));
  invalidatePokemonAliasMapsCache();

  await logAdminAudit({
    session: await getSession(),
    action: "pokemon_alias_delete",
    entityType: "pokemon",
    entityId: pokemonId,
    summary: `Deleted Pokemon name alias "${existing.alias}"`,
    details: { alias: existing.alias, aliasKey: existing.aliasKey },
  });

  return NextResponse.json({ success: true });
}
