"use client";

import { useState, createContext, useContext, useRef, useEffect } from "react";

const MoveDataContext = createContext<{
  showMoveData: boolean;
  setShowMoveData: (show: boolean) => void;
}>({
  showMoveData: false,
  setShowMoveData: () => {},
});

export function useMoveData() {
  return useContext(MoveDataContext);
}

interface MoveDataProviderProps {
  children: React.ReactNode;
}

// Provider component - wraps the section that needs move data toggle
export function MoveDataProvider({ children }: MoveDataProviderProps) {
  const [showMoveData, setShowMoveData] = useState(false);

  return (
    <MoveDataContext.Provider value={{ showMoveData, setShowMoveData }}>
      {children}
    </MoveDataContext.Provider>
  );
}

// Toggle button - can be placed anywhere within the provider
export function MoveDataToggleButton() {
  const { showMoveData, setShowMoveData } = useMoveData();

  return (
    <button
      type="button"
      onClick={() => setShowMoveData(!showMoveData)}
      className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium rounded border-2 transition-colors ${
        showMoveData
          ? "bg-[var(--primary)] text-white border-[var(--primary)]"
          : "bg-[var(--background-tertiary)] text-[var(--foreground-muted)] border-[var(--background-tertiary)] hover:border-[var(--primary)]"
      }`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      {showMoveData ? "Hide" : "Show"} Move Data
    </button>
  );
}

// All move icons component - renders all 6 categories when toggle is on
export function MoveIcons({
  removal,
  setters,
  pivots,
  utility,
  support,
  priority,
  showTooltips = true,
  compact = false,
}: {
  removal: { id: string; name: string }[];
  setters: { id: string; name: string }[];
  pivots: { id: string; name: string }[];
  utility: { id: string; name: string }[];
  support: { id: string; name: string }[];
  priority: { id: string; name: string }[];
  showTooltips?: boolean;
  compact?: boolean;
}) {
  const { showMoveData } = useMoveData();

  // All hooks must be called unconditionally at the top
  const [showDetails, setShowDetails] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);

  // Close details when tapping outside
  useEffect(() => {
    if (!showDetails) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) {
        setShowDetails(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showDetails]);

  // Early returns after all hooks
  if (!showMoveData) return null;

  const hasRemoval = removal.length > 0;
  const hasSetters = setters.length > 0;
  const hasPivots = pivots.length > 0;
  const hasUtility = utility.length > 0;
  const hasSupport = support.length > 0;
  const hasPriority = priority.length > 0;

  if (!hasRemoval && !hasSetters && !hasPivots && !hasUtility && !hasSupport && !hasPriority) {
    return null;
  }

  const moveCategories = [
    { has: hasRemoval, color: '#0891b2', label: 'Hazard Removal', moves: removal },
    { has: hasSetters, color: '#a8a29e', label: 'Hazard Setter', moves: setters },
    { has: hasPivots, color: '#9d8fba', label: 'Pivot', moves: pivots },
    { has: hasUtility, color: '#b08a8a', label: 'Utility', moves: utility },
    { has: hasSupport, color: '#8aab9a', label: 'Support', moves: support },
    { has: hasPriority, color: '#b8a878', label: 'Priority', moves: priority },
  ].filter(cat => cat.has);

  if (compact) {
    const handleDotsClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (showDetails) {
        setShowDetails(false);
        return;
      }

      // Calculate position for fixed popup - prefer above the dots
      if (dotsRef.current) {
        const rect = dotsRef.current.getBoundingClientRect();
        const popupHeight = moveCategories.length * 45 + 20; // Better estimate with padding
        const popupWidth = 140;

        // Try to position above the dots first
        let top = rect.top - popupHeight - 8;
        let left = rect.left + rect.width / 2 - popupWidth / 2;

        // If not enough space above, position below
        if (top < 10) {
          top = rect.bottom + 8;
        }

        // Keep within horizontal bounds
        if (left < 10) {
          left = 10;
        } else if (left + popupWidth > window.innerWidth - 10) {
          left = window.innerWidth - popupWidth - 10;
        }

        // If still would overflow bottom, move it up as much as possible
        if (top + popupHeight > window.innerHeight - 10) {
          top = window.innerHeight - popupHeight - 10;
        }

        setPopupPosition({ top, left });
      }

      setShowDetails(true);
    };

    return (
      <div className="relative" ref={detailsRef}>
        {/* Dots - tap to reveal */}
        <div
          ref={dotsRef}
          className="flex flex-col gap-0.5 cursor-pointer"
          onClick={handleDotsClick}
        >
          {moveCategories.map((cat) => (
            <div
              key={cat.label}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
          ))}
        </div>

        {/* Details popup on tap - fixed position to avoid overflow clipping */}
        {showDetails && popupPosition && (
          <div
            className="fixed z-[100] min-w-[120px] p-2 rounded-lg bg-[var(--background-secondary)] border-2 border-[var(--background-tertiary)] shadow-lg"
            style={{ top: popupPosition.top, left: popupPosition.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              {moveCategories.map((cat) => (
                <div key={cat.label}>
                  <p
                    className="text-[8px] font-bold uppercase tracking-wide mb-0.5"
                    style={{ color: cat.color }}
                  >
                    {cat.label}
                  </p>
                  <div className="space-y-0">
                    {cat.moves.map(m => (
                      <p key={m.id} className="text-[10px] text-[var(--foreground)]">{m.name}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop: render icons with tooltips to the right
  const renderIcon = (
    category: { has: boolean; color: string; label: string; moves: { id: string; name: string }[] },
    Icon: React.ReactNode
  ) => {
    if (!category.has) return null;

    return (
      <div key={category.label} className="relative group/moveicon">
        <div
          className="w-5 h-5 rounded bg-opacity-20 border flex items-center justify-center cursor-help"
          style={{
            backgroundColor: `${category.color}20`,
            borderColor: `${category.color}60`,
          }}
        >
          {Icon}
        </div>
        {showTooltips && (
          <div className="absolute left-full ml-2 top-0 hidden group-hover/moveicon:block z-[100]">
            <div
              className="px-2 py-1.5 rounded-lg bg-[var(--background-secondary)] border-2 shadow-lg whitespace-nowrap"
              style={{ borderColor: `${category.color}60` }}
            >
              <p
                className="text-[9px] font-bold uppercase tracking-wide mb-0.5"
                style={{ color: category.color }}
              >
                {category.label}
              </p>
              <div className="space-y-0">
                {category.moves.map(m => (
                  <p key={m.id} className="text-[10px] text-[var(--foreground)]">{m.name}</p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {renderIcon(
        { has: hasRemoval, color: '#0891b2', label: 'Hazard Removal', moves: removal },
        <svg className="w-3.5 h-3.5 text-[#0891b2]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4C8 4 4 6 4 10c0 2 1 3 3 3 3 0 5-2 5-4 0-1-.5-2-2-2s-2 1-2 2h2c0-.5.5-1 1-1s1 .5 1 1c0 1-1 2-3 2-1 0-2-.5-2-2 0-3 3-4 5-4s4 1 4 4c0 4-4 6-6 6-1 0-2 0-3-1l-1 1c1 1 3 2 4 2 3 0 8-3 8-8 0-4-3-6-7-6z"/>
        </svg>
      )}
      {renderIcon(
        { has: hasSetters, color: '#a8a29e', label: 'Hazard Setter', moves: setters },
        <svg className="w-2.5 h-2.5 text-[#a8a29e]" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="6" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5.64 5.64l1.77 1.77M16.59 16.59l1.77 1.77M5.64 18.36l1.77-1.77M16.59 7.41l1.77-1.77" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        </svg>
      )}
      {renderIcon(
        { has: hasPivots, color: '#9d8fba', label: 'Pivot', moves: pivots },
        <svg className="w-3 h-3 text-[#9d8fba]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8L2 12L6 16" />
          <path d="M18 8L22 12L18 16" />
          <path d="M2 12H22" />
        </svg>
      )}
      {renderIcon(
        { has: hasUtility, color: '#b08a8a', label: 'Utility', moves: utility },
        <svg className="w-3 h-3 text-[#b08a8a]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.5.5 2.5 1 3.5H7v2h2v2H7v2h3v4h4v-4h3v-2h-2v-2h2v-2h-1.5c.5-1 1-2 1-3.5C16.5 4 14.5 2 12 2zm-1.5 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm3 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/>
        </svg>
      )}
      {renderIcon(
        { has: hasSupport, color: '#8aab9a', label: 'Support', moves: support },
        <svg className="w-3 h-3 text-[#8aab9a]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"/>
        </svg>
      )}
      {renderIcon(
        { has: hasPriority, color: '#b8a878', label: 'Priority', moves: priority },
        <svg className="w-3 h-3 text-[#b8a878]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      )}
    </>
  );
}

// Legacy exports for backward compatibility during transition
export const ExtendedIconsToggle = MoveDataProvider;
export const ExtendedIcons = ({ utility, support, priority }: { utility: any[]; support: any[]; priority: any[] }) => null;
export const ExtendedIconsSimple = ({ utility, support, priority }: { utility: any[]; support: any[]; priority: any[] }) => null;
