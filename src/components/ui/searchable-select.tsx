"use client";

import { useState, useRef, useEffect, useId, useMemo } from "react";

interface SearchableSelectOption {
  value: string;
  label: string;
  searchText?: string; // Additional text to search against
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyOption?: string; // Text for the "none" option
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
  emptyOption,
  className = "",
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const componentId = useId();
  const listboxId = `${componentId}-listbox`;

  // Find selected option label
  const selectedOption = options.find((o) => o.value === value);
  const displayValue = selectedOption?.label || "";

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const searchLower = search.toLowerCase();
    return options.filter((o) => {
      const labelMatch = o.label.toLowerCase().includes(searchLower);
      const searchTextMatch = o.searchText?.toLowerCase().includes(searchLower);
      return labelMatch || searchTextMatch;
    });
  }, [options, search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex + (emptyOption ? 1 : 0)] as HTMLElement;
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen, emptyOption]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearch("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    const totalOptions = filteredOptions.length + (emptyOption ? 1 : 0);

    switch (e.key) {
      case "ArrowDown":
        if (totalOptions === 0) return;
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % totalOptions);
        break;
      case "ArrowUp":
        if (totalOptions === 0) return;
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
        break;
      case "Enter":
        e.preventDefault();
        if (emptyOption && highlightedIndex === 0) {
          handleSelect("");
        } else {
          const adjustedIndex = emptyOption ? highlightedIndex - 1 : highlightedIndex;
          if (filteredOptions[adjustedIndex]) {
            handleSelect(filteredOptions[adjustedIndex].value);
          }
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearch("");
        requestAnimationFrame(() => triggerRef.current?.focus());
        break;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Display field / trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        className={`flex items-center gap-2 w-full px-3 py-2 rounded border-2 bg-[var(--background-secondary)] cursor-pointer transition-colors ${
          isOpen
            ? "border-[var(--primary)]"
            : "border-[var(--glass-border)] hover:border-[var(--primary)]"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={() => {
          setHighlightedIndex(0);
          setIsOpen(!isOpen);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <span className={`flex-1 truncate ${!value ? "text-[var(--foreground-muted)]" : ""}`}>
          {displayValue || placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-[var(--foreground-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-[var(--background-secondary)] border-2 border-[var(--glass-border)] rounded shadow-lg">
          {/* Search input */}
          <div className="p-2 border-b border-[var(--glass-border)]">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              role="combobox"
              aria-label={placeholder}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded="true"
              aria-activedescendant={
                filteredOptions.length > 0 || emptyOption
                  ? `${componentId}-option-${highlightedIndex}`
                  : undefined
              }
              className="w-full px-2 py-1.5 text-sm rounded bg-[var(--background)] border border-[var(--glass-border)] focus:border-[var(--primary)] focus:outline-none"
              autoFocus
            />
          </div>

          {/* Options list */}
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Options"
            className="max-h-60 overflow-y-auto"
          >
            {emptyOption && (
              <button
                id={`${componentId}-option-0`}
                type="button"
                role="option"
                aria-selected={value === ""}
                tabIndex={-1}
                className={`block w-full px-3 py-2 text-left cursor-pointer text-[var(--foreground-muted)] ${
                  highlightedIndex === 0 ? "bg-[var(--primary)]/20" : "hover:bg-[var(--card-hover)]"
                }`}
                onClick={() => handleSelect("")}
                onMouseEnter={() => setHighlightedIndex(0)}
              >
                {emptyOption}
              </button>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-[var(--foreground-muted)] text-sm">
                No results found
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const adjustedIndex = emptyOption ? index + 1 : index;
                return (
                  <button
                    key={option.value}
                    id={`${componentId}-option-${adjustedIndex}`}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    tabIndex={-1}
                    className={`block w-full px-3 py-2 text-left cursor-pointer truncate ${
                      adjustedIndex === highlightedIndex
                        ? "bg-[var(--primary)]/20"
                        : "hover:bg-[var(--card-hover)]"
                    } ${option.value === value ? "font-medium text-[var(--primary)]" : ""}`}
                    onClick={() => handleSelect(option.value)}
                    onMouseEnter={() => setHighlightedIndex(adjustedIndex)}
                  >
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
