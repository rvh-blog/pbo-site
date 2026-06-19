"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface PokemonData {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl: string | null;
  types: string[] | null;
  moves: string[] | null;
  price: number;
  teraBanned: boolean | null;
  teraCaptainCost: number | null;
  complexBanReason: string | null;
  hp: number | null;
  attack: number | null;
  defense: number | null;
  specialAttack: number | null;
  specialDefense: number | null;
  speed: number | null;
}

interface Ownership {
  [pokemonId: number]: {
    teamAbbr: string;
    teamName: string;
  };
}

interface DraftBoardGridProps {
  allPokemon: PokemonData[];
  complexBans: PokemonData[];
  ownership: Ownership;
}

type ViewMode = "price" | "type";
type SortOption = "name" | "price" | "hp" | "attack" | "defense" | "specialAttack" | "specialDefense" | "speed";

const SORT_OPTIONS: { value: SortOption; label: string; shortLabel: string }[] = [
  { value: "name", label: "Name (A-Z)", shortLabel: "Name" },
  { value: "price", label: "Price", shortLabel: "Price" },
  { value: "hp", label: "HP", shortLabel: "HP" },
  { value: "attack", label: "Attack", shortLabel: "Atk" },
  { value: "defense", label: "Defense", shortLabel: "Def" },
  { value: "specialAttack", label: "Sp. Atk", shortLabel: "SpA" },
  { value: "specialDefense", label: "Sp. Def", shortLabel: "SpD" },
  { value: "speed", label: "Speed", shortLabel: "Spe" },
];

const TYPE_ORDER = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy"
];

const TYPE_COLORS: Record<string, string> = {
  normal: "bg-gray-400/20 text-gray-300 border-gray-400/30",
  fire: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  water: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  electric: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
  grass: "bg-green-500/20 text-green-400 border-green-500/30",
  ice: "bg-cyan-400/20 text-cyan-300 border-cyan-400/30",
  fighting: "bg-red-600/20 text-red-400 border-red-600/30",
  poison: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  ground: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  flying: "bg-indigo-400/20 text-indigo-300 border-indigo-400/30",
  psychic: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  bug: "bg-lime-500/20 text-lime-400 border-lime-500/30",
  rock: "bg-stone-500/20 text-stone-400 border-stone-500/30",
  ghost: "bg-violet-600/20 text-violet-400 border-violet-600/30",
  dragon: "bg-indigo-600/20 text-indigo-400 border-indigo-600/30",
  dark: "bg-stone-700/20 text-stone-400 border-stone-700/30",
  steel: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  fairy: "bg-pink-400/20 text-pink-300 border-pink-400/30",
};

// Move filter categories
const MOVE_CATEGORIES = {
  hazardRemoval: {
    label: "Hazard Removal",
    moves: [
      { id: "rapid-spin", name: "Rapid Spin" },
      { id: "defog", name: "Defog" },
      { id: "mortal-spin", name: "Mortal Spin" },
      { id: "tidy-up", name: "Tidy Up" },
      { id: "court-change", name: "Court Change" },
    ],
  },
  hazardSetters: {
    label: "Hazard Setters",
    moves: [
      { id: "stealth-rock", name: "Stealth Rock" },
      { id: "spikes", name: "Spikes" },
      { id: "toxic-spikes", name: "Toxic Spikes" },
      { id: "sticky-web", name: "Sticky Web" },
      { id: "ceaseless-edge", name: "Ceaseless Edge" },
      { id: "stone-axe", name: "Stone Axe" },
    ],
  },
  pivotMoves: {
    label: "Pivot Moves",
    moves: [
      { id: "u-turn", name: "U-Turn" },
      { id: "volt-switch", name: "Volt Switch" },
      { id: "flip-turn", name: "Flip Turn" },
      { id: "parting-shot", name: "Parting Shot" },
      { id: "teleport", name: "Teleport" },
      { id: "chilly-reception", name: "Chilly Reception" },
      { id: "shed-tail", name: "Shed Tail" },
    ],
  },
  utility: {
    label: "Utility (vs Foe)",
    moves: [
      { id: "will-o-wisp", name: "Will-O-Wisp" },
      { id: "thunder-wave", name: "Thunder Wave" },
      { id: "toxic", name: "Toxic" },
      { id: "glare", name: "Glare" },
      { id: "taunt", name: "Taunt" },
      { id: "encore", name: "Encore" },
      { id: "whirlwind", name: "Whirlwind" },
      { id: "roar", name: "Roar" },
      { id: "dragon-tail", name: "Dragon Tail" },
      { id: "circle-throw", name: "Circle Throw" },
      { id: "trick", name: "Trick" },
      { id: "switcheroo", name: "Switcheroo" },
      { id: "yawn", name: "Yawn" },
      { id: "knock-off", name: "Knock Off" },
    ],
  },
  support: {
    label: "Support (Team)",
    moves: [
      { id: "wish", name: "Wish" },
      { id: "healing-wish", name: "Healing Wish" },
      { id: "lunar-dance", name: "Lunar Dance" },
      { id: "aromatherapy", name: "Aromatherapy" },
      { id: "heal-bell", name: "Heal Bell" },
      { id: "tailwind", name: "Tailwind" },
      { id: "trick-room", name: "Trick Room" },
      { id: "reflect", name: "Reflect" },
      { id: "light-screen", name: "Light Screen" },
      { id: "aurora-veil", name: "Aurora Veil" },
      { id: "haze", name: "Haze" },
      { id: "memento", name: "Memento" },
    ],
  },
  priority: {
    label: "Priority Moves",
    moves: [
      { id: "fake-out", name: "Fake Out" },
      { id: "first-impression", name: "First Impression" },
      { id: "extreme-speed", name: "Extreme Speed" },
      { id: "accelerock", name: "Accelerock" },
      { id: "aqua-jet", name: "Aqua Jet" },
      { id: "bullet-punch", name: "Bullet Punch" },
      { id: "ice-shard", name: "Ice Shard" },
      { id: "jet-punch", name: "Jet Punch" },
      { id: "mach-punch", name: "Mach Punch" },
      { id: "quick-attack", name: "Quick Attack" },
      { id: "shadow-sneak", name: "Shadow Sneak" },
      { id: "sucker-punch", name: "Sucker Punch" },
      { id: "vacuum-wave", name: "Vacuum Wave" },
      { id: "water-shuriken", name: "Water Shuriken" },
      { id: "grassy-glide", name: "Grassy Glide" },
    ],
  },
} as const;

type MoveFilterState = {
  [category: string]: {
    allSelected: boolean;
    moves: { [moveId: string]: boolean };
  };
};

function getSortValue(poke: PokemonData, sortBy: SortOption): number | null {
  if (sortBy === "name") return null;
  if (sortBy === "price") return poke.price;
  return poke[sortBy];
}

function sortPokemon(pokemon: PokemonData[], sortBy: SortOption): PokemonData[] {
  return [...pokemon].sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "price") {
      return (b.price ?? 0) - (a.price ?? 0);
    }
    const aVal = a[sortBy] ?? 0;
    const bVal = b[sortBy] ?? 0;
    return bVal - aVal;
  });
}

export function DraftBoardGrid({
  allPokemon,
  complexBans,
  ownership,
}: DraftBoardGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("price");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [showMoveFilter, setShowMoveFilter] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [moveFilters, setMoveFilters] = useState<MoveFilterState>(() => {
    const initial: MoveFilterState = {};
    for (const [key, category] of Object.entries(MOVE_CATEGORIES)) {
      initial[key] = {
        allSelected: false,
        moves: Object.fromEntries(category.moves.map(m => [m.id, false])),
      };
    }
    return initial;
  });

  // Get active move filters for filtering
  const activeMoveFilters = useMemo(() => {
    const active: string[] = [];
    for (const [, category] of Object.entries(moveFilters)) {
      for (const [moveId, isSelected] of Object.entries(category.moves)) {
        if (isSelected) active.push(moveId);
      }
    }
    return active;
  }, [moveFilters]);

  const hasMoveFilters = activeMoveFilters.length > 0;

  // Toggle a specific move filter
  function toggleMoveFilter(categoryKey: string, moveId: string) {
    setMoveFilters(prev => {
      const newState = { ...prev };
      const category = { ...newState[categoryKey] };
      category.moves = { ...category.moves, [moveId]: !category.moves[moveId] };
      // Update allSelected based on whether all moves in category are now selected
      const categoryMoves = MOVE_CATEGORIES[categoryKey as keyof typeof MOVE_CATEGORIES].moves;
      category.allSelected = categoryMoves.every(m => category.moves[m.id]);
      newState[categoryKey] = category;
      return newState;
    });
  }

  // Toggle entire category
  function toggleCategory(categoryKey: string) {
    setMoveFilters(prev => {
      const newState = { ...prev };
      const category = { ...newState[categoryKey] };
      const newValue = !category.allSelected;
      category.allSelected = newValue;
      const categoryMoves = MOVE_CATEGORIES[categoryKey as keyof typeof MOVE_CATEGORIES].moves;
      category.moves = Object.fromEntries(categoryMoves.map(m => [m.id, newValue]));
      newState[categoryKey] = category;
      return newState;
    });
  }

  // Clear all move filters
  function clearMoveFilters() {
    setMoveFilters(prev => {
      const newState: MoveFilterState = {};
      for (const [key, category] of Object.entries(prev)) {
        newState[key] = {
          allSelected: false,
          moves: Object.fromEntries(Object.keys(category.moves).map(m => [m, false])),
        };
      }
      return newState;
    });
  }

  // Toggle category expansion
  function toggleCategoryExpand(categoryKey: string) {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryKey)) {
        newSet.delete(categoryKey);
      } else {
        newSet.add(categoryKey);
      }
      return newSet;
    });
  }

  // Get count of selected moves in a category
  function getCategorySelectedCount(categoryKey: string): number {
    const category = moveFilters[categoryKey];
    if (!category) return 0;
    return Object.values(category.moves).filter(Boolean).length;
  }

  // Filter Pokemon based on availability and move filters
  // Complex bans are included in allPokemon and shown in their price tiers
  const filteredPokemon = useMemo(() => {
    let result = allPokemon;

    if (showAvailableOnly) {
      result = result.filter((poke) => !ownership[poke.id]);
    }

    if (hasMoveFilters) {
      result = result.filter((poke) => {
        const pokeMoves = poke.moves || [];
        // Pokemon must have at least one of the selected moves
        return activeMoveFilters.some(moveId => pokeMoves.includes(moveId));
      });
    }

    return result;
  }, [allPokemon, ownership, showAvailableOnly, hasMoveFilters, activeMoveFilters]);

  // Complex bans also shown separately as a warning column
  const filteredComplexBans = useMemo(() => {
    let result = complexBans;

    if (showAvailableOnly) {
      result = result.filter((poke) => !ownership[poke.id]);
    }

    if (hasMoveFilters) {
      result = result.filter((poke) => {
        const pokeMoves = poke.moves || [];
        return activeMoveFilters.some(moveId => pokeMoves.includes(moveId));
      });
    }

    return result;
  }, [complexBans, ownership, showAvailableOnly, hasMoveFilters, activeMoveFilters]);

  // Group Pokemon by price tier
  const priceTiers = useMemo(() => {
    const tiers: Record<number, PokemonData[]> = {};
    for (const poke of filteredPokemon) {
      if (!tiers[poke.price]) {
        tiers[poke.price] = [];
      }
      tiers[poke.price].push(poke);
    }
    for (const price in tiers) {
      tiers[price] = sortPokemon(tiers[price], sortBy);
    }
    return tiers;
  }, [filteredPokemon, sortBy]);

  const sortedPrices = useMemo(() => {
    return Object.keys(priceTiers)
      .map(Number)
      .sort((a, b) => b - a);
  }, [priceTiers]);

  // Group Pokemon by type - Pokemon appears in ALL matching type columns
  const typeTiers = useMemo(() => {
    const tiers: Record<string, PokemonData[]> = {};
    for (const poke of filteredPokemon) {
      const types = poke.types || ["normal"];
      for (const type of types) {
        const normalizedType = type.toLowerCase();
        if (!tiers[normalizedType]) {
          tiers[normalizedType] = [];
        }
        tiers[normalizedType].push(poke);
      }
    }
    for (const type in tiers) {
      tiers[type] = sortPokemon(tiers[type], sortBy);
    }
    return tiers;
  }, [filteredPokemon, sortBy]);

  const sortedTypes = useMemo(() => {
    return TYPE_ORDER.filter((type) => typeTiers[type]?.length > 0);
  }, [typeTiers]);

  const sortedComplexBans = useMemo(() => {
    return sortPokemon(filteredComplexBans, sortBy);
  }, [filteredComplexBans, sortBy]);

  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.shortLabel || "";
  const showSortValue = sortBy !== "name";

  const renderPokemonRow = (poke: PokemonData, showPrice: boolean = false, keyPrefix: string = "") => {
    const owner = ownership[poke.id];
    const isTaken = !!owner;
    const sortValue = getSortValue(poke, sortBy);

    return (
      <Link
        key={`${keyPrefix}-${poke.id}`}
        href={`/pokemon/${poke.id}`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors border-b border-[var(--background-tertiary)]/50 ${
          isTaken
            ? "bg-[var(--background)]/30 opacity-50"
            : "hover:bg-[var(--background-tertiary)]/50"
        }`}
      >
        {poke.spriteUrl && (
          <img src={poke.spriteUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        )}
        <span className="flex-1 font-medium text-[13px] leading-tight" title={poke.displayName || poke.name}>
          {poke.displayName || poke.name}
        </span>
        {showPrice && sortBy === "name" && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--secondary)]/20 text-[var(--secondary)] flex-shrink-0">
            {poke.price}
          </span>
        )}
        {showSortValue && sortValue !== null && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--secondary)]/20 text-[var(--secondary)] flex-shrink-0" title={currentSortLabel}>
            {sortValue}
          </span>
        )}
        {poke.teraBanned && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--error)]/20 text-[var(--error)] flex-shrink-0">
            B
          </span>
        )}
        {poke.teraCaptainCost !== null && !poke.teraBanned && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--accent)]/20 text-[var(--accent)] flex-shrink-0">
            {poke.teraCaptainCost}
          </span>
        )}
        {poke.complexBanReason && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--warning)]/20 text-[var(--warning)] border border-[var(--warning)]/30 flex-shrink-0" title={`No ${poke.complexBanReason}`}>
            !
          </span>
        )}
        {isTaken && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--primary)] text-white flex-shrink-0" title={owner.teamName}>
            {owner.teamAbbr}
          </span>
        )}
      </Link>
    );
  };

  const renderComplexBanRow = (poke: PokemonData, keyPrefix: string = "cb") => {
    const owner = ownership[poke.id];
    const isTaken = !!owner;
    return (
      <Link
        key={`${keyPrefix}-${poke.id}`}
        href={`/pokemon/${poke.id}`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors border-b border-[var(--warning)]/20 ${
          isTaken
            ? "bg-[var(--background)]/30 opacity-50"
            : "hover:bg-[var(--warning)]/10"
        }`}
      >
        {poke.spriteUrl && (
          <img src={poke.spriteUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-[13px] leading-tight block" title={poke.displayName || poke.name}>
            {poke.displayName || poke.name}
          </span>
          {poke.complexBanReason && (
            <span className="text-[var(--warning)] text-[10px] font-medium">
              No {poke.complexBanReason}
            </span>
          )}
        </div>
        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--secondary)]/20 text-[var(--secondary)] flex-shrink-0">
          {poke.price}
        </span>
        {poke.teraCaptainCost !== null && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--accent)]/20 text-[var(--accent)] flex-shrink-0">
            {poke.teraCaptainCost}
          </span>
        )}
        {isTaken && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--primary)] text-white flex-shrink-0" title={owner.teamName}>
            {owner.teamAbbr}
          </span>
        )}
      </Link>
    );
  };

  // Render price view columns
  const renderPriceView = () => (
    <>
      {sortedComplexBans.length > 0 && (
        <div className="flex-shrink-0 border-r-2 border-[var(--background-tertiary)] pr-2" style={{ width: 240 }}>
          <div className="sticky top-0 z-10 mb-1">
            <div className="text-center py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-[var(--warning)]/20 border-2 border-[var(--warning)]/50 text-[var(--warning)]">
              Complex Bans ({sortedComplexBans.length})
            </div>
          </div>
          <div className="space-y-1">
            {sortedComplexBans.map((poke) => renderComplexBanRow(poke, "cb"))}
          </div>
        </div>
      )}
      {sortedPrices.map((price, idx) => {
        const mons = priceTiers[price] || [];
        const isLast = idx === sortedPrices.length - 1;
        return (
          <div key={price} className={`flex-shrink-0 ${!isLast ? 'border-r-2 border-[var(--background-tertiary)] pr-2' : ''}`} style={{ width: 210 }}>
            <div className="sticky top-0 z-10 mb-1">
              <div
                className={`text-center py-2 rounded-lg font-bold text-xs uppercase tracking-wider border-2 ${
                  price >= 15
                    ? "bg-gradient-to-r from-yellow-500 to-[var(--primary)] text-white border-yellow-500/50"
                    : price >= 10
                    ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                    : price >= 5
                    ? "bg-[var(--background-secondary)] border-[var(--background-tertiary)] text-white"
                    : "bg-[var(--background)] border-[var(--background-tertiary)] text-[var(--foreground-muted)]"
                }`}
              >
                {price} pts ({mons.length})
              </div>
            </div>
            <div className="space-y-1">
              {mons.map((poke) => renderPokemonRow(poke, false, `p${price}`))}
            </div>
          </div>
        );
      })}
    </>
  );

  // Render type view columns
  const renderTypeView = () => (
    <>
      {sortedTypes.map((type, idx) => {
        const mons = typeTiers[type] || [];
        const typeColor = TYPE_COLORS[type] || TYPE_COLORS.normal;
        const isLast = idx === sortedTypes.length - 1;
        return (
          <div key={type} className={`flex-shrink-0 ${!isLast ? 'border-r-2 border-[var(--background-tertiary)] pr-2' : ''}`} style={{ width: 220 }}>
            <div className="sticky top-0 z-10 mb-1">
              <div className={`text-center py-2 rounded-lg font-bold text-xs uppercase tracking-wider border-2 ${typeColor}`}>
                {type} ({mons.length})
              </div>
            </div>
            <div className="space-y-1">
              {mons.map((poke) => renderPokemonRow(poke, true, `t-${type}`))}
            </div>
          </div>
        );
      })}
    </>
  );

  // Sync scroll between main grid and sticky scrollbar
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);

  useEffect(() => {
    const updateScrollDimensions = () => {
      if (scrollRef.current) {
        setScrollWidth(scrollRef.current.scrollWidth);
        setClientWidth(scrollRef.current.clientWidth);
      }
    };
    updateScrollDimensions();
    window.addEventListener("resize", updateScrollDimensions);
    return () => window.removeEventListener("resize", updateScrollDimensions);
  }, [viewMode, sortBy, showAvailableOnly, filteredPokemon]);

  const handleScrollbarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleGridScroll = () => {
    if (scrollbarRef.current && scrollRef.current) {
      scrollbarRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  };

  return (
    <div className="space-y-6">
      {/* Move Filter Modal - OUTSIDE of any container to fix iOS Safari fixed positioning */}
      {showMoveFilter && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowMoveFilter(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] bg-[var(--card)] border-2 border-[var(--background-tertiary)] rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] shrink-0">
              <span className="text-sm font-bold text-white">Filter by Move</span>
              <div className="flex items-center gap-3">
                {hasMoveFilters && (
                  <button
                    type="button"
                    onClick={clearMoveFilters}
                    className="text-xs text-[var(--error)] hover:underline"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowMoveFilter(false)}
                  className="text-[var(--foreground-muted)] hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Categories - Scrollable */}
            <div className="p-4 space-y-1 overflow-y-auto flex-1">
              {Object.entries(MOVE_CATEGORIES).map(([categoryKey, category]) => {
                const isExpanded = expandedCategories.has(categoryKey);
                const selectedCount = getCategorySelectedCount(categoryKey);

                return (
                  <div key={categoryKey} className="border-2 border-[var(--background-tertiary)] rounded-lg overflow-hidden">
                    {/* Category Header - Clickable to expand */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-[var(--background-secondary)] cursor-pointer hover:bg-[var(--background-tertiary)] transition-colors"
                      onClick={() => toggleCategoryExpand(categoryKey)}
                    >
                      {/* Expand/Collapse Arrow */}
                      <svg
                        className={`w-4 h-4 text-[var(--foreground-muted)] transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>

                      {/* Select All Checkbox */}
                      <input
                        type="checkbox"
                        checked={moveFilters[categoryKey]?.allSelected || false}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleCategory(categoryKey);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-[var(--background-tertiary)] bg-[var(--background)] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 shrink-0"
                      />

                      <span className="text-sm font-bold text-white flex-1 truncate">{category.label}</span>

                      {/* Selected count badge */}
                      {selectedCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--primary)] text-white text-[10px] font-bold shrink-0">
                          {selectedCount}
                        </span>
                      )}

                      <span className="text-[10px] text-[var(--foreground-muted)] shrink-0 hidden sm:inline">
                        {category.moves.length} moves
                      </span>
                    </div>

                    {/* Individual Moves - Collapsible */}
                    {isExpanded && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-2 bg-[var(--background)]">
                        {category.moves.map((move) => (
                          <label
                            key={move.id}
                            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[var(--background-secondary)] rounded transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={moveFilters[categoryKey]?.moves[move.id] || false}
                              onChange={() => toggleMoveFilter(categoryKey, move.id)}
                              className="w-3.5 h-3.5 rounded border-[var(--background-tertiary)] bg-[var(--background)] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0 shrink-0"
                            />
                            <span className="text-xs text-[var(--foreground-muted)] truncate">{move.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] shrink-0">
              <button
                type="button"
                onClick={() => setShowMoveFilter(false)}
                className="w-full py-2 rounded-lg bg-[var(--primary)] text-white font-bold text-sm hover:opacity-90 transition-opacity"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="poke-card p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
          {/* Top row on mobile: View + Sort */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--foreground-muted)] uppercase font-bold hidden sm:inline">View:</span>
              <div className="flex rounded-lg border-2 border-[var(--background-tertiary)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("price");
                    setSortBy("name");
                    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
                  }}
                  className={`px-3 sm:px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                    viewMode === "price"
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] text-[var(--foreground)]"
                  }`}
                >
                  Price
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("type");
                    setSortBy("price");
                    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
                  }}
                  className={`px-3 sm:px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                    viewMode === "type"
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] text-[var(--foreground)]"
                  }`}
                >
                  Type
                </button>
              </div>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--foreground-muted)] uppercase font-bold hidden sm:inline">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-2 sm:px-3 py-2 text-xs font-bold rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground)] cursor-pointer focus:outline-none focus:border-[var(--primary)]"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.shortLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Second row on mobile: Filters */}
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {/* Available Only Toggle */}
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] hover:border-[var(--primary)] transition-colors">
              <input
                type="checkbox"
                checked={showAvailableOnly}
                onChange={(e) => setShowAvailableOnly(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--background-tertiary)] bg-[var(--background)] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0"
              />
              <span className="text-xs font-bold text-[var(--foreground-muted)]">Available</span>
            </label>

            {/* Move Filter Button */}
            <button
              type="button"
              onClick={() => setShowMoveFilter(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors border-2 ${
                hasMoveFilters
                  ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                  : "bg-[var(--background-secondary)] border-[var(--background-tertiary)] hover:border-[var(--primary)] text-[var(--foreground-muted)]"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="hidden sm:inline">Filter by Move</span>
              <span className="sm:hidden">Moves</span>
              {hasMoveFilters && (
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
                  {activeMoveFilters.length}
                </span>
              )}
            </button>

            {/* Info */}
            <div className="text-xs text-[var(--foreground-muted)] sm:ml-auto font-bold">
              {filteredPokemon.length} mons
            </div>
          </div>
        </div>
      </div>

      {/* Grid Container - full width breakout */}
      <div
        style={{
          width: '100vw',
          position: 'relative',
          left: '50%',
          marginLeft: '-50vw',
        }}
      >
        <div className="poke-card p-4 mx-4 sm:mx-6">
          {/* Inner scrollable area */}
          <div
            ref={scrollRef}
            onScroll={handleGridScroll}
            className="overflow-x-auto"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div className="flex gap-2" style={{ minWidth: "max-content" }}>
              {viewMode === "price" ? renderPriceView() : renderTypeView()}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Scrollbar at viewport bottom - full width */}
      {scrollWidth > clientWidth && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--background-secondary)] border-t-2 border-[var(--background-tertiary)] py-2 px-4 sm:px-6"
        >
          <div
            ref={scrollbarRef}
            onScroll={handleScrollbarScroll}
            className="overflow-x-auto"
            style={{
              scrollbarWidth: "auto",
              scrollbarColor: "var(--primary) var(--background-tertiary)"
            }}
          >
            <div style={{ width: scrollWidth, height: 1 }} />
          </div>
        </div>
      )}
    </div>
  );
}
