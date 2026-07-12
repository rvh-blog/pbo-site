"use client";

import { Fragment, memo, useState, useMemo, useEffect, useRef, useCallback, useDeferredValue, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeftRight, Eye, EyeOff, Filter, Plus, Search, Share2, Star, StickyNote, X } from "lucide-react";
import { PokemonAutocomplete, findPokemonMatch } from "@/components/admin/pokemon-autocomplete";
import { DraftRulesDisclaimer } from "@/components/draft-rules-disclaimer";
import { formatPokemonDisplayName, pokemonSearchAliases, shouldUseFriendlyMegaNamesForSeason } from "@/lib/pokemon-name-utils";

// Type effectiveness chart
const TYPE_CHART: Record<string, Record<string, number>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

const ALL_TYPES = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];

function formatTypeName(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function OptimizedPlannerImage({
  src,
  alt,
  title,
  className,
  width,
  height,
  style,
}: {
  src: string | null | undefined;
  alt: string;
  title?: string;
  className?: string;
  width: number;
  height: number;
  style?: CSSProperties;
}) {
  if (!src) return null;

  return (
    <Image
      src={src}
      alt={alt}
      title={title}
      width={width}
      height={height}
      className={className}
      style={style}
      sizes={`${Math.max(width, height)}px`}
    />
  );
}

// Type colors for headers (inline styles to avoid type-badge display issues)
const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A77A", fire: "#EE8130", water: "#6390F0", electric: "#F7D02C",
  grass: "#7AC74C", ice: "#96D9D6", fighting: "#C22E28", poison: "#A33EA1",
  ground: "#E2BF65", flying: "#A98FF3", psychic: "#F95587", bug: "#A6B91A",
  rock: "#B6A136", ghost: "#735797", dragon: "#6F35FC", dark: "#705746",
  steel: "#B7B7CE", fairy: "#D685AD",
};

// Abilities that grant immunities (0x damage)
// Sources: https://bulbapedia.bulbagarden.net/wiki/Category:Abilities_that_alter_damage_taken
const IMMUNITY_ABILITIES: Record<string, string> = {
  // Ground immunities
  levitate: "ground",
  "earth-eater": "ground",
  // Electric immunities
  "volt-absorb": "electric",
  "lightning-rod": "electric",
  "motor-drive": "electric",
  // Water immunities
  "water-absorb": "water",
  "storm-drain": "water",
  "dry-skin": "water",
  // Fire immunities
  "flash-fire": "fire",
  "well-baked-body": "fire",
  // Grass immunities
  "sap-sipper": "grass",
  // Note: Immunity & Pastel Veil prevent Poison STATUS, not Poison-type moves
};

// Abilities that grant resistances (0.5x damage)
const RESISTANCE_ABILITIES: Record<string, string[]> = {
  // Thick Fat halves Fire and Ice damage
  "thick-fat": ["fire", "ice"],
  // Heatproof halves Fire damage
  heatproof: ["fire"],
  // Water Bubble halves Fire damage
  "water-bubble": ["fire"],
  // Purifying Salt halves Ghost damage
  "purifying-salt": ["ghost"],
};

// Abilities that increase weakness
const WEAKNESS_ABILITIES: Record<string, { type: string; multiplier: number }> = {
  "dry-skin": { type: "fire", multiplier: 1.25 },
  fluffy: { type: "fire", multiplier: 2 },
};


interface Ability {
  name: string;
  isHidden: boolean;
}

interface RosterPokemon {
  rosterId: number;
  pokemonId: number;
  name: string;
  displayName: string;
  spriteUrl: string | null;
  artworkUrl: string | null;
  types: string[];
  abilities: Ability[];
  moves: string[];
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
  price: number;
  isTeraCaptain: boolean;
  draftOrder: number | null;
}

interface SimplePokemon {
  id: number;
  name: string;
  displayName: string | null;
  nameAliases?: string[] | null;
  spriteUrl: string | null;
  artworkUrl?: string | null;
  types: string[] | null;
  abilities?: Ability[] | null;
  moves?: string[] | null;
  hp?: number | null;
  attack?: number | null;
  defense?: number | null;
  specialAttack?: number | null;
  specialDefense?: number | null;
  speed?: number | null;
  baseStatTotal?: number | null;
}

interface RosterSlot {
  pokemonId: number | null;
  pokemonName: string;
  isTeraCaptain: boolean;
  price: number;
  teraCaptainCost: number | null; // Cost to make TC, null = not available
  // Full Pokemon data for analysis
  pokemon: RosterPokemon | null;
}

interface SeasonPriceInfo {
  price: number;
  teraCaptainCost: number | null;
  complexBanReason: string | null;
}

interface Season {
  id: number;
  name: string;
  seasonNumber: number | null;
  draftBudget: number | null;
}

interface Props {
  coach: { id: number; name: string } | null;
  divisions: { id: number; name: string; seasonId: number }[];
  teams: { coachId: number; teamName: string; divisionId: number; seasonId: number }[];
  draftedByDivision: Record<number, { pokemonId: number; team: string; logo: string | null }[]>;
  currentDivisionId: number | null;
  teamName: string;
  teamLogo: string | null;
  roster: RosterPokemon[];
  draftBudget: number;
  allPokemon: SimplePokemon[];
  moveTypes: Record<string, string>;
  abilityDescriptions: Record<string, string>;
  seasonPrices: Record<number, SeasonPriceInfo>;
  allSeasons: Season[];
  currentSeasonId: number | null;
}

type DraftRole = "rocks" | "spikes" | "tspikes" | "webs" | "removal" | "pivot" | "setup" | "status" | "priority" | "knock";
const PLANNER_SLOT_COUNT = 11;
const CHECKLIST_DRAFT_ROLES = ["rocks", "spikes", "tspikes", "webs", "removal", "pivot", "priority"] as const satisfies readonly DraftRole[];
// FIT points per role by provider count (1st/2nd/3rd...), tiered by how much
// a draft team needs the role: rocks/removal are near-mandatory and reward up
// to three providers; pivot/priority/spikes/t-spikes are valuable but two
// providers saturate the need; one webs setter is enough.
const ROLE_STACK_WEIGHTS: Partial<Record<DraftRole, number[]>> = {
  rocks: [10, 5, 2],
  removal: [10, 5, 2],
  priority: [8, 4],
  pivot: [8, 4],
  spikes: [8, 4],
  tspikes: [8, 4],
  webs: [5],
};
const CHECKLIST_DRAFT_ROLE_SET = new Set<DraftRole>(CHECKLIST_DRAFT_ROLES);
type StatFocus = "none" | "price" | "hp" | "attack" | "defense" | "specialAttack" | "specialDefense" | "speed" | "baseStatTotal";

interface SavedPlanEntry {
  pokemonId: number;
  pokemonName: string;
}

const EMPTY_PLANNER_SLOT: RosterSlot = { pokemonId: null, pokemonName: "", isTeraCaptain: false, price: 0, teraCaptainCost: null, pokemon: null };

interface CandidatePokemon extends SimplePokemon {
  price: number;
  teraCaptainCost: number | null;
  complexBanReason: string | null;
  roles: DraftRole[];
  fitScore: number;
  fitTags: string[];
}

// Calculate defensive multiplier for a Pokemon against a type
function getDefensiveMultiplier(
  defenderTypes: string[],
  attackType: string,
  abilities: Ability[]
): number {
  // Check for immunity abilities first
  for (const ability of abilities) {
    const abilityName = ability.name.toLowerCase();
    const immuneType = IMMUNITY_ABILITIES[abilityName];
    if (immuneType === attackType) {
      return 0;
    }
  }

  // Calculate base type multiplier
  let multiplier = 1;
  for (const defType of defenderTypes) {
    const effectiveness = TYPE_CHART[attackType]?.[defType.toLowerCase()];
    if (effectiveness !== undefined) {
      multiplier *= effectiveness;
    }
  }

  // Apply resistance abilities (halves damage)
  for (const ability of abilities) {
    const abilityName = ability.name.toLowerCase();
    const resistTypes = RESISTANCE_ABILITIES[abilityName];
    if (resistTypes && resistTypes.includes(attackType)) {
      multiplier *= 0.5;
    }
  }

  // Apply weakness-boosting abilities
  for (const ability of abilities) {
    const abilityName = ability.name.toLowerCase();
    const weaknessBoost = WEAKNESS_ABILITIES[abilityName];
    if (weaknessBoost && weaknessBoost.type === attackType) {
      multiplier *= weaknessBoost.multiplier;
    }
  }

  return multiplier;
}

function formatMultiplier(value: number): string {
  if (value === 0) return "0";
  if (value === 0.25) return "1/4";
  if (value === 0.5) return "1/2";
  if (value === 1) return "1";
  if (value === 2) return "2";
  if (value === 4) return "4";
  // Handle non-standard values from ability interactions
  if (value === 0.125) return "1/8";
  if (value === 2.5) return "2.5";
  if (value === 8) return "8";
  if (value < 1) return (Math.round(value * 100) / 100).toString();
  return value.toString();
}

function getMultiplierColor(value: number): string {
  if (value === 0) return "bg-black text-[#f9cb9c]"; // Immune - black bg, light orange 2 text
  if (value <= 0.25) return "bg-[#38761d] text-[#d9ead3]"; // 1/4 - dark green 2 bg, light green 3 text
  if (value < 1) return "bg-[#93c47d] text-[#132609]"; // 1/2 - light green 1 bg, dark green text
  if (value === 1) return "bg-[var(--background-tertiary)] text-[var(--foreground-muted)]"; // Neutral
  if (value <= 2) return "bg-[#e06666] text-[#660000]"; // 2x weak - light red 1 bg, dark red 3 text
  if (value > 2) return "bg-[#990000] text-[#f4cccc]"; // 4x+ weak - dark red 2 bg, light red 3 text
  return "";
}

function hasAnyMove(pokemon: SimplePokemon | RosterPokemon, moves: string[]) {
  const moveSet = new Set((pokemon.moves || []).map((move) => move.toLowerCase()));
  return moves.some((move) => moveSet.has(move));
}

function getDraftRoles(pokemon: SimplePokemon | RosterPokemon): DraftRole[] {
  const roles: DraftRole[] = [];
  if (hasAnyMove(pokemon, ["stealth-rock"])) roles.push("rocks");
  if (hasAnyMove(pokemon, ["spikes"])) roles.push("spikes");
  if (hasAnyMove(pokemon, ["toxic-spikes"])) roles.push("tspikes");
  if (hasAnyMove(pokemon, ["sticky-web"])) roles.push("webs");
  if (hasAnyMove(pokemon, ["defog", "rapid-spin", "mortal-spin", "tidy-up"])) roles.push("removal");
  if (hasAnyMove(pokemon, ["u-turn", "volt-switch", "flip-turn", "parting-shot", "chilly-reception", "shed-tail"])) roles.push("pivot");
  if (hasAnyMove(pokemon, ["swords-dance", "nasty-plot", "dragon-dance", "calm-mind", "bulk-up", "quiver-dance", "shell-smash", "iron-defense"])) roles.push("setup");
  if (hasAnyMove(pokemon, ["toxic", "will-o-wisp", "thunder-wave", "glare", "stun-spore", "sleep-powder", "spore", "yawn"])) roles.push("status");
  if (hasAnyMove(pokemon, ["aqua-jet", "bullet-punch", "extreme-speed", "ice-shard", "mach-punch", "quick-attack", "shadow-sneak", "sucker-punch", "vacuum-wave"])) roles.push("priority");
  if (hasAnyMove(pokemon, ["knock-off"])) roles.push("knock");
  return roles;
}

function formatRole(role: DraftRole) {
  const labels: Record<DraftRole, string> = {
    rocks: "Stealth Rock",
    spikes: "Spikes",
    tspikes: "Toxic Spikes",
    webs: "Sticky Web",
    removal: "Removal",
    pivot: "Pivot",
    setup: "Setup",
    status: "Status",
    priority: "Priority",
    knock: "Knock",
  };
  return labels[role];
}

function getPokemonLabel(pokemon: { name: string; displayName?: string | null }, friendlyMegaNames: boolean) {
  return formatPokemonDisplayName(pokemon.name, pokemon.displayName, { friendlyMegaNames });
}

interface CandidateRowProps {
  candidate: CandidatePokemon;
  isPlanned: boolean;
  draftedBy: { team: string; logo: string | null } | null;
  isWatched: boolean;
  isCompared: boolean;
  note: string | undefined;
  isNoteOpen: boolean;
  showNotesPanel: boolean;
  showComparePanel: boolean;
  canAdd: boolean;
  friendlyMegaNames: boolean;
  onToggleWatchlist: (id: number) => void;
  onToggleCompare: (id: number) => void;
  onAdd: (candidate: CandidatePokemon) => void;
  onHide: (id: number) => void;
  onToggleNote: (id: number) => void;
  onSaveNote: (id: number, value: string) => void;
  onDeleteNote: (id: number) => void;
}

// Memoized so slider drags and other high-frequency page renders skip the
// ~1100 rows entirely.
const CandidateRow = memo(function CandidateRow({
  candidate,
  isPlanned,
  draftedBy,
  isWatched,
  isCompared,
  note,
  isNoteOpen,
  showNotesPanel,
  showComparePanel,
  canAdd,
  friendlyMegaNames,
  onToggleWatchlist,
  onToggleCompare,
  onAdd,
  onHide,
  onToggleNote,
  onSaveNote,
  onDeleteNote,
}: CandidateRowProps) {
  return (
    <div
      className={`draft-candidate-card shrink-0 rounded px-2 py-1.5 transition-colors ${
        isPlanned
          ? "bg-[var(--accent)]/10 hover:bg-[var(--accent)]/15"
          : isWatched
          ? "bg-[var(--background-tertiary)]/60 shadow-[inset_2px_0_0_var(--accent)] hover:bg-[var(--background-tertiary)]"
          : "bg-[var(--background-tertiary)]/60 hover:bg-[var(--background-tertiary)]"
      }`}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 sm:grid-cols-[2.25rem_minmax(0,1fr)_7.5rem_9rem_3rem_10.5rem]">
        <OptimizedPlannerImage src={candidate.spriteUrl} alt="" width={32} height={32} className="row-span-2 h-8 w-8 shrink-0 self-center object-contain sm:order-1 sm:row-span-1" />
        <div className="min-w-0 sm:order-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link href={`/pokemon/${candidate.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-bold text-white hover:text-[var(--primary)]">
              {getPokemonLabel(candidate, friendlyMegaNames)}
            </Link>
            {candidate.complexBanReason && (
              <span
                className="rounded border border-[var(--warning)]/30 bg-[var(--warning)]/20 px-1 py-0 text-[10px] font-bold text-[var(--warning)]"
                title={`No ${candidate.complexBanReason}`}
              >
                No {candidate.complexBanReason}
              </span>
            )}
          </div>
          {draftedBy && (
            <div className="mt-0.5 flex items-center gap-1.5" title={`Drafted by ${draftedBy.team} in this division`}>
              <span className="h-5 w-0.5 shrink-0 rounded bg-[var(--primary)]/50" />
              <OptimizedPlannerImage src={draftedBy.logo} alt="" width={24} height={24} className="h-6 w-6 shrink-0 object-contain" />
              <span className="font-mono text-[10px] font-bold text-red-300">{draftedBy.team}</span>
            </div>
          )}
        </div>
        <span className="justify-self-end font-mono text-xs font-bold text-[var(--accent)] sm:order-5 sm:justify-self-center">
          {candidate.price}
        </span>
        <div className="flex flex-wrap items-center gap-1 sm:order-3">
          {(candidate.types || []).map((type) => (
            <span
              key={type}
              className="rounded px-1.5 py-px text-[10px] font-bold text-white"
              style={{ backgroundColor: TYPE_COLORS[type.toLowerCase()] }}
            >
              {formatTypeName(type)}
            </span>
          ))}
        </div>
        <div className="col-span-2 flex items-center gap-4 font-mono text-xs sm:order-4 sm:col-span-1 sm:grid sm:grid-cols-3 sm:gap-0 sm:text-center">
          <span className="text-white">
            <span className="mr-1 text-[9px] uppercase text-[var(--foreground-subtle)] sm:hidden">SPE</span>
            {candidate.speed || 0}
          </span>
          <span className="text-[var(--foreground-muted)]">
            <span className="mr-1 text-[9px] uppercase text-[var(--foreground-subtle)] sm:hidden">BST</span>
            {candidate.baseStatTotal || 0}
          </span>
          <span
            className={candidate.fitScore > 0 ? "text-emerald-300" : "text-[var(--foreground-subtle)]"}
            title={candidate.fitTags.length > 0 ? candidate.fitTags.join(" · ") : undefined}
          >
            <span className="mr-1 text-[9px] uppercase text-[var(--foreground-subtle)] sm:hidden">FIT</span>
            {candidate.fitScore}
          </span>
        </div>
        <div className="flex items-center gap-0.5 justify-self-end sm:order-6 sm:justify-self-auto sm:justify-end">
          <button
            type="button"
            onClick={() => onToggleWatchlist(candidate.id)}
            aria-pressed={isWatched}
            title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
            aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
            className={`draft-card-action flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--background)] ${isWatched ? "text-[var(--accent)]" : "text-[var(--foreground-subtle)] hover:text-white"}`}
          >
            <Star className={`h-3.5 w-3.5 ${isWatched ? "fill-current" : ""}`} />
          </button>
          {showNotesPanel && (
            <button
              type="button"
              onClick={() => onToggleNote(candidate.id)}
              aria-pressed={Boolean(note) || isNoteOpen}
              title={note ? "Edit note" : "Add note"}
              aria-label={note ? "Edit note" : "Add note"}
              className={`draft-card-action flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--background)] ${isNoteOpen ? "bg-[var(--background)] text-white" : "text-[var(--foreground-subtle)] hover:text-white"}`}
            >
              <StickyNote className="h-3.5 w-3.5" />
            </button>
          )}
          {showComparePanel && (
            <button
              type="button"
              onClick={() => onToggleCompare(candidate.id)}
              aria-pressed={isCompared}
              title={isCompared ? "Remove from compare" : "Add to compare"}
              aria-label={isCompared ? "Remove from compare" : "Add to compare"}
              className={`draft-card-action flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--background)] ${isCompared ? "text-sky-300" : "text-[var(--foreground-subtle)] hover:text-white"}`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={!canAdd || isPlanned}
            onClick={() => onAdd(candidate)}
            title={isPlanned ? "Already in your plan" : "Add to next open slot"}
            aria-label="Add to next open slot"
            className="draft-card-action flex h-7 w-7 items-center justify-center rounded bg-[var(--primary)]/15 text-[var(--primary-light)] transition-colors hover:bg-[var(--primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-[var(--primary)]/15 disabled:hover:text-[var(--primary-light)]"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onHide(candidate.id)}
            title="Hide from board"
            aria-label="Hide from board"
            className="draft-card-action flex h-7 w-7 items-center justify-center rounded text-[var(--foreground-subtle)] transition-colors hover:bg-[var(--background)] hover:text-white"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {showNotesPanel && isNoteOpen ? (
        <DraftNoteEditor
          initialValue={note || ""}
          onSave={(value) => onSaveNote(candidate.id, value)}
          onDelete={() => onDeleteNote(candidate.id)}
        />
      ) : showNotesPanel && note ? (
        <button
          type="button"
          onClick={() => onToggleNote(candidate.id)}
          title="Edit note"
          className="mt-1 flex w-fit max-w-full items-center gap-1.5 rounded border-l-2 border-[var(--accent)]/60 bg-[var(--background)]/50 px-2 py-1 text-left text-xs italic text-[#cbd5e1] transition-colors hover:text-white sm:ml-11"
        >
          <StickyNote className="h-3 w-3 shrink-0 text-[var(--accent)]" />
          <span className="truncate">{note}</span>
        </button>
      ) : null}
    </div>
  );
});

function DraftNoteEditor({
  initialValue,
  onSave,
  onDelete,
}: {
  initialValue: string;
  onSave: (value: string) => void;
  onDelete: () => void;
}) {
  // Local draft state so keystrokes never re-render the whole board.
  const [draft, setDraft] = useState(initialValue);

  return (
    <div className="mt-1.5 flex items-stretch gap-1.5 sm:ml-11">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSave(draft);
          } else if (e.key === "Escape") {
            onSave(initialValue);
          }
        }}
        autoFocus
        placeholder="Notes..."
        className="draft-control h-12 min-w-0 flex-1 resize-none rounded-md border border-[var(--background-tertiary)] bg-[var(--background)] px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-subtle)]"
      />
      <div className="flex shrink-0 flex-col justify-center gap-1">
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="rounded bg-[var(--primary)] px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:brightness-110"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!initialValue && !draft.trim()}
          className="rounded bg-[var(--background)] px-2.5 py-1 text-[11px] font-bold text-[var(--foreground-muted)] transition-colors hover:text-[var(--error)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function DraftPlanner({
  coach,
  divisions,
  teams,
  draftedByDivision,
  currentDivisionId,
  teamName,
  teamLogo,
  roster: initialRoster,
  draftBudget,
  allPokemon,
  moveTypes,
  abilityDescriptions,
  seasonPrices,
  allSeasons,
  currentSeasonId,
}: Props) {
  const [statSort, setStatSort] = useState<"speed" | "hp" | "attack" | "defense" | "specialAttack" | "specialDefense" | "baseStatTotal">("speed");
  const [statSortAsc, setStatSortAsc] = useState(false);
  const [moveSearch, setMoveSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [typeFilterMode, setTypeFilterMode] = useState<"is" | "resists" | "strong">("is");
  const [isTypeFilters, setIsTypeFilters] = useState<string[]>([]);
  const [strongVsFilters, setStrongVsFilters] = useState<string[]>([]);
  const [statFocus, setStatFocus] = useState<StatFocus>("none");
  const [statFocusAsc, setStatFocusAsc] = useState(false);
  const [maxPrice, setMaxPrice] = useState(19);
  const [minSpeed, setMinSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(160);
  const [sortByFit, setSortByFit] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [roleFilters, setRoleFilters] = useState<DraftRole[]>([]);
  const [resistFilters, setResistFilters] = useState<string[]>([]);
  const [moveFilters, setMoveFilters] = useState<string[]>([]);
  // Render the board list incrementally: keeps SSR payload and hydration cheap
  // for ~1100 rows; scrolling extends the window.
  const [visibleRowCount, setVisibleRowCount] = useState(120);
  const [moveFilterSearch, setMoveFilterSearch] = useState("");
  const [showMoveFilterDropdown, setShowMoveFilterDropdown] = useState(false);
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [openNoteIds, setOpenNoteIds] = useState<number[]>([]);
  const [hiddenPokemonIds, setHiddenPokemonIds] = useState<number[]>([]);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const [showNeedsPanel, setShowNeedsPanel] = useState(true);
  const [showDraftBoard, setShowDraftBoard] = useState(true);
  const [showComparePanel, setShowComparePanel] = useState(true);
  const [showNotesPanel, setShowNotesPanel] = useState(true);
  const [showTeamAnalyzer, setShowTeamAnalyzer] = useState(true);
  const [showFitExplanation, setShowFitExplanation] = useState(false);
  const [expandedAbility, setExpandedAbility] = useState<{ slotIdx: number; abilityIdx: number } | null>(null);
  const [trackedMoves, setTrackedMoves] = useState([
    "stealth-rock", "spikes", "toxic-spikes", "sticky-web",
    "nasty-plot", "swords-dance", "volt-switch", "u-turn", "flip-turn",
    "defog", "rapid-spin", "toxic", "will-o-wisp", "thunder-wave", "taunt", "knock-off"
  ]);
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [planSaveStatus, setPlanSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [savedPlan, setSavedPlan] = useState<SavedPlanEntry[] | null>(null);
  const [pendingPlanRestore, setPendingPlanRestore] = useState<SavedPlanEntry[] | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const latestPreferencesRef = useRef<string>("");
  const selectedSeasonNumber = allSeasons.find((season) => season.id === currentSeasonId)?.seasonNumber ?? null;
  const friendlyMegaNames = shouldUseFriendlyMegaNamesForSeason(selectedSeasonNumber);

  // Header preset selectors: navigation drives the server-resolved roster and
  // prices, so URL params stay the source of truth.
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  // null = follow the server-provided division; set when the user picks one manually.
  const [divisionOverride, setDivisionOverride] = useState<number | "" | null>(null);
  const divisionOptions = useMemo(
    () => divisions.filter((d) => d.seasonId === currentSeasonId),
    [currentSeasonId, divisions]
  );
  const rawDivisionSelection = divisionOverride ?? currentDivisionId ?? "";
  const selectedDivisionId = divisionOptions.some((d) => d.id === rawDivisionSelection) ? rawDivisionSelection : "";
  const teamOptions = useMemo(
    () =>
      teams.filter(
        (t) => t.seasonId === currentSeasonId && (selectedDivisionId === "" || t.divisionId === selectedDivisionId)
      ),
    [currentSeasonId, selectedDivisionId, teams]
  );

  const draftedInSelectedDivision = useMemo(
    () =>
      selectedDivisionId === ""
        ? null
        : new Map(
            (draftedByDivision[selectedDivisionId] ?? []).map((entry) => [
              entry.pokemonId,
              { team: entry.team, logo: entry.logo },
            ])
          ),
    [draftedByDivision, selectedDivisionId]
  );

  function navigateToPreset(nextCoachId: number | null, nextSeasonId: number | null) {
    setDivisionOverride(null);
    const params = new URLSearchParams();
    if (nextCoachId) params.set("coach", String(nextCoachId));
    if (nextSeasonId) params.set("season", String(nextSeasonId));
    const query = params.toString();
    startNavigation(() => {
      router.push(query ? `/draft-planner?${query}` : "/draft-planner");
    });
  }

  const buildPlannerSlot = useCallback((pokemonId: number, fallbackName: string): RosterSlot => {
    const originalRoster = initialRoster.find((r) => r.pokemonId === pokemonId);
    const pData = allPokemon.find((p) => p.id === pokemonId);
    const priceInfo = seasonPrices[pokemonId];
    const price = originalRoster?.price ?? priceInfo?.price ?? 0;

    return {
      pokemonId,
      pokemonName: pData ? getPokemonLabel(pData, friendlyMegaNames) : fallbackName,
      isTeraCaptain: false,
      price,
      teraCaptainCost: priceInfo?.teraCaptainCost ?? null,
      pokemon: originalRoster || (pData ? {
        rosterId: 0,
        pokemonId: pData.id,
        name: pData.name,
        displayName: getPokemonLabel(pData, friendlyMegaNames),
        spriteUrl: pData.spriteUrl,
        artworkUrl: pData.artworkUrl || null,
        types: (pData.types || []) as string[],
        abilities: (pData.abilities || []) as Ability[],
        moves: (pData.moves || []) as string[],
        hp: pData.hp || 0,
        attack: pData.attack || 0,
        defense: pData.defense || 0,
        specialAttack: pData.specialAttack || 0,
        specialDefense: pData.specialDefense || 0,
        speed: pData.speed || 0,
        baseStatTotal: pData.baseStatTotal || 0,
        price,
        isTeraCaptain: false,
        draftOrder: null,
      } : null),
    };
  }, [allPokemon, friendlyMegaNames, initialRoster, seasonPrices]);

  const getDraftPlannerPreferences = useCallback(() => {
    return {
      statSort,
      statSortAsc,
      trackedMoves,
      notes,
      hiddenPokemonIds,
      // The API replaces the whole blob per page, so the saved plan must ride
      // along in every payload or the next autosave would wipe it.
      ...(savedPlan ? { savedPlan } : {}),
    };
  }, [hiddenPokemonIds, notes, savedPlan, statSort, statSortAsc, trackedMoves]);

  const saveDraftPlannerPreferences = useCallback(async (options: { keepalive?: boolean } = {}) => {
    const preferences = getDraftPlannerPreferences();

    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: "draft-planner",
        preferences,
      }),
      keepalive: options.keepalive,
    });
  }, [getDraftPlannerPreferences]);

  const flushDraftPlannerPreferences = useCallback((payload: string) => {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/preferences", new Blob([payload], { type: "application/json" }));
      return;
    }

    fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, []);

  // Load preferences on mount
  useEffect(() => {
    async function loadPrefs() {
      try {
        const res = await fetch("/api/preferences?page=draft-planner");
        if (res.ok) {
          const data = await res.json();
          if (data.preferences) {
            if (data.preferences.statSort) setStatSort(data.preferences.statSort);
            if (data.preferences.statSortAsc !== undefined) setStatSortAsc(data.preferences.statSortAsc);
            if (data.preferences.trackedMoves) setTrackedMoves(data.preferences.trackedMoves);
            if (data.preferences.notes) setNotes(data.preferences.notes);
            if (data.preferences.hiddenPokemonIds) setHiddenPokemonIds(data.preferences.hiddenPokemonIds);
            if (data.preferences.savedPlan) {
              setSavedPlan(data.preferences.savedPlan);
              setPendingPlanRestore(data.preferences.savedPlan);
            }
          }
        }
    } catch {
      // Not logged in or error - ignore
      } finally {
        setPrefsLoaded(true);
      }
    }
    loadPrefs();
  }, []);

  useEffect(() => {
    try {
      const savedWatchlist = localStorage.getItem("draft-planner-watchlist");
      const savedNotes = localStorage.getItem("draft-planner-notes");
      const savedHiddenPokemon = localStorage.getItem("draft-planner-hidden-pokemon");
      const savedPlanJson = localStorage.getItem("draft-planner-saved-plan");
      if (savedWatchlist) setWatchlist(JSON.parse(savedWatchlist));
      if (savedNotes) setNotes(JSON.parse(savedNotes));
      if (savedHiddenPokemon) setHiddenPokemonIds(JSON.parse(savedHiddenPokemon));
      if (savedPlanJson) {
        const plan = JSON.parse(savedPlanJson) as SavedPlanEntry[];
        setSavedPlan((current) => current ?? plan);
        setPendingPlanRestore((current) => current ?? plan);
      }
    } catch {
      // Local planner notes are optional.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("draft-planner-watchlist", JSON.stringify(watchlist));
    } catch {
      // Ignore storage errors.
    }
  }, [watchlist]);

  useEffect(() => {
    try {
      localStorage.setItem("draft-planner-notes", JSON.stringify(notes));
    } catch {
      // Ignore storage errors.
    }
  }, [notes]);

  useEffect(() => {
    try {
      localStorage.setItem("draft-planner-hidden-pokemon", JSON.stringify(hiddenPokemonIds));
    } catch {
      // Ignore storage errors.
    }
  }, [hiddenPokemonIds]);

  useEffect(() => {
    latestPreferencesRef.current = JSON.stringify({
      page: "draft-planner",
      preferences: getDraftPlannerPreferences(),
    });
  }, [getDraftPlannerPreferences]);

  useEffect(() => {
    if (!prefsLoaded) return;

    const saveTimeout = window.setTimeout(() => {
      saveDraftPlannerPreferences().catch(() => {});
    }, 800);

    return () => window.clearTimeout(saveTimeout);
  }, [prefsLoaded, saveDraftPlannerPreferences]);

  useEffect(() => {
    function saveOnExit() {
      if (!latestPreferencesRef.current) return;
      flushDraftPlannerPreferences(latestPreferencesRef.current);
    }

    function saveWhenHidden() {
      if (document.visibilityState === "hidden") {
        saveOnExit();
      }
    }

    document.addEventListener("visibilitychange", saveWhenHidden);
    window.addEventListener("pagehide", saveOnExit);
    window.addEventListener("beforeunload", saveOnExit);

    return () => {
      document.removeEventListener("visibilitychange", saveWhenHidden);
      window.removeEventListener("pagehide", saveOnExit);
      window.removeEventListener("beforeunload", saveOnExit);
    };
  }, [flushDraftPlannerPreferences]);

  // Restore a saved plan into empty slots (never over a real drafted roster or in-session edits)
  useEffect(() => {
    if (!pendingPlanRestore) return;
    const plan = pendingPlanRestore;
    setPendingPlanRestore(null);
    if (initialRoster.length > 0) return;
    setSlots((prev) => {
      if (prev.some((slot) => slot.pokemonId)) return prev;
      return Array(PLANNER_SLOT_COUNT).fill(null).map((_, i) => {
        const entry = plan[i];
        return entry ? buildPlannerSlot(entry.pokemonId, entry.pokemonName) : EMPTY_PLANNER_SLOT;
      });
    });
  }, [buildPlannerSlot, initialRoster, pendingPlanRestore]);

  // Save preferences
  const savePreferences = async () => {
    setSaveStatus("saving");
    try {
      await saveDraftPlannerPreferences();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
    }
  };

  // Clear all roster slots. Leaves the saved plan JSON and all analyzer/board
  // settings untouched.
  const resetPlan = () => {
    if (!window.confirm("Clear all roster slots? Your saved plan is not affected.")) return;
    setSlots(Array(PLANNER_SLOT_COUNT).fill(EMPTY_PLANNER_SLOT));
  };

  // Save the current roster plan so it reloads next visit (signed-in via
  // preferences, anonymous via local storage)
  const savePlan = async () => {
    const plan: SavedPlanEntry[] = slots
      .filter((slot) => slot.pokemonId)
      .map((slot) => ({ pokemonId: slot.pokemonId!, pokemonName: slot.pokemonName }));
    setSavedPlan(plan);
    setPlanSaveStatus("saving");
    try {
      localStorage.setItem("draft-planner-saved-plan", JSON.stringify(plan));
    } catch {
      // Local fallback is best-effort.
    }
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "draft-planner",
          preferences: { ...getDraftPlannerPreferences(), savedPlan: plan },
        }),
      });
      setPlanSaveStatus("saved");
      setTimeout(() => setPlanSaveStatus("idle"), 2000);
    } catch {
      setPlanSaveStatus("idle");
    }
  };

  // Initialize slots from roster
  const [slots, setSlots] = useState<RosterSlot[]>(() => {
    const initialSlots: RosterSlot[] = Array(PLANNER_SLOT_COUNT).fill(null).map((_, i) => {
      const p = initialRoster[i];
      if (p) {
        const priceInfo = seasonPrices[p.pokemonId];
        return {
          pokemonId: p.pokemonId,
          pokemonName: getPokemonLabel(p, friendlyMegaNames),
          isTeraCaptain: p.isTeraCaptain,
          price: p.price,
          teraCaptainCost: priceInfo?.teraCaptainCost ?? null,
          pokemon: p,
        };
      }
      return { pokemonId: null, pokemonName: "", isTeraCaptain: false, price: 0, teraCaptainCost: null, pokemon: null };
    });
    return initialSlots;
  });

  // Convert slots to roster for calculations
  const roster = useMemo(() => {
    return slots.filter(s => s.pokemon !== null).map(s => s.pokemon!);
  }, [slots]);

  // Handle slot changes
  function handleSlotChange(index: number, pokemonId: number | null, name: string) {
    const newSlots = [...slots];
    newSlots[index] = pokemonId ? buildPlannerSlot(pokemonId, name) : EMPTY_PLANNER_SLOT;
    setSlots(newSlots);
  }

  function handleMultiLinePaste(startIndex: number, lines: string[]) {
    setSlots(prevSlots => {
      const newSlots = [...prevSlots];
      for (let i = 0; i < lines.length && startIndex + i < PLANNER_SLOT_COUNT; i++) {
        const line = lines[i].trim();
        const match = findPokemonMatch(line, allPokemon, { friendlyMegaNames });
        newSlots[startIndex + i] = match
          ? buildPlannerSlot(match.id, getPokemonLabel(match, friendlyMegaNames))
          : { ...EMPTY_PLANNER_SLOT, pokemonName: line };
      }
      return newSlots;
    });
  }

  // Calculate total spent and remaining budget
  const totalSpent = useMemo(() => slots.reduce((sum, s) => sum + s.price, 0), [slots]);
  const remainingBudget = draftBudget - totalSpent;
  const openSlots = slots.filter((slot) => !slot.pokemon).length;
  const avgRemainingPerSlot = openSlots > 0 ? Math.floor(remainingBudget / openSlots) : remainingBudget;
  const plannedPokemonIds = useMemo(
    () => new Set(slots.map((slot) => slot.pokemonId).filter((id): id is number => Boolean(id))),
    [slots]
  );
  // Calculate type chart for team
  const typeChart = useMemo(() => {
    const chart: Record<string, { multipliers: number[]; overall: string }> = {};

    for (const attackType of ALL_TYPES) {
      const multipliers = roster.map((p) =>
        getDefensiveMultiplier(p.types.map(t => t.toLowerCase()), attackType, p.abilities)
      );

      // Calculate overall assessment
      const resistCount = multipliers.filter((m) => m < 1 && m > 0).length;
      const immuneCount = multipliers.filter((m) => m === 0).length;
      const weakCount = multipliers.filter((m) => m > 1).length;
      const veryWeakCount = multipliers.filter((m) => m > 2).length;
      const veryResistCount = multipliers.filter((m) => m <= 0.25).length;

      let overall = "ntrl";
      const resistTotal = resistCount + immuneCount;
      if (resistTotal > weakCount) {
        overall = (veryResistCount > 0 || resistTotal - weakCount >= 3) ? "very_resist" : "resist";
      } else if (weakCount > resistTotal) {
        overall = (veryWeakCount > 0 || weakCount - resistTotal >= 3) ? "very_weak" : "weak";
      }

      chart[attackType] = { multipliers, overall };
    }

    return chart;
  }, [roster]);

  // Sort stats
  const sortedForStats = useMemo(() => {
    const sorted = [...roster].sort((a, b) => {
      const aVal = a[statSort];
      const bVal = b[statSort];
      return statSortAsc ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [roster, statSort, statSortAsc]);

  // Average stats
  const avgStats = useMemo(() => {
    if (roster.length === 0) return { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, baseStatTotal: 0 };
    return {
      hp: Math.round(roster.reduce((s, p) => s + p.hp, 0) / roster.length),
      attack: Math.round(roster.reduce((s, p) => s + p.attack, 0) / roster.length),
      defense: Math.round(roster.reduce((s, p) => s + p.defense, 0) / roster.length),
      specialAttack: Math.round(roster.reduce((s, p) => s + p.specialAttack, 0) / roster.length),
      specialDefense: Math.round(roster.reduce((s, p) => s + p.specialDefense, 0) / roster.length),
      speed: Math.round(roster.reduce((s, p) => s + p.speed, 0) / roster.length),
      baseStatTotal: Math.round(roster.reduce((s, p) => s + p.baseStatTotal, 0) / roster.length),
    };
  }, [roster]);

  const teamRoleCounts = useMemo(() => {
    const counts = new Map<DraftRole, number>();
    for (const member of roster) {
      for (const role of getDraftRoles(member)) {
        counts.set(role, (counts.get(role) || 0) + 1);
      }
    }
    return counts;
  }, [roster]);

  const teamSpeeds = useMemo(() => roster.map((member) => member.speed).filter((speed) => speed > 0), [roster]);

  const draftNeeds = useMemo(() => {
    const needs = CHECKLIST_DRAFT_ROLES.map((role) => {
      const count = teamRoleCounts.get(role) || 0;
      const label = role === "removal" ? "Hazard Removal" : role === "pivot" ? "Pivoting" : formatRole(role);
      return { label, role: role as DraftRole, met: count > 0, count };
    });

    // Same weak/very_weak assessment the analyzer's +/- row shows, worst first
    const weakCount = (type: string) => typeChart[type]?.multipliers.filter((m) => m > 1).length ?? 0;
    const weakTypes = ALL_TYPES.filter((type) => {
      const overall = typeChart[type]?.overall;
      return overall === "weak" || overall === "very_weak";
    }).sort((a, b) => weakCount(b) - weakCount(a));

    return {
      roleNeeds: needs,
      missingRoles: needs.filter((need) => !need.met),
      weakTypes,
    };
  }, [teamRoleCounts, typeChart]);

  const candidates = useMemo<CandidatePokemon[]>(() => {
    const maxSeasonPrice = Math.max(1, ...Object.values(seasonPrices).map((info) => info.price));

    return allPokemon.map((p) => {
      const priceInfo = seasonPrices[p.id];
      const price = priceInfo?.price ?? 0;
      const roles = getDraftRoles(p);
      const fitTags: string[] = [];
      let fitScore = 0;

      // League pricing is the best viability proxy in a draft format: scale
      // need-based points so strong mons that patch a need outrank cheap
      // filler that happens to carry the same moves.
      const lowPriceViability = price <= 3 ? 0.6 : price <= 5 ? 0.85 : 1;
      const quality = (0.5 + 0.7 * Math.min(1, price / maxSeasonPrice)) * lowPriceViability;

      let missingRolesFilled = 0;
      for (const role of roles) {
        if (!CHECKLIST_DRAFT_ROLE_SET.has(role)) continue;
        const alreadyHave = teamRoleCounts.get(role) || 0;
        const weight = ROLE_STACK_WEIGHTS[role]?.[alreadyHave] ?? 0;
        if (weight === 0) continue;
        if (alreadyHave === 0) missingRolesFilled += 1;
        fitScore += weight * quality;
        fitTags.push(`${alreadyHave === 0 ? "Fills" : "Adds"} ${formatRole(role)}`);
      }
      if (missingRolesFilled >= 2) {
        fitScore += 5;
        fitTags.push("Role compression");
      }

      // A weakness is patched by resisting it (ability-aware), not by sharing
      // the weak type.
      const abilities = (p.abilities || []) as Ability[];
      const lowerTypes = (p.types || []).map((t) => t.toLowerCase());
      let coveredWeaknesses = 0;
      for (const weakType of draftNeeds.weakTypes) {
        if (coveredWeaknesses >= 3) break;
        const multiplier = getDefensiveMultiplier(lowerTypes, weakType, abilities);
        if (multiplier < 1) {
          coveredWeaknesses += 1;
          fitScore += (multiplier === 0 ? 8 : 6) * quality;
          fitTags.push(`${multiplier === 0 ? "Immune to" : "Resists"} ${formatTypeName(weakType)}`);
        }
      }

      const speed = p.speed || 0;

      // Slow team: reward speed, scaled by how fast the mon actually is
      // (90 Speed earns +2, 130+ earns the full +8).
      if (avgStats.speed < 90 && speed >= 90) {
        fitScore += (2 + 6 * Math.min(1, (speed - 90) / 40)) * quality;
        fitTags.push("Adds speed");
      }

      // Speed tier diversity: drafts want spread-out tiers. Sub-50 speeds are
      // all effectively "slow" and don't compete on speed, so they're exempt.
      if (teamSpeeds.length > 0 && speed >= 50) {
        const nearestGap = Math.min(...teamSpeeds.map((teamSpeed) => Math.abs(teamSpeed - speed)));
        if (nearestGap === 0) {
          fitScore -= 4;
          fitTags.push("Duplicate speed tier");
        } else if (nearestGap <= 3) {
          fitScore -= 2;
          fitTags.push("Crowded speed tier");
        } else if (nearestGap >= 10) {
          fitScore += 4 * quality;
          fitTags.push("New speed tier");
        } else if (nearestGap >= 6) {
          fitScore += 2 * quality;
          fitTags.push("Fresh speed tier");
        }
      }

      // Value bonus: costs no more than the average open slot can take, but
      // only when the mon already fills a need above — being cheap alone is
      // not a fit. Scale the bonus by quality so low-tier filler does not
      // outrank stronger options solely because it costs 1-3 points.
      if (price > 0 && openSlots > 0 && fitScore > 0 && price <= Math.max(1, avgRemainingPerSlot)) {
        fitScore += 5 * quality;
        fitTags.push("Fits budget");
      }

      return {
        ...p,
        price,
        teraCaptainCost: priceInfo?.teraCaptainCost ?? null,
        complexBanReason: priceInfo?.complexBanReason ?? null,
        roles,
        fitScore: Math.round(fitScore),
        fitTags: Array.from(new Set(fitTags)).slice(0, 5),
      };
    });
  }, [allPokemon, avgRemainingPerSlot, avgStats.speed, draftNeeds.weakTypes, openSlots, seasonPrices, teamRoleCounts, teamSpeeds]);

  // Deferred copies of the high-frequency filter inputs: slider drags and
  // keystrokes update the controls instantly while the heavy list recompute
  // lags a frame behind.
  const deferredSearch = useDeferredValue(candidateSearch);
  const deferredMaxPrice = useDeferredValue(maxPrice);
  const deferredMinSpeed = useDeferredValue(minSpeed);
  const deferredMaxSpeed = useDeferredValue(maxSpeed);
  const filtersAreStale =
    deferredSearch !== candidateSearch ||
    deferredMaxPrice !== maxPrice ||
    deferredMinSpeed !== minSpeed ||
    deferredMaxSpeed !== maxSpeed;

  const filteredCandidates = useMemo(() => {
    const search = deferredSearch.trim().toLowerCase();
    const base = candidates
      .filter((p) => p.price >= 1)
      .filter((p) => !plannedPokemonIds.has(p.id))
      .filter((p) => !hiddenPokemonIds.includes(p.id))
      .filter((p) => !availableOnly || !draftedInSelectedDivision || !draftedInSelectedDivision.has(p.id))
      .filter((p) => roleFilters.every((role) => p.roles.includes(role)))
      .filter((p) => moveFilters.every((move) => (p.moves || []).includes(move)))
      .filter((p) =>
        resistFilters.every(
          (type) => getDefensiveMultiplier((p.types || []).map((t) => t.toLowerCase()), type, (p.abilities || []) as Ability[]) < 1
        )
      )
      .filter((p) => isTypeFilters.every((type) => (p.types || []).map((t) => t.toLowerCase()).includes(type)))
      .filter((p) => strongVsFilters.every((type) => (p.types || []).some((t) => TYPE_CHART[t.toLowerCase()]?.[type] === 2)))
      .filter((p) => p.price <= deferredMaxPrice)
      .filter((p) => (p.speed || 0) >= deferredMinSpeed)
      .filter((p) => (p.speed || 0) <= deferredMaxSpeed)
      .filter((p) => !search || pokemonSearchAliases(p.name, p.displayName, { friendlyMegaNames })
        .concat(p.nameAliases || [])
        .map((alias) => alias.toLowerCase())
        .some((alias) => alias.includes(search)));

    return base
      .sort((a, b) => {
        if (sortByFit && b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
        if (statFocus !== "none" && b[statFocus] !== a[statFocus]) {
          const statCompare = (b[statFocus] || 0) - (a[statFocus] || 0);
          return statFocusAsc ? -statCompare : statCompare;
        }
        if (b.price !== a.price) return b.price - a.price;
        if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
        return getPokemonLabel(a, friendlyMegaNames).localeCompare(getPokemonLabel(b, friendlyMegaNames));
      });
  }, [availableOnly, candidates, deferredMaxPrice, deferredMaxSpeed, deferredMinSpeed, deferredSearch, draftedInSelectedDivision, friendlyMegaNames, hiddenPokemonIds, isTypeFilters, moveFilters, plannedPokemonIds, resistFilters, roleFilters, sortByFit, statFocus, statFocusAsc, strongVsFilters]);

  const comparePokemon = useMemo(
    () => compareIds.map((id) => candidates.find((p) => p.id === id)).filter((p): p is CandidatePokemon => Boolean(p)),
    [candidates, compareIds]
  );

  // All moves from database (for search)
  const allMoveNames = useMemo(() => Object.keys(moveTypes).sort(), [moveTypes]);

  // Filtered moves for search dropdown (searches all moves in database)
  const filteredMoves = useMemo(() => {
    if (!moveSearch.trim()) return [];
    const search = moveSearch.toLowerCase().replace(/\s+/g, "-");
    return allMoveNames
      .filter(m => m.includes(search) && !trackedMoves.includes(m))
      .slice(0, 8);
  }, [moveSearch, allMoveNames, trackedMoves]);

  // Move coverage calculation
  const moveCoverage = useMemo(() => {
    return trackedMoves.map((move) => ({
      move,
      pokemon: roster.filter((p) => p.moves.includes(move)),
    }));
  }, [roster, trackedMoves]);

  function addMove(move: string) {
    if (!trackedMoves.includes(move)) {
      setTrackedMoves([move, ...trackedMoves]);
    }
    setMoveSearch("");
    setShowMoveDropdown(false);
  }

  function removeMove(move: string) {
    setTrackedMoves(trackedMoves.filter(m => m !== move));
  }

  const addCandidateToNextSlot = useCallback((candidate: SimplePokemon) => {
    setSlots((prev) => {
      const nextOpenSlot = prev.findIndex((slot) => !slot.pokemonId);
      if (nextOpenSlot === -1) return prev;
      const next = [...prev];
      next[nextOpenSlot] = buildPlannerSlot(candidate.id, getPokemonLabel(candidate, friendlyMegaNames));
      return next;
    });
  }, [buildPlannerSlot, friendlyMegaNames]);

  const hideCandidate = useCallback((candidateId: number) => {
    setHiddenPokemonIds((current) => current.includes(candidateId) ? current : [...current, candidateId]);
  }, []);

  const toggleWatchlist = useCallback((pokemonId: number) => {
    setWatchlist((current) =>
      current.includes(pokemonId)
        ? current.filter((id) => id !== pokemonId)
        : [pokemonId, ...current]
    );
  }, []);

  const moveFilterSuggestions = useMemo(() => {
    if (!moveFilterSearch.trim()) return [];
    const search = moveFilterSearch.toLowerCase().replace(/\s+/g, "-");
    return allMoveNames.filter((m) => m.includes(search) && !moveFilters.includes(m)).slice(0, 8);
  }, [allMoveNames, moveFilterSearch, moveFilters]);

  function addMoveFilter(move: string) {
    setMoveFilters((current) => (current.includes(move) ? current : [...current, move]));
    setMoveFilterSearch("");
    setShowMoveFilterDropdown(false);
  }

  function removeMoveFilter(move: string) {
    setMoveFilters((current) => current.filter((m) => m !== move));
  }

  function toggleRoleFilter(role: DraftRole) {
    setRoleFilters((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
    );
  }

  function toggleTypeGridFilter(type: string) {
    const setter =
      typeFilterMode === "is" ? setIsTypeFilters : typeFilterMode === "resists" ? setResistFilters : setStrongVsFilters;
    setter((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    );
  }

  function toggleResistFilter(type: string) {
    setResistFilters((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    );
  }

  const toggleNoteEditor = useCallback((pokemonId: number) => {
    setOpenNoteIds((current) =>
      current.includes(pokemonId) ? current.filter((id) => id !== pokemonId) : [...current, pokemonId]
    );
  }, []);

  const saveNote = useCallback((pokemonId: number, value: string) => {
    const trimmed = value.trim();
    setNotes((current) => {
      const next = { ...current };
      if (trimmed) {
        next[pokemonId] = trimmed;
      } else {
        delete next[pokemonId];
      }
      return next;
    });
    setOpenNoteIds((current) => current.filter((id) => id !== pokemonId));
  }, []);

  const deleteNote = useCallback((pokemonId: number) => {
    setNotes((current) => {
      const next = { ...current };
      delete next[pokemonId];
      return next;
    });
    setOpenNoteIds((current) => current.filter((id) => id !== pokemonId));
  }, []);

  const toggleCompare = useCallback((pokemonId: number) => {
    setCompareIds((current) => {
      if (current.includes(pokemonId)) return current.filter((id) => id !== pokemonId);
      return [...current, pokemonId].slice(-4);
    });
  }, []);

  async function copyDraftPlan() {
    const rosterLines = slots
      .filter((slot) => slot.pokemon)
      .map((slot, index) => `${index + 1}. ${getPokemonLabel(slot.pokemon!, friendlyMegaNames)} - ${slot.price} pts${slot.isTeraCaptain ? " (TC)" : ""}`);
    const watchLines = watchlist
      .map((id) => candidates.find((p) => p.id === id))
      .filter((p): p is CandidatePokemon => Boolean(p))
      .map((p) => `- ${getPokemonLabel(p, friendlyMegaNames)} (${p.price} pts): ${notes[p.id] || p.fitTags.join(", ")}`);

    const noteLines = Object.entries(notes)
      .filter(([id, text]) => text.trim() && !watchlist.includes(Number(id)))
      .map(([id, text]) => {
        const p = candidates.find((c) => c.id === Number(id));
        return p ? `- ${getPokemonLabel(p, friendlyMegaNames)}: ${text.trim()}` : null;
      })
      .filter((line): line is string => Boolean(line));

    const text = [
      `${teamName || "Draft Plan"} (${totalSpent}/${draftBudget} pts)`,
      "",
      "Roster",
      rosterLines.length ? rosterLines.join("\n") : "No Pokemon selected",
      "",
      "Watchlist",
      watchLines.length ? watchLines.join("\n") : "No watchlist picks",
      ...(noteLines.length ? ["", "Notes", noteLines.join("\n")] : []),
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setShareStatus("copied");
    setTimeout(() => setShareStatus("idle"), 1800);
  }

  function renderTeamRosterSection() {
    return (
      <section className="relative shrink-0 overflow-visible rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-3">
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="text-sm font-bold text-white">Team Roster</h2>
            <p className="text-xs text-[var(--foreground-muted)]">
              Type in a card to add or edit a pick · paste a list to fill all slots
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">Points</p>
              <p className={`font-mono text-2xl font-bold leading-none ${remainingBudget >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                {remainingBudget}
              </p>
            </div>
            <div className="flex flex-col gap-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
              <p>
                Spent <span className="ml-1 font-mono text-xs text-[var(--accent)]">{totalSpent}</span>
              </p>
              <p>
                Total <span className="ml-1 font-mono text-xs text-white">{draftBudget}</span>
              </p>
            </div>
          </div>
        </div>
        {/* Click-away overlay to close ability tooltips */}
        {expandedAbility && (
          <div className="fixed inset-0 z-40" onClick={() => setExpandedAbility(null)} />
        )}
        {/* xl:grid-cols-11 keeps every slot on one row (PLANNER_SLOT_COUNT = 11) */}
        <div className="grid grid-cols-2 gap-1.5 overflow-visible sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 xl:gap-1">
          {slots.map((slot, i) => (
            <div
              key={i}
              data-roster-slot
              className={`relative flex min-w-0 flex-col overflow-visible rounded-lg border bg-[var(--background-secondary)]/70 p-1.5 xl:p-1 ${
                slot.isTeraCaptain
                  ? "border-[var(--accent)]"
                  : slot.pokemon
                  ? "border-[var(--background-tertiary)]"
                  : "border-dashed border-[var(--background-tertiary)]"
              }`}
            >
              {slot.pokemon && (slot.pokemon.types?.length ?? 0) > 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-t-lg"
                  style={{
                    background: `linear-gradient(90deg, ${TYPE_COLORS[slot.pokemon.types[0].toLowerCase()]}, ${TYPE_COLORS[(slot.pokemon.types[1] || slot.pokemon.types[0]).toLowerCase()]})`,
                  }}
                />
              )}
              <div className="mb-1 flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] text-[var(--foreground-subtle)]">{i + 1}</span>
                <div className="flex items-center gap-1">
                  {slot.isTeraCaptain && (
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-black"
                      title="Tera Captain"
                    >
                      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L2 12l10 10 10-10L12 2z" />
                      </svg>
                    </span>
                  )}
                  {slot.price > 0 && (
                    <span className="rounded bg-[var(--background)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)]">
                      {slot.price}
                    </span>
                  )}
                  {(slot.pokemonId !== null || slot.pokemonName !== "") && (
                    <button
                      type="button"
                      onClick={() => handleSlotChange(i, null, "")}
                      className="draft-icon-button flex h-4 w-4 items-center justify-center rounded bg-[var(--background)] text-[var(--foreground-muted)] transition-colors hover:text-[var(--error)]"
                      title="Clear slot"
                      aria-label={`Clear slot ${i + 1}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>
              {slot.pokemon ? (
                <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
                  {(slot.pokemon.types?.length ?? 0) > 0 && (
                    <span
                      aria-hidden
                      className="absolute inset-1 rounded-full opacity-25 blur-md"
                      style={{ background: TYPE_COLORS[slot.pokemon.types[0].toLowerCase()] }}
                    />
                  )}
                  <OptimizedPlannerImage
                    src={slot.pokemon.spriteUrl}
                    alt=""
                    width={72}
                    height={72}
                    className="relative h-16 w-16 scale-125 object-contain"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.closest("[data-roster-slot]")?.querySelector<HTMLInputElement>("input")?.focus();
                  }}
                  aria-label={`Add Pokemon to slot ${i + 1}`}
                  className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[var(--background-tertiary)] text-[var(--foreground-subtle)] transition-colors hover:border-[var(--foreground-subtle)] hover:text-white sm:h-16 sm:w-16"
                >
                  <Plus className="h-5 w-5" />
                </button>
              )}
              <div className="mt-1">
                <PokemonAutocomplete
                  value={slot.pokemonName}
                  pokemonId={slot.pokemonId}
                  allPokemon={allPokemon}
                  onChange={(id, name) => handleSlotChange(i, id, name)}
                  onMultiLinePaste={(lines) => handleMultiLinePaste(i, lines)}
                  hasWarning={!slot.pokemonId && slot.pokemonName !== ""}
                  warningText={!slot.pokemonId && slot.pokemonName ? `No match` : ""}
                  placeholder="Type name..."
                  friendlyMegaNames={friendlyMegaNames}
                  inputClassName="px-1 py-1 text-center text-xs"
                />
              </div>
              <div className="mt-1 flex min-h-[20px] flex-wrap content-start items-start justify-center gap-0.5">
                {(slot.pokemon?.types ?? []).map((t) => (
                  <span
                    key={t}
                    className="rounded px-1.5 py-px text-[10px] font-bold text-white"
                    style={{ backgroundColor: TYPE_COLORS[t.toLowerCase()] }}
                  >
                    {formatTypeName(t)}
                  </span>
                ))}
              </div>
              {slot.pokemon && slot.pokemon.abilities.length > 0 && (
                <div
                  className={`mt-1 min-w-0 overflow-visible border-t pt-1 ${
                    slot.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                  }`}
                >
                  {slot.pokemon.abilities.map((a, abilityIdx) => {
                    const description = abilityDescriptions[a.name];
                    const isExpanded =
                      expandedAbility?.slotIdx === i && expandedAbility?.abilityIdx === abilityIdx;
                    return (
                      <div key={abilityIdx} className="relative overflow-visible">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedAbility(isExpanded ? null : { slotIdx: i, abilityIdx });
                          }}
                          className={`w-full truncate py-0.5 text-center text-[10px] capitalize text-[var(--foreground-muted)] transition-colors hover:text-white ${
                            abilityIdx > 0 ? "border-t border-[var(--background-tertiary)]/50" : ""
                          }`}
                        >
                          {a.name.replace(/-/g, " ")}
                        </button>
                        {isExpanded && description && (
                          <div className="absolute bottom-full left-1/2 z-50 mb-1 w-44 -translate-x-1/2">
                            <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1.5 shadow-lg">
                              <p className="mb-0.5 text-[10px] font-bold capitalize text-white">
                                {a.name.replace(/-/g, " ")}
                              </p>
                              <p className="text-[10px] leading-tight text-[var(--foreground-muted)]">{description}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div
      className="draft-planner-shell min-h-[calc(100dvh-16px)] overflow-y-auto"
      style={{
        width: '100vw',
        position: 'relative',
        left: '50%',
        marginLeft: '-50vw',
      }}
    >
      <div className="draft-planner-frame poke-card mx-2 mt-2 flex min-h-[calc(100dvh-1rem)] flex-col overflow-visible p-2 sm:mx-4 sm:p-3">
        {/* Header */}
        <div className="draft-planner-header mb-2 flex shrink-0 flex-col gap-2.5 border-b border-[var(--background-tertiary)] pb-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {coach ? (
              <Link href={`/coaches/${coach.id}`} className="shrink-0 text-[var(--foreground-muted)] hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
            ) : (
              <Link href="/" className="shrink-0 text-[var(--foreground-muted)] hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
            )}
            {teamLogo && (
              <div className="draft-team-mark">
                <OptimizedPlannerImage src={teamLogo} alt="" width={32} height={32} className="h-7 w-7 shrink-0 object-contain sm:h-8 sm:w-8" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate font-pixel text-sm text-white sm:text-base">{teamName || "Draft Planner"}</h1>
              <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                {allSeasons.find((season) => season.id === currentSeasonId)?.name || "Current season"}
              </span>
              <span className="block truncate text-xs text-[var(--foreground-muted)]">
                {coach ? `${coach.name} • ` : ""}Plan your team
              </span>
            </div>
          </div>
          <div className={`grid grid-cols-2 gap-1.5 transition-opacity lg:flex lg:flex-wrap lg:items-center ${isNavigating ? "pointer-events-none opacity-50" : ""}`}>
            <select
              value={currentSeasonId ?? ""}
              onChange={(e) => navigateToPreset(coach?.id ?? null, e.target.value ? Number(e.target.value) : null)}
              aria-label="Season"
              className="draft-control h-[34px] w-full rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 text-xs text-white lg:w-auto lg:max-w-[10rem]"
            >
              {allSeasons.map((season) => (
                <option key={season.id} value={season.id}>{season.name}</option>
              ))}
            </select>
            <select
              value={selectedDivisionId}
              onChange={(e) => setDivisionOverride(e.target.value ? Number(e.target.value) : "")}
              aria-label="Division"
              className="draft-control h-[34px] w-full rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 text-xs text-white lg:w-auto lg:max-w-[10rem]"
            >
              <option value="">All divisions</option>
              {divisionOptions.map((division) => (
                <option key={division.id} value={division.id}>{division.name}</option>
              ))}
            </select>
            <select
              value={coach?.id ?? ""}
              onChange={(e) => navigateToPreset(e.target.value ? Number(e.target.value) : null, currentSeasonId)}
              aria-label="Team"
              className="draft-control col-span-2 h-[34px] w-full rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 text-xs text-white lg:col-span-1 lg:w-auto lg:max-w-[12rem]"
            >
              <option value="">Blank plan</option>
              {teamOptions.map((team) => (
                <option key={`${team.coachId}-${team.divisionId}`} value={team.coachId}>{team.teamName}</option>
              ))}
            </select>
          </div>
          <div className="flex shrink-0 items-stretch gap-1.5 lg:flex-col">
            <button
              type="button"
              onClick={savePlan}
              disabled={planSaveStatus === "saving"}
              title="Save this roster plan; it loads automatically on your next visit"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white transition-colors hover:brightness-110 disabled:opacity-50 sm:px-4 sm:text-sm lg:flex-none"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {planSaveStatus === "saving" ? "Saving..." : planSaveStatus === "saved" ? "Plan Saved!" : "Save Plan"}
            </button>
            <button
              type="button"
              onClick={copyDraftPlan}
              title="Copy your roster and watchlist as text to share"
              className="draft-secondary-button flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-1.5 text-xs font-bold text-[var(--foreground-muted)] transition-colors hover:text-white lg:flex-none"
            >
              <Share2 className="h-3.5 w-3.5" />
              {shareStatus === "copied" ? "Copied!" : "Copy Plan"}
            </button>
            <button
              type="button"
              onClick={resetPlan}
              title="Clear all roster slots (saved plan and settings stay)"
              className="flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-bold text-[var(--foreground-subtle)] transition-colors hover:text-[var(--error)]"
            >
              <X className="h-3 w-3" />
              Reset Plan
            </button>
          </div>
        </div>

        <div className="mb-2 shrink-0">
          <DraftRulesDisclaimer />
        </div>

        <div className="shrink-0 overflow-visible">
          {renderTeamRosterSection()}
        </div>

        {/* Divider between the roster and the planning tools below */}
        <div className="my-3 flex shrink-0 items-center gap-3 sm:my-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--card-border)]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
            Planning Tools
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--card-border)]" />
        </div>

        <div className="draft-toggle-toolbar mb-2 flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-1.5 lg:hidden">
          <span className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
            <Eye className="h-3.5 w-3.5" />
            View
          </span>
          {[
            { label: "Draft Needs", enabled: showNeedsPanel, onClick: () => setShowNeedsPanel(!showNeedsPanel) },
            { label: "Draft Board", enabled: showDraftBoard, onClick: () => setShowDraftBoard(!showDraftBoard) },
            { label: "Compare", enabled: showComparePanel, onClick: () => setShowComparePanel(!showComparePanel) },
            { label: "Notes", enabled: showNotesPanel, onClick: () => setShowNotesPanel(!showNotesPanel) },
            { label: "Team Info", enabled: showTeamAnalyzer, onClick: () => setShowTeamAnalyzer(!showTeamAnalyzer) },
          ].map((toggle) => (
            <button
              key={toggle.label}
              type="button"
              aria-pressed={toggle.enabled}
              onClick={toggle.onClick}
              className={`draft-toggle inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold transition-colors sm:text-xs ${
                toggle.enabled
                  ? "is-active border-[var(--primary)]/40 bg-[var(--primary)]/15 text-white"
                  : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-subtle)] hover:text-white"
              }`}
            >
              {toggle.label}
            </button>
          ))}
        </div>

        <div className="draft-planner-content flex min-h-0 flex-col gap-1.5 overflow-visible lg:flex-1 lg:overflow-y-auto lg:pr-1">
        {/* Draft needs and board workspace */}
        {(showNeedsPanel || showDraftBoard) && (
          <div className={`flex min-h-0 min-w-0 shrink-0 flex-col gap-1.5 overflow-visible lg:overflow-hidden ${showNeedsPanel && showDraftBoard ? "lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-stretch" : ""}`}>
          {showNeedsPanel && (
          <section className="draft-needs-bar min-w-0 rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-3">
            <div className="mb-2.5">
              <h2 className="text-sm font-bold text-white">Draft Needs</h2>
              <p className="text-xs text-[var(--foreground-muted)]">Click a row to filter the draft board</p>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1.5 flex items-baseline justify-between gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
                  Roles
                  <span className="normal-case tracking-normal">
                    <span className="text-emerald-300">✓ covered</span> · <span className="text-amber-300">+ needed</span>
                  </span>
                </p>
                <ul className="flex flex-col gap-1">
                  {draftNeeds.roleNeeds.map((need) => {
                    const isActive = roleFilters.includes(need.role);
                    return (
                      <li key={need.label}>
                        <button
                          type="button"
                          onClick={() => toggleRoleFilter(need.role)}
                          aria-pressed={isActive}
                          title={isActive ? "Stop filtering by this role" : `Show Pokemon that fill ${need.label}`}
                          className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-[11px] font-bold transition-shadow ${need.met ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"} ${isActive ? "ring-2 ring-[var(--secondary-light)]" : "hover:ring-1 hover:ring-[var(--foreground-subtle)]"}`}
                        >
                          {need.label}
                          <span>{need.met ? (need.count > 1 ? `✓ ×${need.count}` : "✓") : "+"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 flex items-baseline justify-between gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
                  Team weak to
                  {draftNeeds.weakTypes.length > 0 && (
                    <span className="normal-case tracking-normal">×N = weak members</span>
                  )}
                </p>
                {roster.length === 0 ? (
                  <p className="text-xs text-[var(--foreground-muted)]">Add picks to your roster to see coverage gaps</p>
                ) : draftNeeds.weakTypes.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {draftNeeds.weakTypes.map((type) => {
                      const weakCount = typeChart[type]?.multipliers.filter((m) => m > 1).length ?? 0;
                      const isActive = resistFilters.includes(type);
                      return (
                        <li key={type}>
                          <button
                            type="button"
                            onClick={() => toggleResistFilter(type)}
                            aria-pressed={isActive}
                            title={isActive ? `Stop filtering by ${formatTypeName(type)} resists` : `Show Pokemon that resist ${formatTypeName(type)}`}
                            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-[11px] font-bold text-white transition-shadow ${isActive ? "ring-2 ring-white/80" : "hover:ring-1 hover:ring-white/50"}`}
                            style={{ backgroundColor: TYPE_COLORS[type] }}
                          >
                            {formatTypeName(type)}
                            <span className="opacity-80">×{weakCount}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="flex items-center justify-between rounded bg-emerald-500/15 px-2 py-1.5 text-[11px] font-bold text-emerald-300">
                    No major weaknesses
                    <span>✓</span>
                  </p>
                )}
              </div>
            </div>
          </section>
          )}

          {showDraftBoard && (
          <section className="draft-board-panel flex min-h-0 min-w-0 flex-col rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-3 lg:overflow-hidden">
            <div className="mb-2.5 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
              <div>
                <h2 className="text-sm font-bold text-white">Draft Board</h2>
                <p className="text-xs text-[var(--foreground-muted)]">Filter and compare Pokémon, add them to your watchlist, or draft them</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <button
                  type="button"
                  onClick={() => setAvailableOnly(!availableOnly)}
                  role="switch"
                  aria-checked={availableOnly}
                  disabled={selectedDivisionId === ""}
                  title={
                    selectedDivisionId === ""
                      ? "Pick a division in the page header first"
                      : "Hide Pokemon already drafted in the selected division"
                  }
                  className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${availableOnly ? "text-emerald-300" : "text-[var(--foreground-subtle)] hover:text-white"}`}
                >
                  <span className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${availableOnly ? "bg-emerald-500/70" : "bg-[var(--background-tertiary)]"}`}>
                    <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${availableOnly ? "left-3" : "left-0.5"}`} />
                  </span>
                  Available only
                </button>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
                  <span className="flex items-center gap-1.5">
                    <Filter className="h-3 w-3" />
                    Showing <span className="font-mono text-white">{filteredCandidates.length}</span>
                  </span>
                  <span>
                    Open slots <span className="font-mono text-white">{openSlots}</span>
                  </span>
                  <span>
                    Avg pts/slot{" "}
                    <span className="font-mono text-[var(--accent)]">{openSlots > 0 ? avgRemainingPerSlot : "-"}</span>
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setShowFitExplanation((current) => !current)}
                  aria-expanded={showFitExplanation}
                  className="draft-secondary-button rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1 text-[11px] font-bold text-[var(--foreground-muted)] transition-colors hover:text-white"
                >
                  {showFitExplanation ? "Hide FIT info" : "What is FIT?"}
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3 lg:grid lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="flex shrink-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">Search</p>
                  <label className="relative block">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--foreground-subtle)]" />
                    <input
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      placeholder="Search Pokemon"
                      className="draft-control h-[34px] w-full rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] pl-7 pr-2 text-sm text-white placeholder:text-[var(--foreground-subtle)]"
                    />
                  </label>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">Sort</p>
                  <div className="flex gap-1.5">
                    <select
                      value={statFocus}
                      onChange={(e) => {
                        setStatFocus(e.target.value as StatFocus);
                        if (e.target.value !== "none") setSortByFit(false);
                      }}
                      className="draft-control h-[34px] min-w-0 flex-1 rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 text-sm text-white"
                    >
                      <option value="none">No stat focus</option>
                      <option value="price">Points</option>
                      <option value="hp">HP</option>
                      <option value="attack">Attack</option>
                      <option value="defense">Defense</option>
                      <option value="specialAttack">Sp. Atk</option>
                      <option value="specialDefense">Sp. Def</option>
                      <option value="speed">Speed</option>
                      <option value="baseStatTotal">BST</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setStatFocusAsc((current) => !current)}
                      disabled={statFocus === "none"}
                      className="draft-secondary-button h-[34px] shrink-0 rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2.5 text-xs font-bold text-[var(--foreground-muted)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      title="Toggle stat focus sort direction"
                    >
                      {statFocusAsc ? "Asc" : "Desc"}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">Filters</p>
                  <div className="flex flex-col gap-1.5">
                    {(roleFilters.length > 0 || resistFilters.length > 0 || moveFilters.length > 0 || isTypeFilters.length > 0 || strongVsFilters.length > 0) && (
                      <div className="flex flex-wrap gap-1">
                        {roleFilters.map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleRoleFilter(role)}
                            title="Remove filter"
                            className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-1 text-[10px] font-bold text-emerald-300 transition-colors hover:text-white"
                          >
                            {formatRole(role)}
                            <X className="h-2.5 w-2.5" />
                          </button>
                        ))}
                        {isTypeFilters.map((type) => (
                          <button
                            key={`is-${type}`}
                            type="button"
                            onClick={() => setIsTypeFilters((current) => current.filter((t) => t !== type))}
                            title="Remove filter"
                            className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold text-white transition-opacity hover:opacity-80"
                            style={{ backgroundColor: TYPE_COLORS[type] }}
                          >
                            {formatTypeName(type)}
                            <X className="h-2.5 w-2.5" />
                          </button>
                        ))}
                        {strongVsFilters.map((type) => (
                          <button
                            key={`strong-${type}`}
                            type="button"
                            onClick={() => setStrongVsFilters((current) => current.filter((t) => t !== type))}
                            title="Remove filter"
                            className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold text-white transition-opacity hover:opacity-80"
                            style={{ backgroundColor: TYPE_COLORS[type] }}
                          >
                            Strong vs {formatTypeName(type)}
                            <X className="h-2.5 w-2.5" />
                          </button>
                        ))}
                        {resistFilters.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => toggleResistFilter(type)}
                            title="Remove filter"
                            className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold text-white transition-opacity hover:opacity-80"
                            style={{ backgroundColor: TYPE_COLORS[type] }}
                          >
                            Resists {formatTypeName(type)}
                            <X className="h-2.5 w-2.5" />
                          </button>
                        ))}
                        {moveFilters.map((move) => (
                          <button
                            key={move}
                            type="button"
                            onClick={() => removeMoveFilter(move)}
                            title="Remove filter"
                            className="flex items-center gap-1 rounded border border-[var(--background-tertiary)] bg-[var(--background)] px-1.5 py-1 text-[10px] font-bold capitalize text-white transition-colors hover:border-[var(--foreground-subtle)]"
                          >
                            {moveTypes[move] && (
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[moveTypes[move]] }} />
                            )}
                            {move.replace(/-/g, " ")}
                            <X className="h-2.5 w-2.5" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="rounded-md bg-[var(--background-secondary)] p-2">
                      <div className="mb-1.5 grid grid-cols-3 gap-0.5 rounded bg-[var(--background)] p-0.5">
                        {([
                          { value: "is", label: "Is type" },
                          { value: "resists", label: "Resists" },
                          { value: "strong", label: "Strong vs" },
                        ] as const).map((mode) => (
                          <button
                            key={mode.value}
                            type="button"
                            onClick={() => setTypeFilterMode(mode.value)}
                            aria-pressed={typeFilterMode === mode.value}
                            className={`rounded px-1 py-1 text-[10px] font-bold transition-colors ${
                              typeFilterMode === mode.value
                                ? "bg-[var(--background-tertiary)] text-white"
                                : "text-[var(--foreground-subtle)] hover:text-white"
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {ALL_TYPES.map((type) => {
                          const activeSet =
                            typeFilterMode === "is" ? isTypeFilters : typeFilterMode === "resists" ? resistFilters : strongVsFilters;
                          const isSelected = activeSet.includes(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => toggleTypeGridFilter(type)}
                              aria-pressed={isSelected}
                              title={
                                typeFilterMode === "is"
                                  ? `Show ${formatTypeName(type)}-type Pokemon`
                                  : typeFilterMode === "resists"
                                  ? `Show Pokemon that resist ${formatTypeName(type)}`
                                  : `Show Pokemon that hit ${formatTypeName(type)} super-effectively`
                              }
                              className={`rounded px-1 py-1 text-[10px] font-bold text-white transition-shadow ${
                                isSelected ? "ring-2 ring-white/80" : "hover:ring-1 hover:ring-white/50"
                              }`}
                              style={{ backgroundColor: TYPE_COLORS[type] }}
                            >
                              {formatTypeName(type)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={moveFilterSearch}
                        onChange={(e) => {
                          setMoveFilterSearch(e.target.value);
                          setShowMoveFilterDropdown(true);
                        }}
                        onFocus={() => setShowMoveFilterDropdown(true)}
                        onBlur={() => setTimeout(() => setShowMoveFilterDropdown(false), 150)}
                        placeholder="Filter by move..."
                        className="draft-control h-[34px] w-full rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 text-sm text-white placeholder:text-[var(--foreground-subtle)]"
                      />
                      {showMoveFilterDropdown && moveFilterSuggestions.length > 0 && (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] shadow-lg">
                          {moveFilterSuggestions.map((move) => {
                            const moveType = moveTypes[move];
                            return (
                              <button
                                key={move}
                                type="button"
                                onMouseDown={() => addMoveFilter(move)}
                                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-[var(--background-tertiary)]"
                              >
                                {moveType && (
                                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[moveType] }} />
                                )}
                                <span className="capitalize text-white">{move.replace(/-/g, " ")}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="rounded-md bg-[var(--background-secondary)] px-2.5 py-2">
                      <span className="mb-1.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                        Max price <span className="font-mono text-xs text-white">{maxPrice}</span>
                      </span>
                      <div className="draft-range-dual relative h-4">
                        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded bg-[var(--background-tertiary)]" />
                        <div
                          className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-[var(--primary)]"
                          style={{ left: 0, right: `${100 - (maxPrice / 19) * 100}%` }}
                        />
                        <input
                          type="range"
                          min="0"
                          max="19"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(Number(e.target.value))}
                          aria-label="Maximum price"
                        />
                      </div>
                    </div>
                    <div className="rounded-md bg-[var(--background-secondary)] px-2.5 py-2">
                      <span className="mb-1.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                        Speed range <span className="font-mono text-xs text-white">{minSpeed}–{maxSpeed}</span>
                      </span>
                      <div className="draft-range-dual relative h-4">
                        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded bg-[var(--background-tertiary)]" />
                        <div
                          className="absolute top-1/2 h-1 -translate-y-1/2 rounded bg-[var(--primary)]"
                          style={{ left: `${(minSpeed / 160) * 100}%`, right: `${100 - (maxSpeed / 160) * 100}%` }}
                        />
                        <input
                          type="range"
                          min="0"
                          max="160"
                          step="5"
                          value={minSpeed}
                          onChange={(e) => setMinSpeed(Math.min(Number(e.target.value), maxSpeed))}
                          aria-label="Minimum speed"
                        />
                        <input
                          type="range"
                          min="0"
                          max="160"
                          step="5"
                          value={maxSpeed}
                          onChange={(e) => setMaxSpeed(Math.max(Number(e.target.value), minSpeed))}
                          aria-label="Maximum speed"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (!sortByFit) setStatFocus("none");
                          setSortByFit(!sortByFit);
                        }}
                        aria-pressed={sortByFit}
                        title="Sort the board by FIT score"
                        className={`draft-secondary-button flex h-[34px] items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-bold transition-colors ${sortByFit ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-white"}`}
                      >
                        <Star className="h-3.5 w-3.5" />
                        Sort by FIT
                      </button>
                      <button
                        type="button"
                        onClick={() => setHiddenPokemonIds([])}
                        disabled={hiddenPokemonIds.length === 0}
                        className="draft-secondary-button flex h-[34px] items-center justify-center gap-1.5 rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 text-xs font-bold text-[var(--foreground-muted)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Show hidden
                        {hiddenPokemonIds.length > 0 && (
                          <span className="rounded bg-[var(--background)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent)]">
                            {hiddenPokemonIds.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
              <div className="flex min-h-0 flex-col gap-2 lg:relative">
            <div className="contents lg:absolute lg:inset-0 lg:flex lg:min-h-0 lg:flex-col lg:gap-2">
            {showFitExplanation && (
              <div className="draft-subpanel shrink-0 rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
                <p>
                  <span className="font-bold text-white">FIT</span> scores how well a Pokemon addresses your team&apos;s current gaps — sort by FIT or click the Draft Needs rows to hunt with it. It is a planning helper, not an official draft rule.
                </p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  <div className="rounded bg-[var(--background)]/60 px-2 py-1">Role points × quality, tiered by need: Stealth Rock and removal earn 10/5/2 for the 1st/2nd/3rd provider; pivot, priority, Spikes, and Toxic Spikes earn 8/4 for up to two; Sticky Web earns 5 for the first only.</div>
                  <div className="rounded bg-[var(--background)]/60 px-2 py-1">+5 for filling two or more missing roles at once (role compression).</div>
                  <div className="rounded bg-[var(--background)]/60 px-2 py-1">+6 × quality per weak type it resists (+8 if immune), counting up to three.</div>
                  <div className="rounded bg-[var(--background)]/60 px-2 py-1">+2 to +8 × quality for 90+ Speed when your team average Speed is under 90 — faster earns more.</div>
                  <div className="rounded bg-[var(--background)]/60 px-2 py-1">+4 × quality for a new speed tier (10+ from every teammate), +2 × quality when 6–9 away; −2 when within 3 of a teammate&apos;s tier, −4 for an exact duplicate. Speeds under 50 are exempt.</div>
                  <div className="rounded bg-[var(--background)]/60 px-2 py-1">+5 when it already fills a need above and costs no more than your average remaining points per open slot.</div>
                  <div className="rounded bg-[var(--background)]/60 px-2 py-1">Quality scales from 0.5× to 1.2× with league price, so strong Pokemon that patch a need outrank cheap filler with the same moves.</div>
                </div>
              </div>
            )}

            {showComparePanel && comparePokemon.length > 0 && (
              <div className="shrink-0 overflow-x-auto rounded-md border border-[var(--background-tertiary)]">
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="bg-[var(--background-secondary)] text-[var(--foreground-muted)]">
                      <th className="px-2 py-2 text-left">Compare</th>
                      {comparePokemon.map((p) => (
                        <th key={p.id} className="px-2 py-2 text-left">
                          <button type="button" onClick={() => toggleCompare(p.id)} className="flex items-center gap-1 text-white">
                            {getPokemonLabel(p, friendlyMegaNames)}
                            <X className="h-3 w-3" />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--background-tertiary)]">
                    {[
                      ["Price", (p: CandidatePokemon) => `${p.price}`],
                      ["Types", (p: CandidatePokemon) => (p.types || []).map(formatTypeName).join(" / ")],
                      ["Roles", (p: CandidatePokemon) => p.roles.filter((role) => CHECKLIST_DRAFT_ROLE_SET.has(role)).map(formatRole).join(", ") || "-"],
                      ["Speed", (p: CandidatePokemon) => `${p.speed || 0}`],
                      ["BST", (p: CandidatePokemon) => `${p.baseStatTotal || 0}`],
                    ].map(([label, getValue]) => (
                      <tr key={label as string}>
                        <td className="px-2 py-2 font-bold text-[var(--foreground-muted)]">{label as string}</td>
                        {comparePokemon.map((p) => <td key={p.id} className="px-2 py-2 text-white">{(getValue as (p: CandidatePokemon) => string)(p)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight > el.scrollHeight - 600) {
                  setVisibleRowCount((current) =>
                    current >= filteredCandidates.length ? current : current + 120
                  );
                }
              }}
              className={`draft-candidate-grid flex min-h-[260px] max-h-[52dvh] flex-col gap-1 overflow-y-auto pr-1 transition-opacity lg:max-h-none lg:min-h-0 lg:flex-1 ${filtersAreStale ? "opacity-60" : ""}`}
            >
              {/* Column header (desktop) */}
              <div className="sticky top-0 z-10 hidden shrink-0 grid-cols-[2.25rem_minmax(0,1fr)_7.5rem_9rem_3rem_10.5rem] items-center gap-2 border-b border-[var(--background-tertiary)] bg-[var(--card)] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)] sm:grid">
                <span />
                <span>Pokemon</span>
                <span>Type</span>
                <span className="grid grid-cols-3 text-center">
                  <span>SPE</span>
                  <span>BST</span>
                  <span>FIT</span>
                </span>
                <span className="text-center">Pts</span>
                <span className="text-right">Actions</span>
              </div>
              {filteredCandidates.slice(0, visibleRowCount).map((candidate, index, visible) => (
                <Fragment key={candidate.id}>
                {statFocus === "none" && !sortByFit && (index === 0 || visible[index - 1].price !== candidate.price) && (
                  <div className="flex shrink-0 items-center gap-2 px-2 pb-1 pt-2.5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
                      {candidate.price} pts
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-r from-[var(--background-tertiary)] to-transparent" />
                  </div>
                )}
                <CandidateRow
                  candidate={candidate}
                  isPlanned={plannedPokemonIds.has(candidate.id)}
                  draftedBy={draftedInSelectedDivision?.get(candidate.id) ?? null}
                  isWatched={watchlist.includes(candidate.id)}
                  isCompared={compareIds.includes(candidate.id)}
                  note={notes[candidate.id]}
                  isNoteOpen={openNoteIds.includes(candidate.id)}
                  showNotesPanel={showNotesPanel}
                  showComparePanel={showComparePanel}
                  canAdd={openSlots > 0}
                  friendlyMegaNames={friendlyMegaNames}
                  onToggleWatchlist={toggleWatchlist}
                  onToggleCompare={toggleCompare}
                  onAdd={addCandidateToNextSlot}
                  onHide={hideCandidate}
                  onToggleNote={toggleNoteEditor}
                  onSaveNote={saveNote}
                  onDeleteNote={deleteNote}
                />
                </Fragment>
              ))}
              {visibleRowCount < filteredCandidates.length && (
                <p className="shrink-0 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-subtle)]">
                  Showing first {visibleRowCount} of {filteredCandidates.length} — scroll to load more
                </p>
              )}
            </div>
            </div>
            </div>
            </div>
          </section>
          )}
          </div>
        )}

        {/* Team analyzer */}
        {showTeamAnalyzer && (
        <section className="draft-analyzer-panel w-full shrink-0 overflow-visible rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] lg:overflow-hidden">
          <div className="draft-panel-header flex flex-wrap items-center justify-between gap-2 border-b border-[var(--background-tertiary)] bg-[var(--card)] p-2">
            <div>
              <h3 className="font-bold text-sm text-white">Team Info</h3>
              <p className="text-[11px] text-[var(--foreground-muted)]">Type chart, stats, and move coverage</p>
            </div>
            <button
              onClick={savePreferences}
              disabled={saveStatus === "saving"}
              title="Save your stat sort, tracked moves, notes, and hidden Pokemon as defaults"
              className="draft-secondary-button flex items-center gap-1.5 rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2.5 py-1.5 text-xs font-bold text-[var(--foreground-muted)] transition-colors hover:text-white disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save Defaults"}
            </button>
          </div>
        <div className="flex min-h-0 flex-col overflow-visible p-1.5 lg:max-h-[72dvh] lg:overflow-hidden">
          <div className="overflow-visible pr-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {roster.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-[var(--foreground-muted)]">
                Add Pokemon to your roster to see type coverage, stats, abilities, and moves.
              </p>
            )}
            {/* Type Chart | Stats | Moves - stacked on mobile, side by side on desktop */}
            {roster.length > 0 && (
            <div className="flex min-h-0 flex-col gap-2 lg:flex-row lg:items-stretch">
          {/* Type Chart - Mobile (transposed: types as rows, Pokemon as columns) */}
          <div className="w-full overflow-x-auto rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-1.5 lg:hidden">
            <table className="table-fixed text-[10px]" style={{ borderSpacing: "2px", borderCollapse: "separate" }}>
              <colgroup>
                <col style={{ width: "32px" }} />
                {roster.map((_, idx) => (
                  <col key={idx} style={{ width: "26px" }} />
                ))}
                <col style={{ width: "24px" }} />
                <col style={{ width: "20px" }} />
              </colgroup>
              <tbody>
                {/* Pokemon sprites header row */}
                <tr>
                  <td className="p-1"></td>
                  {roster.map((p, idx) => (
                    <td key={idx} className="p-0.5 bg-[var(--background-secondary)] rounded text-center">
                      <OptimizedPlannerImage src={p.spriteUrl} alt={getPokemonLabel(p, friendlyMegaNames)} title={getPokemonLabel(p, friendlyMegaNames)} width={20} height={20} className="w-5 h-5 object-contain mx-auto scale-[1.4]" />
                    </td>
                  ))}
                  <td className="rounded bg-[var(--background-secondary)] p-0.5 text-center text-[10px] text-[var(--foreground-muted)]">+/-</td>
                  <td className="rounded bg-[var(--background-secondary)] p-0.5 text-center text-[10px] text-[var(--foreground-muted)]">#</td>
                </tr>
                {/* Type rows */}
                {ALL_TYPES.map((type) => {
                  const { overall } = typeChart[type];
                  const typeCount = roster.filter(p => p.types.map(t => t.toLowerCase()).includes(type)).length;
                  return (
                    <tr key={type}>
                      <td
                        className="rounded px-0.5 py-1 text-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: TYPE_COLORS[type] }}
                      >
                        {type.slice(0, 3).toUpperCase()}
                      </td>
                      {roster.map((p, idx) => {
                        const mult = getDefensiveMultiplier(p.types.map(t => t.toLowerCase()), type, p.abilities);
                        return (
                          <td
                            key={idx}
                            className={`p-0.5 text-center font-mono font-bold rounded ${getMultiplierColor(mult)}`}
                          >
                            {mult !== 1 ? formatMultiplier(mult) : ""}
                          </td>
                        );
                      })}
                      <td
                        className={`rounded p-0.5 text-center text-[10px] font-bold ${
                          overall === "very_resist" || overall === "resist"
                            ? "bg-[#38761d] text-[#d9ead3]"
                            : overall === "very_weak" || overall === "weak"
                            ? "bg-[#990000] text-[#f4cccc]"
                            : "bg-[var(--background-secondary)]"
                        }`}
                      >
                        {overall === "very_resist" ? "++" : overall === "resist" ? "+" : overall === "very_weak" ? "--" : overall === "weak" ? "-" : ""}
                      </td>
                      <td className="p-0.5 text-center text-[10px] font-medium bg-[var(--background-secondary)] rounded text-white">
                        {typeCount > 0 ? typeCount : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Type Chart - Desktop (original: Pokemon as rows, types as columns) - 45% of row */}
          <div className="hidden overflow-x-auto rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-1.5 lg:block lg:min-h-[280px] lg:min-w-0 lg:flex-[4.5]">
            <table className="w-full min-w-[560px] table-fixed text-[10px]" style={{ borderSpacing: "1px", borderCollapse: "separate" }}>
              <colgroup>
                <col style={{ width: "24px" }} />
                {ALL_TYPES.map((_, i) => <col key={i} />)}
              </colgroup>
              <tbody>
                {roster.map((p, idx) => (
                  <tr key={idx}>
                    <td className="p-0.5 bg-[var(--background-secondary)] rounded">
                      <OptimizedPlannerImage
                        src={p.spriteUrl}
                        alt={getPokemonLabel(p, friendlyMegaNames)}
                        title={getPokemonLabel(p, friendlyMegaNames)}
                        width={24}
                        height={24}
                        className="h-6 w-6 object-contain scale-125"
                      />
                    </td>
                    {ALL_TYPES.map((type) => {
                      const mult = getDefensiveMultiplier(p.types.map(t => t.toLowerCase()), type, p.abilities);
                      return (
                        <td
                          key={type}
                          className={`p-0.5 text-center font-mono font-bold rounded ${getMultiplierColor(mult)}`}
                        >
                          {mult !== 1 ? formatMultiplier(mult) : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {roster.length > 0 && (
                  <>
                    <tr>
                      <td className="rounded bg-[var(--background-secondary)] p-0.5 text-center text-[10px] text-[var(--foreground-muted)]">+/-</td>
                      {ALL_TYPES.map((type) => {
                        const { overall } = typeChart[type];
                        return (
                          <td
                            key={type}
                            className={`p-0.5 text-center font-bold rounded ${
                              overall === "very_resist" || overall === "resist"
                                ? "bg-[#38761d] text-[#d9ead3]"
                                : overall === "very_weak" || overall === "weak"
                                ? "bg-[#990000] text-[#f4cccc]"
                                : "bg-[var(--background-secondary)]"
                            } text-[10px]`}
                          >
                            {overall === "very_resist" ? "++" : overall === "resist" ? "+" : overall === "very_weak" ? "--" : overall === "weak" ? "-" : ""}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="p-0.5"></td>
                      {ALL_TYPES.map((type) => (
                        <td
                          key={type}
                          className="rounded p-0.5 text-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: TYPE_COLORS[type] }}
                        >
                          {type.slice(0, 3).toUpperCase()}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="rounded bg-[var(--background-secondary)] p-0.5 text-center text-[10px] text-[var(--foreground-muted)]">#</td>
                      {ALL_TYPES.map((type) => {
                        const count = roster.filter(p => p.types.map(t => t.toLowerCase()).includes(type)).length;
                        return (
                          <td key={type} className="rounded bg-[var(--background-secondary)] p-0.5 text-center text-xs font-medium text-white">
                            {count > 0 ? count : ""}
                          </td>
                        );
                      })}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Divider - mobile only */}
          <div className="lg:hidden border-t border-[var(--background-tertiary)]" />

          {/* Stats Table - Mobile (compressed) */}
          <div className="flex w-full flex-col overflow-x-auto rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-1.5 lg:hidden">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-[var(--foreground-muted)]">SORT:</span>
              <select value={statSort} onChange={(e) => setStatSort(e.target.value as typeof statSort)} className="px-1.5 py-0.5 text-[11px] bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded text-white">
                <option value="speed">SPE</option>
                <option value="hp">HP</option>
                <option value="attack">ATK</option>
                <option value="defense">DEF</option>
                <option value="specialAttack">SPA</option>
                <option value="specialDefense">SPD</option>
                <option value="baseStatTotal">BST</option>
              </select>
              <button onClick={() => setStatSortAsc(!statSortAsc)} className="text-[14px] text-[var(--foreground-muted)] hover:text-white transition-colors px-1">{statSortAsc ? "↑" : "↓"}</button>
            </div>
            <table className="w-full table-fixed text-[10px]" style={{ borderSpacing: "2px", borderCollapse: "separate" }}>
              <thead>
                <tr className="text-[var(--foreground-muted)]">
                  <th className="text-left px-1 py-1.5 font-normal bg-[var(--background-secondary)] rounded w-7"></th>
                  <th className={`text-center px-1 py-1.5 rounded ${statSort === "hp" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>HP</th>
                  <th className={`text-center px-1 py-1.5 rounded ${statSort === "attack" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>ATK</th>
                  <th className={`text-center px-1 py-1.5 rounded ${statSort === "defense" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>DEF</th>
                  <th className={`text-center px-1 py-1.5 rounded ${statSort === "specialAttack" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPA</th>
                  <th className={`text-center px-1 py-1.5 rounded ${statSort === "specialDefense" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPD</th>
                  <th className={`text-center px-1 py-1.5 rounded ${statSort === "speed" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPE</th>
                  <th className={`text-center px-1 py-1.5 rounded ${statSort === "baseStatTotal" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>BST</th>
                </tr>
              </thead>
              <tbody>
                {sortedForStats.map((p, idx) => (
                  <tr key={idx}>
                    <td className="px-0.5 py-1 text-white bg-[var(--background-tertiary)] rounded w-7">
                      <OptimizedPlannerImage src={p.spriteUrl} alt={getPokemonLabel(p, friendlyMegaNames)} title={getPokemonLabel(p, friendlyMegaNames)} width={20} height={20} className="w-5 h-5 object-contain" />
                    </td>
                    <td className={`text-center px-1 py-1.5 rounded ${statSort === "hp" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.hp}</td>
                    <td className={`text-center px-1 py-1.5 rounded ${statSort === "attack" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.attack}</td>
                    <td className={`text-center px-1 py-1.5 rounded ${statSort === "defense" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.defense}</td>
                    <td className={`text-center px-1 py-1.5 rounded ${statSort === "specialAttack" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.specialAttack}</td>
                    <td className={`text-center px-1 py-1.5 rounded ${statSort === "specialDefense" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.specialDefense}</td>
                    <td className={`text-center px-1 py-1.5 rounded ${statSort === "speed" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.speed}</td>
                    <td className={`text-center px-1 py-1.5 rounded ${statSort === "baseStatTotal" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.baseStatTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {roster.length > 0 && (
              <table className="mt-2 w-full table-fixed border-t border-[var(--background-tertiary)] pt-2 text-[10px]" style={{ borderSpacing: "2px", borderCollapse: "separate" }}>
                <tbody>
                  <tr>
                    <td className="w-7 rounded bg-[var(--background-secondary)] px-0.5 py-1.5 text-[10px] text-[var(--foreground-muted)]">Avg</td>
                    <td className="text-center text-[var(--foreground-muted)] px-1 py-1.5 bg-[var(--background-secondary)] rounded">{avgStats.hp}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-1 py-1.5 bg-[var(--background-secondary)] rounded">{avgStats.attack}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-1 py-1.5 bg-[var(--background-secondary)] rounded">{avgStats.defense}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-1 py-1.5 bg-[var(--background-secondary)] rounded">{avgStats.specialAttack}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-1 py-1.5 bg-[var(--background-secondary)] rounded">{avgStats.specialDefense}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-1 py-1.5 bg-[var(--background-secondary)] rounded">{avgStats.speed}</td>
                    <td className="text-center text-white px-1 py-1.5 bg-[var(--background-secondary)] rounded">{avgStats.baseStatTotal}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Stats Table - Desktop - 30% of row */}
          <div className="hidden flex-col overflow-x-auto rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-1.5 lg:flex lg:min-h-[280px] lg:min-w-0 lg:flex-[3]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-[var(--foreground-muted)]">SORT:</span>
              <select value={statSort} onChange={(e) => setStatSort(e.target.value as typeof statSort)} className="rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-1.5 py-0.5 text-xs text-white">
                <option value="speed">SPE</option>
                <option value="hp">HP</option>
                <option value="attack">ATK</option>
                <option value="defense">DEF</option>
                <option value="specialAttack">SPA</option>
                <option value="specialDefense">SPD</option>
                <option value="baseStatTotal">BST</option>
              </select>
              <button onClick={() => setStatSortAsc(!statSortAsc)} className="px-1 text-sm text-[var(--foreground-muted)] transition-colors hover:text-white">{statSortAsc ? "↑" : "↓"}</button>
            </div>
            <table className="w-full min-w-[380px] table-fixed text-[11px]" style={{ borderSpacing: "1px", borderCollapse: "separate" }}>
              <colgroup>
                <col style={{ width: "30%" }} />
                <col /><col /><col /><col /><col /><col /><col />
              </colgroup>
              <thead>
                <tr className="text-[var(--foreground-muted)]">
                  <th className="text-left px-1 py-1 font-normal bg-[var(--background-secondary)] rounded truncate">Pokemon</th>
                  <th className={`text-center px-0.5 py-1 rounded ${statSort === "hp" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>HP</th>
                  <th className={`text-center px-0.5 py-1 rounded ${statSort === "attack" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>ATK</th>
                  <th className={`text-center px-0.5 py-1 rounded ${statSort === "defense" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>DEF</th>
                  <th className={`text-center px-0.5 py-1 rounded ${statSort === "specialAttack" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPA</th>
                  <th className={`text-center px-0.5 py-1 rounded ${statSort === "specialDefense" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPD</th>
                  <th className={`text-center px-0.5 py-1 rounded ${statSort === "speed" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPE</th>
                  <th className={`text-center px-0.5 py-1 rounded ${statSort === "baseStatTotal" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>BST</th>
                </tr>
              </thead>
              <tbody>
                {sortedForStats.map((p, idx) => (
                  <tr key={idx}>
                    <td className="px-1 py-1 text-white bg-[var(--background-tertiary)] rounded truncate">{getPokemonLabel(p, friendlyMegaNames)}</td>
                    <td className={`text-center px-0.5 py-1 rounded ${statSort === "hp" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.hp}</td>
                    <td className={`text-center px-0.5 py-1 rounded ${statSort === "attack" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.attack}</td>
                    <td className={`text-center px-0.5 py-1 rounded ${statSort === "defense" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.defense}</td>
                    <td className={`text-center px-0.5 py-1 rounded ${statSort === "specialAttack" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.specialAttack}</td>
                    <td className={`text-center px-0.5 py-1 rounded ${statSort === "specialDefense" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.specialDefense}</td>
                    <td className={`text-center px-0.5 py-1 rounded ${statSort === "speed" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.speed}</td>
                    <td className={`text-center px-0.5 py-1 rounded ${statSort === "baseStatTotal" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.baseStatTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {roster.length > 0 && (
              <table className="mt-auto w-full min-w-[380px] table-fixed pt-1.5 text-[11px]" style={{ borderSpacing: "1px", borderCollapse: "separate" }}>
                <colgroup>
                  <col style={{ width: "30%" }} />
                  <col /><col /><col /><col /><col /><col /><col />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="px-1 py-1 text-[var(--foreground-muted)] bg-[var(--background-secondary)] rounded">Avg</td>
                    <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded">{avgStats.hp}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded">{avgStats.attack}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded">{avgStats.defense}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded">{avgStats.specialAttack}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded">{avgStats.specialDefense}</td>
                    <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded">{avgStats.speed}</td>
                    <td className="text-center text-white px-0.5 py-1 bg-[var(--background-secondary)] rounded">{avgStats.baseStatTotal}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Move Coverage - uses relative/absolute on desktop to control panel height */}
          <div className="min-h-[260px] w-full overflow-hidden rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] lg:relative lg:h-auto lg:min-h-[280px] lg:min-w-0 lg:flex-[2.5]">
            {/* Mobile: normal flow */}
            <div className="lg:hidden p-1.5 flex flex-col">
              {/* Search/Add Move */}
              <div className="relative mb-1.5">
                <input
                  type="text"
                  placeholder="Search to add move..."
                  value={moveSearch}
                  onChange={(e) => {
                    setMoveSearch(e.target.value);
                    setShowMoveDropdown(true);
                  }}
                  onFocus={() => setShowMoveDropdown(true)}
                  onBlur={() => setTimeout(() => setShowMoveDropdown(false), 150)}
                  className="draft-control w-full px-2 py-1 text-[11px] bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded text-white placeholder-[var(--foreground-subtle)]"
                />
                {showMoveDropdown && filteredMoves.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded shadow-lg max-h-48 overflow-y-auto">
                    {filteredMoves.map((move) => {
                      const moveType = moveTypes[move];
                      return (
                        <button
                          key={move}
                          type="button"
                          onMouseDown={() => addMove(move)}
                          className="w-full px-2 py-1.5 text-left text-[11px] hover:bg-[var(--background-tertiary)] flex items-center gap-2"
                        >
                          {moveType && (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: TYPE_COLORS[moveType] }}
                            />
                          )}
                          <span className="text-white capitalize">{move.replace(/-/g, " ")}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Move List - Mobile */}
              <div className="max-h-[52dvh] overflow-y-auto" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1px" }}>
                {moveCoverage.map(({ move, pokemon }) => {
                  const moveType = moveTypes[move];
                  return (
                    <div key={move} className="flex text-[10px]">
                      <span
                        className="w-[38%] shrink-0 px-1 py-1 flex items-center justify-center text-white font-medium capitalize truncate rounded"
                        style={{ backgroundColor: moveType ? TYPE_COLORS[moveType] : "var(--background-tertiary)" }}
                      >
                        {move.replace(/-/g, " ")}
                      </span>
                      <div className="flex flex-wrap gap-0.5 flex-1 items-center content-center bg-[var(--background-tertiary)] px-1 py-1 rounded-l">
                        {pokemon.length > 0 ? pokemon.map((p) => (
                          <OptimizedPlannerImage key={p.pokemonId} src={p.spriteUrl} alt={getPokemonLabel(p, friendlyMegaNames)} title={getPokemonLabel(p, friendlyMegaNames)} width={20} height={20} className="w-5 h-5 object-contain scale-110" />
                        )) : <span className="text-[var(--foreground-subtle)]">—</span>}
                      </div>
                      <button type="button" onClick={() => removeMove(move)} className="w-5 flex items-center justify-center text-[var(--foreground-muted)] hover:text-[var(--error)] bg-[var(--background-tertiary)] rounded-r transition-colors shrink-0" title="Remove move">
                        <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Desktop: absolute positioned to fill parent height without affecting it */}
            <div className="hidden lg:flex lg:absolute lg:inset-0 p-1.5 flex-col">
              {/* Search/Add Move */}
              <div className="relative mb-1.5 shrink-0">
                <input
                  type="text"
                  placeholder="Search to add move..."
                  value={moveSearch}
                  onChange={(e) => {
                    setMoveSearch(e.target.value);
                    setShowMoveDropdown(true);
                  }}
                  onFocus={() => setShowMoveDropdown(true)}
                  onBlur={() => setTimeout(() => setShowMoveDropdown(false), 150)}
                  className="draft-control w-full rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1 text-xs text-white placeholder-[var(--foreground-subtle)]"
                />
                {showMoveDropdown && filteredMoves.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded shadow-lg max-h-48 overflow-y-auto">
                    {filteredMoves.map((move) => {
                      const moveType = moveTypes[move];
                      return (
                        <button
                          key={move}
                          type="button"
                          onMouseDown={() => addMove(move)}
                          className="w-full px-2 py-1.5 text-left text-[11px] hover:bg-[var(--background-tertiary)] flex items-center gap-2"
                        >
                          {moveType && (
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[moveType] }} />
                          )}
                          <span className="text-white capitalize">{move.replace(/-/g, " ")}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Move List - Desktop scrollable */}
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1px", alignContent: "start" }}>
                {moveCoverage.map(({ move, pokemon }) => {
                  const moveType = moveTypes[move];
                  return (
                    <div key={move} className="flex text-[11px]">
                      <span
                        className="w-[42%] shrink-0 px-1 py-1 flex items-center justify-center text-white font-medium capitalize truncate rounded"
                        style={{ backgroundColor: moveType ? TYPE_COLORS[moveType] : "var(--background-tertiary)" }}
                      >
                        {move.replace(/-/g, " ")}
                      </span>
                      <div className="flex flex-wrap gap-0.5 flex-1 items-center content-center bg-[var(--background-tertiary)] px-1 py-1 rounded-l">
                        {pokemon.length > 0 ? pokemon.map((p) => (
                          <OptimizedPlannerImage
                            key={p.pokemonId}
                            src={p.spriteUrl}
                            alt={getPokemonLabel(p, friendlyMegaNames)}
                            title={getPokemonLabel(p, friendlyMegaNames)}
                            width={24}
                            height={24}
                            className="h-5 w-5 object-contain scale-110"
                          />
                        )) : <span className="text-[var(--foreground-subtle)]">—</span>}
                      </div>
                      <button type="button" onClick={() => removeMove(move)} className="w-4 flex items-center justify-center text-[var(--foreground-muted)] hover:text-[var(--error)] bg-[var(--background-tertiary)] rounded-r transition-colors shrink-0" title="Remove move">
                        <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
            )}
          </div>
        </div>
        </section>
        )}
      </div>
    </div>
    </div>
  );
}
