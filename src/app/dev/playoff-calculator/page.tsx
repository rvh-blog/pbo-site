import { inArray } from "drizzle-orm";
import { compareDivisions } from "@/lib/division-order";
import { db } from "@/lib/db";
import { matches, seasonCoaches } from "@/lib/schema";
import {
  DevPlayoffCalculator,
} from "./dev-playoff-calculator";
import type {
  CalculatorDivision,
  CalculatorMatch,
  CalculatorTeam,
} from "./playoff-calculator-engine";

export const dynamic = "force-dynamic";

function buildDemoSchedule(
  division: CalculatorDivision,
  existingTeams: CalculatorTeam[],
) {
  const teams = existingTeams.slice();
  const minimumTeamCount = 12;

  for (let index = teams.length; index < minimumTeamCount; index += 1) {
    teams.push({
      id: -(division.id * 100 + index + 1),
      divisionId: division.id,
      teamName: `${division.name} Demo Team ${index + 1}`,
      teamAbbreviation: `${division.name.slice(0, 1).toUpperCase()}${String(index + 1).padStart(2, "0")}`,
      isActive: true,
      replacedById: null,
      eloRating: null,
    });
  }

  const rotation: Array<number | null> = teams.map((team) => team.id);
  if (rotation.length % 2 !== 0) rotation.push(null);

  const demoMatches: CalculatorMatch[] = [];
  const roundCount = Math.min(8, rotation.length - 1);
  for (let round = 0; round < roundCount; round += 1) {
    const week = round + 1;
    for (let pair = 0; pair < rotation.length / 2; pair += 1) {
      const firstId = rotation[pair];
      const secondId = rotation[rotation.length - 1 - pair];
      if (firstId === null || secondId === null) continue;

      const isCompleted = week <= 5;
      const firstWins = (division.id + week + pair) % 2 === 0;
      const differential = ((division.id + week * 2 + pair) % 6) + 1;
      demoMatches.push({
        id: -(division.id * 10_000 + week * 100 + pair + 1),
        divisionId: division.id,
        week,
        coach1SeasonId: firstId,
        coach2SeasonId: secondId,
        winnerId: isCompleted ? (firstWins ? firstId : secondId) : null,
        isForfeit: false,
        coach1Differential: isCompleted ? (firstWins ? differential : -differential) : 0,
        coach2Differential: isCompleted ? (firstWins ? -differential : differential) : 0,
      });
    }

    const last = rotation.pop();
    if (last !== undefined) rotation.splice(1, 0, last);
  }

  return { teams, matches: demoMatches };
}

export default async function DevPlayoffCalculatorPage() {
  const season = await db.query.seasons.findFirst({
    where: (season, { eq }) => eq(season.isCurrent, true),
    orderBy: (season, { desc }) => [desc(season.seasonNumber)],
  }) ?? await db.query.seasons.findFirst({
    orderBy: (season, { desc }) => [desc(season.seasonNumber)],
  });

  if (!season) {
    return <DevPlayoffCalculator seasonName="No season found" divisions={[]} teams={[]} matches={[]} />;
  }

  const seasonDivisions = await db.query.divisions.findMany({
    where: (division, { eq }) => eq(division.seasonId, season.id),
  });
  seasonDivisions.sort(compareDivisions);

  const divisionIds = seasonDivisions.map((division) => division.id);
  const [divisionTeams, divisionMatches] = divisionIds.length === 0
    ? [[], []]
    : await Promise.all([
        db.query.seasonCoaches.findMany({
          where: inArray(seasonCoaches.divisionId, divisionIds),
          with: { coach: true },
        }),
        db.query.matches.findMany({
          where: inArray(matches.divisionId, divisionIds),
          orderBy: (match, { asc }) => [asc(match.week), asc(match.id)],
        }),
      ]);

  const calculatorDivisions: CalculatorDivision[] = seasonDivisions.map((division) => ({
    id: division.id,
    name: division.name,
  }));
  const calculatorTeams: CalculatorTeam[] = divisionTeams.map((team) => ({
    id: team.id,
    divisionId: team.divisionId,
    teamName: team.teamName,
    teamAbbreviation: team.teamAbbreviation,
    isActive: team.isActive ?? true,
    replacedById: team.replacedById,
    eloRating: team.coach?.eloRating ?? null,
  }));
  const calculatorMatches: CalculatorMatch[] = divisionMatches.map((match) => ({
    id: match.id,
    divisionId: match.divisionId,
    week: match.week,
    coach1SeasonId: match.coach1SeasonId,
    coach2SeasonId: match.coach2SeasonId,
    winnerId: match.winnerId,
    isForfeit: match.isForfeit,
    coach1Differential: match.coach1Differential,
    coach2Differential: match.coach2Differential,
  }));

  const demoDivisionIds: number[] = [];
  for (const division of calculatorDivisions) {
    const hasRegularSeasonMatches = calculatorMatches.some(
      (match) => match.divisionId === division.id && match.week <= 100,
    );
    if (hasRegularSeasonMatches) continue;

    const divisionActiveTeams = calculatorTeams.filter(
      (team) => team.divisionId === division.id && team.isActive,
    );
    const demo = buildDemoSchedule(division, divisionActiveTeams);
    const existingTeamIds = new Set(calculatorTeams.map((team) => team.id));
    calculatorTeams.push(...demo.teams.filter((team) => !existingTeamIds.has(team.id)));
    calculatorMatches.push(...demo.matches);
    demoDivisionIds.push(division.id);
  }

  return (
    <DevPlayoffCalculator
      seasonName={season.name}
      divisions={calculatorDivisions}
      teams={calculatorTeams}
      matches={calculatorMatches}
      demoDivisionIds={demoDivisionIds}
    />
  );
}
