import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  coaches,
  pokemon,
  seasonPokemonPrices,
  seasons,
  speedTourBracketMatches,
  speedTourCoaches,
  speedTourRounds,
  speedTourSelections,
  speedTourSubmissions,
  speedTours,
} from "@/lib/schema";

export const SPEED_TOUR_BUDGET = 90;
export const SPEED_TOUR_TOTAL_ROUNDS = 8;
export const SPEED_TOUR_PHASE_SECONDS = 45;

export type SpeedTourStat =
  | "hp"
  | "attack"
  | "defense"
  | "specialAttack"
  | "specialDefense"
  | "speed"
  | "baseStatTotal";

export type SpeedTourCriteria = {
  types?: string[];
  stat?: SpeedTourStat;
  min?: number | null;
  max?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
};

export type SpeedTourPhase = "waiting" | "draft" | "secondary" | "fallback" | "complete";
export type SpeedTourViewerAction = "pick" | "poison" | "secondary" | "fallback" | null;

type SpeedTourRow = typeof speedTours.$inferSelect;
type SpeedTourRoundRow = typeof speedTourRounds.$inferSelect;

export type SpeedTourCandidate = {
  id: number;
  name: string;
  displayName: string;
  spriteUrl: string | null;
  types: string[];
  price: number;
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
};

function nowIso() {
  return new Date().toISOString();
}

function phaseEndIso() {
  return new Date(Date.now() + SPEED_TOUR_PHASE_SECONDS * 1000).toISOString();
}

const speedTourLocks = new Map<number, Promise<void>>();

async function withSpeedTourLock<T>(tourId: number, callback: () => Promise<T>) {
  const previous = speedTourLocks.get(tourId) ?? Promise.resolve();
  let release = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  speedTourLocks.set(tourId, queued);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (speedTourLocks.get(tourId) === queued) speedTourLocks.delete(tourId);
  }
}

function parseCriteria(value: unknown): SpeedTourCriteria | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const stat = typeof raw.stat === "string" ? raw.stat : undefined;
  const validStats: SpeedTourStat[] = ["hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal"];
  return {
    types: Array.isArray(raw.types) ? raw.types.filter((type): type is string => typeof type === "string").map((type) => type.toLowerCase()) : undefined,
    stat: stat && validStats.includes(stat as SpeedTourStat) ? stat as SpeedTourStat : undefined,
    min: typeof raw.min === "number" ? raw.min : null,
    max: typeof raw.max === "number" ? raw.max : null,
    priceMin: typeof raw.priceMin === "number" ? raw.priceMin : null,
    priceMax: typeof raw.priceMax === "number" ? raw.priceMax : null,
  };
}

export function cleanSpeedTourCriteria(value: unknown): SpeedTourCriteria | null {
  const criteria = parseCriteria(value);
  if (!criteria) return null;
  const normalized = {
    ...criteria,
    types: criteria.types?.filter(Boolean),
  };
  return Object.values(normalized).some((entry) => Array.isArray(entry) ? entry.length > 0 : entry !== undefined && entry !== null)
    ? normalized
    : null;
}

function matchesCriteria(candidate: SpeedTourCandidate, criteria: SpeedTourCriteria | null) {
  if (!criteria) return true;
  if (criteria.types?.length && !criteria.types.some((type) => candidate.types.includes(type))) return false;
  if (criteria.priceMin !== null && criteria.priceMin !== undefined && candidate.price < criteria.priceMin) return false;
  if (criteria.priceMax !== null && criteria.priceMax !== undefined && candidate.price > criteria.priceMax) return false;
  if (criteria.stat) {
    const statValue = candidate[criteria.stat];
    if (criteria.min !== null && criteria.min !== undefined && statValue < criteria.min) return false;
    if (criteria.max !== null && criteria.max !== undefined && statValue > criteria.max) return false;
  }
  return true;
}

function stageKey(round: SpeedTourRoundRow) {
  return round.phase === "fallback" ? `fallback:${round.fallbackPriceCap ?? 5}` : round.phase;
}

function normalizedPhase(round: SpeedTourRoundRow): SpeedTourPhase {
  if (round.phase === "poison" || round.phase === "reselect") return "secondary";
  return round.phase as SpeedTourPhase;
}

async function getSpeedTour(tourId: number) {
  return db.select().from(speedTours).where(eq(speedTours.id, tourId)).limit(1).then((rows) => rows[0] ?? null);
}

async function getCurrentRound(tour: SpeedTourRow) {
  return db.select().from(speedTourRounds).where(and(eq(speedTourRounds.speedTourId, tour.id), eq(speedTourRounds.roundNumber, tour.currentRound))).limit(1).then((rows) => rows[0] ?? null);
}

async function getParticipants(tourId: number) {
  return db
    .select({
      id: speedTourCoaches.id,
      coachId: speedTourCoaches.coachId,
      name: coaches.name,
      remainingBudget: speedTourCoaches.remainingBudget,
    })
    .from(speedTourCoaches)
    .innerJoin(coaches, eq(coaches.id, speedTourCoaches.coachId))
    .where(eq(speedTourCoaches.speedTourId, tourId))
    .orderBy(asc(speedTourCoaches.id));
}

async function getAllSelections(tourId: number) {
  return db
    .select({
      id: speedTourSelections.id,
      roundId: speedTourSelections.roundId,
      participantId: speedTourSelections.participantId,
      pokemonId: speedTourSelections.pokemonId,
      price: speedTourSelections.price,
      roundNumber: speedTourRounds.roundNumber,
      pokemonName: pokemon.displayName,
      pokemonFallbackName: pokemon.name,
      spriteUrl: pokemon.spriteUrl,
    })
    .from(speedTourSelections)
    .innerJoin(speedTourRounds, eq(speedTourRounds.id, speedTourSelections.roundId))
    .innerJoin(pokemon, eq(pokemon.id, speedTourSelections.pokemonId))
    .where(eq(speedTourSelections.speedTourId, tourId))
    .orderBy(asc(speedTourRounds.roundNumber), asc(speedTourSelections.id));
}

async function getPriceCandidates(tour: SpeedTourRow) {
  const rows = await db
    .select({
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.displayName,
      spriteUrl: pokemon.spriteUrl,
      types: pokemon.types,
      hp: pokemon.hp,
      attack: pokemon.attack,
      defense: pokemon.defense,
      specialAttack: pokemon.specialAttack,
      specialDefense: pokemon.specialDefense,
      speed: pokemon.speed,
      baseStatTotal: pokemon.baseStatTotal,
      price: seasonPokemonPrices.price,
    })
    .from(seasonPokemonPrices)
    .innerJoin(pokemon, eq(pokemon.id, seasonPokemonPrices.pokemonId))
    .where(eq(seasonPokemonPrices.seasonId, tour.priceSeasonId))
    .orderBy(desc(seasonPokemonPrices.price), asc(pokemon.displayName), asc(pokemon.id));

  return rows
    .filter((row) => row.price >= 0)
    .map((row): SpeedTourCandidate => ({
      id: row.id,
      name: row.name,
      displayName: row.displayName || row.name,
      spriteUrl: row.spriteUrl,
      types: Array.isArray(row.types) ? row.types.map((type) => type.toLowerCase()) : [],
      price: row.price,
      hp: row.hp ?? 0,
      attack: row.attack ?? 0,
      defense: row.defense ?? 0,
      specialAttack: row.specialAttack ?? 0,
      specialDefense: row.specialDefense ?? 0,
      speed: row.speed ?? 0,
      baseStatTotal: row.baseStatTotal ?? 0,
    }));
}

async function getRoundSubmissions(roundId: number, stage?: string) {
  return db
    .select()
    .from(speedTourSubmissions)
    .where(stage ? and(eq(speedTourSubmissions.roundId, roundId), eq(speedTourSubmissions.stage, stage)) : eq(speedTourSubmissions.roundId, roundId));
}

async function getParticipantAction(tour: SpeedTourRow, round: SpeedTourRoundRow, participantId: number): Promise<SpeedTourViewerAction> {
  const phase = normalizedPhase(round);
  if (phase === "draft") return "pick";
  const selected = await db
    .select({ id: speedTourSelections.id })
    .from(speedTourSelections)
    .where(and(eq(speedTourSelections.roundId, round.id), eq(speedTourSelections.participantId, participantId)))
    .limit(1);
  if (phase === "secondary") {
    if (selected.length) return round.roundNumber <= 6 ? "poison" : null;
    return "secondary";
  }
  if (phase === "fallback") return selected.length ? null : "fallback";
  return null;
}

function submissionStage(round: SpeedTourRoundRow, action: SpeedTourViewerAction) {
  if (action === "poison") return "poison";
  if (action === "secondary") return "secondary";
  return stageKey(round);
}

async function getCandidateBoard(tour: SpeedTourRow, round: SpeedTourRoundRow, participantId?: number | null) {
  const [candidates, selections, roundSubmissions, participants] = await Promise.all([
    getPriceCandidates(tour),
    getAllSelections(tour.id),
    getRoundSubmissions(round.id),
    getParticipants(tour.id),
  ]);

  const viewerAction = participantId ? await getParticipantAction(tour, round, participantId) : null;
  const currentStage = submissionStage(round, viewerAction);
  const selectedIds = new Set(selections.map((selection) => selection.pokemonId));
  const unavailableThisRound = new Set<number>();
  if (normalizedPhase(round) !== "draft") {
    for (const submission of roundSubmissions) unavailableThisRound.add(submission.pokemonId);
  }
  const currentSubmission = participantId
    ? roundSubmissions.find((submission) => submission.participantId === participantId && submission.stage === currentStage) ?? null
    : null;
  const participant = participantId ? participants.find((entry) => entry.id === participantId) : null;
  const criteria = round.roundNumber <= 6 ? parseCriteria(round.criteria) : null;
  const maxPrice = normalizedPhase(round) === "fallback" ? round.fallbackPriceCap ?? 5 : null;
  const remainingBudget = viewerAction === "poison" ? tour.budget : participant?.remainingBudget ?? tour.budget;

  const board = candidates.filter((candidate) => {
    if (selectedIds.has(candidate.id)) return false;
    if (unavailableThisRound.has(candidate.id)) return currentSubmission?.pokemonId === candidate.id;
    if (!matchesCriteria(candidate, criteria)) return false;
    if (maxPrice !== null && candidate.price > maxPrice) return false;
    if (candidate.price > remainingBudget) return false;
    return true;
  });

  return { board, currentSubmission, viewerAction };
}

async function getRequiredParticipantStages(tourId: number, round: SpeedTourRoundRow) {
  const [participants, selections] = await Promise.all([
    getParticipants(tourId),
    db.select({ participantId: speedTourSelections.participantId }).from(speedTourSelections).where(eq(speedTourSelections.roundId, round.id)),
  ]);
  const selectedParticipants = new Set(selections.map((selection) => selection.participantId));
  const phase = normalizedPhase(round);
  return participants.flatMap((participant) => {
    if (phase === "draft") return [{ participantId: participant.id, stage: "draft" }];
    if (phase === "secondary") {
      if (selectedParticipants.has(participant.id)) {
        return round.roundNumber <= 6 ? [{ participantId: participant.id, stage: "poison" }] : [];
      }
      return [{ participantId: participant.id, stage: "secondary" }];
    }
    if (phase === "fallback" && !selectedParticipants.has(participant.id)) {
      return [{ participantId: participant.id, stage: stageKey(round) }];
    }
    return [];
  });
}

async function allRequiredSubmitted(tourId: number, round: SpeedTourRoundRow) {
  const required = await getRequiredParticipantStages(tourId, round);
  if (!required.length) return true;
  const submissions = await getRoundSubmissions(round.id);
  return required.every(({ participantId, stage }) => submissions.some((submission) => submission.participantId === participantId && submission.stage === stage));
}

async function clearStageSubmissions(roundId: number, stage: string) {
  await db.delete(speedTourSubmissions).where(and(eq(speedTourSubmissions.roundId, roundId), eq(speedTourSubmissions.stage, stage)));
}

async function startSecondary(round: SpeedTourRoundRow) {
  await db.update(speedTourRounds).set({
    phase: "secondary",
    phaseEndsAt: phaseEndIso(),
    fallbackPriceCap: null,
    updatedAt: nowIso(),
  }).where(eq(speedTourRounds.id, round.id));
}

async function startFallback(tour: SpeedTourRow, round: SpeedTourRoundRow) {
  const existingStage = stageKey(round);
  let cap = round.fallbackPriceCap ?? 5;
  const [candidates, selections] = await Promise.all([getPriceCandidates(tour), getAllSelections(tour.id)]);
  const criteria = round.roundNumber <= 6 ? parseCriteria(round.criteria) : null;
  const selectedIds = new Set(selections.map((selection) => selection.pokemonId));
  const submissions = await getRoundSubmissions(round.id);
  const unavailable = new Set(submissions.map((submission) => submission.pokemonId));
  const availablePrices = candidates
    .filter((candidate) => candidate.price <= cap && !selectedIds.has(candidate.id) && !unavailable.has(candidate.id) && matchesCriteria(candidate, criteria))
    .map((candidate) => candidate.price);
  if (!availablePrices.length) {
    const nextPrice = candidates
      .filter((candidate) => candidate.price > cap && !selectedIds.has(candidate.id) && matchesCriteria(candidate, criteria))
      .map((candidate) => candidate.price)
      .sort((a, b) => a - b)[0];
    if (nextPrice !== undefined) cap = nextPrice;
  }

  await clearStageSubmissions(round.id, existingStage);
  await db.update(speedTourRounds).set({
    phase: "fallback",
    fallbackPriceCap: cap,
    phaseEndsAt: phaseEndIso(),
    updatedAt: nowIso(),
  }).where(eq(speedTourRounds.id, round.id));
}

async function completeRound(tour: SpeedTourRow, round: SpeedTourRoundRow) {
  const timestamp = nowIso();
  await db.update(speedTourRounds).set({ phase: "complete", phaseEndsAt: null, completedAt: timestamp, updatedAt: timestamp }).where(eq(speedTourRounds.id, round.id));

  if (round.roundNumber >= tour.totalRounds) {
    await db.update(speedTours).set({ status: "completed", updatedAt: timestamp }).where(eq(speedTours.id, tour.id));
    return;
  }

  const nextRound = round.roundNumber + 1;
  await db.insert(speedTourRounds).values({
    speedTourId: tour.id,
    roundNumber: nextRound,
    phase: "waiting",
    criteria: null,
    phaseEndsAt: null,
    fallbackPriceCap: null,
    startedAt: null,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.update(speedTours).set({ currentRound: nextRound, status: "lobby", updatedAt: timestamp }).where(eq(speedTours.id, tour.id));
}

async function saveUniqueSelections(tour: SpeedTourRow, round: SpeedTourRoundRow, submissions: Array<typeof speedTourSubmissions.$inferSelect>) {
  const groups = new Map<number, typeof submissions>();
  for (const submission of submissions) {
    const group = groups.get(submission.pokemonId) ?? [];
    group.push(submission);
    groups.set(submission.pokemonId, group);
  }
  const candidates = await getPriceCandidates(tour);
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const existingSelections = await db.select().from(speedTourSelections).where(eq(speedTourSelections.speedTourId, tour.id));
  const selectedIds = new Set(existingSelections.map((selection) => selection.pokemonId));
  const selectedParticipantIds = new Set(existingSelections.filter((selection) => selection.roundId === round.id).map((selection) => selection.participantId));
  const pendingParticipants = new Set<number>();

  for (const [pokemonId, group] of groups) {
    if (group.length !== 1) {
      group.forEach((submission) => pendingParticipants.add(submission.participantId));
      continue;
    }
    const submission = group[0];
    const candidate = candidateById.get(pokemonId);
    if (!candidate || selectedIds.has(pokemonId) || selectedParticipantIds.has(submission.participantId)) {
      pendingParticipants.add(submission.participantId);
      continue;
    }
    const participant = await db.select().from(speedTourCoaches).where(eq(speedTourCoaches.id, submission.participantId)).limit(1).then((rows) => rows[0]);
    if (!participant || participant.remainingBudget < candidate.price) {
      pendingParticipants.add(submission.participantId);
      continue;
    }
    const timestamp = nowIso();
    await db.insert(speedTourSelections).values({
      speedTourId: tour.id,
      roundId: round.id,
      participantId: submission.participantId,
      pokemonId,
      price: candidate.price,
      createdAt: timestamp,
    });
    await db.update(speedTourCoaches).set({ remainingBudget: participant.remainingBudget - candidate.price }).where(eq(speedTourCoaches.id, participant.id));
    selectedIds.add(pokemonId);
    selectedParticipantIds.add(submission.participantId);
  }

  const allParticipants = await getParticipants(tour.id);
  const currentRoundSelected = new Set(selectedParticipantIds);
  for (const participant of allParticipants) {
    if (!currentRoundSelected.has(participant.id)) pendingParticipants.add(participant.id);
  }
  return { pendingParticipants: [...pendingParticipants] };
}

async function resolveDraftPhase(tour: SpeedTourRow, round: SpeedTourRoundRow) {
  const submissions = await getRoundSubmissions(round.id, "draft");
  const { pendingParticipants } = await saveUniqueSelections(tour, round, submissions);
  if (!pendingParticipants.length) {
    await completeRound(tour, round);
    return;
  }
  await startSecondary(round);
}

async function resolveSecondaryPhase(tour: SpeedTourRow, round: SpeedTourRoundRow) {
  const [poisonSubmissions, secondarySubmissions] = await Promise.all([
    getRoundSubmissions(round.id, "poison"),
    getRoundSubmissions(round.id, "secondary"),
  ]);
  const poisonedPokemonIds = new Set(poisonSubmissions.map((submission) => submission.pokemonId));
  const validSecondarySubmissions = secondarySubmissions.filter((submission) => !poisonedPokemonIds.has(submission.pokemonId));
  const { pendingParticipants } = await saveUniqueSelections(tour, round, validSecondarySubmissions);
  if (!pendingParticipants.length) {
    await completeRound(tour, round);
    return;
  }
  await startFallback(tour, round);
}

async function resolveFallbackPhase(tour: SpeedTourRow, round: SpeedTourRoundRow) {
  const submissions = await getRoundSubmissions(round.id, stageKey(round));
  const { pendingParticipants } = await saveUniqueSelections(tour, round, submissions);
  if (!pendingParticipants.length) {
    await completeRound(tour, round);
    return;
  }
  await startFallback(tour, round);
}

async function advanceSpeedTourInternal(tourId: number, force = false) {
  const tour = await getSpeedTour(tourId);
  if (!tour || tour.status === "completed" || tour.status === "archived") return;
  const round = await getCurrentRound(tour);
  if (!round || round.phase === "waiting" || round.phase === "complete") return;
  const expired = round.phaseEndsAt ? Date.parse(round.phaseEndsAt) <= Date.now() : false;
  if (!force && !expired && !(await allRequiredSubmitted(tour.id, round))) return;

  const phase = normalizedPhase(round);
  if (phase === "draft") await resolveDraftPhase(tour, round);
  else if (phase === "secondary") await resolveSecondaryPhase(tour, round);
  else if (phase === "fallback") await resolveFallbackPhase(tour, round);
}

export function advanceSpeedTour(tourId: number) {
  return withSpeedTourLock(tourId, () => advanceSpeedTourInternal(tourId));
}

export async function createSpeedTour(input: { name: string; priceSeasonId: number }) {
  const name = input.name.trim();
  if (!name) throw new Error("Event name is required");
  const season = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, input.priceSeasonId)).limit(1).then((rows) => rows[0]);
  if (!season) throw new Error("Price season was not found");

  const timestamp = nowIso();
  const [tour] = await db.insert(speedTours).values({
    name,
    status: "lobby",
    priceSeasonId: input.priceSeasonId,
    budget: SPEED_TOUR_BUDGET,
    totalRounds: SPEED_TOUR_TOTAL_ROUNDS,
    currentRound: 1,
    bracketFormat: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning();
  await db.insert(speedTourRounds).values({
    speedTourId: tour.id,
    roundNumber: 1,
    phase: "waiting",
    criteria: null,
    phaseEndsAt: null,
    fallbackPriceCap: null,
    startedAt: null,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return tour;
}

async function registrationIsOpen(tour: SpeedTourRow) {
  if (tour.status !== "lobby" || tour.currentRound !== 1) return false;
  const round = await getCurrentRound(tour);
  return round?.phase === "waiting" && !round.startedAt;
}

export function joinSpeedTour(tourId: number, coachId: number) {
  return withSpeedTourLock(tourId, async () => {
    const tour = await getSpeedTour(tourId);
    if (!tour) throw new Error("Speed Tour not found");
    if (!(await registrationIsOpen(tour))) throw new Error("Registration is closed for this Speed Tour");
    const coach = await db.select({ id: coaches.id }).from(coaches).where(eq(coaches.id, coachId)).limit(1).then((rows) => rows[0]);
    if (!coach) throw new Error("Coach account not found");
    const existing = await db.select({ id: speedTourCoaches.id }).from(speedTourCoaches).where(and(eq(speedTourCoaches.speedTourId, tour.id), eq(speedTourCoaches.coachId, coachId))).limit(1);
    if (!existing.length) {
      await db.insert(speedTourCoaches).values({ speedTourId: tour.id, coachId, remainingBudget: tour.budget, createdAt: nowIso() });
    }
    return getSpeedTourPublicDataInternal(tour.id, coachId);
  });
}

export function leaveSpeedTour(tourId: number, coachId: number) {
  return withSpeedTourLock(tourId, async () => {
    const tour = await getSpeedTour(tourId);
    if (!tour) throw new Error("Speed Tour not found");
    if (!(await registrationIsOpen(tour))) throw new Error("Registration is closed for this Speed Tour");
    await db.delete(speedTourCoaches).where(and(eq(speedTourCoaches.speedTourId, tour.id), eq(speedTourCoaches.coachId, coachId)));
    return getSpeedTourPublicDataInternal(tour.id, coachId);
  });
}

export function forceAdvanceSpeedTour(tourId: number) {
  return withSpeedTourLock(tourId, async () => {
    const tour = await getSpeedTour(tourId);
    if (!tour) throw new Error("Speed Tour not found");
    const round = await getCurrentRound(tour);
    if (!round || ["waiting", "complete"].includes(round.phase)) throw new Error("There is no active drafting phase to advance");
    await advanceSpeedTourInternal(tourId, true);
  });
}

export function forceNextSpeedTourRound(tourId: number) {
  return withSpeedTourLock(tourId, async () => {
    const tour = await getSpeedTour(tourId);
    if (!tour) throw new Error("Speed Tour not found");
    const round = await getCurrentRound(tour);
    if (!round || ["waiting", "complete"].includes(round.phase)) throw new Error("There is no active round to skip");
    await advanceSpeedTourInternal(tourId, true);
    const refreshedTour = await getSpeedTour(tourId);
    if (!refreshedTour || refreshedTour.currentRound !== round.roundNumber || refreshedTour.status === "completed") return;
    const refreshedRound = await getCurrentRound(refreshedTour);
    if (refreshedRound && refreshedRound.phase !== "complete") await completeRound(refreshedTour, refreshedRound);
  });
}

export function removeSpeedTourParticipant(tourId: number, participantId: number) {
  return withSpeedTourLock(tourId, async () => {
    const tour = await getSpeedTour(tourId);
    if (!tour) throw new Error("Speed Tour not found");
    const bracketMatches = await getBracketMatches(tour.id);
    if (tour.status === "bracket" || bracketMatches.length) throw new Error("Participants cannot be removed after the bracket is created");
    const participant = await db.select().from(speedTourCoaches).where(and(eq(speedTourCoaches.id, participantId), eq(speedTourCoaches.speedTourId, tour.id))).limit(1).then((rows) => rows[0]);
    if (!participant) throw new Error("Speed Tour participant not found");
    await db.delete(speedTourCoaches).where(eq(speedTourCoaches.id, participant.id));
    const remaining = await getParticipants(tour.id);
    if (remaining.length && tour.status === "active") await advanceSpeedTourInternal(tour.id);
  });
}

export function endSpeedTour(tourId: number) {
  return withSpeedTourLock(tourId, async () => {
    const tour = await getSpeedTour(tourId);
    if (!tour) throw new Error("Speed Tour not found");
    if (["completed", "archived"].includes(tour.status)) throw new Error("This Speed Tour has already ended");
    const timestamp = nowIso();
    const round = await getCurrentRound(tour);
    if (round && round.phase !== "complete") {
      await db.update(speedTourRounds).set({ phase: "complete", phaseEndsAt: null, completedAt: timestamp, updatedAt: timestamp }).where(eq(speedTourRounds.id, round.id));
    }
    await db.update(speedTours).set({ status: "completed", updatedAt: timestamp }).where(eq(speedTours.id, tour.id));
  });
}

export function startSpeedTourRound(tourId: number, criteria: SpeedTourCriteria | null) {
  return withSpeedTourLock(tourId, async () => {
    const tour = await getSpeedTour(tourId);
    if (!tour) throw new Error("Speed Tour not found");
    const round = await getCurrentRound(tour);
    if (!round || round.phase !== "waiting") throw new Error("The current round is not waiting to start");
    const participants = await getParticipants(tour.id);
    if (!participants.length) throw new Error("At least one coach must join before the round can start");
    const normalizedCriteria = round.roundNumber <= 6 ? cleanSpeedTourCriteria(criteria) : null;
    const timestamp = nowIso();
    await db.update(speedTourRounds).set({
      phase: "draft",
      criteria: normalizedCriteria,
      phaseEndsAt: phaseEndIso(),
      startedAt: timestamp,
      updatedAt: timestamp,
    }).where(eq(speedTourRounds.id, round.id));
    await db.update(speedTours).set({ status: "active", updatedAt: timestamp }).where(eq(speedTours.id, tour.id));
  });
}

export async function submitSpeedTourChoice(input: { tourId: number; coachId: number; pokemonId: number; action: "pick" | "poison" }) {
  return withSpeedTourLock(input.tourId, async () => {
    await advanceSpeedTourInternal(input.tourId);
    const tour = await getSpeedTour(input.tourId);
    if (!tour || tour.status !== "active") throw new Error("This Speed Tour is not accepting choices");
    const round = await getCurrentRound(tour);
    if (!round || !["draft", "secondary", "poison", "reselect", "fallback"].includes(round.phase)) throw new Error("The current phase is not accepting choices");
    const participant = await db.select().from(speedTourCoaches).where(and(eq(speedTourCoaches.speedTourId, tour.id), eq(speedTourCoaches.coachId, input.coachId))).limit(1).then((rows) => rows[0]);
    if (!participant) throw new Error("You are not registered for this Speed Tour");

    const { board, currentSubmission, viewerAction } = await getCandidateBoard(tour, round, participant.id);
    if (!viewerAction) throw new Error("Your action for this round is already complete");
    if (input.action === "poison" && viewerAction !== "poison") throw new Error("You are selecting a Pokémon in the secondary phase, not a Poison Pill");
    if (input.action === "pick" && viewerAction === "poison") throw new Error("Your first pick succeeded, so your action is to select a Poison Pill");
    if (!board.some((candidate) => candidate.id === input.pokemonId) && currentSubmission?.pokemonId !== input.pokemonId) {
      throw new Error("That Pokémon is not available under the current Speed Tour rules");
    }

    const actionPhase = submissionStage(round, viewerAction);
    const timestamp = nowIso();
    const existing = await db.select({ id: speedTourSubmissions.id }).from(speedTourSubmissions).where(and(eq(speedTourSubmissions.roundId, round.id), eq(speedTourSubmissions.participantId, participant.id), eq(speedTourSubmissions.stage, actionPhase))).limit(1).then((rows) => rows[0]);
    if (existing) {
      await db.update(speedTourSubmissions).set({ pokemonId: input.pokemonId, updatedAt: timestamp }).where(eq(speedTourSubmissions.id, existing.id));
    } else {
      await db.insert(speedTourSubmissions).values({ roundId: round.id, participantId: participant.id, stage: actionPhase, pokemonId: input.pokemonId, createdAt: timestamp, updatedAt: timestamp });
    }
    await advanceSpeedTourInternal(tour.id);
    return getSpeedTourPublicDataInternal(tour.id, input.coachId);
  });
}

function nextPowerOfTwo(value: number) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

type SpeedTourBracketMatchRow = typeof speedTourBracketMatches.$inferSelect;

function isResolvedBracketMatch(match: SpeedTourBracketMatchRow) {
  return match.status === "complete" || match.status === "bye";
}

async function getBracketMatches(tourId: number) {
  return db
    .select()
    .from(speedTourBracketMatches)
    .where(eq(speedTourBracketMatches.speedTourId, tourId))
    .orderBy(asc(speedTourBracketMatches.bracketRound), asc(speedTourBracketMatches.bracketPosition));
}

async function advanceSingleEliminationBracket(tourId: number) {
  const matches = await getBracketMatches(tourId);
  const rounds = [...new Set(matches.map((match) => match.bracketRound))].sort((a, b) => a - b);
  for (const bracketRound of rounds) {
    if (bracketRound === rounds[0]) continue;
    const currentMatches = matches.filter((match) => match.bracketRound === bracketRound);
    for (const match of currentMatches) {
      if (match.status === "complete") continue;
      const previousOne = matches.find((candidate) => candidate.bracketRound === bracketRound - 1 && candidate.bracketPosition === (match.bracketPosition * 2) - 1);
      const previousTwo = matches.find((candidate) => candidate.bracketRound === bracketRound - 1 && candidate.bracketPosition === match.bracketPosition * 2);
      if (!previousOne || !previousTwo || !isResolvedBracketMatch(previousOne) || !isResolvedBracketMatch(previousTwo)) continue;

      const winners = [previousOne.winnerParticipantId, previousTwo.winnerParticipantId].filter((id): id is number => id !== null);
      const participantOneId = winners[0] ?? null;
      const participantTwoId = winners[1] ?? null;
      const status = winners.length === 2 ? "pending" : "bye";
      const winnerParticipantId = winners.length === 1 ? winners[0] : null;
      if (match.participantOneId === participantOneId && match.participantTwoId === participantTwoId && match.status === status && match.winnerParticipantId === winnerParticipantId) continue;

      await db.update(speedTourBracketMatches).set({
        participantOneId,
        participantTwoId,
        winnerParticipantId,
        scoreOne: null,
        scoreTwo: null,
        gameReport: null,
        status,
        updatedAt: nowIso(),
      }).where(eq(speedTourBracketMatches.id, match.id));
      match.participantOneId = participantOneId;
      match.participantTwoId = participantTwoId;
      match.winnerParticipantId = winnerParticipantId;
      match.scoreOne = null;
      match.scoreTwo = null;
      match.gameReport = null;
      match.status = status;
    }
  }
}

function getParticipantLosses(matches: SpeedTourBracketMatchRow[]) {
  const losses = new Map<number, number>();
  for (const match of matches) {
    if (match.status !== "complete" || match.participantOneId === null || match.participantTwoId === null) continue;
    const loser = match.winnerParticipantId === match.participantOneId ? match.participantTwoId : match.winnerParticipantId === match.participantTwoId ? match.participantOneId : null;
    if (loser !== null) losses.set(loser, (losses.get(loser) ?? 0) + 1);
  }
  return losses;
}

async function scheduleDoubleEliminationWave(tourId: number) {
  const [matches, participants] = await Promise.all([getBracketMatches(tourId), getParticipants(tourId)]);
  if (matches.some((match) => match.status === "pending")) return;

  const losses = getParticipantLosses(matches);
  const active = participants.filter((participant) => (losses.get(participant.id) ?? 0) < 2);
  if (active.length <= 1) return;

  const undefeated = active.filter((participant) => (losses.get(participant.id) ?? 0) === 0);
  const oneLoss = active.filter((participant) => (losses.get(participant.id) ?? 0) === 1);
  const bracketRound = Math.max(0, ...matches.map((match) => match.bracketRound)) + 1;
  let bracketPosition = 1;
  const timestamp = nowIso();
  const addMatch = async (participantOneId: number | null, participantTwoId: number | null, bracketStage: string) => {
    const hasTwoParticipants = participantOneId !== null && participantTwoId !== null;
    await db.insert(speedTourBracketMatches).values({
      speedTourId: tourId,
      bracketRound,
      bracketPosition: bracketPosition++,
      bracketStage,
      participantOneId,
      participantTwoId,
      winnerParticipantId: hasTwoParticipants ? null : participantOneId ?? participantTwoId,
      scoreOne: null,
      scoreTwo: null,
      gameReport: null,
      status: hasTwoParticipants ? "pending" : "bye",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  };

  const undefeatedRemaining = [...undefeated];
  while (undefeatedRemaining.length >= 2) {
    await addMatch(undefeatedRemaining.shift()!.id, undefeatedRemaining.shift()!.id, "winners");
  }

  const oneLossRemaining = [...oneLoss];
  while (oneLossRemaining.length >= 2) {
    await addMatch(oneLossRemaining.shift()!.id, oneLossRemaining.shift()!.id, "losers");
  }

  if (undefeatedRemaining.length === 1 && oneLossRemaining.length === 1) {
    await addMatch(undefeatedRemaining[0].id, oneLossRemaining[0].id, "grand-final");
  }
}

export async function createSpeedTourBracket(tourId: number, format: "single" | "double") {
  const tour = await getSpeedTour(tourId);
  if (!tour) throw new Error("Speed Tour not found");
  const participants = await getParticipants(tour.id);
  const selections = await getAllSelections(tour.id);
  const completedParticipants = participants.filter((participant) => selections.filter((selection) => selection.participantId === participant.id).length >= tour.totalRounds);
  if (completedParticipants.length < 2) throw new Error("At least two complete teams are required to create a bracket");
  const existingMatches = await getBracketMatches(tour.id);
  if (existingMatches.length) throw new Error("A bracket already exists for this Speed Tour");

  if (format === "double") {
    await scheduleDoubleEliminationWave(tour.id);
  } else {
    const bracketSize = nextPowerOfTwo(completedParticipants.length);
    const roundCount = Math.log2(bracketSize);
    const seeds: Array<number | null> = [...completedParticipants.map((participant) => participant.id), ...Array(bracketSize - completedParticipants.length).fill(null)];
    const timestamp = nowIso();
    for (let bracketRound = 1; bracketRound <= roundCount; bracketRound += 1) {
      const matchCount = bracketSize / (2 ** bracketRound);
      for (let bracketPosition = 1; bracketPosition <= matchCount; bracketPosition += 1) {
        const participantOneId = bracketRound === 1 ? seeds[(bracketPosition - 1) * 2] ?? null : null;
        const participantTwoId = bracketRound === 1 ? seeds[((bracketPosition - 1) * 2) + 1] ?? null : null;
        const hasTwoParticipants = participantOneId !== null && participantTwoId !== null;
        await db.insert(speedTourBracketMatches).values({
          speedTourId: tour.id,
          bracketRound,
          bracketPosition,
          bracketStage: "winners",
          participantOneId,
          participantTwoId,
          winnerParticipantId: hasTwoParticipants ? null : participantOneId ?? participantTwoId,
          scoreOne: null,
          scoreTwo: null,
          gameReport: null,
          status: hasTwoParticipants ? "pending" : "bye",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
    await advanceSingleEliminationBracket(tour.id);
  }
  await db.update(speedTours).set({ bracketFormat: format, status: "bracket", updatedAt: nowIso() }).where(eq(speedTours.id, tour.id));
}

export async function updateSpeedTourBracketMatch(input: { matchId: number; winnerParticipantId: number; scoreOne: number; scoreTwo: number; gameReport: string }) {
  const match = await db.select().from(speedTourBracketMatches).where(eq(speedTourBracketMatches.id, input.matchId)).limit(1).then((rows) => rows[0]);
  if (!match) throw new Error("Bracket match not found");
  if (match.status !== "pending" || match.participantOneId === null || match.participantTwoId === null) throw new Error("This bracket match is not ready for a result");
  if (![match.participantOneId, match.participantTwoId].includes(input.winnerParticipantId)) throw new Error("Winner must be one of the bracket participants");
  if (!Number.isInteger(input.scoreOne) || !Number.isInteger(input.scoreTwo) || input.scoreOne < 0 || input.scoreTwo < 0 || input.scoreOne === input.scoreTwo) throw new Error("Enter two different non-negative scores");
  const winnerScore = input.winnerParticipantId === match.participantOneId ? input.scoreOne : input.scoreTwo;
  const loserScore = input.winnerParticipantId === match.participantOneId ? input.scoreTwo : input.scoreOne;
  if (winnerScore <= loserScore) throw new Error("The winner must have the higher score");
  await db.update(speedTourBracketMatches).set({
    winnerParticipantId: input.winnerParticipantId,
    scoreOne: input.scoreOne,
    scoreTwo: input.scoreTwo,
    gameReport: input.gameReport.trim() || null,
    status: "complete",
    updatedAt: nowIso(),
  }).where(eq(speedTourBracketMatches.id, match.id));

  const tour = await getSpeedTour(match.speedTourId);
  if (tour?.bracketFormat === "double") await scheduleDoubleEliminationWave(match.speedTourId);
  else await advanceSingleEliminationBracket(match.speedTourId);
}

async function getSpeedTourPublicDataInternal(tourId?: number | null, viewerCoachId?: number | null) {
  const tours = await db.select({
    id: speedTours.id,
    name: speedTours.name,
    status: speedTours.status,
    currentRound: speedTours.currentRound,
    bracketFormat: speedTours.bracketFormat,
    createdAt: speedTours.createdAt,
  }).from(speedTours).orderBy(desc(speedTours.createdAt));
  const selected = (tourId ? tours.find((tour) => tour.id === tourId) : null) ?? tours.find((tour) => tour.status !== "archived") ?? tours[0] ?? null;
  if (!selected) return { tours: [], selectedTour: null, serverNow: Date.now() };

  const tour = await getSpeedTour(selected.id);
  if (!tour) return { tours, selectedTour: null, serverNow: Date.now() };
  const [round, participants, selections, bracket, priceSeason] = await Promise.all([
    getCurrentRound(tour),
    getParticipants(tour.id),
    getAllSelections(tour.id),
    db.select().from(speedTourBracketMatches).where(eq(speedTourBracketMatches.speedTourId, tour.id)).orderBy(asc(speedTourBracketMatches.bracketRound), asc(speedTourBracketMatches.bracketPosition)),
    db.select({ id: seasons.id, name: seasons.name, seasonNumber: seasons.seasonNumber }).from(seasons).where(eq(seasons.id, tour.priceSeasonId)).limit(1).then((rows) => rows[0] ?? null),
  ]);
  const viewerParticipant = viewerCoachId ? participants.find((participant) => participant.coachId === viewerCoachId) ?? null : null;
  const board = round && viewerParticipant && round.phase !== "waiting" && round.phase !== "complete"
    ? await getCandidateBoard(tour, round, viewerParticipant.id)
    : { board: [], currentSubmission: null, viewerAction: null };
  const registrationOpen = await registrationIsOpen(tour);
  const bracketParticipantIds = new Set(bracket.flatMap((match) => [match.participantOneId, match.participantTwoId, match.winnerParticipantId].filter((id): id is number => id !== null)));
  const participantName = new Map(participants.map((participant) => [participant.id, participant.name]));

  return {
    tours,
    selectedTour: {
      id: tour.id,
      name: tour.name,
      status: tour.status,
      currentRound: tour.currentRound,
      totalRounds: tour.totalRounds,
      budget: tour.budget,
      bracketFormat: tour.bracketFormat,
      priceSeasonId: tour.priceSeasonId,
      priceSeasonName: priceSeason?.name ?? `Season ${priceSeason?.seasonNumber ?? ""}`.trim(),
      registrationOpen,
      participants: participants.map((participant) => ({
        ...participant,
        selections: selections.filter((selection) => selection.participantId === participant.id).map((selection) => ({
          id: selection.id,
          roundNumber: selection.roundNumber,
          pokemonId: selection.pokemonId,
          name: selection.pokemonName || selection.pokemonFallbackName,
          spriteUrl: selection.spriteUrl,
          price: selection.price,
        })),
      })),
      round: round ? {
        id: round.id,
        number: round.roundNumber,
        phase: normalizedPhase(round),
        criteria: round.roundNumber <= 6 ? parseCriteria(round.criteria) : null,
        phaseEndsAt: round.phaseEndsAt,
        fallbackPriceCap: round.fallbackPriceCap,
        submittedPokemonId: board.currentSubmission?.pokemonId ?? null,
        viewerAction: board.viewerAction,
      } : null,
      candidates: board.board,
      bracket: bracket.map((match) => ({
        id: match.id,
        bracketRound: match.bracketRound,
        bracketPosition: match.bracketPosition,
        bracketStage: match.bracketStage,
        participantOneId: match.participantOneId,
        participantTwoId: match.participantTwoId,
        participantOneName: match.participantOneId ? participantName.get(match.participantOneId) ?? "TBD" : "TBD",
        participantTwoName: match.participantTwoId ? participantName.get(match.participantTwoId) ?? "TBD" : "TBD",
        winnerParticipantId: match.winnerParticipantId,
        scoreOne: match.scoreOne,
        scoreTwo: match.scoreTwo,
        gameReport: match.gameReport,
        status: match.status,
      })),
      viewerParticipantId: viewerParticipant?.id ?? null,
      viewerCoachId: viewerCoachId ?? null,
      viewerCanJoin: Boolean(viewerCoachId && registrationOpen && !viewerParticipant),
      viewerCanLeave: Boolean(viewerCoachId && registrationOpen && viewerParticipant),
      bracketParticipantIds: [...bracketParticipantIds],
    },
    serverNow: Date.now(),
  };
}

export async function getSpeedTourPublicData(tourId?: number | null, viewerCoachId?: number | null) {
  const initial = await getSpeedTourPublicDataInternal(tourId, viewerCoachId);
  if (initial.selectedTour) await advanceSpeedTour(initial.selectedTour.id);
  return getSpeedTourPublicDataInternal(tourId, viewerCoachId);
}

export async function getSpeedTourAdminData() {
  const [tourRows, seasonRows] = await Promise.all([
    db.select().from(speedTours).orderBy(desc(speedTours.createdAt)),
    db.select({ id: seasons.id, name: seasons.name, seasonNumber: seasons.seasonNumber }).from(seasons).orderBy(desc(seasons.seasonNumber)),
  ]);
  const tours = await Promise.all(tourRows.map(async (tour) => getSpeedTourPublicData(tour.id, null)));
  return { tours: tours.map((entry) => entry.selectedTour).filter(Boolean), seasons: seasonRows };
}
