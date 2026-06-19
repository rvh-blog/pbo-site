"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  TeamColumn,
  TeamData,
  createEmptyTeam,
  seasonCoachToTeamData,
} from "./team-column";

interface Pokemon {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl?: string | null;
}

interface Coach {
  id: number;
  name: string;
  seasonCoaches?: Array<{
    id?: number;
    teamName: string;
    teamAbbreviation?: string | null;
    teamLogoUrl: string | null;
  }>;
}

interface SeasonCoach {
  id: number;
  coachId: number;
  teamName: string;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
  remainingBudget: number;
  rosters?: Array<{
    id: number;
    pokemonId: number;
    price: number;
    isTeraCaptain: boolean;
    pokemon: {
      id: number;
      name: string;
      displayName?: string | null;
      spriteUrl?: string | null;
    };
  }>;
}

interface BulkRosterEditorProps {
  isOpen: boolean;
  onClose: () => void;
  seasonId: number;
  divisionId: number;
  divisionName: string;
  seasonName: string;
  existingTeams: SeasonCoach[];
  allCoaches: Coach[];
  allPokemon: Pokemon[];
  pokemonPrices: Map<number, { price: number; teraCaptainCost: number }>;
  draftBudget: number;
  onSave: () => void;
}

export function BulkRosterEditor({
  isOpen,
  onClose,
  seasonId,
  divisionId,
  divisionName,
  seasonName,
  existingTeams,
  allCoaches,
  allPokemon,
  pokemonPrices,
  draftBudget,
  onSave,
}: BulkRosterEditorProps) {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize teams from existing data
  useEffect(() => {
    if (isOpen) {
      const initialTeams = existingTeams.map((sc) =>
        seasonCoachToTeamData(sc, pokemonPrices)
      );
      setTeams(initialTeams);
      setError(null);
    }
  }, [isOpen, existingTeams, pokemonPrices]);

  if (!isOpen) return null;

  // Get list of coach IDs already used (excluding deleted teams)
  const usedCoachIds = teams
    .filter((t) => !t.isDeleted && t.coachId)
    .map((t) => t.coachId as number);

  function handleUpdateTeam(index: number, team: TeamData) {
    const newTeams = [...teams];
    newTeams[index] = team;
    setTeams(newTeams);
  }

  function handleDeleteTeam(index: number) {
    const team = teams[index];
    if (team.id) {
      // Mark existing team for deletion
      handleUpdateTeam(index, { ...team, isDeleted: true });
    } else {
      // Remove new team entirely
      const newTeams = teams.filter((_, i) => i !== index);
      setTeams(newTeams);
    }
  }

  function handleAddTeam() {
    setTeams([...teams, createEmptyTeam()]);
  }

  async function handleSave() {
    setError(null);

    // Validation
    const activeTeams = teams.filter((t) => !t.isDeleted);

    // Check all teams have coaches
    const teamsWithoutCoach = activeTeams.filter((t) => !t.coachId);
    if (teamsWithoutCoach.length > 0) {
      setError("All teams must have a coach selected");
      return;
    }

    // Check for duplicate coaches
    const coachIds = activeTeams.map((t) => t.coachId);
    if (new Set(coachIds).size !== coachIds.length) {
      setError("Each coach can only be on one team");
      return;
    }

    // Check for warnings
    const warnings = activeTeams.flatMap((t) =>
      t.roster.filter((r) => r.hasWarning)
    );
    if (warnings.length > 0) {
      const proceed = confirm(
        `${warnings.length} Pokemon have warnings (unmatched names). Save anyway?`
      );
      if (!proceed) return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/rosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulkUpdateDivision",
          seasonId,
          divisionId,
          draftBudget,
          teams: teams.map((t) => ({
            id: t.id,
            coachId: t.coachId,
            teamName: t.teamName,
            teamAbbreviation: t.teamAbbreviation,
            teamLogoUrl: t.teamLogoUrl,
            roster: t.roster
              .filter((r) => r.pokemonId)
              .map((r) => ({
                pokemonId: r.pokemonId,
                price: r.price,
                isTeraCaptain: r.isTeraCaptain,
              })),
            isDeleted: t.isDeleted,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save");
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[var(--background)] rounded-lg w-[95vw] max-w-[1600px] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--background-tertiary)] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">
              Bulk Edit: {seasonName} - {divisionName}
            </h2>
            <p className="text-sm text-[var(--foreground-muted)]">
              {teams.filter((t) => !t.isDeleted).length} teams | Budget:{" "}
              {draftBudget} pts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--foreground-muted)] hover:text-white transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-4">
          <div className="flex gap-4 items-start min-h-full">
            {teams.map((team, index) => (
              <TeamColumn
                key={team.id || `new-${index}`}
                team={team}
                index={index}
                allCoaches={allCoaches}
                allPokemon={allPokemon}
                pokemonPrices={pokemonPrices}
                usedCoachIds={usedCoachIds}
                draftBudget={draftBudget}
                onUpdate={handleUpdateTeam}
                onDelete={handleDeleteTeam}
              />
            ))}

            {/* Add Team Button */}
            <button
              type="button"
              onClick={handleAddTeam}
              className="w-56 shrink-0 p-4 rounded-lg border-2 border-dashed border-[var(--background-tertiary)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors flex flex-col items-center justify-center gap-2 min-h-[200px]"
            >
              <svg
                className="w-8 h-8 text-[var(--foreground-muted)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span className="text-sm text-[var(--foreground-muted)]">
                Add Team
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--background-tertiary)] flex items-center justify-between shrink-0">
          <div>
            {error && (
              <p className="text-sm text-[var(--error)]">{error}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save All Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
