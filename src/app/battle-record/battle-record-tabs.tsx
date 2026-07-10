"use client";

import Link from "next/link";
import { useState } from "react";
import { BattleRecordTable, type BattleRecordRow } from "./battle-record-table";

export interface PboRecordEntry {
  title: string;
  detail: string;
  href?: string;
}

export interface PboRecordCategory {
  title: string;
  entries: PboRecordEntry[];
}

type BattleRecordTab = "coach-records" | "pbo-records";

const tabs: Array<{ id: BattleRecordTab; label: string }> = [
  { id: "coach-records", label: "Coach Records" },
  { id: "pbo-records", label: "PBO Records" },
];

function PboRecordsGrid({ categories }: { categories: PboRecordCategory[] }) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
      {categories.map((category) => (
        <section
          key={category.title}
          className="overflow-hidden rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)]/55"
        >
          <div className="border-b-2 border-[var(--background-tertiary)] bg-[var(--accent)] px-3 py-2 text-center">
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
  pboRecords,
}: {
  records: BattleRecordRow[];
  pboRecords: PboRecordCategory[];
}) {
  const [activeTab, setActiveTab] = useState<BattleRecordTab>("coach-records");
  const activeTitle = activeTab === "coach-records" ? "Coach Records" : "PBO Records";

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
              All-time coach scoreline records from completed non-forfeit matches.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex lg:shrink-0">
            {tabs.map((tab) => {
              const active = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg border-2 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest transition-colors sm:min-w-36 ${
                    active
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--background-tertiary)] bg-[var(--background-secondary)] text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-white"
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
            <div className="section-title-icon !bg-[var(--primary)]">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19V5m0 14h16M8 16V9m4 7V7m4 9v-5" />
              </svg>
            </div>
            <h2 className="text-xl">{activeTitle}</h2>
          </div>
        </div>

        {activeTab === "coach-records" ? (
          <BattleRecordTable records={records} />
        ) : (
          <PboRecordsGrid categories={pboRecords} />
        )}
      </div>
    </div>
  );
}
