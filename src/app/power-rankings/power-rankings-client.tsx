"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const DIVISION_COLORS: Record<string, string> = {
  Infinity: "#E2A3C7",
  Infinty: "#E2A3C7",
  Stargazer: "#3b82f6",
  Sunset: "#fb923c",
  Crystal: "#c084fc",
  Neon: "#4ade80",
};

function getDivisionColor(name: string | null | undefined) {
  const normalizedName = name?.trim().toLowerCase();
  if (!normalizedName) return "#64748b";

  const colorKey = Object.keys(DIVISION_COLORS).find(
    (divisionName) => divisionName.toLowerCase() === normalizedName
  );

  return colorKey ? DIVISION_COLORS[colorKey] : "#64748b";
}

interface Season {
  id: number;
  name: string;
  seasonNumber: number;
  isCurrent: boolean | null;
  divisions: Division[];
}

interface Division {
  id: number;
  name: string;
  logoUrl: string | null;
  displayOrder: number | null;
}

interface CoachData {
  id: number;
  teamName: string;
  teamAbbreviation: string | null;
  teamLogoUrl: string | null;
  coachName: string | null;
  isActive: boolean | null;
}

interface StandingsData {
  id: number;
  wins: number;
  losses: number;
  differential: number;
}

interface PreloadedDivision {
  coaches: CoachData[];
  standings: StandingsData[];
}

interface Props {
  seasons: Season[];
  preloadedData: Record<number, PreloadedDivision>;
}

function SortableTeam({
  team,
  index,
  divisionColor,
}: {
  team: CoachData & { wins: number; losses: number; differential: number };
  index: number;
  divisionColor: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${
        isDragging
          ? "bg-[var(--background-tertiary)] border-[var(--primary)] shadow-lg shadow-[var(--primary-glow)]"
          : "bg-[var(--background-secondary)] border-[var(--background-tertiary)] hover:border-[var(--foreground-subtle)]"
      }`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)] touch-none"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zM8 11h2v2H8v-2zm6 0h2v2h-2v-2zm-6 5h2v2H8v-2zm6 0h2v2h-2v-2z" />
        </svg>
      </button>

      {/* Rank Number */}
      <div
        className="shrink-0 w-6 h-6 rounded flex items-center justify-center font-pixel text-[10px] font-bold"
        style={{
          backgroundColor: `${divisionColor}20`,
          color: divisionColor,
          border: `1px solid ${divisionColor}40`,
        }}
      >
        {index + 1}
      </div>

      {/* Team Logo */}
      {team.teamLogoUrl ? (
        <div className="w-6 h-6 rounded overflow-hidden bg-[var(--background-tertiary)] flex items-center justify-center shrink-0">
          <Image
            src={team.teamLogoUrl}
            alt={team.teamName}
            width={24}
            height={24}
            className="object-contain"
          />
        </div>
      ) : (
        <div className="w-6 h-6 rounded bg-[var(--background-tertiary)] shrink-0" />
      )}

      {/* Team Name + Coach */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="font-bold text-sm text-white truncate">{team.teamName}</span>
        <span className="text-[10px] text-[var(--foreground-subtle)] truncate hidden sm:inline">
          {team.coachName}
        </span>
      </div>

      {/* Record */}
      <div className="shrink-0">
        <span className="font-bold text-xs">
          <span className="text-[var(--success)]">{team.wins}</span>
          <span className="text-[var(--foreground-subtle)]">-</span>
          <span className="text-[var(--error)]">{team.losses}</span>
        </span>
      </div>
    </div>
  );
}

export function PowerRankingsClient({ seasons, preloadedData }: Props) {
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(
    seasons[0]?.id ?? null
  );
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(null);
  const [teams, setTeams] = useState<
    (CoachData & { wins: number; losses: number; differential: number })[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [hostedBy, setHostedBy] = useState("");

  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId);
  const selectedDivision = selectedSeason?.divisions.find(
    (d) => d.id === selectedDivisionId
  );
  const divisionColor = getDivisionColor(selectedDivision?.name);

  // Load teams when division changes
  const loadTeams = useCallback(
    async (divId: number) => {
      // Check preloaded data first
      const preloaded = preloadedData[divId];
      if (preloaded) {
        const standingsMap = new Map(preloaded.standings.map((s) => [s.id, s]));
        const merged = preloaded.coaches.map((c) => ({
          ...c,
          wins: standingsMap.get(c.id)?.wins ?? 0,
          losses: standingsMap.get(c.id)?.losses ?? 0,
          differential: standingsMap.get(c.id)?.differential ?? 0,
        }));
        // Sort by standings order
        merged.sort((a, b) => {
          const aIdx = preloaded.standings.findIndex((s) => s.id === a.id);
          const bIdx = preloaded.standings.findIndex((s) => s.id === b.id);
          return aIdx - bIdx;
        });
        setTeams(merged);
        return;
      }

      // Client-side fetch for non-preloaded seasons
      setLoading(true);
      try {
        const [rostersRes, matchesRes] = await Promise.all([
          fetch(`/api/rosters?divisionId=${divId}`),
          fetch(`/api/matches?divisionId=${divId}`),
        ]);
        const rostersData = await rostersRes.json();
        const matchesData = await matchesRes.json();

        // Build coaches from rosters response
        // The divisionId endpoint returns seasonCoach objects directly
        const coachMap = new Map<number, CoachData>();
        const items = rostersData.rosters || rostersData;
        for (const r of items) {
          // Handle both formats: direct seasonCoach objects (from divisionId query)
          // and roster objects with nested seasonCoach (from other queries)
          const sc = r.seasonCoach || r;
          if (sc.id && !coachMap.has(sc.id)) {
            coachMap.set(sc.id, {
              id: sc.id,
              teamName: sc.teamName,
              teamAbbreviation: sc.teamAbbreviation,
              teamLogoUrl: sc.teamLogoUrl,
              coachName: sc.coach?.name || null,
              isActive: sc.isActive,
            });
          }
        }

        // Compute standings from matches
        const matchList = matchesData.matches || matchesData;
        const standingsMap = new Map<number, { wins: number; losses: number; differential: number }>();
        for (const [id] of coachMap) {
          standingsMap.set(id, { wins: 0, losses: 0, differential: 0 });
        }
        for (const m of matchList) {
          if (m.week > 100) continue;
          if (standingsMap.has(m.coach1SeasonId)) {
            const s = standingsMap.get(m.coach1SeasonId)!;
            if (m.winnerId === m.coach1SeasonId) s.wins++;
            else if (m.winnerId) s.losses++;
            s.differential += m.coach1Differential || 0;
          }
          if (standingsMap.has(m.coach2SeasonId)) {
            const s = standingsMap.get(m.coach2SeasonId)!;
            if (m.winnerId === m.coach2SeasonId) s.wins++;
            else if (m.winnerId) s.losses++;
            s.differential += m.coach2Differential || 0;
          }
        }

        const merged = Array.from(coachMap.values())
          .filter((c) => c.isActive)
          .map((c) => ({
            ...c,
            ...(standingsMap.get(c.id) ?? { wins: 0, losses: 0, differential: 0 }),
          }));

        merged.sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (b.differential !== a.differential) return b.differential - a.differential;
          return a.losses - b.losses;
        });

        setTeams(merged);
      } catch {
        console.error("Failed to load division data");
      } finally {
        setLoading(false);
      }
    },
    [preloadedData]
  );

  useEffect(() => {
    if (selectedDivisionId) {
      loadTeams(selectedDivisionId);
    } else {
      setTeams([]);
    }
  }, [selectedDivisionId, loadTeams]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTeams((prev) => {
        const oldIndex = prev.findIndex((t) => t.id === active.id);
        const newIndex = prev.findIndex((t) => t.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  function startSlideshow() {
    if (!selectedSeasonId || !selectedDivisionId || teams.length === 0) return;
    // Order is bottom-to-top (last ranked first in slideshow)
    const order = [...teams].reverse().map((t) => t.id).join(",");
    const params = new URLSearchParams({
      seasonId: String(selectedSeasonId),
      divisionId: String(selectedDivisionId),
      order,
    });
    if (hostedBy.trim()) {
      params.set("hostedBy", hostedBy.trim());
    }
    window.open(`/power-rankings/slideshow?${params.toString()}`, "_blank");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="poke-card p-6">
        <h1 className="font-pixel text-xl md:text-2xl text-white leading-relaxed">
          Power Rankings
        </h1>
        <p className="text-[var(--foreground-muted)] mt-2 text-sm">
          Drag teams into your ranking order, then launch a YouTube-ready slideshow.
        </p>
      </div>

      {/* Season Selector */}
      <div className="poke-card p-6 space-y-4">
        <h2 className="text-sm font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
          Select Season
        </h2>
        <div className="flex flex-wrap gap-2">
          {seasons.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelectedSeasonId(s.id);
                setSelectedDivisionId(null);
                setTeams([]);
              }}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                selectedSeasonId === s.id
                  ? "bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary-glow)]"
                  : "bg-[var(--background-secondary)] text-[var(--foreground-muted)] border border-[var(--background-tertiary)] hover:border-[var(--foreground-subtle)]"
              }`}
            >
              {s.name}
              {s.isCurrent && (
                <span className="ml-2 text-[10px] uppercase opacity-75">Live</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Division Selector */}
      {selectedSeason && (
        <div className="poke-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
            Select Division
          </h2>
          <div className="flex flex-wrap gap-2">
            {selectedSeason.divisions.map((div) => {
              const color = getDivisionColor(div.name);
              const isSelected = selectedDivisionId === div.id;
              return (
                <button
                  key={div.id}
                  onClick={() => setSelectedDivisionId(div.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all border-2 ${
                    isSelected
                      ? "text-white shadow-lg"
                      : "text-[var(--foreground-muted)] hover:text-white"
                  }`}
                  style={{
                    borderColor: isSelected ? color : "var(--background-tertiary)",
                    backgroundColor: isSelected ? `${color}20` : "var(--background-secondary)",
                    boxShadow: isSelected ? `0 4px 20px ${color}30` : undefined,
                    color: isSelected ? color : undefined,
                  }}
                >
                  {div.logoUrl && (
                    <Image
                      src={div.logoUrl}
                      alt={div.name}
                      width={20}
                      height={20}
                      className="rounded"
                    />
                  )}
                  {div.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Team Ranking List */}
      {loading && (
        <div className="poke-card p-12 text-center">
          <div className="inline-block w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--foreground-muted)] mt-4 text-sm">Loading teams...</p>
        </div>
      )}

      {!loading && teams.length > 0 && selectedDivision && (
        <div className="poke-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--foreground-muted)] uppercase tracking-wide">
              Drag to Rank ({selectedDivision.name})
            </h2>
            <button
              onClick={startSlideshow}
              className="btn-retro py-2 px-5 text-[10px] flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Start Slideshow
            </button>
          </div>

          <p className="text-xs text-[var(--foreground-subtle)]">
            #1 = best team. The slideshow reveals from worst to best.
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={teams.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {teams.map((team, index) => (
                  <SortableTeam
                    key={team.id}
                    team={team}
                    index={index}
                    divisionColor={divisionColor}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Hosted By */}
          <div className="pt-4 border-t border-[var(--background-tertiary)]">
            <label className="text-xs font-bold text-[var(--foreground-muted)] uppercase tracking-wide block mb-2">
              Hosted By (optional)
            </label>
            <input
              type="text"
              value={hostedBy}
              onChange={(e) => setHostedBy(e.target.value)}
              placeholder="e.g. Jichar & Blue"
              className="w-full max-w-sm px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--background-tertiary)] text-white text-sm placeholder-[var(--foreground-subtle)] outline-none focus:border-[var(--foreground-subtle)] transition-colors"
            />
            <p className="text-[10px] text-[var(--foreground-subtle)] mt-1">
              Shown on the title slide
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
