import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ExperimentalAppearance, ExperimentalBattleEvent, ExperimentalMatch } from "./experimental-stats-client";

type TeamRef = {
  seasonCoachId: number;
  coachId: number;
  coachName: string;
  teamName: string;
  isActive: boolean;
  replacedById: number | null;
};

type SeasonTeam = {
  seasonCoachId: number;
  teamName: string;
  coachName: string;
  replacedById: number | null;
};

export type TeamStatsRow = {
  team: TeamRef;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  damageFor: number;
  damageForGames: number;
  damageAgainst: number;
  damageAgainstGames: number;
  turnsActive: number;
  turnsGames: number;
  healing: number;
  healingGames: number;
  firstFaintFor: number;
  firstFaintAgainst: number;
  firstFaintGames: number;
  switches: number;
  teraUses: number;
  eventGames: number;
  pokemonUsed: number;
};

type TeamSortKey = "team" | "games" | "wins" | "winRate" | "damageFor" | "damageAgainst" | "differential" | "kills" | "deaths" | "damageActiveTurn" | "firstFaint" | "switches" | "teraUses";
type SortDirection = "asc" | "desc";

export type TopPlayRecord = {
  category: string;
  turn?: number;
  value: number;
  valueLabel: string;
  detail: string;
  match: ExperimentalMatch;
  pokemon?: Array<{ name: string; spriteUrl: string | null }>;
};

const number = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const rate = (value: number, denominator: number) => denominator ? value / denominator : 0;
const perGame = (value: number, games: number, digits = 1, suffix = "") => games ? `${number(value / games, digits)}${suffix}` : "—";
const totalDamage = (appearance: ExperimentalAppearance) => (appearance.damageDealt ?? 0) + (appearance.damageDealtIndirect ?? 0);
const totalDamageTaken = (appearance: ExperimentalAppearance) => (appearance.damageTaken ?? 0) + (appearance.damageTakenIndirect ?? 0);
const matchHref = (match: ExperimentalMatch) => match.isDemo ? "/experimental-stats?demo=1" : `/matches/${match.id}`;

function teamForPlayer(match: ExperimentalMatch, player: "p1" | "p2") {
  if (match.p1IsCoach1 === null) return null;
  const isCoach1 = (player === "p1") === match.p1IsCoach1;
  return isCoach1 ? match.coach1 : match.coach2;
}

function firstFaint(match: ExperimentalMatch) {
  return match.keyEvents
    .filter((event) => event.type === "faint" && event.player)
    .sort((a, b) => a.turn - b.turn)[0] ?? null;
}

function latestFaint(match: ExperimentalMatch) {
  return match.keyEvents.reduce<(typeof match.keyEvents)[number] | null>((latest, event) => {
    if (event.type !== "faint" || !event.player) return latest;
    return !latest || event.turn >= latest.turn ? event : latest;
  }, null);
}

function spritesForPokemonNames(match: ExperimentalMatch, names: Array<string | undefined>) {
  const seen = new Set<number>();
  return names.flatMap((name) => {
    const target = name?.trim().toLowerCase();
    if (!target || target === "unknown" || target === "pokemon") return [];
    const appearance = match.pokemon.find((candidate) => {
      const candidateName = candidate.pokemonName.trim().toLowerCase();
      return candidateName === target || candidateName.startsWith(`${target}-`) || target.startsWith(`${candidateName}-`);
    });
    if (!appearance || seen.has(appearance.pokemonId)) return [];
    seen.add(appearance.pokemonId);
    return [{ name: appearance.pokemonName, spriteUrl: appearance.spriteUrl }];
  });
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

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-950/95 to-slate-900/70 p-4 text-center"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-2 break-words font-mono text-lg font-black text-white sm:text-xl">{value}</div>{detail ? <div className="mt-1 text-[10px] text-[var(--foreground-subtle)]">{detail}</div> : null}</div>;
}

function SortableHeader({ label, sortKey, activeSortKey, direction, onSort, align = "center" }: { label: string; sortKey: TeamSortKey; activeSortKey: TeamSortKey; direction: SortDirection; onSort: (key: TeamSortKey) => void; align?: "left" | "center" }) {
  return <th className={align === "left" ? "p-3 text-left" : "p-3 text-center"}><button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-black hover:text-cyan-200" aria-label={`Sort by ${label}`}>{label}<span className={`text-[8px] ${activeSortKey === sortKey ? "text-cyan-300" : "text-[var(--foreground-subtle)]"}`}>{activeSortKey === sortKey ? (direction === "asc" ? "▲" : "▼") : "↕"}</span></button></th>;
}

export function buildTeamStats(matches: ExperimentalMatch[], selectedTeamIds: Set<number>): TeamStatsRow[] {
  const rows = new Map<number, TeamStatsRow & {
    gameIds: Set<number>;
    damageForIds: Set<number>;
    damageAgainstIds: Set<number>;
    turnsIds: Set<number>;
    healingIds: Set<number>;
    eventIds: Set<number>;
    pokemonIds: Set<number>;
  }>();

  const getRow = (team: TeamRef) => {
    const existing = rows.get(team.seasonCoachId);
    if (existing) return existing;
    const created = {
      team,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      damageFor: 0,
      damageForGames: 0,
      damageAgainst: 0,
      damageAgainstGames: 0,
      turnsActive: 0,
      turnsGames: 0,
      healing: 0,
      healingGames: 0,
      firstFaintFor: 0,
      firstFaintAgainst: 0,
      firstFaintGames: 0,
      switches: 0,
      teraUses: 0,
      eventGames: 0,
      pokemonUsed: 0,
      gameIds: new Set<number>(),
      damageForIds: new Set<number>(),
      damageAgainstIds: new Set<number>(),
      turnsIds: new Set<number>(),
      healingIds: new Set<number>(),
      eventIds: new Set<number>(),
      pokemonIds: new Set<number>(),
    };
    rows.set(team.seasonCoachId, created);
    return created;
  };

  for (const match of matches) {
    const teams = [match.coach1, match.coach2].filter((team) => selectedTeamIds.has(team.seasonCoachId));
    for (const team of teams) {
      const row = getRow(team);
      if (!row.gameIds.has(match.id)) {
        row.gameIds.add(match.id);
        row.games += 1;
        row.wins += match.winnerId === team.seasonCoachId ? 1 : 0;
      }
      const teamAppearances = match.pokemon.filter((appearance) => appearance.seasonCoachId === team.seasonCoachId);
      teamAppearances.forEach((appearance) => {
        row.pokemonIds.add(appearance.pokemonId);
        row.kills += appearance.kills;
        row.deaths += appearance.deaths;
        row.damageFor += totalDamage(appearance);
        row.damageAgainst += totalDamageTaken(appearance);
        row.turnsActive += appearance.turnsActive ?? 0;
        row.healing += appearance.hpRestored ?? 0;
      });
      if (teamAppearances.some((appearance) => appearance.damageDealt !== null || appearance.damageDealtIndirect !== null)) row.damageForIds.add(match.id);
      if (teamAppearances.some((appearance) => appearance.damageTaken !== null || appearance.damageTakenIndirect !== null)) row.damageAgainstIds.add(match.id);
      if (teamAppearances.some((appearance) => appearance.turnsActive !== null)) row.turnsIds.add(match.id);
      if (teamAppearances.some((appearance) => appearance.hpRestored !== null)) row.healingIds.add(match.id);

      const faint = firstFaint(match);
      const faintTeam = faint?.player ? teamForPlayer(match, faint.player) : null;
      if (faintTeam) {
        row.firstFaintGames += 1;
        if (faintTeam.seasonCoachId === team.seasonCoachId) row.firstFaintAgainst += 1;
        else row.firstFaintFor += 1;
      }

      for (const event of match.battleEvents) {
        if (event.eventType !== "switch" && event.eventType !== "drag" && event.eventType !== "terastallize") continue;
        const eventTeam = eventTeamForMatch(match, event);
        if (!eventTeam || eventTeam.seasonCoachId !== team.seasonCoachId) continue;
        row.eventIds.add(match.id);
        const eventCount = event.count ?? 1;
        if (event.eventType === "switch" || event.eventType === "drag") row.switches += eventCount;
        if (event.eventType === "terastallize") row.teraUses += eventCount;
      }
    }
  }

  return [...rows.values()].map((row) => ({
    team: row.team,
    games: row.games,
    wins: row.wins,
    kills: row.kills,
    deaths: row.deaths,
    damageFor: row.damageFor,
    damageForGames: row.damageForIds.size,
    damageAgainst: row.damageAgainst,
    damageAgainstGames: row.damageAgainstIds.size,
    turnsActive: row.turnsActive,
    turnsGames: row.turnsIds.size,
    healing: row.healing,
    healingGames: row.healingIds.size,
    firstFaintFor: row.firstFaintFor,
    firstFaintAgainst: row.firstFaintAgainst,
    firstFaintGames: row.firstFaintGames,
    switches: row.switches,
    teraUses: row.teraUses,
    eventGames: row.eventIds.size,
    pokemonUsed: row.pokemonIds.size,
  })).sort((a, b) => b.wins - a.wins || b.games - a.games || b.damageFor - a.damageFor);
}

function eventTeamForMatch(match: ExperimentalMatch, event: ExperimentalBattleEvent) {
  return event.player ? teamForPlayer(match, event.player) : null;
}

type ProtocolEntry = { name: string; key: string; turn: number; sequence: number; eventType: string };
type ProtocolSideSummary = {
  match: ExperimentalMatch;
  player: "p1" | "p2";
  lead: ProtocolEntry;
  entries: ProtocolEntry[];
  firstTurns: Map<string, { name: string; turn: number }>;
  latestReveal: string;
  pokemonNames: Map<string, string>;
  switchedOut: Set<string>;
};

function protocolPokemonName(event: ExperimentalBattleEvent) {
  const name = event.pokemonName?.trim() || event.actorNickname?.trim();
  return name ? { name, key: name.toLocaleLowerCase() } : null;
}

function protocolSlot(event: ExperimentalBattleEvent, player: "p1" | "p2") {
  return event.rawLine.match(/^\|(?:switch|drag|faint)\|(p[12][a-z]?):/i)?.[1]?.toLocaleLowerCase() ?? `${player}a`;
}

function buildProtocolSideSummary(match: ExperimentalMatch, player: "p1" | "p2"): ProtocolSideSummary | null {
  const sideEvents = match.battleEvents
    .filter((event) => event.player === player)
    .sort((a, b) => a.sequence - b.sequence || a.turn - b.turn);
  const entries = sideEvents.flatMap((event) => {
    if (event.eventType !== "switch" && event.eventType !== "drag") return [];
    const pokemon = protocolPokemonName(event);
    return pokemon ? [{ name: pokemon.name, key: pokemon.key, turn: event.turn, sequence: event.sequence, eventType: event.eventType }] : [];
  });
  const lead = entries[0];
  if (!lead || lead.eventType !== "switch") return null;

  const firstTurns = new Map<string, { name: string; turn: number }>();
  const pokemonNames = new Map<string, string>();
  let latestReveal = lead.name;
  for (const entry of entries) {
    pokemonNames.set(entry.key, entry.name);
    if (!firstTurns.has(entry.key)) {
      firstTurns.set(entry.key, { name: entry.name, turn: entry.turn });
      latestReveal = entry.name;
    }
  }

  const activeBySlot = new Map<string, string>();
  const switchedOut = new Set<string>();
  for (const event of sideEvents) {
    const slot = protocolSlot(event, player);
    if (event.eventType === "faint") {
      activeBySlot.delete(slot);
      continue;
    }
    if (event.eventType !== "switch" && event.eventType !== "drag") continue;
    const pokemon = protocolPokemonName(event);
    if (!pokemon) continue;
    const previousPokemon = activeBySlot.get(slot);
    if (previousPokemon) switchedOut.add(previousPokemon);
    activeBySlot.set(slot, pokemon.key);
  }

  return { match, player, lead, entries, firstTurns, latestReveal, pokemonNames, switchedOut };
}

function protocolSeasonNumber(match: ExperimentalMatch) {
  if (typeof match.seasonNumber === "number") return match.seasonNumber;
  return Number(match.seasonName.match(/(?:season|s)\s*(\d+)/i)?.[1] ?? 0);
}

function ProtocolReportTable({ title, headers, rows, emptyText }: { title: string; headers: string[]; rows: ReactNode[][]; emptyText: string }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
    <h4 className="font-pixel text-[10px] text-white">{title}</h4>
    {rows.length ? <div className="mobile-scroll-region mt-3 overflow-x-auto" tabIndex={0} aria-label={title}>
      <table className="w-full min-w-max text-left text-[10px]"><thead className="text-[8px] uppercase text-[var(--foreground-muted)]"><tr>{headers.map((header) => <th key={header} className="px-2 py-2">{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-t border-[var(--border)] text-[var(--foreground-muted)]">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-2">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div> : <p className="mt-3 text-[10px] text-[var(--foreground-muted)]">{emptyText}</p>}
  </div>;
}

function ProtocolReplayReports({ matches }: { matches: ExperimentalMatch[] }) {
  const eligibleMatches = matches.filter((match) => protocolSeasonNumber(match) >= 5);
  const covered: Array<{ match: ExperimentalMatch; sides: [ProtocolSideSummary, ProtocolSideSummary] }> = [];
  for (const match of eligibleMatches) {
    const p1 = buildProtocolSideSummary(match, "p1");
    const p2 = buildProtocolSideSummary(match, "p2");
    if (p1 && p2) covered.push({ match, sides: [p1, p2] });
  }

  const leads = new Map<string, { name: string; count: number }>();
  const matchups = new Map<string, { label: string; count: number }>();
  const firstAppearance = new Map<string, { name: string; count: number; turnTotal: number; minTurn: number; maxTurn: number }>();
  const latestReveals = new Map<string, { name: string; count: number }>();
  const switchInsByPokemon = new Map<string, { name: string; count: number }>();
  const neverSwitchedOut = new Map<string, { name: string; seen: number; never: number }>();
  const matchLeadRows: Array<{ match: ExperimentalMatch; sides: [ProtocolSideSummary, ProtocolSideSummary] }> = [];
  let totalSwitchIns = 0;
  let fullyRevealedSides = 0;
  let coveredSides = 0;

  const increment = (map: Map<string, { name: string; count: number }>, key: string, name: string) => {
    const current = map.get(key) ?? { name, count: 0 };
    current.count += 1;
    map.set(key, current);
  };

  for (const { match, sides } of covered) {
    matchLeadRows.push({ match, sides });
    const matchupNames = sides.map((side) => side.lead.name).sort((a, b) => a.localeCompare(b));
    const matchupKey = matchupNames.map((name) => name.toLocaleLowerCase()).join(" vs ");
    const matchup = matchups.get(matchupKey) ?? { label: matchupNames.join(" vs "), count: 0 };
    matchup.count += 1;
    matchups.set(matchupKey, matchup);

    for (const side of sides) {
      coveredSides += 1;
      increment(leads, side.lead.key, side.lead.name);
      increment(latestReveals, side.latestReveal.toLocaleLowerCase(), side.latestReveal);
      totalSwitchIns += Math.max(0, side.entries.length - 1);
      if (side.pokemonNames.size >= 6) fullyRevealedSides += 1;

      for (const first of side.firstTurns.values()) {
        const row = firstAppearance.get(first.name.toLocaleLowerCase()) ?? { name: first.name, count: 0, turnTotal: 0, minTurn: first.turn, maxTurn: first.turn };
        row.count += 1;
        row.turnTotal += first.turn;
        row.minTurn = Math.min(row.minTurn, first.turn);
        row.maxTurn = Math.max(row.maxTurn, first.turn);
        firstAppearance.set(first.name.toLocaleLowerCase(), row);

        const never = neverSwitchedOut.get(first.name.toLocaleLowerCase()) ?? { name: first.name, seen: 0, never: 0 };
        never.seen += 1;
        if (!side.switchedOut.has(first.name.toLocaleLowerCase())) never.never += 1;
        neverSwitchedOut.set(first.name.toLocaleLowerCase(), never);
      }

      for (const entry of side.entries.slice(1)) increment(switchInsByPokemon, entry.key, entry.name);
    }
  }

  const sortedByCount = (map: Map<string, { name: string; count: number }>) => [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const sortedMatches = [...matchLeadRows].sort((a, b) => protocolSeasonNumber(a.match) - protocolSeasonNumber(b.match) || a.match.week - b.match.week || a.match.id - b.match.id);
  const matchupRows = [...matchups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 12);
  const firstAppearanceRows = [...firstAppearance.values()].sort((a, b) => b.count - a.count || (a.turnTotal / a.count) - (b.turnTotal / b.count) || a.name.localeCompare(b.name)).slice(0, 15);
  const neverSwitchedRows = [...neverSwitchedOut.values()].sort((a, b) => b.never - a.never || a.name.localeCompare(b.name)).slice(0, 15);

  const sideLabel = (side: ProtocolSideSummary) => {
    const team = teamForPlayer(side.match, side.player);
    return team ? team.teamName : side.player.toUpperCase();
  };

  return <section className="poke-card space-y-4 p-5 md:p-6">
    <div>
      <h3 className="font-pixel text-xs text-white">Replay protocol reports · Season 5 onward</h3>
      <p className="mt-2 max-w-4xl text-[10px] leading-5 text-[var(--foreground-muted)]">These reports are recalculated from the currently saved replay events whenever this page loads. Coverage counts a match only when both sides have a named opening switch event; missing protocol rows are excluded from the results, not treated as zero. Switch-ins include switch and forced-drag entries after the opening lead. A switch-out is a replacement before fainting or replay end.</p>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Eligible matches" value={number(eligibleMatches.length)} detail="Replay matches in Season 5+ filters" />
      <StatCard label="Protocol coverage" value={`${number(covered.length)} / ${number(eligibleMatches.length)}`} detail="Matches with both opening leads" />
      <StatCard label="Total switch-ins" value={number(totalSwitchIns)} detail="Later switch or drag entries" />
      <StatCard label="All six revealed" value={`${number(fullyRevealedSides)} / ${number(coveredSides)}`} detail="Covered team sides" />
    </div>
    {!eligibleMatches.length ? <p className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-[10px] text-[var(--foreground-muted)]">Choose Season 5 or later to see these protocol reports.</p> : null}
    {eligibleMatches.length > 0 && !covered.length ? <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[10px] text-amber-100">No Season 5+ matches in this filter have normalized opening switch events for both sides yet. Backfill or resave the replay data to add coverage.</p> : null}
    {covered.length ? <div className="grid gap-3 xl:grid-cols-2">
      <ProtocolReportTable title="First Pokémon sent out" headers={["Match", "Week", "Side", "Opening Pokémon"]} rows={sortedMatches.flatMap(({ match, sides }) => sides.map((side) => [<Link key={`${match.id}-${side.player}`} href={matchHref(match)} className="text-cyan-300 underline">#{match.id}</Link>, `${match.seasonName} · Week ${match.week}`, sideLabel(side), side.lead.name]))} emptyText="No covered opening leads." />
      <ProtocolReportTable title="Most common lead" headers={["Pokémon", "Opening leads", "Share of covered sides"]} rows={sortedByCount(leads).slice(0, 12).map((row) => [row.name, number(row.count), `${number(rate(row.count, coveredSides) * 100, 1)}%`])} emptyText="No covered opening leads." />
      <ProtocolReportTable title="Lead matchup frequency" headers={["Opposing lead pair", "Matches", "Share of covered matches"]} rows={matchupRows.map((row) => [row.label, number(row.count), `${number(rate(row.count, covered.length) * 100, 1)}%`])} emptyText="No covered lead matchups." />
      <ProtocolReportTable title="Turn of each Pokémon's first appearance" headers={["Pokémon", "Match-side appearances", "Average turn", "Range"]} rows={firstAppearanceRows.map((row) => [row.name, number(row.count), number(row.turnTotal / row.count, 1), `${row.minTurn}–${row.maxTurn}`])} emptyText="No named switch or drag entries." />
      <ProtocolReportTable title="Latest Pokémon revealed" headers={["Pokémon revealed last", "Covered sides"]} rows={sortedByCount(latestReveals).slice(0, 12).map((row) => [row.name, number(row.count)])} emptyText="No covered reveal order." />
      <ProtocolReportTable title="Most switch-ins by one Pokémon" headers={["Pokémon", "Later switch/drag entries"]} rows={sortedByCount(switchInsByPokemon).slice(0, 12).map((row) => [row.name, number(row.count)])} emptyText="No later switch or drag entries." />
      <ProtocolReportTable title="Pokémon that never switched out" headers={["Pokémon", "Never switched out", "Seen on covered sides"]} rows={neverSwitchedRows.map((row) => [row.name, number(row.never), number(row.seen)])} emptyText="No covered Pokémon appearances." />
      <ProtocolReportTable title="All six Pokémon revealed" headers={["Match", "Week", "Side", "Distinct Pokémon revealed", "Six?" ]} rows={sortedMatches.flatMap(({ match, sides }) => sides.map((side) => [<Link key={`${match.id}-${side.player}`} href={matchHref(match)} className="text-cyan-300 underline">#{match.id}</Link>, `${match.seasonName} · Week ${match.week}`, sideLabel(side), number(side.pokemonNames.size), side.pokemonNames.size >= 6 ? "Yes" : "No"]))} emptyText="No covered team sides." />
    </div> : null}
  </section>;
}

type FieldDurationRow = { name: string; type: string; activations: number; turns: number; intervals: number };
type HazardSummaryRow = { name: string; placements: number; removals: number; peakLayers: number };

const hazardLayerCaps: Record<string, number> = { stealthrock: 1, spikes: 3, toxicspikes: 2, stickyweb: 1 };
const hazardLabels: Record<string, string> = { stealthrock: "Stealth Rock", spikes: "Spikes", toxicspikes: "Toxic Spikes", stickyweb: "Sticky Web" };
const fieldConditionLabels: Record<string, string> = {
  raindance: "Rain",
  sunnyday: "Sun",
  desolateland: "Harsh sunlight",
  primordialsea: "Heavy rain",
  deltastream: "Strong winds",
  electricterrain: "Electric Terrain",
  grassyterrain: "Grassy Terrain",
  mistyterrain: "Misty Terrain",
  psychicterrain: "Psychic Terrain",
  lightscreen: "Light Screen",
  auroraveil: "Aurora Veil",
  trickroom: "Trick Room",
};
const screenNames = new Set(["reflect", "lightscreen", "auroraveil"]);
const terrainNames = new Set(["electricterrain", "grassyterrain", "mistyterrain", "psychicterrain"]);

function cleanFieldConditionName(value: string | null | undefined) {
  const cleaned = (value ?? "").replace(/^(?:move|ability):\s*/i, "").trim().replace(/\s+/g, " ");
  const key = cleaned.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  return { key, name: hazardLabels[key] ?? fieldConditionLabels[key] ?? cleaned };
}

function fieldEventName(event: ExperimentalBattleEvent) {
  if (event.fieldName?.trim()) return event.fieldName;
  const parts = event.rawLine.split("|");
  return event.eventType === "sidestart" || event.eventType === "sideend" ? parts[3] ?? "" : parts[2] ?? "";
}

function fieldEventSide(event: ExperimentalBattleEvent): "p1" | "p2" | null {
  return event.rawLine.match(/^\|-side(?:start|end)\|(p[12]):/i)?.[1]?.toLocaleLowerCase() as "p1" | "p2" | undefined ?? event.player;
}

function fieldConditionType(nameKey: string, protocolType: "side" | "field") {
  if (hazardLayerCaps[nameKey] !== undefined) return "Hazard";
  if (screenNames.has(nameKey)) return "Screen";
  if (nameKey === "tailwind") return "Speed control";
  if (nameKey === "trickroom") return "Room";
  if (protocolType === "field" && terrainNames.has(nameKey)) return "Terrain";
  return protocolType === "field" ? "Field effect" : "Side condition";
}

function FieldConditionReports({ matches }: { matches: ExperimentalMatch[] }) {
  const eligibleMatches = matches.filter((match) => protocolSeasonNumber(match) >= 5);
  const coveredMatches = eligibleMatches.filter((match) => buildProtocolSideSummary(match, "p1") && buildProtocolSideSummary(match, "p2"));
  const durationRowsByKey = new Map<string, FieldDurationRow>();
  const hazardRowsByKey = new Map<string, HazardSummaryRow>();
  const activationsByName = new Map<string, { name: string; count: number }>();
  const weatherTransitions = new Map<string, { from: string; to: string; count: number }>();
  const hazardPeaks: Array<{ match: ExperimentalMatch; side: "p1" | "p2"; layers: number }> = [];
  let weatherChanges = 0;
  let weatherActivations = 0;
  let fieldEventMatches = 0;
  let maximumHazardLayers = 0;

  const increment = (map: Map<string, { name: string; count: number }>, name: string) => {
    const key = name.toLocaleLowerCase();
    const row = map.get(key) ?? { name, count: 0 };
    row.count += 1;
    map.set(key, row);
  };

  for (const match of coveredMatches) {
    const events = [...match.battleEvents].sort((a, b) => a.sequence - b.sequence || a.turn - b.turn);
    const conditionEvents = events.filter((event) => ["weather", "fieldstart", "fieldend", "sidestart", "sideend"].includes(event.eventType));
    if (conditionEvents.length) fieldEventMatches += 1;

    const activeConditions = new Map<string, { name: string; type: string; startTurn: number }>();
    const hazardLayers = new Map<"p1" | "p2", Map<string, number>>();
    const sideHazardPeaks = new Map<"p1" | "p2", number>([["p1", 0], ["p2", 0]]);
    let activeWeather: { name: string; key: string; activeKey: string } | null = null;
    const finalTurn = Math.max(match.totalTurns ?? 0, ...events.map((event) => event.turn), 0);

    const durationKey = (type: string, name: string) => `${type}:${name.toLocaleLowerCase()}`;
    const closeCondition = (activeKey: string, turn: number, atReplayEnd = false) => {
      const active = activeConditions.get(activeKey);
      if (!active) return;
      const key = durationKey(active.type, active.name);
      const row = durationRowsByKey.get(key) ?? { name: active.name, type: active.type, activations: 0, turns: 0, intervals: 0 };
      row.turns += Math.max(1, turn - active.startTurn + (atReplayEnd ? 1 : 0));
      row.intervals += 1;
      durationRowsByKey.set(key, row);
      activeConditions.delete(activeKey);
    };
    const openCondition = (type: string, name: string, side: string, turn: number) => {
      const activeKey = `${type}:${side}:${name.toLocaleLowerCase().replace(/[^a-z0-9]/g, "")}`;
      closeCondition(activeKey, turn);
      const key = durationKey(type, name);
      const row = durationRowsByKey.get(key) ?? { name, type, activations: 0, turns: 0, intervals: 0 };
      row.activations += 1;
      durationRowsByKey.set(key, row);
      activeConditions.set(activeKey, { name, type, startTurn: turn });
      increment(activationsByName, name);
      return activeKey;
    };
    const totalHazardLayers = (side: "p1" | "p2") => [...(hazardLayers.get(side)?.values() ?? [])].reduce((sum, layers) => sum + layers, 0);
    const updateHazardPeak = (side: "p1" | "p2") => {
      const layers = totalHazardLayers(side);
      sideHazardPeaks.set(side, Math.max(sideHazardPeaks.get(side) ?? 0, layers));
      maximumHazardLayers = Math.max(maximumHazardLayers, layers);
    };
    const updateHazard = (nameKey: string, name: string, removed: boolean, side: "p1" | "p2" | null) => {
      const row = hazardRowsByKey.get(nameKey) ?? { name, placements: 0, removals: 0, peakLayers: 0 };
      if (removed) row.removals += 1;
      else row.placements += 1;
      hazardRowsByKey.set(nameKey, row);
      if (!side) return;
      const sideLayers = hazardLayers.get(side) ?? new Map<string, number>();
      const current = sideLayers.get(nameKey) ?? 0;
      if (removed) sideLayers.delete(nameKey);
      else sideLayers.set(nameKey, Math.min(hazardLayerCaps[nameKey], current + 1));
      hazardLayers.set(side, sideLayers);
      row.peakLayers = Math.max(row.peakLayers, sideLayers.get(nameKey) ?? 0);
      updateHazardPeak(side);
    };

    for (const event of conditionEvents) {
      const rawName = fieldEventName(event);
      const condition = cleanFieldConditionName(rawName);
      if (event.eventType === "weather") {
        const upkeep = event.rawLine.includes("[upkeep]") || event.metadata?.isUpkeep === true;
        if (upkeep) continue;
        if (!condition.key || condition.key === "none") {
          if (activeWeather) closeCondition(activeWeather.activeKey, event.turn);
          activeWeather = null;
          continue;
        }
        weatherActivations += 1;
        if (activeWeather && activeWeather.key !== condition.key) {
          weatherChanges += 1;
          const transitionKey = `${activeWeather.key}->${condition.key}`;
          const transition = weatherTransitions.get(transitionKey) ?? { from: activeWeather.name, to: condition.name, count: 0 };
          transition.count += 1;
          weatherTransitions.set(transitionKey, transition);
        }
        if (activeWeather) closeCondition(activeWeather.activeKey, event.turn);
        const activeKey = openCondition("Weather", condition.name, "global", event.turn);
        activeWeather = { name: condition.name, key: condition.key, activeKey };
        continue;
      }

      const isStart = event.eventType === "fieldstart" || event.eventType === "sidestart";
      const isSideCondition = event.eventType === "sidestart" || event.eventType === "sideend";
      const side = isSideCondition ? fieldEventSide(event) : null;
      const type = fieldConditionType(condition.key, isSideCondition ? "side" : "field");
      const activeKey = `${type}:${side ?? "global"}:${condition.key}`;
      const isHazard = hazardLayerCaps[condition.key] !== undefined;
      if (isHazard) updateHazard(condition.key, condition.name, !isStart, side);

      if (isStart) {
        if (!isHazard || !activeConditions.has(activeKey)) openCondition(type, condition.name, side ?? "global", event.turn);
      } else {
        closeCondition(activeKey, event.turn);
      }
    }

    for (const [activeKey] of activeConditions) closeCondition(activeKey, finalTurn, true);
    for (const side of ["p1", "p2"] as const) {
      const layers = sideHazardPeaks.get(side) ?? 0;
      if (layers) hazardPeaks.push({ match, side, layers });
    }
  }

  const durationRows = [...durationRowsByKey.values()].sort((a, b) => b.turns - a.turns || a.name.localeCompare(b.name));
  const hazardRows = [...hazardRowsByKey.values()].sort((a, b) => b.placements - a.placements || a.name.localeCompare(b.name));
  const activationRows = [...activationsByName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const transitionRows = [...weatherTransitions.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  const fieldConditionTurns = durationRows.reduce((sum, row) => sum + row.turns, 0);
  const totalOfType = (type: string, field: "activations" | "turns") => durationRows.filter((row) => row.type === type).reduce((sum, row) => sum + row[field], 0);
  const activationCount = (name: string) => activationsByName.get(name.toLocaleLowerCase())?.count ?? 0;
  const maxHazardRows = hazardPeaks.sort((a, b) => b.layers - a.layers || a.match.id - b.match.id).slice(0, 12);

  const metricCards = [
    { label: "Weather activations", value: weatherActivations, detail: "Non-upkeep weather starts" },
    { label: "Weather changes", value: weatherChanges, detail: "Transitions between active weather types" },
    { label: "Weather duration", value: totalOfType("Weather", "turns"), detail: "Recorded weather turn spans" },
    { label: "Terrain activations", value: totalOfType("Terrain", "activations"), detail: "Terrain field-start events" },
    { label: "Terrain duration", value: totalOfType("Terrain", "turns"), detail: "Recorded terrain turn spans" },
    { label: "Entry hazards placed", value: hazardRows.reduce((sum, row) => sum + row.placements, 0), detail: "Hazard placement events" },
    { label: "Maximum hazard layers", value: maximumHazardLayers, detail: "Peak on either side in a match" },
    { label: "Hazards removed", value: hazardRows.reduce((sum, row) => sum + row.removals, 0), detail: "Recorded hazard removal events" },
    { label: "Reflect activations", value: activationCount("Reflect"), detail: "Side-start events" },
    { label: "Light Screen activations", value: activationCount("Light Screen"), detail: "Side-start events" },
    { label: "Aurora Veil activations", value: activationCount("Aurora Veil"), detail: "Side-start events" },
    { label: "Tailwind activations", value: activationCount("Tailwind"), detail: "Side-start events" },
    { label: "Trick Room activations", value: activationCount("Trick Room"), detail: "Field or side-start events" },
    { label: "Field-condition duration", value: fieldConditionTurns, detail: "Condition-turns; overlapping effects count separately" },
  ];

  return <section className="poke-card space-y-4 p-5 md:p-6">
    <div>
      <h3 className="font-pixel text-xs text-white">Field-condition reports · Season 5 onward</h3>
      <p className="mt-2 max-w-4xl text-[10px] leading-5 text-[var(--foreground-muted)]">Counts come from saved weather, field, and side-condition protocol events in matches with both opening leads covered. Durations use the turn span between activation and end; effects still active at replay end are counted through the last recorded turn. Overlapping conditions each contribute their own condition-turns. Values recalculate from saved replay events on page load.</p>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
      <StatCard label="Eligible matches" value={number(eligibleMatches.length)} detail="Season 5+ matches in the filters" />
      <StatCard label="Replay coverage" value={`${number(coveredMatches.length)} / ${number(eligibleMatches.length)}`} detail="Both opening leads recorded" />
      <StatCard label="Matches with field events" value={number(fieldEventMatches)} detail="At least one field or side event" />
      {metricCards.map((card) => <StatCard key={card.label} label={card.label} value={number(card.value)} detail={card.detail} />)}
    </div>
    {!eligibleMatches.length ? <p className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-[10px] text-[var(--foreground-muted)]">Choose Season 5 or later to see these field-condition reports.</p> : null}
    {eligibleMatches.length > 0 && !coveredMatches.length ? <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[10px] text-amber-100">No Season 5+ matches in this filter have normalized opening switch events for both sides yet. Backfill or resave replay data to add coverage.</p> : null}
    {coveredMatches.length ? <div className="grid gap-3 xl:grid-cols-2">
      <ProtocolReportTable title="Weather changes" headers={["From", "To", "Transitions"]} rows={transitionRows.map((row) => [row.from, row.to, number(row.count)])} emptyText="No transitions between active weather types were recorded." />
      <ProtocolReportTable title="Weather, terrain, and field-condition duration" headers={["Condition", "Type", "Starts", "Turn spans", "Average"]} rows={durationRows.slice(0, 24).map((row) => [row.name, row.type, number(row.activations), number(row.turns), row.intervals ? number(row.turns / row.intervals, 1) : "—"])} emptyText="No condition start events were recorded." />
      <ProtocolReportTable title="Entry hazards placed and removed" headers={["Hazard", "Placed", "Removed", "Peak layers"]} rows={hazardRows.map((row) => [row.name, number(row.placements), number(row.removals), number(row.peakLayers)])} emptyText="No recognized entry-hazard events were recorded." />
      <ProtocolReportTable title="Screens, Tailwind, and Trick Room activations" headers={["Condition", "Activations"]} rows={activationRows.filter((row) => ["reflect", "lightscreen", "auroraveil", "tailwind", "trick room"].includes(row.name.toLocaleLowerCase())).map((row) => [row.name, number(row.count)])} emptyText="No screen, Tailwind, or Trick Room start events were recorded." />
      <ProtocolReportTable title="Peak hazard layers by match side" headers={["Match", "Season / week", "Side", "Peak layers"]} rows={maxHazardRows.map(({ match, side, layers }) => {
        const team = teamForPlayer(match, side);
        return [<Link key={`${match.id}-${side}`} href={matchHref(match)} className="text-cyan-300 underline">#{match.id}</Link>, `${match.seasonName} · Week ${match.week}`, team?.teamName ?? side.toUpperCase(), number(layers)];
      })} emptyText="No hazard layers were recorded." />
    </div> : null}
  </section>;
}

export function TeamStatsReport({ matches, selectedTeamIds, seasonTeams }: { matches: ExperimentalMatch[]; selectedTeamIds: number[]; seasonTeams: SeasonTeam[] }) {
  const rows = buildTeamStats(matches, new Set(selectedTeamIds));
  const [sortKey, setSortKey] = useState<TeamSortKey>("wins");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const seasonTeamById = new Map(seasonTeams.map((team) => [team.seasonCoachId, team]));
  const predecessorByReplacementId = new Map(seasonTeams.filter((team) => team.replacedById !== null).map((team) => [team.replacedById as number, team]));
  const stintStatus = (team: TeamRef) => {
    const predecessor = predecessorByReplacementId.get(team.seasonCoachId);
    if (predecessor) return `Joined as replacement for ${predecessor.teamName} (${predecessor.coachName})`;
    const successor = team.replacedById ? seasonTeamById.get(team.replacedById) : null;
    if (successor) return `Dropped; replaced by ${successor.teamName} (${successor.coachName})`;
    return "Full/current team stint";
  };
  const eventCoveredTeams = rows.filter((row) => row.eventGames > 0).length;
  const sortValue = (row: TeamStatsRow): string | number | null => {
    if (sortKey === "team") return row.team.teamName;
    if (sortKey === "games") return row.games;
    if (sortKey === "wins") return row.wins;
    if (sortKey === "winRate") return row.games ? row.wins / row.games : null;
    if (sortKey === "damageFor") return row.damageForGames ? row.damageFor / row.damageForGames : null;
    if (sortKey === "damageAgainst") return row.damageAgainstGames ? row.damageAgainst / row.damageAgainstGames : null;
    if (sortKey === "differential") return row.damageForGames && row.damageAgainstGames ? row.damageFor / row.damageForGames - row.damageAgainst / row.damageAgainstGames : null;
    if (sortKey === "kills") return row.games ? row.kills / row.games : null;
    if (sortKey === "deaths") return row.games ? row.deaths / row.games : null;
    if (sortKey === "damageActiveTurn") return row.turnsActive && row.turnsGames && row.damageForGames ? row.damageFor / row.turnsActive : null;
    if (sortKey === "firstFaint") return row.firstFaintGames ? row.firstFaintFor / row.firstFaintGames : null;
    if (sortKey === "switches") return row.eventGames ? row.switches : null;
    return row.eventGames ? row.teraUses : null;
  };
  const sortedRows = [...rows].sort((left, right) => {
    const leftValue = sortValue(left);
    const rightValue = sortValue(right);
    if (leftValue === null && rightValue === null) return left.team.teamName.localeCompare(right.team.teamName);
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    const comparison = typeof leftValue === "string" && typeof rightValue === "string"
      ? leftValue.localeCompare(rightValue)
      : Number(leftValue) - Number(rightValue);
    return (sortDirection === "asc" ? comparison : -comparison) || left.team.teamName.localeCompare(right.team.teamName);
  });
  const changeSort = (nextKey: TeamSortKey) => {
    if (sortKey === nextKey) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "team" ? "asc" : "desc");
    }
  };
  const exportRows = [
    ["Team", "Coach", "Stint status", "Games", "Wins", "Losses", "Win rate", "Damage for/game", "Damage against/game", "Damage differential/game", "KOs/game", "Deaths/game", "Damage/active turn", "First faint for-against", "Switch/drag events", "Tera uses", "Event coverage"],
    ...sortedRows.map((row) => [
      row.team.teamName,
      row.team.coachName,
      stintStatus(row.team),
      row.games,
      row.wins,
      row.games - row.wins,
      `${number(rate(row.wins, row.games) * 100, 1)}%`,
      perGame(row.damageFor, row.damageForGames, 1),
      perGame(row.damageAgainst, row.damageAgainstGames, 1),
      row.damageForGames && row.damageAgainstGames ? number(row.damageFor / row.damageForGames - row.damageAgainst / row.damageAgainstGames, 1) : "",
      perGame(row.kills, row.games, 2),
      perGame(row.deaths, row.games, 2),
      row.turnsActive && row.turnsGames && row.damageForGames ? number(row.damageFor / row.turnsActive, 2) : "",
      row.firstFaintGames ? `${row.firstFaintFor}-${row.firstFaintAgainst}` : "",
      row.eventGames ? row.switches : "",
      row.eventGames ? row.teraUses : "",
      row.eventGames,
    ]),
  ];

  return <section className="space-y-4">
    <div className="poke-card border-cyan-400/20 bg-cyan-500/[0.03] p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-pixel text-sm text-white">Team Stats</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">Season- and division-specific team rows covering offense, defense, and battle control. Team totals use all saved Pokémon in the filtered matches; event metrics only use attributed normalized events.</p><p className="mt-2 max-w-3xl rounded-lg border border-cyan-400/20 bg-cyan-400/[0.05] px-3 py-2 text-[10px] leading-4 text-[var(--foreground-muted)]"><strong className="text-cyan-100">Scope:</strong> each row is one team&apos;s side of the matchup set selected by the shared filters and search. Values summarize that side across every selected matchup. A coach or team search narrows the matchups first; the opponent remains as a separate row for comparison.</p></div>
        <button type="button" onClick={() => downloadCsv("pbo-team-stats.csv", exportRows)} className="btn-retro-secondary px-3 py-2 text-[9px]">CSV</button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Teams" value={number(rows.length)} /><StatCard label="Filtered matches" value={number(matches.length)} /><StatCard label="Damage coverage" value={number(new Set(rows.flatMap((row) => row.damageForGames ? [row.team.seasonCoachId] : [])).size)} detail="Teams with recorded damage" /><StatCard label="Event coverage" value={number(eventCoveredTeams)} detail="Teams with attributed events" /></div>
    </div>

    <div className="poke-card p-5 md:p-6">
      <div className="mb-4"><h3 className="font-pixel text-xs text-white">Offense, defense, and control</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Damage and recovery are reported only when the underlying match fields were saved. Replacement stints remain separate here so each coach keeps only the games they played; official standings may roll predecessor results into the active franchise.</p></div>
      {rows.length ? <div className="mobile-scroll-region overflow-x-auto rounded-xl border border-[var(--border)]" tabIndex={0} aria-label="Team statistics table"><table className="w-full min-w-[1280px] text-xs"><thead className="bg-[var(--background)] text-[9px] uppercase text-[var(--foreground-muted)]"><tr><SortableHeader label="Team" sortKey="team" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} align="left" /><SortableHeader label="GP" sortKey="games" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="Record" sortKey="wins" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="Win rate" sortKey="winRate" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="DMG for / G" sortKey="damageFor" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="DMG against / G" sortKey="damageAgainst" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="Diff / G" sortKey="differential" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="KOs / G" sortKey="kills" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="Deaths / G" sortKey="deaths" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="DMG / active turn" sortKey="damageActiveTurn" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="First faint" sortKey="firstFaint" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="Switches" sortKey="switches" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /><SortableHeader label="Tera" sortKey="teraUses" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} /></tr></thead><tbody>{sortedRows.map((row) => { const differential = row.damageForGames && row.damageAgainstGames ? row.damageFor / row.damageForGames - row.damageAgainst / row.damageAgainstGames : null; return <tr key={row.team.seasonCoachId} className="border-t border-[var(--border)] text-center"><td className="p-3 text-left"><div className="font-bold text-white">{row.team.teamName}</div><div className="text-[10px] text-[var(--foreground-muted)]">{row.team.coachName}</div><div className={`mt-1 text-[9px] ${row.team.replacedById || predecessorByReplacementId.has(row.team.seasonCoachId) ? "text-amber-300" : "text-[var(--foreground-subtle)]"}`}>{stintStatus(row.team)}</div></td><td>{row.games}</td><td>{row.wins}-{row.games - row.wins}</td><td>{number(rate(row.wins, row.games) * 100, 1)}%</td><td>{perGame(row.damageFor, row.damageForGames, 1)}</td><td>{perGame(row.damageAgainst, row.damageAgainstGames, 1)}</td><td className={differential !== null && differential >= 0 ? "text-emerald-300" : "text-red-300"}>{differential === null ? "—" : number(differential, 1)}</td><td>{perGame(row.kills, row.games, 2)}</td><td>{perGame(row.deaths, row.games, 2)}</td><td>{row.turnsActive && row.turnsGames && row.damageForGames ? number(row.damageFor / row.turnsActive, 2) : "—"}</td><td>{row.firstFaintGames ? `${row.firstFaintFor}-${row.firstFaintAgainst}` : "—"}</td><td>{row.eventGames ? row.switches : "—"}</td><td>{row.eventGames ? row.teraUses : "—"}</td></tr>; })}</tbody></table></div> : <p className="text-xs text-[var(--foreground-muted)]">No team rows match the active filters.</p>}
    </div>
    <ProtocolReplayReports matches={matches} />
    <FieldConditionReports matches={matches} />
  </section>;
}

export function buildTopPlays(matches: ExperimentalMatch[]) {
  const hpSwings: TopPlayRecord[] = [];
  const comebacks: TopPlayRecord[] = [];
  const latestFaints: TopPlayRecord[] = [];
  const longestAppearances: TopPlayRecord[] = [];

  for (const match of matches) {
    const snapshots = [...match.turnSnapshots].sort((a, b) => a.turn - b.turn);
    for (let index = 1; index < snapshots.length; index += 1) {
      const previous = snapshots[index - 1];
      const current = snapshots[index];
      const candidates = [
        { player: "p1" as const, loss: previous.p1TotalHp - current.p1TotalHp },
        { player: "p2" as const, loss: previous.p2TotalHp - current.p2TotalHp },
      ].filter((candidate) => candidate.loss > 0);
      for (const candidate of candidates) {
        const team = teamForPlayer(match, candidate.player);
        if (!team) continue;
        hpSwings.push({ category: "HP swing", turn: current.turn, value: candidate.loss / 6, valueLabel: `${number(candidate.loss / 6, 1)}% HP`, detail: `${team.teamName} lost team HP at turn ${current.turn}`, match });
      }
    }

    if (match.p1IsCoach1 !== null && match.winnerId !== null && snapshots.length) {
      const winnerIsCoach1 = match.winnerId === match.coach1.seasonCoachId;
      const winner = winnerIsCoach1 ? match.coach1 : match.coach2;
      const loser = winnerIsCoach1 ? match.coach2 : match.coach1;
      const winnerIsP1 = winnerIsCoach1 === match.p1IsCoach1;
      const lowPoint = snapshots.map((snapshot) => ({ snapshot, lead: winnerIsP1 ? snapshot.p1TotalHp - snapshot.p2TotalHp : snapshot.p2TotalHp - snapshot.p1TotalHp })).sort((a, b) => a.lead - b.lead)[0];
      if (lowPoint && lowPoint.lead < 0) comebacks.push({ category: "Comeback", turn: lowPoint.snapshot.turn, value: -lowPoint.lead / 6, valueLabel: `${number(-lowPoint.lead / 6, 1)}% deficit`, detail: `${winner.teamName} overcame ${loser.teamName} at turn ${lowPoint.snapshot.turn}`, match });
    }

    const faint = latestFaint(match);
    if (faint?.player) {
      const victimTeam = teamForPlayer(match, faint.player);
      latestFaints.push({ category: "Latest faint", turn: faint.turn, value: faint.turn, valueLabel: `Turn ${faint.turn}`, detail: `${faint.pokemon ?? "Pokemon"} from ${victimTeam?.teamName ?? "unknown team"}${faint.killer ? ` · ${faint.killer}${faint.move ? ` with ${faint.move}` : ""}` : ""}`, pokemon: spritesForPokemonNames(match, [faint.pokemon, faint.killer]), match });
    }

    for (const appearance of match.pokemon) {
      if (appearance.turnsActive === null) continue;
      const team = appearance.seasonCoachId === match.coach1.seasonCoachId ? match.coach1 : match.coach2;
      longestAppearances.push({ category: "Longest active", value: appearance.turnsActive, valueLabel: `${number(appearance.turnsActive)} turns`, detail: `${appearance.pokemonName} · ${team.teamName}`, pokemon: [{ name: appearance.pokemonName, spriteUrl: appearance.spriteUrl }], match });
    }
  }

  return {
    hpSwings: hpSwings.sort((a, b) => b.value - a.value),
    comebacks: comebacks.sort((a, b) => b.value - a.value),
    latestFaints: latestFaints.sort((a, b) => b.value - a.value),
    longestAppearances: longestAppearances.sort((a, b) => b.value - a.value),
  };
}

function TopPlayList({ title, description, records }: { title: string; description: string; records: TopPlayRecord[] }) {
  const [visibleCount, setVisibleCount] = useState(5);
  const [onePerMatch, setOnePerMatch] = useState(false);
  const seen = new Set<number>();
  const ranked = records.filter((record) => {
    if (!onePerMatch) return true;
    if (seen.has(record.match.id)) return false;
    seen.add(record.match.id);
    return true;
  });
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
    <h3 className="font-pixel text-xs text-white">{title}</h3>
    <p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">{description}</p>
    <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={onePerMatch} onChange={(event) => { setOnePerMatch(event.target.checked); setVisibleCount(5); }} />One record per match</label>
    <p className="mt-2 text-xs text-[var(--foreground-muted)]" aria-live="polite">Showing {Math.min(visibleCount, ranked.length)} of {ranked.length} records</p>
    {ranked.length ? <ol className="mt-4 space-y-2">{ranked.slice(0, visibleCount).map((record, index) => {
      const query = new URLSearchParams({ season: String(record.match.seasonId), match: String(record.match.id) });
      if (record.match.isDemo) query.set("demo", "1");
      if (record.turn !== undefined) query.set("turn", String(record.turn));
      const battleHref = `/experimental-stats/battle-visualizer?${query}${record.turn !== undefined ? "#battle-turn" : ""}`;
      const sprites = record.pokemon?.filter((pokemon) => pokemon.spriteUrl).slice(0, 2) ?? [];
      return <li key={`${record.match.id}-${record.detail}-${index}`} className="rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-3">
        <div className="flex items-start gap-3"><span className="font-mono text-xs text-[var(--foreground-muted)]">#{index + 1}</span><div className="flex min-w-0 flex-1 items-start gap-2">{sprites.length ? <div className="flex shrink-0 items-center gap-0.5 pt-0.5" aria-label={`Pokémon involved: ${sprites.map((pokemon) => pokemon.name).join(", ")}`}>{sprites.map((pokemon) => <Image key={`${pokemon.name}-${pokemon.spriteUrl}`} src={pokemon.spriteUrl as string} alt={`${pokemon.name} sprite`} title={pokemon.name} width={32} height={32} className="h-8 w-8 object-contain" />)}</div> : null}<div className="min-w-0 flex-1"><strong className="block break-words text-xs text-white">{record.detail}</strong><span className="text-xs text-[var(--foreground-muted)]">{record.match.coach1.teamName} vs {record.match.coach2.teamName} · {record.match.seasonName} · {record.match.divisionName} · Week {record.match.week}</span></div></div><span className="shrink-0 font-mono text-xs font-black text-violet-300">{record.valueLabel}</span></div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs"><Link href={matchHref(record.match)} className="text-cyan-300 underline">Match details</Link><Link href={battleHref} className="text-violet-300 underline">{record.turn !== undefined ? `View turn ${record.turn}` : "View battle"}</Link></div>
      </li>;
    })}</ol> : <p className="mt-4 text-xs text-[var(--foreground-muted)]">No saved evidence is available in this scope.</p>}
    <div className="mt-4 flex gap-3">{visibleCount < ranked.length ? <button type="button" onClick={() => setVisibleCount((count) => count + 10)} className="btn-retro-secondary px-3 py-2 text-xs" aria-label={`Show more ${title.toLowerCase()}`}>Show more</button> : null}{visibleCount > 5 ? <button type="button" onClick={() => setVisibleCount(5)} className="px-3 py-2 text-xs text-cyan-300 underline">Show fewer</button> : null}</div>
  </div>;
}

export function TopPlaysReport({ matches }: { matches: ExperimentalMatch[] }) {
  const records = buildTopPlays(matches);
  const allRecords = [...records.hpSwings, ...records.comebacks, ...records.latestFaints, ...records.longestAppearances];
  const exportRows = [["Category", "Value", "Detail", "Match", "Season", "Division", "Week"], ...allRecords.map((record) => [record.category, record.valueLabel, record.detail, `${record.match.coach1.teamName} vs ${record.match.coach2.teamName}`, record.match.seasonName, record.match.divisionName, record.match.week])];
  const timelineMatches = matches.filter((match) => match.turnSnapshots.length > 1).length;
  const faintMatches = matches.filter((match) => firstFaint(match)).length;

  return <section className="space-y-4">
    <div className="poke-card border-fuchsia-400/20 bg-fuchsia-500/[0.03] p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Top Plays</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">Replay-linked records from saved turn snapshots and faint events. This report focuses on individual battle moments, not aggregate leaderboards.</p></div><button type="button" onClick={() => downloadCsv("pbo-top-plays.csv", exportRows)} className="btn-retro-secondary px-3 py-2 text-[9px]">CSV</button></div><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Filtered matches" value={number(matches.length)} /><StatCard label="HP-swing coverage" value={number(timelineMatches)} detail="Matches with turn snapshots" /><StatCard label="Faint coverage" value={number(faintMatches)} detail="Matches with a mapped first faint" /><StatCard label="Evidence records" value={number(allRecords.length)} /></div></div>
    <div className="grid gap-4 xl:grid-cols-2"><TopPlayList title="Biggest HP swings" description="Largest saved turn-to-turn loss in team HP, shown as a percentage of a six-Pokemon team total." records={records.hpSwings} /><TopPlayList title="Biggest comebacks" description="Largest recorded team-HP deficit overcome by the eventual winner." records={records.comebacks} /><TopPlayList title="Latest faint turns" description="Latest final knockout based on the last mapped faint event in a replay." records={records.latestFaints} /><TopPlayList title="Longest active appearances" description="Pokemon with the most saved turns active in one battle." records={records.longestAppearances} /></div>
  </section>;
}
