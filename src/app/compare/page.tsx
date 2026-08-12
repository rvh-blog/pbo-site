import type { Metadata } from "next";
import { db } from "@/lib/db";
import { matchPokemon } from "@/lib/schema";
import { inArray } from "drizzle-orm";
import { CompareClient, type CompareEntity, type CompareStats } from "./compare-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Compare Coaches and Pokémon",
  description: "Compare PBO coach records and Pokémon performance across seasons, divisions, and match phases.",
  alternates: { canonical: "/compare" },
};

type CompareMode = "coaches" | "pokemon";
type MatchPhase = "overall" | "regular-season" | "playoffs";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function percent(value: number) {
  return Math.round(value * 10) / 10;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const mode: CompareMode = firstParam(rawParams.type) === "pokemon" ? "pokemon" : "coaches";
  const phaseParam = firstParam(rawParams.phase);
  const phase: MatchPhase = phaseParam === "regular-season" || phaseParam === "playoffs"
    ? phaseParam
    : "overall";
  const selectedSeasonId = numberParam(rawParams.season);
  const selectedDivisionId = numberParam(rawParams.division);
  const includeForfeits = firstParam(rawParams.forfeits) !== "0";

  const [allCoaches, allPokemon, allSeasonCoaches, allMatches, allSeasons, allDivisions] = await Promise.all([
    db.query.coaches.findMany({
      columns: { id: true, name: true, eloRating: true },
    }),
    db.query.pokemon.findMany({
      columns: { id: true, name: true, displayName: true, spriteUrl: true },
    }),
    db.query.seasonCoaches.findMany({
      columns: { id: true, coachId: true, teamName: true, teamLogoUrl: true, divisionId: true },
      with: {
        division: {
          columns: { id: true, seasonId: true, name: true },
          with: { season: { columns: { seasonNumber: true } } },
        },
      },
    }),
    db.query.matches.findMany({
      columns: {
        id: true,
        seasonId: true,
        divisionId: true,
        week: true,
        coach1SeasonId: true,
        coach2SeasonId: true,
        winnerId: true,
        coach1Differential: true,
        coach2Differential: true,
        isForfeit: true,
      },
    }),
    db.query.seasons.findMany({
      columns: { id: true, seasonNumber: true, name: true },
    }),
    db.query.divisions.findMany({
      columns: { id: true, seasonId: true, name: true },
    }),
  ]);

  const latestSeasonCoachByCoachId = new Map<number, typeof allSeasonCoaches[number]>();
  for (const entry of allSeasonCoaches) {
    const current = latestSeasonCoachByCoachId.get(entry.coachId);
    const entrySeasonNumber = entry.division?.season?.seasonNumber ?? 0;
    const currentSeasonNumber = current?.division?.season?.seasonNumber ?? 0;
    if (!current || entrySeasonNumber > currentSeasonNumber || (entrySeasonNumber === currentSeasonNumber && entry.id > current.id)) {
      latestSeasonCoachByCoachId.set(entry.coachId, entry);
    }
  }

  const coachOptions = allCoaches
    .map((coach) => ({
      id: coach.id,
      name: latestSeasonCoachByCoachId.get(coach.id)?.teamName.trim() || coach.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const pokemonOptions = allPokemon
    .map((pokemon) => ({
      id: pokemon.id,
      name: pokemon.displayName || pokemon.name,
      imageUrl: pokemon.spriteUrl,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const options = mode === "coaches" ? coachOptions : pokemonOptions;

  const slotKeys = ["left", "right", "third", "fourth"] as const;
  const selectedIds: number[] = [];
  for (const [index, key] of slotKeys.entries()) {
    const requestedId = numberParam(rawParams[key]);
    const requestedIsValid = options.some((option) => option.id === requestedId)
      && !selectedIds.includes(requestedId!);
    if (requestedIsValid) {
      selectedIds.push(requestedId!);
      continue;
    }
    if (index < 2) {
      const fallback = options.find((option) => !selectedIds.includes(option.id));
      if (fallback) selectedIds.push(fallback.id);
    }
  }

  const filteredMatches = allMatches.filter((match) => {
    if (match.winnerId === null) return false;
    if (match.winnerId !== match.coach1SeasonId && match.winnerId !== match.coach2SeasonId) return false;
    if (!includeForfeits && match.isForfeit === true) return false;
    if (selectedSeasonId && match.seasonId !== selectedSeasonId) return false;
    if (selectedDivisionId && match.divisionId !== selectedDivisionId) return false;
    if (phase === "regular-season" && match.week >= 101) return false;
    if (phase === "playoffs" && match.week < 101) return false;
    return true;
  });
  const filteredMatchIds = new Set(filteredMatches.map((match) => match.id));
  let selections: CompareEntity[] = [];
  const pairwise: Array<{
    firstId: number;
    secondId: number;
    meetings: number;
    firstWins: number;
    secondWins: number;
  }> = [];

  if (mode === "coaches") {
    const buildCoach = (coachId: number): CompareEntity | null => {
      const coach = allCoaches.find((entry) => entry.id === coachId);
      if (!coach) return null;
      const entries = allSeasonCoaches.filter((entry) => entry.coachId === coachId);
      const entryIds = new Set(entries.map((entry) => entry.id));
      let wins = 0;
      let losses = 0;
      let differential = 0;
      const seasonsPlayed = new Set<number>();

      for (const match of filteredMatches) {
        const isCoach1 = entryIds.has(match.coach1SeasonId);
        const isCoach2 = entryIds.has(match.coach2SeasonId);
        if (!isCoach1 && !isCoach2) continue;
        const seasonCoachId = isCoach1 ? match.coach1SeasonId : match.coach2SeasonId;
        if (match.winnerId === seasonCoachId) wins += 1;
        else losses += 1;
        differential += isCoach1 ? (match.coach1Differential ?? 0) : (match.coach2Differential ?? 0);
        seasonsPlayed.add(match.seasonId);
      }

      const latestEntry = latestSeasonCoachByCoachId.get(coachId);
      const games = wins + losses;
      const stats: CompareStats = {
        games,
        wins,
        losses,
        winRate: games > 0 ? percent((wins / games) * 100) : 0,
        differential,
        seasons: seasonsPlayed.size,
        elo: Math.round(coach.eloRating),
      };

      return {
        id: coach.id,
        name: coach.name,
        subtitle: latestEntry?.teamName ?? "No team history",
        imageUrl: latestEntry?.teamLogoUrl ?? null,
        href: `/coaches/${coach.id}`,
        stats,
      };
    };

    selections = selectedIds.map(buildCoach).filter((entity): entity is CompareEntity => entity !== null);
    const seasonIdsByCoach = new Map(
      selectedIds.map((coachId) => [
        coachId,
        new Set(allSeasonCoaches.filter((entry) => entry.coachId === coachId).map((entry) => entry.id)),
      ]),
    );
    for (let firstIndex = 0; firstIndex < selectedIds.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < selectedIds.length; secondIndex += 1) {
        const firstId = selectedIds[firstIndex];
        const secondId = selectedIds[secondIndex];
        const firstEntries = seasonIdsByCoach.get(firstId)!;
        const secondEntries = seasonIdsByCoach.get(secondId)!;
        const result = { firstId, secondId, meetings: 0, firstWins: 0, secondWins: 0 };
        for (const match of filteredMatches) {
          const firstSeasonId = firstEntries.has(match.coach1SeasonId)
            ? match.coach1SeasonId
            : firstEntries.has(match.coach2SeasonId) ? match.coach2SeasonId : null;
          const secondSeasonId = secondEntries.has(match.coach1SeasonId)
            ? match.coach1SeasonId
            : secondEntries.has(match.coach2SeasonId) ? match.coach2SeasonId : null;
          if (!firstSeasonId || !secondSeasonId) continue;
          result.meetings += 1;
          if (match.winnerId === firstSeasonId) result.firstWins += 1;
          if (match.winnerId === secondSeasonId) result.secondWins += 1;
        }
        pairwise.push(result);
      }
    }
  } else {
    const selectedPokemonIds = selectedIds.filter((id) => id > 0);
    const pokemonRows = selectedPokemonIds.length
      ? await db.query.matchPokemon.findMany({
          where: inArray(matchPokemon.pokemonId, selectedPokemonIds),
          columns: {
            matchId: true,
            seasonCoachId: true,
            pokemonId: true,
            kills: true,
            deaths: true,
            damageDealt: true,
            damageDealtIndirect: true,
            turnsActive: true,
            favorableCrits: true,
            favorableMisses: true,
            favorableFlinches: true,
            favorableParalysis: true,
            favorableFreezes: true,
            favorableBurns: true,
            favorableSleep: true,
          },
        })
      : [];
    const matchById = new Map(filteredMatches.map((match) => [match.id, match]));

    const buildPokemon = (pokemonId: number): CompareEntity | null => {
      const pokemon = allPokemon.find((entry) => entry.id === pokemonId);
      if (!pokemon) return null;
      const rows = pokemonRows.filter((row) => {
        const match = matchById.get(row.matchId);
        return row.pokemonId === pokemonId
          && !!match
          && (row.seasonCoachId === match.coach1SeasonId || row.seasonCoachId === match.coach2SeasonId);
      });
      let wins = 0;
      let losses = 0;
      let kills = 0;
      let deaths = 0;
      let damage = 0;
      let turns = 0;
      let hax = 0;
      let hasDamage = false;
      let hasTurns = false;
      let hasHax = false;

      for (const row of rows) {
        const match = matchById.get(row.matchId)!;
        if (match.winnerId === row.seasonCoachId) wins += 1;
        else losses += 1;
        kills += row.kills ?? 0;
        deaths += row.deaths ?? 0;
        if (row.damageDealt !== null || row.damageDealtIndirect !== null) hasDamage = true;
        damage += (row.damageDealt ?? 0) + (row.damageDealtIndirect ?? 0);
        if (row.turnsActive !== null) hasTurns = true;
        turns += row.turnsActive ?? 0;
        const haxFields = [
          row.favorableCrits,
          row.favorableMisses,
          row.favorableFlinches,
          row.favorableParalysis,
          row.favorableFreezes,
          row.favorableBurns,
          row.favorableSleep,
        ];
        if (haxFields.some((value) => value !== null)) hasHax = true;
        hax += haxFields.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      }

      const games = rows.length;
      const stats: CompareStats = {
        games,
        wins,
        losses,
        winRate: games > 0 ? percent((wins / games) * 100) : 0,
        kills,
        deaths,
        differential: kills - deaths,
        kd: deaths > 0 ? percent(kills / deaths) : kills > 0 ? null : 0,
        killsPerGame: games > 0 ? percent(kills / games) : 0,
        damage: hasDamage ? damage : null,
        damagePerGame: hasDamage && games > 0 ? percent(damage / games) : null,
        turns: hasTurns ? percent(turns) : null,
        hax: hasHax ? hax : null,
      };

      return {
        id: pokemon.id,
        name: pokemon.displayName || pokemon.name,
        subtitle: `${games} qualifying appearance${games === 1 ? "" : "s"}`,
        imageUrl: pokemon.spriteUrl,
        href: `/pokemon/${pokemon.id}`,
        stats,
      };
    };

    selections = selectedIds.map(buildPokemon).filter((entity): entity is CompareEntity => entity !== null);
    const rowsByMatch = new Map<number, Map<number, typeof pokemonRows[number]>>();
    for (const row of pokemonRows) {
      if (!filteredMatchIds.has(row.matchId)) continue;
      const entries = rowsByMatch.get(row.matchId) ?? new Map();
      entries.set(row.pokemonId, row);
      rowsByMatch.set(row.matchId, entries);
    }
    for (let firstIndex = 0; firstIndex < selectedIds.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < selectedIds.length; secondIndex += 1) {
        const firstId = selectedIds[firstIndex];
        const secondId = selectedIds[secondIndex];
        const result = { firstId, secondId, meetings: 0, firstWins: 0, secondWins: 0 };
        for (const [matchId, rows] of rowsByMatch) {
          const firstRow = rows.get(firstId);
          const secondRow = rows.get(secondId);
          const match = matchById.get(matchId);
          if (!firstRow || !secondRow || !match || firstRow.seasonCoachId === secondRow.seasonCoachId) continue;
          result.meetings += 1;
          if (match.winnerId === firstRow.seasonCoachId) result.firstWins += 1;
          if (match.winnerId === secondRow.seasonCoachId) result.secondWins += 1;
        }
        pairwise.push(result);
      }
    }
  }

  const query = Object.fromEntries(
    Object.entries(rawParams).flatMap(([key, value]) => {
      const normalized = firstParam(value);
      return normalized ? [[key, normalized]] : [];
    }),
  );

  return (
    <CompareClient
      mode={mode}
      options={options}
      selections={selections}
      pairwise={pairwise}
      seasons={[...allSeasons].sort((a, b) => b.seasonNumber - a.seasonNumber)}
      divisions={allDivisions.map((division) => ({ ...division, name: division.name.trim() }))}
      selectedSeasonId={selectedSeasonId}
      selectedDivisionId={selectedDivisionId}
      phase={phase}
      includeForfeits={includeForfeits}
      query={query}
    />
  );
}
