"use client";

import { useState } from "react";
import Image from "next/image";
import { PokemonAutocomplete, findPokemonMatch } from "./pokemon-autocomplete";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

interface RosterSlot {
  pokemonId: number | null;
  pokemonName: string;
  price: number;
  isTeraCaptain: boolean;
  hasWarning: boolean;
  warningText: string;
}

export interface TeamData {
  id: number | null;
  coachId: number | null;
  teamName: string;
  teamAbbreviation: string;
  teamLogoUrl: string;
  roster: RosterSlot[];
  isDeleted: boolean;
}

interface TeamColumnProps {
  team: TeamData;
  index: number;
  allCoaches: Coach[];
  allPokemon: Pokemon[];
  pokemonPrices: Map<number, { price: number; teraCaptainCost: number }>;
  usedCoachIds: number[];
  draftBudget: number;
  onUpdate: (index: number, team: TeamData) => void;
  onDelete: (index: number) => void;
}

export function TeamColumn({
  team,
  index,
  allCoaches,
  allPokemon,
  pokemonPrices,
  usedCoachIds,
  draftBudget,
  onUpdate,
  onDelete,
}: TeamColumnProps) {
  const [logoError, setLogoError] = useState(false);

  // Calculate total spent and remaining budget
  const totalSpent = team.roster.reduce((sum, slot) => sum + slot.price, 0);
  const remainingBudget = draftBudget - totalSpent;

  // Available coaches (not used by other teams)
  const availableCoaches = allCoaches.filter(
    (c) => c.id === team.coachId || !usedCoachIds.includes(c.id)
  );

  function handleCoachChange(coachId: number | null) {
    if (!coachId) {
      onUpdate(index, { ...team, coachId: null });
      return;
    }

    const coach = allCoaches.find((c) => c.id === coachId);
    if (!coach) return;

    // Get their most recent season entry for auto-fill
    const latestEntry = coach.seasonCoaches?.[0];

    onUpdate(index, {
      ...team,
      coachId,
      teamName: latestEntry?.teamName || team.teamName || "",
      teamAbbreviation: latestEntry?.teamAbbreviation || team.teamAbbreviation || "",
      teamLogoUrl: latestEntry?.teamLogoUrl || team.teamLogoUrl || "",
    });
    setLogoError(false);
  }

  function handleRosterChange(
    slotIndex: number,
    pokemonId: number | null,
    pokemonName: string
  ) {
    const newRoster = [...team.roster];
    const priceInfo = pokemonId ? pokemonPrices.get(pokemonId) : null;
    const basePrice = priceInfo?.price || 0;
    const tcCost = newRoster[slotIndex].isTeraCaptain
      ? priceInfo?.teraCaptainCost || 0
      : 0;

    newRoster[slotIndex] = {
      ...newRoster[slotIndex],
      pokemonId,
      pokemonName,
      price: basePrice + tcCost,
      hasWarning: pokemonName !== "" && !pokemonId,
      warningText: pokemonId ? "" : `No match for "${pokemonName}"`,
    };

    onUpdate(index, { ...team, roster: newRoster });
  }

  function handleTeraCaptainChange(slotIndex: number, isTeraCaptain: boolean) {
    const newRoster = [...team.roster];
    const slot = newRoster[slotIndex];
    const priceInfo = slot.pokemonId ? pokemonPrices.get(slot.pokemonId) : null;
    const basePrice = priceInfo?.price || 0;
    const tcCost = isTeraCaptain ? priceInfo?.teraCaptainCost || 0 : 0;

    newRoster[slotIndex] = {
      ...slot,
      isTeraCaptain,
      price: basePrice + tcCost,
    };

    onUpdate(index, { ...team, roster: newRoster });
  }

  function handleMultiLinePaste(startIndex: number, lines: string[]) {
    const newRoster = [...team.roster];

    for (let i = 0; i < lines.length && startIndex + i < 12; i++) {
      const line = lines[i];
      const match = findPokemonMatch(line, allPokemon);
      const priceInfo = match ? pokemonPrices.get(match.id) : null;

      newRoster[startIndex + i] = {
        pokemonId: match?.id || null,
        pokemonName: match ? match.displayName || match.name : line,
        price: priceInfo?.price || 0,
        isTeraCaptain: false,
        hasWarning: line !== "" && !match,
        warningText: match ? "" : `No match for "${line}"`,
      };
    }

    onUpdate(index, { ...team, roster: newRoster });
  }

  if (team.isDeleted) {
    return (
      <div className="w-56 shrink-0 p-3 rounded-lg border-2 border-dashed border-[var(--error)]/30 bg-[var(--error)]/5">
        <p className="text-sm text-[var(--error)] text-center mb-2">
          Team will be deleted
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate(index, { ...team, isDeleted: false })}
          className="w-full"
        >
          Undo Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="w-56 shrink-0 p-3 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--card)]">
      {/* Header with delete button */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-[var(--foreground-muted)] uppercase">
          {team.id ? `Team ${index + 1}` : "New Team"}
        </span>
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="text-[var(--foreground-muted)] hover:text-[var(--error)] transition-colors"
          title="Delete team"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Coach Selection */}
      <div className="mb-2">
        <label className="text-[10px] text-[var(--foreground-muted)] uppercase">
          Coach
        </label>
        <Select
          value={team.coachId?.toString() || ""}
          onChange={(e) =>
            handleCoachChange(e.target.value ? parseInt(e.target.value) : null)
          }
          className="text-sm py-1"
        >
          <option value="">Select coach...</option>
          {availableCoaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Team Name */}
      <div className="mb-2">
        <label className="text-[10px] text-[var(--foreground-muted)] uppercase">
          Team Name
        </label>
        <input
          type="text"
          value={team.teamName}
          onChange={(e) =>
            onUpdate(index, { ...team, teamName: e.target.value })
          }
          className="w-full px-2 py-1 text-sm rounded bg-[var(--background-secondary)] border border-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          placeholder="Team name"
        />
      </div>

      {/* Abbreviation */}
      <div className="mb-2">
        <label className="text-[10px] text-[var(--foreground-muted)] uppercase">
          Abbrev
        </label>
        <input
          type="text"
          value={team.teamAbbreviation}
          onChange={(e) =>
            onUpdate(index, { ...team, teamAbbreviation: e.target.value })
          }
          maxLength={5}
          className="w-full px-2 py-1 text-sm rounded bg-[var(--background-secondary)] border border-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          placeholder="ABC"
        />
      </div>

      {/* Logo URL */}
      <div className="mb-2">
        <label className="text-[10px] text-[var(--foreground-muted)] uppercase">
          Logo URL
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={team.teamLogoUrl}
            onChange={(e) => {
              onUpdate(index, { ...team, teamLogoUrl: e.target.value });
              setLogoError(false);
            }}
            className="flex-1 px-2 py-1 text-sm rounded bg-[var(--background-secondary)] border border-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            placeholder="/images/teams/..."
          />
          {team.teamLogoUrl && !logoError && (
            <div className="w-8 h-8 rounded bg-[var(--background-secondary)] flex items-center justify-center overflow-hidden">
              <Image
                src={team.teamLogoUrl}
                alt=""
                width={32}
                height={32}
                className="object-contain"
                onError={() => setLogoError(true)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Budget Display */}
      <div className="mb-3 p-2 rounded bg-[var(--background-secondary)] text-center">
        <span className="text-[10px] text-[var(--foreground-muted)] uppercase">
          Budget:{" "}
        </span>
        <span
          className={`text-sm font-bold ${
            remainingBudget < 0 ? "text-[var(--error)]" : "text-[var(--accent)]"
          }`}
        >
          {remainingBudget}
        </span>
        <span className="text-xs text-[var(--foreground-muted)]">
          {" "}
          / {draftBudget}
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--background-tertiary)] my-2" />

      {/* Pokemon Roster */}
      <div className="space-y-1">
        {team.roster.map((slot, slotIndex) => (
          <div key={slotIndex} className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--foreground-muted)] w-4">
              {slotIndex + 1}
            </span>
            <div className="flex-1">
              <PokemonAutocomplete
                value={slot.pokemonName}
                pokemonId={slot.pokemonId}
                allPokemon={allPokemon}
                onChange={(id, name) =>
                  handleRosterChange(slotIndex, id, name)
                }
                onMultiLinePaste={(lines) =>
                  handleMultiLinePaste(slotIndex, lines)
                }
                hasWarning={slot.hasWarning}
                warningText={slot.warningText}
                placeholder="Pokemon..."
              />
            </div>
            <button
              type="button"
              onClick={() =>
                handleTeraCaptainChange(slotIndex, !slot.isTeraCaptain)
              }
              disabled={!slot.pokemonId}
              className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                slot.isTeraCaptain
                  ? "bg-[var(--accent)] text-black"
                  : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]"
              } disabled:opacity-30 disabled:cursor-not-allowed`}
              title={slot.isTeraCaptain ? "Tera Captain" : "Set as Tera Captain"}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 12l10 10 10-10L12 2z" />
              </svg>
            </button>
            {slot.pokemonId && (
              <span className="text-[10px] text-[var(--foreground-muted)] w-8 text-right">
                {slot.price}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Create an empty team data structure
export function createEmptyTeam(): TeamData {
  return {
    id: null,
    coachId: null,
    teamName: "",
    teamAbbreviation: "",
    teamLogoUrl: "",
    roster: Array(12)
      .fill(null)
      .map(() => ({
        pokemonId: null,
        pokemonName: "",
        price: 0,
        isTeraCaptain: false,
        hasWarning: false,
        warningText: "",
      })),
    isDeleted: false,
  };
}

// Convert existing season coach data to TeamData format
export function seasonCoachToTeamData(
  sc: any,
  pokemonPrices: Map<number, { price: number; teraCaptainCost: number }>
): TeamData {
  const roster: RosterSlot[] = Array(12)
    .fill(null)
    .map(() => ({
      pokemonId: null,
      pokemonName: "",
      price: 0,
      isTeraCaptain: false,
      hasWarning: false,
      warningText: "",
    }));

  // Fill in existing roster
  if (sc.rosters) {
    sc.rosters.forEach((r: any, i: number) => {
      if (i < 12 && r.pokemon) {
        const priceInfo = pokemonPrices.get(r.pokemonId);
        const tcCost = r.isTeraCaptain ? priceInfo?.teraCaptainCost || 0 : 0;
        roster[i] = {
          pokemonId: r.pokemonId,
          pokemonName: r.pokemon.displayName || r.pokemon.name,
          price: (priceInfo?.price || r.price || 0) + tcCost,
          isTeraCaptain: r.isTeraCaptain || false,
          hasWarning: false,
          warningText: "",
        };
      }
    });
  }

  return {
    id: sc.id,
    coachId: sc.coachId,
    teamName: sc.teamName,
    teamAbbreviation: sc.teamAbbreviation || "",
    teamLogoUrl: sc.teamLogoUrl || "",
    roster,
    isDeleted: false,
  };
}
