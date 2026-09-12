"use client";

import Link from "next/link";
import Image from "next/image";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Bar, BarChart, CartesianGrid, ResponsiveContainer as RechartsResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HpChart } from "@/components/hp-chart";
import { experimentalMetricGroups, experimentalVisualDefinitions } from "@/lib/experimental-stats";
import { getDistinctHeldItemNames, isTransferredItemReveal } from "@/lib/revealed-items";
import { isAssumedItemReveal } from "@/lib/mega-item-inference";
import { countFavorableEvents, hasFavorableEventData, type FavorableEvent } from "@/lib/favorable-events";
import { ExperimentalInsights } from "./experimental-insights";
import { SignatureStatsReport } from "./experimental-signature-stats";
import { TeamStatsReport, TopPlaysReport } from "./experimental-team-reports";
import { ExperimentalVisualsReport } from "./experimental-visuals";

type StableResponsiveContainerProps = ComponentProps<typeof RechartsResponsiveContainer>;
function ResponsiveContainer({ initialDimension = { width: 1, height: 1 }, ...props }: StableResponsiveContainerProps) {
  return <RechartsResponsiveContainer {...props} initialDimension={initialDimension} />;
}

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
  favorableConfusions: number | null;
  favorableConfusionSelfHits: number | null;
  favorableEvents: FavorableEvent[] | null;
  hpRestored: number | null;
  movesUsed: Record<string, number>;
  moveDataRecorded: boolean;
  revealedItems: Array<{ item: string; turn: number; source: string }>;
  itemDataRecorded: boolean;
  itemDataInferred?: boolean;
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
  needsReview?: boolean;
  reviewNotes?: string | null;
  p1IsCoach1: boolean | null;
  totalTurns?: number | null;
  turnSnapshots: Array<{ turn: number; p1TotalHp: number; p2TotalHp: number }>;
  keyEvents: Array<{ turn: number; type: string; player?: "p1" | "p2"; pokemon?: string; cause?: string; killer?: string; move?: string }>;
  battleEvents: ExperimentalBattleEvent[];
  coach1: { seasonCoachId: number; coachId: number; coachName: string; teamName: string; isActive: boolean; replacedById: number | null };
  coach2: { seasonCoachId: number; coachId: number; coachName: string; teamName: string; isActive: boolean; replacedById: number | null };
  pokemon: ExperimentalAppearance[];
}

export interface ExperimentalBattleEvent {
  turn: number;
  sequence: number;
  eventType: string;
  count?: number | null;
  player: "p1" | "p2" | null;
  actorNickname: string | null;
  targetPlayer: "p1" | "p2" | null;
  targetNickname: string | null;
  pokemonName: string | null;
  moveName: string | null;
  itemName: string | null;
  abilityName: string | null;
  statusName: string | null;
  fieldName: string | null;
  value: number | null;
  source: string | null;
  rawLine: string;
  metadata: Record<string, unknown> | null;
}

export interface ExperimentalStatsDataset {
  isDemo?: boolean;
  currentSeasonId: number | null;
  selectedMatchId?: number | null;
  highestAvailableWeek: number;
  highestAvailableWeekBySeason: Record<number, number>;
  seasons: Array<{ id: number; name: string; seasonNumber: number }>;
  divisions: Array<{ id: number; seasonId: number; name: string; displayOrder: number }>;
  seasonTeams?: Array<{ seasonCoachId: number; coachId: number; coachName: string; teamName: string; seasonId: number; seasonName: string; divisionId: number; divisionName: string; isActive: boolean; replacedById: number | null }>;
  rosterEligibility?: Array<{ seasonCoachId: number; seasonId: number; pokemonId: number; startWeek: number; endWeek: number | null }>;
  matches: ExperimentalMatch[];
}

export type ExperimentalClientModule = "pokemon" | "coaches" | "compare" | "insights" | "rolling" | "leaderboard" | "replays" | "visualizer" | "rare" | "signature-stats" | "team-stats" | "top-plays" | "visuals" | "glossary";
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

export interface EnrichedAppearance extends ExperimentalAppearance {
  match: ExperimentalMatch;
  coachId: number;
  coachName: string;
  teamName: string;
  won: boolean;
}

export interface EntityAggregate {
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
  { id: "insights", label: "Insights", icon: BarChart3 },
  { id: "rolling", label: "Rolling Trends", icon: LineChartIcon },
  { id: "leaderboard", label: "Leaderboards", icon: ListFilter },
  { id: "replays", label: "Replay Search", icon: Search },
  { id: "visualizer", label: "Battle Visualizer", icon: BarChart3 },
  { id: "rare", label: "Rare Events", icon: FlaskConical },
  { id: "signature-stats", label: "Signature Stats", icon: Sparkles },
  { id: "team-stats", label: "Team Stats", icon: BarChart3 },
  { id: "top-plays", label: "Top Plays", icon: Sparkles },
  { id: "visuals", label: "Visual Lab", icon: BarChart3 },
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
const hasDamageData = (appearance: ExperimentalAppearance) => appearance.damageDealt !== null || appearance.damageDealtIndirect !== null;
const matchHref = (match: ExperimentalMatch) => match.isDemo ? "/experimental-stats?demo=1" : `/matches/${match.id}`;
const totalDamageTaken = (appearance: ExperimentalAppearance) => (appearance.damageTaken ?? 0) + (appearance.damageTakenIndirect ?? 0);
const sumFavorable = (appearance: ExperimentalAppearance) => countFavorableEvents(appearance);
const hasFavorableData = (appearance: ExperimentalAppearance) => hasFavorableEventData(appearance);
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
type HeldItemCategory = "Damage boosting" | "Recovery / consumable" | "Choice items" | "Mega Stones" | "Utility / other" | "Unknown / unrevealed";
const HELD_ITEM_CATEGORY_ORDER: HeldItemCategory[] = ["Damage boosting", "Recovery / consumable", "Choice items", "Mega Stones", "Utility / other", "Unknown / unrevealed"];
const HELD_ITEM_CATEGORY_STYLES: Record<HeldItemCategory, string> = {
  "Damage boosting": "border-red-400/25 bg-red-500/10 text-red-200",
  "Recovery / consumable": "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
  "Choice items": "border-cyan-400/25 bg-cyan-500/10 text-cyan-200",
  "Mega Stones": "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-200",
  "Utility / other": "border-amber-400/25 bg-amber-500/10 text-amber-200",
  "Unknown / unrevealed": "border-slate-400/25 bg-slate-500/10 text-slate-200",
};
const classifyHeldItem = (item: string): HeldItemCategory => {
  const normalized = item.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (/^choice(?:band|scarf|specs)$/.test(normalized)) return "Choice items";
  // Mega stones use the stable *-ite naming family. Eviolite is the one
  // common held item with the same suffix that is not a Mega Stone.
  if (normalized !== "eviolite" && /ite(?:x|y)?$/.test(normalized)) return "Mega Stones";
  if (normalized.includes("berry") || ["leftovers", "blacksludge", "shellbell", "bigroot", "lifeorb"].includes(normalized)) return normalized === "lifeorb" ? "Damage boosting" : "Recovery / consumable";
  if (["gem", "plate", "lifeorb", "expertbelt", "muscleband", "metronome", "silkscarf", "fairyfeather", "charcoal", "mysticwater", "magnet", "miracleseed", "nevermeltice", "blackbelt", "poisonbarb", "softsand", "hardstone", "spelltag", "dragonfang", "blackglasses", "wiseglasses", "sharpbeak", "twistedspoon", "metalcoat", "souldew", "adamantorb", "lustrousorb", "griseousorb"].some((token) => normalized.includes(token))) return "Damage boosting";
  return "Utility / other";
};
const searchableMatchText = (match: ExperimentalMatch) => [
  match.coach1.coachName,
  match.coach1.teamName,
  match.coach2.coachName,
  match.coach2.teamName,
  match.seasonName,
  match.divisionName,
  `week ${match.week}`,
  match.replayUrl,
  match.reviewNotes ?? "",
].join(" ").toLowerCase();
const searchableAppearanceText = (appearance: EnrichedAppearance) => [
  searchableMatchText(appearance.match),
  appearance.pokemonName,
  appearance.coachName,
  appearance.teamName,
  ...Object.keys(appearance.movesUsed),
  ...distinctHeldItemReveals(appearance).map((item) => item.item),
].join(" ").toLowerCase();
const searchableFullMatchText = (match: ExperimentalMatch) => [searchableMatchText(match), ...match.pokemon.flatMap((appearance) => [appearance.pokemonName, ...Object.keys(appearance.movesUsed), ...distinctHeldItemReveals(appearance).map((item) => item.item)])].join(" ").toLowerCase();

function aggregateEntities(appearances: EnrichedAppearance[], entity: "pokemon" | "coach"): EntityAggregate[] {
  const rows = new Map<number, EntityAggregate & { moves: Map<string, number>; seenMatches: Set<number>; survivalMatches: Set<number>; failedSurvivalMatches: Set<number>; damageMatches: Set<number>; healingMatches: Set<number>; turnMatches: Set<number>; setupMatches: Set<number>; eventMatches: Set<number>; moveMatches: Set<number>; itemMatches: Set<number> }>();
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
      survivalMatches: new Set<number>(),
      failedSurvivalMatches: new Set<number>(),
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
    if (hasDamageData(appearance) && (entity === "pokemon" || !existing.damageMatches.has(appearance.match.id))) {
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
    if (entity === "pokemon" && appearance.deaths === 0) existing.survivalCount += 1;
    if (entity === "coach" && appearance.deaths === 0 && !existing.survivalMatches.has(appearance.match.id) && !existing.failedSurvivalMatches.has(appearance.match.id)) {
      existing.survivalCount += 1;
      existing.survivalMatches.add(appearance.match.id);
    }
    if (entity === "coach" && appearance.deaths > 0 && !existing.failedSurvivalMatches.has(appearance.match.id)) {
      if (existing.survivalMatches.delete(appearance.match.id)) existing.survivalCount -= 1;
      existing.failedSurvivalMatches.add(appearance.match.id);
    }
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
    <div className="group relative overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-950/95 to-slate-900/70 p-4 text-center shadow-[0_12px_35px_rgba(0,0,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-400/45">
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
  const searchParams = useSearchParams();
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
  const [filters, setFilters] = useState<Filters>(() => {
    if (!initialFilters) return defaultFilters;
    const weekStart = Math.min(initialHighestWeek, Math.max(1, initialFilters.weekStart));
    const weekEnd = Math.min(initialHighestWeek, Math.max(weekStart, initialFilters.weekEnd >= 999 ? initialHighestWeek : initialFilters.weekEnd));
    return { ...initialFilters, weekStart, weekEnd };
  });
  const deferredFilters = useDeferredValue(filters);
  const highestAvailableWeek = highestWeekForSeason(filters.seasonId);
  const normalizeFilterWeeks = (next: Filters): Filters => {
    const maximum = highestWeekForSeason(next.seasonId);
    const weekStart = Math.min(maximum, Math.max(1, next.weekStart));
    const weekEnd = Math.min(maximum, Math.max(weekStart, next.weekEnd));
    return { ...next, weekStart, weekEnd };
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState(() => searchParams.get("q") ?? "");
  const deferredGlobalSearch = useDeferredValue(globalSearch);
  const globalSearchTerms = useMemo(() => deferredGlobalSearch.trim().toLowerCase().split(/\s+/).filter(Boolean), [deferredGlobalSearch]);
  const searchSyncTimerRef = useRef<number | null>(null);
  const pendingSearchRef = useRef<string | null>(null);
  const filtersAreUpdating = deferredFilters !== filters || deferredGlobalSearch !== globalSearch;

  useEffect(() => {
    const querySearch = searchParams.get("q") ?? "";
    if (pendingSearchRef.current !== null) {
      if (querySearch === pendingSearchRef.current) pendingSearchRef.current = null;
      else return;
    }
    setGlobalSearch(querySearch);
  }, [searchParams]);
  useEffect(() => () => {
    if (searchSyncTimerRef.current !== null) window.clearTimeout(searchSyncTimerRef.current);
  }, []);
  const [profilePokemonId, setProfilePokemonId] = useState<number | null>(null);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [visualMatchId, setVisualMatchId] = useState<number | null>(dataset.selectedMatchId ?? null);
  const [leaderboardEntity, setLeaderboardEntity] = useState<"pokemon" | "coach">("pokemon");
  const [leaderboardRate, setLeaderboardRate] = useState(false);
  const [glossarySearch, setGlossarySearch] = useState("");
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    setModule(initialModule);
  }, [initialModule]);

  useEffect(() => {
    if (initialModule === "visualizer") setVisualMatchId(dataset.selectedMatchId ?? null);
  }, [dataset.selectedMatchId, initialModule]);

  useEffect(() => {
    if (initialFilters) {
      const maximum = initialFilters.seasonId === "all"
        ? dataset.highestAvailableWeek
        : dataset.highestAvailableWeekBySeason[initialFilters.seasonId] ?? dataset.highestAvailableWeek;
      const weekStart = Math.min(maximum, Math.max(1, initialFilters.weekStart));
      const weekEnd = Math.min(maximum, Math.max(weekStart, initialFilters.weekEnd >= 999 ? maximum : initialFilters.weekEnd));
      setFilters({ ...initialFilters, weekStart, weekEnd });
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
    if (globalSearchTerms.length && !globalSearchTerms.every((term) => searchableAppearanceText(appearance).includes(term))) return false;
    if (deferredFilters.seasonId !== "all" && match.seasonId !== deferredFilters.seasonId) return false;
    if (deferredFilters.divisionId !== "all" && match.divisionId !== deferredFilters.divisionId) return false;
    if (match.week < deferredFilters.weekStart || match.week > deferredFilters.weekEnd) return false;
    if (deferredFilters.stage === "regular" && match.week > 100) return false;
    if (deferredFilters.stage === "playoffs" && match.week <= 100) return false;
    if (!deferredFilters.includeForfeits && match.isForfeit) return false;
    if (deferredFilters.coachId !== "all" && appearance.coachId !== deferredFilters.coachId) return false;
    if (deferredFilters.pokemonId !== "all" && appearance.pokemonId !== deferredFilters.pokemonId) return false;
    if (deferredFilters.move !== "all" && !appearance.movesUsed[deferredFilters.move]) return false;
    if (deferredFilters.item !== "all" && !distinctHeldItemReveals(appearance).some((item) => item.item === deferredFilters.item)) return false;
    if (deferredFilters.result === "wins" && !appearance.won) return false;
    if (deferredFilters.result === "losses" && appearance.won) return false;
    return true;
  }), [enrichedAppearances, deferredFilters, globalSearchTerms]);

  const filteredMatchIds = useMemo(() => new Set(filteredAppearances.map((appearance) => appearance.match.id)), [filteredAppearances]);
  const filteredMatches = useMemo(() => dataset.matches.filter((match) => filteredMatchIds.has(match.id)), [dataset.matches, filteredMatchIds]);
  const coachReportMatches = useMemo(() => module !== "coaches" ? filteredMatches : dataset.matches.filter((match) => {
    if (globalSearchTerms.length && !globalSearchTerms.every((term) => searchableFullMatchText(match).includes(term))) return false;
    if (deferredFilters.seasonId !== "all" && match.seasonId !== deferredFilters.seasonId) return false;
    if (deferredFilters.divisionId !== "all" && match.divisionId !== deferredFilters.divisionId) return false;
    if (match.week < deferredFilters.weekStart || match.week > deferredFilters.weekEnd) return false;
    if (deferredFilters.stage === "regular" && match.week > 100) return false;
    if (deferredFilters.stage === "playoffs" && match.week <= 100) return false;
    if (!deferredFilters.includeForfeits && match.isForfeit) return false;
    if (deferredFilters.coachId !== "all" && match.coach1.coachId !== deferredFilters.coachId && match.coach2.coachId !== deferredFilters.coachId) return false;
    if (deferredFilters.pokemonId !== "all" || deferredFilters.move !== "all" || deferredFilters.item !== "all") return filteredMatchIds.has(match.id);
    if (deferredFilters.result !== "all" && deferredFilters.coachId !== "all") {
      const selectedTeam = match.coach1.coachId === deferredFilters.coachId ? match.coach1 : match.coach2;
      const won = match.winnerId === selectedTeam.seasonCoachId;
      if (deferredFilters.result === "wins" && !won) return false;
      if (deferredFilters.result === "losses" && won) return false;
    }
    return true;
  }), [dataset.matches, deferredFilters, filteredMatchIds, filteredMatches, globalSearchTerms, module]);
  const selectedTeamIds = useMemo(() => [...new Set(filteredMatches.flatMap((match) => [match.coach1.seasonCoachId, match.coach2.seasonCoachId]))], [filteredMatches]);
  const pokemonRows = useMemo(() => aggregateEntities(filteredAppearances, "pokemon").filter((row) => row.appearances >= deferredFilters.minimumAppearances).sort((a, b) => b.appearances - a.appearances || b.damage - a.damage), [filteredAppearances, deferredFilters.minimumAppearances]);
  const coachRows = useMemo(() => aggregateEntities(filteredAppearances, "coach").filter((row) => row.appearances >= deferredFilters.minimumAppearances).sort((a, b) => b.wins - a.wins || b.appearances - a.appearances), [filteredAppearances, deferredFilters.minimumAppearances]);
  const activePokemon = useMemo(() => pokemonRows.find((row) => row.id === profilePokemonId) ?? pokemonRows[0] ?? null, [pokemonRows, profilePokemonId]);
  const activePokemonAppearances = useMemo(() => activePokemon ? filteredAppearances.filter((appearance) => appearance.pokemonId === activePokemon.id).sort((a, b) => (a.match.playedAt ?? "").localeCompare(b.match.playedAt ?? "") || a.match.id - b.match.id) : [], [activePokemon, filteredAppearances]);

  const coveredMatches = useMemo(() => new Set(filteredAppearances.filter((appearance) => hasDamageData(appearance) || appearance.moveDataRecorded || appearance.itemDataRecorded).map((appearance) => appearance.match.id)).size, [filteredAppearances]);
  const allMoveUses = useMemo(() => {
    const counts = new Map<string, number>();
    filteredAppearances.filter((appearance) => appearance.moveDataRecorded).forEach((appearance) => Object.entries(appearance.movesUsed).forEach(([move, count]) => counts.set(move, (counts.get(move) ?? 0) + count)));
    return counts;
  }, [filteredAppearances]);
  const moveRows = useMemo(() => [...allMoveUses.entries()], [allMoveUses]);
  const topMove = useMemo(() => [...allMoveUses].sort((a, b) => b[1] - a[1])[0], [allMoveUses]);

  const updateFilters = (patch: Partial<Filters>) => setFilters((current) => {
    const next = normalizeFilterWeeks({ ...current, ...patch });
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
      if (globalSearch.trim()) query.set("q", globalSearch.trim());
      if (dataset.isDemo) query.set("demo", "1");
      router.replace(`${pathname}?${query}`, { scroll: false });
    }
    return next;
  });
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => updateFilters({ [key]: value });
  const updateGlobalSearch = (value: string) => {
    setGlobalSearch(value);
    if (!standalone) return;
    pendingSearchRef.current = value;
    if (searchSyncTimerRef.current !== null) window.clearTimeout(searchSyncTimerRef.current);
    searchSyncTimerRef.current = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      if (value.trim()) query.set("q", value.trim());
      else query.delete("q");
      router.replace(`${pathname}${query.toString() ? `?${query}` : ""}`, { scroll: false });
      searchSyncTimerRef.current = null;
    }, 240);
  };
  const qualificationText = `${deferredFilters.minimumAppearances}+ games in the active filters`;

  const selectVisualMatch = (matchId: number) => {
    setVisualMatchId(matchId);
    if (!standalone) return;
    const query = new URLSearchParams(window.location.search);
    query.set("match", String(matchId));
    router.replace(`${pathname}?${query}`, { scroll: false });
  };

  const shareView = async () => {
    try {
      const url = window.location.href;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const fallback = document.createElement("textarea");
        fallback.value = url;
        fallback.setAttribute("readonly", "");
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        let copied = false;
        try {
          fallback.select();
          copied = document.execCommand("copy");
        } finally {
          fallback.remove();
        }
        if (!copied) throw new Error("Clipboard unavailable");
      }
      setShareMessage("Link copied");
    } catch {
      setShareMessage("Copy unavailable");
    }
    window.setTimeout(() => setShareMessage(""), 1600);
  };

  return (
    <div className="experimental-stats-readable readable-content space-y-6">
      {dataset.isDemo ? <div className="flex flex-col gap-3 rounded-xl border border-cyan-400/35 bg-cyan-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-cyan-200">Demo data active</div><p className="mt-1 text-[10px] leading-4 text-cyan-100/70">These simulated results exist only in this preview and are never written to the PBO database.</p></div><Link href={pathname} className="btn-retro-secondary shrink-0 px-3 py-2 text-center text-[9px]">Exit demo</Link></div> : null}
      {module !== "glossary" ? <section className="poke-card relative overflow-hidden border-slate-700/80 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-violet-950/25 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] md:p-5">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-pixel text-xs text-white"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300"><ListFilter className="h-3.5 w-3.5" /></span>Filters</h2>
            <p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Refine this report when you need a narrower replay scope.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold text-emerald-300">{filteredMatches.length} matches · {coveredMatches} with detailed fields</span>
            {filtersAreUpdating ? <span role="status" className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-bold text-cyan-200">Updating charts…</span> : null}
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="btn-retro-secondary px-3 py-2 text-[9px]">{filtersOpen ? "Close filters" : "Filters"}</button>
            <button type="button" onClick={shareView} className="btn-retro-secondary inline-flex items-center gap-1 px-3 py-2 text-[9px]"><Share2 className="h-3 w-3" />{shareMessage || "Share"}</button>
          </div>
        </div>
        <div className={`${filtersOpen ? "grid" : "hidden"} gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6`}>
          <FilterSelect label="Season" value={filters.seasonId} onChange={(value) => { const seasonId = value === "all" ? "all" : Number(value); updateFilters({ seasonId, divisionId: "all", weekEnd: highestWeekForSeason(seasonId) }); }}><option value="all">All seasons</option>{dataset.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</FilterSelect>
          <FilterSelect label="Division" value={filters.divisionId} onChange={(value) => updateFilter("divisionId", value === "all" ? "all" : Number(value))}><option value="all">All divisions</option>{filters.seasonId === "all" ? dataset.seasons.map((season) => { const seasonDivisions = visibleDivisions.filter((division) => division.seasonId === season.id).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)); return seasonDivisions.length ? <optgroup key={season.id} label={season.name}>{seasonDivisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</optgroup> : null; }) : [...visibleDivisions].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)).map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</FilterSelect>
          <FilterSelect label="Coach" value={filters.coachId} onChange={(value) => updateFilter("coachId", value === "all" ? "all" : Number(value))}><option value="all">All coaches</option>{optionData.coaches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</FilterSelect>
          <FilterSelect label="Pokémon" value={filters.pokemonId} onChange={(value) => updateFilters({ pokemonId: value === "all" ? "all" : Number(value), move: "all" })}><option value="all">All Pokémon</option>{optionData.pokemon.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</FilterSelect>
          <FilterSelect label={filters.pokemonId === "all" ? "Move" : "Recorded move"} value={filters.move} onChange={(value) => updateFilter("move", value)}><option value="all">{filters.pokemonId === "all" ? "All moves" : "All recorded moves"}</option>{optionData.moves.map((move) => <option key={move}>{move}</option>)}</FilterSelect>
          <FilterSelect label="Item" value={filters.item} onChange={(value) => updateFilter("item", value)}><option value="all">All items</option>{optionData.items.map((item) => <option key={item}>{item}</option>)}</FilterSelect>
          <label className="space-y-1"><span className="block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Week range</span><div className="flex items-center gap-1"><input aria-label="First week" type="number" min={1} max={highestAvailableWeek} value={filters.weekStart} onChange={(event) => updateFilter("weekStart", Math.min(highestAvailableWeek, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 text-xs outline-none focus:border-violet-400" /><span>–</span><input aria-label="Last week" type="number" min={1} max={highestAvailableWeek} value={filters.weekEnd} onChange={(event) => updateFilter("weekEnd", Math.min(highestAvailableWeek, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 text-xs outline-none focus:border-violet-400" /></div></label>
          <label className="space-y-1"><span className="block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Minimum games to qualify</span><input aria-label="Minimum games to qualify" type="number" min={3} max={999} value={filters.minimumAppearances} onChange={(event) => updateFilter("minimumAppearances", Math.max(3, Number(event.target.value) || 3))} className="h-10 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 px-3 text-xs outline-none focus:border-violet-400" /><span className="block text-[8px] leading-3 text-[var(--foreground-subtle)]">Profiles and rankings only; replay evidence remains searchable.</span></label>
          <FilterSelect label="Result" value={filters.result} onChange={(value) => updateFilter("result", value as ResultFilter)}><option value="all">Wins & losses</option><option value="wins">Wins only</option><option value="losses">Losses only</option></FilterSelect>
          <FilterSelect label="Stage" value={filters.stage} onChange={(value) => updateFilter("stage", value as StageFilter)}><option value="all">Regular & playoffs</option><option value="regular">Regular season</option><option value="playoffs">Playoffs</option></FilterSelect>
          <label className="flex items-end gap-2 pb-2 text-xs font-bold text-[var(--foreground-muted)]"><input type="checkbox" checked={filters.includeForfeits} onChange={(event) => updateFilter("includeForfeits", event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />Include forfeits</label>
        </div>
        <label className="relative mt-4 block max-w-3xl"><span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Search this report</span><Search className="pointer-events-none absolute left-3 top-8 h-4 w-4 text-[var(--foreground-muted)]" /><input value={globalSearch} onChange={(event) => updateGlobalSearch(event.target.value)} placeholder="Search Pokémon, coaches, teams, moves, items, or replay details…" aria-label="Search Pokémon, coaches, teams, moves, items, or replay details" className="h-11 w-full rounded-xl border border-slate-700/80 bg-slate-950/75 pl-10 pr-3 text-xs font-bold text-[var(--foreground)] shadow-inner shadow-black/20 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/15" /><span className="mt-1 block text-[8px] leading-3 text-[var(--foreground-subtle)]">Matches all typed words across the active replay scope. Results refresh as you type; URL sharing updates after a brief pause. Existing dropdowns still provide exact filters.</span></label>
      </section> : null}

      <div className={standalone ? "" : "grid gap-6 xl:grid-cols-[230px_minmax(0,1fr)]"}>
        {!standalone ? <aside className="poke-card h-fit p-2 xl:sticky xl:top-24">
          <nav className="grid gap-1 sm:grid-cols-3 xl:grid-cols-1">
            {MODULES.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setModule(id)} className={`flex items-center gap-2 rounded-lg px-3 py-3 text-left text-xs font-bold transition-colors ${module === id ? "bg-[var(--primary)] text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--background-tertiary)] hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span><ChevronRight className="h-3 w-3" /></button>)}
          </nav>
        </aside> : null}

        <main className="min-w-0 space-y-6">
          {module !== "glossary" ? <div className={`grid grid-cols-2 gap-3 ${module === "compare" ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
            <StatCard label={module === "coaches" ? "Official matches" : "Matches"} value={number(module === "coaches" ? coachReportMatches.length : filteredMatches.length)} />
            <StatCard label="Pokémon appearances" value={number(filteredAppearances.length)} />
            <StatCard label="Unique moves" value={number(allMoveUses.size)} />
            {module !== "compare" ? <StatCard label="Most-used move" value={topMove ? `${topMove[0]} · ${topMove[1]}` : "—"} /> : null}
          </div> : null}

          {module === "insights" ? <ExperimentalInsights matches={filteredMatches} appearances={filteredAppearances} /> : null}

          {module === "pokemon" && activePokemon ? <PokemonUsageReport rows={pokemonRows} active={activePokemon} appearances={activePokemonAppearances} matches={filteredMatches} rosterEligibility={dataset.rosterEligibility ?? []} onSelect={setProfilePokemonId} /> : null}
          {module === "pokemon" && <PokemonProfiles rows={pokemonRows} active={activePokemon} appearances={activePokemonAppearances} qualificationText={qualificationText} minimumAppearances={deferredFilters.minimumAppearances} onSelect={setProfilePokemonId} />}
          {module === "coaches" && <CoachProfiles rows={coachRows} appearances={filteredAppearances} matches={coachReportMatches} seasonTeams={dataset.seasonTeams ?? []} />}
          {module === "compare" && <CompareModule rows={pokemonRows} appearances={filteredAppearances} compareA={compareA} compareB={compareB} setCompareA={setCompareA} setCompareB={setCompareB} />}
          {module === "rolling" && <ExpandedRollingModule pokemon={activePokemon} appearances={activePokemonAppearances} rows={pokemonRows} onSelect={setProfilePokemonId} />}
          {module === "leaderboard" && <PresetLeaderboardModule rows={leaderboardEntity === "pokemon" ? pokemonRows : coachRows} entity={leaderboardEntity} setEntity={setLeaderboardEntity} perAppearance={leaderboardRate} setPerAppearance={setLeaderboardRate} minimumAppearances={deferredFilters.minimumAppearances} matches={filteredMatches} appearances={filteredAppearances} />}
          {module === "replays" && <ReplaySearchModule matches={filteredMatches} />}
          {module === "visualizer" && <><div className="space-y-2"><BattleVisualizer matches={filteredMatches} selectedId={visualMatchId} onSelect={selectVisualMatch} /><div className="poke-card px-4 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-[var(--foreground-muted)]">Timeline axes: Turn / turn range of first reveal · Item reveals / team HP remaining (%)</div></div><EventAnalytics matches={filteredMatches} selectedId={visualMatchId} /></>}
          {module === "rare" && <><RareEventsModule matches={filteredMatches} appearances={filteredAppearances} /><EventRareRecords matches={filteredMatches} /></>}
          {module === "signature-stats" && <SignatureStatsReport appearances={filteredAppearances} minimumAppearances={deferredFilters.minimumAppearances} />}
          {module === "team-stats" && <TeamStatsReport matches={filteredMatches} selectedTeamIds={selectedTeamIds} seasonTeams={dataset.seasonTeams ?? []} />}
          {module === "top-plays" && <TopPlaysReport matches={filteredMatches} />}
          {module === "visuals" && <ExperimentalVisualsReport appearances={filteredAppearances} matches={filteredMatches} pokemonRows={pokemonRows} coachRows={coachRows} selectedTeamIds={selectedTeamIds} moves={moveRows} minimumAppearances={deferredFilters.minimumAppearances} />}
          {module === "glossary" && <GlossaryModule search={glossarySearch} setSearch={setGlossarySearch} />}
        </main>
      </div>
    </div>
  );
}

type PokemonUsageSortKey = "name" | "teamUsage" | "globalUsage" | "winRate" | "samples";

function UsageSortButton({ label, sortKey, activeSort, direction, onSort }: { label: string; sortKey: PokemonUsageSortKey; activeSort: PokemonUsageSortKey; direction: "asc" | "desc"; onSort: (sortKey: PokemonUsageSortKey) => void }) {
  const isActive = sortKey === activeSort;
  return <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 rounded px-1 py-1 text-left transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300" aria-label={`Sort by ${label}${isActive ? `, currently ${direction === "desc" ? "descending" : "ascending"}` : ""}`}><span>{label}</span><span className="font-mono text-[10px] text-cyan-300" aria-hidden="true">{isActive ? (direction === "desc" ? "↓" : "↑") : "↕"}</span></button>;
}

function PokemonUsageReport({ rows, active, appearances, matches, rosterEligibility, onSelect }: { rows: EntityAggregate[]; active: EntityAggregate; appearances: EnrichedAppearance[]; matches: ExperimentalMatch[]; rosterEligibility: NonNullable<ExperimentalStatsDataset["rosterEligibility"]>; onSelect: (id: number) => void }) {
  const [usageSort, setUsageSort] = useState<PokemonUsageSortKey>(rosterEligibility.length ? "teamUsage" : "globalUsage");
  const [usageSortDirection, setUsageSortDirection] = useState<"asc" | "desc">("desc");
  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const matchIdsByPokemon = new Map<number, Set<number>>();
  matches.forEach((match) => {
    new Set(match.pokemon.map((appearance) => appearance.pokemonId)).forEach((pokemonId) => {
      const matchIds = matchIdsByPokemon.get(pokemonId) ?? new Set<number>();
      matchIds.add(match.id);
      matchIdsByPokemon.set(pokemonId, matchIds);
    });
  });
  const rosterWindowsByTeam = new Map<number, NonNullable<ExperimentalStatsDataset["rosterEligibility"]>>();
  rosterEligibility.forEach((window) => {
    const windows = rosterWindowsByTeam.get(window.seasonCoachId) ?? [];
    windows.push(window);
    rosterWindowsByTeam.set(window.seasonCoachId, windows);
  });
  const teamUsageByPokemon = new Map<number, { used: number; eligible: number }>();
  matches.forEach((match) => {
    [match.coach1, match.coach2].forEach((team) => {
      const eligiblePokemonIds = new Set(rosterWindowsByTeam.get(team.seasonCoachId)?.filter((window) => window.seasonId === match.seasonId && match.week >= window.startWeek && (window.endWeek === null || match.week < window.endWeek)).map((window) => window.pokemonId));
      if (!eligiblePokemonIds.size) return;
      const usedPokemonIds = new Set(match.pokemon.filter((appearance) => appearance.seasonCoachId === team.seasonCoachId).map((appearance) => appearance.pokemonId));
      eligiblePokemonIds.forEach((pokemonId) => {
        const stats = teamUsageByPokemon.get(pokemonId) ?? { used: 0, eligible: 0 };
        stats.eligible += 1;
        if (usedPokemonIds.has(pokemonId)) stats.used += 1;
        teamUsageByPokemon.set(pokemonId, stats);
      });
    });
  });
  const unsortedUsageRows = rows.map((row) => {
    const evidenceMatches = [...(matchIdsByPokemon.get(row.id) ?? new Set<number>())].map((matchId) => matchesById.get(matchId)).filter((match): match is ExperimentalMatch => Boolean(match));
    const teamUsage = teamUsageByPokemon.get(row.id);
    return {
      row,
      evidenceMatches,
      globalUsageRate: rate(evidenceMatches.length, matches.length) * 100,
      usageRate: rate(evidenceMatches.length, matches.length) * 100,
      teamUsageRate: teamUsage?.eligible ? rate(teamUsage.used, teamUsage.eligible) * 100 : null,
      teamUsageUsed: teamUsage?.used ?? 0,
      teamUsageEligible: teamUsage?.eligible ?? 0,
      winRate: rate(row.wins, row.appearances) * 100,
    };
  });
  const toggleUsageSort = (nextSort: PokemonUsageSortKey) => {
    if (nextSort === usageSort) {
      setUsageSortDirection((direction) => direction === "desc" ? "asc" : "desc");
      return;
    }
    setUsageSort(nextSort);
    setUsageSortDirection(nextSort === "name" ? "asc" : "desc");
  };
  const usageRows = [...unsortedUsageRows].sort((a, b) => {
    if (usageSort === "name") return usageSortDirection === "desc" ? b.row.name.localeCompare(a.row.name) : a.row.name.localeCompare(b.row.name);
    const aValue = usageSort === "teamUsage" ? a.teamUsageRate : usageSort === "globalUsage" ? a.globalUsageRate : usageSort === "winRate" ? a.winRate : a.row.appearances;
    const bValue = usageSort === "teamUsage" ? b.teamUsageRate : usageSort === "globalUsage" ? b.globalUsageRate : usageSort === "winRate" ? b.winRate : b.row.appearances;
    if (aValue === null && bValue !== null) return 1;
    if (aValue !== null && bValue === null) return -1;
    const comparison = Number(bValue ?? 0) - Number(aValue ?? 0);
    if (comparison !== 0) return usageSortDirection === "desc" ? comparison : -comparison;
    return b.row.appearances - a.row.appearances || a.row.name.localeCompare(b.row.name);
  }).slice(0, 12);
  const otherPokemon = usageRows.filter(({ row }) => row.id !== active.id).slice(0, 5);

  const trendMap = new Map<string, { label: string; firstPlayedAt: string; totalMatches: number; activeMatchIds: Set<number>; wins: number; samples: number }>();
  matches.forEach((match) => {
    const key = `${match.seasonId}:${match.week}`;
    const row = trendMap.get(key) ?? { label: `${match.seasonName} - W${match.week}`, firstPlayedAt: match.playedAt ?? "", totalMatches: 0, activeMatchIds: new Set<number>(), wins: 0, samples: 0 };
    row.totalMatches += 1;
    if (!row.firstPlayedAt || (match.playedAt && match.playedAt < row.firstPlayedAt)) row.firstPlayedAt = match.playedAt ?? "";
    trendMap.set(key, row);
  });
  appearances.forEach((appearance) => {
    const row = trendMap.get(`${appearance.match.seasonId}:${appearance.match.week}`);
    if (!row) return;
    row.activeMatchIds.add(appearance.match.id);
    row.wins += appearance.won ? 1 : 0;
    row.samples += 1;
  });
  const trendRows = [...trendMap.values()].filter((row) => row.activeMatchIds.size > 0).sort((a, b) => a.firstPlayedAt.localeCompare(b.firstPlayedAt) || a.label.localeCompare(b.label)).slice(-8);

  const teammateMap = new Map<number, { name: string; spriteUrl: string | null; matchIds: Set<number>; winMatchIds: Set<number> }>();
  appearances.forEach((appearance) => {
    const teammates = new Map<number, ExperimentalAppearance>();
    appearance.match.pokemon.filter((candidate) => candidate.seasonCoachId === appearance.seasonCoachId && candidate.pokemonId !== appearance.pokemonId).forEach((candidate) => teammates.set(candidate.pokemonId, candidate));
    teammates.forEach((teammate) => {
      const row = teammateMap.get(teammate.pokemonId) ?? { name: teammate.pokemonName, spriteUrl: teammate.spriteUrl, matchIds: new Set<number>(), winMatchIds: new Set<number>() };
      row.matchIds.add(appearance.match.id);
      if (appearance.won) row.winMatchIds.add(appearance.match.id);
      teammateMap.set(teammate.pokemonId, row);
    });
  });
  const activeMatchCount = new Set(appearances.map((appearance) => appearance.match.id)).size;
  const teammates = [...teammateMap.entries()].map(([id, row]) => ({ id, ...row, games: row.matchIds.size, winRate: rate(row.winMatchIds.size, row.matchIds.size) * 100 })).sort((a, b) => b.games - a.games || b.winRate - a.winRate || a.name.localeCompare(b.name)).slice(0, 8);

  return <section className="mb-6 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/35 via-slate-950/80 to-violet-950/30 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.16)] md:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-300">PokéBase-inspired report</div><h3 className="mt-1 font-pixel text-sm text-white">Season usage overview</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">Global usage is the share of filtered replay matches containing each Pokémon. Team usage is recorded Pokémon appearances divided by roster-eligible team matches, so acquisitions, replacements, and drops change the denominator. Samples are team appearances.</p></div><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-right"><div className="font-mono text-lg font-black text-cyan-200">{matches.length}</div><div className="text-[9px] font-black uppercase tracking-wider text-cyan-100/60">Scope matches</div></div></div>
    {usageRows.length ? <div className="mobile-scroll-region mt-5 overflow-x-auto rounded-xl border border-[var(--border)] bg-slate-950/45" tabIndex={0} aria-label="Pokémon usage table"><table className="w-full min-w-[960px] text-xs"><thead className="bg-slate-950/75 text-[9px] uppercase tracking-wide text-[var(--foreground-muted)]"><tr><th scope="col" className="p-3 text-left" aria-sort={usageSort === "name" ? (usageSortDirection === "desc" ? "descending" : "ascending") : "none"}><UsageSortButton label="Rank / Pokémon" sortKey="name" activeSort={usageSort} direction={usageSortDirection} onSort={toggleUsageSort} /></th><th scope="col" aria-sort={usageSort === "teamUsage" ? (usageSortDirection === "desc" ? "descending" : "ascending") : "none"}><UsageSortButton label="Team usage" sortKey="teamUsage" activeSort={usageSort} direction={usageSortDirection} onSort={toggleUsageSort} /></th><th scope="col" aria-sort={usageSort === "globalUsage" ? (usageSortDirection === "desc" ? "descending" : "ascending") : "none"}><UsageSortButton label="Global usage" sortKey="globalUsage" activeSort={usageSort} direction={usageSortDirection} onSort={toggleUsageSort} /></th><th scope="col" aria-sort={usageSort === "winRate" ? (usageSortDirection === "desc" ? "descending" : "ascending") : "none"}><UsageSortButton label="Win rate" sortKey="winRate" activeSort={usageSort} direction={usageSortDirection} onSort={toggleUsageSort} /></th><th scope="col" aria-sort={usageSort === "samples" ? (usageSortDirection === "desc" ? "descending" : "ascending") : "none"}><UsageSortButton label="Samples" sortKey="samples" activeSort={usageSort} direction={usageSortDirection} onSort={toggleUsageSort} /></th><th scope="col" className="text-left">Evidence</th></tr></thead><tbody>{usageRows.map(({ row, evidenceMatches, globalUsageRate, teamUsageRate, teamUsageUsed, teamUsageEligible, winRate }, index) => <tr key={row.id} className="border-t border-[var(--border)] text-center"><td className="p-3 text-left"><button type="button" onClick={() => onSelect(row.id)} className="inline-flex items-center gap-2 font-bold text-white hover:text-cyan-200"><span className="font-mono text-[var(--foreground-muted)]">#{index + 1}</span>{row.spriteUrl ? <Image src={row.spriteUrl} alt="" width={28} height={28} className="h-7 w-7 object-contain" /> : null}<span>{row.name}</span></button></td><td><span className="font-mono font-black text-violet-200">{teamUsageRate === null ? "—" : `${number(teamUsageRate, 1)}%`}</span><small className="ml-1 text-[9px] text-[var(--foreground-muted)]">{teamUsageRate === null ? "roster data unavailable" : `(${teamUsageUsed}/${teamUsageEligible})`}</small></td><td><span className="font-mono font-black text-cyan-200">{number(globalUsageRate, 1)}%</span><small className="ml-1 text-[9px] text-[var(--foreground-muted)]">({evidenceMatches.length}/{matches.length})</small></td><td className="font-mono font-black text-emerald-300">{number(winRate, 1)}%</td><td><span className="font-mono text-white">{row.appearances}</span><small className="ml-1 text-[9px] text-[var(--foreground-muted)]">team apps</small></td><td className="p-3 text-left"><div className="flex flex-wrap gap-1.5">{evidenceMatches.slice(0, 3).map((match) => <Link key={match.id} href={matchHref(match)} className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-1 text-[9px] font-bold text-violet-200 hover:border-violet-300/60">W{match.week} - {match.seasonName}</Link>)}{evidenceMatches.length > 3 ? <span className="px-1 py-1 text-[9px] text-[var(--foreground-muted)]">+{evidenceMatches.length - 3} more</span> : null}</div></td></tr>)}</tbody></table></div> : <EmptyState />}
    <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]"><div className="rounded-xl border border-[var(--border)] bg-slate-950/45 p-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><h4 className="text-xs font-black uppercase tracking-wide text-white">Weekly usage trend: {active.name}</h4><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">The bar is match usage; win rate is calculated from the selected Pokemon&apos;s team appearances.</p></div><span className="text-[9px] font-bold text-cyan-200">{activeMatchCount} active matches</span></div>{trendRows.length ? <div className="mt-4 space-y-3">{trendRows.map((row) => { const usage = rate(row.activeMatchIds.size, row.totalMatches) * 100; const winRate = rate(row.wins, row.samples) * 100; return <div key={row.label} className="grid gap-1.5 text-[10px] sm:grid-cols-[125px_minmax(0,1fr)_70px_58px] sm:items-center sm:gap-3"><span className="font-bold text-white">{row.label}</span><div className="h-2.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${Math.min(100, usage)}%` }} /></div><span className="font-mono text-cyan-200">{number(usage, 1)}%</span><span className="font-mono text-emerald-300">{number(winRate, 1)}% W</span></div>; })}</div> : <p className="mt-4 text-xs text-[var(--foreground-muted)]">No weekly trend is available for this selection.</p>}{otherPokemon.length ? <div className="mt-5 border-t border-slate-700/70 pt-4"><div className="mb-3 flex items-end justify-between gap-3"><div><h4 className="text-[10px] font-black uppercase tracking-wide text-white">Other popular Pokémon</h4><p className="mt-1 text-[9px] text-[var(--foreground-muted)]">Click a Pokémon to view its weekly trend.</p></div><span className="text-[8px] font-bold uppercase tracking-wide text-cyan-300">Usage / win rate</span></div><div className="space-y-2">{otherPokemon.map(({ row, usageRate, winRate }) => <button key={row.id} type="button" onClick={() => onSelect(row.id)} title={`View ${row.name} weekly trend`} className="group grid w-full cursor-pointer grid-cols-[28px_minmax(90px,145px)_minmax(70px,1fr)_48px_48px] items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-cyan-400/40 hover:bg-cyan-500/10 focus-visible:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40">{row.spriteUrl ? <Image src={row.spriteUrl} alt="" width={28} height={28} className="h-7 w-7 object-contain" /> : <span className="h-7 w-7" />}<span className="truncate text-[10px] font-bold text-white group-hover:text-cyan-200">{row.name}</span><span className="h-2 overflow-hidden rounded-full bg-slate-800"><span className="block h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${Math.min(100, usageRate)}%` }} /></span><span className="text-right font-mono text-[9px] text-cyan-200">{number(usageRate, 1)}%</span><span className="text-right font-mono text-[9px] text-emerald-300">{number(winRate, 0)}% W</span></button>)}</div></div> : null}</div><div className="rounded-xl border border-[var(--border)] bg-slate-950/45 p-4"><h4 className="text-xs font-black uppercase tracking-wide text-white">Common teammates: {active.name}</h4><p className="mt-1 text-[10px] leading-4 text-[var(--foreground-muted)]">Pokemon that appeared on the same team in the selected matches. This describes correlation, not guaranteed synergy.</p>{teammates.length ? <div className="mt-3 space-y-2">{teammates.map((teammate) => <button key={teammate.id} type="button" onClick={() => onSelect(teammate.id)} title={`View ${teammate.name} profile`} aria-label={`View ${teammate.name} profile`} className="group flex w-full cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)]/70 p-2 text-left transition duration-150 hover:-translate-y-0.5 hover:border-cyan-400/60 hover:bg-cyan-500/10 hover:shadow-[0_6px_18px_rgba(34,211,238,0.12)] focus-visible:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40">{teammate.spriteUrl ? <Image src={teammate.spriteUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" /> : null}<span className="min-w-0 flex-1 truncate text-xs font-bold text-white transition-colors group-hover:text-cyan-200">{teammate.name}</span><span className="text-right text-[9px] text-[var(--foreground-muted)]"><strong className="font-mono text-cyan-200">{teammate.games}</strong> games - <strong className="font-mono text-emerald-300">{number(teammate.winRate, 0)}%</strong> W</span></button>)}</div> : <p className="mt-4 text-xs text-[var(--foreground-muted)]">No teammate pairings are available for this selection.</p>}</div></div>
  </section>;
}

function PokemonProfiles({ rows, active, appearances, qualificationText, minimumAppearances, onSelect }: { rows: EntityAggregate[]; active: EntityAggregate | null; appearances: EnrichedAppearance[]; qualificationText: string; minimumAppearances: number; onSelect: (id: number) => void }) {
  const [profileTab, setProfileTab] = useState<"standard" | "advanced" | "career" | "games" | "splits" | "records">("standard");
  const [splitStage, setSplitStage] = useState<"all" | "regular" | "playoffs">("all");
  const [splitSort, setSplitSort] = useState<"games" | "winRate" | "damage" | "name">("games");
  const [careerStage, setCareerStage] = useState<"all" | "regular" | "playoffs">("all");
  const [careerSort, setCareerSort] = useState<"season" | "games" | "winRate" | "damage" | "name">("season");
  if (!active) return <EmptyState />;
  const selectorRows = [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
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
  const careerRows = [...careerGroups.values()].map((group) => { const scopedAppearances = careerStage === "all" ? group.appearances : group.appearances.filter((appearance) => careerStage === "regular" ? appearance.match.week <= 100 : appearance.match.week > 100); return { ...group, stats: aggregateEntities(scopedAppearances, "pokemon")[0] }; }).filter((row) => row.stats).sort((a, b) => { if (careerSort === "name") return a.coachName.localeCompare(b.coachName) || a.seasonId - b.seasonId; if (careerSort === "games") return (b.stats?.appearances ?? 0) - (a.stats?.appearances ?? 0); if (careerSort === "winRate") return rate(b.stats?.wins ?? 0, b.stats?.appearances ?? 0) - rate(a.stats?.wins ?? 0, a.stats?.appearances ?? 0); if (careerSort === "damage") return rate(b.stats?.damage ?? 0, b.stats?.damageAppearances ?? 0) - rate(a.stats?.damage ?? 0, a.stats?.damageAppearances ?? 0); return b.seasonId - a.seasonId || a.coachName.localeCompare(b.coachName); });
  const careerTotal = aggregateEntities(careerStage === "all" ? appearances : appearances.filter((appearance) => careerStage === "regular" ? appearance.match.week <= 100 : appearance.match.week > 100), "pokemon")[0] ?? active;

  const makeSplit = (label: string, splitAppearances: EnrichedAppearance[]) => ({ label, stats: aggregateEntities(splitStage === "all" ? splitAppearances : splitAppearances.filter((appearance) => splitStage === "regular" ? appearance.match.week <= 100 : appearance.match.week > 100), "pokemon")[0] });
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
  const sortedSplitSections = splitSections.map((section) => ({ ...section, rows: [...section.rows].sort((a, b) => {
    if (splitSort === "name") return a.label.localeCompare(b.label);
    if (splitSort === "winRate") return rate(b.stats?.wins ?? 0, b.stats?.appearances ?? 0) - rate(a.stats?.wins ?? 0, a.stats?.appearances ?? 0) || a.label.localeCompare(b.label);
    if (splitSort === "damage") return rate(b.stats?.damage ?? 0, b.stats?.damageAppearances ?? 0) - rate(a.stats?.damage ?? 0, a.stats?.damageAppearances ?? 0) || a.label.localeCompare(b.label);
    return (b.stats?.appearances ?? 0) - (a.stats?.appearances ?? 0) || a.label.localeCompare(b.label);
  }) }));
  sortedSplitSections.forEach((section, index) => { splitSections[index].rows = section.rows; });

  const chronological = [...appearances].sort((a, b) => (a.match.playedAt ?? "").localeCompare(b.match.playedAt ?? "") || a.match.id - b.match.id);
  let survivalStreak = 0;
  let longestSurvivalStreak = 0;
  for (const appearance of chronological) {
    survivalStreak = appearance.deaths === 0 ? survivalStreak + 1 : 0;
    longestSurvivalStreak = Math.max(longestSurvivalStreak, survivalStreak);
  }
  const bestDamage = appearances.filter(hasDamageData).sort((a, b) => totalDamage(b) - totalDamage(a))[0];
  const bestHealing = appearances.filter((a) => a.hpRestored !== null).sort((a, b) => (b.hpRestored ?? 0) - (a.hpRestored ?? 0))[0];
  const mostMoves = appearances.filter((appearance) => appearance.moveDataRecorded).sort((a, b) => Object.keys(b.movesUsed).length - Object.keys(a.movesUsed).length)[0];
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
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="text-[9px] uppercase tracking-wide text-[var(--foreground-muted)]"><tr><th className="p-2">Team</th><th>Opponent</th><th>Result</th><th>K-D</th><th>Damage</th><th>Healing</th><th>Turns</th><th>Item</th><th>Moves</th></tr></thead>
          <tbody>{[...appearances].reverse().map((appearance) => {
            const player = appearance.seasonCoachId === appearance.match.coach1.seasonCoachId ? appearance.match.coach1 : appearance.match.coach2;
            const opponent = appearance.seasonCoachId === appearance.match.coach1.seasonCoachId ? appearance.match.coach2 : appearance.match.coach1;
            return <tr key={`${appearance.match.id}-${appearance.seasonCoachId}`} className="border-t border-[var(--border)]"><td className="p-2"><Link href={matchHref(appearance.match)} className="font-bold text-white hover:text-[var(--primary)]"><span className="block">{player.teamName}</span><span className="block text-[10px] font-normal text-[var(--foreground-muted)]">{appearance.match.seasonName} · W{appearance.match.week}</span></Link></td><td>{opponent.teamName}</td><td className={appearance.won ? "text-emerald-400" : "text-red-400"}>{appearance.won ? "W" : "L"}</td><td>{appearance.kills}-{appearance.deaths}</td><td>{hasDamageData(appearance) ? `${number(totalDamage(appearance))}%` : "—"}</td><td>{appearance.hpRestored !== null ? `${number(appearance.hpRestored)}%` : "—"}</td><td>{appearance.turnsActive ?? "—"}</td><td>{distinctHeldItemReveals(appearance).map((item) => item.item).join(", ") || (appearance.itemDataRecorded ? "Unrevealed" : "—")}</td><td className="max-w-52 truncate">{appearance.moveDataRecorded ? Object.keys(appearance.movesUsed).join(", ") || "None" : "—"}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:hidden">{[...appearances].reverse().map((appearance) => {
        const player = appearance.seasonCoachId === appearance.match.coach1.seasonCoachId ? appearance.match.coach1 : appearance.match.coach2;
        const opponent = appearance.seasonCoachId === appearance.match.coach1.seasonCoachId ? appearance.match.coach2 : appearance.match.coach1;
        return <Link key={`${appearance.match.id}-${appearance.seasonCoachId}`} href={matchHref(appearance.match)} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><div className="flex justify-between gap-3"><div><strong className="text-white">{player.teamName}</strong><div className="mt-1 text-[10px] text-[var(--foreground-muted)]">vs {opponent.teamName}</div><div className="mt-1 text-[10px] text-[var(--foreground-muted)]">{appearance.match.seasonName} · W{appearance.match.week}</div></div><span className={appearance.won ? "text-emerald-400" : "text-red-400"}>{appearance.won ? "W" : "L"}</span></div><div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px]"><span>{appearance.kills}-{appearance.deaths}<small className="block text-[8px] text-[var(--foreground-muted)]">K-D</small></span><span>{hasDamageData(appearance) ? `${number(totalDamage(appearance))}%` : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">Damage</small></span><span>{appearance.hpRestored !== null ? `${number(appearance.hpRestored)}%` : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">Healing</small></span><span>{appearance.turnsActive ?? "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">Turns</small></span></div></Link>;
      })}</div>
    </>
  );

  return <section className="poke-card relative overflow-hidden border-slate-700/80 bg-slate-900/85 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] md:p-6"><div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-400" /><div className="-mx-5 -mt-5 border-b border-slate-700/60 bg-gradient-to-r from-violet-950/55 via-slate-900/90 to-cyan-950/35 p-5 md:-mx-6 md:-mt-6 md:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.15em] text-violet-200"><Sparkles className="h-3 w-3" />Reference report</div><h2 className="font-pixel text-sm text-white">Pokémon profile</h2><p className="mt-1 max-w-2xl text-xs text-slate-400">Verified totals, rates, splits, and match evidence for the active filters.</p></div><label className="w-full sm:w-auto"><span className="mb-1 block text-[8px] font-black uppercase tracking-wider text-slate-400">Profile</span><select value={active.id} onChange={(event) => onSelect(Number(event.target.value))} className="h-11 w-full min-w-0 rounded-xl border border-violet-400/30 bg-slate-950/80 px-3 text-sm font-bold text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-500/20 sm:min-w-56 sm:w-auto">{selectorRows.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.appearances} appearances</option>)}</select></label></div></div><div className="mobile-tab-strip mt-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-700/60 bg-slate-950/45 p-1.5">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setProfileTab(tab.id)} className={`shrink-0 rounded-lg px-3.5 py-2.5 text-[9px] font-black uppercase tracking-wide transition ${profileTab === tab.id ? "bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-950/30" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{tab.label}</button>)}</div>
    {profileTab === "standard" ? <div className="mt-6 space-y-7"><div className="grid items-start gap-4 lg:grid-cols-[280px_1fr]"><div className="relative overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-950/80 via-slate-950 to-cyan-950/55 p-6 text-center shadow-[0_18px_45px_rgba(15,23,42,0.45)]"><div className="absolute left-1/2 top-12 h-36 w-36 -translate-x-1/2 rounded-full bg-violet-500/20 blur-3xl" />{active.spriteUrl ? <Image src={active.spriteUrl} alt="" width={160} height={160} className="relative mx-auto h-36 w-36 object-contain drop-shadow-[0_14px_20px_rgba(139,92,246,0.35)]" /> : null}<h3 className="relative mt-2 text-2xl font-black text-white">{active.name}</h3><div className="relative mt-3 flex flex-wrap justify-center gap-2"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-slate-300">{active.appearances} appearances</span><span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-300">{active.wins}-{active.appearances - active.wins} record</span></div></div><div className="grid auto-rows-max grid-cols-2 content-start gap-3 self-start md:grid-cols-3"><StatCard label="Record" value={`${active.wins}-${active.appearances - active.wins}`} /><StatCard label="Kills" value={number(active.kills)} /><StatCard label="Deaths" value={number(active.deaths)} /><StatCard label="Damage" value={active.damageAppearances ? `${number(active.damage)}%` : "—"} detail={`${active.damageAppearances} recorded appearances`} /><StatCard label="Healing" value={active.healingAppearances ? `${number(active.healing)}%` : "—"} detail={`${active.healingAppearances} recorded appearances`} /><StatCard label="Most-used move" value={active.mostUsedMove} /></div></div><div><div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-xs font-black uppercase tracking-[0.12em] text-white">Recent appearances</h3><p className="mt-1 text-[10px] text-slate-500">Latest recorded match results for {active.name}</p></div><button type="button" onClick={() => setProfileTab("games")} className="text-[9px] font-black uppercase text-violet-300 hover:text-violet-200">View full log →</button></div>{recentAppearances.length ? <div className="grid gap-2 sm:grid-cols-2">{recentAppearances.map((appearance) => <Link key={appearance.match.id} href={matchHref(appearance.match)} className="group rounded-xl border border-slate-700/70 bg-slate-950/55 p-3.5 transition hover:-translate-y-0.5 hover:border-violet-400/40 hover:bg-violet-950/20"><div className="flex justify-between gap-3"><span className="font-bold text-white group-hover:text-violet-200">{appearance.match.seasonName} · W{appearance.match.week}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${appearance.won ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>{appearance.won ? "WIN" : "LOSS"}</span></div><div className="mt-2 text-[10px] text-slate-400">{appearance.kills}-{appearance.deaths} K–D · {hasDamageData(appearance) ? `${number(totalDamage(appearance))}% damage` : "damage unknown"}</div></Link>)}</div> : <EmptyState />}</div></div> : null}
    {profileTab === "advanced" ? <div className="mt-6 space-y-6"><p className="text-xs text-[var(--foreground-muted)]">Percentiles compare Pokémon with {qualificationText} for each individual metric. Coverage means appearances with the required saved data. Missing data is not zero; a recorded average may be shown before its sample qualifies for a percentile.</p><div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">{metrics.map((metric) => <div key={metric.label}><PercentileStrip label={metric.label} value={metric.display} percentileValue={metric.coverage >= minimumAppearances ? percentile(metric.value, metric.values) : null} /><div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--foreground-muted)]"><span>{metric.coverage}/{active.appearances} covered appearances · {metric.coverage >= minimumAppearances ? `Qualified · ${metric.values.length} comparison Pokémon` : `Needs ${minimumAppearances - metric.coverage} more covered appearances for a percentile`}</span><Link href={`/experimental-stats/glossary#${glossaryId(metric.label)}`} className="text-cyan-300 underline underline-offset-4">Definition: {metric.label}</Link></div></div>)}</div><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase text-white">Damage composition</h3>{active.damageAppearances ? <><div className="mt-4 flex h-5 overflow-hidden rounded-full"><div className="bg-cyan-500" style={{ width: `${directShare}%` }} /><div className="bg-violet-500" style={{ width: `${100 - directShare}%` }} /></div><div className="mt-2 flex justify-between text-[10px]"><span className="text-cyan-300">{number(active.directDamage)}% direct</span><span className="text-violet-300">{number(active.indirectDamage)}% indirect</span></div></> : <p className="mt-3 text-xs text-[var(--foreground-muted)]">No damage coverage.</p>}</div><div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase text-white">Item distribution</h3><div className="mt-3 flex flex-wrap gap-2">{topItems.map(([item, count]) => <span key={item} className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-100">{item} · {count}</span>)}</div></div></div><div><h3 className="mb-3 text-xs font-black uppercase text-white">Similar Pokémon profiles</h3><p className="mb-3 text-[10px] text-[var(--foreground-muted)]">Descriptive similarity across available rates—not matchup advice.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{similarPokemon.map((pokemon) => <button key={pokemon.id} type="button" onClick={() => onSelect(pokemon.id)} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-left"><strong className="text-xs text-white">{pokemon.name}</strong><div className="mt-1 font-mono text-sm text-violet-300">{pokemon.similarity}% similar</div></button>)}</div></div></div> : null}
    {profileTab === "career" ? <><div className="mt-6 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-950/45 p-4"><div><h3 className="text-xs font-black uppercase tracking-wide text-white">Filter and sort career</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Filter this career report by competition stage and sort the rows by the metric you care about.</p></div><div className="flex flex-wrap gap-2"><label className="text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Stage<select value={careerStage} onChange={(event) => setCareerStage(event.target.value as typeof careerStage)} className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-[10px] font-bold text-white"><option value="all">Regular & playoffs</option><option value="regular">Regular season</option><option value="playoffs">Playoffs</option></select></label><label className="text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Sort by<select value={careerSort} onChange={(event) => setCareerSort(event.target.value as typeof careerSort)} className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-[10px] font-bold text-white"><option value="season">Season</option><option value="games">Appearances</option><option value="winRate">Win rate</option><option value="damage">Damage</option><option value="name">Coach name</option></select></label></div></div><div className="mt-6"><p className="mb-4 text-xs text-[var(--foreground-muted)]">One row per season and persistent coach in the active scope, followed by totals for the selected stage.</p><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[780px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Season</th><th className="text-left">Coach / Team</th><th>Appearances</th><th>Record</th><th>K–D</th><th>Damage</th><th>Healing</th><th>Turns</th></tr></thead><tbody>{careerRows.map((row) => <tr key={`${row.seasonId}-${row.coachId}`} className="border-t border-[var(--border)] text-center"><td className="p-2 text-left font-bold text-white">{row.seasonName}</td><td className="text-left">{row.coachName}<small className="block text-[9px] text-[var(--foreground-muted)]">{row.teamName}</small></td><td>{row.stats.appearances}</td><td>{row.stats.wins}-{row.stats.appearances - row.stats.wins}</td><td>{row.stats.kills}-{row.stats.deaths}</td><td>{row.stats.damageAppearances ? `${number(row.stats.damage)}%` : "—"}</td><td>{row.stats.healingAppearances ? `${number(row.stats.healing)}%` : "—"}</td><td>{row.stats.turnsAppearances ? row.stats.turns : "—"}</td></tr>)}<tr className="border-t-2 border-violet-400/40 bg-violet-500/5 text-center font-black"><td className="p-2 text-left" colSpan={2}>Selected-stage totals</td><td>{careerTotal.appearances}</td><td>{careerTotal.wins}-{careerTotal.appearances - careerTotal.wins}</td><td>{careerTotal.kills}-{careerTotal.deaths}</td><td>{careerTotal.damageAppearances ? `${number(careerTotal.damage)}%` : "—"}</td><td>{careerTotal.healingAppearances ? `${number(careerTotal.healing)}%` : "—"}</td><td>{careerTotal.turnsAppearances ? careerTotal.turns : "—"}</td></tr></tbody></table></div><div className="grid gap-3 sm:hidden">{careerRows.map((row) => <div key={`${row.seasonId}-${row.coachId}`} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><strong className="text-white">{row.seasonName}</strong><div className="mt-1 text-[10px] text-[var(--foreground-muted)]">{row.coachName} · {row.teamName}</div><div className="mt-3 grid grid-cols-3 text-center text-xs"><span>{row.stats.appearances}<small className="block text-[8px]">Appearances</small></span><span>{row.stats.wins}-{row.stats.appearances-row.stats.wins}<small className="block text-[8px]">Record</small></span><span>{row.stats.kills}-{row.stats.deaths}<small className="block text-[8px]">K–D</small></span></div></div>)}</div></div></> : null}
    {profileTab === "games" ? <div className="mt-6">{gameLog}</div> : null}
    {profileTab === "splits" ? <div className="mt-6 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-950/45 p-4"><div><h3 className="text-xs font-black uppercase tracking-wide text-white">Filter and sort splits</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">The stage filter applies to every comparison below.</p></div><div className="flex flex-wrap gap-2"><label className="text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Stage<select value={splitStage} onChange={(event) => setSplitStage(event.target.value as typeof splitStage)} className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-[10px] font-bold text-white"><option value="all">All stages</option><option value="regular">Regular season</option><option value="playoffs">Playoffs</option></select></label><label className="text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Sort by<select value={splitSort} onChange={(event) => setSplitSort(event.target.value as typeof splitSort)} className="ml-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-[10px] font-bold text-white"><option value="games">Games</option><option value="winRate">Win rate</option><option value="damage">Damage/game</option><option value="name">Name</option></select></label></div></div> : null}
    {profileTab === "splits" ? <div className="mt-6 space-y-6"><div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.06] p-4"><h3 className="text-xs font-black uppercase tracking-wide text-violet-200">How to read these splits</h3><p className="mt-2 text-xs leading-5 text-[var(--foreground-muted)]">Each card filters this Pokémon&apos;s recorded appearances into one comparison group. Games is the number of appearances, Record is wins–losses, and Damage/game is average recorded damage for games with damage data. These are descriptive replay summaries, not predictions.</p></div><div className="rounded-lg border border-slate-500/30 bg-slate-500/10 p-3 text-xs text-[var(--foreground-muted)]"><strong className="text-slate-300">Not yet available:</strong> lead/non-lead and Tera/no-Tera splits require normalized lead and Terastallization events.</div>{splitSections.map((section) => { const descriptions: Record<string, string> = { Competition: "Regular season compared with playoffs.", Result: "Wins compared with losses.", "Schedule window": "Early-season games compared with later games.", Coach: "Performance grouped by coach.", Season: "Performance grouped by season.", Division: "Performance grouped by division.", "Revealed item": "Games where that item was recorded as revealed.", "Move used": "Games where that move was recorded as used." }; return <div key={section.label}><div className="mb-2"><h3 className="text-xs font-black uppercase text-white">{section.label}</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">{descriptions[section.label]}</p></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{section.rows.map((row) => <div key={row.label} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"><div className="font-bold text-white">{row.label}</div><div className="mt-2 grid grid-cols-3 text-center text-[10px]"><span>{row.stats.appearances}<small className="block text-[8px] text-[var(--foreground-muted)]">Games</small></span><span>{row.stats.wins}-{row.stats.appearances-row.stats.wins}<small className="block text-[8px] text-[var(--foreground-muted)]">Record</small></span><span>{formatCovered(coveredRate(row.stats.damage,row.stats.damageAppearances),1,"%") }<small className="block text-[8px] text-[var(--foreground-muted)]">Damage/game</small></span></div></div>)}</div></div>; })}</div> : null}
    {profileTab === "records" ? <div className="mt-6 space-y-6"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Appearance rank" value={appearanceRank ? `#${appearanceRank}` : "—"} detail="Active scope" /><StatCard label="Kill rank" value={killRank ? `#${killRank}` : "—"} detail="Active scope" /><StatCard label="Damage-rate rank" value={damageRank ? `#${damageRank}` : "Not qualified"} detail={`${minimumAppearances}+ covered appearances`} /><StatCard label="Longest survival streak" value={`${longestSurvivalStreak} games`} /></div><div className="grid gap-3 md:grid-cols-2"><StatCard label="Best single-game damage" value={bestDamage ? `${number(totalDamage(bestDamage))}%` : "—"} detail={bestDamage ? `${bestDamage.match.seasonName} · W${bestDamage.match.week}` : undefined} /><StatCard label="Best single-game healing" value={bestHealing ? `${number(bestHealing.hpRestored ?? 0)}%` : "—"} detail={bestHealing ? `${bestHealing.match.seasonName} · W${bestHealing.match.week}` : undefined} /><StatCard label="Most distinct moves in one game" value={mostMoves?.moveDataRecorded ? `${Object.keys(mostMoves.movesUsed).length}` : "—"} detail={mostMoves?.moveDataRecorded ? Object.keys(mostMoves.movesUsed).join(", ") : undefined} /><StatCard label="Most kills under one coach" value={bestCoachRow ? `${bestCoachRow.stats.kills}` : "—"} detail={bestCoachRow ? `${bestCoachRow.coachName} · ${bestCoachRow.seasonName}` : undefined} /></div></div> : null}
  </section>;
}

function CoachTendenciesPanel({ averageBattleLength, timelineCoverage, replayCount, switchEvents, teraEvents, controlMatches, setupUses, setupCoverage, itemRevealCount, itemCoverage, favoritePokemon, favoriteAppearances }: { averageBattleLength: number | null; timelineCoverage: number; replayCount: number; switchEvents: number; teraEvents: number; controlMatches: number; setupUses: number; setupCoverage: number; itemRevealCount: number; itemCoverage: number; favoritePokemon: string | null; favoriteAppearances: number }) {
  return <div className="mt-6 rounded-xl border border-violet-400/20 bg-violet-500/[0.04] p-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-xs font-black uppercase tracking-wide text-white">Coach tendencies</h3><p className="mt-1 max-w-2xl text-[10px] leading-4 text-[var(--foreground-muted)]">A compact summary of replay-backed habits. These are descriptive signals, not a strategic grade or a prediction of future choices.</p></div><span className="text-[9px] font-bold text-violet-200">{replayCount} replay matches in scope</span></div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><div className="font-mono text-lg font-black text-violet-200">{formatCovered(averageBattleLength, 1, " turns")}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Avg turns</div><div className="mt-1 text-[9px] text-[var(--foreground-muted)]">{timelineCoverage} with timeline</div></div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><div className="font-mono text-lg font-black text-cyan-200">{formatCovered(coveredRate(switchEvents, replayCount), 1)}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Switches / replay</div><div className="mt-1 text-[9px] text-[var(--foreground-muted)]">{controlMatches} with event data</div></div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><div className="font-mono text-lg font-black text-fuchsia-200">{formatCovered(coveredRate(teraEvents, replayCount), 1)}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Tera / replay</div><div className="mt-1 text-[9px] text-[var(--foreground-muted)]">Normalized events only</div></div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><div className="font-mono text-lg font-black text-emerald-200">{formatCovered(coveredRate(setupUses, setupCoverage), 1)}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Setup / appearance</div><div className="mt-1 text-[9px] text-[var(--foreground-muted)]">Recognized setup moves</div></div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><div className="font-mono text-lg font-black text-amber-200">{formatCovered(coveredRate(itemRevealCount * 100, itemCoverage), 1, "%")}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Item reveal rate</div><div className="mt-1 text-[9px] text-[var(--foreground-muted)]">Explicit + inferred</div></div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><div className="truncate text-sm font-black text-white" title={favoritePokemon ?? undefined}>{favoritePokemon ?? "—"}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Most-used Pokémon</div><div className="mt-1 text-[9px] text-[var(--foreground-muted)]">{favoriteAppearances} appearances</div></div>
    </div>
    <p className="mt-3 text-[9px] leading-4 text-[var(--foreground-muted)]">Switch and Tera rates use normalized event summaries when available. Missing event or move fields are excluded rather than interpreted as zero activity.</p>
  </div>;
}

function CoachProfiles({ rows, appearances, matches, seasonTeams }: { rows: EntityAggregate[]; appearances: EnrichedAppearance[]; matches: ExperimentalMatch[]; seasonTeams: NonNullable<ExperimentalStatsDataset["seasonTeams"]> }) {
  const [activeCoachId, setActiveCoachId] = useState<number | null>(null);
  const active = rows.find((row) => row.id === activeCoachId) ?? rows[0];
  if (!active) return <EmptyState />;
  const selectorRows = [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const officialRecords = new Map<number, { games: number; wins: number }>();
  matches.forEach((match) => {
    for (const team of [match.coach1, match.coach2]) {
      const record = officialRecords.get(team.coachId) ?? { games: 0, wins: 0 };
      record.games += 1;
      record.wins += match.winnerId === team.seasonCoachId ? 1 : 0;
      officialRecords.set(team.coachId, record);
    }
  });
  const coachApps = appearances.filter((appearance) => appearance.coachId === active.id);
  const usage = aggregateEntities(coachApps, "pokemon").sort((a, b) => b.appearances - a.appearances).slice(0, 10);
  const directShare = active.damage ? (active.directDamage / active.damage) * 100 : 0;
  const officialCoachMatches = matches.filter((match) => match.coach1.coachId === active.id || match.coach2.coachId === active.id);
  const officialWins = officialCoachMatches.filter((match) => {
    const team = match.coach1.coachId === active.id ? match.coach1 : match.coach2;
    return match.winnerId === team.seasonCoachId;
  }).length;
  const scopedSeasonIds = new Set(matches.map((match) => match.seasonId));
  const seasonTeamById = new Map(seasonTeams.map((team) => [team.seasonCoachId, team]));
  const replacementNotes = seasonTeams.filter((team) => team.coachId === active.id && scopedSeasonIds.has(team.seasonId)).flatMap((team) => {
    const predecessor = seasonTeams.find((candidate) => candidate.replacedById === team.seasonCoachId);
    const successor = team.replacedById ? seasonTeamById.get(team.replacedById) : null;
    if (predecessor) return [{ key: `joined-${team.seasonCoachId}`, label: "Joined mid-season", detail: `${team.seasonName} · ${team.divisionName}: ${team.teamName} (${team.coachName}) replaced ${predecessor.teamName} (${predecessor.coachName}).` }];
    if (successor) return [{ key: `left-${team.seasonCoachId}`, label: "Dropped mid-season", detail: `${team.seasonName} · ${team.divisionName}: ${team.teamName} (${team.coachName}) was replaced by ${successor.teamName} (${successor.coachName}).` }];
    return [];
  });
  const replayMatches = [...new Map(coachApps.map((appearance) => [appearance.match.id, appearance.match])).values()];
  const timelineMatches = replayMatches.filter((match) => (match.totalTurns !== null && match.totalTurns !== undefined) || match.turnSnapshots.length > 0);
  const averageBattleLength = timelineMatches.length ? timelineMatches.reduce((sum, match) => sum + (match.totalTurns ?? match.turnSnapshots.reduce((maximum, snapshot) => Math.max(maximum, snapshot.turn), 0)), 0) / timelineMatches.length : null;
  const controlEvents = replayMatches.flatMap((match) => {
    const coachPlayer = match.p1IsCoach1 === null ? null : match.p1IsCoach1 ? "p1" : "p2";
    return match.battleEvents.filter((event) => (event.eventType === "switch" || event.eventType === "drag" || event.eventType === "terastallize") && coachPlayer !== null && event.player === coachPlayer);
  });
  const switchEvents = controlEvents.filter((event) => event.eventType === "switch" || event.eventType === "drag").reduce((sum, event) => sum + (event.count ?? 1), 0);
  const teraEvents = controlEvents.filter((event) => event.eventType === "terastallize").reduce((sum, event) => sum + (event.count ?? 1), 0);
  const controlMatches = replayMatches.filter((match) => {
    const coachPlayer = match.p1IsCoach1 === null ? null : match.p1IsCoach1 ? "p1" : "p2";
    return coachPlayer !== null && match.battleEvents.some((event) => (event.eventType === "switch" || event.eventType === "drag" || event.eventType === "terastallize") && event.player === coachPlayer);
  });
  const coachSeasonGroups = new Map<number, { seasonName: string; matches: ExperimentalMatch[]; appearances: EnrichedAppearance[] }>();
  officialCoachMatches.forEach((match) => {
    const group = coachSeasonGroups.get(match.seasonId) ?? { seasonName: match.seasonName, matches: [], appearances: [] };
    group.matches.push(match);
    coachSeasonGroups.set(match.seasonId, group);
  });
  coachApps.forEach((appearance) => {
    const group = coachSeasonGroups.get(appearance.match.seasonId) ?? { seasonName: appearance.match.seasonName, matches: [], appearances: [] };
    group.appearances.push(appearance);
    coachSeasonGroups.set(appearance.match.seasonId, group);
  });
  const coachSeasonRows = [...coachSeasonGroups.entries()].map(([seasonId, group]) => {
    const wins = group.matches.filter((match) => {
      const team = match.coach1.coachId === active.id ? match.coach1 : match.coach2;
      return match.winnerId === team.seasonCoachId;
    }).length;
    return { seasonId, seasonName: group.seasonName, wins, losses: group.matches.length - wins, stats: aggregateEntities(group.appearances, "coach")[0] ?? null, pokemonUsed: new Set(group.appearances.map((appearance) => appearance.pokemonId)).size };
  }).sort((a, b) => b.seasonId - a.seasonId);
  const coachItemMap = new Map<string, { item: string; category: HeldItemCategory; count: number; explicit: number; inferred: number }>();
  coachApps.forEach((appearance) => distinctHeldItemReveals(appearance).forEach((reveal) => {
    const item = reveal.item.trim();
    const key = item.toLowerCase();
    const existing = coachItemMap.get(key) ?? { item, category: classifyHeldItem(item), count: 0, explicit: 0, inferred: 0 };
    existing.count += 1;
    if (isAssumedItemReveal(reveal.source)) existing.inferred += 1;
    else existing.explicit += 1;
    coachItemMap.set(key, existing);
  }));
  const coachItemRows = [...coachItemMap.values()].sort((a, b) => b.count - a.count || a.item.localeCompare(b.item));
  const itemDataAppearances = coachApps.filter((appearance) => appearance.itemDataRecorded).length;
  const unrevealedItemAppearances = coachApps.filter((appearance) => appearance.itemDataRecorded && distinctHeldItemReveals(appearance).length === 0).length;
  const unavailableItemAppearances = coachApps.filter((appearance) => !appearance.itemDataRecorded).length;
  const itemDataMatchIds = new Set(coachApps.filter((appearance) => appearance.itemDataRecorded).map((appearance) => appearance.match.id));
  const itemRevealMatchIds = new Set(coachApps.filter((appearance) => appearance.itemDataRecorded && distinctHeldItemReveals(appearance).length > 0).map((appearance) => appearance.match.id));
  const unknownItemRows = [
    unrevealedItemAppearances ? { item: "Recorded with no reveal", category: "Unknown / unrevealed" as HeldItemCategory, count: unrevealedItemAppearances, explicit: 0, inferred: 0 } : null,
    unavailableItemAppearances ? { item: "Item data unavailable", category: "Unknown / unrevealed" as HeldItemCategory, count: unavailableItemAppearances, explicit: 0, inferred: 0 } : null,
  ].filter((row): row is { item: string; category: HeldItemCategory; count: number; explicit: number; inferred: number } => row !== null);
  const coachItemGroups = HELD_ITEM_CATEGORY_ORDER.map((category) => ({ category, rows: category === "Unknown / unrevealed" ? unknownItemRows : coachItemRows.filter((row) => row.category === category) })).filter((group) => group.rows.length > 0);
  const coachMoveRows = [...coachApps.filter((appearance) => appearance.moveDataRecorded).reduce((counts, appearance) => {
    Object.entries(appearance.movesUsed).forEach(([move, count]) => counts.set(move, (counts.get(move) ?? 0) + count));
    return counts;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
  const topCoachMoveUses = coachMoveRows[0]?.[1] ?? 0;
  return (
    <section className="poke-card p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-pixel text-sm text-white">Coach visual report</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Official records include completed results and forfeits. Replay-backed metrics describe what was saved in the selected matches; they are not a formal coaching grade.</p></div>
        <select value={active.id} onChange={(event) => setActiveCoachId(Number(event.target.value))} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm font-bold sm:w-auto">{selectorRows.map((row) => <option key={row.id} value={row.id}>{row.name} · {officialRecords.get(row.id)?.games ?? 0} official matches</option>)}</select>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Coach" value={active.name} />
        <StatCard label="Official matches" value={number(officialCoachMatches.length)} detail={`${officialWins}-${officialCoachMatches.length - officialWins} record`} />
        <StatCard label="Official win rate" value={`${number(rate(officialWins, officialCoachMatches.length) * 100, 1)}%`} detail="Forfeits included when enabled" />
        <StatCard label="Team damage / match" value={formatCovered(coveredRate(active.damage, active.damageAppearances), 1, "%")} detail={`${active.damageAppearances} covered matches`} />
        <StatCard label="Average recorded battle length" value={formatCovered(averageBattleLength, 1, " turns")} detail={`${timelineMatches.length} of ${replayMatches.length} replay matches with turn data`} />
      </div>
      <p className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.05] px-3 py-2 text-[10px] leading-4 text-[var(--foreground-muted)]"><span className="font-bold text-cyan-200">How to read this report:</span> Official results include forfeits when enabled. Damage, item reveals, turns, switches, Tera, and move usage exclude appearances or matches where the underlying replay field was not saved. The battle-length number is the mean of recorded final turns (or the last saved HP snapshot), not an estimate for missing replays.</p>
      {replacementNotes.length ? <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-black uppercase tracking-wide text-amber-100">Replacement history</h3><span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-amber-200">Season stint context</span></div><ul className="mt-3 space-y-2">{replacementNotes.map((note) => <li key={note.key} className="rounded-lg border border-amber-300/15 bg-slate-950/35 p-3"><strong className="text-[10px] uppercase tracking-wide text-amber-200">{note.label}</strong><p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">{note.detail}</p></li>)}</ul><p className="mt-3 text-[10px] leading-4 text-amber-100/65">Personal coach statistics stay with the coach who played each match. Replacement links provide franchise and standings continuity without transferring the outgoing coach&apos;s personal results.</p></div> : null}
      <CoachTendenciesPanel averageBattleLength={averageBattleLength} timelineCoverage={timelineMatches.length} replayCount={replayMatches.length} switchEvents={switchEvents} teraEvents={teraEvents} controlMatches={controlMatches.length} setupUses={active.setupMoves} setupCoverage={active.setupAppearances} itemRevealCount={itemRevealMatchIds.size} itemCoverage={itemDataMatchIds.size} favoritePokemon={usage[0]?.name ?? null} favoriteAppearances={usage[0]?.appearances ?? 0} />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
         <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase text-white">Season-by-season franchise report</h3><p className="mt-1 text-[9px] leading-4 text-[var(--foreground-muted)]">The record is the official season result. Pokémon is the number of distinct Pokémon used. Damage/match and healing/match are replay-derived averages using only appearances where that field was saved. Setup counts recorded setup-move uses, not stat stages; — means there is no supporting replay coverage.</p><div className="mt-3 hidden overflow-x-auto sm:block"><table className="w-full min-w-[560px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Season</th><th>Official record</th><th>Pokémon used</th><th>Damage / match</th><th>Healing / match</th><th>Setup uses</th></tr></thead><tbody>{coachSeasonRows.map((row) => <tr key={row.seasonId} className="border-t border-[var(--border)] text-center"><td className="p-2 text-left font-bold text-white">{row.seasonName}</td><td>{row.wins}-{row.losses}</td><td>{row.pokemonUsed}</td><td>{formatCovered(coveredRate(row.stats?.damage ?? 0,row.stats?.damageAppearances ?? 0),1,"%")}</td><td>{formatCovered(coveredRate(row.stats?.healing ?? 0,row.stats?.healingAppearances ?? 0),1,"%")}</td><td>{row.stats?.setupAppearances ? row.stats.setupMoves : "—"}</td></tr>)}</tbody></table></div><div className="mt-3 grid gap-2 sm:hidden">{coachSeasonRows.map((row) => <div key={row.seasonId} className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-3"><div className="flex items-center justify-between gap-3"><strong className="text-xs text-white">{row.seasonName}</strong><span className="font-mono text-xs text-emerald-300">{row.wins}-{row.losses}</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-center text-[10px]"><span>{row.pokemonUsed}<small className="block text-[8px] text-[var(--foreground-muted)]">Pokémon used</small></span><span>{formatCovered(coveredRate(row.stats?.damage ?? 0,row.stats?.damageAppearances ?? 0),1,"%") }<small className="block text-[8px] text-[var(--foreground-muted)]">Damage / match</small></span><span>{formatCovered(coveredRate(row.stats?.healing ?? 0,row.stats?.healingAppearances ?? 0),1,"%") }<small className="block text-[8px] text-[var(--foreground-muted)]">Healing / match</small></span><span>{row.stats?.setupAppearances ? row.stats.setupMoves : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">Setup uses</small></span></div></div>)}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase text-white">Held-item distribution</h3><p className="mt-1 text-[9px] leading-4 text-[var(--foreground-muted)]">Counted once per Pokémon appearance from saved item evidence. Colors are categories, not item rarity.</p>{coachItemGroups.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{coachItemGroups.map((group) => <div key={group.category} className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-3"><div className={`mb-2 inline-flex rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wide ${HELD_ITEM_CATEGORY_STYLES[group.category]}`}>{group.category}</div><div className="space-y-2">{group.rows.slice(0, 8).map((row) => <div key={row.item} className="flex items-start justify-between gap-2 text-[10px]"><span className="min-w-0 truncate font-bold text-white" title={row.item}>{row.item}</span><span className="shrink-0 font-mono text-[var(--foreground-muted)]">{row.count} <span className="text-[9px]">appearances</span></span>{row.inferred ? <span className="shrink-0 text-[8px] text-fuchsia-200">inferred {row.inferred}</span> : null}</div>)}</div></div>)}</div> : <p className="mt-3 text-xs text-[var(--foreground-muted)]">No item evidence is available in this scope.</p>}<div className="mt-3 border-t border-[var(--border)] pt-3 text-[9px] leading-4 text-[var(--foreground-muted)]"><div><span className="font-bold text-white">Coverage:</span> {itemDataAppearances}/{coachApps.length} appearances include item data · {unrevealedItemAppearances} recorded with no reveal · {unavailableItemAppearances} unavailable.</div><div className="mt-1"><span className="font-bold text-fuchsia-200">Mega Stones:</span> an “inferred” stone comes from a recorded Mega Evolution/team-roster check when the replay did not explicitly reveal the item. Conflicting evidence remains flagged for review.</div></div></div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div><h3 className="mb-3 text-xs font-black uppercase tracking-wide text-white">Pokémon usage frequency</h3><div className="space-y-2">{usage.map((row) => <div key={row.id} className="grid grid-cols-[100px_1fr_36px] items-center gap-2 text-[10px] sm:grid-cols-[150px_1fr_48px] sm:gap-3 sm:text-xs"><span className="truncate font-bold">{row.name}</span><div className="h-3 overflow-hidden rounded-full bg-[var(--background-tertiary)]"><div className="h-full bg-[var(--primary)]" style={{ width: `${(row.appearances / usage[0].appearances) * 100}%` }} /></div><span className="text-right font-mono">{row.appearances}</span></div>)}</div></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="text-xs font-black uppercase tracking-wide text-white">Damage composition</h3>{active.damageAppearances ? <><div className="mt-4 flex h-5 overflow-hidden rounded-full bg-[var(--background-tertiary)]"><div className="bg-cyan-500" style={{ width: `${directShare}%` }} /><div className="bg-violet-500" style={{ width: `${100 - directShare}%` }} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10px]"><span className="text-cyan-300">{number(active.directDamage)}% direct</span><span className="text-violet-300">{number(active.indirectDamage)}% indirect</span></div></> : <p className="mt-3 text-xs text-[var(--foreground-muted)]">No recorded damage coverage in this scope.</p>}</div>
      </div>
      <div className="mt-6 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-xs font-black uppercase tracking-wide text-white">Recorded move usage</h3><p className="mt-1 max-w-2xl text-[10px] leading-4 text-[var(--foreground-muted)]">Moves explicitly recorded in this coach&apos;s Pokémon appearances, ranked by total uses. This reflects replay evidence, not an exact controller-click log; older or incomplete replays may have no move records.</p></div><span className="text-[9px] font-bold text-cyan-200">{active.moveDataAppearances} replay matches with move data</span></div>{coachMoveRows.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{coachMoveRows.map(([move, count]) => <div key={move} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-2 text-[10px]"><span className="truncate font-bold text-white" title={move}>{move}</span><div className="h-2.5 overflow-hidden rounded-full bg-[var(--background-tertiary)]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${topCoachMoveUses ? count / topCoachMoveUses * 100 : 0}%` }} /></div><span className="font-mono text-cyan-200">{count} uses</span></div>)}</div> : <p className="mt-4 text-xs text-[var(--foreground-muted)]">No recorded move usage is available for this coach in the active scope.</p>}</div>
      <div className="mt-6 hidden overflow-x-auto sm:block"><table className="w-full min-w-[760px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Coach</th><th>Replay matches</th><th>Replay win rate</th><th>Damage/match</th><th>Healing/match</th><th>Setup</th><th>Favorable events</th><th>Items revealed</th></tr></thead><tbody>{rows.slice(0, 50).map((row) => <tr key={row.id} className="border-t border-[var(--border)] text-center"><td className="p-2 text-left font-bold text-white">{row.name}</td><td>{row.appearances}</td><td>{number(rate(row.wins, row.appearances) * 100, 1)}%</td><td>{formatCovered(coveredRate(row.damage, row.damageAppearances), 1, "%")}</td><td>{formatCovered(coveredRate(row.healing, row.healingAppearances), 1, "%")}</td><td>{row.setupAppearances ? row.setupMoves : "—"}</td><td>{row.eventAppearances ? row.favorableEvents : "—"}</td><td>{row.itemDataAppearances ? row.itemReveals : "—"}</td></tr>)}</tbody></table></div>
      <div className="mt-6 grid gap-2 sm:hidden">{rows.slice(0, 25).map((row) => <button type="button" onClick={() => setActiveCoachId(row.id)} key={row.id} className={`rounded-xl border p-3 text-left ${row.id === active.id ? "border-violet-400/50 bg-violet-500/10" : "border-[var(--border)] bg-[var(--background)]"}`}><div className="flex items-center justify-between gap-3"><strong className="text-sm text-white">{row.name}</strong><span className="font-mono text-emerald-300">{number(rate(row.wins, row.appearances) * 100, 1)}%</span></div><div className="mt-2 flex gap-3 text-[10px] text-[var(--foreground-muted)]"><span>{row.appearances} matches</span><span>{formatCovered(coveredRate(row.damage, row.damageAppearances), 1, "%")} damage/match</span></div></button>)}</div>
    </section>
  );
}

type CompareItemSummary = { rows: Array<{ item: string; category: HeldItemCategory; count: number; inferred: number }>; appearances: number; itemData: number; unknown: number };

function CompareItemSummaryCard({ name, summary, accent }: { name: string; summary: CompareItemSummary; accent: "cyan" | "fuchsia" }) {
  const accentClass = accent === "cyan" ? "border-cyan-400/25 bg-cyan-500/[0.04] text-cyan-200" : "border-fuchsia-400/25 bg-fuchsia-500/[0.04] text-fuchsia-200";
  return <div className={`rounded-xl border p-4 ${accentClass}`}><h3 className="text-xs font-black uppercase tracking-wide">Common items · {name}</h3><p className="mt-1 text-[10px] leading-4 text-[var(--foreground-muted)]">Most frequent saved item evidence for this Pokémon. Counts are appearances, not assumptions about every unseen game.</p>{summary.rows.length ? <div className="mt-3 space-y-2">{summary.rows.map((row) => <div key={row.item} className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-[10px]"><span className="min-w-0 truncate font-bold text-white" title={row.item}>{row.item}<small className="ml-1 text-[8px] font-normal text-[var(--foreground-muted)]">{row.category}</small></span><span className="shrink-0 font-mono text-[var(--foreground-muted)]">{row.count} app.{row.inferred ? <small className="ml-1 text-fuchsia-200">({row.inferred} inferred)</small> : null}</span></div>)}</div> : <p className="mt-3 text-xs text-[var(--foreground-muted)]">No item reveals are available.</p>}<div className="mt-3 border-t border-[var(--border)] pt-2 text-[9px] text-[var(--foreground-muted)]">Coverage: {summary.itemData}/{summary.appearances} appearances with item data · {summary.unknown} recorded with no reveal.</div></div>;
}

function CompareModule({ rows, appearances, compareA, compareB, setCompareA, setCompareB }: { rows: EntityAggregate[]; appearances: EnrichedAppearance[]; compareA: number | null; compareB: number | null; setCompareA: (id: number) => void; setCompareB: (id: number) => void }) {
  const a = rows.find((row) => row.id === compareA) ?? rows[0];
  const b = rows.find((row) => row.id === compareB) ?? rows[1];
  if (!a || !b) return <EmptyState />;
  const selectorRows = [...rows].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  const commonItems = (pokemonId: number) => {
    const pokemonAppearances = appearances.filter((appearance) => appearance.pokemonId === pokemonId);
    const itemCounts = new Map<string, { item: string; category: HeldItemCategory; count: number; inferred: number }>();
    pokemonAppearances.forEach((appearance) => distinctHeldItemReveals(appearance).forEach((reveal) => {
      const item = reveal.item.trim();
      const key = item.toLowerCase();
      const current = itemCounts.get(key) ?? { item, category: classifyHeldItem(item), count: 0, inferred: 0 };
      current.count += 1;
      if (isAssumedItemReveal(reveal.source)) current.inferred += 1;
      itemCounts.set(key, current);
    }));
    const itemData = pokemonAppearances.filter((appearance) => appearance.itemDataRecorded).length;
    const unknown = pokemonAppearances.filter((appearance) => appearance.itemDataRecorded && distinctHeldItemReveals(appearance).length === 0).length;
    return { rows: [...itemCounts.values()].sort((left, right) => right.count - left.count || left.item.localeCompare(right.item)).slice(0, 5), appearances: pokemonAppearances.length, itemData, unknown };
  };
  const aItems = commonItems(a.id);
  const bItems = commonItems(b.id);
  const metrics = [
    { label: "Win rate", get: (row: EntityAggregate) => coveredRate(row.wins * 100, row.appearances), suffix: "%" },
    { label: "Damage / app", get: (row: EntityAggregate) => coveredRate(row.damage, row.damageAppearances), suffix: "%" },
    { label: "Healing / app", get: (row: EntityAggregate) => coveredRate(row.healing, row.healingAppearances), suffix: "%" },
    { label: "Turns / app", get: (row: EntityAggregate) => coveredRate(row.turns, row.turnsAppearances), suffix: "" },
    { label: "Kills / app", get: (row: EntityAggregate) => coveredRate(row.kills, row.appearances), suffix: "" },
    { label: "Setup / app", get: (row: EntityAggregate) => coveredRate(row.setupMoves, row.setupAppearances), suffix: "" },
    { label: "K-D differential / app", get: (row: EntityAggregate) => coveredRate(row.kills - row.deaths, row.appearances), suffix: "" },
    { label: "Survival rate", get: (row: EntityAggregate) => coveredRate(row.survivalCount * 100, row.appearances), suffix: "%" },
    { label: "Damage taken / app", get: (row: EntityAggregate) => coveredRate(row.damageTaken, row.damageAppearances), suffix: "%" },
    { label: "Favorable events / app", get: (row: EntityAggregate) => coveredRate(row.favorableEvents, row.eventAppearances), suffix: "" },
    { label: "Item reveal rate", get: (row: EntityAggregate) => coveredRate(row.itemReveals * 100, row.itemDataAppearances), suffix: "%" },
    { label: "Unique moves", get: (row: EntityAggregate) => row.moveDataAppearances ? row.uniqueMoves : null, suffix: "" },
  ];
  return (
    <section className="poke-card p-5 md:p-6">
      <div className="mb-6"><h2 className="font-pixel text-sm text-white">Compare</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Side-by-side output under the same qualification and replay filters. Missing replay fields display as unknown.</p></div>
      <div className="grid gap-3 sm:grid-cols-2"><select value={a.id} onChange={(event) => setCompareA(Number(event.target.value))} className="rounded-lg border-2 border-cyan-500/50 bg-[var(--background)] p-3 font-bold">{selectorRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select value={b.id} onChange={(event) => setCompareB(Number(event.target.value))} className="rounded-lg border-2 border-fuchsia-500/50 bg-[var(--background)] p-3 font-bold">{selectorRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2"><CompareItemSummaryCard name={a.name} summary={aItems} accent="cyan" /><CompareItemSummaryCard name={b.name} summary={bItems} accent="fuchsia" /></div>
      <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-500/[0.05] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-black uppercase tracking-wide text-amber-100">How to read Favorable Events</h3><Link href="/experimental-stats/glossary#metric-favorable-event-rate" className="text-[9px] font-black uppercase tracking-wide text-amber-200 underline underline-offset-4">Metric definition</Link></div><p className="mt-2 text-[10px] leading-4 text-[var(--foreground-muted)]">Favorable Events are explicitly recorded crits, misses, flinches, opponent-applied secondary effects (status or stat drops), and logged turns blocked by sleep, freeze, or full paralysis. The comparison shows events per appearance with saved event data; missing event fields are unknown, not zero. Expanded event coverage starts in Season 11 Week 6; Seasons 5–10 and Season 11 Weeks 1–5 retain the legacy format.</p></div>
      <div className="mt-6 space-y-4">{metrics.map((metric) => { const av = metric.get(a); const bv = metric.get(b); const max = Math.max(av ?? 0, bv ?? 0, 1); return <div key={metric.label}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="font-mono text-cyan-400">{formatCovered(av, 1, metric.suffix)}</span><span className="text-center font-bold text-white">{metric.label}</span><span className="font-mono text-fuchsia-400">{formatCovered(bv, 1, metric.suffix)}</span></div><div className="grid grid-cols-2 gap-1"><div className="flex justify-end rounded-l-full bg-[var(--background-tertiary)]"><div className="h-3 rounded-l-full bg-cyan-500" style={{ width: `${((av ?? 0) / max) * 100}%` }} /></div><div className="rounded-r-full bg-[var(--background-tertiary)]"><div className="h-3 rounded-r-full bg-fuchsia-500" style={{ width: `${((bv ?? 0) / max) * 100}%` }} /></div></div></div>; })}</div>
    </section>
  );
}

export function RollingModule({ pokemon, appearances, rows, onSelect }: { pokemon: EntityAggregate | null; appearances: EnrichedAppearance[]; rows: EntityAggregate[]; onSelect: (id: number) => void }) {
  const [windowSize, setWindowSize] = useState<3 | 5 | 10>(5);
  void setWindowSize;
  if (!pokemon) return <EmptyState />;
  const chronological = [...appearances].sort((a, b) => (a.match.playedAt ?? "").localeCompare(b.match.playedAt ?? "") || a.match.id - b.match.id);
  const latest = chronological.slice(-windowSize);
  const previous = chronological.slice(-(windowSize * 2), -windowSize);
  const calc = (list: EnrichedAppearance[], getter: (appearance: EnrichedAppearance) => number, recorded: (appearance: EnrichedAppearance) => boolean = () => true) => {
    const covered = list.filter(recorded);
    return covered.length ? covered.reduce((sum, appearance) => sum + getter(appearance), 0) / covered.length : null;
  };
  const trendRows = [
    { metric: "Damage / appearance", previous: calc(previous, totalDamage, hasDamageData), latest: calc(latest, totalDamage, hasDamageData) },
    { metric: "Healing / appearance", previous: calc(previous, (a) => a.hpRestored ?? 0, (a) => a.hpRestored !== null), latest: calc(latest, (a) => a.hpRestored ?? 0, (a) => a.hpRestored !== null) },
    { metric: "Turns active", previous: calc(previous, (a) => a.turnsActive ?? 0, (a) => a.turnsActive !== null), latest: calc(latest, (a) => a.turnsActive ?? 0, (a) => a.turnsActive !== null) },
    { metric: "Kills", previous: calc(previous, (a) => a.kills), latest: calc(latest, (a) => a.kills) },
    { metric: "Setup moves", previous: calc(previous, (a) => a.setupMovesUsed ?? 0, (a) => a.setupMovesUsed !== null), latest: calc(latest, (a) => a.setupMovesUsed ?? 0, (a) => a.setupMovesUsed !== null) },
  ];
  return <section className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Rolling trends</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Previous five appearances compared with the latest five. Each metric uses only appearances where that field was recorded.</p></div><select value={pokemon.id} onChange={(event) => onSelect(Number(event.target.value))} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm font-bold sm:w-auto">{rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>{appearances.length < 10 ? <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Only {appearances.length} qualified appearances are available. Values remain visible, but a full 5-vs-5 window needs 10.</div> : null}<div className="mt-6 h-72 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 sm:h-80 sm:p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendRows} layout="vertical" margin={{ left: 28, right: 12, bottom: 28 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis type="number" stroke="var(--foreground-muted)" tick={{ fontSize: 10 }} label={{ value: "Metric value", position: "insideBottom", offset: -18, fill: "var(--foreground-muted)", fontSize: 10 }} /><YAxis type="category" dataKey="metric" width={105} stroke="var(--foreground-muted)" tick={{ fontSize: 9 }} label={{ value: "Metric", angle: -90, position: "insideLeft", fill: "var(--foreground-muted)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--background-secondary)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} /><Bar dataKey="previous" name="Previous 5" fill="#64748b" radius={[0, 4, 4, 0]} /><Bar dataKey="latest" name="Latest 5" fill="#8b5cf6" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div><div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]"><table className="w-full text-[10px] sm:text-xs"><thead className="bg-[var(--background)] text-[8px] uppercase text-[var(--foreground-muted)] sm:text-[9px]"><tr><th className="p-3 text-left">Metric</th><th>Previous</th><th>Latest</th><th>Change</th></tr></thead><tbody>{trendRows.map((row) => { const change = row.latest !== null && row.previous !== null ? row.latest - row.previous : null; return <tr key={row.metric} className="border-t border-[var(--border)] text-center"><td className="p-3 text-left font-bold text-white">{row.metric}</td><td className="font-mono">{formatCovered(row.previous, 1)}</td><td className="font-mono">{formatCovered(row.latest, 1)}</td><td className={`font-mono font-black ${change !== null && change > 0 ? "text-emerald-400" : change !== null && change < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>{change === null ? "—" : `${change > 0 ? "+" : ""}${number(change, 1)}`}</td></tr>; })}</tbody></table></div></section>;
}

export function LeaderboardModule({ rows, entity, setEntity, perAppearance, setPerAppearance }: { rows: EntityAggregate[]; entity: "pokemon" | "coach"; setEntity: (value: "pokemon" | "coach") => void; perAppearance: boolean; setPerAppearance: (value: boolean) => void }) {
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
      <div className="mt-5 hidden overflow-x-auto sm:block"><table className="w-full min-w-[900px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Rank</th><th className="p-2 text-left">{entity === "pokemon" ? "Pokémon" : "Coach"}</th><th>{entity === "pokemon" ? "Appearances" : "Matches"}</th><th>W</th><th>K</th><th>D</th><th>Damage</th><th>Healing</th><th>Turns</th><th>Setup</th><th>Favorable</th></tr></thead><tbody>{sorted.slice(0, 150).map((row, index) => <tr key={row.id} className="border-t border-[var(--border)] text-center"><td className="p-2 text-left font-mono text-[var(--foreground-muted)]">{index + 1}</td><td className="p-2 text-left font-bold text-white">{row.name}</td><td>{row.appearances}</td><td>{row.wins}</td><td>{formatCovered(metricValue(row.kills, row.appearances), digits)}</td><td>{formatCovered(metricValue(row.deaths, row.appearances), digits)}</td><td>{formatCovered(metricValue(row.damage, row.damageAppearances), perAppearance ? 1 : 0, "%")}</td><td>{formatCovered(metricValue(row.healing, row.healingAppearances), perAppearance ? 1 : 0, "%")}</td><td>{formatCovered(metricValue(row.turns, row.turnsAppearances), perAppearance ? 1 : 0)}</td><td>{formatCovered(metricValue(row.setupMoves, row.setupAppearances), digits)}</td><td>{formatCovered(metricValue(row.favorableEvents, row.eventAppearances), digits)}</td></tr>)}</tbody></table></div>
      <div className="mt-5 grid gap-3 sm:hidden">{sorted.slice(0, 50).map((row, index) => <div key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--background-tertiary)] font-mono text-xs font-black">{index + 1}</span><div className="min-w-0 flex-1"><div className="truncate font-bold text-white">{row.name}</div><div className="text-[9px] text-[var(--foreground-muted)]">{row.appearances} {entity === "pokemon" ? "appearances" : "matches"} · {row.wins} wins</div></div><span className="font-mono font-black text-violet-300">{formatCovered(metricValue(row.damage, row.damageAppearances), perAppearance ? 1 : 0, "%")}</span></div><div className="mt-3 grid grid-cols-4 gap-2 text-center"><div><div className="font-mono text-xs text-white">{formatCovered(metricValue(row.kills, row.appearances), digits)}</div><div className="text-[8px] uppercase text-[var(--foreground-muted)]">Kills</div></div><div><div className="font-mono text-xs text-white">{formatCovered(metricValue(row.deaths, row.appearances), digits)}</div><div className="text-[8px] uppercase text-[var(--foreground-muted)]">Deaths</div></div><div><div className="font-mono text-xs text-white">{formatCovered(metricValue(row.healing, row.healingAppearances), perAppearance ? 1 : 0, "%")}</div><div className="text-[8px] uppercase text-[var(--foreground-muted)]">Healing</div></div><div><div className="font-mono text-xs text-white">{formatCovered(metricValue(row.setupMoves, row.setupAppearances), digits)}</div><div className="text-[8px] uppercase text-[var(--foreground-muted)]">Setup</div></div></div></div>)}</div>
    </section>
  );
}

type ReplaySearchScope = "pokemon" | "team" | "coach" | "all";

function ReplaySearchModule({ matches }: { matches: ExperimentalMatch[] }) {
  const [minimumDamage, setMinimumDamage] = useState(0);
  const [minimumKills, setMinimumKills] = useState(0);
  const [survivedOnly, setSurvivedOnly] = useState(false);
  const [finderSearch, setFinderSearch] = useState("");
  const [searchScope, setSearchScope] = useState<ReplaySearchScope>("pokemon");
  const results = matches.flatMap((match) => match.pokemon.flatMap((appearance) => {
    const owner = appearance.seasonCoachId === match.coach1.seasonCoachId ? match.coach1 : appearance.seasonCoachId === match.coach2.seasonCoachId ? match.coach2 : null;
    if (!owner) return [];
    const opponent = owner.seasonCoachId === match.coach1.seasonCoachId ? match.coach2 : match.coach1;
    const searchFields = {
      pokemon: appearance.pokemonName,
      team: `${owner.teamName} ${opponent.teamName}`,
      coach: `${owner.coachName} ${opponent.coachName}`,
      all: `${appearance.pokemonName} ${owner.coachName} ${opponent.coachName} ${owner.teamName} ${opponent.teamName}`,
    } satisfies Record<ReplaySearchScope, string>;
    const searchText = finderSearch.trim().toLowerCase();
    if (searchText && !searchFields[searchScope].toLowerCase().includes(searchText)) return [];
    if (minimumDamage > 0 && (!hasDamageData(appearance) || totalDamage(appearance) < minimumDamage)) return [];
    if (appearance.kills < minimumKills) return [];
    if (survivedOnly && appearance.deaths !== 0) return [];
    return [{ match, appearance, owner, opponent }];
  }));
  const resultMatchCount = new Set(results.map(({ match }) => match.id)).size;
  return <section className="poke-card p-5 md:p-6"><h2 className="font-pixel text-sm text-white">Replay Finder</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Search saved Pokémon appearances within the shared season, stage, Pokémon, move, item, coach, and result filters above. Search defaults to Pokémon; switch scope when you want to find a team, coach, or any text.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="space-y-1"><span className="text-[9px] font-black uppercase text-[var(--foreground-muted)]">Search scope</span><select value={searchScope} onChange={(event) => setSearchScope(event.target.value as ReplaySearchScope)} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs"><option value="pokemon">Pokémon (default)</option><option value="team">Team</option><option value="coach">Coach</option><option value="all">All fields</option></select><span className="block text-[8px] leading-3 text-[var(--foreground-subtle)]">Choose what the search text matches.</span></label><label className="space-y-1"><span className="text-[9px] font-black uppercase text-[var(--foreground-muted)]">Search text</span><input value={finderSearch} onChange={(event) => setFinderSearch(event.target.value)} placeholder={searchScope === "pokemon" ? "Search Pokémon…" : searchScope === "team" ? "Search team…" : searchScope === "coach" ? "Search coach…" : "Search Pokémon, team, or coach…"} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[9px] font-black uppercase text-[var(--foreground-muted)]">Minimum damage</span><input type="number" min={0} value={minimumDamage} onChange={(event) => setMinimumDamage(Math.max(0, Number(event.target.value) || 0))} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs" /><span className="block text-[8px] leading-3 text-[var(--foreground-subtle)]">Total damage by that Pokémon.</span></label><label className="space-y-1"><span className="text-[9px] font-black uppercase text-[var(--foreground-muted)]">Minimum Pokémon KOs</span><input type="number" min={0} max={6} value={minimumKills} onChange={(event) => setMinimumKills(Math.min(6, Math.max(0, Number(event.target.value) || 0)))} className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs" /><span className="block text-[8px] leading-3 text-[var(--foreground-subtle)]">KOs by one Pokémon; 0–6 in standard 6v6.</span></label><label className="flex items-end gap-2 pb-2 text-xs font-bold"><input type="checkbox" checked={survivedOnly} onChange={(event) => setSurvivedOnly(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />Survived the battle</label></div><div className="mt-4 text-[10px] font-bold text-[var(--foreground-muted)]">{results.length ? `${results.length} matching Pokémon appearances across ${resultMatchCount} matches.` : "No matching Pokémon appearances."}</div><p className="mt-1 text-[9px] leading-4 text-[var(--foreground-subtle)]">Each result row represents one Pokémon appearance in one replay, so a team search can show up to 12 rows per match. Use the replay link on any row to inspect the full battle.</p><div className="mt-3 space-y-2">{results.slice(0, 150).map(({ match, appearance, owner, opponent }) => <div key={`${match.id}-${appearance.seasonCoachId}-${appearance.pokemonId}`} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><Link href={matchHref(match)} className="font-bold text-white hover:text-[var(--primary)]">{appearance.pokemonName} · {owner.teamName} vs {opponent.teamName}</Link>{match.needsReview ? <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase text-amber-200" title={match.reviewNotes ?? "This match needs review"}>Review</span> : null}</div><div className="mt-1 text-[10px] text-[var(--foreground-muted)]">{match.seasonName} · {match.divisionName} · Week {match.week} · {match.week > 100 ? "Playoffs" : "Regular season"}</div></div><div className="flex gap-3 text-xs"><span>{appearance.kills}-{appearance.deaths} K–D</span><span>{hasDamageData(appearance) ? `${number(totalDamage(appearance))}% damage` : "Damage unknown"}</span><span>{appearance.hpRestored !== null ? `${number(appearance.hpRestored)}% healed` : "Healing unknown"}</span></div><Link href={match.isDemo ? "/experimental-stats?demo=1" : match.replayUrl} target={match.isDemo ? undefined : "_blank"} className="btn-retro-secondary px-3 py-2 text-center text-[9px]">{match.isDemo ? "Demo" : "Replay"}</Link></div>)}{!results.length ? <EmptyState /> : null}</div></section>;
}

function MatchPokemonBoxScore({ match }: { match: ExperimentalMatch }) {
  const teams = [match.coach1, match.coach2];
  return <div className="poke-card p-5 md:p-6"><h3 className="font-pixel text-xs text-white">Pokémon box score</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Compact saved replay summary; dashes indicate fields that were not recorded. <span className="text-emerald-300">Green KOs</span>, <span className="text-red-300">red deaths</span>, <span className="text-cyan-300">cyan damage</span>, <span className="text-emerald-300">green healing</span>, <span className="text-violet-300">violet turns</span>, and <span className="text-amber-200">amber item evidence</span>.</p><div className="mt-5 grid gap-5 xl:grid-cols-2">{teams.map((team) => <div key={team.seasonCoachId} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]"><div className="border-b border-[var(--border)] p-3"><strong className="text-sm text-white">{team.teamName}</strong><span className={`ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${match.winnerId === team.seasonCoachId ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-red-400/35 bg-red-400/10 text-red-300"}`}>{match.winnerId === team.seasonCoachId ? "WIN" : "LOSS"}</span></div><div className="divide-y divide-[var(--border)]">{match.pokemon.filter((appearance) => appearance.seasonCoachId === team.seasonCoachId).map((appearance) => <div key={appearance.pokemonId} className="p-3"><div className="flex flex-wrap items-center gap-3">{appearance.spriteUrl ? <Image src={appearance.spriteUrl} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" /> : null}<div className="min-w-0 flex-1"><div className="font-bold text-white">{appearance.pokemonName}</div><div className="mt-1 truncate text-[9px] text-[var(--foreground-muted)]">{appearance.moveDataRecorded ? Object.keys(appearance.movesUsed).join(", ") || "No moves recorded" : "Moves unknown"}</div></div><div className="grid w-full grid-cols-4 gap-2 text-center text-[10px] sm:w-auto sm:gap-3"><span className="font-mono"><span className="font-black text-emerald-300">{appearance.kills}</span><span className="text-[var(--foreground-subtle)]">-</span><span className="font-black text-red-300">{appearance.deaths}</span><small className="block text-[8px] text-[var(--foreground-muted)]">K–D</small></span><span className={hasDamageData(appearance) ? "font-mono font-black text-cyan-300" : "font-mono font-black text-[var(--foreground-subtle)]"}>{hasDamageData(appearance) ? `${number(totalDamage(appearance))}%` : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">DMG</small></span><span className={appearance.hpRestored !== null ? "font-mono font-black text-emerald-300" : "font-mono font-black text-[var(--foreground-subtle)]"}>{appearance.hpRestored !== null ? `${number(appearance.hpRestored)}%` : "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">HEAL</small></span><span className={appearance.turnsActive !== null ? "font-mono font-black text-violet-300" : "font-mono font-black text-[var(--foreground-subtle)]"}>{appearance.turnsActive ?? "—"}<small className="block text-[8px] text-[var(--foreground-muted)]">TURNS</small></span></div></div><div className="mt-2 break-words text-[9px] text-amber-200"><span className="font-black uppercase tracking-wide text-amber-300">Item evidence:</span> {distinctHeldItemReveals(appearance).map((item) => item.item).join(", ") || (appearance.itemDataRecorded ? "Item unrevealed" : "Item data unavailable")}</div></div>)}</div></div>)}</div></div>;
}

function BattleVisualizer({ matches, selectedId, onSelect }: { matches: ExperimentalMatch[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const searchParams = useSearchParams();
  const requestedTurn = Number(searchParams.get("turn"));
  const requestedMatch = Number(searchParams.get("match"));
  const eligible = matches.filter((match) => (match.totalTurns ?? 0) > 0 || match.turnSnapshots.length > 0 || match.battleEvents.length > 0);
  const match = eligible.find((candidate) => candidate.id === selectedId) ?? eligible.find((candidate) => candidate.id === requestedMatch) ?? eligible[0];
  if (!match) return <section className="poke-card p-6"><h2 className="font-pixel text-sm text-white">Battle visualizer</h2><p className="mt-4 text-sm text-[var(--foreground-muted)]">No saved HP timeline matches the active filters.</p></section>;
  const focusedSnapshot = match.id === requestedMatch && Number.isInteger(requestedTurn) && requestedTurn > 0 ? match.turnSnapshots.find((snapshot) => snapshot.turn === requestedTurn) : null;
  const heldItemRevealTurns = match.pokemon.flatMap((appearance) => distinctHeldItemReveals(appearance).map((item) => item.turn));
  const itemBuckets = [{ label: "1–5", min: 1, max: 5 }, { label: "6–10", min: 6, max: 10 }, { label: "11–15", min: 11, max: 15 }, { label: "16+", min: 16, max: 999 }].map((bucket) => ({ turn: bucket.label, reveals: heldItemRevealTurns.filter((turn) => turn >= bucket.min && turn <= bucket.max).length }));
  const chartEvents = match.keyEvents.filter((event): event is typeof event & { player: "p1" | "p2" } => (event.type === "faint" || event.type === "win") && Boolean(event.player)).map((event) => ({ ...event, type: event.type as "faint" | "win" }));
  const orientationKnown = match.p1IsCoach1 !== null;
  return <section className="space-y-6"><div className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Battle visualizer</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Team HP, faint order, and item timing from saved replay evidence.</p></div><div className="flex max-w-full flex-wrap items-center justify-end gap-2"><select value={match.id} onChange={(event) => onSelect(Number(event.target.value))} className="max-w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs font-bold">{eligible.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.coach1.teamName} vs {candidate.coach2.teamName} · {candidate.seasonName} · {candidate.divisionName} · W{candidate.week}</option>)}</select>{!match.isDemo && match.replayUrl ? <Link href={match.replayUrl} target="_blank" rel="noopener noreferrer" className="btn-retro-secondary shrink-0 px-3 py-2 text-center text-[9px]">Open replay</Link> : null}</div></div>{!orientationKnown ? <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">The saved replay lacks a winner-to-player mapping event, so the HP lines are labeled by replay player rather than attributed to teams.</div> : null}<div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"><HpChart turnSnapshots={match.turnSnapshots} keyEvents={chartEvents} team1Name={orientationKnown ? match.coach1.teamName : "Replay Player 1"} team2Name={orientationKnown ? match.coach2.teamName : "Replay Player 2"} team1Color="#22d3ee" team2Color="#e879f9" p1IsCoach1={match.p1IsCoach1 ?? true} /></div><div className="mt-4 flex flex-wrap gap-2">{match.keyEvents.filter((event) => event.type === "faint").sort((a, b) => a.turn - b.turn).map((event, index) => <span key={`${event.turn}-${index}`} className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] text-red-200">T{event.turn} · {event.pokemon ?? "Unknown"} fainted</span>)}</div></div>{focusedSnapshot ? <div id="battle-turn" className="poke-card scroll-mt-24 p-5"><h3 className="font-pixel text-xs text-white">Selected play · Turn {focusedSnapshot.turn}</h3><p className="mt-3 text-sm">Replay Player 1: {number(focusedSnapshot.p1TotalHp / 6, 1)}% team HP · Replay Player 2: {number(focusedSnapshot.p2TotalHp / 6, 1)}% team HP</p><p className="mt-2 text-xs text-[var(--foreground-muted)]">Saved end-of-turn HP, normalized to a six-Pokémon team. See the full timeline above.</p></div> : null}<MatchPokemonBoxScore match={match} /><div className="poke-card p-5 md:p-6"><h3 className="font-pixel text-xs text-white">Item reveal timeline</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">First explicit saved held-item reveals; transferred Trick and Switcheroo items are excluded and unrevealed items remain unknown.</p><div className="mt-4 h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={itemBuckets} margin={{ bottom: 24, left: 18 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis dataKey="turn" stroke="var(--foreground-muted)" label={{ value: "Turn", position: "insideBottom", offset: -16, fill: "var(--foreground-muted)", fontSize: 10 }} /><YAxis allowDecimals={false} stroke="var(--foreground-muted)" label={{ value: "Item reveals", angle: -90, position: "insideLeft", fill: "var(--foreground-muted)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "var(--background-secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }} /><Bar dataKey="reveals" fill="#a78bfa" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div></section>;
}

function RareEventsModule({ matches, appearances }: { matches: ExperimentalMatch[]; appearances: EnrichedAppearance[] }) {
  const replayLength = (match: ExperimentalMatch) => match.turnSnapshots.reduce((maximum, snapshot) => Math.max(maximum, snapshot.turn), 0);
  const longest = matches.filter((match) => replayLength(match) > 0).sort((a, b) => replayLength(b) - replayLength(a))[0];
  const mostMoves = matches.filter((match) => match.pokemon.some((appearance) => appearance.moveDataRecorded)).map((match) => ({ match, count: new Set(match.pokemon.flatMap((appearance) => Object.keys(appearance.movesUsed))).size })).sort((a, b) => b.count - a.count)[0];
  const biggestDamage = appearances.filter(hasDamageData).sort((a, b) => totalDamage(b) - totalDamage(a))[0];
  const biggestHeal = appearances.filter((appearance) => appearance.hpRestored !== null).sort((a, b) => (b.hpRestored ?? 0) - (a.hpRestored ?? 0))[0];
  const latestItem = appearances.flatMap((appearance) => distinctHeldItemReveals(appearance).map((item) => ({ ...item, appearance }))).sort((a, b) => b.turn - a.turn)[0];
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

function ExpandedRollingModule({ pokemon, appearances, rows, onSelect }: { pokemon: EntityAggregate | null; appearances: EnrichedAppearance[]; rows: EntityAggregate[]; onSelect: (id: number) => void }) {
  const [windowSize, setWindowSize] = useState<3 | 5 | 10>(5);
  if (!pokemon) return <EmptyState />;
  const chronological = [...appearances].sort((a, b) => (a.match.playedAt ?? "").localeCompare(b.match.playedAt ?? "") || a.match.id - b.match.id);
  const latest = chronological.slice(-windowSize);
  const previous = chronological.slice(-(windowSize * 2), -windowSize);
  const selectorRows = [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const average = (list: EnrichedAppearance[], getter: (appearance: EnrichedAppearance) => number, covered: (appearance: EnrichedAppearance) => boolean = () => true) => {
    const values = list.filter(covered);
    return values.length ? values.reduce((sum, appearance) => sum + getter(appearance), 0) / values.length : null;
  };
  const trendRows = [
    { metric: "Damage / appearance", previous: average(previous, totalDamage, hasDamageData), latest: average(latest, totalDamage, hasDamageData) },
    { metric: "Healing / appearance", previous: average(previous, (a) => a.hpRestored ?? 0, (a) => a.hpRestored !== null), latest: average(latest, (a) => a.hpRestored ?? 0, (a) => a.hpRestored !== null) },
    { metric: "Turns active", previous: average(previous, (a) => a.turnsActive ?? 0, (a) => a.turnsActive !== null), latest: average(latest, (a) => a.turnsActive ?? 0, (a) => a.turnsActive !== null) },
    { metric: "Kills", previous: average(previous, (a) => a.kills), latest: average(latest, (a) => a.kills) },
    { metric: "K-D differential", previous: average(previous, (a) => a.kills - a.deaths), latest: average(latest, (a) => a.kills - a.deaths) },
    { metric: "Setup moves", previous: average(previous, (a) => a.setupMovesUsed ?? 0, (a) => a.setupMovesUsed !== null), latest: average(latest, (a) => a.setupMovesUsed ?? 0, (a) => a.setupMovesUsed !== null) },
    { metric: "Favorable events", previous: average(previous, sumFavorable), latest: average(latest, sumFavorable) },
  ];
  return <section className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Rolling trends</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Compare configurable recent windows. Every row shows its recorded-data basis.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><select value={windowSize} onChange={(event) => setWindowSize(Number(event.target.value) as 3 | 5 | 10)} className="min-w-0 flex-1 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm font-bold sm:flex-none"><option value={3}>3-game window</option><option value={5}>5-game window</option><option value={10}>10-game window</option></select><select value={pokemon.id} onChange={(event) => onSelect(Number(event.target.value))} className="min-w-0 flex-1 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-sm font-bold sm:min-w-48 sm:flex-none">{selectorRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div></div>{chronological.length < windowSize * 2 ? <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Only {chronological.length} appearances are available; a complete comparison needs {windowSize * 2}.</div> : null}<div className="mt-6 h-80 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendRows} layout="vertical" margin={{ left: 48, right: 16, top: 8, bottom: 36 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis type="number" stroke="var(--foreground)" tick={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 700 }} label={{ value: "Metric value", position: "insideBottom", offset: -22, fill: "var(--foreground)", fontSize: 11, fontWeight: 700 }} /><YAxis type="category" dataKey="metric" width={152} stroke="var(--foreground)" tick={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 700 }} label={{ value: "Metric", angle: -90, position: "insideLeft", fill: "var(--foreground)", fontSize: 11, fontWeight: 700 }} /><Tooltip contentStyle={{ background: "var(--background-secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }} /><Bar dataKey="previous" name={`Previous ${windowSize}`} fill="#64748b" radius={[0, 4, 4, 0]} /><Bar dataKey="latest" name={`Latest ${windowSize}`} fill="#8b5cf6" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div><div className="mobile-scroll-region mt-4 overflow-x-auto rounded-xl border border-[var(--border)]" tabIndex={0} aria-label="Rolling trend comparison table"><table className="w-full min-w-[600px] text-xs"><thead className="bg-[var(--background)] text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-3 text-left">Metric</th><th>Previous</th><th>Latest</th><th>Change</th><th>Direction</th></tr></thead><tbody>{trendRows.map((row) => { const change = row.latest !== null && row.previous !== null ? row.latest - row.previous : null; return <tr key={row.metric} className="border-t border-[var(--border)] text-center"><td className="p-3 text-left font-bold text-white">{row.metric}</td><td>{formatCovered(row.previous, 2)}</td><td>{formatCovered(row.latest, 2)}</td><td className={change !== null && change > 0 ? "text-emerald-400" : change !== null && change < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}>{change === null ? "—" : `${change > 0 ? "+" : ""}${number(change, 2)}`}</td><td>{change === null ? "Unknown" : change > 0 ? "Up" : change < 0 ? "Down" : "Flat"}</td></tr>; })}</tbody></table></div></section>;
}

type LeaderboardPreset = "damage" | "kd" | "survival" | "playoffs" | "comeback" | "moves" | "koDifferential" | "koDifferentialPerGame" | "moveUsage";

function PresetLeaderboardModule({ rows, entity, setEntity, perAppearance, setPerAppearance, minimumAppearances, matches, appearances }: { rows: EntityAggregate[]; entity: "pokemon" | "coach"; setEntity: (value: "pokemon" | "coach") => void; perAppearance: boolean; setPerAppearance: (value: boolean) => void; minimumAppearances: number; matches: ExperimentalMatch[]; appearances: EnrichedAppearance[] }) {
  const [preset, setPreset] = useState<LeaderboardPreset>("damage");
  const presetDefinitions: Record<LeaderboardPreset, { label: string; description: string }> = {
    damage: { label: "Top damage", description: "Highest recorded damage output." },
    kd: { label: "K-D conversion", description: "Kills divided by kills plus deaths." },
    survival: { label: "Survival rate", description: entity === "pokemon" ? "Pokémon appearances that recorded no faint." : "Coach games in which none of the coach's Pokémon fainted (a 6–0 result)." },
    playoffs: { label: "Playoff performers", description: "Highest damage in playoff matches only." },
    comeback: { label: "Comeback wins", description: "Coach wins after losing the first mapped Pokémon." },
    moves: { label: "Unique moves", description: "Most unique moves in saved move records." },
    koDifferential: { label: "KO Differential", description: "Total KOs minus total deaths." },
    koDifferentialPerGame: { label: "KO Differential/Game", description: "KO differential divided by unique games played." },
    moveUsage: { label: "Move Usage", description: "Total recorded move uses in the active scope." },
  } as const;
  const scopedAppearances = preset === "playoffs" ? appearances.filter((appearance) => appearance.match.week > 100) : appearances;
  const playoffRows = aggregateEntities(scopedAppearances, entity).filter((row) => row.appearances >= minimumAppearances);
  const gameCounts = new Map<number, Set<number>>();
  const moveUsageCounts = new Map<number, number>();
  scopedAppearances.forEach((appearance) => {
    const entityId = entity === "pokemon" ? appearance.pokemonId : appearance.coachId;
    gameCounts.set(entityId, new Set([...(gameCounts.get(entityId) ?? []), appearance.match.id]));
    if (appearance.moveDataRecorded) moveUsageCounts.set(entityId, (moveUsageCounts.get(entityId) ?? 0) + Object.values(appearance.movesUsed).reduce((sum, count) => sum + count, 0));
  });
  const comebackCounts = new Map<number, number>();
  matches.forEach((match) => {
    const faint = [...match.keyEvents].filter((event) => event.type === "faint").sort((a, b) => a.turn - b.turn)[0];
    if (!faint || match.winnerId === null || match.p1IsCoach1 === null) return;
    const faintCoachId = faint.player === "p1" ? (match.p1IsCoach1 ? match.coach1.seasonCoachId : match.coach2.seasonCoachId) : faint.player === "p2" ? (match.p1IsCoach1 ? match.coach2.seasonCoachId : match.coach1.seasonCoachId) : null;
    if (faintCoachId === match.winnerId) {
      const winner = match.winnerId === match.coach1.seasonCoachId ? match.coach1 : match.coach2;
      comebackCounts.set(winner.coachId, (comebackCounts.get(winner.coachId) ?? 0) + 1);
    }
  });
  const activeRows = preset === "playoffs" ? playoffRows : rows;
  const valueFor = (row: EntityAggregate) => {
    if (preset === "kd") return row.kills + row.deaths ? row.kills / (row.kills + row.deaths) * 100 : null;
    if (preset === "survival") return row.appearances ? row.survivalCount / row.appearances * 100 : null;
    if (preset === "comeback") return comebackCounts.get(row.id) ?? 0;
    if (preset === "moves") return row.moveDataAppearances ? row.uniqueMoves : null;
    if (preset === "koDifferential") return row.kills - row.deaths;
    if (preset === "koDifferentialPerGame") return (gameCounts.get(row.id)?.size ?? 0) ? (row.kills - row.deaths) / (gameCounts.get(row.id)?.size ?? 1) : null;
    if (preset === "moveUsage") return moveUsageCounts.has(row.id) ? moveUsageCounts.get(row.id) ?? 0 : null;
    if (!row.damageAppearances) return null;
    return perAppearance ? row.damage / row.damageAppearances : row.damage;
  };
  const labels = { damage: perAppearance ? "Damage / appearance" : "Total damage", kd: "K-D conversion", survival: "Survival rate", playoffs: perAppearance ? "Playoff damage / appearance" : "Total playoff damage", comeback: "Comeback wins", moves: "Unique moves", koDifferential: "KO Differential", koDifferentialPerGame: "KO Differential/Game", moveUsage: "Move uses" } as const;
  const suffixes = { damage: "", kd: "%", survival: "%", playoffs: "", comeback: "", moves: "", koDifferential: "", koDifferentialPerGame: "", moveUsage: "" } as const;
  const sortableRows = preset === "comeback" && entity !== "coach" ? [] : activeRows;
  const sorted = [...sortableRows].sort((a, b) => (valueFor(b) ?? -Infinity) - (valueFor(a) ?? -Infinity));
  const sampleLabel = entity === "pokemon" ? "Appearances" : "Games";
  const exportRows = [[entity === "pokemon" ? "Pokemon" : "Coach", sampleLabel, "Wins", labels[preset], "Coverage"], ...sorted.map((row) => [row.name, row.appearances, row.wins, valueFor(row) ?? "", preset === "damage" || preset === "playoffs" ? row.damageAppearances : preset === "moveUsage" ? row.moveDataAppearances : row.appearances])];
  return <section className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Preset leaderboards</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Ready-made rankings for common questions, with the current report filters applied.</p></div><div className="flex flex-wrap gap-2"><select value={entity} onChange={(event) => setEntity(event.target.value as "pokemon" | "coach")} className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs font-bold"><option value="pokemon">Pokémon</option><option value="coach">Coaches</option></select><select value={preset} onChange={(event) => setPreset(event.target.value as keyof typeof presetDefinitions)} className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs font-bold">{Object.entries(presetDefinitions).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select>{(preset === "damage" || preset === "playoffs") ? <button type="button" onClick={() => setPerAppearance(!perAppearance)} className="btn-retro-secondary px-3 py-2 text-[9px]">{perAppearance ? "Per appearance" : "Totals"}</button> : null}<button type="button" onClick={() => downloadCsv(`pbo-${preset}-leaderboard.csv`, exportRows)} className="btn-retro-primary px-3 py-2 text-[9px]">CSV</button></div></div><div className="mt-3 text-[10px] text-[var(--foreground-muted)]"><strong className="text-white">{presetDefinitions[preset].label}:</strong> {presetDefinitions[preset].description} {preset === "comeback" && entity === "pokemon" ? "Choose Coaches to rank this preset." : ""}</div><div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] p-3 text-[10px] leading-4 text-[var(--foreground-muted)]"><strong className="text-cyan-100">Qualification:</strong> {entity === "pokemon" ? "Pokémon" : "Coaches"} need {minimumAppearances}+ {sampleLabel.toLowerCase()} in the active scope to appear in this ranking. Lower-volume appearances remain available in <Link href="/experimental-stats/replays" className="font-bold text-cyan-300 underline underline-offset-2">Replay Search</Link>.</div><div className="mt-5 overflow-x-auto rounded-xl border border-[var(--border)]"><table className="w-full min-w-[650px] text-xs"><thead className="bg-[var(--background)] text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-3 text-left">Rank</th><th className="text-left">{entity === "pokemon" ? "Pokémon" : "Coach"}</th><th>{sampleLabel}</th><th>Wins</th><th>{labels[preset]}</th><th>Coverage</th></tr></thead><tbody>{sorted.slice(0, 200).map((row, index) => <tr key={row.id} className="border-t border-[var(--border)] text-center"><td className="p-3 text-left font-mono text-[var(--foreground-muted)]">{index + 1}</td><td className="text-left font-bold text-white">{row.name}</td><td>{row.appearances}</td><td>{row.wins}</td><td className="font-mono text-violet-300">{valueFor(row) === null ? "—" : `${number(valueFor(row) ?? 0, 1)}${suffixes[preset]}`}</td><td>{preset === "damage" || preset === "playoffs" ? row.damageAppearances : preset === "moveUsage" ? row.moveDataAppearances : row.appearances}</td></tr>)}</tbody></table></div></section>;
}

// Kept for the legacy custom leaderboard implementation during the module transition.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ExpandedLeaderboardModule({ rows, entity, setEntity, perAppearance, setPerAppearance }: { rows: EntityAggregate[]; entity: "pokemon" | "coach"; setEntity: (value: "pokemon" | "coach") => void; perAppearance: boolean; setPerAppearance: (value: boolean) => void }) {
  const [metric, setMetric] = useState("damage");
  const metricDefinitions: Record<string, { label: string; value: (row: EntityAggregate) => number | null; digits: number; suffix?: string }> = {
    damage: { label: "Damage", value: (row) => row.damageAppearances ? row.damage / row.damageAppearances : null, digits: 1, suffix: "%" },
    kills: { label: "Kills", value: (row) => row.appearances ? row.kills / row.appearances : null, digits: 2 },
    deaths: { label: "Deaths", value: (row) => row.appearances ? row.deaths / row.appearances : null, digits: 2 },
    healing: { label: "Healing", value: (row) => row.healingAppearances ? row.healing / row.healingAppearances : null, digits: 1, suffix: "%" },
    turns: { label: "Turns active", value: (row) => row.turnsAppearances ? row.turns / row.turnsAppearances : null, digits: 2 },
    setup: { label: "Setup moves", value: (row) => row.setupAppearances ? row.setupMoves / row.setupAppearances : null, digits: 2 },
    favorable: { label: "Favorable events", value: (row) => row.eventAppearances ? row.favorableEvents / row.eventAppearances : null, digits: 2 },
    survival: { label: "Survival rate", value: (row) => row.appearances ? (row.survivalCount / row.appearances) * 100 : null, digits: 1, suffix: "%" },
    uniqueMoves: { label: "Unique moves", value: (row) => row.moveDataAppearances ? row.uniqueMoves : null, digits: 0 },
  };
  const definition = metricDefinitions[metric];
  const valueFor = (row: EntityAggregate) => perAppearance ? definition.value(row) : metric === "damage" ? row.damage : metric === "kills" ? row.kills : metric === "deaths" ? row.deaths : metric === "healing" ? row.healing : metric === "turns" ? row.turns : metric === "setup" ? row.setupMoves : metric === "favorable" ? row.favorableEvents : metric === "survival" ? row.survivalCount / Math.max(row.appearances, 1) * 100 : row.uniqueMoves;
  const sorted = [...rows].sort((a, b) => (valueFor(b) ?? -Infinity) - (valueFor(a) ?? -Infinity));
  const exportRows = [[entity === "pokemon" ? "Pokemon" : "Coach", "Appearances", "Wins", definition.label, "Coverage"], ...sorted.map((row) => [row.name, row.appearances, row.wins, valueFor(row) ?? "", metric === "damage" ? row.damageAppearances : metric === "healing" ? row.healingAppearances : row.appearances])];
  return <section className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Custom leaderboard</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Rank by any qualified metric, switch between totals and rates, and export the exact visible definition.</p></div><div className="flex flex-wrap gap-2"><select value={entity} onChange={(event) => setEntity(event.target.value as "pokemon" | "coach")} className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs font-bold"><option value="pokemon">Pokémon</option><option value="coach">Coaches</option></select><select value={metric} onChange={(event) => setMetric(event.target.value)} className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs font-bold">{Object.entries(metricDefinitions).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select><button type="button" onClick={() => setPerAppearance(!perAppearance)} className="btn-retro-secondary px-3 py-2 text-[9px]">{perAppearance ? "Rates" : "Totals"}</button><button type="button" onClick={() => downloadCsv(`pbo-${metric}-leaderboard.csv`, exportRows)} className="btn-retro-primary px-3 py-2 text-[9px]">CSV</button></div></div><div className="mt-3 text-[10px] text-[var(--foreground-muted)]">Ranking: <strong className="text-white">{definition.label}</strong> · {perAppearance ? "per recorded appearance" : "aggregate total"}. Missing fields are excluded, not treated as zero.</div><div className="mt-5 overflow-x-auto rounded-xl border border-[var(--border)]"><table className="w-full min-w-[650px] text-xs"><thead className="bg-[var(--background)] text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-3 text-left">Rank</th><th className="text-left">{entity === "pokemon" ? "Pokémon" : "Coach"}</th><th>Appearances</th><th>Wins</th><th>{definition.label}</th><th>Coverage</th></tr></thead><tbody>{sorted.slice(0, 200).map((row, index) => { const coverage = metric === "damage" ? row.damageAppearances : metric === "healing" ? row.healingAppearances : metric === "turns" ? row.turnsAppearances : metric === "setup" ? row.setupAppearances : metric === "favorable" ? row.eventAppearances : row.appearances; return <tr key={row.id} className="border-t border-[var(--border)] text-center"><td className="p-3 text-left font-mono text-[var(--foreground-muted)]">{index + 1}</td><td className="text-left font-bold text-white">{row.name}</td><td>{row.appearances}</td><td>{row.wins}</td><td className="font-mono text-violet-300">{valueFor(row) === null ? "—" : `${number(valueFor(row) ?? 0, definition.digits)}${definition.suffix ?? ""}`}</td><td>{coverage}</td></tr>; })}</tbody></table></div></section>;
}

function EventAnalytics({ matches, selectedId }: { matches: ExperimentalMatch[]; selectedId: number | null }) {
  const [eventQuery, setEventQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const selected = matches.find((match) => match.id === selectedId) ?? matches[0];
  const events = selected?.battleEvents ?? [];
  const eventTypes = [...new Set(events.map((event) => event.eventType))].sort();
  const visibleEvents = events.filter((event) => {
    if (eventType !== "all" && event.eventType !== eventType) return false;
    if (!eventQuery) return true;
    return `${event.rawLine} ${event.moveName ?? ""} ${event.statusName ?? ""} ${event.itemName ?? ""} ${event.abilityName ?? ""}`.toLowerCase().includes(eventQuery.toLowerCase());
  });
  const counts = new Map<string, number>();
  events.forEach((event) => counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1));
  const topTypes = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const switches = events.filter((event) => event.eventType === "switch" || event.eventType === "drag").length;
  const moveAttempts = events.filter((event) => event.eventType === "move").length;
  const teraEvents = events.filter((event) => event.eventType === "terastallize").length;
  const statusEvents = events.filter((event) => event.eventType === "status" || event.eventType === "curestatus").length;
  const fieldEvents = events.filter((event) => ["weather", "fieldstart", "fieldend", "sidestart", "sideend"].includes(event.eventType)).length;
  const rareTypes = ["terastallize", "formechange", "ability", "enditem", "critical", "crit", "miss", "immune", "supereffective", "resisted", "status", "boost", "unboost"];
  if (!events.length) return <section className="poke-card border-amber-400/30 bg-amber-500/[0.06] p-5 md:p-6"><h2 className="font-pixel text-sm text-white">Protocol event analytics</h2><div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4"><strong className="text-sm text-amber-100">Protocol events have not been generated for this replay.</strong><p className="mt-2 text-xs leading-5 text-amber-100/75">The battle may still have an HP timeline, faint markers, and Pokémon totals above. Move, switch, status, field, and Tera counts require the separate normalized-event backfill, so missing coverage is shown here instead of misleading zeroes.</p>{selected ? <p className="mt-2 text-[10px] text-amber-200/70">Selected replay: {selected.coach1.teamName} vs {selected.coach2.teamName} · {selected.seasonName} · Week {selected.week}</p> : null}</div></section>;
  return <section className="space-y-4"><div className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Protocol event analytics</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Every stored line remains traceable to its raw Showdown source. Select a battle above for a single-battle view.</p></div><span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold text-cyan-200">{events.length.toLocaleString()} events</span></div><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5"><StatCard label="Moves" value={moveAttempts.toLocaleString()} /><StatCard label="Switches" value={switches.toLocaleString()} /><StatCard label="Statuses" value={statusEvents.toLocaleString()} /><StatCard label="Field events" value={fieldEvents.toLocaleString()} /><StatCard label="Tera events" value={teraEvents.toLocaleString()} /></div><div className="mt-6 grid gap-5 lg:grid-cols-2"><div><h3 className="text-xs font-black uppercase text-white">Event density</h3><div className="mt-3 space-y-2">{topTypes.map(([type, count]) => <div key={type} className="grid grid-cols-[130px_1fr_48px] items-center gap-2 text-[10px]"><span className="truncate font-bold text-white">{type}</span><div className="h-2 overflow-hidden rounded-full bg-[var(--background-tertiary)]"><div className="h-full bg-cyan-400" style={{ width: `${(count / (topTypes[0]?.[1] ?? 1)) * 100}%` }} /></div><span className="text-right font-mono">{count}</span></div>)}</div></div><div><h3 className="text-xs font-black uppercase text-white">Rare protocol signals</h3><div className="mt-3 grid grid-cols-2 gap-2">{rareTypes.map((type) => <div key={type} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><div className="text-[9px] uppercase text-[var(--foreground-muted)]">{type}</div><div className="mt-1 font-mono text-lg font-black text-violet-300">{counts.get(type) ?? 0}</div></div>)}</div></div></div></div>{selected ? <div className="poke-card p-5 md:p-6"><h3 className="font-pixel text-xs text-white">Turn-by-turn event stream</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Showing {Math.min(250, visibleEvents.length)} of {visibleEvents.length} matching events for {selected.coach1.teamName} vs {selected.coach2.teamName}.</p><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_190px]"><input value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} placeholder="Search raw lines, moves, statuses…" className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs" /><select value={eventType} onChange={(event) => setEventType(event.target.value)} className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2 text-xs"><option value="all">All event types</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div><div className="mt-4 max-h-[32rem] overflow-auto rounded-xl border border-[var(--border)]"><table className="w-full min-w-[820px] text-[10px]"><thead className="sticky top-0 bg-[var(--background-secondary)] text-[8px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Turn</th><th>Type</th><th className="text-left">Actor</th><th className="text-left">Target</th><th className="text-left">Details</th><th className="text-left">Raw source</th></tr></thead><tbody>{visibleEvents.slice(-250).map((event) => <tr key={`${event.sequence}-${event.rawLine}`} className="border-t border-[var(--border)]"><td className="p-2 font-mono">{event.turn}</td><td className="font-bold text-cyan-200">{event.eventType}</td><td>{event.actorNickname ?? "—"}</td><td>{event.targetNickname ?? "—"}</td><td>{event.moveName ?? event.statusName ?? event.itemName ?? event.abilityName ?? event.fieldName ?? "—"}</td><td className="max-w-[420px] truncate font-mono text-[var(--foreground-muted)]" title={event.rawLine}>{event.rawLine}</td></tr>)}</tbody></table></div></div> : <div className="poke-card p-6 text-center text-xs text-[var(--foreground-muted)]">No normalized protocol events are available in this filtered scope yet. Run the replay backfill after applying the battle-events migration.</div>}</section>;
}

function EventRareRecords({ matches }: { matches: ExperimentalMatch[] }) {
  const rows = matches.flatMap((match) => { const events = match.battleEvents; const peakEvent = events.filter((event) => event.eventType === "__turn_density").sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]; const tera = events.find((event) => event.eventType === "__tera_count")?.value ?? 0; const switches = events.find((event) => event.eventType === "__switch_count")?.value ?? 0; return peakEvent ? [{ match, peak: [peakEvent.turn, peakEvent.value ?? 0] as [number, number], tera, switches }] : []; });
  const densest = [...rows].sort((a, b) => b.peak[1] - a.peak[1])[0];
  const mostSwitches = [...rows].sort((a, b) => b.switches - a.switches).find((row) => row.switches > 0);
  const mostTera = [...rows].sort((a, b) => b.tera - a.tera).find((row) => row.tera > 0);
  const records = [densest && { label: "Most protocol events in one turn", value: `${densest.peak[1]} events · T${densest.peak[0]}`, detail: `${densest.match.coach1.teamName} vs ${densest.match.coach2.teamName}`, id: densest.match.id }, mostSwitches && { label: "Most recorded switches", value: `${mostSwitches.switches}`, detail: `${mostSwitches.match.coach1.teamName} vs ${mostSwitches.match.coach2.teamName}`, id: mostSwitches.match.id }, mostTera && { label: "Most Terastallizations", value: `${mostTera.tera}`, detail: `${mostTera.match.coach1.teamName} vs ${mostTera.match.coach2.teamName}`, id: mostTera.match.id }].filter((record): record is NonNullable<typeof record> => Boolean(record));
  return <section className="poke-card p-5 md:p-6"><h2 className="font-pixel text-sm text-white">Protocol rare records</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Records derived from normalized event density, switching, and transformation signals.</p><div className="mt-5 grid gap-3 md:grid-cols-3">{records.map((record) => <Link key={record.label} href={`/matches/${record.id}`} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 hover:border-violet-400/50"><div className="text-[9px] font-black uppercase tracking-wider text-violet-300">{record.label}</div><div className="mt-2 font-mono text-xl font-black text-white">{record.value}</div><div className="mt-1 text-xs text-[var(--foreground-muted)]">{record.detail}</div></Link>)}</div>{!records.length ? <p className="mt-4 text-xs text-[var(--foreground-muted)]">No normalized event records are available yet.</p> : null}</section>;
}

const glossaryId = (name: string) => `metric-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`;

const glossaryReports: Record<string, string> = {
  "Profile advanced metrics": "pokemon",
  "Battle shape and appearances": "pokemon",
  "Moves and outcomes": "insights",
  "HP, survival, and faints": "battle-visualizer",
  "Statuses": "pokemon",
  "Items and abilities": "battle-visualizer",
  "Transformations and stat stages": "pokemon",
  "Replay records and rare events": "rare-events",
  "Signature stats": "signature-stats",
  "Team and top-play reports": "team-stats",
};

type GlossaryModuleProps = { search: string; setSearch: (value: string) => void };

function GlossaryModuleLegacy({ search, setSearch }: GlossaryModuleProps) {
  const query = search.trim().toLowerCase();
  const groups = experimentalMetricGroups.map((group) => ({ ...group, metrics: group.metrics.filter((metric) => !query || metric.name.toLowerCase().includes(query) || metric.definition.toLowerCase().includes(query)) })).filter((group) => group.metrics.length);
  const visuals = experimentalVisualDefinitions.filter((visual) => !query || `${visual.name} ${visual.description}`.toLowerCase().includes(query));
  const counts = experimentalMetricGroups.flatMap((group) => group.metrics).reduce((result, metric) => ({ ...result, [metric.availability]: result[metric.availability] + 1 }), { available: 0, partial: 0, "event-storage": 0 });
  const badge = (availability: "available" | "partial" | "event-storage") => availability === "available" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : availability === "partial" ? "bg-amber-500/10 text-amber-200 border-amber-500/30" : "bg-slate-500/10 text-slate-300 border-slate-500/30";
  return <section className="space-y-6"><div className="poke-card p-5 md:p-6"><h2 className="font-pixel text-sm text-white">Metric glossary and coverage</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">“Available” has a report calculated from saved replay evidence. “Partial” uses a narrower saved proxy. “Protocol report pending” means normalized events may support it, but the calculation or backfill coverage has not yet been validated for an official report.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><StatCard label="Available" value={String(counts.available)} /><StatCard label="Partial" value={String(counts.partial)} /><StatCard label="Protocol reports pending" value={String(counts["event-storage"])} /></div><div className="relative mt-5"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--foreground-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search metrics and visuals" placeholder="Search metrics and visuals…" className="w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] py-2 pl-10 pr-3 text-sm outline-none focus:border-[var(--primary)]" /></div></div>{!groups.length && !visuals.length ? <div role="status" className="poke-card p-5 text-sm">No metrics or visuals match “{search}”. <button type="button" onClick={() => setSearch("")} className="text-cyan-300 underline">Clear search</button></div> : null}{groups.map((group) => <div key={group.label} data-glossary-group={group.label} className="poke-card p-5"><h3 className="font-pixel text-xs text-white">{group.label}</h3><div className="mt-4 grid gap-2">{group.metrics.map((metric) => <div key={metric.name} id={glossaryId(metric.name)} className="scroll-mt-24 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 md:grid-cols-[minmax(190px,0.8fr)_auto_minmax(260px,1.2fr)] md:items-center"><span className="text-xs font-bold text-white">{metric.name}</span><span className={`w-fit rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wide ${badge(metric.availability)}`}>{metric.availability === "event-storage" ? "Protocol report pending" : metric.availability}</span><span className="text-[10px] leading-4 text-[var(--foreground-muted)]">{metric.definition}{metric.availability !== "event-storage" && glossaryReports[group.label] ? <Link href={`/experimental-stats/${metric.name === "Largest comeback deficit" || metric.name === "Longest active Pokemon appearance" ? "top-plays" : glossaryReports[group.label]}`} className="mt-2 block text-cyan-300 underline underline-offset-4">Open related report →</Link> : null}</span></div>)}</div></div>)}<div className="poke-card p-5"><h3 className="font-pixel text-xs text-white">Niche visuals</h3>{!visuals.length ? <p className="mt-3 text-xs text-[var(--foreground-muted)]">No visuals match this search.</p> : null}<div className="mt-4 grid gap-3 md:grid-cols-2">{visuals.map((visual) => <div key={visual.name} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-white">{visual.name}</strong><span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${badge(visual.availability)}`}>{visual.availability === "event-storage" ? "Protocol report pending" : visual.availability}</span></div><p className="mt-2 text-xs leading-5 text-[var(--foreground-muted)]">{visual.description}</p>{visual.availability !== "event-storage" ? <Link href={`/experimental-stats/${visual.name === "Rare Event Explorer" ? "rare-events" : ["Item reveal timeline", "Battle event timeline"].includes(visual.name) ? "battle-visualizer" : visual.name === "Status dashboard" ? "pokemon" : "visuals"}`} className="mt-3 inline-block text-xs text-cyan-300 underline underline-offset-4">Open related report →</Link> : null}</div>)}</div></div></section>;
}

function GlossaryModule(props: GlossaryModuleProps) {
  return <div className="experimental-glossary-surface"><GlossaryModuleLegacy {...props} /></div>;
}

function EmptyState() {
  return <div className="poke-card p-10 text-center"><FlaskConical className="mx-auto h-8 w-8 text-[var(--foreground-subtle)]" /><p className="mt-3 text-sm font-bold text-white">No qualified replay data</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">Broaden the filters or choose a different replay scope.</p></div>;
}
