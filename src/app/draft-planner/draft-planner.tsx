"use client";

import { useState, useMemo, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Filter, Search, Share2, Star, X } from "lucide-react";
import { PokemonAutocomplete, findPokemonMatch } from "@/components/admin/pokemon-autocomplete";

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
}

interface Season {
  id: number;
  name: string;
  draftBudget: number | null;
}

interface Props {
  coach: { id: number; name: string } | null;
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

type DraftRole = "hazards" | "removal" | "pivot" | "setup" | "status" | "priority" | "knock";
const PLANNER_SLOT_COUNT = 11;
const CHECKLIST_DRAFT_ROLES = ["hazards", "removal", "pivot", "priority"] as const satisfies readonly DraftRole[];
const CHECKLIST_DRAFT_ROLE_SET = new Set<DraftRole>(CHECKLIST_DRAFT_ROLES);
type StatFocus = "none" | "price" | "hp" | "attack" | "defense" | "specialAttack" | "specialDefense" | "speed" | "baseStatTotal";

interface CandidatePokemon extends SimplePokemon {
  price: number;
  teraCaptainCost: number | null;
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
  if (hasAnyMove(pokemon, ["stealth-rock", "spikes", "toxic-spikes", "sticky-web"])) roles.push("hazards");
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
    hazards: "Hazards",
    removal: "Removal",
    pivot: "Pivot",
    setup: "Setup",
    status: "Status",
    priority: "Priority",
    knock: "Knock",
  };
  return labels[role];
}

export function DraftPlanner({
  coach,
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
  const [selectedType, setSelectedType] = useState("all");
  const [statFocus, setStatFocus] = useState<StatFocus>("none");
  const [statFocusAsc, setStatFocusAsc] = useState(false);
  const [maxPrice, setMaxPrice] = useState(20);
  const [minSpeed, setMinSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(160);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [fitOnly, setFitOnly] = useState(false);
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const [showNeedsPanel, setShowNeedsPanel] = useState(true);
  const [showDraftBoard, setShowDraftBoard] = useState(true);
  const [showComparePanel, setShowComparePanel] = useState(true);
  const [showNotesPanel, setShowNotesPanel] = useState(true);
  const [showTeamAnalyzer, setShowTeamAnalyzer] = useState(true);
  const [expandedAbility, setExpandedAbility] = useState<{ slotIdx: number; abilityIdx: number } | null>(null);
  const [trackedMoves, setTrackedMoves] = useState([
    "stealth-rock", "spikes", "toxic-spikes", "sticky-web",
    "nasty-plot", "swords-dance", "volt-switch", "u-turn", "flip-turn",
    "defog", "rapid-spin", "toxic", "will-o-wisp", "thunder-wave", "taunt", "knock-off"
  ]);
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

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
      if (savedWatchlist) setWatchlist(JSON.parse(savedWatchlist));
      if (savedNotes) setNotes(JSON.parse(savedNotes));
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

  // Save preferences
  const savePreferences = async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "draft-planner",
          preferences: {
            statSort,
            statSortAsc,
            trackedMoves,
          },
        }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("idle");
      }
    } catch {
      setSaveStatus("idle");
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
          pokemonName: p.displayName,
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
    if (!pokemonId) {
      newSlots[index] = { pokemonId: null, pokemonName: "", isTeraCaptain: false, price: 0, teraCaptainCost: null, pokemon: null };
    } else {
      // Check if this Pokemon is already on the team (from original roster)
      const originalRoster = initialRoster.find(r => r.pokemonId === pokemonId);

      // Build Pokemon data from allPokemon
      const pData = allPokemon.find(p => p.id === pokemonId);

      // Get price from season prices, fallback to original roster price, then 0
      const priceInfo = seasonPrices[pokemonId];
      const price = originalRoster?.price ?? priceInfo?.price ?? 0;
      const teraCaptainCost = priceInfo?.teraCaptainCost ?? null;

      newSlots[index] = {
        pokemonId,
        pokemonName: name,
        isTeraCaptain: false,
        price,
        teraCaptainCost,
        pokemon: originalRoster || (pData ? {
          rosterId: 0,
          pokemonId: pData.id,
          name: pData.name,
          displayName: pData.displayName || pData.name,
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
    }
    setSlots(newSlots);
  }

  function handleMultiLinePaste(startIndex: number, lines: string[]) {
    setSlots(prevSlots => {
      const newSlots = [...prevSlots];
      for (let i = 0; i < lines.length && startIndex + i < PLANNER_SLOT_COUNT; i++) {
        const line = lines[i].trim();
        const match = findPokemonMatch(line, allPokemon);
        const slotIdx = startIndex + i;

        if (match) {
          const originalRoster = initialRoster.find(r => r.pokemonId === match.id);
          const pData = allPokemon.find(p => p.id === match.id);

          // Get price from season prices, fallback to original roster price, then 0
          const priceInfo = seasonPrices[match.id];
          const price = originalRoster?.price ?? priceInfo?.price ?? 0;
          const teraCaptainCost = priceInfo?.teraCaptainCost ?? null;

          newSlots[slotIdx] = {
            pokemonId: match.id,
            pokemonName: match.displayName || match.name,
            isTeraCaptain: false,
            price,
            teraCaptainCost,
            pokemon: originalRoster || (pData ? {
              rosterId: 0,
              pokemonId: pData.id,
              name: pData.name,
              displayName: pData.displayName || pData.name,
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
        } else {
          newSlots[slotIdx] = { pokemonId: null, pokemonName: line, isTeraCaptain: false, price: 0, teraCaptainCost: null, pokemon: null };
        }
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

  const teamRoles = useMemo(() => new Set(roster.flatMap((p) => getDraftRoles(p))), [roster]);

  const draftNeeds = useMemo(() => {
    const needs: { label: string; met: boolean }[] = [
      { label: "Hazard Setter", met: teamRoles.has("hazards") },
      { label: "Hazard Removal", met: teamRoles.has("removal") },
      { label: "Pivoting", met: teamRoles.has("pivot") },
      { label: "Priority", met: teamRoles.has("priority") },
    ];

    const weakTypes = ALL_TYPES.filter((type) => {
      const overall = typeChart[type]?.overall;
      return overall === "weak" || overall === "very_weak";
    }).slice(0, 4);

    return {
      roleNeeds: needs,
      missingRoles: needs.filter((need) => !need.met),
      weakTypes,
    };
  }, [teamRoles, typeChart]);

  const candidates = useMemo<CandidatePokemon[]>(() => {
    return allPokemon.map((p) => {
      const priceInfo = seasonPrices[p.id];
      const price = priceInfo?.price ?? 0;
      const roles = getDraftRoles(p);
      const fitTags: string[] = [];
      let fitScore = 0;

      for (const role of roles) {
        if (!CHECKLIST_DRAFT_ROLE_SET.has(role)) continue;
        if (!teamRoles.has(role)) {
          fitScore += 12;
          fitTags.push(`Fills ${formatRole(role)}`);
        }
      }

      for (const type of p.types || []) {
        if (draftNeeds.weakTypes.includes(type.toLowerCase())) {
          fitScore += 8;
        }
      }

      if ((p.speed || 0) >= 100 && avgStats.speed < 90) {
        fitScore += 8;
      }

      if (price > 0 && openSlots > 0 && price <= Math.max(1, avgRemainingPerSlot)) {
        fitScore += 6;
      }

      if (price > 0 && (p.baseStatTotal || 0) / price >= 55) {
        fitScore += 5;
      }

      return {
        ...p,
        price,
        teraCaptainCost: priceInfo?.teraCaptainCost ?? null,
        roles,
        fitScore,
        fitTags: Array.from(new Set(fitTags)).slice(0, 4),
      };
    });
  }, [allPokemon, avgRemainingPerSlot, avgStats.speed, draftNeeds.weakTypes, openSlots, seasonPrices, teamRoles]);

  const filteredCandidates = useMemo(() => {
    const search = candidateSearch.trim().toLowerCase();
    return candidates
      .filter((p) => p.price >= 1)
      .filter((p) => !availableOnly || !plannedPokemonIds.has(p.id))
      .filter((p) => !fitOnly || p.fitScore > 0)
      .filter((p) => selectedType === "all" || (p.types || []).map((type) => type.toLowerCase()).includes(selectedType))
      .filter((p) => p.price <= maxPrice)
      .filter((p) => (p.speed || 0) >= minSpeed)
      .filter((p) => (p.speed || 0) <= maxSpeed)
      .filter((p) => !search || (p.displayName || p.name).toLowerCase().includes(search) || p.name.toLowerCase().includes(search))
      .sort((a, b) => {
        if (watchlist.includes(a.id) !== watchlist.includes(b.id)) return watchlist.includes(a.id) ? -1 : 1;
        if (statFocus !== "none" && b[statFocus] !== a[statFocus]) {
          const statCompare = (b[statFocus] || 0) - (a[statFocus] || 0);
          return statFocusAsc ? -statCompare : statCompare;
        }
        if (b.price !== a.price) return b.price - a.price;
        if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
        return (a.displayName || a.name).localeCompare(b.displayName || b.name);
      });
  }, [availableOnly, candidateSearch, candidates, fitOnly, maxPrice, maxSpeed, minSpeed, plannedPokemonIds, selectedType, statFocus, statFocusAsc, watchlist]);

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

  function addCandidateToNextSlot(candidate: CandidatePokemon) {
    const nextOpenSlot = slots.findIndex((slot) => !slot.pokemonId);
    if (nextOpenSlot === -1) return;
    handleSlotChange(nextOpenSlot, candidate.id, candidate.displayName || candidate.name);
  }

  function toggleWatchlist(pokemonId: number) {
    setWatchlist((current) =>
      current.includes(pokemonId)
        ? current.filter((id) => id !== pokemonId)
        : [pokemonId, ...current]
    );
  }

  function toggleCompare(pokemonId: number) {
    setCompareIds((current) => {
      if (current.includes(pokemonId)) return current.filter((id) => id !== pokemonId);
      return [...current, pokemonId].slice(-4);
    });
  }

  async function copyDraftPlan() {
    const rosterLines = slots
      .filter((slot) => slot.pokemon)
      .map((slot, index) => `${index + 1}. ${slot.pokemon!.displayName} - ${slot.price} pts${slot.isTeraCaptain ? " (TC)" : ""}`);
    const watchLines = watchlist
      .map((id) => candidates.find((p) => p.id === id))
      .filter((p): p is CandidatePokemon => Boolean(p))
      .map((p) => `- ${p.displayName || p.name} (${p.price} pts): ${notes[p.id] || p.fitTags.join(", ")}`);

    const text = [
      `${teamName || "Draft Plan"} (${totalSpent}/${draftBudget} pts)`,
      "",
      "Roster",
      rosterLines.length ? rosterLines.join("\n") : "No Pokemon selected",
      "",
      "Watchlist",
      watchLines.length ? watchLines.join("\n") : "No watchlist picks",
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setShareStatus("copied");
    setTimeout(() => setShareStatus("idle"), 1800);
  }

  function renderTeamRosterPanel() {
    return (
      <div className="flex min-h-0 flex-col overflow-visible rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] lg:h-full lg:overflow-hidden">
        <div className="border-b border-[var(--background-tertiary)] bg-[var(--card)] p-2">
          <h3 className="font-bold text-sm">Team Roster</h3>
          <p className="text-[11px] text-[var(--foreground-muted)]">Edit picks while drafting</p>
        </div>
        <div className="max-h-[52dvh] overflow-y-auto p-1.5 lg:max-h-none lg:flex-1">
          <div>
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-1 rounded px-1 py-px">
                <span className="w-4 text-right text-xs text-[var(--foreground-muted)]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <PokemonAutocomplete
                    value={slot.pokemonName}
                    pokemonId={slot.pokemonId}
                    allPokemon={allPokemon}
                    onChange={(id, name) => handleSlotChange(i, id, name)}
                    onMultiLinePaste={(lines) => handleMultiLinePaste(i, lines)}
                    hasWarning={!slot.pokemonId && slot.pokemonName !== ""}
                    warningText={!slot.pokemonId && slot.pokemonName ? `No match` : ""}
                    placeholder="Type Pokemon name..."
                  />
                </div>
                <span className="w-8 text-right text-xs text-[var(--foreground-muted)]">
                  {slot.price > 0 ? slot.price : ""}
                </span>
                <button
                  type="button"
                  onClick={() => handleSlotChange(i, null, "")}
                  disabled={!slot.pokemonId && !slot.pokemonName}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--background-secondary)] text-orange-400 transition-colors hover:bg-[var(--background-tertiary)] hover:text-[var(--error)] disabled:cursor-not-allowed disabled:opacity-30"
                  title="Remove Pokemon"
                  aria-label={`Remove Pokemon from slot ${i + 1}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-[var(--background-tertiary)] bg-[var(--card)] p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-[var(--foreground-muted)]">Budget:</span>
            <span className="font-mono text-sm">{draftBudget} pts</span>
          </div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-[var(--foreground-muted)]">Spent:</span>
            <span className="font-mono text-sm text-[var(--error)]">{totalSpent} pts</span>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--background-tertiary)] pt-1">
            <span className="text-sm font-medium">Remaining:</span>
            <span className={`font-mono font-bold ${remainingBudget >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
              {remainingBudget} pts
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[calc(100dvh-16px)] overflow-y-auto"
      style={{
        width: '100vw',
        position: 'relative',
        left: '50%',
        marginLeft: '-50vw',
      }}
    >
      <div className="poke-card mx-2 mt-2 flex min-h-[calc(100dvh-1rem)] flex-col overflow-visible p-2 sm:mx-4 sm:p-3">
        {/* Header */}
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2 border-b border-[var(--background-tertiary)] pb-2">
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
            <OptimizedPlannerImage src={teamLogo} alt="" width={32} height={32} className="h-7 w-7 shrink-0 object-contain sm:h-8 sm:w-8" />
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
          {/* Save button - desktop only */}
          <button
            onClick={savePreferences}
            disabled={saveStatus === "saving"}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--background-tertiary)] hover:bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-white rounded transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save Defaults"}
          </button>
        </div>

        <div className="mb-2 shrink-0 rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-1.5">
          <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
            <Eye className="h-3.5 w-3.5" />
            Panel Toggles
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
            {[
              { label: "Needs", enabled: showNeedsPanel, onClick: () => setShowNeedsPanel(!showNeedsPanel) },
              { label: "Draft Board", enabled: showDraftBoard, onClick: () => setShowDraftBoard(!showDraftBoard) },
              { label: "Compare", enabled: showComparePanel, onClick: () => setShowComparePanel(!showComparePanel) },
              { label: "Notes", enabled: showNotesPanel, onClick: () => setShowNotesPanel(!showNotesPanel) },
              { label: "Analyzer", enabled: showTeamAnalyzer, onClick: () => setShowTeamAnalyzer(!showTeamAnalyzer) },
            ].map((toggle) => (
              <button
                key={toggle.label}
                type="button"
                aria-pressed={toggle.enabled}
                onClick={toggle.onClick}
                className={`inline-flex min-w-0 items-center justify-between gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors sm:justify-start sm:text-xs ${
                  toggle.enabled
                    ? "border-[var(--primary)]/40 bg-[var(--primary)]/15 text-white"
                    : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)]"
                }`}
              >
                <span className="min-w-0 truncate">{toggle.label}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${
                  toggle.enabled
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-[var(--background)] text-[var(--foreground-subtle)]"
                }`}>
                  {toggle.enabled ? "On" : "Off"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-1.5 overflow-visible lg:flex-1 lg:overflow-y-auto lg:pr-1">
        {/* Draft board and roster workspace */}
        {showDraftBoard && (
        <div className={`min-h-0 grid grid-cols-1 gap-1.5 overflow-visible lg:overflow-hidden ${showTeamAnalyzer ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
          <div className="flex min-h-0 min-w-0 flex-col overflow-visible rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] lg:overflow-hidden">
          {showNeedsPanel && (
          <div className="shrink-0 border-b border-[var(--background-tertiary)] bg-[var(--card)] p-1.5">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white">Draft Needs</h2>
                <p className="text-xs text-[var(--foreground-muted)]">Budget, roles, and roster gaps</p>
              </div>
              <button
                type="button"
                onClick={copyDraftPlan}
                className="flex items-center gap-1.5 rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2.5 py-1.5 text-xs font-bold text-[var(--foreground-muted)] transition-colors hover:text-white"
              >
                <Share2 className="h-3.5 w-3.5" />
                {shareStatus === "copied" ? "Copied" : "Copy Plan"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <div className="rounded-md bg-[var(--background-secondary)] p-1.5">
                <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-subtle)]">Remaining</p>
                <p className={`font-mono text-base font-bold ${remainingBudget >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}`}>{remainingBudget}</p>
              </div>
              <div className="rounded-md bg-[var(--background-secondary)] p-1.5">
                <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-subtle)]">Open Slots</p>
                <p className="font-mono text-base font-bold text-white">{openSlots}</p>
              </div>
              <div className="rounded-md bg-[var(--background-secondary)] p-1.5">
                <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-subtle)]">Avg Slot</p>
                <p className="font-mono text-base font-bold text-[var(--accent)]">{openSlots > 0 ? avgRemainingPerSlot : "-"}</p>
              </div>
              <div className="rounded-md bg-[var(--background-secondary)] p-1.5">
                <p className="text-[10px] uppercase tracking-wide text-[var(--foreground-subtle)]">Watchlist</p>
                <p className="font-mono text-base font-bold text-white">{watchlist.length}</p>
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              <div className="rounded-md border border-[var(--background-tertiary)] p-1.5">
                <p className="mb-1 text-xs font-bold text-white">Role Checklist</p>
                <div className="flex flex-wrap gap-1.5">
                  {draftNeeds.roleNeeds.map((need) => (
                    <span
                      key={need.label}
                      className={`rounded px-2 py-1 text-[10px] font-bold ${need.met ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}
                    >
                      {need.met ? "✓" : "+"} {need.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-[var(--background-tertiary)] p-1.5">
                <p className="mb-1 text-xs font-bold text-white">Weaknesses</p>
                <div className="flex flex-wrap gap-1.5">
                  {draftNeeds.weakTypes.length > 0 ? draftNeeds.weakTypes.map((type) => (
                    <span
                      key={type}
                      className="rounded px-2 py-1 text-[10px] font-bold text-white"
                      style={{ backgroundColor: TYPE_COLORS[type] }}
                    >
                      {formatTypeName(type)}
                    </span>
                  )) : (
                    <span className="text-xs text-[var(--foreground-muted)]">No major weaknesses yet</span>
                  )}
                  {draftNeeds.missingRoles.length === 0 && (
                    <span className="rounded bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300">Core roles covered</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          {showDraftBoard && (
          <div className="flex min-h-0 flex-col bg-[var(--card)] p-1.5 lg:flex-1">
            <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white">Draft Board</h2>
                <p className="text-xs text-[var(--foreground-muted)]">Filter, compare, watchlist, and add picks</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                <Filter className="h-3.5 w-3.5" />
                {filteredCandidates.length} shown
              </div>
            </div>

            <div className="mb-1.5 grid shrink-0 grid-cols-1 gap-1.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="relative md:col-span-2 xl:col-span-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--foreground-subtle)]" />
                <input
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  placeholder="Search Pokemon"
                  className="w-full rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] py-1.5 pl-7 pr-2 text-sm text-white placeholder:text-[var(--foreground-subtle)]"
                />
              </label>
              <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1.5 text-sm text-white">
                <option value="all">All types</option>
                {ALL_TYPES.map((type) => <option key={type} value={type}>{formatTypeName(type)}</option>)}
              </select>
              <select value={statFocus} onChange={(e) => setStatFocus(e.target.value as StatFocus)} className="rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1.5 text-sm text-white">
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
                className="rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1.5 text-sm font-bold text-[var(--foreground-muted)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Toggle stat focus sort direction"
              >
                {statFocusAsc ? "Asc" : "Desc"}
              </button>
            </div>

            <div className="mb-1.5 grid shrink-0 grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-5">
              <label className="rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-1.5">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">Max Price: {maxPrice}</span>
                <input type="range" min="0" max="20" value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full" />
              </label>
              <label className="rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-1.5">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">Min Speed: {minSpeed}</span>
                <input type="range" min="0" max="160" step="5" value={minSpeed} onChange={(e) => setMinSpeed(Math.min(Number(e.target.value), maxSpeed))} className="w-full" />
              </label>
              <label className="rounded-md border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-1.5">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">Max Speed: {maxSpeed}</span>
                <input type="range" min="0" max="160" step="5" value={maxSpeed} onChange={(e) => setMaxSpeed(Math.max(Number(e.target.value), minSpeed))} className="w-full" />
              </label>
              <button type="button" onClick={() => setAvailableOnly(!availableOnly)} className={`flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-bold transition-colors ${availableOnly ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)]"}`}>
                {availableOnly ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                Available only
              </button>
              <button type="button" onClick={() => setFitOnly(!fitOnly)} className={`flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-bold transition-colors ${fitOnly ? "border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]" : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)]"}`}>
                <Star className="h-4 w-4" />
                Fits team
              </button>
            </div>

            {showComparePanel && comparePokemon.length > 0 && (
              <div className="mb-2 shrink-0 overflow-x-auto rounded-md border border-[var(--background-tertiary)]">
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="bg-[var(--background-secondary)] text-[var(--foreground-muted)]">
                      <th className="px-2 py-2 text-left">Compare</th>
                      {comparePokemon.map((p) => (
                        <th key={p.id} className="px-2 py-2 text-left">
                          <button type="button" onClick={() => toggleCompare(p.id)} className="flex items-center gap-1 text-white">
                            {p.displayName || p.name}
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

            <div className="grid min-h-[260px] max-h-[52dvh] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:min-h-0 lg:flex-1 xl:grid-cols-3">
              {filteredCandidates.map((candidate) => {
                const isPlanned = plannedPokemonIds.has(candidate.id);
                const isWatched = watchlist.includes(candidate.id);
                const isCompared = compareIds.includes(candidate.id);
                return (
                  <div key={candidate.id} className={`min-w-0 rounded-lg border p-2 ${isPlanned ? "border-[var(--accent)]/50 bg-[var(--accent)]/10" : "border-[var(--background-tertiary)] bg-[var(--background-secondary)]"}`}>
                    <div className="mb-1.5 flex items-start gap-2">
                      <OptimizedPlannerImage src={candidate.spriteUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/pokemon/${candidate.id}`} className="break-words text-sm font-bold text-white hover:text-[var(--primary)]">
                            {candidate.displayName || candidate.name}
                          </Link>
                          <span className="shrink-0 rounded bg-[var(--background)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--accent)]">{candidate.price}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(candidate.types || []).map((type) => (
                            <span key={type} className={`type-badge type-${type.toLowerCase()} px-1 py-0 text-[10px]`}>{formatTypeName(type)}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {candidate.fitTags.length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1">
                        {candidate.fitTags.map((tag) => (
                          <span key={tag} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="mb-1.5 grid grid-cols-3 gap-1 text-center text-[10px]">
                      <div className="rounded bg-[var(--background)] p-1"><span className="block text-[var(--foreground-subtle)]">SPE</span><span className="font-bold text-white">{candidate.speed || 0}</span></div>
                      <div className="rounded bg-[var(--background)] p-1"><span className="block text-[var(--foreground-subtle)]">BST</span><span className="font-bold text-white">{candidate.baseStatTotal || 0}</span></div>
                      <div className="rounded bg-[var(--background)] p-1"><span className="block text-[var(--foreground-subtle)]">FIT</span><span className="font-bold text-white">{candidate.fitScore}</span></div>
                    </div>
                    {showNotesPanel && (
                      <textarea
                        value={notes[candidate.id] || ""}
                        onChange={(e) => setNotes((current) => ({ ...current, [candidate.id]: e.target.value }))}
                        placeholder="Watchlist notes"
                        className="mb-1.5 h-12 w-full resize-none rounded-md border border-[var(--background-tertiary)] bg-[var(--background)] px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-subtle)]"
                      />
                    )}
                    <div className="grid grid-cols-3 gap-1">
                      <button type="button" onClick={() => toggleWatchlist(candidate.id)} className={`min-w-0 rounded px-1.5 py-1.5 text-[11px] font-bold leading-tight transition-colors sm:px-2 sm:text-xs ${isWatched ? "bg-[var(--accent)] text-black" : "bg-[var(--background)] text-[var(--foreground-muted)] hover:text-white"}`}>
                        <span className="sm:hidden">{isWatched ? "Saved" : "Watch"}</span>
                        <span className="hidden sm:inline">{isWatched ? "Remove from Watchlist" : "Add to Watchlist"}</span>
                      </button>
                      <button type="button" onClick={() => toggleCompare(candidate.id)} className={`min-w-0 rounded px-1.5 py-1.5 text-[11px] font-bold leading-tight transition-colors sm:px-2 sm:text-xs ${isCompared ? "bg-sky-500/20 text-sky-200" : "bg-[var(--background)] text-[var(--foreground-muted)] hover:text-white"}`}>
                        Compare
                      </button>
                      <button type="button" disabled={openSlots === 0 || isPlanned} onClick={() => addCandidateToNextSlot(candidate)} className="min-w-0 rounded bg-[var(--primary)] px-1.5 py-1.5 text-[11px] font-bold leading-tight text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2 sm:text-xs">
                        Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
          </div>
          {showTeamAnalyzer && (
            <aside className="min-h-0 overflow-visible lg:overflow-hidden">
              {renderTeamRosterPanel()}
            </aside>
          )}
        </div>
        )}

        {/* Team analyzer */}
        {showTeamAnalyzer && (
        <section className="w-full shrink-0 overflow-visible rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] lg:overflow-hidden">
          <div className="border-b border-[var(--background-tertiary)] bg-[var(--card)] p-2">
            <h3 className="font-bold text-sm text-white">Team Analyzer</h3>
            <p className="text-[11px] text-[var(--foreground-muted)]">Type chart, stats, abilities, and move coverage</p>
          </div>
        <div className="flex min-h-0 flex-col overflow-visible p-1.5 lg:max-h-[72dvh] lg:overflow-hidden">
          <div className="overflow-visible pr-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {/* Sprite Overview - responsive grid on mobile, dynamic columns on desktop */}
            <div className="mb-1.5">
              {/* Mobile grid (hidden on lg+) */}
              {/* Click-away overlay to close tooltips */}
              {expandedAbility && (
                <div
                  className="fixed inset-0 z-40 lg:hidden"
                  onClick={() => setExpandedAbility(null)}
                />
              )}
              <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:hidden overflow-visible">
                {slots.filter(slot => slot.pokemon).map((slot, idx) => {
                  // Determine column position for tooltip alignment (0=left, 1=middle, 2=right for 3-col)
                  const col3 = idx % 3;
                  const tooltipAlign = col3 === 0 ? "left-0" : col3 === 2 ? "right-0" : "left-1/2 -translate-x-1/2";

                  return (
                    <div
                      key={idx}
                      className={`relative flex flex-col bg-[var(--card)] border rounded-lg p-2 overflow-visible ${
                        slot.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                      }`}
                    >
                      {/* Tera Captain Badge */}
                      {slot.isTeraCaptain && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] flex items-center justify-center z-10" title="Tera Captain">
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L2 12l10 10 10-10L12 2z" />
                          </svg>
                        </div>
                      )}
                      <OptimizedPlannerImage
                        src={slot.pokemon!.spriteUrl}
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 object-contain mx-auto scale-[1.4]"
                      />
                      <div className="text-xs text-white text-center font-medium mt-1 truncate">
                        {slot.pokemon!.displayName}
                      </div>
                      {/* Types - fixed height for consistency */}
                      <div className="flex gap-0.5 justify-center mt-1 flex-wrap min-h-[28px] items-start content-start">
                        {slot.pokemon!.types.map((t) => (
                          <span key={t} className={`type-badge type-${t.toLowerCase()} px-1 py-0 text-[10px]`}>{formatTypeName(t)}</span>
                        ))}
                      </div>
                      {/* Abilities with tap tooltips */}
                      <div className={`mt-1.5 pt-1.5 border-t overflow-visible ${
                        slot.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                      }`}>
                        {slot.pokemon!.abilities.map((a, abilityIdx) => {
                          const description = abilityDescriptions[a.name];
                          const isExpanded = expandedAbility?.slotIdx === idx && expandedAbility?.abilityIdx === abilityIdx;
                          return (
                            <div key={abilityIdx} className="relative overflow-visible">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedAbility(isExpanded ? null : { slotIdx: idx, abilityIdx });
                                }}
                                className={`w-full truncate py-0.5 text-center text-[10px] capitalize text-[var(--foreground-muted)] ${
                                  abilityIdx > 0 ? "border-t border-[var(--background-tertiary)]/50" : ""
                                } ${description ? "active:bg-[var(--background-tertiary)]" : ""}`}
                              >
                                {a.name.replace(/-/g, " ")}
                              </button>
                              {isExpanded && description && (
                                <div className={`absolute bottom-full ${tooltipAlign} mb-1 z-50 w-44`}>
                                  <div className="px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-tertiary)] shadow-lg">
                                    <p className="mb-0.5 text-[10px] font-bold capitalize text-white">{a.name.replace(/-/g, " ")}</p>
                                    <p className="text-[10px] text-[var(--foreground-muted)] leading-tight">{description}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop grid (hidden below lg) */}
              <div
                className="hidden gap-1.5 lg:grid"
                style={{ gridTemplateColumns: `repeat(${Math.min(slots.filter(s => s.pokemon).length || 1, 6)}, minmax(0, 1fr))` }}
              >
                {slots.filter(slot => slot.pokemon).map((slot, idx) => (
                  <div
                    key={idx}
                    className={`relative flex min-w-0 flex-col bg-[var(--card)] border rounded-lg ${
                      slot.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                    } p-1.5`}
                  >
                    {/* Tera Captain Badge */}
                    {slot.isTeraCaptain && (
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center z-10" title="Tera Captain">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2L2 12l10 10 10-10L12 2z" />
                        </svg>
                      </div>
                    )}
                    <OptimizedPlannerImage
                      src={slot.pokemon!.spriteUrl}
                      alt=""
                      width={46}
                      height={46}
                      className="mx-auto h-10 w-10 object-contain scale-125"
                    />
                    <div className="mt-0.5 min-w-0 truncate text-center text-xs font-medium text-white">
                      {slot.pokemon!.displayName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                      {slot.pokemon!.types.map((t) => (
                        <span key={t} className={`type-badge type-${t.toLowerCase()} px-1 py-0 text-[10px]`}>{formatTypeName(t)}</span>
                      ))}
                    </div>
                    <div className={`mt-1 min-w-0 border-t pt-1 ${
                      slot.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                    }`}>
                      {slot.pokemon!.abilities.map((a, abilityIdx) => {
                        const description = abilityDescriptions[a.name];
                        return (
                          <div
                            key={abilityIdx}
                            className={`relative group/tooltip ${
                              abilityIdx > 0 ? "border-t border-[var(--background-tertiary)]/50" : ""
                            }`}
                          >
                            <div className="min-w-0 cursor-help truncate py-0.5 text-center text-[10px] capitalize text-[var(--foreground-muted)]">
                              {a.name.replace(/-/g, " ")}
                            </div>
                            {description && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/tooltip:block z-50">
                                <div className="px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-tertiary)] shadow-lg w-48">
                                  <p className="mb-1 text-[10px] font-bold capitalize text-white">{a.name.replace(/-/g, " ")}</p>
                                  <p className="text-[10px] text-[var(--foreground-muted)]">{description}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider - mobile only */}
            <div className="lg:hidden border-t border-[var(--background-tertiary)] mb-2" />

            {/* Type Chart | Stats | Moves - stacked on mobile, side by side on desktop */}
            {roster.length > 0 && (
            <div className={`flex min-h-0 flex-col gap-2 transition-opacity duration-200 ${prefsLoaded ? "opacity-100" : "opacity-0"}`}>
          {/* Type Chart - Mobile (transposed: types as rows, Pokemon as columns) */}
          <div className="w-full overflow-x-auto rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-1.5 lg:hidden">
            <table className="w-full min-w-[560px] table-fixed text-[10px]" style={{ borderSpacing: "2px", borderCollapse: "separate" }}>
              <colgroup>
                <col style={{ width: "32px" }} />
                {roster.map((_, idx) => (
                  <col key={idx} />
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
                      <OptimizedPlannerImage src={p.spriteUrl} alt={p.displayName} title={p.displayName} width={20} height={20} className="w-5 h-5 object-contain mx-auto scale-[1.4]" />
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
          <div className="hidden overflow-x-auto rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-1.5 lg:block lg:min-h-0">
            <table className="w-full min-w-[620px] table-fixed text-[10px]" style={{ borderSpacing: "1px", borderCollapse: "separate" }}>
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
                        alt={p.displayName}
                        title={p.displayName}
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
            <table className="w-full min-w-[520px] text-[10px]" style={{ borderSpacing: "2px", borderCollapse: "separate" }}>
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
                      <OptimizedPlannerImage src={p.spriteUrl} alt={p.displayName} title={p.displayName} width={20} height={20} className="w-5 h-5 object-contain" />
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
              <table className="mt-2 w-full min-w-[520px] border-t border-[var(--background-tertiary)] pt-2 text-[10px]" style={{ borderSpacing: "2px", borderCollapse: "separate" }}>
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
          <div className="hidden flex-col overflow-x-auto rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] p-1.5 lg:flex lg:min-h-0">
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
            <table className="w-full min-w-[480px] table-fixed text-[11px]" style={{ borderSpacing: "1px", borderCollapse: "separate" }}>
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
                    <td className="px-1 py-1 text-white bg-[var(--background-tertiary)] rounded truncate">{p.displayName}</td>
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
              <table className="mt-auto w-full min-w-[480px] table-fixed pt-1.5 text-[11px]" style={{ borderSpacing: "1px", borderCollapse: "separate" }}>
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

          {/* Divider with Save button - mobile only */}
          <div className="lg:hidden flex items-center gap-3 py-2">
            <div className="flex-1 border-t border-[var(--background-tertiary)]" />
            <button
              onClick={savePreferences}
              disabled={saveStatus === "saving"}
              className="flex shrink-0 items-center gap-1.5 rounded bg-[var(--background-tertiary)] px-2 py-1.5 text-[11px] text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-secondary)] hover:text-white disabled:opacity-50 sm:px-3 sm:text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span className="sm:hidden">
                {saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved" : "Save"}
              </span>
              <span className="hidden sm:inline">
                {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved!" : "Save Defaults"}
              </span>
            </button>
            <div className="flex-1 border-t border-[var(--background-tertiary)]" />
          </div>

          {/* Move Coverage - uses relative/absolute on desktop to control panel height */}
          <div className="min-h-[260px] w-full overflow-hidden rounded-lg border border-[var(--background-tertiary)] bg-[var(--card)] lg:relative lg:h-56 lg:min-h-0">
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
                  className="w-full px-2 py-1 text-[11px] bg-[var(--background-secondary)] border border-[var(--background-tertiary)] rounded text-white placeholder-[var(--foreground-subtle)]"
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
                          <OptimizedPlannerImage key={p.pokemonId} src={p.spriteUrl} alt={p.displayName} title={p.displayName} width={20} height={20} className="w-5 h-5 object-contain scale-110" />
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
                  className="w-full rounded border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-2 py-1 text-xs text-white placeholder-[var(--foreground-subtle)]"
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
                            alt={p.displayName}
                            title={p.displayName}
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
