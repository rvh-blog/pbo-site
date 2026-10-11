"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ExperimentalBattleEvent, ExperimentalMatch } from "./experimental-stats-client";

type Side = "p1" | "p2";
type MetricCounts = {
  itemsConsumed: number;
  itemsKnockedOff: number;
  itemsStolen: number;
  itemsExchanged: number;
  berriesActivated: number;
  focusSashActivations: number;
  airBalloonPops: number;
  leftoversRecoveries: number;
  abilitiesRevealed: number;
  abilityActivations: number;
  abilitiesCopied: number;
  abilitiesSwapped: number;
  intimidateActivations: number;
};

type SeasonCoverage = { seasonNumber: number; seasonName: string; matches: number; covered: number; counts: MetricCounts; revealTurns: number[] };
type DivisionCoverage = { divisionId: number; divisionName: string; displayOrder: number; matches: number; covered: number; counts: MetricCounts; revealTurns: number[] };
type ChartMetricKey = keyof MetricCounts | "abilityRevealTurn";
type EvidenceRow = {
  key: string;
  match: ExperimentalMatch;
  turn: number;
  sequence: number;
  team: string;
  actor: string;
  pokemon: string;
  item: string;
  ability: string;
  metrics: Set<string>;
};

const emptyCounts = (): MetricCounts => ({
  itemsConsumed: 0,
  itemsKnockedOff: 0,
  itemsStolen: 0,
  itemsExchanged: 0,
  berriesActivated: 0,
  focusSashActivations: 0,
  airBalloonPops: 0,
  leftoversRecoveries: 0,
  abilitiesRevealed: 0,
  abilityActivations: 0,
  abilitiesCopied: 0,
  abilitiesSwapped: 0,
  intimidateActivations: 0,
});

const chartMetrics: Array<{ key: ChartMetricKey; label: string; kind: "count" | "turn" }> = [
  { key: "itemsConsumed", label: "Items consumed", kind: "count" },
  { key: "itemsKnockedOff", label: "Items knocked off", kind: "count" },
  { key: "itemsStolen", label: "Items stolen", kind: "count" },
  { key: "itemsExchanged", label: "Items exchanged", kind: "count" },
  { key: "berriesActivated", label: "Berries activated", kind: "count" },
  { key: "focusSashActivations", label: "Focus Sash activations", kind: "count" },
  { key: "airBalloonPops", label: "Air Balloon pops", kind: "count" },
  { key: "leftoversRecoveries", label: "Leftovers recovery activations", kind: "count" },
  { key: "abilitiesRevealed", label: "Abilities revealed", kind: "count" },
  { key: "abilityRevealTurn", label: "Ability reveal turn", kind: "turn" },
  { key: "abilityActivations", label: "Ability activations", kind: "count" },
  { key: "abilitiesCopied", label: "Abilities copied", kind: "count" },
  { key: "abilitiesSwapped", label: "Abilities swapped", kind: "count" },
  { key: "intimidateActivations", label: "Intimidate activations", kind: "count" },
];

const normalize = (value: string | null | undefined) => (value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
const rawParts = (event: ExperimentalBattleEvent) => event.rawLine.split("|");
const rawItemName = (event: ExperimentalBattleEvent) => event.itemName?.trim() || rawParts(event)[3]?.trim() || "";
const rawAbilityName = (event: ExperimentalBattleEvent) => {
  if (event.abilityName?.trim()) return event.abilityName.trim();
  const parts = rawParts(event);
  if (event.eventType === "ability") return parts[3]?.trim() || "";
  return parts.slice(3).map((part) => part.match(/^ability:\s*(.+)$/i)?.[1]?.trim()).find(Boolean) ?? "";
};
const sourceText = (event: ExperimentalBattleEvent) => event.rawLine.match(/\[from\]\s*([^|\]]+)/i)?.[1]?.trim() ?? "";
const sourceMove = (event: ExperimentalBattleEvent) => sourceText(event).match(/^move:\s*(.+)$/i)?.[1]?.trim() ?? "";
const activatedMove = (event: ExperimentalBattleEvent) => rawParts(event).slice(3).map((part) => part.match(/^move:\s*(.+)$/i)?.[1]?.trim()).find(Boolean) ?? "";
const sourceAbility = (event: ExperimentalBattleEvent) => sourceText(event).match(/^ability:\s*(.+)$/i)?.[1]?.trim() ?? "";
const actorFromEvent = (event: ExperimentalBattleEvent) => {
  const nickname = event.actorNickname?.trim();
  if (nickname) return nickname;
  return rawParts(event)[2]?.match(/^p[12]a?:\s*(.+)$/i)?.[1]?.trim() ?? "Unknown Pokémon";
};
const sideFromEvent = (event: ExperimentalBattleEvent): Side | null => {
  if (event.player) return event.player;
  const side = rawParts(event)[2]?.match(/^(p[12])a?:/i)?.[1]?.toLowerCase();
  return side === "p1" || side === "p2" ? side : null;
};

function seasonNumberFromMatch(match: ExperimentalMatch) {
  if (typeof match.seasonNumber === "number") return match.seasonNumber;
  return Number(match.seasonName.match(/(?:season|s)\s*(\d+)/i)?.[1] ?? 0);
}

function teamForSide(match: ExperimentalMatch, side: Side | null) {
  if (!side || match.p1IsCoach1 === null) return null;
  const sideIsCoach1 = side === "p1" ? match.p1IsCoach1 : !match.p1IsCoach1;
  return sideIsCoach1 ? match.coach1 : match.coach2;
}

function formatPercent(numerator: number, denominator: number) {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><div className="font-mono text-xl font-black text-white">{value}</div><div className="mt-1 text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">{label}</div><p className="mt-2 text-[10px] leading-4 text-[var(--foreground-subtle)]">{detail}</p></div>;
}

export function ItemAbilityEventsReport({ matches, seasons, divisions, selectedSeasonId, selectedDivisionId }: {
  matches: ExperimentalMatch[];
  seasons: Array<{ id: number; name: string; seasonNumber: number }>;
  divisions: Array<{ id: number; seasonId: number; name: string; displayOrder: number }>;
  selectedSeasonId: number | "all";
  selectedDivisionId: number | "all";
}) {
  const [selectedChartMetric, setSelectedChartMetric] = useState<ChartMetricKey>("itemsConsumed");
  const [selectedChartGroup, setSelectedChartGroup] = useState<"season" | "division">("season");
  const report = useMemo(() => {
    const coverage = new Map<number, SeasonCoverage>(seasons
      .filter((season) => season.seasonNumber >= 5 && (selectedSeasonId === "all" || season.id === selectedSeasonId))
      .map((season) => [season.seasonNumber, { seasonNumber: season.seasonNumber, seasonName: season.name, matches: 0, covered: 0, counts: emptyCounts(), revealTurns: [] }]));
    const divisionCoverage = new Map<number, DivisionCoverage>(divisions
      .filter((division) => selectedSeasonId !== "all" && division.seasonId === selectedSeasonId)
      .map((division) => [division.id, { divisionId: division.id, divisionName: division.name, displayOrder: division.displayOrder, matches: 0, covered: 0, counts: emptyCounts(), revealTurns: [] }]));
    const totals = emptyCounts();
    const revealTurns: number[] = [];
    const evidenceByEvent = new Map<string, EvidenceRow>();
    let totalMatches = 0;
    let coveredMatches = 0;

    for (const match of matches) {
      const seasonNumber = seasonNumberFromMatch(match);
      if (seasonNumber < 5) continue;
      const season = coverage.get(seasonNumber) ?? { seasonNumber, seasonName: match.seasonName, matches: 0, covered: 0, counts: emptyCounts(), revealTurns: [] };
      season.matches += 1;
      coverage.set(seasonNumber, season);
      const division = selectedSeasonId === "all" ? null : divisionCoverage.get(match.divisionId) ?? {
        divisionId: match.divisionId,
        divisionName: match.divisionName,
        displayOrder: Number.MAX_SAFE_INTEGER,
        matches: 0,
        covered: 0,
        counts: emptyCounts(),
        revealTurns: [],
      };
      if (division) {
        division.matches += 1;
        divisionCoverage.set(match.divisionId, division);
      }
      totalMatches += 1;

      const events = [...match.battleEvents].sort((a, b) => a.sequence - b.sequence);
      if (!events.some((event) => event.eventType === "move")) continue;
      season.covered += 1;
      if (division) division.covered += 1;
      coveredMatches += 1;

      const speciesByActor = new Map<string, string>();
      const revealedAbilityByActor = new Set<string>();
      const increment = (key: keyof MetricCounts) => {
        totals[key] += 1;
        season.counts[key] += 1;
        if (division) division.counts[key] += 1;
      };
      const addEvidence = (event: ExperimentalBattleEvent, metric: string, itemName = "", abilityName = "") => {
        const side = sideFromEvent(event);
        const actor = actorFromEvent(event);
        const actorKey = side ? `${side}:${actor.toLocaleLowerCase()}` : actor.toLocaleLowerCase();
        const key = `${match.id}:${event.sequence}`;
        const existing = evidenceByEvent.get(key) ?? {
          key,
          match,
          turn: event.turn,
          sequence: event.sequence,
          team: teamForSide(match, side)?.teamName ?? (side ? `${side.toUpperCase()} side` : "Team unavailable"),
          actor,
          pokemon: speciesByActor.get(actorKey) || event.pokemonName || actor,
          item: "",
          ability: "",
          metrics: new Set<string>(),
        };
        existing.metrics.add(metric);
        if (itemName) existing.item = itemName;
        if (abilityName) existing.ability = abilityName;
        evidenceByEvent.set(key, existing);
      };

      for (const event of events) {
        const side = sideFromEvent(event);
        const nickname = actorFromEvent(event);
        const actorKey = side ? `${side}:${nickname.toLocaleLowerCase()}` : null;
        if (actorKey && ["switch", "drag", "replace", "formechange", "detailschange"].includes(event.eventType) && event.pokemonName) {
          speciesByActor.set(actorKey, event.pokemonName);
          continue;
        }

        const item = rawItemName(event);
        const normalizedItem = normalize(item);
        const moveSource = normalize(sourceMove(event));
        const activatedMoveName = normalize(activatedMove(event));
        const abilitySource = normalize(sourceAbility(event));

        const hasEatTag = /\[eat\]/i.test(event.rawLine);
        const hasWeakenTag = /\[weaken\]/i.test(event.rawLine);
        const isItemConsumption = event.eventType === "enditem" && (
          hasEatTag || ["fling", "naturalgift", "incinerate"].includes(moveSource) || (!sourceText(event) && !hasWeakenTag)
        );
        if (isItemConsumption) {
          increment("itemsConsumed");
          addEvidence(event, "Consumed", item);
        }
        if (event.eventType === "enditem" && /berry$/i.test(item) && (hasEatTag || moveSource === "naturalgift")) {
          increment("berriesActivated");
          addEvidence(event, "Berry activated", item);
        }
        if (event.eventType === "enditem" && moveSource === "knockoff") {
          increment("itemsKnockedOff");
          addEvidence(event, "Knocked off", item);
        }
        if (event.eventType === "item" && ((moveSource === "thief" || moveSource === "covet") || (abilitySource === "magician" || abilitySource === "pickpocket"))) {
          increment("itemsStolen");
          addEvidence(event, "Stolen", item);
        }
        if (event.eventType === "item" && (moveSource === "trick" || moveSource === "switcheroo")) {
          increment("itemsExchanged");
          addEvidence(event, "Exchanged", item);
        }
        if (event.eventType === "enditem" && normalizedItem === "focussash" && !/\[from\]/i.test(event.rawLine)) {
          increment("focusSashActivations");
          addEvidence(event, "Focus Sash activated", item);
        }
        if (event.eventType === "enditem" && normalizedItem === "airballoon" && !/\[from\]/i.test(event.rawLine)) {
          increment("airBalloonPops");
          addEvidence(event, "Air Balloon popped", item);
        }
        if (event.eventType === "heal" && /\[from\]\s*item:\s*Leftovers(?:\||\]|$)/i.test(event.rawLine)) {
          increment("leftoversRecoveries");
          addEvidence(event, "Leftovers recovery", "Leftovers");
        }

        const ability = rawAbilityName(event);
        const normalizedAbility = normalize(ability);
        const hasAbilityRecord = event.eventType === "ability" || (event.eventType === "activate" && /\|ability:\s*[^|]+/i.test(event.rawLine));
        if (hasAbilityRecord && ability) {
          increment("abilityActivations");
          addEvidence(event, "Ability activation", "", ability);
          const revealKey = `${actorKey ?? nickname.toLocaleLowerCase()}:${normalizedAbility}`;
          if (!revealedAbilityByActor.has(revealKey)) {
            revealedAbilityByActor.add(revealKey);
            increment("abilitiesRevealed");
            revealTurns.push(event.turn);
            season.revealTurns.push(event.turn);
            division?.revealTurns.push(event.turn);
            addEvidence(event, "Ability revealed", "", ability);
          }
          if (normalizedAbility === "intimidate") {
            increment("intimidateActivations");
            addEvidence(event, "Intimidate", "", ability);
          }

          const fromAbility = normalize(abilitySource);
          const fromMove = normalize(moveSource);
          if ((["trace", "receiver", "powerofalchemy"].includes(fromAbility) || ["roleplay", "doodle"].includes(fromMove)) && event.eventType === "ability") {
            increment("abilitiesCopied");
            addEvidence(event, "Copied", "", ability);
          }
          if (event.eventType === "activate" && (activatedMoveName === "skillswap" || normalizedAbility === "wanderingSpirit")) {
            increment("abilitiesSwapped");
            addEvidence(event, "Swapped", "", ability || sourceMove(event) || "Wandering Spirit");
          }
        }
      }
    }

    const evidence = [...evidenceByEvent.values()].sort((a, b) =>
      seasonNumberFromMatch(b.match) - seasonNumberFromMatch(a.match) || b.match.week - a.match.week || b.match.id - a.match.id || b.turn - a.turn || b.sequence - a.sequence,
    );
    const averageRevealTurn = revealTurns.length ? revealTurns.reduce((sum, turn) => sum + turn, 0) / revealTurns.length : null;
    return {
      coverage: [...coverage.values()].sort((a, b) => a.seasonNumber - b.seasonNumber).map((season) => ({
        ...season,
        averageRevealTurn: season.revealTurns.length ? season.revealTurns.reduce((sum, turn) => sum + turn, 0) / season.revealTurns.length : null,
      })),
      divisionCoverage: [...divisionCoverage.values()].sort((a, b) => a.displayOrder - b.displayOrder || a.divisionName.localeCompare(b.divisionName)).map((division) => ({
        ...division,
        averageRevealTurn: division.revealTurns.length ? division.revealTurns.reduce((sum, turn) => sum + turn, 0) / division.revealTurns.length : null,
      })),
      totals,
      evidence,
      revealCount: revealTurns.length,
      averageRevealTurn,
      totalMatches,
      coveredMatches,
    };
  }, [matches, seasons, divisions, selectedSeasonId]);

  const hasCoverage = report.coveredMatches > 0;
  const count = (value: number) => hasCoverage ? value.toLocaleString() : "—";
  const averageRevealTurn = report.averageRevealTurn === null ? "—" : `T${report.averageRevealTurn.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  const selectedChart = chartMetrics.find((metric) => metric.key === selectedChartMetric) ?? chartMetrics[0];
  const chartGroups = selectedChartGroup === "season"
    ? report.coverage.map((season) => ({ key: `season-${season.seasonNumber}`, label: season.seasonName, covered: season.covered, counts: season.counts, revealTurns: season.revealTurns, averageRevealTurn: season.averageRevealTurn }))
    : report.divisionCoverage.map((division) => ({ key: `division-${division.divisionId}`, label: division.divisionName, covered: division.covered, counts: division.counts, revealTurns: division.revealTurns, averageRevealTurn: division.averageRevealTurn }));
  const canCompareDivisions = selectedSeasonId !== "all" && selectedDivisionId === "all";
  const chartRows = chartGroups.map((group) => {
    const rawCount = selectedChart.kind === "count" ? group.counts[selectedChart.key as keyof MetricCounts] : null;
    const ratePer100 = rawCount !== null && group.covered > 0 ? (rawCount / group.covered) * 100 : null;
    const averageTurn = selectedChart.kind === "turn" ? group.averageRevealTurn : null;
    return {
      key: group.key,
      label: group.label,
      covered: group.covered,
      count: rawCount,
      ratePer100,
      averageTurn,
      revealCount: group.revealTurns.length,
      barValue: selectedChart.kind === "turn" ? averageTurn ?? 0 : ratePer100 ?? 0,
    };
  });
  const chartMaximum = Math.max(1, ...chartRows.map((row) => row.barValue));

  return <div className="space-y-5">
    <section className="poke-card p-5 md:p-6">
      <h2 className="font-pixel text-sm text-white">Item and ability protocol events</h2>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-[var(--foreground-muted)]">Counts use explicit normalized Showdown protocol records from covered Season 5+ replays. Item transfers are attributed only when the log names their source. Ability reveal turns use the first logged announcement of each Pokémon-and-ability pair in a match. These counts are separate from the saved Favorable Events counter.</p>
      <h3 className="mt-5 font-pixel text-[10px] text-cyan-100">Items</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Items consumed" value={count(report.totals.itemsConsumed)} detail="Explicit item-use and consumption end records" />
        <SummaryCard label="Items knocked off" value={count(report.totals.itemsKnockedOff)} detail="Explicit Knock Off item removals" />
        <SummaryCard label="Items stolen" value={count(report.totals.itemsStolen)} detail="Received items from Thief, Covet, Magician, or Pickpocket" />
        <SummaryCard label="Items exchanged" value={count(report.totals.itemsExchanged)} detail="Received items from Trick or Switcheroo" />
        <SummaryCard label="Berries activated" value={count(report.totals.berriesActivated)} detail="Consumed items whose names end in Berry" />
        <SummaryCard label="Focus Sash activations" value={count(report.totals.focusSashActivations)} detail="Focus Sash removed without a logged transfer source" />
        <SummaryCard label="Air Balloon pops" value={count(report.totals.airBalloonPops)} detail="Air Balloon removed without a logged transfer source" />
        <SummaryCard label="Leftovers recovery activations" value={count(report.totals.leftoversRecoveries)} detail="Heal events explicitly attributed to Leftovers" />
      </div>
      <h3 className="mt-6 font-pixel text-[10px] text-violet-100">Abilities</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Abilities revealed" value={count(report.totals.abilitiesRevealed)} detail="Distinct Pokémon-and-ability pairs with an explicit announcement" />
        <SummaryCard label="Ability reveal turn" value={averageRevealTurn} detail={`${report.revealCount.toLocaleString()} first-announcement records · average turn`} />
        <SummaryCard label="Ability activations" value={count(report.totals.abilityActivations)} detail="Explicit -ability and ability-tagged -activate records" />
        <SummaryCard label="Abilities copied" value={count(report.totals.abilitiesCopied)} detail="Explicit Trace, Receiver, Power of Alchemy, Role Play, or Doodle records" />
        <SummaryCard label="Abilities swapped" value={count(report.totals.abilitiesSwapped)} detail="Explicit Skill Swap and Wandering Spirit activations" />
        <SummaryCard label="Intimidate activations" value={count(report.totals.intimidateActivations)} detail="Explicit Intimidate ability records" />
        <SummaryCard label="Covered replays" value={`${report.coveredMatches.toLocaleString()} / ${report.totalMatches.toLocaleString()}`} detail={`${formatPercent(report.coveredMatches, report.totalMatches)} have a saved normalized move stream`} />
      </div>
      <div className="mt-4 rounded-lg border border-slate-500/30 bg-slate-500/[0.06] p-3 text-[10px] leading-4 text-[var(--foreground-muted)]"><strong className="text-slate-200">Abilities suppressed: protocol report pending.</strong> Suppression effects such as Neutralizing Gas do not list every affected Pokémon in the saved stream, so the report cannot produce a complete count.</div>
    </section>

    <section className="poke-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Season and division chart</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">Compare one available metric by season or division. Event counts are shown per 100 covered replays; each row also shows its raw count. Ability reveal turn shows the average first-reveal turn.</p></div><div className="flex flex-wrap gap-3"><label className="min-w-36"><span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Group by</span><select value={selectedChartGroup} onChange={(event) => setSelectedChartGroup(event.target.value as "season" | "division")} className="w-full touch-manipulation rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-[var(--primary)]"><option value="season">Season</option><option value="division">Division</option></select></label><label className="min-w-52"><span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">Metric</span><select value={selectedChartMetric} onChange={(event) => setSelectedChartMetric(event.target.value as ChartMetricKey)} className="w-full touch-manipulation rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-[var(--primary)]">{chartMetrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label></div></div>
      {selectedChartGroup === "division" && selectedSeasonId === "all" ? <p className="mt-4 rounded-lg border border-amber-400/25 bg-amber-500/[0.06] p-3 text-[10px] leading-4 text-amber-100/90">Choose one season in the page filters to compare its divisions.</p> : null}
      {selectedChartGroup === "division" && selectedSeasonId !== "all" && selectedDivisionId !== "all" ? <p className="mt-4 rounded-lg border border-amber-400/25 bg-amber-500/[0.06] p-3 text-[10px] leading-4 text-amber-100/90">Set the page Division filter to All to compare every division in this season.</p> : null}
      {selectedChartGroup === "division" && selectedSeasonId !== "all" && selectedDivisionId === "all" && !chartRows.length ? <p className="mt-4 text-xs text-[var(--foreground-muted)]">No divisions are available for this season.</p> : null}
      <div className="mt-5 space-y-3" role="list" aria-label={`${selectedChartGroup === "season" ? "Seasonal" : "Division"} chart for ${selectedChart.label}`}>
        {(selectedChartGroup === "season" || canCompareDivisions) && chartRows.map((row) => {
          const hasGroupCoverage = row.covered > 0;
          const width = row.barValue > 0 ? Math.max(1, (row.barValue / chartMaximum) * 100) : 0;
          const resultText = selectedChart.kind === "turn"
            ? row.averageTurn === null ? "No ability reveal records" : `T${row.averageTurn.toLocaleString(undefined, { maximumFractionDigits: 1 })} average · ${row.revealCount.toLocaleString()} reveals`
            : !hasGroupCoverage ? "No replay coverage" : `${row.count?.toLocaleString() ?? "0"} events · ${(row.ratePer100 ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} per 100`;
          const accessibleLabel = `${row.label}: ${resultText}`;
          return <div key={row.key} role="listitem" aria-label={accessibleLabel} className="grid gap-1.5 sm:grid-cols-[minmax(90px,0.25fr)_minmax(150px,1fr)_minmax(175px,0.7fr)] sm:items-center sm:gap-3">
            <span className="text-[10px] font-bold text-white">{row.label}</span>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--background-tertiary)]" aria-hidden="true"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-[width]" style={{ width: `${width}%` }} /></div>
            <span className="text-[10px] font-mono text-[var(--foreground-muted)]">{resultText}</span>
          </div>;
        })}
      </div>
      {!report.coverage.length ? <p className="mt-3 text-xs text-[var(--foreground-muted)]">No Season 5+ replays match the current filters.</p> : null}
      <p className="mt-4 text-[9px] leading-4 text-[var(--foreground-subtle)]">Some categories overlap by definition: for example, an eaten berry is both an item consumed and a berry activated. Abilities suppressed is excluded until its affected Pokémon can be counted reliably.</p>
    </section>

    {!hasCoverage ? <section className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 text-xs leading-5 text-amber-100/90" role="status">No normalized replay event streams are saved for these filters. The report leaves metric values unknown instead of treating missing event rows as zero.</section> : null}

    <section className="poke-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Coverage by season</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">A match counts as covered when its saved normalized stream includes a move event. Event totals use covered Season 5+ replays only; matches without a saved stream remain unknown.</p></div><span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-wide text-cyan-200">Season 5 onward</span></div>
      {report.coverage.length ? <div className="mt-4 overflow-x-auto touch-pan-x"><table className="w-full min-w-[500px] text-left text-xs"><thead className="text-[9px] uppercase tracking-wide text-[var(--foreground-muted)]"><tr><th className="px-3 py-2">Season</th><th className="px-3 py-2">Covered replays</th><th className="px-3 py-2">Coverage</th></tr></thead><tbody>{report.coverage.map((season) => <tr key={season.seasonNumber} className="border-t border-[var(--border)]"><td className="px-3 py-2 font-bold text-white">{season.seasonName}</td><td className="px-3 py-2 font-mono text-[var(--foreground-muted)]">{season.covered} / {season.matches}</td><td className="px-3 py-2 font-mono text-cyan-200">{formatPercent(season.covered, season.matches)}</td></tr>)}</tbody></table></div> : <p className="mt-4 p-3 text-xs text-[var(--foreground-muted)]">No Season 5+ replay matches match the current filters.</p>}
    </section>

    <section className="poke-card p-5 md:p-6">
      <div><h2 className="font-pixel text-sm text-white">Protocol evidence</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Each row links to the saved match that contains the event. A row may support more than one count, such as an eaten berry counting as both consumption and a berry activation.</p></div>
      {report.evidence.length ? <div className="mt-4 overflow-x-auto touch-pan-x"><table className="w-full min-w-[1240px] text-left text-xs"><thead className="text-[9px] uppercase tracking-wide text-[var(--foreground-muted)]"><tr><th className="px-3 py-2">Match</th><th className="px-3 py-2">Team</th><th className="px-3 py-2">Turn</th><th className="px-3 py-2">Pokémon</th><th className="px-3 py-2">Item / ability</th><th className="px-3 py-2">Recorded metrics</th></tr></thead><tbody>{report.evidence.slice(0, 100).map((row) => <tr key={row.key} className="border-t border-[var(--border)]"><td className="px-3 py-2"><Link href={row.match.isDemo ? "/experimental-stats?demo=1" : `/matches/${row.match.id}`} className="font-bold text-cyan-200 underline underline-offset-2">{row.match.seasonName} W{row.match.week}</Link><div className="mt-1 text-[9px] text-[var(--foreground-muted)]">{row.match.coach1.teamName} vs {row.match.coach2.teamName}</div></td><td className="px-3 py-2 font-bold text-white">{row.team}</td><td className="px-3 py-2 font-mono text-[var(--foreground-muted)]">{row.turn ? `T${row.turn}` : "Before turn 1"}</td><td className="px-3 py-2"><strong className="text-white">{row.pokemon}</strong>{row.actor !== row.pokemon ? <span className="ml-1 text-[9px] text-[var(--foreground-subtle)]">({row.actor})</span> : null}</td><td className="px-3 py-2 text-cyan-100">{row.item || row.ability || "—"}</td><td className="px-3 py-2 text-[var(--foreground-muted)]">{[...row.metrics].join(" · ")}</td></tr>)}</tbody></table>{report.evidence.length > 100 ? <p className="mt-3 text-[10px] text-[var(--foreground-muted)]">Showing the newest 100 event records from {report.evidence.length.toLocaleString()} matches and events.</p> : null}</div> : <p className="mt-4 p-3 text-xs text-[var(--foreground-muted)]">No supported item or ability protocol events match these filters.</p>}
    </section>
  </div>;
}
