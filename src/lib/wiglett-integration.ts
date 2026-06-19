import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  divisions,
  matches,
  pokemon,
  rosters,
  seasonCoaches,
  seasonPokemonPrices,
  wiglettEvents,
} from "@/lib/schema";
import { addDraftPick } from "@/bot/services/draft-service";
import {
  buildPokemonDataFromReplay,
  matchUsernamesToCoaches,
  parseReplay,
  recordMatchResult,
  getCoachRoster,
} from "@/bot/services/match-service";
import { syncDivision } from "@/lib/sheets-sync-all";
import {
  pokemonExactLookupKeys,
  pokemonNormalizedLookupKeys,
} from "@/lib/pokemon-name-utils";

type JsonRecord = Record<string, unknown>;

type ResolvedTeam = {
  id: number;
  teamName: string;
  teamAbbreviation: string | null;
  coachName: string;
};

export class WiglettIntegrationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "WiglettIntegrationError";
    this.status = status;
  }
}

function normalizeValue(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getString(payload: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function getNumber(payload: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function getBoolean(payload: JsonRecord, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
  }
  return undefined;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function hasDefinedValue(payload: JsonRecord): boolean {
  return Object.values(payload).some((value) => value !== undefined && value !== null);
}

function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

async function resolveDivisionId(payload: JsonRecord): Promise<number> {
  const divisionId = getNumber(payload, ["divisionId", "divisionID"]);
  if (divisionId) {
    const division = await db.query.divisions.findFirst({
      where: eq(divisions.id, divisionId),
    });
    if (!division) throw new WiglettIntegrationError(`Division ${divisionId} not found`);
    return division.id;
  }

  const divisionName = getString(payload, ["divisionName", "division", "div"]);
  if (!divisionName) {
    throw new WiglettIntegrationError("divisionId or divisionName is required");
  }

  const seasonId = getNumber(payload, ["seasonId", "seasonID"]);
  const candidates = await db.query.divisions.findMany({
    with: { season: true },
  });

  const normalizedName = normalizeValue(divisionName);
  const matchesByName = candidates.filter((division) => {
    if (normalizeValue(division.name) !== normalizedName) return false;
    if (seasonId && division.seasonId !== seasonId) return false;
    return seasonId ? true : division.season?.isCurrent;
  });

  if (matchesByName.length === 1) return matchesByName[0].id;
  if (matchesByName.length === 0) {
    throw new WiglettIntegrationError(`Division "${divisionName}" not found`);
  }
  throw new WiglettIntegrationError(
    `Division "${divisionName}" is ambiguous; include divisionId`
  );
}

async function resolveTeam(
  divisionId: number,
  payload: JsonRecord,
  options: { activeOnly?: boolean } = {}
): Promise<ResolvedTeam> {
  const seasonCoachId = getNumber(payload, [
    "seasonCoachId",
    "coachSeasonId",
    "teamId",
    "teamID",
  ]);

  const teams = await db.query.seasonCoaches.findMany({
    where: eq(seasonCoaches.divisionId, divisionId),
    with: { coach: true },
  });

  const eligible = options.activeOnly
    ? teams.filter((team) => team.isActive)
    : teams;

  if (seasonCoachId) {
    const found = eligible.find((team) => team.id === seasonCoachId);
    if (!found) {
      throw new WiglettIntegrationError(`Season coach ${seasonCoachId} not found in division`);
    }
    return {
      id: found.id,
      teamName: found.teamName,
      teamAbbreviation: found.teamAbbreviation,
      coachName: found.coach.name,
    };
  }

  const teamName = getString(payload, ["teamName", "team", "franchise"]);
  const teamAbbreviation = getString(payload, ["teamAbbreviation", "teamAbbr", "abbr"]);
  const coachName = getString(payload, ["coachName", "coach", "userName", "username"]);

  const checks = [
    teamName ? { label: "team name", value: normalizeValue(teamName), key: "teamName" } : null,
    teamAbbreviation
      ? { label: "team abbreviation", value: normalizeValue(teamAbbreviation), key: "teamAbbreviation" }
      : null,
    coachName ? { label: "coach name", value: normalizeValue(coachName), key: "coachName" } : null,
  ].filter(Boolean) as { label: string; value: string; key: string }[];

  for (const check of checks) {
    const found = eligible.filter((team) => {
      if (check.key === "teamName") return normalizeValue(team.teamName) === check.value;
      if (check.key === "teamAbbreviation") {
        return normalizeValue(team.teamAbbreviation) === check.value;
      }
      return normalizeValue(team.coach.name) === check.value;
    });

    if (found.length === 1) {
      const team = found[0];
      return {
        id: team.id,
        teamName: team.teamName,
        teamAbbreviation: team.teamAbbreviation,
        coachName: team.coach.name,
      };
    }
    if (found.length > 1) {
      throw new WiglettIntegrationError(
        `Multiple teams matched ${check.label}; include seasonCoachId`
      );
    }
  }

  throw new WiglettIntegrationError(
    `Could not resolve team in division ${divisionId}; include teamName, teamAbbreviation, coachName, or seasonCoachId`
  );
}

async function resolveDraftPokemon(divisionId: number, payload: JsonRecord) {
  const division = await db.query.divisions.findFirst({
    where: eq(divisions.id, divisionId),
  });
  if (!division) throw new WiglettIntegrationError(`Division ${divisionId} not found`);

  const pokemonId = getNumber(payload, ["pokemonId", "monId", "pokemonID"]);
  const pokemonName = getString(payload, ["pokemonName", "pokemon", "mon", "name"]);

  const pricedPokemon = await db
    .select({
      pokemonId: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      price: seasonPokemonPrices.price,
      teraCaptainCost: seasonPokemonPrices.teraCaptainCost,
    })
    .from(seasonPokemonPrices)
    .innerJoin(pokemon, eq(seasonPokemonPrices.pokemonId, pokemon.id))
    .where(eq(seasonPokemonPrices.seasonId, division.seasonId));

  let candidates = pokemonId
    ? pricedPokemon.filter((row) => row.pokemonId === pokemonId)
    : [];

  if (!pokemonId && pokemonName) {
    const exactKeys = pokemonExactLookupKeys(pokemonName);
    candidates = pricedPokemon.filter((row) => {
      const rowKeys = new Set([
        ...pokemonExactLookupKeys(row.name),
        ...pokemonExactLookupKeys(row.displayName),
      ]);
      return setsIntersect(exactKeys, rowKeys);
    });

    if (candidates.length === 0) {
      const normalizedKeys = pokemonNormalizedLookupKeys(pokemonName);
      candidates = pricedPokemon.filter((row) => {
        const rowKeys = new Set([
          ...pokemonNormalizedLookupKeys(row.name),
          ...pokemonNormalizedLookupKeys(row.displayName),
        ]);
        return setsIntersect(normalizedKeys, rowKeys);
      });
    }
  }

  if (candidates.length === 0) {
    throw new WiglettIntegrationError(`Pokemon "${pokemonName || pokemonId}" not found in season prices`);
  }
  if (candidates.length > 1) {
    throw new WiglettIntegrationError(`Pokemon "${pokemonName}" is ambiguous; include pokemonId`);
  }

  const selected = candidates[0];
  if (selected.price <= 0) {
    throw new WiglettIntegrationError(`${selected.displayName || selected.name} is not draftable`);
  }

  return selected;
}

async function findDivisionPokemonOwner(divisionId: number, pokemonId: number) {
  const existing = await db
    .select({
      seasonCoachId: seasonCoaches.id,
      teamName: seasonCoaches.teamName,
    })
    .from(rosters)
    .innerJoin(seasonCoaches, eq(rosters.seasonCoachId, seasonCoaches.id))
    .where(
      and(
        eq(seasonCoaches.divisionId, divisionId),
        eq(seasonCoaches.isActive, true),
        eq(rosters.pokemonId, pokemonId)
      )
    )
    .limit(1);

  return existing[0] || null;
}

function teamPayloadFromPrefixes(payload: JsonRecord, prefixes: string[]): JsonRecord {
  return {
    seasonCoachId: getNumber(
      payload,
      prefixes.flatMap((prefix) => [`${prefix}SeasonCoachId`, `${prefix}Id`])
    ),
    teamName: getString(
      payload,
      prefixes.flatMap((prefix) => [`${prefix}TeamName`, `${prefix}Team`, prefix])
    ),
    teamAbbreviation: getString(
      payload,
      prefixes.flatMap((prefix) => [`${prefix}TeamAbbreviation`, `${prefix}TeamAbbr`])
    ),
    coachName: getString(
      payload,
      prefixes.flatMap((prefix) => [`${prefix}CoachName`, `${prefix}Coach`])
    ),
  };
}

async function resolveMatchTeams(divisionId: number, payload: JsonRecord) {
  const teamsArray = Array.isArray(payload.teams) ? payload.teams.map(asRecord) : [];

  const hasFirstTeamRef = Boolean(
    getString(payload, ["team1TeamName", "team1", "coach1TeamName", "coach1"]) ||
      getNumber(payload, ["team1SeasonCoachId", "coach1SeasonCoachId"])
  );
  const hasSecondTeamRef = Boolean(
    getString(payload, ["team2TeamName", "team2", "coach2TeamName", "coach2"]) ||
      getNumber(payload, ["team2SeasonCoachId", "coach2SeasonCoachId"])
  );
  const firstTeamPayload = hasFirstTeamRef
    ? teamPayloadFromPrefixes(payload, ["team1", "coach1"])
    : teamsArray[0];
  const secondTeamPayload = hasSecondTeamRef
    ? teamPayloadFromPrefixes(payload, ["team2", "coach2"])
    : teamsArray[1];

  if (Object.keys(firstTeamPayload || {}).length > 0 && Object.keys(secondTeamPayload || {}).length > 0) {
    return {
      teamA: await resolveTeam(divisionId, firstTeamPayload, { activeOnly: false }),
      teamB: await resolveTeam(divisionId, secondTeamPayload, { activeOnly: false }),
    };
  }

  const winnerPayload = {
    seasonCoachId: getNumber(payload, ["winnerId", "winnerSeasonCoachId"]),
    teamName: getString(payload, ["winnerTeamName", "winnerTeam", "winner"]),
    teamAbbreviation: getString(payload, ["winnerTeamAbbreviation", "winnerTeamAbbr"]),
    coachName: getString(payload, ["winnerCoachName", "winnerCoach"]),
  };
  const loserPayload = {
    seasonCoachId: getNumber(payload, ["loserId", "loserSeasonCoachId"]),
    teamName: getString(payload, ["loserTeamName", "loserTeam", "loser"]),
    teamAbbreviation: getString(payload, ["loserTeamAbbreviation", "loserTeamAbbr"]),
    coachName: getString(payload, ["loserCoachName", "loserCoach"]),
  };

  if (hasDefinedValue(winnerPayload) && hasDefinedValue(loserPayload)) {
    return {
      teamA: await resolveTeam(divisionId, winnerPayload, { activeOnly: false }),
      teamB: await resolveTeam(divisionId, loserPayload, { activeOnly: false }),
    };
  }

  throw new WiglettIntegrationError(
    "Match result requires team1/team2, coach1/coach2, teams[], or winner/loser team references"
  );
}

async function resolveMatch(payload: JsonRecord, divisionId: number) {
  const matchId = getNumber(payload, ["matchId", "fixtureId"]);
  if (matchId) {
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, matchId),
    });
    if (!match || match.divisionId !== divisionId) {
      throw new WiglettIntegrationError(`Match ${matchId} not found in division`);
    }
    return match;
  }

  const week = getNumber(payload, ["week", "matchWeek"]);
  if (!week) throw new WiglettIntegrationError("week or matchId is required for match results");

  const { teamA, teamB } = await resolveMatchTeams(divisionId, payload);
  const found = await db.query.matches.findMany({
    where: and(eq(matches.divisionId, divisionId), eq(matches.week, week)),
  });

  const match = found.find(
    (candidate) =>
      (candidate.coach1SeasonId === teamA.id && candidate.coach2SeasonId === teamB.id) ||
      (candidate.coach1SeasonId === teamB.id && candidate.coach2SeasonId === teamA.id)
  );

  if (!match) {
    throw new WiglettIntegrationError(
      `No match found for week ${week}: ${teamA.teamName} vs ${teamB.teamName}`
    );
  }

  return match;
}

async function resolveWinnerId(divisionId: number, payload: JsonRecord): Promise<number | undefined> {
  const winnerId = getNumber(payload, ["winnerId", "winnerSeasonCoachId"]);
  if (winnerId) return winnerId;

  const winnerPayload = {
    teamName: getString(payload, ["winnerTeamName", "winnerTeam", "winner"]),
    teamAbbreviation: getString(payload, ["winnerTeamAbbreviation", "winnerTeamAbbr"]),
    coachName: getString(payload, ["winnerCoachName", "winnerCoach"]),
  };

  if (!hasDefinedValue(winnerPayload)) {
    return undefined;
  }

  return (await resolveTeam(divisionId, winnerPayload, { activeOnly: false })).id;
}

async function resolveRosterPokemonId(
  seasonCoachId: number,
  pokemonRef: JsonRecord,
  week?: number
): Promise<number> {
  const pokemonId = getNumber(pokemonRef, ["pokemonId", "monId", "pokemonID"]);
  const roster = await getCoachRoster(seasonCoachId, week);

  if (pokemonId) {
    const found = roster.find((row) => row.pokemonId === pokemonId);
    if (!found) {
      throw new WiglettIntegrationError(`Pokemon ${pokemonId} is not on season coach ${seasonCoachId}'s roster`);
    }
    return pokemonId;
  }

  const pokemonName = getString(pokemonRef, ["pokemonName", "pokemon", "mon", "name"]);
  const exactKeys = pokemonExactLookupKeys(pokemonName);
  let matches = roster.filter((row) => {
    const rowKeys = new Set([
      ...pokemonExactLookupKeys(row.name),
      ...pokemonExactLookupKeys(row.displayName),
    ]);
    return setsIntersect(exactKeys, rowKeys);
  });

  if (matches.length === 0) {
    const normalizedKeys = pokemonNormalizedLookupKeys(pokemonName);
    matches = roster.filter((row) => {
      const rowKeys = new Set([
        ...pokemonNormalizedLookupKeys(row.name),
        ...pokemonNormalizedLookupKeys(row.displayName),
      ]);
      return setsIntersect(normalizedKeys, rowKeys);
    });
  }

  if (matches.length === 1) return matches[0].pokemonId;
  if (matches.length > 1) {
    throw new WiglettIntegrationError(`Pokemon "${pokemonName}" is ambiguous on roster; include pokemonId`);
  }
  throw new WiglettIntegrationError(`Pokemon "${pokemonName}" is not on season coach ${seasonCoachId}'s roster`);
}

function getKills(entry: JsonRecord): number {
  const totalKills = getNumber(entry, ["totalKills"]);
  if (totalKills !== undefined) return totalKills;

  const kills = getNumber(entry, ["kills", "k"]) || 0;
  const passiveKills = getNumber(entry, ["passiveKills", "passiveK"]) || 0;
  return kills + passiveKills;
}

function flattenPokemonEntries(payload: JsonRecord): JsonRecord[] {
  const direct = payload.pokemonData || payload.pokemon || payload.mons;
  if (Array.isArray(direct)) return direct.map(asRecord);

  if (!Array.isArray(payload.teams)) return [];

  const entries: JsonRecord[] = [];
  for (const team of payload.teams.map(asRecord)) {
    const teamPokemon = team.pokemonData || team.pokemon || team.mons;
    if (!Array.isArray(teamPokemon)) continue;

    for (const pokemonEntry of teamPokemon.map(asRecord)) {
      entries.push({
        ...pokemonEntry,
        seasonCoachId: pokemonEntry.seasonCoachId ?? team.seasonCoachId ?? team.teamId,
        teamName: pokemonEntry.teamName ?? team.teamName ?? team.team,
        teamAbbreviation: pokemonEntry.teamAbbreviation ?? team.teamAbbreviation ?? team.teamAbbr,
        coachName: pokemonEntry.coachName ?? team.coachName ?? team.coach,
      });
    }
  }
  return entries;
}

async function buildCanonicalPokemonData(
  divisionId: number,
  payload: JsonRecord,
  week: number
) {
  const entries = flattenPokemonEntries(payload);
  const result: {
    seasonCoachId: number;
    pokemonId: number;
    kills: number;
    deaths: number;
    damageDealt?: number;
    damageDealtIndirect?: number;
    damageTaken?: number;
    damageTakenIndirect?: number;
    hpRestored?: number;
  }[] = [];

  for (const entry of entries) {
    const team = await resolveTeam(divisionId, entry, { activeOnly: false });
    const pokemonId = await resolveRosterPokemonId(team.id, entry, week);

    result.push({
      seasonCoachId: team.id,
      pokemonId,
      kills: getKills(entry),
      deaths: getNumber(entry, ["deaths", "d"]) || 0,
    });
  }

  return result;
}

function overlayReplayExtraStats<
  T extends {
    seasonCoachId: number;
    pokemonId: number;
    damageDealt?: number;
    damageDealtIndirect?: number;
    damageTaken?: number;
    damageTakenIndirect?: number;
    hpRestored?: number;
  }
>(canonical: T[], scraped: T[]): T[] {
  const scrapedByPokemon = new Map(
    scraped.map((entry) => [`${entry.seasonCoachId}:${entry.pokemonId}`, entry])
  );

  return canonical.map((entry) => {
    const extra = scrapedByPokemon.get(`${entry.seasonCoachId}:${entry.pokemonId}`);
    if (!extra) return entry;

    return {
      ...entry,
      damageDealt: extra.damageDealt,
      damageDealtIndirect: extra.damageDealtIndirect,
      damageTaken: extra.damageTaken,
      damageTakenIndirect: extra.damageTakenIndirect,
      hpRestored: extra.hpRestored,
    };
  });
}

function calculateDifferentials(params: {
  payload: JsonRecord;
  match: typeof matches.$inferSelect;
  winnerId: number;
  replayData: Awaited<ReturnType<typeof parseReplay>>;
  p1IsCoach1?: boolean;
}) {
  const { payload, match, winnerId, replayData, p1IsCoach1 } = params;
  const explicitCoach1Diff = getNumber(payload, ["coach1Differential", "team1Differential"]);
  const explicitCoach2Diff = getNumber(payload, ["coach2Differential", "team2Differential"]);
  if (explicitCoach1Diff !== undefined && explicitCoach2Diff !== undefined) {
    return { coach1Diff: explicitCoach1Diff, coach2Diff: explicitCoach2Diff };
  }

  const winnerDiff = getNumber(payload, ["differential", "diff", "winnerDifferential"]);
  if (winnerDiff !== undefined) {
    const diff = Math.abs(winnerDiff);
    return {
      coach1Diff: winnerId === match.coach1SeasonId ? diff : -diff,
      coach2Diff: winnerId === match.coach2SeasonId ? diff : -diff,
    };
  }

  if (replayData && p1IsCoach1 !== undefined) {
    const coach1Remaining = p1IsCoach1 ? replayData.p1Remaining : replayData.p2Remaining;
    const coach2Remaining = p1IsCoach1 ? replayData.p2Remaining : replayData.p1Remaining;
    return {
      coach1Diff: winnerId === match.coach1SeasonId ? coach1Remaining : -coach2Remaining,
      coach2Diff: winnerId === match.coach2SeasonId ? coach2Remaining : -coach1Remaining,
    };
  }

  if (getBoolean(payload, ["isForfeit", "forfeit"])) {
    return {
      coach1Diff: winnerId === match.coach1SeasonId ? 3 : -3,
      coach2Diff: winnerId === match.coach2SeasonId ? 3 : -3,
    };
  }

  throw new WiglettIntegrationError(
    "Match result requires differential, coach differentials, a replay URL, or isForfeit"
  );
}

async function processDraftPick(payload: JsonRecord, divisionId: number) {
  const team = await resolveTeam(divisionId, payload, { activeOnly: true });
  const selectedPokemon = await resolveDraftPokemon(divisionId, payload);
  const isTeraCaptain = getBoolean(payload, ["isTeraCaptain", "teraCaptain", "tc"]) || false;

  if (isTeraCaptain && selectedPokemon.teraCaptainCost === null) {
    throw new WiglettIntegrationError(
      `${selectedPokemon.displayName || selectedPokemon.name} cannot be a tera captain`
    );
  }

  const existingOwner = await findDivisionPokemonOwner(divisionId, selectedPokemon.pokemonId);
  if (existingOwner) {
    if (existingOwner.seasonCoachId === team.id) {
      return {
        success: true,
        alreadyRecorded: true,
        divisionId,
        seasonCoachId: team.id,
        pokemonId: selectedPokemon.pokemonId,
      };
    }
    throw new WiglettIntegrationError(
      `${selectedPokemon.displayName || selectedPokemon.name} is already drafted by ${existingOwner.teamName}`
    );
  }

  const result = await addDraftPick({
    seasonCoachId: team.id,
    pokemonId: selectedPokemon.pokemonId,
    price: selectedPokemon.price,
    isTeraCaptain,
    teraCaptainCost: selectedPokemon.teraCaptainCost || 0,
  });

  if (!result.success) {
    throw new WiglettIntegrationError(result.error || "Failed to add draft pick");
  }

  const syncResult = await syncDivision(divisionId);

  return {
    success: true,
    divisionId,
    seasonCoachId: team.id,
    pokemonId: selectedPokemon.pokemonId,
    pokemonName: selectedPokemon.displayName || selectedPokemon.name,
    sync: {
      success: syncResult.success,
      error: syncResult.error,
    },
  };
}

async function processMatchResult(payload: JsonRecord, divisionId: number) {
  const match = await resolveMatch(payload, divisionId);
  if (match.winnerId) {
    return {
      success: true,
      alreadyRecorded: true,
      divisionId,
      matchId: match.id,
      winnerId: match.winnerId,
    };
  }

  const replayUrl = getString(payload, ["replayUrl", "replay", "replayURL"]);
  const replayData = replayUrl ? await parseReplay(replayUrl) : null;
  let p1IsCoach1: boolean | undefined;

  if (replayData) {
    const mapping = await matchUsernamesToCoaches(
      match.coach1SeasonId,
      match.coach2SeasonId,
      replayData.p1Username,
      replayData.p2Username,
      replayData.p1Team,
      replayData.p2Team,
      match.week
    );
    p1IsCoach1 = mapping.p1IsCoach1;
  }

  let winnerId = await resolveWinnerId(divisionId, payload);
  if (!winnerId && replayData?.winner && p1IsCoach1 !== undefined) {
    if (replayData.winner === "p1") {
      winnerId = p1IsCoach1 ? match.coach1SeasonId : match.coach2SeasonId;
    } else {
      winnerId = p1IsCoach1 ? match.coach2SeasonId : match.coach1SeasonId;
    }
  }

  if (!winnerId) throw new WiglettIntegrationError("winnerId or winnerTeamName is required");
  if (winnerId !== match.coach1SeasonId && winnerId !== match.coach2SeasonId) {
    throw new WiglettIntegrationError("Winner must be one of the match participants");
  }

  let pokemonData = await buildCanonicalPokemonData(divisionId, payload, match.week);
  if (pokemonData.length === 0 && !getBoolean(payload, ["isForfeit", "forfeit"])) {
    throw new WiglettIntegrationError("Match result requires pokemonData unless it is a forfeit");
  }

  if (replayData && p1IsCoach1 !== undefined && pokemonData.length > 0) {
    const scrapedPokemonData = await buildPokemonDataFromReplay(
      match.coach1SeasonId,
      match.coach2SeasonId,
      replayData,
      p1IsCoach1,
      match.week
    );
    pokemonData = overlayReplayExtraStats(pokemonData, scrapedPokemonData);
  }

  const { coach1Diff, coach2Diff } = calculateDifferentials({
    payload,
    match,
    winnerId,
    replayData,
    p1IsCoach1,
  });

  const isForfeit = getBoolean(payload, ["isForfeit", "forfeit"]);
  if (isForfeit !== undefined) {
    await db
      .update(matches)
      .set({ isForfeit })
      .where(eq(matches.id, match.id));
  }

  const result = await recordMatchResult(
    match.id,
    winnerId,
    coach1Diff,
    coach2Diff,
    replayUrl,
    pokemonData,
    replayData?.startedAt,
    replayData?.endedAt,
    replayData?.turnSnapshots,
    replayData?.keyEvents,
    replayData?.zoroarkInvolved
  );

  if (!result.success) {
    throw new WiglettIntegrationError(result.error || "Failed to record match result");
  }

  return {
    success: true,
    divisionId,
    matchId: match.id,
    winnerId,
    pokemonRows: pokemonData.length,
    replayScraped: Boolean(replayData),
    needsFullRecalc: result.needsFullRecalc,
  };
}

export async function handleWiglettEvent(rawPayload: JsonRecord) {
  const eventId = getString(rawPayload, ["eventId", "id"]);
  if (!eventId) throw new WiglettIntegrationError("eventId is required");

  const eventType = getString(rawPayload, ["eventType", "type"]);
  if (!eventType) throw new WiglettIntegrationError("eventType is required");

  const normalizedEventType = eventType.replace(/-/g, "_").toLowerCase();

  const existingEvent = await db.query.wiglettEvents.findFirst({
    where: eq(wiglettEvents.eventId, eventId),
  });

  if (existingEvent) {
    if (existingEvent.status === "error") {
      await db
        .update(wiglettEvents)
        .set({
          status: "processing",
          payload: rawPayload,
          result: null,
          error: null,
          processedAt: null,
        })
        .where(eq(wiglettEvents.id, existingEvent.id));
    } else {
      return {
        duplicate: true,
        status: existingEvent.status,
        result: existingEvent.result,
        error: existingEvent.error,
      };
    }
  }

  const divisionId = await resolveDivisionId(rawPayload);
  const eventRow = existingEvent || (await db
    .insert(wiglettEvents)
    .values({
      eventId,
      eventType: normalizedEventType,
      divisionId,
      status: "processing",
      payload: rawPayload,
    })
    .returning())[0];

  if (existingEvent) {
    await db
      .update(wiglettEvents)
      .set({
        eventType: normalizedEventType,
        divisionId,
      })
      .where(eq(wiglettEvents.id, existingEvent.id));
  }

  try {
    let result: JsonRecord;
    if (normalizedEventType === "draft_pick" || normalizedEventType === "draftpick") {
      result = await processDraftPick(rawPayload, divisionId);
    } else if (normalizedEventType === "match_result" || normalizedEventType === "matchresult") {
      result = await processMatchResult(rawPayload, divisionId);
    } else {
      throw new WiglettIntegrationError(`Unsupported Wiglett eventType "${eventType}"`);
    }

    await db
      .update(wiglettEvents)
      .set({
        status: "success",
        result,
        processedAt: new Date().toISOString(),
      })
      .where(eq(wiglettEvents.id, eventRow.id));

    return { duplicate: false, status: "success", result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(wiglettEvents)
      .set({
        status: "error",
        error: message,
        processedAt: new Date().toISOString(),
      })
      .where(eq(wiglettEvents.id, eventRow.id));
    throw error;
  }
}
