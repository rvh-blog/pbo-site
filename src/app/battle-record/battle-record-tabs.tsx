"use client";

import Link from "next/link";
import { useState } from "react";
import { getDivisionColor, getDivisionShadowColor } from "@/lib/division-colors";
import { BattleRecordTable, type BattleRecordRow } from "./battle-record-table";
import { PokemonMoveRecords, type PokemonMoveDivision } from "./pokemon-move-records";

export interface PboRecordEntry {
  title: string;
  detail: string;
  href?: string;
}

export interface PboRecordCategory {
  title: string;
  entries: PboRecordEntry[];
}

export interface DivisionalPboRecordGroup {
  divisionName: string;
  regularSeasonRecords: PboRecordCategory[];
  playoffRecords: PboRecordCategory[];
  overallRecords: PboRecordCategory[];
}

export type BattleRecordTab = "coach-records" | "pokemon-moves" | "pbo-records" | "divisional-records";
type PboRecordScope = "regular-season" | "playoffs" | "overall";

const tabs: Array<{ id: Exclude<BattleRecordTab, "pokemon-moves">; label: string }> = [
  { id: "coach-records", label: "Coach Records" },
  { id: "pbo-records", label: "PBO Records" },
  { id: "divisional-records", label: "Divisional Records" },
];

function PboRecordsGrid({ categories, accentColor }: { categories: PboRecordCategory[]; accentColor?: string }) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
      {categories.map((category) => (
        <section
          key={category.title}
          className="overflow-hidden rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)]/55"
        >
          <div
            className="border-b-2 border-[var(--background-tertiary)] bg-[var(--accent)] px-3 py-2 text-center"
            style={accentColor ? { backgroundColor: accentColor } : undefined}
          >
            <h3 className="font-pixel text-xs text-black sm:text-sm">{category.title}</h3>
          </div>
          <div className="divide-y divide-[var(--background-tertiary)]/70">
            {category.entries.length > 0 ? (
              category.entries.map((entry, index) => {
                const content = (
                  <>
                    <div className="font-bold text-white">{entry.title}</div>
                    <div className="mt-1 text-[11px] text-[var(--foreground-muted)]">{entry.detail}</div>
                  </>
                );

                return entry.href ? (
                  <Link
                    key={`${category.title}-${index}`}
                    href={entry.href}
                    className="block px-3 py-3 text-center text-xs transition-colors hover:bg-[var(--background-tertiary)]/40"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={`${category.title}-${index}`} className="px-3 py-3 text-center text-xs">
                    {content}
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-6 text-center text-xs text-[var(--foreground-muted)]">
                No qualifying records yet.
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BattleRecordView({
  records,
  divisionalPboRecords,
  regularSeasonPboRecords,
  playoffPboRecords,
  overallPboRecords,
  pokemonMoveDivisions,
  initialTab = "coach-records",
  initialPboRecordScope = "regular-season",
  initialDivisionRecordScope = "overall",
  initialDivisionRecordName,
}: {
  records: BattleRecordRow[];
  divisionalPboRecords: DivisionalPboRecordGroup[];
  regularSeasonPboRecords: PboRecordCategory[];
  playoffPboRecords: PboRecordCategory[];
  overallPboRecords: PboRecordCategory[];
  pokemonMoveDivisions: PokemonMoveDivision[];
  initialTab?: BattleRecordTab;
  initialPboRecordScope?: PboRecordScope;
  initialDivisionRecordScope?: PboRecordScope;
  initialDivisionRecordName?: string;
}) {
  const [activeTab, setActiveTab] = useState<BattleRecordTab>(initialTab);
  const [pboRecordScope, setPboRecordScope] = useState<PboRecordScope>(initialPboRecordScope);
  const [divisionRecordScope, setDivisionRecordScope] = useState<PboRecordScope>(initialDivisionRecordScope);
  const firstDivisionWithRecords = divisionalPboRecords.find((division) =>
    division.overallRecords.some((category) => category.entries.length > 0)
  )?.divisionName ?? divisionalPboRecords[0]?.divisionName;
  const requestedDivisionName = divisionalPboRecords.find(
    (division) => division.divisionName.toLowerCase() === initialDivisionRecordName?.trim().toLowerCase()
  )?.divisionName;
  const [divisionRecordName, setDivisionRecordName] = useState(requestedDivisionName ?? firstDivisionWithRecords);
  const activeTitle = activeTab === "coach-records"
    ? "Coach Records"
    : activeTab === "divisional-records"
      ? "Divisional Records"
    : activeTab === "pokemon-moves"
      ? "Move Usage"
      : "PBO Records";
  const activePboRecords = pboRecordScope === "regular-season"
    ? regularSeasonPboRecords
    : pboRecordScope === "playoffs"
      ? playoffPboRecords
      : overallPboRecords;
  const activeDivisionalRecords = divisionalPboRecords.find(
    (division) => division.divisionName === divisionRecordName
  );
  const activeDivisionalCategories = divisionRecordScope === "regular-season"
    ? activeDivisionalRecords?.regularSeasonRecords
    : divisionRecordScope === "playoffs"
      ? activeDivisionalRecords?.playoffRecords
      : activeDivisionalRecords?.overallRecords;
  const activeDivisionColor = getDivisionColor(divisionRecordName ?? "");
  const activeDivisionShadow = getDivisionShadowColor(divisionRecordName ?? "");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="poke-card p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm sm:text-base">
              <Link
                href="/leaderboards"
                className="text-[var(--foreground-muted)] transition-colors hover:text-[var(--primary)]"
              >
                Leaderboards
              </Link>
              <span className="text-[var(--foreground-subtle)]">/</span>
            </div>
            <h1 className="font-pixel text-2xl text-white sm:text-3xl md:text-4xl">
              Battle Record
            </h1>
            <p className="mt-1 text-base text-[var(--foreground-muted)]">
              All-time records from completed, non-forfeit matches.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex lg:shrink-0">
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              const activeDivisionalTab = active && tab.id === "divisional-records";

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={activeDivisionalTab ? {
                    backgroundColor: activeDivisionColor,
                    borderColor: activeDivisionColor,
                  } : undefined}
                    className={`rounded-lg border-2 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest transition-colors sm:min-w-36 ${
                    activeDivisionalTab
                      ? "text-slate-950"
                      : active
                      ? "border-sky-300 bg-sky-300 text-slate-950"
                      : "border-sky-300/35 bg-sky-300/5 text-sky-200 hover:border-sky-200 hover:bg-sky-300/15 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="poke-card overflow-hidden p-0 shadow-[0_0_28px_rgba(255,255,255,0.18)] ring-1 ring-white/10">
        <div className="border-b-2 border-[var(--background-tertiary)] p-4 sm:p-6">
          <div className="section-title !mb-0">
            <div
              className="section-title-icon"
              style={activeTab === "divisional-records"
                ? {
                    backgroundColor: activeDivisionColor,
                    boxShadow: `0 4px 0 ${activeDivisionShadow}`,
                  }
                : { backgroundColor: "var(--primary)" }}
            >
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19V5m0 14h16M8 16V9m4 7V7m4 9v-5" />
              </svg>
            </div>
            <h2 className="text-xl">{activeTitle}</h2>
          </div>
        </div>

        {activeTab === "coach-records" ? (
          <BattleRecordTable records={records} />
        ) : activeTab === "divisional-records" ? (
          <div>
            <div className="border-b-2 border-[var(--background-tertiary)] p-3 sm:p-4">
              <div
                className="mx-auto mb-3 max-w-4xl rounded-lg border px-4 py-3 text-center text-xs font-bold uppercase tracking-widest"
                style={{
                  borderColor: `${activeDivisionColor}80`,
                  backgroundColor: `${activeDivisionColor}12`,
                  color: activeDivisionColor,
                }}
              >
                Divisional records only track completed, non-forfeit matches from Season 6 onward.
              </div>
              <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {divisionalPboRecords.map((division) => {
                  const active = division.divisionName === divisionRecordName;
                  const divisionColor = getDivisionColor(division.divisionName);

                  return (
                    <button
                      key={division.divisionName}
                      type="button"
                      onClick={() => setDivisionRecordName(division.divisionName)}
                      aria-pressed={active}
                      className={`rounded-lg border-2 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest transition-colors sm:text-xs ${
                        active
                          ? "text-black"
                          : "bg-[var(--background-secondary)] hover:text-white"
                      }`}
                      style={active
                        ? { backgroundColor: divisionColor, borderColor: divisionColor }
                        : { borderColor: `${divisionColor}80`, color: divisionColor }}
                    >
                      {division.divisionName}
                    </button>
                  );
                })}
              </div>
              <div className="mx-auto mt-3 grid w-full max-w-2xl grid-cols-3 gap-2">
                {([
                  { id: "regular-season", label: "Regular Season" },
                  { id: "playoffs", label: "Playoffs" },
                  { id: "overall", label: "Overall" },
                ] as const).map((scope) => {
                  const active = divisionRecordScope === scope.id;

                  return (
                    <button
                      key={scope.id}
                      type="button"
                      onClick={() => setDivisionRecordScope(scope.id)}
                      aria-pressed={active}
                      className={`rounded-lg border-2 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest transition-colors sm:text-xs ${
                        active
                          ? "text-black"
                          : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:text-white"
                      }`}
                      style={active ? {
                        backgroundColor: activeDivisionColor,
                        borderColor: activeDivisionColor,
                      } : undefined}
                    >
                      {scope.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <PboRecordsGrid
              categories={activeDivisionalCategories ?? []}
              accentColor={activeDivisionColor}
            />
          </div>
        ) : activeTab === "pokemon-moves" ? (
          <PokemonMoveRecords divisions={pokemonMoveDivisions} />
        ) : (
          <div>
            <div className="flex justify-center border-b-2 border-[var(--background-tertiary)] p-3 sm:p-4">
              <div className="grid w-full max-w-2xl grid-cols-3 gap-2">
                {([
                  { id: "regular-season", label: "Regular Season" },
                  { id: "playoffs", label: "Playoffs" },
                  { id: "overall", label: "Overall" },
                ] as const).map((scope) => {
                  const active = pboRecordScope === scope.id;

                  return (
                    <button
                      key={scope.id}
                      type="button"
                      onClick={() => setPboRecordScope(scope.id)}
                      className={`rounded-lg border-2 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest transition-colors sm:text-xs ${
                        active
                          ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                          : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:border-[var(--accent)] hover:text-white"
                      }`}
                    >
                      {scope.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <PboRecordsGrid categories={activePboRecords} />
          </div>
        )}
      </div>
    </div>
  );
}
