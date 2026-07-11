"use client";

import { useState } from "react";
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

interface RankingTeam extends CoachData {
  wins: number;
  losses: number;
  differential: number;
  eloRating: number;
  movement: number;
  recentForm: ("W" | "L")[];
  streak: string;
  lastResult: { result: "W" | "L"; opponent: string; score: string } | null;
}

interface Props {
  seasons: Season[];
  preloadedData: Record<number, RankingTeam[]>;
}

function SortableTeam({
  team,
  index,
  divisionColor,
}: {
  team: RankingTeam;
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
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-white truncate">{team.teamName}</span>
          <span className="text-[10px] text-[var(--foreground-subtle)] truncate hidden sm:inline">{team.coachName}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--foreground-subtle)]">
          <span>DIFF <strong className={team.differential >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"}>{team.differential > 0 ? "+" : ""}{team.differential}</strong></span>
          <span>ELO <strong className="text-[var(--foreground-muted)]">{team.eloRating}</strong></span>
          <span>STREAK <strong className={team.streak.startsWith("W") ? "text-[var(--success)]" : team.streak.startsWith("L") ? "text-[var(--error)]" : "text-[var(--foreground-muted)]"}>{team.streak}</strong></span>
          {team.lastResult && <span>LAST <strong className={team.lastResult.result === "W" ? "text-[var(--success)]" : "text-[var(--error)]"}>{team.lastResult.result} {team.lastResult.score}</strong> vs {team.lastResult.opponent}</span>}
        </div>
      </div>

      {/* Form, movement, and record */}
      <div className="shrink-0 flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1">
          {team.recentForm.map((result, resultIndex) => (
            <span key={`${result}-${resultIndex}`} className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${result === "W" ? "bg-[var(--success)]/15 text-[var(--success)]" : "bg-[var(--error)]/15 text-[var(--error)]"}`}>{result}</span>
          ))}
        </div>
        <div className={`w-8 text-center text-xs font-bold ${team.movement > 0 ? "text-[var(--success)]" : team.movement < 0 ? "text-[var(--error)]" : "text-[var(--foreground-subtle)]"}`} title="Movement since the standings before the latest completed week">
          {team.movement > 0 ? `▲${team.movement}` : team.movement < 0 ? `▼${Math.abs(team.movement)}` : "—"}
        </div>
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
    RankingTeam[]
  >([]);
  const [hostedBy, setHostedBy] = useState("");

  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId);
  const selectedDivision = selectedSeason?.divisions.find(
    (d) => d.id === selectedDivisionId
  );
  const divisionColor = getDivisionColor(selectedDivision?.name);

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
                  onClick={() => {
                    setSelectedDivisionId(div.id);
                    setTeams(preloadedData[div.id] || []);
                  }}
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
      {teams.length > 0 && selectedDivision && (
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
