"use client";

import { useRef, useState, useEffect, useMemo } from "react";

interface PokemonData {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl: string | null;
  types: string[] | null;
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

  // Filter Pokemon based on availability
  const filteredPokemon = useMemo(() => {
    if (!showAvailableOnly) return allPokemon;
    return allPokemon.filter((poke) => !ownership[poke.id]);
  }, [allPokemon, ownership, showAvailableOnly]);

  const filteredComplexBans = useMemo(() => {
    if (!showAvailableOnly) return complexBans;
    return complexBans.filter((poke) => !ownership[poke.id]);
  }, [complexBans, ownership, showAvailableOnly]);

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
      <div
        key={`${keyPrefix}-${poke.id}`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 transition-colors ${
          isTaken
            ? "bg-[var(--background)]/50 border-[var(--background-tertiary)] opacity-50"
            : "bg-[var(--background-secondary)] border-[var(--background-tertiary)] hover:border-[var(--primary)]/60"
        }`}
      >
        {poke.spriteUrl && (
          <img src={poke.spriteUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        )}
        <span className="flex-1 font-medium text-xs leading-tight" title={poke.displayName || poke.name}>
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
        {isTaken && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--primary)] text-white flex-shrink-0" title={owner.teamName}>
            {owner.teamAbbr}
          </span>
        )}
      </div>
    );
  };

  const renderComplexBanRow = (poke: PokemonData, keyPrefix: string = "cb") => {
    const owner = ownership[poke.id];
    const isTaken = !!owner;
    return (
      <div
        key={`${keyPrefix}-${poke.id}`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 transition-colors ${
          isTaken
            ? "bg-[var(--background)]/50 border-[var(--background-tertiary)] opacity-50"
            : "bg-[var(--background-secondary)] border-[var(--warning)]/30 hover:border-[var(--warning)]/60"
        }`}
      >
        {poke.spriteUrl && (
          <img src={poke.spriteUrl} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        )}
        <span className="font-medium text-xs leading-tight" title={poke.displayName || poke.name}>
          {poke.displayName || poke.name}
        </span>
        {poke.complexBanReason && (
          <span className="text-[var(--warning)] text-xs font-medium flex-shrink-0 ml-auto">
            {poke.complexBanReason}
          </span>
        )}
        {isTaken && (
          <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--primary)] text-white flex-shrink-0" title={owner.teamName}>
            {owner.teamAbbr}
          </span>
        )}
      </div>
    );
  };

  // Render price view columns
  const renderPriceView = () => (
    <>
      {sortedComplexBans.length > 0 && (
        <div className="flex-shrink-0" style={{ width: 220 }}>
          <div className="sticky top-0 z-10 mb-1">
            <div className="text-center py-2 rounded-lg font-bold text-xs uppercase tracking-wider bg-[var(--warning)]/20 border-2 border-[var(--warning)]/50 text-[var(--warning)]">
              Complex Bans ({sortedComplexBans.length})
            </div>
          </div>
          <div className="space-y-0.5">
            {sortedComplexBans.map((poke) => renderComplexBanRow(poke, "cb"))}
          </div>
        </div>
      )}
      {sortedPrices.map((price) => {
        const mons = priceTiers[price] || [];
        return (
          <div key={price} className="flex-shrink-0" style={{ width: 180 }}>
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
            <div className="space-y-0.5">
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
      {sortedTypes.map((type) => {
        const mons = typeTiers[type] || [];
        const typeColor = TYPE_COLORS[type] || TYPE_COLORS.normal;
        return (
          <div key={type} className="flex-shrink-0" style={{ width: 190 }}>
            <div className="sticky top-0 z-10 mb-1">
              <div className={`text-center py-2 rounded-lg font-bold text-xs uppercase tracking-wider border-2 ${typeColor}`}>
                {type} ({mons.length})
              </div>
            </div>
            <div className="space-y-0.5">
              {mons.map((poke) => renderPokemonRow(poke, true, `t-${type}`))}
            </div>
          </div>
        );
      })}
    </>
  );

  // Sync scroll between main grid and sticky scrollbar
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerLeft, setContainerLeft] = useState(0);

  useEffect(() => {
    const updateScrollDimensions = () => {
      if (scrollRef.current) {
        setScrollWidth(scrollRef.current.scrollWidth);
        setClientWidth(scrollRef.current.clientWidth);
      }
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
        const rect = containerRef.current.getBoundingClientRect();
        setContainerLeft(rect.left);
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
    <div className="space-y-4">
      {/* Controls */}
      <div className="poke-card p-4">
        <div className="flex flex-wrap items-center gap-4 relative z-20">
          {/* View Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--foreground-muted)] uppercase font-bold">View:</span>
            <div className="flex rounded-lg border-2 border-[var(--background-tertiary)] overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setViewMode("price");
                  setSortBy("name");
                  if (scrollRef.current) scrollRef.current.scrollLeft = 0;
                }}
                className={`px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  viewMode === "price"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] text-[var(--foreground)]"
                }`}
              >
                By Price
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("type");
                  setSortBy("price");
                  if (scrollRef.current) scrollRef.current.scrollLeft = 0;
                }}
                className={`px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  viewMode === "type"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--background-secondary)] hover:bg-[var(--background-tertiary)] text-[var(--foreground)]"
                }`}
              >
                By Type
              </button>
            </div>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--foreground-muted)] uppercase font-bold">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-2 text-xs font-bold rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground)] cursor-pointer focus:outline-none focus:border-[var(--primary)]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Available Only Toggle */}
          <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] hover:border-[var(--primary)] transition-colors">
            <input
              type="checkbox"
              checked={showAvailableOnly}
              onChange={(e) => setShowAvailableOnly(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--background-tertiary)] bg-[var(--background)] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-0"
            />
            <span className="text-xs font-bold text-[var(--foreground-muted)]">Available only</span>
          </label>

          {/* Info */}
          <div className="text-xs text-[var(--foreground-muted)] ml-auto font-bold">
            {viewMode === "price"
              ? `${sortedPrices.length + (sortedComplexBans.length > 0 ? 1 : 0)} tiers`
              : `${sortedTypes.length} types`
            } • {filteredPokemon.length} Pokemon
          </div>
        </div>
      </div>

      {/* Grid Container - poke-card wrapper with inner scroll */}
      <div ref={containerRef} className="poke-card p-4">
        {/* Inner scrollable area */}
        <div
          ref={scrollRef}
          onScroll={handleGridScroll}
          className="overflow-x-auto"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div className="flex gap-1.5" style={{ minWidth: "max-content" }}>
            {viewMode === "price" ? renderPriceView() : renderTypeView()}
          </div>
        </div>
      </div>

      {/* Sticky Scrollbar at viewport bottom - aligned with grid container */}
      {scrollWidth > clientWidth && containerWidth > 0 && (
        <div
          className="fixed bottom-0 z-40 bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] rounded-t-lg py-2 px-4"
          style={{ left: containerLeft, width: containerWidth }}
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
