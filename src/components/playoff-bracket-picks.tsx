"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Team = {
  id: number;
  teamName: string;
  teamAbbreviation: string | null;
};

type Slot = {
  id: number;
  round: number;
  bracketPosition: number;
  higherSeed: Team | null;
  lowerSeed: Team | null;
};

type BracketStatus = {
  authenticated: boolean;
  locked: boolean;
  entryCount: number;
  picks: Record<string, number> | null;
  leaderboard: Array<{
    participantId: number;
    name: string;
    correct: number;
    completed: number;
    championCorrect: boolean;
  }>;
};

function slotKey(round: number, position: number) {
  return `${round}-${position}`;
}

export function PlayoffBracketPicks({
  seasonId,
  divisionId,
  divisionName,
  slots,
}: {
  seasonId: number;
  divisionId: number;
  divisionName: string;
  slots: Slot[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<BracketStatus | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const teamsById = useMemo(() => {
    const map = new Map<number, Team>();
    for (const slot of slots) {
      if (slot.higherSeed) map.set(slot.higherSeed.id, slot.higherSeed);
      if (slot.lowerSeed) map.set(slot.lowerSeed.id, slot.lowerSeed);
    }
    return map;
  }, [slots]);
  const qfs = slots.filter((slot) => slot.round === 1).sort((a, b) => a.bracketPosition - b.bracketPosition);
  const hasFullOpeningRound = qfs.length === 4 && qfs.every((slot) => slot.higherSeed && slot.lowerSeed);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/playoff-bracket-picks?seasonId=${seasonId}&divisionId=${divisionId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load bracket picks.");
        return data as BracketStatus;
      })
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        setPicks(data.picks ?? {});
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not load bracket picks.");
      });
    return () => { cancelled = true; };
  }, [divisionId, seasonId]);

  const semifinalOne = [picks["1-1"], picks["1-2"]].filter(Boolean);
  const semifinalTwo = [picks["1-3"], picks["1-4"]].filter(Boolean);
  const finalists = [picks["2-1"], picks["2-2"]].filter(Boolean);
  const complete = ["1-1", "1-2", "1-3", "1-4", "2-1", "2-2", "3-1"].every((key) => picks[key]);

  function choose(key: string, teamId: number) {
    setMessage(null);
    setPicks((current) => {
      const next = { ...current, [key]: teamId };
      if (key === "1-1" || key === "1-2") {
        if (![next["1-1"], next["1-2"]].includes(next["2-1"])) delete next["2-1"];
      }
      if (key === "1-3" || key === "1-4") {
        if (![next["1-3"], next["1-4"]].includes(next["2-2"])) delete next["2-2"];
      }
      if (key.startsWith("1-") || key.startsWith("2-")) {
        if (![next["2-1"], next["2-2"]].includes(next["3-1"])) delete next["3-1"];
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/playoff-bracket-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId, divisionId, picks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save bracket.");
      setMessage("Bracket saved. You can change it until the quarterfinals begin.");
      setStatus((current) => current ? { ...current, picks: data.picks } : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save bracket.");
    } finally {
      setSaving(false);
    }
  }

  function Choice({ teamId, pickKey }: { teamId: number; pickKey: string }) {
    const team = teamsById.get(teamId);
    if (!team) return null;
    const selected = picks[pickKey] === teamId;
    return (
      <button
        type="button"
        disabled={status?.locked}
        onClick={() => choose(pickKey, teamId)}
        className={`min-h-11 w-full rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors ${selected ? "border-[var(--primary)] bg-[var(--primary)]/20 text-white" : "border-[var(--background-tertiary)] bg-[var(--background)] text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-white"}`}
      >
        <span className="block whitespace-normal">{team.teamName}</span>
      </button>
    );
  }

  if (!hasFullOpeningRound) return null;

  return (
    <section className="poke-card p-4 sm:p-6">
      <div className={`${expanded ? "mb-5" : ""} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">Full-bracket pick-em</p>
          <h3 className="mt-1 text-lg font-bold text-white">Predict the {divisionName} champion</h3>
          {expanded && <p className="mt-1 text-xs text-[var(--foreground-muted)]">Pick every round now. This is scored separately from weekly pick-ems.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--background-tertiary)] px-3 py-1 text-[10px] font-bold text-[var(--foreground-muted)]">
            {status?.locked ? "LOCKED" : `${status?.entryCount ?? 0} ENTRIES`}
          </span>
          <Link
            href={`/pick-ems?seasonId=${seasonId}`}
            className="inline-flex min-h-11 items-center px-3 text-[10px] font-bold uppercase text-[var(--primary)] hover:text-white"
          >
            Round picks
          </Link>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="btn-retro-secondary inline-flex min-h-11 items-center gap-2 px-4 py-2 text-[10px]"
          >
            {expanded ? "Collapse picks" : "Expand picks"}
            <svg className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && <>
      <div className="space-y-5">
        <div>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-muted)]">Quarterfinals</h4>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {qfs.map((slot) => (
              <div key={slot.id} className="rounded-lg border border-[var(--background-tertiary)] p-2">
                <p className="mb-2 text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">QF {slot.bracketPosition}</p>
                <div className="grid gap-2">
                  <Choice teamId={slot.higherSeed!.id} pickKey={slotKey(1, slot.bracketPosition)} />
                  <Choice teamId={slot.lowerSeed!.id} pickKey={slotKey(1, slot.bracketPosition)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--foreground-muted)]">Semifinals</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {[semifinalOne, semifinalTwo].map((options, index) => (
              <div key={index} className="rounded-lg border border-[var(--background-tertiary)] p-2">
                <p className="mb-2 text-[9px] font-bold uppercase text-[var(--foreground-subtle)]">SF {index + 1}</p>
                {options.length === 2 ? <div className="grid gap-2">{options.map((teamId) => <Choice key={teamId} teamId={teamId} pickKey={slotKey(2, index + 1)} />)}</div> : <p className="py-4 text-center text-xs text-[var(--foreground-subtle)]">Choose both feeder winners</p>}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">Championship</h4>
          <div className="rounded-lg border border-[var(--accent)]/30 p-2">
            {finalists.length === 2 ? <div className="grid gap-2">{finalists.map((teamId) => <Choice key={teamId} teamId={teamId} pickKey="3-1" />)}</div> : <p className="py-4 text-center text-xs text-[var(--foreground-subtle)]">Choose both semifinal winners</p>}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--background-tertiary)] pt-4">
        {status?.authenticated ? (
          <button type="button" onClick={save} disabled={!complete || saving || status.locked} className="btn-retro min-h-11 px-5 py-2 text-[10px]">
            {saving ? "Saving..." : status.locked ? "Bracket locked" : "Save full bracket"}
          </button>
        ) : (
          <Link href="/pick-ems" className="btn-retro inline-flex min-h-11 items-center px-5 py-2 text-[10px]">Sign in through Pick-Ems</Link>
        )}
        {message && <p role="status" className="text-xs text-[var(--foreground-muted)]">{message}</p>}
      </div>

      {!!status?.leaderboard.length && (
        <div className="mt-6 border-t border-[var(--background-tertiary)] pt-5">
          <h4 className="mb-3 text-sm font-bold text-white">Bracket leaderboard</h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {status.leaderboard.slice(0, 12).map((entry, index) => (
              <div key={entry.participantId} className="flex items-center justify-between rounded-lg bg-[var(--background)] px-3 py-2 text-xs">
                <span className="truncate text-[var(--foreground-muted)]">#{index + 1} {entry.name}</span>
                <span className="font-mono font-bold text-white">{entry.correct}/{entry.completed}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </>}
    </section>
  );
}
