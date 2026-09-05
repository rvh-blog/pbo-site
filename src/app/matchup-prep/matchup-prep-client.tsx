"use client";

import { LeagueJourney } from "@/components/league-context";
import type { LeagueContext } from "@/lib/league-context";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { compareDivisions } from "@/lib/division-order";
import {
  applySpeedEffect,
  getActiveSpeedEffect,
  SPEED_CONDITION_OPTIONS,
  type SpeedCondition,
} from "@/lib/speed-tiers";

// Type effectiveness chart (attacking type -> defending type -> multiplier)
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

const TYPE_COLORS: Record<string, string> = {
  normal: "#A8A77A", fire: "#EE8130", water: "#6390F0", electric: "#F7D02C",
  grass: "#7AC74C", ice: "#96D9D6", fighting: "#C22E28", poison: "#A33EA1",
  ground: "#E2BF65", flying: "#A98FF3", psychic: "#F95587", bug: "#A6B91A",
  rock: "#B6A136", ghost: "#735797", dragon: "#6F35FC", dark: "#705746",
  steel: "#B7B7CE", fairy: "#D685AD",
};

// Abilities that grant immunities
const IMMUNITY_ABILITIES: Record<string, string> = {
  levitate: "ground", "earth-eater": "ground", eelevate: "ground",
  "volt-absorb": "electric", "lightning-rod": "electric", "motor-drive": "electric",
  "water-absorb": "water", "storm-drain": "water", "dry-skin": "water",
  "flash-fire": "fire", "well-baked-body": "fire",
  "sap-sipper": "grass",
};

const RESISTANCE_ABILITIES: Record<string, string[]> = {
  "thick-fat": ["fire", "ice"],
  heatproof: ["fire"],
  "water-bubble": ["fire"],
  "purifying-salt": ["ghost"],
};

const WEAKNESS_ABILITIES: Record<string, { type: string; multiplier: number }> = {
  "dry-skin": { type: "fire", multiplier: 1.25 },
  fluffy: { type: "fire", multiplier: 2 },
};

// Move categories for matchup analysis (using database format: lowercase with hyphens)
const MOVE_CATEGORIES: { category: string; moves: string[] }[] = [
  { category: "Hazards", moves: ["stealth-rock", "spikes", "toxic-spikes", "sticky-web", "ceaseless-edge", "stone-axe"] },
  { category: "Removal", moves: ["rapid-spin", "defog", "mortal-spin", "tidy-up", "court-change"] },
  { category: "Momentum", moves: ["u-turn", "volt-switch", "flip-turn", "parting-shot", "teleport", "chilly-reception", "shed-tail", "baton-pass"] },
  { category: "Priority", moves: ["fake-out", "first-impression", "extreme-speed", "accelerock", "aqua-jet", "bullet-punch", "ice-shard", "jet-punch", "mach-punch", "quick-attack", "shadow-sneak", "sucker-punch", "vacuum-wave", "water-shuriken", "grassy-glide", "feint", "upper-hand"] },
  { category: "Utility", moves: ["will-o-wisp", "thunder-wave", "toxic", "glare", "taunt", "encore", "trick", "switcheroo", "yawn", "knock-off", "spore", "sleep-powder", "stun-spore", "nuzzle"] },
  { category: "Support", moves: ["wish", "healing-wish", "lunar-dance", "aromatherapy", "heal-bell", "tailwind", "trick-room", "reflect", "light-screen", "aurora-veil", "haze", "clear-smog", "memento"] },
  { category: "Recovery", moves: ["recover", "roost", "soft-boiled", "slack-off", "milk-drink", "moonlight", "morning-sun", "synthesis", "shore-up", "heal-order", "rest", "strength-sap", "jungle-healing", "life-dew"] },
  { category: "Phasing", moves: ["whirlwind", "roar", "dragon-tail", "circle-throw"] },
  { category: "Setup", moves: ["dragon-dance", "swords-dance", "nasty-plot", "calm-mind", "quiver-dance", "shell-smash", "bulk-up", "iron-defense", "agility", "rock-polish", "coil", "shift-gear", "belly-drum", "curse", "growth", "work-up"] },
];

interface Pokemon {
  id: number;
  name: string;
  displayName: string | null;
  spriteUrl: string | null;
  types: string[];
  abilities: { name: string; isHidden: boolean }[] | string[];
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
  moves: string[];
}

interface RosterEntry {
  id: number;
  pokemonId: number;
  isTeraCaptain: boolean;
  price: number;
  teraCost: number;
  pokemon: Pokemon | null;
  isDropped?: boolean;
}

interface Season {
  id: number;
  name: string;
  seasonNumber: number;
  isSchedulePublic: boolean;
  divisions: { id: number; name: string; logoUrl: string | null }[];
}

interface MatchData {
  id: number;
  week: number;
  seasonId: number;
  divisionId: number;
  divisionName: string;
  seasonName: string;
  coach1: {
    seasonCoachId: number;
    coachId: number | undefined;
    coachName: string;
    teamName: string;
    teamAbbreviation: string;
    teamLogoUrl: string | null;
    record: { wins: number; losses: number };
  };
  coach2: {
    seasonCoachId: number;
    coachId: number | undefined;
    coachName: string;
    teamName: string;
    teamAbbreviation: string;
    teamLogoUrl: string | null;
    record: { wins: number; losses: number };
  };
}

interface MatchOption {
  id: number;
  week: number;
  coach1Name: string;
  coach2Name: string;
  coach1TeamName: string;
  coach2TeamName: string;
  winnerId: number | null;
}

interface TeamSidePurchases {
  coach1BlueTeam: boolean;
  coach1RedTeam: boolean;
  coach2BlueTeam: boolean;
  coach2RedTeam: boolean;
}

interface Props {
  initialContext: LeagueContext;
  seasons: Season[];
  initialMatch: MatchData | null;
  initialWeeks: number[];
  initialMatches: MatchOption[];
  coach1Roster: RosterEntry[];
  coach2Roster: RosterEntry[];
  coach1DroppedPokemon: (Pokemon & { price: number; teraCost: number; isDropped: boolean; isTeraCaptain: boolean })[];
  coach2DroppedPokemon: (Pokemon & { price: number; teraCost: number; isDropped: boolean; isTeraCaptain: boolean })[];
  abilityDescriptions: Record<string, string>;
  moveTypes: Record<string, string>;
  teamSidePurchases: TeamSidePurchases;
  revealedItemScouting: Record<"coach1" | "coach2", Array<{
    pokemonId: number;
    pokemonName: string;
    spriteUrl: string | null;
    items: Array<{ item: string; reveals: number }>;
  }>>;
}

interface SpeedCalcSettings {
  level: number;
  ev: number;
  iv: number;
  sp: number;
  boost: number;
  nature: "positive" | "neutral" | "negative";
  condition: SpeedCondition;
}

function getPokemonAbilityNames(pokemon: Pokemon): string[] {
  if (!Array.isArray(pokemon.abilities)) return [];
  return pokemon.abilities.map((ability) => typeof ability === "string" ? ability : ability.name);
}

function calculatePokemonSpeed(
  baseSpeed: number,
  settings: SpeedCalcSettings,
  usesStatPoints: boolean,
): number {
  const natureMultiplier = settings.nature === "positive" ? 1.1 : settings.nature === "negative" ? 0.9 : 1;
  const boostMultiplier = settings.boost >= 0 ? (2 + settings.boost) / 2 : 2 / (2 - settings.boost);
  const unboostedSpeed = usesStatPoints
    ? Math.floor((Math.floor((2 * baseSpeed + 31) * 50 / 100) + 5 + settings.sp) * natureMultiplier)
    : Math.floor((Math.floor((2 * baseSpeed + settings.iv + Math.floor(settings.ev / 4)) * settings.level / 100) + 5) * natureMultiplier);

  return Math.floor(unboostedSpeed * boostMultiplier);
}

function groupBySpeedAndTeam<T extends { team: "top" | "bottom" }>(entries: T[], getSpeed: (entry: T) => number): Array<{ speed: number; team: "top" | "bottom"; entries: T[] }> {
  const groups = new Map<string, { speed: number; team: "top" | "bottom"; entries: T[] }>();
  for (const entry of entries) {
    const speed = getSpeed(entry);
    const key = `${speed}-${entry.team}`;
    const group = groups.get(key) ?? { speed, team: entry.team, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .sort((a, b) => b.speed - a.speed || (a.team === "top" ? -1 : 1));
}

function getWeekLabel(week: number): string {
  if (week === 101) return "Quarterfinals";
  if (week === 102) return "Semifinals";
  if (week === 103) return "Finals";
  return `Week ${week}`;
}

function getDefensiveMultiplier(types: string[], abilities: { name: string; isHidden: boolean }[] | string[], attackingType: string): number {
  let multiplier = 1;

  // Calculate type effectiveness
  for (const defType of types) {
    const effectiveness = TYPE_CHART[attackingType]?.[defType.toLowerCase()];
    if (effectiveness !== undefined) {
      multiplier *= effectiveness;
    }
  }

  // Check for ability immunities
  for (const ability of abilities) {
    const abilityName = typeof ability === "string" ? ability : ability.name;
    const normalizedAbility = abilityName.toLowerCase().replace(/ /g, "-");
    if (IMMUNITY_ABILITIES[normalizedAbility] === attackingType) {
      return 0;
    }
    if (RESISTANCE_ABILITIES[normalizedAbility]?.includes(attackingType)) {
      multiplier *= 0.5;
    }
    const weakness = WEAKNESS_ABILITIES[normalizedAbility];
    if (weakness && weakness.type === attackingType) {
      multiplier *= weakness.multiplier;
    }
  }

  return multiplier;
}

function getMultiplierColor(multiplier: number): string {
  if (multiplier === 0) return "bg-black text-[#f9cb9c]";
  if (multiplier <= 0.25) return "bg-[#38761d] text-[#d9ead3]";
  if (multiplier < 1) return "bg-[#93c47d] text-[#132609]";
  if (multiplier === 1) return "bg-[var(--background-tertiary)] text-[var(--foreground-muted)]";
  if (multiplier <= 2) return "bg-[#e06666] text-[#660000]";
  return "bg-[#990000] text-[#f4cccc]";
}

function formatMultiplier(m: number): string {
  if (m === 0) return "0";
  if (m === 0.25) return "1/4";
  if (m === 0.5) return "1/2";
  if (m === 1) return "1";
  if (m === 2) return "2";
  if (m === 4) return "4";
  if (m === 0.125) return "1/8";
  if (m === 2.5) return "2.5";
  if (m === 8) return "8";
  if (m < 1) return (Math.round(m * 100) / 100).toString();
  return m.toString();
}

export function MatchupPrepClient({
  initialContext,
  seasons,
  initialMatch,
  initialWeeks,
  initialMatches,
  coach1Roster,
  coach2Roster,
  coach1DroppedPokemon,
  coach2DroppedPokemon,
  abilityDescriptions,
  moveTypes,
  teamSidePurchases,
  revealedItemScouting,
}: Props) {
  const router = useRouter();

  // Selectors
  const [selectedSeason, setSelectedSeason] = useState<number | null>(
    initialMatch?.seasonId || initialContext.seasonId || seasons[0]?.id || null
  );
  const [selectedDivision, setSelectedDivision] = useState<number | null>(
    initialMatch?.divisionId || initialContext.divisionId || null
  );
  const [selectedWeek, setSelectedWeek] = useState<number | null>(
    initialMatch?.week || initialContext.week || null
  );
  const [selectedMatch, setSelectedMatch] = useState<number | null>(
    initialMatch?.id || null
  );

  // Stats sorting
  const [statSort, setStatSort] = useState<"hp" | "atk" | "def" | "spa" | "spd" | "spe" | "bst">("spe");

  // Speed comparison settings
  const [speedCalc1, setSpeedCalc1] = useState<SpeedCalcSettings>({ level: 50, ev: 252, iv: 31, sp: 32, boost: 0, nature: "positive", condition: "none" });
  const [speedCalc2, setSpeedCalc2] = useState<SpeedCalcSettings>({ level: 50, ev: 252, iv: 31, sp: 32, boost: 0, nature: "positive", condition: "rain" });
  const [mobileSpeedCompare, setMobileSpeedCompare] = useState<1 | 2>(2);
  const [mobileSpeedFiltersOpen, setMobileSpeedFiltersOpen] = useState(false);

  // Speed section collapse state (mobile only)
  const [speedSectionOpen, setSpeedSectionOpen] = useState<{ base: boolean; compare1: boolean; compare2: boolean }>({ base: true, compare1: false, compare2: false });

  // Preferences save state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    async function loadPrefs() {
      try {
        const res = await fetch("/api/preferences?page=matchup-prep");
        if (res.ok) {
          const data = await res.json();
          if (data.preferences) {
            if (data.preferences.statSort) setStatSort(data.preferences.statSort);
            if (data.preferences.speedCalc1) {
              setSpeedCalc1((current) => ({ ...current, ...data.preferences.speedCalc1, condition: data.preferences.speedCalc1.condition ?? "none" }));
            }
            if (data.preferences.speedCalc2) {
              setSpeedCalc2((current) => ({ ...current, ...data.preferences.speedCalc2, condition: data.preferences.speedCalc2.condition ?? "rain" }));
            }
          }
        }
      } catch (e) {
        // Not logged in or error - ignore
      } finally {
        setPrefsLoaded(true);
      }
    }
    loadPrefs();
  }, []);

  // Save preferences
  const savePreferences = async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "matchup-prep",
          preferences: {
            statSort,
            speedCalc1,
            speedCalc2,
          },
        }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("idle");
      }
    } catch (e) {
      setSaveStatus("idle");
    }
  };

  // Ability tooltip expansion state (for mobile)
  const [expandedAbility, setExpandedAbility] = useState<{ team: number; pokemonIdx: number; abilityIdx: number } | null>(null);

  // Calculate initial swap state and lock based on team side purchases
  // Logic:
  // - If both want the same side (both blue or both red) → conflict, normal behavior
  // - Otherwise, if anyone has an upgrade, apply it and lock
  const { initialSwapped, swapLocked, swapLockedReason } = useMemo(() => {
    const { coach1BlueTeam, coach1RedTeam, coach2BlueTeam, coach2RedTeam } = teamSidePurchases;

    // Conflict: both want the same side → normal behavior
    if ((coach1BlueTeam && coach2BlueTeam) || (coach1RedTeam && coach2RedTeam)) {
      return { initialSwapped: false, swapLocked: false, swapLockedReason: null };
    }

    // coach1 wants blue (coach2 either wants red or doesn't care)
    if (coach1BlueTeam) {
      const reason = coach2RedTeam
        ? "Both coaches have team side upgrades"
        : `${initialMatch?.coach1.coachName || "Coach 1"} has the Blue Team upgrade`;
      return { initialSwapped: false, swapLocked: true, swapLockedReason: reason };
    }

    // coach1 wants red (coach2 either wants blue or doesn't care)
    if (coach1RedTeam) {
      const reason = coach2BlueTeam
        ? "Both coaches have team side upgrades"
        : `${initialMatch?.coach1.coachName || "Coach 1"} has the Red Team upgrade`;
      return { initialSwapped: true, swapLocked: true, swapLockedReason: reason };
    }

    // coach2 wants blue (coach1 has no preference)
    if (coach2BlueTeam) {
      return { initialSwapped: true, swapLocked: true, swapLockedReason: `${initialMatch?.coach2.coachName || "Coach 2"} has the Blue Team upgrade` };
    }

    // coach2 wants red (coach1 has no preference)
    if (coach2RedTeam) {
      return { initialSwapped: false, swapLocked: true, swapLockedReason: `${initialMatch?.coach2.coachName || "Coach 2"} has the Red Team upgrade` };
    }

    // Neither has any upgrade
    return { initialSwapped: false, swapLocked: false, swapLockedReason: null };
  }, [teamSidePurchases, initialMatch]);

  // Viewpoint swap state
  const [isSwapped, setIsSwapped] = useState(initialSwapped);

  // Mobile tooltip state for locked swap button
  const [showLockedTooltip, setShowLockedTooltip] = useState(false);
  const swapButtonRef = useRef<HTMLDivElement>(null);

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!showLockedTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (swapButtonRef.current && !swapButtonRef.current.contains(e.target as Node)) {
        setShowLockedTooltip(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showLockedTooltip]);

  // Match data (from initial props or fetched)
  const [matchData, setMatchData] = useState<MatchData | null>(initialMatch);
  const [availableWeeks, setAvailableWeeks] = useState<number[]>(initialWeeks);
  const [availableMatches, setAvailableMatches] = useState<MatchOption[]>(initialMatches);
  const [roster1, setRoster1] = useState(coach1Roster);
  const [roster2, setRoster2] = useState(coach2Roster);
  const [dropped1, setDropped1] = useState(coach1DroppedPokemon);
  const [dropped2, setDropped2] = useState(coach2DroppedPokemon);
  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const weeksRequestId = useRef(0);
  const matchesRequestId = useRef(0);

  // Get divisions for selected season
  const divisions = useMemo(() => {
    const season = seasons.find((s) => s.id === selectedSeason);
    return [...(season?.divisions || [])].sort(compareDivisions);
  }, [seasons, selectedSeason]);

  const usesStatPoints = useMemo(
    () => seasons.find((season) => season.id === selectedSeason)?.seasonNumber === 11,
    [seasons, selectedSeason]
  );

  // Combine roster with dropped Pokemon for display
  const team1Pokemon = useMemo(() => {
    const active = roster1
      .filter((r) => r.pokemon)
      .map((r) => ({ ...r.pokemon!, price: r.price, teraCost: r.teraCost, isTeraCaptain: r.isTeraCaptain, isDropped: false }));
    const dropped = dropped1.map((p) => ({ ...p, isTeraCaptain: p.isTeraCaptain ?? false }));
    return [...active, ...dropped].sort((a, b) => (b.price + (b.isTeraCaptain ? b.teraCost : 0)) - (a.price + (a.isTeraCaptain ? a.teraCost : 0)));
  }, [roster1, dropped1]);

  const team2Pokemon = useMemo(() => {
    const active = roster2
      .filter((r) => r.pokemon)
      .map((r) => ({ ...r.pokemon!, price: r.price, teraCost: r.teraCost, isTeraCaptain: r.isTeraCaptain, isDropped: false }));
    const dropped = dropped2.map((p) => ({ ...p, isTeraCaptain: p.isTeraCaptain ?? false }));
    return [...active, ...dropped].sort((a, b) => (b.price + (b.isTeraCaptain ? b.teraCost : 0)) - (a.price + (a.isTeraCaptain ? a.teraCost : 0)));
  }, [roster2, dropped2]);

  // Swapped display versions (for viewpoint swap)
  const topTeamPokemon = isSwapped ? team2Pokemon : team1Pokemon;
  const bottomTeamPokemon = isSwapped ? team1Pokemon : team2Pokemon;
  const topTeamName = matchData ? (isSwapped ? matchData.coach2.teamName : matchData.coach1.teamName) : "";
  const bottomTeamName = matchData ? (isSwapped ? matchData.coach1.teamName : matchData.coach2.teamName) : "";
  const topTeamAbbr = matchData ? (isSwapped ? matchData.coach2.teamAbbreviation : matchData.coach1.teamAbbreviation) : "";
  const bottomTeamAbbr = matchData ? (isSwapped ? matchData.coach1.teamAbbreviation : matchData.coach2.teamAbbreviation) : "";

  // Stats sorted (respects swap)
  const topTeamStatsSorted = useMemo(() => {
    return [...topTeamPokemon].sort((a, b) => {
      const statMap: Record<string, (p: typeof a) => number> = {
        hp: (p) => p.hp,
        atk: (p) => p.attack,
        def: (p) => p.defense,
        spa: (p) => p.specialAttack,
        spd: (p) => p.specialDefense,
        spe: (p) => p.speed,
        bst: (p) => p.baseStatTotal,
      };
      return statMap[statSort](b) - statMap[statSort](a);
    });
  }, [topTeamPokemon, statSort]);

  const bottomTeamStatsSorted = useMemo(() => {
    return [...bottomTeamPokemon].sort((a, b) => {
      const statMap: Record<string, (p: typeof a) => number> = {
        hp: (p) => p.hp,
        atk: (p) => p.attack,
        def: (p) => p.defense,
        spa: (p) => p.specialAttack,
        spd: (p) => p.specialDefense,
        spe: (p) => p.speed,
        bst: (p) => p.baseStatTotal,
      };
      return statMap[statSort](b) - statMap[statSort](a);
    });
  }, [bottomTeamPokemon, statSort]);

  // Team averages (respects swap)
  const topTeamAvg = useMemo(() => {
    if (topTeamPokemon.length === 0) return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, bst: 0 };
    const sum = topTeamPokemon.reduce(
      (acc, p) => ({
        hp: acc.hp + p.hp,
        atk: acc.atk + p.attack,
        def: acc.def + p.defense,
        spa: acc.spa + p.specialAttack,
        spd: acc.spd + p.specialDefense,
        spe: acc.spe + p.speed,
        bst: acc.bst + p.baseStatTotal,
      }),
      { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, bst: 0 }
    );
    const len = topTeamPokemon.length;
    return {
      hp: Math.round(sum.hp / len),
      atk: Math.round(sum.atk / len),
      def: Math.round(sum.def / len),
      spa: Math.round(sum.spa / len),
      spd: Math.round(sum.spd / len),
      spe: Math.round(sum.spe / len),
      bst: Math.round(sum.bst / len),
    };
  }, [topTeamPokemon]);

  const bottomTeamAvg = useMemo(() => {
    if (bottomTeamPokemon.length === 0) return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, bst: 0 };
    const sum = bottomTeamPokemon.reduce(
      (acc, p) => ({
        hp: acc.hp + p.hp,
        atk: acc.atk + p.attack,
        def: acc.def + p.defense,
        spa: acc.spa + p.specialAttack,
        spd: acc.spd + p.specialDefense,
        spe: acc.spe + p.speed,
        bst: acc.bst + p.baseStatTotal,
      }),
      { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, bst: 0 }
    );
    const len = bottomTeamPokemon.length;
    return {
      hp: Math.round(sum.hp / len),
      atk: Math.round(sum.atk / len),
      def: Math.round(sum.def / len),
      spa: Math.round(sum.spa / len),
      spd: Math.round(sum.spd / len),
      spe: Math.round(sum.spe / len),
      bst: Math.round(sum.bst / len),
    };
  }, [bottomTeamPokemon]);

  // Speed-sorted Pokemon for type charts and center comparison
  const topTeamBySpeed = useMemo(() =>
    [...topTeamPokemon].sort((a, b) => b.speed - a.speed),
    [topTeamPokemon]
  );

  const bottomTeamBySpeed = useMemo(() =>
    [...bottomTeamPokemon].sort((a, b) => b.speed - a.speed),
    [bottomTeamPokemon]
  );

  // Team-wide type chart calculations (using speed-sorted order)
  const topTeamTypeChart = useMemo(() => {
    const chart: Record<string, { multipliers: number[]; overall: string }> = {};
    for (const attackType of ALL_TYPES) {
      const multipliers = topTeamBySpeed.map((p) =>
        getDefensiveMultiplier(p.types.map(t => t.toLowerCase()), p.abilities, attackType)
      );
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
  }, [topTeamBySpeed]);

  const bottomTeamTypeChart = useMemo(() => {
    const chart: Record<string, { multipliers: number[]; overall: string }> = {};
    for (const attackType of ALL_TYPES) {
      const multipliers = bottomTeamBySpeed.map((p) =>
        getDefensiveMultiplier(p.types.map(t => t.toLowerCase()), p.abilities, attackType)
      );
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
  }, [bottomTeamBySpeed]);

  // Speed tiers for center comparison (interleaved)
  const speedComparisonData = useMemo(() => {
    const maxLen = Math.max(topTeamBySpeed.length, bottomTeamBySpeed.length);
    return Array.from({ length: maxLen }).map((_, i) => ({
      top: topTeamBySpeed[i] || null,
      bottom: bottomTeamBySpeed[i] || null,
    }));
  }, [topTeamBySpeed, bottomTeamBySpeed]);

  // Combined speed list (all Pokemon from both teams sorted by base speed)
  const allPokemonByBaseSpeed = useMemo(() => {
    const topWithTeam = topTeamPokemon.map(p => ({ ...p, team: "top" as const }));
    const bottomWithTeam = bottomTeamPokemon.map(p => ({ ...p, team: "bottom" as const }));
    return [...topWithTeam, ...bottomWithTeam].sort((a, b) => b.speed - a.speed);
  }, [topTeamPokemon, bottomTeamPokemon]);

  // Speed Compare #1 sorted list
  const speedCompare1 = useMemo(() => {
    return allPokemonByBaseSpeed
      .map((pokemon) => {
        const activeEffect = getActiveSpeedEffect(getPokemonAbilityNames(pokemon), speedCalc1.condition);
        const trainedSpeed = calculatePokemonSpeed(pokemon.speed, speedCalc1, usesStatPoints);
        return {
          ...pokemon,
          activeEffect,
          calculatedSpeed: applySpeedEffect(trainedSpeed, activeEffect),
        };
      })
      .sort((a, b) => b.calculatedSpeed - a.calculatedSpeed);
  }, [allPokemonByBaseSpeed, speedCalc1, usesStatPoints]);

  // Speed Compare #2 sorted list
  const speedCompare2 = useMemo(() => {
    return allPokemonByBaseSpeed
      .map((pokemon) => {
        const activeEffect = getActiveSpeedEffect(getPokemonAbilityNames(pokemon), speedCalc2.condition);
        const trainedSpeed = calculatePokemonSpeed(pokemon.speed, speedCalc2, usesStatPoints);
        return {
          ...pokemon,
          activeEffect,
          calculatedSpeed: applySpeedEffect(trainedSpeed, activeEffect),
        };
      })
      .sort((a, b) => b.calculatedSpeed - a.calculatedSpeed);
  }, [allPokemonByBaseSpeed, speedCalc2, usesStatPoints]);

  const speedCompare1Groups = useMemo(
    () => groupBySpeedAndTeam(speedCompare1, (pokemon) => pokemon.calculatedSpeed),
    [speedCompare1],
  );
  const speedCompare2Groups = useMemo(
    () => groupBySpeedAndTeam(speedCompare2, (pokemon) => pokemon.calculatedSpeed),
    [speedCompare2],
  );
  const mobileSpeedSettings = mobileSpeedCompare === 1 ? speedCalc1 : speedCalc2;
  const mobileSpeedGroups = mobileSpeedCompare === 1 ? speedCompare1Groups : speedCompare2Groups;
  const mobileNatureMarker = mobileSpeedSettings.nature === "positive" ? "+" : mobileSpeedSettings.nature === "negative" ? "−" : "○";
  const mobileInvestmentLabel = `${usesStatPoints ? mobileSpeedSettings.sp : mobileSpeedSettings.ev}${mobileNatureMarker}`;
  const mobileConditionLabel = SPEED_CONDITION_OPTIONS.find((option) => option.value === mobileSpeedSettings.condition)?.label ?? "No field effect";
  const updateMobileSpeedSettings = (changes: Partial<SpeedCalcSettings>) => {
    if (mobileSpeedCompare === 1) {
      setSpeedCalc1((current) => ({ ...current, ...changes }));
    } else {
      setSpeedCalc2((current) => ({ ...current, ...changes }));
    }
  };

  // Handle season change
  const updateSelectionUrl = (seasonId: number | null, divisionId?: number, week?: number) => {
    const params = new URLSearchParams();
    if (seasonId) params.set("seasonId", String(seasonId));
    if (divisionId) params.set("divisionId", String(divisionId));
    if (week) params.set("week", String(week));
    if (divisionId === initialContext.divisionId && initialContext.teamId) params.set("teamId", String(initialContext.teamId));
    window.history.replaceState(null, "", `/matchup-prep?${params}`);
  };

  const handleSeasonChange = (seasonId: number) => {
    updateSelectionUrl(seasonId);
    weeksRequestId.current += 1;
    matchesRequestId.current += 1;
    setSelectedSeason(seasonId);
    setSelectedDivision(null);
    setSelectedWeek(null);
    setSelectedMatch(null);
    setAvailableWeeks([]);
    setAvailableMatches([]);
    setLoadingWeeks(false);
    setLoadingMatches(false);
    setMatchData(null);
    setRoster1([]);
    setRoster2([]);
    setDropped1([]);
    setDropped2([]);
  };

  // Handle division change - fetch only its week numbers.
  const handleDivisionChange = async (divisionId: number) => {
    updateSelectionUrl(selectedSeason, divisionId);
    const requestId = ++weeksRequestId.current;
    matchesRequestId.current += 1;
    setSelectedDivision(divisionId);
    setSelectedWeek(null);
    setSelectedMatch(null);
    setAvailableWeeks([]);
    setAvailableMatches([]);
    setLoadingMatches(false);
    setMatchData(null);
    setRoster1([]);
    setRoster2([]);
    setDropped1([]);
    setDropped2([]);

    // Check if schedule is visible for selected season
    const season = seasons.find((s) => s.id === selectedSeason);
    if (!season?.isSchedulePublic) {
      return;
    }

    setLoadingWeeks(true);

    try {
      const res = await fetch(`/api/matchup-prep/options?divisionId=${divisionId}`);
      if (!res.ok) throw new Error(`Week request failed with ${res.status}`);
      const data: { weeks: number[] } = await res.json();
      if (requestId === weeksRequestId.current) {
        setAvailableWeeks(data.weeks);
      }
    } catch (err) {
      console.error("Failed to fetch matchup weeks:", err);
    } finally {
      if (requestId === weeksRequestId.current) {
        setLoadingWeeks(false);
      }
    }
  };

  // Handle week change - fetch only the matches in that week.
  const handleWeekChange = async (week: number) => {
    updateSelectionUrl(selectedSeason, selectedDivision ?? undefined, week);
    setMatchData(null);
    setRoster1([]);
    setRoster2([]);
    setDropped1([]);
    setDropped2([]);
    const requestId = ++matchesRequestId.current;
    setSelectedWeek(week);
    setSelectedMatch(null);
    setAvailableMatches([]);

    if (!selectedDivision) return;

    setLoadingMatches(true);
    try {
      const res = await fetch(
        `/api/matchup-prep/options?divisionId=${selectedDivision}&week=${week}`
      );
      if (!res.ok) throw new Error(`Match request failed with ${res.status}`);
      const data: { matches: MatchOption[] } = await res.json();
      if (requestId === matchesRequestId.current) {
        setAvailableMatches(data.matches);
      }
    } catch (err) {
      console.error("Failed to fetch matchup matches:", err);
    } finally {
      if (requestId === matchesRequestId.current) {
        setLoadingMatches(false);
      }
    }
  };

  // Handle match selection - navigate to URL with matchId and refresh
  const handleMatchSelect = (matchId: number) => {
    // Use window.location for full page refresh to ensure server component reloads data
    router.push(`/matchup-prep?matchId=${matchId}${initialContext.teamId ? `&teamId=${initialContext.teamId}` : ""}`);
  };

  // Check if selected season has schedule visible
  const isScheduleVisible = useMemo(() => {
    const season = seasons.find((s) => s.id === selectedSeason);
    return season?.isSchedulePublic ?? true;
  }, [seasons, selectedSeason]);

  const hasMatchSelected = matchData !== null && team1Pokemon.length > 0;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <LeagueJourney context={{
        seasonId: selectedSeason ?? undefined,
        seasonName: seasons.find((season) => season.id === selectedSeason)?.name,
        divisionId: selectedDivision ?? undefined,
        divisionName: divisions.find((division) => division.id === selectedDivision)?.name,
        week: selectedWeek ?? undefined,
        teamId: selectedDivision === initialContext.divisionId ? initialContext.teamId : undefined,
        matchId: selectedMatch ?? undefined,
      }} />
      {/* Page Header */}
      <div className="poke-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
              Matchup Prep
            </h1>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              Analyze team matchups with type charts, speed tiers, and move coverage
            </p>
          </div>
          <div className="flex max-w-md flex-col gap-2 sm:items-end">
            <a
              href="https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-4 py-2 text-xs font-bold uppercase text-white transition-colors hover:border-[#ef4444] hover:text-[#ef4444]"
            >
              Open Damage Calculator ↗
            </a>
            <p className="text-xs text-[var(--foreground-muted)] sm:text-right">
              Thank you to Nimbasa City Post for making this, and please support them.
            </p>
          </div>
        </div>
      </div>

      {/* Matchup Selector */}
      <div className="poke-card p-6">
        <div className="section-title mb-4">
          <div className="section-title-icon">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3>Select Matchup</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Season */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground-muted)] uppercase mb-1">
              Season
            </label>
            <select
              value={selectedSeason || ""}
              onChange={(e) => handleSeasonChange(parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] text-sm"
            >
              <option value="">Select season...</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Division */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground-muted)] uppercase mb-1">
              Division
            </label>
            <select
              value={selectedDivision || ""}
              onChange={(e) => handleDivisionChange(parseInt(e.target.value))}
              disabled={!selectedSeason}
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] text-sm disabled:opacity-50"
            >
              <option value="">Select division...</option>
              {selectedSeason && (
                <optgroup label={seasons.find((season) => season.id === selectedSeason)?.name ?? "Selected Season"}>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Week */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground-muted)] uppercase mb-1">
              Week
            </label>
            <select
              value={selectedWeek || ""}
              onChange={(e) => handleWeekChange(parseInt(e.target.value))}
              disabled={!selectedDivision || loadingWeeks}
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] text-sm disabled:opacity-50"
            >
              <option value="">{loadingWeeks ? "Loading weeks..." : "Select week..."}</option>
              {availableWeeks.map((w) => (
                <option key={w} value={w}>
                  {getWeekLabel(w)}
                </option>
              ))}
            </select>
          </div>

          {/* Match */}
          <div>
            <label className="block text-xs font-bold text-[var(--foreground-muted)] uppercase mb-1">
              Match
            </label>
            <select
              value={selectedMatch || ""}
              onChange={(e) => handleMatchSelect(parseInt(e.target.value))}
              disabled={!selectedWeek || loadingMatches}
              className="w-full px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] text-sm disabled:opacity-50"
            >
              <option value="">{loadingMatches ? "Loading matches..." : "Select match..."}</option>
              {availableMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.coach1TeamName} vs {m.coach2TeamName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(loadingWeeks || loadingMatches) && (
          <div className="mt-4 text-center text-[var(--foreground-muted)]">
            {loadingWeeks ? "Loading weeks..." : "Loading matches..."}
          </div>
        )}

        {!isScheduleVisible && selectedSeason && !loadingWeeks && !loadingMatches && (
          <div className="mt-4 p-3 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-center">
            <p className="text-sm text-[var(--accent)]">
              Schedule is currently hidden for this season. Matchups will be available once the schedule is published.
            </p>
          </div>
        )}
      </div>

      {/* Match Info Header */}
      {matchData && (() => {
        const leftTeam = isSwapped ? matchData.coach2 : matchData.coach1;
        const rightTeam = isSwapped ? matchData.coach1 : matchData.coach2;
        return (
          <div className="poke-card p-6 rounded-lg !overflow-visible">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Left Team */}
              <div className="flex items-center gap-3 flex-1 pl-4 border-l-4 border-[#3b82f6]">
                {leftTeam.teamLogoUrl ? (
                  <img
                    src={leftTeam.teamLogoUrl}
                    alt={leftTeam.teamName}
                    className="w-16 h-16 object-contain"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-[#2563eb] flex items-center justify-center shadow-[0_4px_0_#1d4ed8]">
                    <span className="text-white text-xl font-bold">
                      {leftTeam.teamName.charAt(0)}
                    </span>
                  </div>
                )}
                <div>
                  <h2 className="font-bold text-lg">{leftTeam.teamName}</h2>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {leftTeam.coachName} ({leftTeam.record.wins}-{leftTeam.record.losses})
                  </p>
                </div>
              </div>

              {/* VS + Swap Button */}
              <div className="text-center px-4 overflow-visible">
                <div className="flex items-center justify-center gap-2">
                  <span className="font-pixel text-2xl text-[var(--foreground-muted)]">VS</span>
                  <div className="relative group" ref={swapButtonRef}>
                    <button
                      onClick={() => {
                        if (swapLocked) {
                          setShowLockedTooltip(!showLockedTooltip);
                        } else {
                          setIsSwapped(!isSwapped);
                        }
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        swapLocked
                          ? "bg-[var(--background-tertiary)] cursor-not-allowed opacity-50"
                          : "bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)]"
                      }`}
                      title={!swapLocked ? "Swap viewpoint" : undefined}
                    >
                      <svg className="w-4 h-4 text-[var(--foreground-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </button>
                    {/* Tooltip - hover on desktop, click on mobile */}
                    {swapLocked && swapLockedReason && (
                      <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-[var(--background)] border border-[var(--background-tertiary)] rounded-lg shadow-lg transition-opacity pointer-events-none z-[100] whitespace-nowrap ${
                        showLockedTooltip ? "opacity-100" : "opacity-0 md:group-hover:opacity-100"
                      }`}>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[var(--background-tertiary)]" />
                        <span className="text-xs text-[var(--foreground-muted)]">
                          {swapLockedReason.includes("Blue Team") ? (
                            <>
                              {swapLockedReason.split("Blue Team")[0]}
                              <span className="text-blue-400 font-semibold">Blue Team</span>
                              {swapLockedReason.split("Blue Team")[1]}
                            </>
                          ) : swapLockedReason.includes("Red Team") ? (
                            <>
                              {swapLockedReason.split("Red Team")[0]}
                              <span className="text-red-400 font-semibold">Red Team</span>
                              {swapLockedReason.split("Red Team")[1]}
                            </>
                          ) : (
                            swapLockedReason
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[var(--foreground-subtle)] mt-1">
                  {matchData.seasonName} - {matchData.divisionName}
                </p>
                <p className="text-xs text-[var(--foreground-subtle)]">
                  {getWeekLabel(matchData.week)}
                </p>
              </div>

              {/* Right Team */}
              <div className="flex items-center gap-3 flex-1 justify-end pr-4 border-r-4 border-[#ef4444]">
                <div className="text-right">
                  <h2 className="font-bold text-lg">{rightTeam.teamName}</h2>
                  <p className="text-sm text-[var(--foreground-muted)]">
                    {rightTeam.coachName} ({rightTeam.record.wins}-{rightTeam.record.losses})
                  </p>
                </div>
                {rightTeam.teamLogoUrl ? (
                  <img
                    src={rightTeam.teamLogoUrl}
                    alt={rightTeam.teamName}
                    className="w-16 h-16 object-contain"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-[#dc2626] flex items-center justify-center shadow-[0_4px_0_#991b1b]">
                    <span className="text-white text-xl font-bold">
                      {rightTeam.teamName.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {!hasMatchSelected && (
        <div className="poke-card p-8 text-center">
          <p className="text-[var(--foreground-muted)]">
            Select a matchup above to view detailed analysis
          </p>
        </div>
      )}

      {hasMatchSelected && (
        <>
          {/* Click-away overlay to close ability tooltips on mobile */}
          {expandedAbility && (
            <div
              className="fixed inset-0 z-40 lg:hidden"
              onClick={() => setExpandedAbility(null)}
            />
          )}

          <div className="poke-card p-4 sm:p-6">
            <div className="mb-4">
              <h3 className="font-pixel text-sm text-white">Revealed Item Scouting</h3>
              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                Items explicitly shown in earlier replays this season. Missing items are unknown, not itemless.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {(["coach1", "coach2"] as const).map((side) => {
                const team = initialMatch?.[side];
                const entries = revealedItemScouting[side];
                return (
                  <div key={side} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-3">
                    <h4 className={`mb-3 text-sm font-bold ${side === "coach1" ? "text-[#3b82f6]" : "text-[#ef4444]"}`}>
                      {team?.teamName || team?.coachName || "Team"}
                    </h4>
                    {entries.length ? (
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <div key={entry.pokemonId} className="flex items-center gap-3 rounded-md bg-[var(--background)] p-2">
                            {entry.spriteUrl ? (
                              <img src={entry.spriteUrl} alt="" className="h-9 w-9 shrink-0 object-contain" />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-bold text-white">{entry.pokemonName}</div>
                              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1">
                                {entry.items.map((item) => (
                                  <span key={item.item} className="text-[11px] text-[var(--foreground-muted)]">
                                    {item.item} <span className="font-mono text-[var(--primary)]">{item.reveals}×</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-3 text-center text-xs text-[var(--foreground-muted)]">
                        No revealed item history yet
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team Rosters - Horizontal Overview */}
          <div className="poke-card space-y-4 rounded-lg p-2.5 lg:p-4">
            {/* Mobile Layout - Paired rows for equal card heights */}
            <div className="lg:hidden relative">
              {/* Continuous left accent */}
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#3b82f6] rounded-full" />
              {/* Continuous right accent */}
              <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-[#ef4444] rounded-full" />

              {/* Content */}
              <div className="flex flex-col gap-1.5 px-2.5">
                {/* Header row */}
                <div className="mb-1 grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-1.5">
                  <div className="min-w-0 py-1">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-[#2563eb] flex items-center justify-center shadow-[0_2px_0_#1d4ed8]">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <h3 className="truncate text-xs font-bold text-[#3b82f6]">{topTeamAbbr || topTeamName}</h3>
                    </div>
                  </div>
                  <div className="text-center text-[8px] font-black uppercase tracking-wider text-white/30">vs</div>
                  <div className="min-w-0 py-1">
                    <div className="flex items-center gap-2 justify-end">
                      <h3 className="truncate text-right text-xs font-bold text-[#ef4444]">{bottomTeamAbbr || bottomTeamName}</h3>
                      <div className="w-5 h-5 rounded bg-[#dc2626] flex items-center justify-center shadow-[0_2px_0_#991b1b]">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card rows - paired for equal height */}
                {Array.from({ length: Math.max(topTeamPokemon.length, bottomTeamPokemon.length) }).map((_, idx) => {
                  const topP = topTeamPokemon[idx];
                  const bottomP = bottomTeamPokemon[idx];
                  const topAbilities = topP ? (Array.isArray(topP.abilities) ? topP.abilities : []) : [];
                  const bottomAbilities = bottomP ? (Array.isArray(bottomP.abilities) ? bottomP.abilities : []) : [];

                  return (
                    <div key={idx} className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-stretch gap-1.5">
                      {/* Left card */}
                      <div className="min-w-0">
                      {topP ? (
                        <div
                          className={`relative flex h-full min-h-[58px] items-center gap-1.5 rounded-lg border bg-[var(--card)] px-1.5 py-1 ${
                            topP.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                          } ${topP.isDropped ? "opacity-50" : ""}`}
                          title={topAbilities.map((ability) => typeof ability === "string" ? ability : ability.name).join(", ")}
                        >
                          {topP.isTeraCaptain && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] flex items-center justify-center z-10" title="Tera Captain">
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2L2 12l10 10 10-10L12 2z" />
                              </svg>
                            </div>
                          )}
                          {topP.isDropped && (
                            <div className="absolute top-1 left-1">
                              <span className="text-[7px] px-1 py-0.5 rounded font-bold bg-[var(--error)]/20 text-[var(--error)]">Drop</span>
                            </div>
                          )}
                          <img src={topP.spriteUrl || ""} alt="" className="h-10 w-10 shrink-0 scale-110 object-contain" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[10px] font-bold leading-tight text-white">{topP.displayName || topP.name}</div>
                            <div className="mt-0.5 flex flex-wrap gap-0.5">
                              {topP.types.map((t) => (
                                <span key={t} className={`type-badge type-${t.toLowerCase()} px-1 py-0 text-[6px] leading-3`}>{t}</span>
                              ))}
                            </div>
                            <div className="mt-0.5 truncate text-[7px] capitalize leading-tight text-white/40">
                              {topAbilities.map((ability) => (typeof ability === "string" ? ability : ability.name).replace(/-/g, " ")).join(" / ") || "No ability data"}
                            </div>
                          </div>
                        </div>
                      ) : <div />}
                    </div>

                      {/* Right card */}
                      <div aria-hidden="true" className="flex items-center justify-center">
                        <div className="h-px w-full bg-white/10" />
                      </div>

                      <div className="min-w-0">
                      {bottomP ? (
                        <div
                          className={`relative flex h-full min-h-[58px] flex-row-reverse items-center gap-1.5 rounded-lg border bg-[var(--card)] px-1.5 py-1 ${
                            bottomP.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                          } ${bottomP.isDropped ? "opacity-50" : ""}`}
                          title={bottomAbilities.map((ability) => typeof ability === "string" ? ability : ability.name).join(", ")}
                        >
                          {bottomP.isTeraCaptain && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] flex items-center justify-center z-10" title="Tera Captain">
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2L2 12l10 10 10-10L12 2z" />
                              </svg>
                            </div>
                          )}
                          {bottomP.isDropped && (
                            <div className="absolute top-1 left-1">
                              <span className="text-[7px] px-1 py-0.5 rounded font-bold bg-[var(--error)]/20 text-[var(--error)]">Drop</span>
                            </div>
                          )}
                          <img src={bottomP.spriteUrl || ""} alt="" className="h-10 w-10 shrink-0 scale-110 object-contain" />
                          <div className="min-w-0 flex-1 text-right">
                            <div className="truncate text-[10px] font-bold leading-tight text-white">{bottomP.displayName || bottomP.name}</div>
                            <div className="mt-0.5 flex flex-wrap justify-end gap-0.5">
                              {bottomP.types.map((t) => (
                                <span key={t} className={`type-badge type-${t.toLowerCase()} px-1 py-0 text-[6px] leading-3`}>{t}</span>
                              ))}
                            </div>
                            <div className="mt-0.5 truncate text-[7px] capitalize leading-tight text-white/40">
                              {bottomAbilities.map((ability) => (typeof ability === "string" ? ability : ability.name).replace(/-/g, " ")).join(" / ") || "No ability data"}
                            </div>
                          </div>
                        </div>
                      ) : <div />}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>

            {/* Desktop Layout - Top Team */}
            <div className="hidden lg:block border-l-4 border-[#3b82f6] pl-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded bg-[#2563eb] flex items-center justify-center shadow-[0_2px_0_#1d4ed8]">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="font-bold text-sm text-[#3b82f6]">{topTeamName}</h3>
              </div>
              {/* Desktop grid */}
              <div
                className="grid gap-[clamp(4px,0.5vw,8px)]"
                style={{ gridTemplateColumns: `repeat(${topTeamPokemon.length || 1}, 1fr)` }}
              >
                {topTeamPokemon.map((p, idx) => {
                  const abilities = Array.isArray(p.abilities) ? p.abilities : [];
                  // Desktop tooltip alignment based on position
                  const isLeftEdge = idx === 0;
                  const isRightEdge = idx === topTeamPokemon.length - 1;
                  const desktopTooltipAlign = isLeftEdge ? "left-0" : isRightEdge ? "right-0" : "left-1/2 -translate-x-1/2";

                  return (
                    <div
                      key={p.id}
                      className={`relative flex flex-col bg-[var(--card)] border rounded-lg ${
                        p.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                      } ${p.isDropped ? "opacity-50" : ""}`}
                      style={{ padding: "clamp(6px, 0.5vw, 12px)" }}
                    >
                      {/* Tera Captain Badge */}
                      {p.isTeraCaptain && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center z-10" title="Tera Captain">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L2 12l10 10 10-10L12 2z" />
                          </svg>
                        </div>
                      )}
                      {/* Drop Badge */}
                      {p.isDropped && (
                        <div className="absolute top-1 left-1">
                          <span className="text-[8px] px-1 py-0.5 rounded font-bold bg-[var(--error)]/20 text-[var(--error)]">Drop</span>
                        </div>
                      )}
                      <img
                        src={p.spriteUrl || ""}
                        alt=""
                        className="object-contain mx-auto"
                        style={{ width: "clamp(40px, 4vw, 64px)", height: "clamp(40px, 4vw, 64px)", transform: "scale(1.4)" }}
                      />
                      <div className="text-white text-center font-medium mt-1 truncate" style={{ fontSize: "clamp(10px, 0.7vw, 14px)" }}>
                        {p.displayName || p.name}
                      </div>
                      <div className="flex gap-0.5 justify-center mt-1">
                        {p.types.map((t) => (
                          <span key={t} className={`type-badge type-${t.toLowerCase()} px-1 py-0.5 whitespace-nowrap`} style={{ fontSize: "clamp(6px, 0.45vw, 8px)" }}>{t}</span>
                        ))}
                      </div>
                      <div className={`mt-1.5 pt-1.5 border-t ${
                        p.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                      }`}>
                        {abilities.map((a, abilityIdx) => {
                          const abilityName = typeof a === "string" ? a : a.name;
                          const description = abilityDescriptions[abilityName];
                          return (
                            <div
                              key={abilityIdx}
                              className={`relative group/tooltip ${
                                abilityIdx > 0 ? "border-t border-[var(--background-tertiary)]/50" : ""
                              }`}
                            >
                              <div className="text-gray-400 text-center capitalize py-0.5 cursor-help truncate" style={{ fontSize: "clamp(9px, 0.6vw, 12px)" }}>
                                {abilityName.replace(/-/g, " ")}
                              </div>
                              {description && (
                                <div className={`absolute bottom-full ${desktopTooltipAlign} mb-1 hidden group-hover/tooltip:block z-50`}>
                                  <div className="px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-tertiary)] shadow-lg w-48">
                                    <p className="text-[10px] font-bold text-white capitalize mb-1">{abilityName.replace(/-/g, " ")}</p>
                                    <p className="text-[11px] text-[var(--foreground-muted)]">{description}</p>
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
            </div>

            {/* Desktop Layout - Bottom Team */}
            <div className="hidden lg:block border-r-4 border-[#ef4444] pr-3">
              <div className="flex items-center gap-2 mb-3 justify-end">
                <h3 className="font-bold text-sm text-[#ef4444]">{bottomTeamName}</h3>
                <div className="w-5 h-5 rounded bg-[#dc2626] flex items-center justify-center shadow-[0_2px_0_#991b1b]">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
              {/* Desktop grid */}
              <div
                className="grid gap-[clamp(4px,0.5vw,8px)]"
                style={{ gridTemplateColumns: `repeat(${bottomTeamPokemon.length || 1}, 1fr)` }}
              >
                {bottomTeamPokemon.map((p, idx) => {
                  const abilities = Array.isArray(p.abilities) ? p.abilities : [];
                  // Desktop tooltip alignment based on position
                  const isLeftEdge = idx === 0;
                  const isRightEdge = idx === bottomTeamPokemon.length - 1;
                  const desktopTooltipAlign = isLeftEdge ? "left-0" : isRightEdge ? "right-0" : "left-1/2 -translate-x-1/2";

                  return (
                    <div
                      key={p.id}
                      className={`relative flex flex-col bg-[var(--card)] border rounded-lg ${
                        p.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                      } ${p.isDropped ? "opacity-50" : ""}`}
                      style={{ padding: "clamp(6px, 0.5vw, 12px)" }}
                    >
                      {/* Tera Captain Badge */}
                      {p.isTeraCaptain && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center z-10" title="Tera Captain">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L2 12l10 10 10-10L12 2z" />
                          </svg>
                        </div>
                      )}
                      {/* Drop Badge */}
                      {p.isDropped && (
                        <div className="absolute top-1 left-1">
                          <span className="text-[8px] px-1 py-0.5 rounded font-bold bg-[var(--error)]/20 text-[var(--error)]">Drop</span>
                        </div>
                      )}
                      <img
                        src={p.spriteUrl || ""}
                        alt=""
                        className="object-contain mx-auto"
                        style={{ width: "clamp(40px, 4vw, 64px)", height: "clamp(40px, 4vw, 64px)", transform: "scale(1.4)" }}
                      />
                      <div className="text-white text-center font-medium mt-1 truncate" style={{ fontSize: "clamp(10px, 0.7vw, 14px)" }}>
                        {p.displayName || p.name}
                      </div>
                      <div className="flex gap-0.5 justify-center mt-1">
                        {p.types.map((t) => (
                          <span key={t} className={`type-badge type-${t.toLowerCase()} px-1 py-0.5 whitespace-nowrap`} style={{ fontSize: "clamp(6px, 0.45vw, 8px)" }}>{t}</span>
                        ))}
                      </div>
                      <div className={`mt-1.5 pt-1.5 border-t ${
                        p.isTeraCaptain ? "border-[var(--accent)]" : "border-[var(--background-tertiary)]"
                      }`}>
                        {abilities.map((a, abilityIdx) => {
                          const abilityName = typeof a === "string" ? a : a.name;
                          const description = abilityDescriptions[abilityName];
                          return (
                            <div
                              key={abilityIdx}
                              className={`relative group/tooltip ${
                                abilityIdx > 0 ? "border-t border-[var(--background-tertiary)]/50" : ""
                              }`}
                            >
                              <div className="text-gray-400 text-center capitalize py-0.5 cursor-help truncate" style={{ fontSize: "clamp(9px, 0.6vw, 12px)" }}>
                                {abilityName.replace(/-/g, " ")}
                              </div>
                              {description && (
                                <div className={`absolute bottom-full ${desktopTooltipAlign} mb-1 hidden group-hover/tooltip:block z-50`}>
                                  <div className="px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border border-[var(--background-tertiary)] shadow-lg w-48">
                                    <p className="text-[10px] font-bold text-white capitalize mb-1">{abilityName.replace(/-/g, " ")}</p>
                                    <p className="text-[11px] text-[var(--foreground-muted)]">{description}</p>
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
            </div>
          </div>

          {/* Type Charts with Speed Comparison in Center */}
          <div className="poke-card p-0 pb-2 overflow-hidden rounded-lg">
            <div className="p-4 border-b-2 border-[var(--background-tertiary)]">
              <div className="section-title !mb-0">
                <div className="section-title-icon">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3>Type Coverage</h3>
              </div>
            </div>

            {/* Mobile: Stacked layout */}
            <div className="lg:hidden p-3">
              {/* Top Team Name - at very top */}
              <div className="flex items-center gap-2 mb-2 pb-2 border-b-2 border-[#3b82f6]">
                {(() => {
                  const logo = isSwapped ? matchData?.coach2.teamLogoUrl : matchData?.coach1.teamLogoUrl;
                  return logo ? (
                    <img src={logo} alt="" className="w-5 h-5 object-contain" />
                  ) : (
                    <div className="w-5 h-5 rounded bg-[#2563eb] flex items-center justify-center shadow-[0_2px_0_#1d4ed8]">
                      <span className="text-white text-[8px] font-bold">{topTeamName.charAt(0)}</span>
                    </div>
                  );
                })()}
                <h4 className="font-bold text-sm text-[#3b82f6]">{topTeamName}</h4>
              </div>

              {/* Combined Type Charts - aligned columns using speedComparisonData */}
              <div className="overflow-x-auto">
                <table className="text-[9px] w-full" style={{ borderSpacing: "2px", borderCollapse: "separate", tableLayout: "fixed" }}>
                  <tbody>
                    {/* Top Team Type rows */}
                    {ALL_TYPES.map((type) => {
                      const { overall } = topTeamTypeChart[type];
                      return (
                        <tr key={`top-${type}`}>
                          <td className="px-0.5 py-1 text-[8px] font-bold text-white rounded text-center" style={{ backgroundColor: TYPE_COLORS[type] }}>
                            {type.slice(0, 3).toUpperCase()}
                          </td>
                          {speedComparisonData.map((row, idx) => {
                            if (!row.top) {
                              return <td key={idx} className="p-0.5 bg-[var(--background-tertiary)] rounded"></td>;
                            }
                            const mult = getDefensiveMultiplier(row.top.types.map(t => t.toLowerCase()), row.top.abilities, type);
                            return (
                              <td key={idx} className={`p-0.5 text-center font-mono font-bold rounded ${getMultiplierColor(mult)} ${row.top.isDropped ? "opacity-50" : ""}`}>
                                {mult !== 1 ? formatMultiplier(mult) : ""}
                              </td>
                            );
                          })}
                          <td className={`p-0.5 text-center text-[8px] font-bold rounded ${overall === "very_resist" || overall === "resist" ? "bg-[#38761d] text-[#d9ead3]" : overall === "very_weak" || overall === "weak" ? "bg-[#990000] text-[#f4cccc]" : "bg-[var(--background-secondary)]"}`}>
                            {overall === "very_resist" ? "++" : overall === "resist" ? "+" : overall === "very_weak" ? "--" : overall === "weak" ? "-" : ""}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Top team sprites row */}
                    <tr>
                      <td className="p-1"></td>
                      {speedComparisonData.map((row, idx) => {
                        const p = row.top;
                        return (
                          <td key={idx} className={`p-0.5 bg-[var(--background-secondary)] rounded text-center ${p?.isDropped ? "opacity-50" : ""}`} style={{ borderTop: p?.isTeraCaptain ? "3px solid #facc15" : "3px solid transparent", borderTopLeftRadius: "4px", borderTopRightRadius: "4px" }}>
                            {p?.spriteUrl && <img src={p.spriteUrl} alt={p.displayName || p.name} title={p.displayName || p.name} className="w-6 h-6 object-contain mx-auto" />}
                          </td>
                        );
                      })}
                      <td className="p-0.5"></td>
                    </tr>
                    {/* Top team speed tier */}
                    <tr>
                      <td className="p-0.5 text-[8px] text-[var(--foreground-muted)]">SPE</td>
                      {speedComparisonData.map((row, idx) => (
                        <td key={idx} className={`p-0.5 bg-[var(--background-tertiary)] rounded-t text-center ${row.top?.isDropped ? "opacity-50" : ""}`}>
                          <span className="text-[10px] font-bold tabular-nums text-white">{row.top?.speed ?? ""}</span>
                        </td>
                      ))}
                      <td className="p-0.5"></td>
                    </tr>
                    {/* Tiny gap between speed tiers */}
                    <tr style={{ height: "3px" }}><td colSpan={speedComparisonData.length + 2}></td></tr>
                    {/* Bottom team speed tier */}
                    <tr>
                      <td className="p-0.5 text-[8px] text-[var(--foreground-muted)]">SPE</td>
                      {speedComparisonData.map((row, idx) => (
                        <td key={idx} className={`p-0.5 bg-[var(--background-tertiary)] rounded-b text-center ${row.bottom?.isDropped ? "opacity-50" : ""}`}>
                          <span className="text-[10px] font-bold tabular-nums text-white">{row.bottom?.speed ?? ""}</span>
                        </td>
                      ))}
                      <td className="p-0.5"></td>
                    </tr>
                    {/* Bottom team sprites row */}
                    <tr>
                      <td className="p-1"></td>
                      {speedComparisonData.map((row, idx) => {
                        const p = row.bottom;
                        return (
                          <td key={idx} className={`p-0.5 bg-[var(--background-secondary)] rounded text-center ${p?.isDropped ? "opacity-50" : ""}`} style={{ borderBottom: p?.isTeraCaptain ? "3px solid #facc15" : "3px solid transparent", borderBottomLeftRadius: "4px", borderBottomRightRadius: "4px" }}>
                            {p?.spriteUrl && <img src={p.spriteUrl} alt={p.displayName || p.name} title={p.displayName || p.name} className="w-6 h-6 object-contain mx-auto" />}
                          </td>
                        );
                      })}
                      <td className="p-0.5"></td>
                    </tr>
                    {/* Bottom Team Type rows */}
                    {ALL_TYPES.map((type) => {
                      const { overall } = bottomTeamTypeChart[type];
                      return (
                        <tr key={`bottom-${type}`}>
                          <td className="px-0.5 py-1 text-[8px] font-bold text-white rounded text-center" style={{ backgroundColor: TYPE_COLORS[type] }}>
                            {type.slice(0, 3).toUpperCase()}
                          </td>
                          {speedComparisonData.map((row, idx) => {
                            if (!row.bottom) {
                              return <td key={idx} className="p-0.5 bg-[var(--background-tertiary)] rounded"></td>;
                            }
                            const mult = getDefensiveMultiplier(row.bottom.types.map(t => t.toLowerCase()), row.bottom.abilities, type);
                            return (
                              <td key={idx} className={`p-0.5 text-center font-mono font-bold rounded ${getMultiplierColor(mult)} ${row.bottom.isDropped ? "opacity-50" : ""}`}>
                                {mult !== 1 ? formatMultiplier(mult) : ""}
                              </td>
                            );
                          })}
                          <td className={`p-0.5 text-center text-[8px] font-bold rounded ${overall === "very_resist" || overall === "resist" ? "bg-[#38761d] text-[#d9ead3]" : overall === "very_weak" || overall === "weak" ? "bg-[#990000] text-[#f4cccc]" : "bg-[var(--background-secondary)]"}`}>
                            {overall === "very_resist" ? "++" : overall === "resist" ? "+" : overall === "very_weak" ? "--" : overall === "weak" ? "-" : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Team Name - at very bottom */}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t-2 border-[#ef4444] justify-end">
                <h4 className="font-bold text-sm text-[#ef4444]">{bottomTeamName}</h4>
                {(() => {
                  const logo = isSwapped ? matchData?.coach1.teamLogoUrl : matchData?.coach2.teamLogoUrl;
                  return logo ? (
                    <img src={logo} alt="" className="w-5 h-5 object-contain" />
                  ) : (
                    <div className="w-5 h-5 rounded bg-[#dc2626] flex items-center justify-center shadow-[0_2px_0_#991b1b]">
                      <span className="text-white text-[8px] font-bold">{bottomTeamName.charAt(0)}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Desktop: 3-column layout - Left Type Chart | Speed | Right Type Chart */}
            <div className="hidden lg:flex items-start px-1">
              {/* Left Type Chart (Top Team) */}
              <div className="flex-1 min-w-0 overflow-hidden py-2 pl-2 border-l-4 border-[#3b82f6]">
                {/* Team header with logo */}
                <div className="flex items-center justify-end gap-2 mb-2 pr-1 h-6">
                  <span className="font-bold text-xs text-[#3b82f6] truncate">{topTeamName}</span>
                  {(() => {
                    const teamLogo = isSwapped ? matchData?.coach2.teamLogoUrl : matchData?.coach1.teamLogoUrl;
                    return teamLogo ? (
                      <img src={teamLogo} alt="" className="w-6 h-6 object-contain" />
                    ) : (
                      <div className="w-6 h-6 rounded bg-[#2563eb] flex items-center justify-center shadow-[0_2px_0_#1d4ed8]">
                        <span className="text-white text-[8px] font-bold">{topTeamName.charAt(0)}</span>
                      </div>
                    );
                  })()}
                </div>
                <table className="w-full" style={{ borderSpacing: "1px", borderCollapse: "separate", fontSize: "clamp(8px, 0.55vw, 10px)", tableLayout: "fixed" }}>
                  <tbody>
                    {/* Pokemon rows */}
                    {topTeamBySpeed.map((p, idx) => (
                      <tr key={idx} style={{ height: "32px" }}>
                        {ALL_TYPES.map((type) => {
                          const mult = getDefensiveMultiplier(p.types.map(t => t.toLowerCase()), p.abilities, type);
                          return (
                            <td key={type} className={`p-0.5 text-center font-mono font-bold rounded ${getMultiplierColor(mult)} ${p.isDropped ? "opacity-50" : ""}`}>
                              {mult !== 1 ? formatMultiplier(mult) : ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Empty placeholder rows to align with other team */}
                    {Array.from({ length: Math.max(0, bottomTeamBySpeed.length - topTeamBySpeed.length) }).map((_, idx) => (
                      <tr key={`empty-${idx}`} style={{ height: "32px" }}>
                        {ALL_TYPES.map((type) => (
                          <td key={type} className="p-0.5 bg-[var(--background-tertiary)] rounded"></td>
                        ))}
                      </tr>
                    ))}
                    {/* +/- row */}
                    <tr style={{ height: "20px" }}>
                      {ALL_TYPES.map((type) => {
                        const { overall } = topTeamTypeChart[type];
                        return (
                          <td key={type} className={`p-0.5 text-center font-bold rounded ${overall === "very_resist" || overall === "resist" ? "bg-[#38761d] text-[#d9ead3]" : overall === "very_weak" || overall === "weak" ? "bg-[#990000] text-[#f4cccc]" : "bg-[var(--background-secondary)] text-[var(--foreground-muted)]"}`} style={{ fontSize: "clamp(7px, 0.5vw, 9px)" }}>
                            {overall === "very_resist" ? "++" : overall === "resist" ? "+" : overall === "very_weak" ? "--" : overall === "weak" ? "-" : ""}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Type row */}
                    <tr style={{ height: "20px" }}>
                      {ALL_TYPES.map((type) => (
                        <td key={type} className="p-0.5 font-bold text-white rounded text-center" style={{ backgroundColor: TYPE_COLORS[type] }}>
                          {type.slice(0, 3).toUpperCase()}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Speed Comparison - Center (simplified, links type charts) */}
              <div className="shrink-0 py-2">
                <div className="flex items-center justify-center gap-1 mb-2 h-6">
                  <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="font-bold text-sm text-[var(--accent)]">SPE</span>
                </div>
                <table style={{ borderSpacing: "1px", borderCollapse: "separate", fontSize: "12px" }}>
                  <tbody>
                    {/* Pokemon rows - matching type chart rows */}
                    {speedComparisonData.map((row, index) => (
                      <tr key={index} style={{ height: "32px" }}>
                        <td className={`px-2 bg-[var(--background-tertiary)] rounded-l ${row.top?.isDropped ? "opacity-50" : ""}`} style={{ borderLeft: row.top?.isTeraCaptain ? "3px solid #facc15" : "3px solid transparent", borderTopLeftRadius: "4px", borderBottomLeftRadius: "4px" }}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 flex items-center justify-center shrink-0">
                              {row.top?.spriteUrl ? (
                                <img src={row.top.spriteUrl} alt={row.top.displayName || row.top.name} title={row.top.displayName || row.top.name} className="w-6 h-6 object-contain scale-110" />
                              ) : row.top ? (
                                <span className="text-[var(--foreground-muted)] text-[8px]">?</span>
                              ) : null}
                            </div>
                            <span className="text-sm font-bold tabular-nums text-white">{row.top ? row.top.speed : ""}</span>
                          </div>
                        </td>
                        <td className={`px-2 bg-[var(--background-tertiary)] rounded-r ${row.bottom?.isDropped ? "opacity-50" : ""}`} style={{ borderRight: row.bottom?.isTeraCaptain ? "3px solid #facc15" : "3px solid transparent", borderTopRightRadius: "4px", borderBottomRightRadius: "4px" }}>
                          <div className="flex items-center gap-2.5 justify-end">
                            <span className="text-sm font-bold tabular-nums text-white">{row.bottom ? row.bottom.speed : ""}</span>
                            <div className="w-6 h-6 flex items-center justify-center shrink-0">
                              {row.bottom?.spriteUrl ? (
                                <img src={row.bottom.spriteUrl} alt={row.bottom.displayName || row.bottom.name} title={row.bottom.displayName || row.bottom.name} className="w-6 h-6 object-contain scale-110" />
                              ) : row.bottom ? (
                                <span className="text-[var(--foreground-muted)] text-[8px]">?</span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {/* Empty row to match +/- row */}
                    <tr style={{ height: "20px" }}>
                      <td colSpan={2} className="p-0.5 bg-[var(--background-secondary)] rounded"></td>
                    </tr>
                    {/* Empty row to match Type row */}
                    <tr style={{ height: "20px" }}>
                      <td colSpan={2} className="p-0.5 bg-[var(--background-secondary)] rounded"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Right Type Chart (Bottom Team) */}
              <div className="flex-1 min-w-0 overflow-hidden py-2 pr-2 border-r-4 border-[#ef4444]">
                {/* Team header with logo */}
                <div className="flex items-center justify-start gap-2 mb-2 pl-1 h-6">
                  {(() => {
                    const teamLogo = isSwapped ? matchData?.coach1.teamLogoUrl : matchData?.coach2.teamLogoUrl;
                    return teamLogo ? (
                      <img src={teamLogo} alt="" className="w-6 h-6 object-contain" />
                    ) : (
                      <div className="w-6 h-6 rounded bg-[#dc2626] flex items-center justify-center shadow-[0_2px_0_#991b1b]">
                        <span className="text-white text-[8px] font-bold">{bottomTeamName.charAt(0)}</span>
                      </div>
                    );
                  })()}
                  <span className="font-bold text-xs text-[#ef4444] truncate">{bottomTeamName}</span>
                </div>
                <table className="w-full" style={{ borderSpacing: "1px", borderCollapse: "separate", fontSize: "clamp(8px, 0.55vw, 10px)", tableLayout: "fixed" }}>
                  <tbody>
                    {/* Pokemon rows */}
                    {bottomTeamBySpeed.map((p, idx) => (
                      <tr key={idx} style={{ height: "32px" }}>
                        {ALL_TYPES.map((type) => {
                          const mult = getDefensiveMultiplier(p.types.map(t => t.toLowerCase()), p.abilities, type);
                          return (
                            <td key={type} className={`p-0.5 text-center font-mono font-bold rounded ${getMultiplierColor(mult)} ${p.isDropped ? "opacity-50" : ""}`}>
                              {mult !== 1 ? formatMultiplier(mult) : ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Empty placeholder rows to align with other team */}
                    {Array.from({ length: Math.max(0, topTeamBySpeed.length - bottomTeamBySpeed.length) }).map((_, idx) => (
                      <tr key={`empty-${idx}`} style={{ height: "32px" }}>
                        {ALL_TYPES.map((type) => (
                          <td key={type} className="p-0.5 bg-[var(--background-tertiary)] rounded"></td>
                        ))}
                      </tr>
                    ))}
                    {/* +/- row */}
                    <tr style={{ height: "20px" }}>
                      {ALL_TYPES.map((type) => {
                        const { overall } = bottomTeamTypeChart[type];
                        return (
                          <td key={type} className={`p-0.5 text-center font-bold rounded ${overall === "very_resist" || overall === "resist" ? "bg-[#38761d] text-[#d9ead3]" : overall === "very_weak" || overall === "weak" ? "bg-[#990000] text-[#f4cccc]" : "bg-[var(--background-secondary)] text-[var(--foreground-muted)]"}`} style={{ fontSize: "clamp(7px, 0.5vw, 9px)" }}>
                            {overall === "very_resist" ? "++" : overall === "resist" ? "+" : overall === "very_weak" ? "--" : overall === "weak" ? "-" : ""}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Type row */}
                    <tr style={{ height: "20px" }}>
                      {ALL_TYPES.map((type) => (
                        <td key={type} className="p-0.5 font-bold text-white rounded text-center" style={{ backgroundColor: TYPE_COLORS[type] }}>
                          {type.slice(0, 3).toUpperCase()}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Stats Comparison */}
          <div className={`poke-card p-0 overflow-hidden rounded-lg transition-opacity duration-200 ${prefsLoaded ? "opacity-100" : "opacity-0"}`}>
            <div className="p-4 border-b-2 border-[var(--background-tertiary)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="section-title !mb-0">
                  <div className="section-title-icon">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3>Stats Comparison</h3>
                </div>
                {/* Desktop sorting buttons */}
                <div className="hidden lg:flex flex-wrap gap-1">
                  {(["hp", "atk", "def", "spa", "spd", "spe", "bst"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatSort(s)}
                      className={`px-2 py-1 text-xs font-bold rounded ${
                        statSort === s
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-[var(--background-secondary)] text-[var(--foreground-muted)]"
                      }`}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid lg:grid-cols-2 gap-0">
              {/* Top Team Stats */}
              <div className="p-3 overflow-x-auto border-l-4 border-[#3b82f6]">
                <h4 className="font-bold text-xs mb-2 text-[#3b82f6]">{topTeamName}</h4>
                <table className="w-full table-fixed" style={{ borderSpacing: "1px", borderCollapse: "separate", fontSize: "11px" }}>
                  <colgroup>
                    <col style={{ width: "28%" }} />
                    <col /><col /><col /><col /><col /><col /><col />
                  </colgroup>
                  <thead>
                    <tr className="text-[var(--foreground-muted)]">
                      <th className="text-left px-1 py-1 font-normal bg-[var(--background-secondary)] rounded truncate">Pokemon</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "hp" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>HP</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "atk" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>ATK</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "def" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>DEF</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "spa" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPA</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "spd" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPD</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "spe" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPE</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "bst" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>BST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topTeamStatsSorted.map((p) => (
                      <tr key={p.id} className={p.isDropped ? "opacity-50" : ""}>
                        <td className="px-1 py-1 text-white font-bold bg-[var(--background-tertiary)] rounded truncate">{p.displayName || p.name}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "hp" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.hp}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "atk" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.attack}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "def" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.defense}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "spa" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.specialAttack}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "spd" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.specialDefense}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "spe" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.speed}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "bst" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.baseStatTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Empty spacer to align with other team - desktop only */}
                {bottomTeamStatsSorted.length > topTeamStatsSorted.length && (
                  <div className="hidden lg:block" style={{ height: `${(bottomTeamStatsSorted.length - topTeamStatsSorted.length) * 25}px` }} />
                )}
                <table className="w-full table-fixed mt-2" style={{ borderSpacing: "1px", borderCollapse: "separate", fontSize: "11px" }}>
                  <colgroup>
                    <col style={{ width: "28%" }} />
                    <col /><col /><col /><col /><col /><col /><col />
                  </colgroup>
                  <tbody>
                    <tr>
                      <td className="px-1 py-1 text-[var(--foreground-muted)] bg-[var(--background-secondary)] rounded">Avg</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{topTeamAvg.hp}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{topTeamAvg.atk}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{topTeamAvg.def}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{topTeamAvg.spa}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{topTeamAvg.spd}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{topTeamAvg.spe}</td>
                      <td className="text-center text-white px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{topTeamAvg.bst}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobile sorting buttons - between teams */}
              <div className="lg:hidden flex justify-center gap-1 py-3 border-t border-b border-[var(--background-tertiary)]">
                {(["hp", "atk", "def", "spa", "spd", "spe", "bst"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatSort(s)}
                    className={`px-2 py-1 text-xs font-bold rounded ${
                      statSort === s
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-[var(--background-secondary)] text-[var(--foreground-muted)]"
                    }`}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Bottom Team Stats */}
              <div className="p-3 overflow-x-auto border-r-4 border-[#ef4444]">
                <h4 className="font-bold text-xs mb-2 text-[#ef4444]">{bottomTeamName}</h4>
                <table className="w-full table-fixed" style={{ borderSpacing: "1px", borderCollapse: "separate", fontSize: "11px" }}>
                  <colgroup>
                    <col style={{ width: "28%" }} />
                    <col /><col /><col /><col /><col /><col /><col />
                  </colgroup>
                  <thead>
                    <tr className="text-[var(--foreground-muted)]">
                      <th className="text-left px-1 py-1 font-normal bg-[var(--background-secondary)] rounded truncate">Pokemon</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "hp" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>HP</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "atk" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>ATK</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "def" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>DEF</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "spa" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPA</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "spd" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPD</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "spe" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>SPE</th>
                      <th className={`text-center px-0.5 py-1 rounded ${statSort === "bst" ? "bg-emerald-500/20 text-emerald-300 font-bold" : "font-normal bg-[var(--background-secondary)]"}`}>BST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bottomTeamStatsSorted.map((p) => (
                      <tr key={p.id} className={p.isDropped ? "opacity-50" : ""}>
                        <td className="px-1 py-1 text-white font-bold bg-[var(--background-tertiary)] rounded truncate">{p.displayName || p.name}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "hp" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.hp}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "atk" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.attack}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "def" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.defense}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "spa" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.specialAttack}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "spd" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.specialDefense}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "spe" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.speed}</td>
                        <td className={`text-center px-0.5 py-1 rounded tabular-nums ${statSort === "bst" ? "bg-emerald-500/10 text-emerald-200 font-bold" : "text-[var(--foreground-muted)] bg-[var(--background-tertiary)]"}`}>{p.baseStatTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Empty spacer to align with other team - desktop only */}
                {topTeamStatsSorted.length > bottomTeamStatsSorted.length && (
                  <div className="hidden lg:block" style={{ height: `${(topTeamStatsSorted.length - bottomTeamStatsSorted.length) * 25}px` }} />
                )}
                <table className="w-full table-fixed mt-2" style={{ borderSpacing: "1px", borderCollapse: "separate", fontSize: "11px" }}>
                  <colgroup>
                    <col style={{ width: "28%" }} />
                    <col /><col /><col /><col /><col /><col /><col />
                  </colgroup>
                  <tbody>
                    <tr>
                      <td className="px-1 py-1 text-[var(--foreground-muted)] bg-[var(--background-secondary)] rounded">Avg</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{bottomTeamAvg.hp}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{bottomTeamAvg.atk}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{bottomTeamAvg.def}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{bottomTeamAvg.spa}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{bottomTeamAvg.spd}</td>
                      <td className="text-center text-[var(--foreground-muted)] px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{bottomTeamAvg.spe}</td>
                      <td className="text-center text-white px-0.5 py-1 bg-[var(--background-secondary)] rounded tabular-nums">{bottomTeamAvg.bst}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Speed Comparison Center */}
          <div id="speed-tiers" className={`poke-card scroll-mt-4 p-0 overflow-hidden transition-opacity duration-200 ${prefsLoaded ? "opacity-100" : "opacity-0"}`}>
            <div className="p-4 border-b-2 border-[var(--background-tertiary)]">
              <div className="section-title !mb-0">
                <div className="section-title-icon">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3>
                  <span className="lg:hidden">Speed Tiers</span>
                  <span className="hidden lg:inline">Speed Comparison Center</span>
                </h3>
                <button
                  type="button"
                  aria-label="Toggle speed tier settings"
                  aria-expanded={mobileSpeedFiltersOpen}
                  onClick={() => setMobileSpeedFiltersOpen((open) => !open)}
                  className={`ml-auto flex h-8 w-8 items-center justify-center rounded-md border transition-colors lg:hidden ${mobileSpeedFiltersOpen ? "border-[#ef4444] bg-[#ef4444]/15 text-[#ff8a8a]" : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)]"}`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 6h16M7 12h10M10 18h4" />
                  </svg>
                </button>
                <button
                  onClick={savePreferences}
                  disabled={saveStatus === "saving"}
                  className="ml-auto hidden shrink-0 items-center gap-1.5 rounded bg-[var(--background-tertiary)] px-2 py-1.5 text-[11px] text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-secondary)] hover:text-white disabled:opacity-50 sm:px-3 sm:text-xs lg:flex"
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
              </div>
              {usesStatPoints && (
                <p className="mt-2 hidden text-xs text-[var(--foreground-muted)] lg:block">
                  Season 11 uses 0–32 Stat Points per stat and 66 total per Pokemon. Stat Points are added to the level-50 stat before the nature multiplier is applied.
                </p>
              )}
            </div>
            <div className="p-2 lg:p-4">
              {/* Mobile speed ladder: compact PBO-native view inspired by grouped tier tools. */}
              <div className="rounded-xl border border-white/5 bg-[#151a22] p-2 lg:hidden">
                {mobileSpeedFiltersOpen && (
                  <div className="mb-2.5 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-2.5 shadow-lg">
                    <div className="mb-2 grid grid-cols-2 gap-1 rounded-md bg-[var(--background-tertiary)] p-1">
                      {([1, 2] as const).map((comparison) => (
                        <button
                          key={comparison}
                          type="button"
                          onClick={() => setMobileSpeedCompare(comparison)}
                          className={`rounded px-2 py-1.5 text-[10px] font-bold uppercase transition-colors ${mobileSpeedCompare === comparison ? "bg-[#ef4444] text-white" : "text-[var(--foreground-muted)]"}`}
                        >
                          Scenario {comparison}
                        </button>
                      ))}
                    </div>
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]">Field / trigger</label>
                    <select
                      value={mobileSpeedSettings.condition}
                      onChange={(event) => updateMobileSpeedSettings({ condition: event.target.value as SpeedCondition })}
                      className="mb-2 w-full rounded-md bg-[var(--background-tertiary)] px-2.5 py-2 text-xs font-bold text-white"
                    >
                      {SPEED_CONDITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <div className={`grid ${usesStatPoints ? "grid-cols-4" : "grid-cols-5"} gap-1.5`}>
                      <div>
                        <label className="mb-1 block text-center text-[8px] font-bold uppercase text-[var(--foreground-muted)]">Level</label>
                        <input type="number" value={usesStatPoints ? 50 : mobileSpeedSettings.level} disabled={usesStatPoints} onChange={(event) => updateMobileSpeedSettings({ level: Math.min(100, Math.max(1, parseInt(event.target.value) || 1)) })} className="w-full rounded bg-[var(--background-tertiary)] px-1 py-1.5 text-center text-[11px] font-bold text-white disabled:opacity-70 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                      </div>
                      {usesStatPoints ? (
                        <div>
                          <label className="mb-1 block text-center text-[8px] font-bold uppercase text-[var(--foreground-muted)]">SPs</label>
                          <input type="number" value={mobileSpeedSettings.sp} onChange={(event) => updateMobileSpeedSettings({ sp: Math.min(32, Math.max(0, parseInt(event.target.value) || 0)) })} className="w-full rounded bg-[var(--background-tertiary)] px-1 py-1.5 text-center text-[11px] font-bold text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="mb-1 block text-center text-[8px] font-bold uppercase text-[var(--foreground-muted)]">EVs</label>
                            <input type="number" value={mobileSpeedSettings.ev} onChange={(event) => updateMobileSpeedSettings({ ev: Math.min(252, Math.max(0, parseInt(event.target.value) || 0)) })} className="w-full rounded bg-[var(--background-tertiary)] px-1 py-1.5 text-center text-[11px] font-bold text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                          </div>
                          <div>
                            <label className="mb-1 block text-center text-[8px] font-bold uppercase text-[var(--foreground-muted)]">IVs</label>
                            <input type="number" value={mobileSpeedSettings.iv} onChange={(event) => updateMobileSpeedSettings({ iv: Math.min(31, Math.max(0, parseInt(event.target.value) || 0)) })} className="w-full rounded bg-[var(--background-tertiary)] px-1 py-1.5 text-center text-[11px] font-bold text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                          </div>
                        </>
                      )}
                      <div>
                        <label className="mb-1 block text-center text-[8px] font-bold uppercase text-[var(--foreground-muted)]">Boost</label>
                        <select value={mobileSpeedSettings.boost} onChange={(event) => updateMobileSpeedSettings({ boost: parseInt(event.target.value) })} className="w-full appearance-none rounded bg-[var(--background-tertiary)] px-1 py-1.5 text-center text-[11px] font-bold text-white">
                          {[6,5,4,3,2,1,0,-1,-2,-3,-4,-5,-6].map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-center text-[8px] font-bold uppercase text-[var(--foreground-muted)]">Nature</label>
                        <select value={mobileSpeedSettings.nature} onChange={(event) => updateMobileSpeedSettings({ nature: event.target.value as SpeedCalcSettings["nature"] })} className="w-full appearance-none rounded bg-[var(--background-tertiary)] px-1 py-1.5 text-center text-[11px] font-bold text-white">
                          <option value="positive">+</option>
                          <option value="neutral">○</option>
                          <option value="negative">−</option>
                        </select>
                      </div>
                    </div>
                    <button type="button" onClick={savePreferences} disabled={saveStatus === "saving"} className="mt-2 w-full rounded-md border border-[var(--background-tertiary)] py-1.5 text-[9px] font-bold uppercase text-[var(--foreground-muted)]">
                      {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Defaults saved" : "Save scenario defaults"}
                    </button>
                  </div>
                )}

                <div className="mb-1.5 flex items-center justify-between px-1 text-[9px] font-bold uppercase tracking-wide text-[var(--foreground-subtle)]">
                  <span>Scenario {mobileSpeedCompare}</span>
                  <span>{mobileConditionLabel} · Lv {usesStatPoints ? 50 : mobileSpeedSettings.level}</span>
                </div>
                <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-1.5">
                  <div>
                    <div className="mb-1 flex h-6 items-center justify-between px-1 text-[9px] font-bold uppercase text-[var(--foreground-muted)]">
                      <span>Base Speed</span>
                    </div>
                    <div className="space-y-0.5">
                      {allPokemonByBaseSpeed.map((pokemon, index) => {
                        const teamClasses = pokemon.team === "top"
                          ? "border-[#2468b1] bg-[#092b4d]"
                          : "border-[#a83a29] bg-[#4a1c16]";
                        return (
                          <div key={`mobile-base-${pokemon.team}-${pokemon.id}-${index}`} className={`flex h-8 items-center rounded-md border px-1 ${teamClasses} ${pokemon.isDropped ? "opacity-50" : ""}`}>
                            <img src={pokemon.spriteUrl || ""} alt={pokemon.displayName || pokemon.name} title={pokemon.displayName || pokemon.name} className="h-7 w-7 shrink-0 object-contain" />
                            <span className="ml-auto font-mono text-[11px] font-black tabular-nums text-white">{pokemon.speed}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex h-6 items-center justify-between px-1 text-[9px] font-bold uppercase text-[var(--foreground-muted)]">
                      <span>Calculated Tiers</span>
                      <span>{usesStatPoints ? "SP" : "EV"}</span>
                    </div>
                    <div className="space-y-0.5">
                      {mobileSpeedGroups.map((tier) => {
                        const effectLabels = Array.from(new Set(tier.entries.flatMap((pokemon) => pokemon.activeEffect ? [pokemon.activeEffect.label] : [])));
                        const teamClasses = tier.team === "top"
                          ? "border-[#2468b1] bg-[#092b4d]"
                          : "border-[#a83a29] bg-[#4a1c16]";
                        const speedColor = tier.team === "top" ? "text-[#78c7ff]" : "text-[#ff9a80]";
                        return (
                          <div key={`mobile-tier-${tier.speed}-${tier.team}`} className={`flex min-h-8 items-center gap-1 rounded-md border px-1.5 py-0.5 ${teamClasses}`}>
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
                              {tier.entries.map((pokemon, index) => (
                                <img key={`${pokemon.team}-${pokemon.id}-${index}`} src={pokemon.spriteUrl || ""} alt={pokemon.displayName || pokemon.name} title={pokemon.displayName || pokemon.name} className={`h-7 w-7 object-contain ${pokemon.isDropped ? "opacity-50" : ""}`} />
                              ))}
                              <span className="rounded-full border border-white/20 bg-black/15 px-1 py-0.5 text-[7px] font-bold leading-none text-white/80">{mobileInvestmentLabel}</span>
                              {effectLabels.map((label) => (
                                <span key={label} className="max-w-full truncate rounded-full border border-amber-300/40 bg-amber-300/10 px-1 py-0.5 text-[7px] font-bold leading-none text-amber-100">{label}</span>
                              ))}
                            </div>
                            <span className={`font-mono text-[13px] font-black tabular-nums ${speedColor}`}>{tier.speed}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <p className="mt-2 px-1 text-[8px] leading-relaxed text-[var(--foreground-subtle)]">
                  Ability pills appear only when their trigger is selected. Protosynthesis and Quark Drive assume Speed is boosted.
                </p>
              </div>

              <div className="hidden lg:flex lg:flex-row gap-4">
                {/* BASE SPEED Section - narrower since no controls */}
                <div className="w-full lg:w-60 lg:shrink-0 bg-[var(--background-secondary)] rounded-lg p-3">
                  <button
                    className="lg:cursor-default w-full flex items-center justify-between lg:justify-center gap-2 mb-3 lg:mb-3"
                    onClick={() => setSpeedSectionOpen(prev => ({ ...prev, base: !prev.base }))}
                  >
                    <h4 className="font-bold text-xs text-[var(--foreground-muted)]">BASE SPEED</h4>
                    <svg className={`w-4 h-4 text-[var(--foreground-muted)] lg:hidden transition-transform ${speedSectionOpen.base ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className={`space-y-1 ${speedSectionOpen.base ? "block" : "hidden"} lg:block`}>
                    {allPokemonByBaseSpeed.map((p, idx) => (
                      <div key={`base-${p.id}-${idx}`} className={`flex items-center gap-2 px-2 py-1 rounded bg-[var(--background-tertiary)] ${p.team === "top" ? "border-l-2 border-[#3b82f6]" : "border-l-2 border-[#ef4444]"} ${p.isDropped ? "opacity-50" : ""}`}>
                        <img src={p.spriteUrl || ""} alt="" className="w-5 h-5 object-contain" />
                        <span className="text-xs font-medium truncate flex-1 text-white">{p.displayName || p.name}</span>
                        <span className="text-xs font-bold font-mono tabular-nums text-white">{p.speed}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="hidden lg:block w-px bg-[var(--background-tertiary)]" />

                {/* COMPARE #1 Section - Controls + Table */}
                <div className="w-full lg:flex-1 bg-[var(--background-secondary)] rounded-lg p-3">
                  <button
                    className="lg:cursor-default w-full flex items-center justify-between lg:justify-center gap-2 mb-3 lg:mb-3"
                    onClick={() => setSpeedSectionOpen(prev => ({ ...prev, compare1: !prev.compare1 }))}
                  >
                    <h4 className="font-bold text-xs text-[var(--foreground-muted)]">COMPARE #1</h4>
                    <svg className={`w-4 h-4 text-[var(--foreground-muted)] lg:hidden transition-transform ${speedSectionOpen.compare1 ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className={`flex flex-col lg:flex-row gap-3 ${speedSectionOpen.compare1 ? "flex" : "hidden"} lg:flex`}>
                    {/* Controls */}
                    <div className={`w-full lg:w-28 lg:shrink-0 grid ${usesStatPoints ? "grid-cols-4" : "grid-cols-5"} lg:grid-cols-1 gap-2 lg:space-y-2 lg:gap-0`}>
                      <div>
                        <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">Level</label>
                        <input type="number" value={usesStatPoints ? 50 : speedCalc1.level} disabled={usesStatPoints} onChange={(e) => setSpeedCalc1({...speedCalc1, level: Math.min(100, Math.max(1, parseInt(e.target.value) || 1))})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" min={1} max={100} />
                      </div>
                      {usesStatPoints ? (
                        <div>
                          <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">SPs</label>
                          <input type="number" value={speedCalc1.sp ?? 32} onChange={(e) => setSpeedCalc1({...speedCalc1, sp: Math.min(32, Math.max(0, parseInt(e.target.value) || 0))})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" min={0} max={32} />
                        </div>
                      ) : (<>
                        <div><label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">EVs</label><input type="number" value={speedCalc1.ev} onChange={(e) => setSpeedCalc1({...speedCalc1, ev: Math.min(252, Math.max(0, parseInt(e.target.value) || 0))})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" min={0} max={252} step={4} /></div>
                        <div><label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">IVs</label><input type="number" value={speedCalc1.iv} onChange={(e) => setSpeedCalc1({...speedCalc1, iv: Math.min(31, Math.max(0, parseInt(e.target.value) || 0))})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" min={0} max={31} /></div>
                      </>)}
                      <div>
                        <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">Boost</label>
                        <select value={speedCalc1.boost} onChange={(e) => setSpeedCalc1({...speedCalc1, boost: parseInt(e.target.value)})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium appearance-none cursor-pointer">
                          {[6,5,4,3,2,1,0,-1,-2,-3,-4,-5,-6].map(v => <option key={v} value={v}>{v > 0 ? `+${v}` : v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">Nature</label>
                        <select value={speedCalc1.nature} onChange={(e) => setSpeedCalc1({...speedCalc1, nature: e.target.value as "positive" | "neutral" | "negative"})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium appearance-none cursor-pointer">
                          <option value="positive">+</option>
                          <option value="neutral">○</option>
                          <option value="negative">−</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">Field / Trigger</label>
                        <select value={speedCalc1.condition} onChange={(e) => setSpeedCalc1({...speedCalc1, condition: e.target.value as SpeedCondition})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-[11px] font-medium cursor-pointer">
                          {SPEED_CONDITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {/* Table */}
                    <div className="flex-1 space-y-1">
                      {speedCompare1.map((p, idx) => (
                        <div key={`c1-${p.id}-${idx}`} className={`flex items-center gap-2 px-2 py-1 rounded bg-[var(--background-tertiary)] ${p.team === "top" ? "border-l-2 border-[#3b82f6]" : "border-l-2 border-[#ef4444]"} ${p.isDropped ? "opacity-50" : ""}`}>
                          <img src={p.spriteUrl || ""} alt="" className="w-5 h-5 object-contain" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-white">{p.displayName || p.name}</span>
                            {p.activeEffect && <span className="mt-0.5 block truncate text-[8px] font-bold text-amber-300">{p.activeEffect.label}</span>}
                          </span>
                          <span className="text-xs font-bold font-mono tabular-nums text-white">{p.calculatedSpeed}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="hidden lg:block w-px bg-[var(--background-tertiary)]" />

                {/* COMPARE #2 Section - Controls + Table */}
                <div className="w-full lg:flex-1 bg-[var(--background-secondary)] rounded-lg p-3">
                  <button
                    className="lg:cursor-default w-full flex items-center justify-between lg:justify-center gap-2 mb-3 lg:mb-3"
                    onClick={() => setSpeedSectionOpen(prev => ({ ...prev, compare2: !prev.compare2 }))}
                  >
                    <h4 className="font-bold text-xs text-[var(--foreground-muted)]">COMPARE #2</h4>
                    <svg className={`w-4 h-4 text-[var(--foreground-muted)] lg:hidden transition-transform ${speedSectionOpen.compare2 ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className={`flex flex-col lg:flex-row gap-3 ${speedSectionOpen.compare2 ? "flex" : "hidden"} lg:flex`}>
                    {/* Controls */}
                    <div className={`w-full lg:w-28 lg:shrink-0 grid ${usesStatPoints ? "grid-cols-4" : "grid-cols-5"} lg:grid-cols-1 gap-2 lg:space-y-2 lg:gap-0`}>
                      <div>
                        <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">Level</label>
                        <input type="number" value={usesStatPoints ? 50 : speedCalc2.level} disabled={usesStatPoints} onChange={(e) => setSpeedCalc2({...speedCalc2, level: Math.min(100, Math.max(1, parseInt(e.target.value) || 1))})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" min={1} max={100} />
                      </div>
                      {usesStatPoints ? (
                        <div>
                          <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">SPs</label>
                          <input type="number" value={speedCalc2.sp ?? 32} onChange={(e) => setSpeedCalc2({...speedCalc2, sp: Math.min(32, Math.max(0, parseInt(e.target.value) || 0))})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" min={0} max={32} />
                        </div>
                      ) : (<>
                        <div><label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">EVs</label><input type="number" value={speedCalc2.ev} onChange={(e) => setSpeedCalc2({...speedCalc2, ev: Math.min(252, Math.max(0, parseInt(e.target.value) || 0))})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" min={0} max={252} step={4} /></div>
                        <div><label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">IVs</label><input type="number" value={speedCalc2.iv} onChange={(e) => setSpeedCalc2({...speedCalc2, iv: Math.min(31, Math.max(0, parseInt(e.target.value) || 0))})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" min={0} max={31} /></div>
                      </>)}
                      <div>
                        <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">Boost</label>
                        <select value={speedCalc2.boost} onChange={(e) => setSpeedCalc2({...speedCalc2, boost: parseInt(e.target.value)})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium appearance-none cursor-pointer">
                          {[6,5,4,3,2,1,0,-1,-2,-3,-4,-5,-6].map(v => <option key={v} value={v}>{v > 0 ? `+${v}` : v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">Nature</label>
                        <select value={speedCalc2.nature} onChange={(e) => setSpeedCalc2({...speedCalc2, nature: e.target.value as "positive" | "neutral" | "negative"})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-center text-xs lg:text-sm font-medium appearance-none cursor-pointer">
                          <option value="positive">+</option>
                          <option value="neutral">○</option>
                          <option value="negative">−</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[var(--foreground-muted)] block mb-1 font-medium text-[10px] lg:text-[11px]">Field / Trigger</label>
                        <select value={speedCalc2.condition} onChange={(e) => setSpeedCalc2({...speedCalc2, condition: e.target.value as SpeedCondition})} className="w-full px-1 lg:px-2 py-1.5 bg-[var(--background-tertiary)] rounded text-white text-[11px] font-medium cursor-pointer">
                          {SPEED_CONDITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {/* Table */}
                    <div className="flex-1 space-y-1">
                      {speedCompare2.map((p, idx) => (
                        <div key={`c2-${p.id}-${idx}`} className={`flex items-center gap-2 px-2 py-1 rounded bg-[var(--background-tertiary)] ${p.team === "top" ? "border-l-2 border-[#3b82f6]" : "border-l-2 border-[#ef4444]"} ${p.isDropped ? "opacity-50" : ""}`}>
                          <img src={p.spriteUrl || ""} alt="" className="w-5 h-5 object-contain" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-white">{p.displayName || p.name}</span>
                            {p.activeEffect && <span className="mt-0.5 block truncate text-[8px] font-bold text-amber-300">{p.activeEffect.label}</span>}
                          </span>
                          <span className="text-xs font-bold font-mono tabular-nums text-white">{p.calculatedSpeed}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Move Coverage */}
          <div className="poke-card p-0 overflow-hidden rounded-lg">
            <div className="p-4 border-b-2 border-[var(--background-tertiary)]">
              <div className="section-title !mb-0">
                <div className="section-title-icon">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <h3>Move Coverage</h3>
              </div>
            </div>
            <div className="p-2 lg:p-4">
              {/* Main container with team accent lines on edges */}
              <div className="flex">
                {/* Left accent line */}
                <div className="w-0.5 lg:w-1 bg-[#3b82f6] rounded-full shrink-0" />

                {/* Content */}
                <div className="flex-1 px-1.5 lg:px-3">
                  {/* Team Names Header */}
                  <div className="flex items-center mb-2 lg:mb-3" style={{ height: "28px" }}>
                    <div className="flex-1 flex justify-end items-center pr-1 lg:pr-2">
                      <span className="text-xs lg:text-sm font-bold text-[#3b82f6] truncate">
                        <span className="lg:hidden">{topTeamAbbr || topTeamName}</span>
                        <span className="hidden lg:inline">{topTeamName}</span>
                      </span>
                    </div>
                    <div className="w-20 lg:w-40 shrink-0 flex items-center justify-center text-center">
                      <span className="text-[10px] lg:text-xs font-bold uppercase text-[var(--foreground-muted)]">Move</span>
                    </div>
                    <div className="flex-1 flex justify-start items-center pl-1 lg:pl-2">
                      <span className="text-xs lg:text-sm font-bold text-[#ef4444] truncate">
                        <span className="lg:hidden">{bottomTeamAbbr || bottomTeamName}</span>
                        <span className="hidden lg:inline">{bottomTeamName}</span>
                      </span>
                    </div>
                  </div>
                  {MOVE_CATEGORIES.map(({ category, moves }) => (
                    <div key={category} className="mb-4 last:mb-0">
                      <div className="flex items-center justify-center mb-1.5">
                        <div className="flex-1 h-px bg-[var(--background-tertiary)]" />
                        <h4 className="px-3 font-bold text-xs uppercase text-white">{category}</h4>
                        <div className="flex-1 h-px bg-[var(--background-tertiary)]" />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2px" }}>
                        {moves.map((move) => {
                          const topTeamWithMove = topTeamPokemon.filter((p) =>
                            p.moves.includes(move)
                          );
                          const bottomTeamWithMove = bottomTeamPokemon.filter((p) =>
                            p.moves.includes(move)
                          );
                          const moveType = moveTypes[move];
                          const displayName = move.replace(/-/g, " ");
                          return (
                            <div key={move} className="flex items-stretch min-h-[22px] lg:min-h-[26px]">
                              {/* Top Team Sprites (left side) */}
                              <div className="flex-1 flex flex-wrap justify-end items-center content-center gap-0.5 lg:gap-1 bg-[var(--background-tertiary)] rounded-l px-1 lg:px-2">
                                {topTeamWithMove.length > 0 ? (
                                  topTeamWithMove.map((p) => (
                                    <img
                                      key={p.id}
                                      src={p.spriteUrl || ""}
                                      alt={p.displayName || p.name}
                                      title={p.displayName || p.name}
                                      className={`w-5 h-5 lg:w-6 lg:h-6 object-contain scale-110 ${p.isDropped ? "opacity-50" : ""}`}
                                    />
                                  ))
                                ) : (
                                  <span className="text-[10px] lg:text-xs text-[var(--foreground-subtle)]">—</span>
                                )}
                              </div>
                              {/* Move Name (center) */}
                              <div
                                className="w-20 lg:w-40 shrink-0 flex items-center justify-center text-white text-[9px] lg:text-xs font-medium capitalize rounded"
                                style={{ backgroundColor: moveType ? TYPE_COLORS[moveType] : "var(--background-secondary)" }}
                              >
                                {displayName}
                              </div>
                              {/* Bottom Team Sprites (right side) */}
                              <div className="flex-1 flex flex-wrap justify-start items-center content-center gap-0.5 lg:gap-1 bg-[var(--background-tertiary)] rounded-r px-1 lg:px-2">
                                {bottomTeamWithMove.length > 0 ? (
                                  bottomTeamWithMove.map((p) => (
                                    <img
                                      key={p.id}
                                      src={p.spriteUrl || ""}
                                      alt={p.displayName || p.name}
                                      title={p.displayName || p.name}
                                      className={`w-5 h-5 lg:w-6 lg:h-6 object-contain scale-110 ${p.isDropped ? "opacity-50" : ""}`}
                                    />
                                  ))
                                ) : (
                                  <span className="text-[10px] lg:text-xs text-[var(--foreground-subtle)]">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right accent line */}
                <div className="w-0.5 lg:w-1 bg-[#ef4444] rounded-full shrink-0" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
