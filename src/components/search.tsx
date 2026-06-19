"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  type: "coach" | "team" | "season" | "division" | "pokemon" | "draft" | "roster" | "transaction" | "move" | "powerRanking";
  id: number;
  name: string;
  subtitle?: string;
  sprite?: string;
  href: string;
}

interface SearchResults {
  coaches: SearchResult[];
  teams: SearchResult[];
  seasons: SearchResult[];
  divisions: SearchResult[];
  pokemon: SearchResult[];
  drafts: SearchResult[];
  rosters: SearchResult[];
  transactions: SearchResult[];
  moves: SearchResult[];
  powerRankings: SearchResult[];
}

const typeIcons: Record<string, React.ReactNode> = {
  coach: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  team: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  season: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  division: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  pokemon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={2} d="M3 12h18" />
      <circle cx="12" cy="12" r="3" strokeWidth={2} />
    </svg>
  ),
  draft: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  roster: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  transaction: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  move: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  powerRanking: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  ),
};

const typeLabels: Record<string, string> = {
  coaches: "Coaches",
  teams: "Teams",
  seasons: "Seasons",
  divisions: "Divisions",
  pokemon: "Pokemon",
  drafts: "Draft Boards",
  rosters: "Rosters",
  transactions: "Transactions",
  moves: "Moves",
  powerRankings: "Tools",
};

export function Search() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Flatten results for keyboard navigation (moves last = lowest priority)
  const flatResults = results
    ? [
        ...results.coaches,
        ...results.teams,
        ...results.seasons,
        ...results.divisions,
        ...results.pokemon,
        ...results.drafts,
        ...results.rosters,
        ...results.transactions,
        ...results.moves,
        ...results.powerRankings,
      ]
    : [];

  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results);
        setSelectedIndex(0);
      } catch {
        console.error("Search failed");
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      router.push(result.href);
      setIsOpen(false);
    },
    [router]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatResults[selectedIndex]) {
        e.preventDefault();
        handleSelect(flatResults[selectedIndex]);
      }
    },
    [flatResults, selectedIndex, handleSelect]
  );

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 text-[var(--foreground-muted)] hover:text-white transition-colors"
        aria-label="Search (⌘K)"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-[var(--background-secondary)] rounded-xl border border-[var(--background-tertiary)] shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--background-tertiary)]">
          <svg className="w-5 h-5 text-[var(--foreground-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search coaches, teams, seasons, pokemon..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-white placeholder-[var(--foreground-subtle)] outline-none"
          />
          {isLoading && (
            <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          )}
          <kbd
            className="px-2 py-1 text-xs text-[var(--foreground-subtle)] bg-[var(--background-tertiary)] rounded cursor-pointer"
            onClick={() => setIsOpen(false)}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 ? (
            <div className="px-4 py-8 text-center text-[var(--foreground-muted)]">
              <p>Type at least 2 characters to search</p>
            </div>
          ) : results && flatResults.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--foreground-muted)]">
              <p>No results found for &quot;{query}&quot;</p>
            </div>
          ) : results ? (
            <div className="py-2">
              {(Object.keys(results) as Array<keyof SearchResults>).map((category) => {
                const items = results[category];
                if (items.length === 0) return null;

                return (
                  <div key={category}>
                    <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--foreground-subtle)]">
                      {typeLabels[category]}
                    </div>
                    {items.map((result) => {
                      const globalIndex = flatResults.findIndex(
                        (r) => r.type === result.type && r.id === result.id
                      );
                      const isSelected = globalIndex === selectedIndex;

                      return (
                        <button
                          key={`${result.type}-${result.id}`}
                          onClick={() => handleSelect(result)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                            isSelected
                              ? "bg-[var(--primary)]/20 text-white"
                              : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)]"
                          }`}
                        >
                          {result.sprite ? (
                            <img
                              src={result.sprite}
                              alt={result.name}
                              className="w-6 h-6"
                            />
                          ) : (
                            <span className="text-[var(--foreground-subtle)]">
                              {typeIcons[result.type]}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{result.name}</div>
                            {result.subtitle && (
                              <div className="text-xs text-[var(--foreground-subtle)] truncate">
                                {result.subtitle}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <kbd className="px-1.5 py-0.5 text-[10px] bg-[var(--background-tertiary)] rounded">
                              Enter
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--background-tertiary)] text-xs text-[var(--foreground-subtle)]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-[var(--background-tertiary)] rounded">↑</kbd>
              <kbd className="px-1 py-0.5 bg-[var(--background-tertiary)] rounded">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--background-tertiary)] rounded">Enter</kbd>
              to select
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
