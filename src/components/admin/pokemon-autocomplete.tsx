"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { formatPokemonDisplayName, pokemonSearchAliases } from "@/lib/pokemon-name-utils";

interface Pokemon {
  id: number;
  name: string;
  displayName?: string | null;
  spriteUrl?: string | null;
  nameAliases?: string[] | null;
}

interface PokemonAutocompleteProps {
  value: string;
  pokemonId: number | null;
  allPokemon: Pokemon[];
  onChange: (pokemonId: number | null, name: string) => void;
  onMultiLinePaste: (lines: string[]) => void;
  hasWarning: boolean;
  warningText: string;
  placeholder?: string;
  disabled?: boolean;
  friendlyMegaNames?: boolean;
  /** Overrides the input's default sizing classes (px-2 py-1 text-sm). */
  inputClassName?: string;
}

export function PokemonAutocomplete({
  value,
  allPokemon,
  onChange,
  onMultiLinePaste,
  hasWarning,
  warningText,
  placeholder = "Type Pokemon name...",
  disabled = false,
  friendlyMegaNames = false,
  inputClassName = "px-2 py-1 text-sm",
}: PokemonAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync searchText with value prop
  useEffect(() => {
    setSearchText(value);
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter suggestions
  const suggestions = searchText.trim()
    ? allPokemon
        .filter((p) => {
          const lowerSearch = searchText.toLowerCase();
          return pokemonSearchAliases(p.name, p.displayName, { friendlyMegaNames })
            .concat(p.nameAliases || [])
            .map((alias) => alias.toLowerCase())
            .some((alias) => alias.includes(lowerSearch));
        })
        .slice(0, 10)
    : [];

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setSearchText(text);
    setIsOpen(true);
    setHighlightedIndex(0);

    // If text is cleared, clear selection
    if (!text.trim()) {
      onChange(null, "");
    }
  }

  function handleSelect(pokemon: Pokemon) {
    const displayName = formatPokemonDisplayName(pokemon.name, pokemon.displayName, { friendlyMegaNames });
    setSearchText(displayName);
    onChange(pokemon.id, displayName);
    setIsOpen(false);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pastedText = e.clipboardData.getData("text");

    // Check for multi-line paste
    if (pastedText.includes("\n")) {
      e.preventDefault();
      const lines = pastedText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      onMultiLinePaste(lines);
      return;
    }

    // Single line paste - let it go through normally
    // The onChange will fire from the input change
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else if (suggestions.length > 0) {
        setHighlightedIndex((current) => (current + 1) % suggestions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isOpen && suggestions.length > 0) {
        setHighlightedIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === "Enter" && suggestions.length > 0) {
      e.preventDefault();
      handleSelect(suggestions[Math.min(highlightedIndex, suggestions.length - 1)] ?? suggestions[0]);
    }
  }

  function handleFocus() {
    if (searchText.trim()) {
      setIsOpen(true);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={searchText}
        onChange={handleInputChange}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full ${inputClassName} rounded bg-[var(--background-secondary)] border ${
          hasWarning
            ? "border-[var(--error)] text-[var(--error)]"
            : "border-[var(--card)]"
        } text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-50`}
      />

      {/* Warning indicator */}
      {hasWarning && (
        <div
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--error)]"
          title={warningText}
        >
          <svg
            className="w-4 h-4"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-[var(--card)] border border-[var(--background-tertiary)] rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((pokemon, index) => (
            <button
              key={pokemon.id}
              type="button"
              onClick={() => handleSelect(pokemon)}
              onMouseEnter={() => setHighlightedIndex(index)}
              ref={index === highlightedIndex ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              className={`w-full px-2 py-1.5 flex items-center gap-2 text-left transition-colors ${index === highlightedIndex ? "bg-[var(--background-tertiary)]" : ""}`}
            >
              {pokemon.spriteUrl && (
                <Image
                  src={pokemon.spriteUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain"
                />
              )}
              <span className="text-sm text-[var(--foreground)]">
                {formatPokemonDisplayName(pokemon.name, pokemon.displayName, { friendlyMegaNames })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper function to find a Pokemon match from text
export function findPokemonMatch(
  text: string,
  pokemon: Pokemon[],
  options: { friendlyMegaNames?: boolean } = {}
): Pokemon | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  let match = pokemon.find((p) => pokemonSearchAliases(p.name, p.displayName, options).includes(lower));
  if (match) return match;

  match = pokemon.find((p) => (p.nameAliases || []).some((alias) => alias.toLowerCase() === lower));
  if (match) return match;

  // Case-insensitive contains match
  match = pokemon.find((p) =>
    pokemonSearchAliases(p.name, p.displayName, options)
      .concat(p.nameAliases || [])
      .map((alias) => alias.toLowerCase())
      .some((alias) => alias.includes(lower))
  );
  if (match) return match;

  // Reverse contains (search term contains pokemon name)
  match = pokemon.find((p) =>
    pokemonSearchAliases(p.name, p.displayName, options)
      .concat(p.nameAliases || [])
      .map((alias) => alias.toLowerCase())
      .some((alias) => lower.includes(alias))
  );

  return match || null;
}
