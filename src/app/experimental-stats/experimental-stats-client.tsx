"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Download,
  FlaskConical,
  GitCompareArrows,
  LineChart as LineChartIcon,
  ListFilter,
  Search,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HpChart } from "@/components/hp-chart";
import { experimentalMetricGroups, experimentalVisualDefinitions } from "@/lib/experimental-stats";
import { getDistinctHeldItemNames, isTransferredItemReveal } from "@/lib/revealed-items";

export interface ExperimentalAppearance {
  seasonCoachId: number;
  pokemonId: number;
  pokemonName: string;
  spriteUrl: string | null;
  kills: number;
  deaths: number;
  damageDealt: number | null;
  damageDealtIndirect: number | null;
  damageTaken: number | null;
  damageTakenIndirect: number | null;
  turnsActive: number | null;
  hazardDamageTaken: number | null;
  setupMovesUsed: number | null;
  favorableCrits: number | null;
  favorableMisses: number | null;
  favorableFlinches: number | null;
  favorableParalysis: number | null;
  favorableFreezes: number | null;
  favorableBurns: number | null;
  favorableSleep: number | null;
  hpRestored: number | null;
  movesUsed: Record<string, number>;
  moveDataRecorded: boolean;
  revealedItems: Array<{ item: string; turn: number; source: string }>;
  itemDataRecorded: boolean;
}

export interface ExperimentalMatch {
  id: number;
  isDemo?: boolean;
  seasonId: number;
  seasonName: string;
  divisionId: number;
  divisionName: string;
  week: number;
  winnerId: number | null;
  isForfeit: boolean;
  playedAt: string | null;
  replayUrl: string;
  zoroarkInvolved: boolean;
  p1IsCoach1: boolean | null;
  turnSnapshots: Array<{ turn: number; p1TotalHp: number; p2TotalHp: number }>;
  keyEvents: Array<{ turn: number; type: string; player?: "p1" | "p2"; pokemon?: string; cause?: string; killer?: string; move?: string }>;
  coach1: { seasonCoachId: number; coachId: number; coachName: string; teamName: string };
  coach2: { seasonCoachId: number; coachId: number; coachName: string; teamName: string };
  pokemon: ExperimentalAppearance[];
}

export interface ExperimentalStatsDataset {
  isDemo?: boolean;
  currentSeasonId: number | null;
  highestAvailableWeek: number;
  highestAvailableWeekBySeason: Record<number, number>;
  seasons: Array<{ id: number; name: string; seasonNumber: number }>;
  divisions: Array<{ id: number; seasonId: number; name: string; displayOrder: number }>;
  matches: ExperimentalMatch[];
}

export type ExperimentalClientModule = "pokemon" | "coaches" | "compare" | "rolling" | "leaderboard" | "replays" | "visualizer" | "rare" | "glossary";
type ModuleId = ExperimentalClientModule;
type ResultFilter = "all" | "wins" | "losses";
type StageFilter = "all" | "regular" | "playoffs";

export interface ExperimentalFilterState {
  seasonId: number | "all";
  divisionId: number | "all";
  weekStart: number;
  weekEnd: number;
  coachId: number | "all";
  pokemonId: number | "all";
  move: string | "all";
  item: string | "all";
  minimumAppearances: number;
  result: ResultFilter;
  stage: StageFilter;
  includeForfeits: boolean;
}

type Filters = ExperimentalFilterState;

interface EnrichedAppearance extends ExperimentalAppearance {
  match: ExperimentalMatch;
  coachId: number;
  coachName: string;
  teamName: string;
  won: boolean;
}

interface EntityAggregate {
  id: number;
  name: string;
  spriteUrl: string | null;
  appearances: number;
  wins: number;
  kills: number;
  deaths: number;
  damage: number;
  directDamage: number;
  indirectDamage: number;
  damageTaken: number;
  healing: number;
  turns: number;
  setupMoves: number;
  favorableEvents: number;
  damageAppearances: number;
  healingAppearances: number;
  turnsAppearances: number;
  setupAppearances: number;
  eventAppearances: number;
  moveDataAppearances: number;
  itemDataAppearances: number;
  itemReveals: number;
  survivalCount: number;
  uniqueMoves: number;
  mostUsedMove: string;
}

const MODULES: Array<{ id: ModuleId; label: string; icon: typeof BarChart3 }> = [
  { id: "pokemon", label: "Pokémon Profiles", icon: Sparkles },
  { id: "coaches", label: "Coach Profiles", icon: Users },
  { id: "compare", label: "Compare", icon: GitCompareArrows },
  { id: "rolling", label: "Rolling Trends", icon: LineChartIcon },
  { id: "leaderboard", label: "Custom Leaderboard", icon: ListFilter },
  { id: "replays", label: "Replay Search", icon: Search },
  { id: "visualizer", label: "Battle Visualizer", icon: BarChart3 },
  { id: "rare", label: "Rare Events", icon: FlaskConical },
  { id: "glossary", label: "Metric Glossary", icon: BookOpen },
];

const number = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const ordinal = (value: number) => {
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
};
const rate = (value: number, denominator: number) => denominator ? value / denominator : 0;
const coveredRate = (value: number, coverage: number) => coverage > 0 ? value / coverage : null;
const formatCovered = (value: number | null, digits = 1, suffix = "") => value === null ? "—" : `${number(value, digits)}${suffix}`;
const totalDamage = (appearance: ExperimentalAppearance) => (appearance.damageDealt ?? 0) + (appearance.damageDealtIndirect ?? 0);
const matchHref = (match: ExperimentalMatch) => match.isDemo ? "/experimental-stats?demo=1" : `/matches/${match.id}`;
const totalDamageTaken = (appearance: ExperimentalAppearance) => (appearance.damageTaken ?? 0) + (appearance.damageTakenIndirect ?? 0);
const sumFavorable = (appearance: ExperimentalAppearance) =>
  (appearance.favorableCrits ?? 0) + (appearance.favorableMisses ?? 0) + (appearance.favorableFlinches ?? 0) +
  (appearance.favorableParalysis ?? 0) + (appearance.favorableFreezes ?? 0) + (appearance.favorableBurns ?? 0) + (appearance.favorableSleep ?? 0);
const hasFavorableData = (appearance: ExperimentalAppearance) => [appearance.favorableCrits, appearance.favorableMisses, appearance.favorableFlinches, appearance.favorableParalysis, appearance.favorableFreezes, appearance.favorableBurns, appearance.favorableSleep].some((value) => value !== null);
const distinctHeldItemReveals = (appearance: ExperimentalAppearance) => {
  const names = new Set(getDistinctHeldItemNames(appearance.revealedItems).map((item) => item.toLowerCase()));
  const seen = new Set<string>();
  return [...appearance.revealedItems].sort((a, b) => a.turn - b.turn).filter((reveal) => {
    const key = reveal.item.trim().toLowerCase();
    if (!key || !names.has(key) || seen.has(key) || isTransferredItemReveal(reveal.source)) return false;
    seen.add(key);
    return true;
  });
};

function aggregateEntities(appearances: EnrichedAppearance[], entity: "pokemon" | "coach"): EntityAggregate[] {
  const rows = new Map<number, EntityAggregate & { moves: Map<string, number>; seenMatches: Set<number>; damageMatches: Set<number>; healingMatches: Set<number>; turnMatches: Set<number>; setupMatches: Set<number>; eventMatches: Set<number>; moveMatches: Set<number>; itemMatches: Set<number> }>();
  for (const appearance of appearances) {
    const id = entity === "pokemon" ? appearance.pokemonId : appearance.coachId;
    const name = entity === "pokemon" ? appearance.pokemonName : appearance.coachName;
    const existing = rows.get(id) ?? {
      id,
      name,
      spriteUrl: entity === "pokemon" ? appearance.spriteUrl : null,
      appearances: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      damage: 0,
      directDamage: 0,
      indirectDamage: 0,
      damageTaken: 0,
      healing: 0,
      turns: 0,
      setupMoves: 0,
      favorableEvents: 0,
      damageAppearances: 0,
      healingAppearances: 0,
      turnsAppearances: 0,
      setupAppearances: 0,
      eventAppearances: 0,
      moveDataAppearances: 0,
      itemDataAppearances: 0,
      itemReveals: 0,
      survivalCount: 0,
      uniqueMoves: 0,
      mostUsedMove: "—",
      moves: new Map<string, number>(),
      seenMatches: new Set<number>(),
      damageMatches: new Set<number>(),
      healingMatches: new Set<number>(),
      turnMatches: new Set<number>(),
      setupMatches: new Set<number>(),
      eventMatches: new Set<number>(),
      moveMatches: new Set<number>(),
      itemMatches: new Set<number>(),
    };
    if (entity === "pokemon" || !existing.seenMatches.has(appearance.match.id)) {
      existing.appearances += 1;
      existing.wins += appearance.won ? 1 : 0;
      existing.seenMatches.add(appearance.match.id);
    }
    existing.kills += appearance.kills;
    existing.deaths += appearance.deaths;
    existing.damage += totalDamage(appearance);
    existing.directDamage += appearance.damageDealt ?? 0;
    existing.indirectDamage += appearance.damageDealtIndirect ?? 0;
    existing.damageTaken += totalDamageTaken(appearance);
    existing.healing += appearance.hpRestored ?? 0;
    existing.turns += appearance.turnsActive ?? 0;
    existing.setupMoves += appearance.setupMovesUsed ?? 0;
    existing.favorableEvents += sumFavorable(appearance);
    if (appearance.damageDealt !== null && (entity === "pokemon" || !existing.damageMatches.has(appearance.match.id))) {
      existing.damageAppearances += 1;
      existing.damageMatches.add(appearance.match.id);
    }
    if (appearance.turnsActive !== null && (entity === "pokemon" || !existing.turnMatches.has(appearance.match.id))) {
      existing.turnsAppearances += 1;
      existing.turnMatches.add(appearance.match.id);
    }
    if (appearance.hpRestored !== null && (entity === "pokemon" || !existing.healingMatches.has(appearance.match.id))) {
      existing.healingAppearances += 1;
      existing.healingMatches.add(appearance.match.id);
    }
    if (appearance.setupMovesUsed !== null && (entity === "pokemon" || !existing.setupMatches.has(appearance.match.id))) {
      existing.setupAppearances += 1;
      existing.setupMatches.add(appearance.match.id);
    }
    if (hasFavorableData(appearance) && (entity === "pokemon" || !existing.eventMatches.has(appearance.match.id))) {
      existing.eventAppearances += 1;
      existing.eventMatches.add(appearance.match.id);
    }
    if (appearance.moveDataRecorded && (entity === "pokemon" || !existing.moveMatches.has(appearance.match.id))) {
      existing.moveDataAppearances += 1;
      existing.moveMatches.add(appearance.match.id);
    }
    if (appearance.itemDataRecorded && (entity === "pokemon" || !existing.itemMatches.has(appearance.match.id))) {
      existing.itemDataAppearances += 1;
      existing.itemMatches.add(appearance.match.id);
    }
    existing.itemReveals += distinctHeldItemReveals(appearance).length > 0 ? 1 : 0;
    existing.survivalCount += appearance.deaths === 0 ? 1 : 0;
    for (const [move, count] of Object.entries(appearance.movesUsed)) {
      existing.moves.set(move, (existing.moves.get(move) ?? 0) + count);
    }
    rows.set(id, existing);
  }
  return [...rows.values()].map((row) => {
    const sortedMoves = [...row.moves.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { ...row, uniqueMoves: row.moves.size, mostUsedMove: sortedMoves[0]?.[0] ?? "—" };
  });
}

function percentile(value: number, values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.filter((candidate) => candidate <= value).length / values.length) * 100);
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string | number; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 text-xs font-bold text-[var(--foreground)] shadow-inner shadow-black/20 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15">
        {children}
      </select>
    </label>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-950/95 to-slate-900/70 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-400/45">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/55 to-transparent opacity-70" />
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-2 break-words font-mono text-lg font-black text-white sm:text-xl">{value}</div>
      {detail ? <div className="mt-1 text-[10px] text-[var(--foreground-subtle)]">{detail}</div> : null}
    </div>
  );
}

function PercentileStrip({ label, value, percentileValue }: { label: string; value: string; percentileValue: number | null }) {
  const color = percentileValue === null ? "#64748b" : percentileValue >= 80 ? "#ef4444" : percentileValue >= 60 ? "#f97316" : percentileValue >= 40 ? "#94a3b8" : "#38bdf8";
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-[minmax(110px,1fr)_minmax(120px,2fr)_72px] sm:items-center sm:gap-3">
      <div className="font-bold text-[var(--foreground)]">{label}<span className="ml-2 font-mono text-[10px] text-[var(--foreground-muted)]">{value}</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-[var(--background-tertiary)]"><div className="h-full rounded-full" style={{ width: `${percentileValue ?? 0}%`, backgroundColor: color }} /></div>
      <div className="text-right font-mono font-black" style={{ color }}>{percentileValue === null ? "Not qualified" : <><span className="sm:hidden">{ordinal(percentileValue)} percentile</span><span className="hidden sm:inline">{ordinal(percentileValue)}</span></>}</div>
    </div>
  );
}

export function ExperimentalStatsClient({ dataset, initialModule = "pokemon", initialFilters, standalone = false }: { dataset: ExperimentalStatsDataset; initialModule?: ExperimentalClientModule; initialFilters?: ExperimentalFilterState; standalone?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [module, setModule] = useState<ModuleId>(initialModule);
  const highestWeekForSeason = (seasonId: number | "all") => seasonId === "all" ? dataset.highestAvailableWeek : dataset.highestAvailableWeekBySeason[seasonId] ?? dataset.highestAvailableWeek;
  const initialSeasonId = initialFilters?.seasonId ?? dataset.currentSeasonId ?? "all";
  const initialHighestWeek = highestWeekForSeason(initialSeasonId);
  const defaultFilters: Filters = {
    seasonId: initialSeasonId,
    divisionId: "all",
    weekStart: 1,
    weekEnd: initialHighestWeek,
    coachId: "all",
    pokemonId: "all",
    move: "all",
    item: "all",
    minimumAppearances: 3,
    result: "all",
    stage: "all",
    includeForfeits: false,
  };
  const [filters, setFilters] = useState<Filters>(() => initialFilters ? { ...initialFilters, weekEnd: initialFilters.weekEnd >= 999 ? initialHighestWeek : Math.min(initialFilters.weekEnd, initialHighestWeek) } : defaultFilters);
  const highestAvailableWeek = highestWeekForSeason(filters.seasonId);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [profilePokemonId, setProfilePokemonId] = useState<number | null>(null);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [visualMatchId, setVisualMatchId] = useState<number | null>(null);
  const [leaderboardEntity, setLeaderboardEntity] = useState<"pokemon" | "coach">("pokemon");
  const [leaderboardRate, setLeaderboardRate] = useState(false);
  const [glossarySearch, setGlossarySearch] = useState("");
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    setModule(initialModule);
  }, [initialModule]);

  useEffect(() => {
    if (initialFilters) {
      const maximum = initialFilters.seasonId === "all"
        ? dataset.highestAvailableWeek
        : dataset.highestAvailableWeekBySeason[initialFilters.seasonId] ?? dataset.highestAvailableWeek;
      setFilters({ ...initialFilters, weekEnd: initialFilters.weekEnd >= 999 ? maximum : Math.min(initialFilters.weekEnd, maximum) });
    }
  }, [initialFilters, dataset.highestAvailableWeek, dataset.highestAvailableWeekBySeason]);

  const optionData = useMemo(() => {
    const coaches = new Map<number, string>();
    const pokemon = new Map<number, string>();
    const moves = new Set<string>();
    const items = new Set<string>();
    for (const match of dataset.matches) {
      coaches.set(match.coach1.coachId, match.coach1.coachName);
      coaches.set(match.coach2.coachId, match.coach2.coachName);
      for (const appearance of match.pokemon) {
        pokemon.set(appearance.pokemonId, appearance.pokemonName);
        if (filters.pokemonId === "all" || appearance.pokemonId === filters.pokemonId) {
          Object.keys(appearance.movesUsed).forEach((move) => moves.add(move));
        }
        distinctHeldItemReveals(appearance).forEach((item) => items.add(item.item));
      }
    }
    return {
      coaches: [...coaches].sort((a, b) => a[1].localeCompare(b[1])),
      pokemon: [...pokemon].sort((a, b) => a[1].localeCompare(b[1])),
      moves: [...moves].sort(),
      items: [...items].sort(),
    };
  }, [dataset.matches, filters.pokemonId]);

  const visibleDivisions = dataset.divisions.filter((division) => filters.seasonId === "all" || division.seasonId === filters.seasonId);

  const enrichedAppearances = useMemo(() => dataset.matches.flatMap((match) => match.pokemon.flatMap((appearance): EnrichedAppearance[] => {
    const owner = appearance.seasonCoachId === match.coach1.seasonCoachId
      ? match.coach1
      : appearance.seasonCoachId === match.coach2.seasonCoachId
        ? match.coach2
        : null;
    if (!owner) return [];
    return [{ ...appearance, match, coachId: owner.coachId, coachName: owner.coachName, teamName: owner.teamName, won: match.winnerId === appearance.seasonCoachId }];
  })), [dataset.matches]);

  const filteredAppearances = useMemo(() => enrichedAppearances.filter((appearance) => {
    const match = appearance.match;
    if (filters.seasonId !== "all" && match.seasonId !== filters.seasonId) return false;
    if (filters.divisionId !== "all" && match.divisionId !== filters.divisionId) return false;
    if (match.week < filters.weekStart || match.week > filters.weekEnd) return false;
    if (filters.stage === "regular" && match.week > 100) return false;
    if (filters.stage === "playoffs" && match.week <= 100) return false;
    if (!filters.includeForfeits && match.isForfeit) return false;
    if (filters.coachId !== "all" && appearance.coachId !== filters.coachId) return false;
    if (filters.pokemonId !== "all" && appearance.pokemonId !== filters.pokemonId) return false;
    if (filters.move !== "all" && !appearance.movesUsed[filters.move]) return false;
    if (filters.item !== "all" && !distinctHeldItemReveals(appearance).some((item) => item.item === filters.item)) return false;
    if (filters.result === "wins" && !appearance.won) return false;
    if (filters.result === "losses" && appearance.won) return false;
    return true;
  }), [enrichedAppearances, filters]);

  const filteredMatchIds = new Set(filteredAppearances.map((appearance) => appearance.match.id));
  const filteredMatches = dataset.matches.filter((match) => filteredMatchIds.has(match.id));
  const pokemonRows = aggregateEntities(filteredAppearances, "pokemon").filter((row) => row.appearances >= filters.minimumAppearances).sort((a, b) => b.appearances - a.appearances || b.damage - a.damage);
  const coachRows = aggregateEntities(filteredAppearances, "coach").filter((row) => row.appearances >= filters.minimumAppearances).sort((a, b) => b.wins - a.wins || b.appearances - a.appearances);
  const activePokemon = pokemonRows.find((row) => row.id === profilePokemonId) ?? pokemonRows[0] ?? null;
  const activePokemonAppearances = activePokemon ? filteredAppearances.filter((appearance) => appearance.pokemonId === activePokemon.id).sort((a, b) => (a.match.playedAt ?? "").localeCompare(b.match.playedAt ?? "") || a.match.id - b.match.id) : [];

  const coveredMatches = new Set(filteredAppearances.filter((appearance) => appearance.damageDealt !== null || appearance.moveDataRecorded || appearance.itemDataRecorded).map((appearance) => appearance.match.id)).size;
  const allMoveUses = new Map<string, number>();
  filteredAppearances.forEach((appearance) => Object.entries(appearance.movesUsed).forEach(([move, count]) => allMoveUses.set(move, (allMoveUses.get(move) ?? 0) + count)));
  const topMove = [...allMoveUses].sort((a, b) => b[1] - a[1])[0];

  const updateFilters = (patch: Partial<Filters>) => setFilters((current) => {
    const next = { ...current, ...patch };
    if (standalone) {
      const query = new URLSearchParams({
        season: String(next.seasonId),
        division: String(next.divisionId),
        weekStart: String(next.weekStart),
        weekEnd: String(next.weekEnd),
        coach: String(next.coachId),
        pokemon: String(next.pokemonId),
        move: next.move,
        item: next.item,
        min: String(next.minimumAppearances),
        result: next.result,
        stage: next.stage,
        forfeits: next.includeForfeits ? "1" : "0",
      });
      if (dataset.isDemo) query.set("demo", "1");
      router.replace(`${pathname}?${query}`, { scroll: false });
    }
    return next;
  });
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => updateFilters({ [key]: value });
  const qualificationText = `${filters.minimumAppearances}+ appearances in the active filters`;

  const shareView = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setShareMessage("Link copied");
    window.setTimeout(() => setShareMessage(""), 1600);
  };

  return (
    <div className="experimental-stats-readable readable-content space-y-6">
      {dataset.isDemo ? <div className="flex flex-col gap-3 rounded-xl border border-cyan-400/35 bg-cyan-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-cyan-200">Demo data active</div><p className="mt-1 text-[10px] leading-4 text-cyan-100/70">These simulated results exist only in this preview and are never written to the PBO database.</p></div><Link href={pathname} className="btn-retro-secondary shrink-0 px-3 py-2 text-center text-[9px]">Exit demo</Link></div> : null}
      {module !== "glossary" ? <section className="poke-card relative overflow-hidden border-slate-700/80 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-violet-950/25 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] md:p-5">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500" />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-pixel text-xs text-white"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300"><ListFilter className="h-3.5 w-3.5" /></span>Shared filters</h2>
            <p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Every module below uses the same replay-evidence scope.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300">{coveredMatches}/{filteredMatches.length} matches with detailed saved fields</span>
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="btn-retro-secondary px-3 py-2 text-[9px] lg:hidden">{filtersOpen ? "Hide filters" : "Show filters"}</button>
            <button type="button" onClick={shareView} className="btn-retro-secondary inline-flex items-center gap-1 px-3 py-2 text-[9px]"><Share2 className="h-3 w-3" />{shareMessage || "Share"}</button>
          </div>
        </div>
        <div className={`${filtersOpen ? "grid" : "hidden"} gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-4 xl:grid-cols-6`}>
          <FilterSelect label="Season" value={filters.seasonId} onChange={(value) => { const seasonId = value === "all" ? "all" : Number(value); updateFilters({ seasonId, divisionId: "all", weekEnd: highestWeekForSeason(seasonId) }); }}><option value="all">All seasons</option>{dataset.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</FilterSelect>
          <FilterSelect label="Division" value={filters.divisionId} onChange={(value) => updateFilter("divisionId", value === "all" ? "all" : Number(value))}><option value="all">All divisions</option>{filters.seasonId === "all" ? dataset.seasons.map((season) => { const seasonDivisions = visibleDivisions.filter((division) => division.seasonId === season.id).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)); return seasonDivisions.length ? <optgroup key={season.id} label={season.name}>{seasonDivisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</optgroup> : null; }) : [...visibleDivisions].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)).map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</FilterSelect>
          <FilterSelect label="Coach" value={filters.coachId} onChange={(value) => updateFilter("coachId", value === "all" ? "all" : Number(value))}><option value="all">All coaches</option>{optionData.coaches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</FilterSelect>
          <FilterSelect label="Pokémon" value={filters.pokemonId} onChange={(value) => updateFilters({ pokemonId: value === "all" ? "all" : Number(value), move: "all" })}><option value="all">All Pokémon</option>{optionData.pokemon.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</FilterSelect>
          <FilterSelect label={filters.pokemonId === "all" ? "Move" : "Recorded move"} value={filters.move} onChange={(value) => updateFilter("move", value)}><option value="all">{filters.pokemonId === "all" ? "All moves" : "All recorded moves"}</option>{optionData.moves.map((move) => <option key={move}>{move}</option>)}</FilterSelect>
          <FilterSelect label="Item" value={filters.item} onChange={(value) => updateFilter("item", value)}><option value="all">All items</option>{optionData.items.map((item) => <option key={item}>{item}</option>)}</FilterSelect>
          <label className="space-y-1"><span className="block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Week range</span><div className="flex items-center gap-1"><input aria-label="First week" type="number" min={1} max={highestAvailableWeek} value={filters.weekStart} onChange={(event) => updateFilter("weekStart", Math.min(highestAvailableWeek, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 text-xs outline-none focus:border-violet-400" /><span>–</span><input aria-label="Last week" type="number" min={1} max={highestAvailableWeek} value={filters.weekEnd} onChange={(event) => updateFilter("weekEnd", Math.min(highestAvailableWeek, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 text-xs outline-none focus:border-violet-400" /></div></label>
          <label className="space-y-1"><span className="block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Minimum appearances</span><input type="number" min={1} max={999} value={filters.minimumAppearances} onChange={(event) => updateFilter("minimumAppearances", Math.max(1, Number(event.target.value) || 1))} className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 text-xs outline-none focus:border-violet-400" /></label>
          <FilterSelect label="Result" value={filters.result} onChange={(value) => updateFilter("result", value as ResultFilter)}><option value="all">Wins & losses</option><option value="wins">Wins only</option><option value="losses">Losses only</option></FilterSelect>
          <FilterSelect label="Stage" value={filters.stage} onChange={(value) => updateFilter("stage", value as StageFilter)}><option value="all">Regular & playoffs</option><option value="regular">Regular season</option><option value="playoffs">Playoffs</option></FilterSelect>
          <label className="flex items-end gap-2 pb-2 text-xs font-bold text-[var(--foreground-muted)]"><input type="checkbox" checked={filters.includeForfeits} onChange={(event) => updateFilter("includeForfeits", event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />Include forfeits</label>
        </div>
      </section> : null}

      <div className={standalone ? "" : "grid gap-6 xl:grid-cols-[230px_minmax(0,1fr)]"}>
        {!standalone ? <aside className="poke-card h-fit p-2 xl:sticky xl:top-24">
          <nav className="grid gap-1 sm:grid-cols-3 xl:grid-cols-1">
            {MODULES.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setModule(id)} className={`flex items-center gap-2 rounded-lg px-3 py-3 text-left text-xs font-bold transition-colors ${module === id ? "bg-[var(--primary)] text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span><ChevronRight className="h-3 w-3" /></button>)}
          </nav>
        </aside> : null}

        <main className="min-w-0 space-y-6">
          {module !== "glossary" ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Matches" value={number(filteredMatches.length)} />
            <StatCard label="Appearances" value={number(filteredAppearances.length)} />
            <StatCard label="Unique moves" value={number(allMoveUses.size)} />
            <StatCard label="Most-used move" value={topMove ? `${topMove[0]} · ${topMove[1]}` : "—"} />
          </div> : null}

          {module === "pokemon" && <PokemonProfiles rows={pokemonRows} active={activePokemon} appearances={activePokemonAppearances} qualificationText={qualificationText} minimumAppearances={filters.minimumAppearances} onSelect={setProfilePokemonId} />}
          {module === "coaches" && <CoachProfiles rows={coachRows} appearances={filteredAppearances} />}
          {module === "compare" && <CompareModule rows={pokemonRows} compareA={compareA} compareB={compareB} setCompareA={setCompareA} setCompareB={setCompareB} />}
          {module === "rolling" && <RollingModule pokemon={activePokemon} appearances={activePokemonAppearances} rows={pokemonRows} onSelect={setProfilePokemonId} />}
          {module === "leaderboard" && <LeaderboardModule rows={leaderboardEntity === "pokemon" ? pokemonRows : coachRows} entity={leaderboardEntity} setEntity={setLeaderboardEntity} perAppearance={leaderboardRate} setPerAppearance={setLeaderboardRate} />}
          {module === "replays" && <ReplaySearchModule matches={filteredMatches} />}
          {module === "visualizer" && <BattleVisualizer matches={filteredMatches} selectedId={visualMatchId} onSelect={setVisualMatchId} />}
          {module === "rare" && <RareEventsModule matches={filteredMatches} appearances={filteredAppearances} />}
          {module === "glossary" && <GlossaryModule search={glossarySearch} setSearch={setGlossarySearch} />}
        </main>
      </div>
    </div>
  );
}

function PokemonProfiles({ rows, active, appearances, qualificationText, minimumAppearances, onSelect }: { rows: EntityAggregate[]; active: EntityAggregate | null; appearances: EnrichedAppearance[]; qualificationText: string; minimumAppearances: number; onSelect: (id: number) => void }) {
  const [profileTab, setProfileTab] = useState<"standard" | "advanced" | "career" | "games" | "splits" | "records">("standard");
  if (!active) return <EmptyState />;
  const recentAppearances = [...appearances].reverse().slice(0, 10);
  const directShare = active.damage ? (active.directDamage / active.damage) * 100 : 0;
  const itemCounts = new Map<string, number>();
  appearances.forEach((appearance) => distinctHeldItemReveals(appearance).forEach((item) => itemCounts.set(item.item, (itemCounts.get(item.item) ?? 0) + 1)));
  const topItems = [...itemCounts].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rankBy = (values: EntityAggregate[], value: (row: EntityAggregate) => number) => [...values].sort((a, b) => value(b) - value(a)).findIndex((row) => row.id === active.id) + 1;
  const appearanceRank = rankBy(rows, (row) => row.appearances);
  const killRank = rankBy(rows, (row) => row.kills);
  const damageQualified = rows.filter((row) => row.damageAppearances >= minimumAppearances);
  const damageRank = damageQualified.some((row) => row.id === active.id) ? rankBy(damageQualified, (row) => rate(row.damage, row.damageAppearances)) : 0;

  const careerGroups = new Map<string, { seasonId: number; seasonName: string; coachId: number; coachName: string; teamName: string; appearances: EnrichedAppearance[] }>();
  for (const appearance of appearances) {
    const key = `${appearance.match.seasonId}:${appearance.coachId}`;
    const group = careerGroups.get(key) ?? { seasonId: appearance.match.seasonId, seasonName: appearance.match.seasonName, coachId: appearance.coachId, coachName: appearance.coachName, teamName: appearance.teamName, appearances: [] };
    group.appearances.push(appearance);
    careerGroups.set(key, group);
  }
  const careerRows = [...careerGroups.values()].map((group) => ({ ...group, stats: aggregateEntities(group.appearances, "pokemon")[0] })).sort((a, b) => b.seasonId - a.seasonId || a.coachName.localeCompare(b.coachName));

  const makeSplit = (label: string, splitAppearances: EnrichedAppearance[]) => ({ label, stats: aggregateEntities(splitAppearances, "pokemon")[0] });
  const splitSections = [
    { label: "Competition", rows: [makeSplit("Regular season", appearances.filter((a) => a.match.week <= 100)), makeSplit("Playoffs", appearances.filter((a) => a.match.week > 100))] },
    { label: "Result", rows: [makeSplit("Wins", appearances.filter((a) => a.won)), makeSplit("Losses", appearances.filter((a) => !a.won))] },
    { label: "Schedule window", rows: [makeSplit("Weeks 1–4", appearances.filter((a) => a.match.week >= 1 && a.match.week <= 4)), makeSplit("Weeks 5–8", appearances.filter((a) => a.match.week >= 5 && a.match.week <= 8))] },
    { label: "Coach", rows: [...new Map(appearances.map((a) => [a.coachId, a.coachName])).entries()].map(([id, name]) => makeSplit(name, appearances.filter((a) => a.coachId === id))) },
    { label: "Season", rows: [...new Map(appearances.map((a) => [a.match.seasonId, a.match.seasonName])).entries()].map(([id, name]) => makeSplit(name, appearances.filter((a) => a.match.seasonId === id))) },
    { label: "Division", rows: [...new Map(appearances.map((a) => [a.match.divisionId, a.match.divisionName])).entries()].map(([id, name]) => makeSplit(name, appearances.filter((a) => a.match.divisionId === id))) },
    { label: "Revealed item", rows: [...new Set(appearances.flatMap((a) => distinctHeldItemReveals(a).map((item) => item.item)))].sort().map((item) => makeSplit(item, appearances.filter((a) => distinctHeldItemReveals(a).some((reveal) => reveal.item === item)))) },
    { label: "Move used", rows: [...new Set(appearances.flatMap((a) => Object.keys(a.movesUsed)))].sort().map((move) => makeSplit(move, appearances.filter((a) => Boolean(a.movesUsed[move])))) },
  ].map((section) => ({ ...section, rows: section.rows.filter((row) => row.stats) }));

  const chronological = [...appearances].sort((a, b) => (a.match.playedAt ?? "").localeCompare(b.match.playedAt ?? "") || a.match.id - b.match.id);
  let survivalStreak = 0;
  let longestSurvivalStreak = 0;
  for (const appearance of chronological) {
    survivalStreak = appearance.deaths === 0 ? survivalStreak + 1 : 0;
    longestSurvivalStreak = Math.max(longestSurvivalStreak, survivalStreak);
  }
  const bestDamage = appearances.filter((a) => a.damageDealt !== null).sort((a, b) => totalDamage(b) - totalDamage(a))[0];
  const bestHealing = appearances.filter((a) => a.hpRestored !== null).sort((a, b) => (b.hpRestored ?? 0) - (a.hpRestored ?? 0))[0];
  const mostMoves = [...appearances].sort((a, b) => Object.keys(b.movesUsed).length - Object.keys(a.movesUsed).length)[0];
  const bestCoachRow = [...careerRows].sort((a, b) => b.stats.kills - a.stats.kills)[0];

  const similarityMetrics = [
    { value: (row: EntityAggregate) => coveredRate(row.damage, row.damageAppearances), covered: (row: EntityAggregate) => row.damageAppearances > 0 },
    { value: (row: EntityAggregate) => coveredRate(row.healing, row.healingAppearances), covered: (row: EntityAggregate) => row.healingAppearances > 0 },
    { value: (row: EntityAggregate) => coveredRate(row.turns, row.turnsAppearances), covered: (row: EntityAggregate) => row.turnsAppearances > 0 },
    { value: (row: EntityAggregate) => coveredRate(row.setupMoves, row.setupAppearances), covered: (row: EntityAggregate) => row.setupAppearances > 0 },
    { value: (row: EntityAggregate) => coveredRate(row.kills - row.deaths, row.appearances), covered: (row: EntityAggregate) => row.appearances > 0 },
    { value: (row: EntityAggregate) => coveredRate(row.survivalCount * 100, row.appearances), covered: (row: EntityAggregate) => row.appearances > 0 },
  ];
  const similarPokemon = rows.filter((candidate) => candidate.id !== active.id).flatMap((candidate) => {
    let squaredDistance = 0;
    let dimensions = 0;
    for (const metric of similarityMetrics) {
      if (!metric.covered(active) || !metric.covered(candidate)) continue;
      const values = rows.filter(metric.covered).map((row) => metric.value(row) ?? 0);
      const range = Math.max(...values) - Math.min(...values) || 1;
      squaredDistance += Math.pow(((metric.value(active) ?? 0) - (metric.value(candidate) ?? 0)) / range, 2);
      dimensions += 1;
    }
    return dimensions >= 4 ? [{ ...candidate, similarity: Math.max(0, Math.round((1 - Math.sqrt(squaredDistance / dimensions)) * 100)) }] : [];
  }).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  const metrics = [
    { label: "Damage Dealt", value: rate(active.damage, active.damageAppearances), display: active.damageAppearances ? `${number(rate(active.damage, active.damageAppearances), 1)}/game` : "—", coverage: active.damageAppearances, values: rows.filter((row) => row.damageAppearances >= minimumAppearances).map((row) => rate(row.damage, row.damageAppearances)) },
    { label: "Direct Damage", value: rate(active.directDamage, active.damageAppearances), display: active.damageAppearances ? `${number(rate(active.directDamage, active.damageAppearances), 1)}/game` : "—", coverage: active.damageAppearances, values: rows.filter((row) => row.damageAppearances >= minimumAppearances).map((row) => rate(row.directDamage, row.damageAppearances)) },
    { label: "Indirect Damage", value: rate(active.indirectDamage, active.damageAppearances), display: active.damageAppearances ? `${number(rate(active.indirectDamage, active.damageAppearances), 1)}/game` : "—", coverage: active.damageAppearances, values: rows.filter((row) => row.damageAppearances >= minimumAppearances).map((row) => rate(row.indirectDamage, row.damageAppearances)) },
    { label: "HP Restored", value: rate(active.healing, active.healingAppearances), display: active.healingAppearances ? `${number(rate(active.healing, active.healingAppearances), 1)}/game` : "—", coverage: active.healingAppearances, values: rows.filter((row) => row.healingAppearances >= minimumAppearances).map((row) => rate(row.healing, row.healingAppearances)) },
    { label: "Turns Active", value: rate(active.turns, active.turnsAppearances), display: active.turnsAppearances ? `${number(rate(active.turns, active.turnsAppearances), 1)}/game` : "—", coverage: active.turnsAppearances, values: rows.filter((row) => row.turnsAppearances >= minimumAppearances).map((row) => rate(row.turns, row.turnsAppearances)) },
    { label: "Survival Rate", value: rate(active.survivalCount, active.appearances) * 100, display: `${number(rate(active.survivalCount, active.appearances) * 100, 1)}%`, coverage: active.appearances, values: rows.filter((row) => row.appearances >= minimumAppearances).map((row) => rate(row.survivalCount, row.appearances) * 100) },
    { label: "Setup Moves", value: rate(active.setupMoves, active.setupAppearances), display: active.setupAppearances ? `${number(rate(active.setupMoves, active.setupAppearances), 2)}/game` : "—", coverage: active.setupAppearances, values: rows.filter((row) => row.setupAppearances >= minimumAppearances).map((row) => rate(row.setupMoves, row.setupAppearances)) },
  ];
  const tabs = [{ id: "standard", label: "Standard" }, { id: "advanced", label: "Advanced" }, { id: "career", label: "Career" }, { id: "games", label: "Game Log" }, { id: "splits", label: "Splits" }, { id: "records", label: "Records" }] as const;
  const gameLog = (
    <><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[860px] text-left text-xs"><thead className="text-[9px] uppercase tracking-wide text-[var(--foreground-muted)]"><tr><th className="p-2">Match</th><th>Opponent</th><th>Result</th><th>K–D</th><th>Damage</th><th>Healing</th><th>Turns</th><th>Item</th><th>Moves</th></tr></thead><tbody>{[...appearances].reverse().map((appearance) => { const opponent = appearance.seasonCoachId === appearance.match.coach1.seasonCoachId ? appearance.match.coach2 : appearance.match.coach1; return <tr key={`${appearance.match.id}-${appearance.seasonCoachId}`} className="border-t border-[var(--border)]"><td className="p-2"><Link href={matchHref(appearance.match)} className="font-bold text-white hover:text-[var(--primary)]">{appearance.match.seasonName} · W{appearance.match.week}</Link></td><td>{opponent.teamName}</td><td className={appearance.won ? "text-emerald-400" : "text-red-400"}>{appearance.won ? "W" : "L"}</td><td>{appearance.kills}-{appearance.deaths}</td><td>{appearance.damageDealt !== null ? `${number(totalDamage(appearance))}%` : "—"}</td><td>{appearance.hpRestored !== null ? `${number(appearance.hpRestored)}%` : "—"}</td><td>{appearance.turnsActive ?? "—"}</td><td>{distinctHeldItemReveals(appearance).map((item) => item.item).join(", ") || (appearance.itemDataRecorded ? "Unrevealed" : "—")}</td><td className="max-w-52 truncate">{appearance.moveDataRecorded ? Object.keys(appearance.movesUsed).join(", ") || "None" : "—"}</td></tr>; })}</tbody></table></div><div className="grid gap-3 sm:hidden">{[...appearances].reverse().map((appearance) => { const opponent = appearance.seasonCoachId === appearance.match.coach1.seasonCoachId ? appearance.match.coach2 : appearance.match.coach1; return <Link key={`${appearance.match.id}-${appearance.seasonCoachId}`} href={matchHref(appearance.match)} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><div className="flex justify-between gap-3"><div><strong className="text-white">vs {opponent.teamName}</strong><div className="mt-1 text-[10px] text-[var(--foreground-muted)]">{appearance.match.seasonName} · W{appearance.match.week}</div></div><span className={appearance.won ? "text-emerald-400" : "text-red-400"}>{appearance.won ? "W" : "L"}</span></div><div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px]"><span>{appearance.kills}-{appearance.deaths}<small className="block text-[8px] text-[var(--foreground-muted)]">K–D</small></span><span>{appearance.damageDealt !== null ? `${number(totalDamage(appearance))}%` : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">Damage</small></span><span>{appearance.hpRestored !== null ? `${number(appearance.hpRestored)}%` : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">Healing</small></span><span>{appearance.turnsActive ?? "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">Turns</small></span></div></Link>; })}</div></>
  );

  return <section className="poke-card relative overflow-hidden border-slate-700/80 bg-slate-900/85 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] md:p-6"><div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-400" /><div className="-mx-5 -mt-5 border-b border-slate-700/60 bg-gradient-to-r from-violet-950/55 via-slate-900/90 to-cyan-950/35 p-5 md:-mx-6 md:-mt-6 md:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.15em] text-violet-200"><Sparkles className="h-3 w-3" />Reference report</div><h2 className="font-pixel text-sm text-white">Pokémon profile</h2><p className="mt-1 max-w-2xl text-xs text-slate-400">Verified totals, rates, splits, and match evidence for the active filters.</p></div><label className="w-full sm:w-auto"><span className="mb-1 block text-[8px] font-black uppercase tracking-wider text-slate-400">Profile</span><select value={active.id} onChange={(event) => onSelect(Number(event.target.value))} className="h-11 w-full min-w-56 rounded-xl border border-violet-400/30 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-500/20 sm:w-auto">{rows.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.appearances} apps</option>)}</select></label></div></div><div className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-950/45 p-1.5">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setProfileTab(tab.id)} className={`shrink-0 rounded-lg px-3.5 py-2.5 text-[9px] font-black uppercase tracking-wide transition ${profileTab === tab.id ? "bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-950/30" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{tab.label}</button>)}</div>
    {profileTab === "standard" ? <div className="mt-6 space-y-7"><div className="grid items-start gap-4 lg:grid-cols-[280px_1fr]"><div className="relative overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-950/80 via-slate-950 to-cyan-950/55 p-6 text-center shadow-[0_18px_45px_rgba(15,23,42,0.45)]"><div className="absolute left-1/2 top-12 h-36 w-36 -translate-x-1/2 rounded-full bg-violet-500/20 blur-3xl" />{active.spriteUrl ? <Image src={active.spriteUrl} alt="" width={160} height={160} className="relative mx-auto h-36 w-36 object-contain drop-shadow-[0_14px_20px_rgba(139,92,246,0.35)]" /> : null}<h3 className="relative mt-2 text-2xl font-black text-white">{active.name}</h3><div className="relative mt-3 flex flex-wrap justify-center gap-2"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-slate-300">{active.appearances} appearances</span><span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-300">{active.wins}-{active.appearances - active.wins} record</span></div></div><div className="grid auto-rows-max grid-cols-2 content-start gap-3 self-start md:grid-cols-3"><StatCard label="Record" value={`${active.wins}-${active.appearances - active.wins}`} /><StatCard label="Kills" value={number(active.kills)} /><StatCard label="Deaths" value={number(active.deaths)} /><StatCard label="Damage" value={active.damageAppearances ? `${number(active.damage)}%` : "—"} detail={`${active.damageAppearances} covered`} /><StatCard label="Healing" value={active.healingAppearances ? `${number(active.healing)}%` : "—"} detail={`${active.healingAppearances} covered`} /><StatCard label="Most-used move" value={active.mostUsedMove} /></div></div><div><div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-xs font-black uppercase tracking-[0.12em] text-white">Recent appearances</h3><p className="mt-1 text-[10px] text-slate-500">Latest recorded match results for {active.name}</p></div><button type="button" onClick={() => setProfileTab("games")} className="text-[9px] font-black uppercase text-violet-300 hover:text-violet-200">View full log →</button></div>{recentAppearances.length ? <div className="grid gap-2 sm:grid-cols-2">{recentAppearances.map((appearance) => <Link key={appearance.match.id} href={matchHref(appearance.match)} className="group rounded-xl border border-slate-700/70 bg-slate-950/55 p-3.5 transition hover:-translate-y-0.5 hover:border-violet-400/40 hover:bg-violet-950/20"><div className="flex justify-between gap-3"><span className="font-bold text-white group-hover:text-violet-200">{appearance.match.seasonName} · W{appearance.match.week}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${appearance.won ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>{appearance.won ? "WIN" : "LOSS"}</span></div><div className="mt-2 text-[10px] text-slate-400">{appearance.kills}-{appearance.deaths} K–D · {appearance.damageDealt !== null ? `${number(totalDamage(appearance))}% damage` : "damage unknown"}</div></Link>)}</div> : <EmptyState />}</div></div> : null}
    {profileTab === "advanced" ? <div className="mt-6 space-y-6"><p className="text-xs text-[var(--foreground-muted)]">Percentiles are relative to Pokémon with {qualificationText} for each individual metric.</p><div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">{metrics.map((metric) => <PercentileStrip key={metric.label} label={metric.label} value={metric.display} percentileValue={metric.coverage >= minimumAppearances ? percentile(metric.value, metric.values) : null} />)}</div><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase text-white">Damage composition</h3>{active.damageAppearances ? <><div className="mt-4 flex h-5 overflow-hidden rounded-full"><div className="bg-cyan-500" style={{ width: `${directShare}%` }} /><div className="bg-violet-500" style={{ width: `${100 - directShare}%` }} /></div><div className="mt-2 flex justify-between text-[10px]"><span className="text-cyan-300">{number(active.directDamage)}% direct</span><span className="text-violet-300">{number(active.indirectDamage)}% indirect</span></div></> : <p className="mt-3 text-xs text-[var(--foreground-muted)]">No damage coverage.</p>}</div><div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase text-white">Item distribution</h3><div className="mt-3 flex flex-wrap gap-2">{topItems.map(([item, count]) => <span key={item} className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-100">{item} · {count}</span>)}</div></div></div><div><h3 className="mb-3 text-xs font-black uppercase text-white">Similar Pokémon profiles</h3><p className="mb-3 text-[10px] text-[var(--foreground-muted)]">Descriptive similarity across available rates—not matchup advice.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{similarPokemon.map((pokemon) => <button key={pokemon.id} type="button" onClick={() => onSelect(pokemon.id)} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-left"><strong className="text-xs text-white">{pokemon.name}</strong><div className="mt-1 font-mono text-sm text-violet-300">{pokemon.similarity}% similar</div></button>)}</div></div></div> : null}
    {profileTab === "career" ? <div className="mt-6"><p className="mb-4 text-xs text-[var(--foreground-muted)]">One row per season and persistent coach in the active scope, followed by career totals.</p><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[780px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Season</th><th className="text-left">Coach / Team</th><th>GP</th><th>Record</th><th>K–D</th><th>Damage</th><th>Healing</th><th>Turns</th></tr></thead><tbody>{careerRows.map((row) => <tr key={`${row.seasonId}-${row.coachId}`} className="border-t border-[var(--border)] text-center"><td className="p-2 text-left font-bold text-white">{row.seasonName}</td><td className="text-left">{row.coachName}<small className="block text-[9px] text-[var(--foreground-muted)]">{row.teamName}</small></td><td>{row.stats.appearances}</td><td>{row.stats.wins}-{row.stats.appearances - row.stats.wins}</td><td>{row.stats.kills}-{row.stats.deaths}</td><td>{row.stats.damageAppearances ? `${number(row.stats.damage)}%` : "—"}</td><td>{row.stats.healingAppearances ? `${number(row.stats.healing)}%` : "—"}</td><td>{row.stats.turnsAppearances ? row.stats.turns : "—"}</td></tr>)}<tr className="border-t-2 border-violet-400/40 bg-violet-500/5 text-center font-black"><td className="p-2 text-left" colSpan={2}>Career totals</td><td>{active.appearances}</td><td>{active.wins}-{active.appearances - active.wins}</td><td>{active.kills}-{active.deaths}</td><td>{active.damageAppearances ? `${number(active.damage)}%` : "—"}</td><td>{active.healingAppearances ? `${number(active.healing)}%` : "—"}</td><td>{active.turnsAppearances ? active.turns : "—"}</td></tr></tbody></table></div><div className="grid gap-3 sm:hidden">{careerRows.map((row) => <div key={`${row.seasonId}-${row.coachId}`} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><strong className="text-white">{row.seasonName}</strong><div className="mt-1 text-[10px] text-[var(--foreground-muted)]">{row.coachName} · {row.teamName}</div><div className="mt-3 grid grid-cols-3 text-center text-xs"><span>{row.stats.appearances}<small className="block text-[8px]">GP</small></span><span>{row.stats.wins}-{row.stats.appearances-row.stats.wins}<small className="block text-[8px]">Record</small></span><span>{row.stats.kills}-{row.stats.deaths}<small className="block text-[8px]">K–D</small></span></div></div>)}</div></div> : null}
    {profileTab === "games" ? <div className="mt-6">{gameLog}</div> : null}
    {profileTab === "splits" ? <div className="mt-6 space-y-6"><div className="rounded-lg border border-slate-500/30 bg-slate-500/10 p-3 text-xs text-[var(--foreground-muted)]">Lead/non-lead and Tera/no-Tera splits remain unavailable until normalized lead and Terastallization events are stored.</div>{splitSections.map((section) => <div key={section.label}><h3 className="mb-2 text-xs font-black uppercase text-white">{section.label}</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{section.rows.map((row) => <div key={row.label} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"><div className="font-bold text-white">{row.label}</div><div className="mt-2 grid grid-cols-3 text-center text-[10px]"><span>{row.stats.appearances}<small className="block text-[8px] text-[var(--foreground-muted)]">GP</small></span><span>{row.stats.wins}-{row.stats.appearances-row.stats.wins}<small className="block text-[8px] text-[var(--foreground-muted)]">Record</small></span><span>{formatCovered(coveredRate(row.stats.damage,row.stats.damageAppearances),1,"%") }<small className="block text-[8px] text-[var(--foreground-muted)]">Dmg/GP</small></span></div></div>)}</div></div>)}</div> : null}
    {profileTab === "records" ? <div className="mt-6 space-y-6"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Appearance rank" value={appearanceRank ? `#${appearanceRank}` : "—"} detail="Active scope" /><StatCard label="Kill rank" value={killRank ? `#${killRank}` : "—"} detail="Active scope" /><StatCard label="Damage-rate rank" value={damageRank ? `#${damageRank}` : "Not qualified"} detail={`${minimumAppearances}+ covered appearances`} /><StatCard label="Longest survival streak" value={`${longestSurvivalStreak} games`} /></div><div className="grid gap-3 md:grid-cols-2"><StatCard label="Best single-game damage" value={bestDamage ? `${number(totalDamage(bestDamage))}%` : "—"} detail={bestDamage ? `${bestDamage.match.seasonName} · W${bestDamage.match.week}` : undefined} /><StatCard label="Best single-game healing" value={bestHealing ? `${number(bestHealing.hpRestored ?? 0)}%` : "—"} detail={bestHealing ? `${bestHealing.match.seasonName} · W${bestHealing.match.week}` : undefined} /><StatCard label="Most distinct moves in one game" value={mostMoves?.moveDataRecorded ? `${Object.keys(mostMoves.movesUsed).length}` : "—"} detail={mostMoves?.moveDataRecorded ? Object.keys(mostMoves.movesUsed).join(", ") : undefined} /><StatCard label="Most kills under one coach" value={bestCoachRow ? `${bestCoachRow.stats.kills}` : "—"} detail={bestCoachRow ? `${bestCoachRow.coachName} · ${bestCoachRow.seasonName}` : undefined} /></div></div> : null}
  </section>;
}

function CoachProfiles({ rows, appearances }: { rows: EntityAggregate[]; appearances: EnrichedAppearance[] }) {
  const [activeCoachId, setActiveCoachId] = useState<number | null>(null);
  const active = rows.find((row) => row.id === activeCoachId) ?? rows[0];
  if (!active) return <EmptyState />;
  const coachApps = appearances.filter((appearance) => appearance.coachId === active.id);
  const usage = aggregateEntities(coachApps, "pokemon").sort((a, b) => b.appearances - a.appearances).slice(0, 10);
  const directShare = active.damage ? (active.directDamage / active.damage) * 100 : 0;
  const coachMatches = [...new Map(coachApps.map((appearance) => [appearance.match.id, appearance.match])).values()];
  const timelineMatches = coachMatches.filter((match) => match.turnSnapshots.length > 0);
  const averageBattleLength = timelineMatches.length ? timelineMatches.reduce((sum, match) => sum + match.turnSnapshots.reduce((maximum, snapshot) => Math.max(maximum, snapshot.turn), 0), 0) / timelineMatches.length : null;
  const coachSeasonGroups = new Map<number, { seasonName: string; appearances: EnrichedAppearance[] }>();
  coachApps.forEach((appearance) => {
    const group = coachSeasonGroups.get(appearance.match.seasonId) ?? { seasonName: appearance.match.seasonName, appearances: [] };
    group.appearances.push(appearance);
    coachSeasonGroups.set(appearance.match.seasonId, group);
  });
  const coachSeasonRows = [...coachSeasonGroups.entries()].map(([seasonId, group]) => ({ seasonId, seasonName: group.seasonName, stats: aggregateEntities(group.appearances, "coach")[0], pokemonUsed: new Set(group.appearances.map((appearance) => appearance.pokemonId)).size })).sort((a, b) => b.seasonId - a.seasonId);
  const coachItems = new Map<string, number>();
  coachApps.forEach((appearance) => distinctHeldItemReveals(appearance).forEach((item) => coachItems.set(item.item, (coachItems.get(item.item) ?? 0) + 1)));
  return (
    <section className="poke-card p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-pixel text-sm text-white">Coach visual report</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Observed replay tendencies only—no claims about intent, predictions, or mistakes.</p></div>
        <select value={active.id} onChange={(event) => setActiveCoachId(Number(event.target.value))} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm font-bold sm:w-auto">{rows.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.appearances} matches</option>)}</select>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Coach" value={active.name} />
        <StatCard label="Matches" value={number(active.appearances)} />
        <StatCard label="Win rate" value={`${number(rate(active.wins, active.appearances) * 100, 1)}%`} />
        <StatCard label="Team damage / match" value={formatCovered(coveredRate(active.damage, active.damageAppearances), 1, "%")} detail={`${active.damageAppearances} covered matches`} />
        <StatCard label="Average battle length" value={formatCovered(averageBattleLength, 1, " turns")} detail={`${timelineMatches.length} covered matches`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase text-white">Season-by-season franchise report</h3><div className="mt-3 hidden overflow-x-auto sm:block"><table className="w-full min-w-[560px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Season</th><th>Record</th><th>Pokémon</th><th>Damage/match</th><th>Healing/match</th><th>Setup</th></tr></thead><tbody>{coachSeasonRows.map((row) => <tr key={row.seasonId} className="border-t border-[var(--border)] text-center"><td className="p-2 text-left font-bold text-white">{row.seasonName}</td><td>{row.stats.wins}-{row.stats.appearances-row.stats.wins}</td><td>{row.pokemonUsed}</td><td>{formatCovered(coveredRate(row.stats.damage,row.stats.damageAppearances),1,"%")}</td><td>{formatCovered(coveredRate(row.stats.healing,row.stats.healingAppearances),1,"%")}</td><td>{row.stats.setupAppearances ? row.stats.setupMoves : "—"}</td></tr>)}</tbody></table></div><div className="mt-3 grid gap-2 sm:hidden">{coachSeasonRows.map((row) => <div key={row.seasonId} className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-3"><div className="flex items-center justify-between gap-3"><strong className="text-xs text-white">{row.seasonName}</strong><span className="font-mono text-xs text-emerald-300">{row.stats.wins}-{row.stats.appearances-row.stats.wins}</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-center text-[10px]"><span>{row.pokemonUsed}<small className="block text-[8px] text-[var(--foreground-muted)]">Pokémon</small></span><span>{formatCovered(coveredRate(row.stats.damage,row.stats.damageAppearances),1,"%") }<small className="block text-[8px] text-[var(--foreground-muted)]">Damage/match</small></span><span>{formatCovered(coveredRate(row.stats.healing,row.stats.healingAppearances),1,"%") }<small className="block text-[8px] text-[var(--foreground-muted)]">Healing/match</small></span><span>{row.stats.setupAppearances ? row.stats.setupMoves : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">Setup</small></span></div></div>)}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase text-white">Held-item distribution</h3><div className="mt-3 flex flex-wrap gap-2">{[...coachItems].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([item,count]) => <span key={item} className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-100">{item} · {count}</span>)}</div></div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div><h3 className="mb-3 text-xs font-black uppercase tracking-wide text-white">Pokémon usage frequency</h3><div className="space-y-2">{usage.map((row) => <div key={row.id} className="grid grid-cols-[100px_1fr_36px] items-center gap-2 text-[10px] sm:grid-cols-[150px_1fr_48px] sm:gap-3 sm:text-xs"><span className="truncate font-bold">{row.name}</span><div className="h-3 overflow-hidden rounded-full bg-[var(--background-tertiary)]"><div className="h-full bg-[var(--primary)]" style={{ width: `${(row.appearances / usage[0].appearances) * 100}%` }} /></div><span className="text-right font-mono">{row.appearances}</span></div>)}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase tracking-wide text-white">Damage composition</h3>{active.damageAppearances ? <><div className="mt-4 flex h-5 overflow-hidden rounded-full bg-[var(--background-tertiary)]"><div className="bg-cyan-500" style={{ width: `${directShare}%` }} /><div className="bg-violet-500" style={{ width: `${100 - directShare}%` }} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10px]"><span className="text-cyan-300">{number(active.directDamage)}% direct</span><span className="text-violet-300">{number(active.indirectDamage)}% indirect</span></div></> : <p className="mt-3 text-xs text-[var(--foreground-muted)]">No recorded damage coverage in this scope.</p>}</div>
      </div>
      <div className="mt-6 hidden overflow-x-auto sm:block"><table className="w-full min-w-[760px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Coach</th><th>Matches</th><th>Win rate</th><th>Damage/match</th><th>Healing/match</th><th>Setup</th><th>Favorable events</th><th>Items revealed</th></tr></thead><tbody>{rows.slice(0, 50).map((row) => <tr key={row.id} className="border-t border-[var(--border)] text-center"><td className="p-2 text-left font-bold text-white">{row.name}</td><td>{row.appearances}</td><td>{number(rate(row.wins, row.appearances) * 100, 1)}%</td><td>{formatCovered(coveredRate(row.damage, row.damageAppearances), 1, "%")}</td><td>{formatCovered(coveredRate(row.healing, row.healingAppearances), 1, "%")}</td><td>{row.setupAppearances ? row.setupMoves : "—"}</td><td>{row.eventAppearances ? row.favorableEvents : "—"}</td><td>{row.itemDataAppearances ? row.itemReveals : "—"}</td></tr>)}</tbody></table></div>
      <div className="mt-6 grid gap-2 sm:hidden">{rows.slice(0, 25).map((row) => <button type="button" onClick={() => setActiveCoachId(row.id)} key={row.id} className={`rounded-xl border p-3 text-left ${row.id === active.id ? "border-violet-400/50 bg-violet-500/10" : "border-[var(--border)] bg-[var(--background)]"}`}><div className="flex items-center justify-between gap-3"><strong className="text-sm text-white">{row.name}</strong><span className="font-mono text-emerald-300">{number(rate(row.wins, row.appearances) * 100, 1)}%</span></div><div className="mt-2 flex gap-3 text-[10px] text-[var(--foreground-muted)]"><span>{row.appearances} matches</span><span>{formatCovered(coveredRate(row.damage, row.damageAppearances), 1, "%")} damage/match</span></div></button>)}</div>
    </section>
  );
}

function CompareModule({ rows, compareA, compareB, setCompareA, setCompareB }: { rows: EntityAggregate[]; compareA: number | null; compareB: number | null; setCompareA: (id: number) => void; setCompareB: (id: number) => void }) {
  const a = rows.find((row) => row.id === compareA) ?? rows[0];
  const b = rows.find((row) => row.id === compareB) ?? rows[1];
  if (!a || !b) return <EmptyState />;
  const metrics = [
    { label: "Win rate", get: (row: EntityAggregate) => coveredRate(row.wins * 100, row.appearances), suffix: "%" },
    { label: "Damage / app", get: (row: EntityAggregate) => coveredRate(row.damage, row.damageAppearances), suffix: "%" },
    { label: "Healing / app", get: (row: EntityAggregate) => coveredRate(row.healing, row.healingAppearances), suffix: "%" },
    { label: "Turns / app", get: (row: EntityAggregate) => coveredRate(row.turns, row.turnsAppearances), suffix: "" },
    { label: "Kills / app", get: (row: EntityAggregate) => coveredRate(row.kills, row.appearances), suffix: "" },
    { label: "Setup / app", get: (row: EntityAggregate) => coveredRate(row.setupMoves, row.setupAppearances), suffix: "" },
  ];
  return <section className="poke-card p-5 md:p-6"><div className="mb-6"><h2 className="font-pixel text-sm text-white">Compare</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Side-by-side output under the same qualification and replay filters. Missing replay fields display as unknown.</p></div><div className="grid gap-3 sm:grid-cols-2"><select value={a.id} onChange={(event) => setCompareA(Number(event.target.value))} className="rounded-lg border-2 border-cyan-500/50 bg-[var(--background)] p-3 font-bold">{rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select value={b.id} onChange={(event) => setCompareB(Number(event.target.value))} className="rounded-lg border-2 border-fuchsia-500/50 bg-[var(--background)] p-3 font-bold">{rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div><div className="mt-6 space-y-4">{metrics.map((metric) => { const av = metric.get(a); const bv = metric.get(b); const max = Math.max(av ?? 0, bv ?? 0, 1); return <div key={metric.label}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="font-mono text-cyan-400">{formatCovered(av, 1, metric.suffix)}</span><span className="text-center font-bold text-white">{metric.label}</span><span className="font-mono text-fuchsia-400">{formatCovered(bv, 1, metric.suffix)}</span></div><div className="grid grid-cols-2 gap-1"><div className="flex justify-end rounded-l-full bg-[var(--background-tertiary)]"><div className="h-3 rounded-l-full bg-cyan-500" style={{ width: `${((av ?? 0) / max) * 100}%` }} /></div><div className="rounded-r-full bg-[var(--background-tertiary)]"><div className="h-3 rounded-r-full bg-fuchsia-500" style={{ width: `${((bv ?? 0) / max) * 100}%` }} /></div></div></div>; })}</div></section>;
}

function RollingModule({ pokemon, appearances, rows, onSelect }: { pokemon: EntityAggregate | null; appearances: EnrichedAppearance[]; rows: EntityAggregate[]; onSelect: (id: number) => void }) {
  if (!pokemon) return <EmptyState />;
  const latest = appearances.slice(-5);
  const previous = appearances.slice(-10, -5);
  const calc = (list: EnrichedAppearance[], getter: (appearance: EnrichedAppearance) => number, recorded: (appearance: EnrichedAppearance) => boolean = () => true) => {
    const covered = list.filter(recorded);
    return covered.length ? covered.reduce((sum, appearance) => sum + getter(appearance), 0) / covered.length : null;
  };
  const trendRows = [
    { metric: "Damage / appearance", previous: calc(previous, totalDamage, (a) => a.damageDealt !== null), latest: calc(latest, totalDamage, (a) => a.damageDealt !== null) },
    { metric: "Healing / appearance", previous: calc(previous, (a) => a.hpRestored ?? 0, (a) => a.hpRestored !== null), latest: calc(latest, (a) => a.hpRestored ?? 0, (a) => a.hpRestored !== null) },
    { metric: "Turns active", previous: calc(previous, (a) => a.turnsActive ?? 0, (a) => a.turnsActive !== null), latest: calc(latest, (a) => a.turnsActive ?? 0, (a) => a.turnsActive !== null) },
    { metric: "Kills", previous: calc(previous, (a) => a.kills), latest: calc(latest, (a) => a.kills) },
    { metric: "Setup moves", previous: calc(previous, (a) => a.setupMovesUsed ?? 0, (a) => a.setupMovesUsed !== null), latest: calc(latest, (a) => a.setupMovesUsed ?? 0, (a) => a.setupMovesUsed !== null) },
  ];
  return <section className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Rolling trends</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Previous five appearances compared with the latest five. Each metric uses only appearances where that field was recorded.</p></div><select value={pokemon.id} onChange={(event) => onSelect(Number(event.target.value))} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm font-bold sm:w-auto">{rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>{appearances.length < 10 ? <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Only {appearances.length} qualified appearances are available. Values remain visible, but a full 5-vs-5 window needs 10.</div> : null}<div className="mt-6 h-72 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 sm:h-80 sm:p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendRows} layout="vertical" margin={{ left: 8, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis type="number" stroke="var(--foreground-muted)" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="metric" width={105} stroke="var(--foreground-muted)" tick={{ fontSize: 9 }} /><Tooltip contentStyle={{ background: "var(--background-secondary)", border: "1px solid var(--border)", borderRadius: 8 }} /><Bar dataKey="previous" name="Previous 5" fill="#64748b" radius={[0, 4, 4, 0]} /><Bar dataKey="latest" name="Latest 5" fill="#8b5cf6" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div><div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]"><table className="w-full text-[10px] sm:text-xs"><thead className="bg-[var(--background)] text-[8px] uppercase text-[var(--foreground-muted)] sm:text-[9px]"><tr><th className="p-3 text-left">Metric</th><th>Previous</th><th>Latest</th><th>Change</th></tr></thead><tbody>{trendRows.map((row) => { const change = row.latest !== null && row.previous !== null ? row.latest - row.previous : null; return <tr key={row.metric} className="border-t border-[var(--border)] text-center"><td className="p-3 text-left font-bold text-white">{row.metric}</td><td className="font-mono">{formatCovered(row.previous, 1)}</td><td className="font-mono">{formatCovered(row.latest, 1)}</td><td className={`font-mono font-black ${change !== null && change > 0 ? "text-emerald-400" : change !== null && change < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>{change === null ? "—" : `${change > 0 ? "+" : ""}${number(change, 1)}`}</td></tr>; })}</tbody></table></div></section>;
}

function LeaderboardModule({ rows, entity, setEntity, perAppearance, setPerAppearance }: { rows: EntityAggregate[]; entity: "pokemon" | "coach"; setEntity: (value: "pokemon" | "coach") => void; perAppearance: boolean; setPerAppearance: (value: boolean) => void }) {
  const metricValue = (amount: number, coverage: number) => coverage > 0 ? (perAppearance ? amount / coverage : amount) : null;
  const digits = perAppearance ? 2 : 0;
  const sorted = [...rows].sort((a, b) => Number(b.damageAppearances > 0) - Number(a.damageAppearances > 0) || (metricValue(b.damage, b.damageAppearances) ?? 0) - (metricValue(a.damage, a.damageAppearances) ?? 0));
  const exportRows = [
    [entity === "pokemon" ? "Pokemon" : "Coach", entity === "pokemon" ? "Appearances" : "Matches", "Wins", "Kills", "Deaths", "Damage", "Healing", "Turns Active", "Setup Moves", "Favorable Events"],
    ...sorted.map((row) => [row.name, row.appearances, row.wins, metricValue(row.kills, row.appearances) ?? "", metricValue(row.deaths, row.appearances) ?? "", metricValue(row.damage, row.damageAppearances) ?? "", metricValue(row.healing, row.healingAppearances) ?? "", metricValue(row.turns, row.turnsAppearances) ?? "", metricValue(row.setupMoves, row.setupAppearances) ?? "", metricValue(row.favorableEvents, row.eventAppearances) ?? ""]),
  ];
  return (
    <section className="poke-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Custom leaderboard</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Evidence-backed columns use metric-specific coverage. A dash means the field was not recorded.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setEntity(entity === "pokemon" ? "coach" : "pokemon")} className="btn-retro-secondary px-3 py-2 text-[9px]">{entity === "pokemon" ? "Pokémon" : "Coaches"}</button><button onClick={() => setPerAppearance(!perAppearance)} className="btn-retro-secondary px-3 py-2 text-[9px]">{perAppearance ? "Per appearance" : "Totals"}</button><button onClick={() => downloadCsv("pbo-experimental-stats.csv", exportRows)} className="btn-retro-primary inline-flex items-center gap-1 px-3 py-2 text-[9px]"><Download className="h-3 w-3" />CSV</button></div></div>
      <div className="mt-5 hidden overflow-x-auto sm:block"><table className="w-full min-w-[900px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Rank</th><th className="p-2 text-left">{entity === "pokemon" ? "Pokémon" : "Coach"}</th><th>{entity === "pokemon" ? "Apps" : "Matches"}</th><th>W</th><th>K</th><th>D</th><th>Damage</th><th>Healing</th><th>Turns</th><th>Setup</th><th>Favorable</th></tr></thead><tbody>{sorted.slice(0, 150).map((row, index) => <tr key={row.id} className="border-t border-[var(--border)] text-center"><td className="p-2 text-left font-mono text-[var(--foreground-muted)]">{index + 1}</td><td className="p-2 text-left font-bold text-white">{row.name}</td><td>{row.appearances}</td><td>{row.wins}</td><td>{formatCovered(metricValue(row.kills, row.appearances), digits)}</td><td>{formatCovered(metricValue(row.deaths, row.appearances), digits)}</td><td>{formatCovered(metricValue(row.damage, row.damageAppearances), perAppearance ? 1 : 0, "%")}</td><td>{formatCovered(metricValue(row.healing, row.healingAppearances), perAppearance ? 1 : 0, "%")}</td><td>{formatCovered(metricValue(row.turns, row.turnsAppearances), perAppearance ? 1 : 0)}</td><td>{formatCovered(metricValue(row.setupMoves, row.setupAppearances), digits)}</td><td>{formatCovered(metricValue(row.favorableEvents, row.eventAppearances), digits)}</td></tr>)}</tbody></table></div>
      <div className="mt-5 grid gap-3 sm:hidden">{sorted.slice(0, 50).map((row, index) => <div key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--background-tertiary)] font-mono text-xs font-black">{index + 1}</span><div className="min-w-0 flex-1"><div className="truncate font-bold text-white">{row.name}</div><div className="text-[9px] text-[var(--foreground-muted)]">{row.appearances} {entity === "pokemon" ? "appearances" : "matches"} · {row.wins} wins</div></div><span className="font-mono font-black text-violet-300">{formatCovered(metricValue(row.damage, row.damageAppearances), perAppearance ? 1 : 0, "%")}</span></div><div className="mt-3 grid grid-cols-4 gap-2 text-center"><div><div className="font-mono text-xs text-white">{formatCovered(metricValue(row.kills, row.appearances), digits)}</div><div className="text-[8px] uppercase text-[var(--foreground-muted)]">Kills</div></div><div><div className="font-mono text-xs text-white">{formatCovered(metricValue(row.deaths, row.appearances), digits)}</div><div className="text-[8px] uppercase text-[var(--foreground-muted)]">Deaths</div></div><div><div className="font-mono text-xs text-white">{formatCovered(metricValue(row.healing, row.healingAppearances), perAppearance ? 1 : 0, "%")}</div><div className="text-[8px] uppercase text-[var(--foreground-muted)]">Healing</div></div><div><div className="font-mono text-xs text-white">{formatCovered(metricValue(row.setupMoves, row.setupAppearances), digits)}</div><div className="text-[8px] uppercase text-[var(--foreground-muted)]">Setup</div></div></div></div>)}</div>
    </section>
  );
}

function ReplaySearchModule({ matches }: { matches: ExperimentalMatch[] }) {
  const [minimumDamage, setMinimumDamage] = useState(0);
  const [minimumKills, setMinimumKills] = useState(0);
  const [survivedOnly, setSurvivedOnly] = useState(false);
  const [finderSearch, setFinderSearch] = useState("");
  const results = matches.flatMap((match) => match.pokemon.flatMap((appearance) => {
    const owner = appearance.seasonCoachId === match.coach1.seasonCoachId ? match.coach1 : appearance.seasonCoachId === match.coach2.seasonCoachId ? match.coach2 : null;
    if (!owner) return [];
    const opponent = owner.seasonCoachId === match.coach1.seasonCoachId ? match.coach2 : match.coach1;
    const haystack = `${appearance.pokemonName} ${owner.coachName} ${owner.teamName} ${opponent.teamName}`.toLowerCase();
    if (finderSearch && !haystack.includes(finderSearch.toLowerCase())) return [];
    if (minimumDamage > 0 && (appearance.damageDealt === null || totalDamage(appearance) < minimumDamage)) return [];
    if (appearance.kills < minimumKills) return [];
    if (survivedOnly && appearance.deaths !== 0) return [];
    return [{ match, appearance, owner, opponent }];
  }));
  return <section className="poke-card p-5 md:p-6"><h2 className="font-pixel text-sm text-white">Replay Finder</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Combine these appearance conditions with the shared season, stage, Pokémon, move, item, coach, and result filters above.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="space-y-1"><span className="text-[9px] font-black uppercase text-[var(--foreground-muted)]">Search</span><input value={finderSearch} onChange={(event) => setFinderSearch(event.target.value)} placeholder="Pokémon, coach, team…" className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[9px] font-black uppercase text-[var(--foreground-muted)]">Minimum damage</span><input type="number" min={0} value={minimumDamage} onChange={(event) => setMinimumDamage(Math.max(0, Number(event.target.value) || 0))} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[9px] font-black uppercase text-[var(--foreground-muted)]">Minimum kills</span><input type="number" min={0} value={minimumKills} onChange={(event) => setMinimumKills(Math.max(0, Number(event.target.value) || 0))} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs" /></label><label className="flex items-end gap-2 pb-2 text-xs font-bold"><input type="checkbox" checked={survivedOnly} onChange={(event) => setSurvivedOnly(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />Survived the battle</label></div><div className="mt-4 text-[10px] font-bold text-[var(--foreground-muted)]">{results.length} matching appearances</div><div className="mt-3 space-y-2">{results.slice(0, 150).map(({ match, appearance, owner, opponent }) => <div key={`${match.id}-${appearance.seasonCoachId}-${appearance.pokemonId}`} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><Link href={matchHref(match)} className="font-bold text-white hover:text-[var(--primary)]">{appearance.pokemonName} · {owner.teamName} vs {opponent.teamName}</Link><div className="mt-1 text-[10px] text-[var(--foreground-muted)]">{match.seasonName} · {match.divisionName} · Week {match.week} · {match.week > 100 ? "Playoffs" : "Regular season"}</div></div><div className="flex gap-3 text-xs"><span>{appearance.kills}-{appearance.deaths} K–D</span><span>{appearance.damageDealt !== null ? `${number(totalDamage(appearance))}% damage` : "Damage unknown"}</span><span>{appearance.hpRestored !== null ? `${number(appearance.hpRestored)}% healed` : "Healing unknown"}</span></div><Link href={match.isDemo ? "/experimental-stats?demo=1" : match.replayUrl} target={match.isDemo ? undefined : "_blank"} className="btn-retro-secondary px-3 py-2 text-center text-[9px]">{match.isDemo ? "Demo" : "Replay"}</Link></div>)}{!results.length ? <EmptyState /> : null}</div></section>;
}

function MatchPokemonBoxScore({ match }: { match: ExperimentalMatch }) {
  const teams = [match.coach1, match.coach2];
  return <div className="poke-card p-5 md:p-6"><h3 className="font-pixel text-xs text-white">Pokémon box score</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Compact saved replay summary; dashes indicate fields that were not recorded.</p><div className="mt-5 grid gap-5 xl:grid-cols-2">{teams.map((team) => <div key={team.seasonCoachId} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]"><div className="border-b border-[var(--border)] p-3"><strong className="text-sm text-white">{team.teamName}</strong><span className={`ml-2 text-[10px] font-black ${match.winnerId === team.seasonCoachId ? "text-emerald-400" : "text-red-400"}`}>{match.winnerId === team.seasonCoachId ? "WIN" : "LOSS"}</span></div><div className="divide-y divide-[var(--border)]">{match.pokemon.filter((appearance) => appearance.seasonCoachId === team.seasonCoachId).map((appearance) => <div key={appearance.pokemonId} className="p-3"><div className="flex flex-wrap items-center gap-3">{appearance.spriteUrl ? <Image src={appearance.spriteUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" /> : null}<div className="min-w-0 flex-1"><div className="font-bold text-white">{appearance.pokemonName}</div><div className="mt-1 truncate text-[9px] text-[var(--foreground-muted)]">{appearance.moveDataRecorded ? Object.keys(appearance.movesUsed).join(", ") || "No moves recorded" : "Moves unknown"}</div></div><div className="grid w-full grid-cols-4 gap-2 text-center text-[10px] sm:w-auto sm:gap-3"><span>{appearance.kills}-{appearance.deaths}<small className="block text-[8px] text-[var(--foreground-muted)]">K–D</small></span><span>{appearance.damageDealt !== null ? `${number(totalDamage(appearance))}%` : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">DMG</small></span><span>{appearance.hpRestored !== null ? `${number(appearance.hpRestored)}%` : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">HEAL</small></span><span>{appearance.turnsActive ?? "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">TURNS</small></span></div></div><div className="mt-2 break-words text-[9px] text-amber-200">{distinctHeldItemReveals(appearance).map((item) => item.item).join(", ") || (appearance.itemDataRecorded ? "Item unrevealed" : "Item data unavailable")}</div></div>)}</div></div>)}</div></div>;
}

function BattleVisualizer({ matches, selectedId, onSelect }: { matches: ExperimentalMatch[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const eligible = matches.filter((match) => match.turnSnapshots.length > 0);
  const match = eligible.find((candidate) => candidate.id === selectedId) ?? eligible[0];
  if (!match) return <section className="poke-card p-6"><h2 className="font-pixel text-sm text-white">Battle visualizer</h2><p className="mt-4 text-sm text-[var(--foreground-muted)]">No saved HP timeline matches the active filters.</p></section>;
  const heldItemRevealTurns = match.pokemon.flatMap((appearance) => distinctHeldItemReveals(appearance).map((item) => item.turn));
  const itemBuckets = [{ label: "1–5", min: 1, max: 5 }, { label: "6–10", min: 6, max: 10 }, { label: "11–15", min: 11, max: 15 }, { label: "16+", min: 16, max: 999 }].map((bucket) => ({ turn: bucket.label, reveals: heldItemRevealTurns.filter((turn) => turn >= bucket.min && turn <= bucket.max).length }));
  const chartEvents = match.keyEvents.filter((event): event is typeof event & { player: "p1" | "p2" } => (event.type === "faint" || event.type === "win") && Boolean(event.player)).map((event) => ({ ...event, type: event.type as "faint" | "win" }));
  const orientationKnown = match.p1IsCoach1 !== null;
  return <section className="space-y-6"><div className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Battle visualizer</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Team HP, faint order, and item timing from saved replay evidence.</p></div><select value={match.id} onChange={(event) => onSelect(Number(event.target.value))} className="max-w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs font-bold">{eligible.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.coach1.teamName} vs {candidate.coach2.teamName} · W{candidate.week}</option>)}</select></div>{!orientationKnown ? <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">The saved replay lacks a winner-to-player mapping event, so the HP lines are labeled by replay player rather than attributed to teams.</div> : null}<div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"><HpChart turnSnapshots={match.turnSnapshots} keyEvents={chartEvents} team1Name={orientationKnown ? match.coach1.teamName : "Replay Player 1"} team2Name={orientationKnown ? match.coach2.teamName : "Replay Player 2"} team1Color="#22d3ee" team2Color="#e879f9" p1IsCoach1={match.p1IsCoach1 ?? true} /></div><div className="mt-4 flex flex-wrap gap-2">{match.keyEvents.filter((event) => event.type === "faint").sort((a, b) => a.turn - b.turn).map((event, index) => <span key={`${event.turn}-${index}`} className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] text-red-200">T{event.turn} · {event.pokemon ?? "Unknown"} fainted</span>)}</div></div><MatchPokemonBoxScore match={match} /><div className="poke-card p-5 md:p-6"><h3 className="font-pixel text-xs text-white">Item reveal timeline</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">First explicit saved held-item reveals; transferred Trick and Switcheroo items are excluded and unrevealed items remain unknown.</p><div className="mt-4 h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={itemBuckets}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis dataKey="turn" stroke="var(--foreground-muted)" /><YAxis allowDecimals={false} stroke="var(--foreground-muted)" /><Tooltip contentStyle={{ background: "var(--background-secondary)", border: "1px solid var(--border)" }} /><Bar dataKey="reveals" fill="#a78bfa" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div></section>;
}

function RareEventsModule({ matches, appearances }: { matches: ExperimentalMatch[]; appearances: EnrichedAppearance[] }) {
  const replayLength = (match: ExperimentalMatch) => match.turnSnapshots.reduce((maximum, snapshot) => Math.max(maximum, snapshot.turn), 0);
  const longest = [...matches].sort((a, b) => replayLength(b) - replayLength(a))[0];
  const mostMoves = [...matches].map((match) => ({ match, count: new Set(match.pokemon.flatMap((appearance) => Object.keys(appearance.movesUsed))).size })).sort((a, b) => b.count - a.count)[0];
  const biggestDamage = appearances.filter((appearance) => appearance.damageDealt !== null).sort((a, b) => totalDamage(b) - totalDamage(a))[0];
  const biggestHeal = appearances.filter((appearance) => appearance.hpRestored !== null).sort((a, b) => (b.hpRestored ?? 0) - (a.hpRestored ?? 0))[0];
  const latestItem = appearances.flatMap((appearance) => appearance.revealedItems.map((item) => ({ ...item, appearance }))).sort((a, b) => b.turn - a.turn)[0];
  const firstFaints = matches.flatMap((match) => { const event = match.keyEvents.filter((candidate) => candidate.type === "faint").sort((a, b) => a.turn - b.turn)[0]; return event ? [{ match, event }] : []; }).sort((a, b) => b.event.turn - a.event.turn);
  const records = [
    longest && { label: "Longest replay", value: `${replayLength(longest)} turns`, detail: `${longest.coach1.teamName} vs ${longest.coach2.teamName}`, matchId: longest.id },
    mostMoves && { label: "Most distinct moves", value: `${mostMoves.count} moves`, detail: `${mostMoves.match.coach1.teamName} vs ${mostMoves.match.coach2.teamName}`, matchId: mostMoves.match.id },
    biggestDamage && { label: "Largest damage appearance", value: `${totalDamage(biggestDamage)}%`, detail: `${biggestDamage.pokemonName} · ${biggestDamage.teamName}`, matchId: biggestDamage.match.id },
    biggestHeal && { label: "Largest healing appearance", value: `${biggestHeal.hpRestored ?? 0}%`, detail: `${biggestHeal.pokemonName} · ${biggestHeal.teamName}`, matchId: biggestHeal.match.id },
    latestItem && { label: "Latest item reveal", value: `Turn ${latestItem.turn}`, detail: `${latestItem.item} · ${latestItem.appearance.pokemonName}`, matchId: latestItem.appearance.match.id },
    firstFaints[0] && { label: "Longest wait for first faint", value: `Turn ${firstFaints[0].event.turn}`, detail: `${firstFaints[0].match.coach1.teamName} vs ${firstFaints[0].match.coach2.teamName}`, matchId: firstFaints[0].match.id },
  ].filter((record): record is NonNullable<typeof record> => Boolean(record));
  const demoMode = matches.some((match) => match.isDemo);
  return <section className="poke-card p-5 md:p-6"><h2 className="font-pixel text-sm text-white">Rare Event Explorer</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Unusual occurrences supported by currently saved replay summaries. Real results link to match evidence.</p><div className="mt-6 grid gap-3 md:grid-cols-2">{records.map((record) => <Link key={record.label} href={demoMode ? "/experimental-stats?demo=1" : `/matches/${record.matchId}`} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 transition-colors hover:border-violet-400/50"><div className="text-[9px] font-black uppercase tracking-wider text-violet-300">{record.label}</div><div className="mt-2 font-mono text-xl font-black text-white">{record.value}</div><div className="mt-1 text-xs text-[var(--foreground-muted)]">{record.detail}</div></Link>)}</div></section>;
}

function GlossaryModule({ search, setSearch }: { search: string; setSearch: (value: string) => void }) {
  const query = search.trim().toLowerCase();
  const groups = experimentalMetricGroups.map((group) => ({ ...group, metrics: group.metrics.filter((metric) => !query || metric.name.toLowerCase().includes(query) || metric.definition.toLowerCase().includes(query)) })).filter((group) => group.metrics.length);
  const counts = experimentalMetricGroups.flatMap((group) => group.metrics).reduce((result, metric) => ({ ...result, [metric.availability]: result[metric.availability] + 1 }), { available: 0, partial: 0, "event-storage": 0 });
  const badge = (availability: "available" | "partial" | "event-storage") => availability === "available" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : availability === "partial" ? "bg-amber-500/10 text-amber-200 border-amber-500/30" : "bg-slate-500/10 text-slate-300 border-slate-500/30";
  return <section className="space-y-6"><div className="poke-card p-5 md:p-6"><h2 className="font-pixel text-sm text-white">Metric glossary and coverage</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">“Available” is calculated from saved replay evidence. “Partial” has a narrower saved proxy. “Event storage required” will not be shown as an official statistic until normalized protocol events and raw source lines are stored.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><StatCard label="Available" value={String(counts.available)} /><StatCard label="Partial" value={String(counts.partial)} /><StatCard label="Event storage required" value={String(counts["event-storage"])} /></div><div className="relative mt-5"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--foreground-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search every proposed metric…" className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] py-2 pl-10 pr-3 text-sm outline-none focus:border-[var(--primary)]" /></div></div>{groups.map((group) => <div key={group.label} className="poke-card p-5"><h3 className="font-pixel text-xs text-white">{group.label}</h3><div className="mt-4 grid gap-2">{group.metrics.map((metric) => <div key={metric.name} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 md:grid-cols-[minmax(190px,0.8fr)_auto_minmax(260px,1.2fr)] md:items-center"><span className="text-xs font-bold text-white">{metric.name}</span><span className={`w-fit rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wide ${badge(metric.availability)}`}>{metric.availability === "event-storage" ? "Event storage required" : metric.availability}</span><span className="text-[10px] leading-4 text-[var(--foreground-muted)]">{metric.definition}</span></div>)}</div></div>)}<div className="poke-card p-5"><h3 className="font-pixel text-xs text-white">Niche visuals</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{experimentalVisualDefinitions.map((visual) => <div key={visual.name} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-white">{visual.name}</strong><span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${badge(visual.availability)}`}>{visual.availability}</span></div><p className="mt-2 text-xs leading-5 text-[var(--foreground-muted)]">{visual.description}</p></div>)}</div></div></section>;
}

function EmptyState() {
  return <div className="poke-card p-10 text-center"><FlaskConical className="mx-auto h-8 w-8 text-[var(--foreground-subtle)]" /><p className="mt-3 text-sm font-bold text-white">No qualified replay data</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">Broaden the shared filters or lower the minimum appearances.</p></div>;
}
