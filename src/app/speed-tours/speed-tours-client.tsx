"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Candidate = {
  id: number;
  name: string;
  displayName: string;
  spriteUrl: string | null;
  types: string[];
  price: number;
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
};

type Criteria = {
  types?: string[];
  stat?: string;
  min?: number | null;
  max?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
} | null;

type TourData = {
  tours: Array<{ id: number; name: string; status: string; currentRound: number; bracketFormat: string | null; createdAt: string }>;
  selectedTour: {
    id: number;
    name: string;
    status: string;
    currentRound: number;
    totalRounds: number;
    budget: number;
    bracketFormat: string | null;
    priceSeasonId: number;
    priceSeasonName: string;
    registrationOpen: boolean;
    participants: Array<{
      id: number;
      coachId: number;
      name: string;
      remainingBudget: number;
      selections: Array<{ id: number; roundNumber: number; pokemonId: number; name: string; spriteUrl: string | null; price: number }>;
    }>;
    round: { id: number; number: number; phase: string; criteria: Criteria; phaseEndsAt: string | null; fallbackPriceCap: number | null; submittedPokemonId: number | null; viewerAction: "pick" | "poison" | "secondary" | "fallback" | null } | null;
    candidates: Candidate[];
    bracket: Array<{
      id: number;
      bracketRound: number;
      bracketPosition: number;
      bracketStage: string;
      participantOneId: number | null;
      participantTwoId: number | null;
      participantOneName: string;
      participantTwoName: string;
      winnerParticipantId: number | null;
      scoreOne: number | null;
      scoreTwo: number | null;
      gameReport: string | null;
      status: string;
    }>;
    viewerParticipantId: number | null;
    viewerCoachId: number | null;
    viewerCanJoin: boolean;
    viewerCanLeave: boolean;
  } | null;
  serverNow: number;
};

function typeName(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function phaseLabel(phase: string) {
  if (phase === "draft") return "Initial pick";
  if (phase === "secondary") return "Poison Pill / Secondary pick";
  if (phase === "fallback") return "Fallback pick";
  if (phase === "complete") return "Round complete";
  return "Waiting for admin";
}

function formatCriteria(criteria: Criteria) {
  if (!criteria) return "No restrictions — any affordable Pokémon is eligible.";
  const parts: string[] = [];
  if (criteria.types?.length) parts.push(`Type: ${criteria.types.map(typeName).join(" or ")}`);
  if (criteria.stat) {
    const label = criteria.stat === "baseStatTotal" ? "BST" : criteria.stat.replace(/([A-Z])/g, " $1");
    if (criteria.min !== null && criteria.min !== undefined) parts.push(`${label} ≥ ${criteria.min}`);
    if (criteria.max !== null && criteria.max !== undefined) parts.push(`${label} ≤ ${criteria.max}`);
  }
  if (criteria.priceMin !== null && criteria.priceMin !== undefined) parts.push(`Price ≥ ${criteria.priceMin}`);
  if (criteria.priceMax !== null && criteria.priceMax !== undefined) parts.push(`Price ≤ ${criteria.priceMax}`);
  return parts.length ? parts.join(" · ") : "No restrictions — any affordable Pokémon is eligible.";
}

export function SpeedToursClient({ showPast = false }: { showPast?: boolean }) {
  const [data, setData] = useState<TourData | null>(null);
  const [tourId, setTourId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const load = useCallback(async (nextTourId = tourId) => {
    const query = nextTourId ? `?tourId=${nextTourId}` : "";
    const response = await fetch(`/api/speed-tours${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Speed Tour data is unavailable");
    const nextData = await response.json() as TourData;
    setData(nextData);
    if (!tourId && nextData.selectedTour) setTourId(nextData.selectedTour.id);
    return nextData;
  }, [tourId]);

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load Speed Tours")).finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (showPast || ["completed", "archived"].includes(data?.selectedTour?.status ?? "")) return;
    const interval = window.setInterval(() => {
      load().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [data?.selectedTour?.status, load, showPast]);

  useEffect(() => {
    const deadline = data?.selectedTour?.round?.phaseEndsAt;
    if (!deadline) {
      setSecondsLeft(null);
      return;
    }
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [data?.selectedTour?.round?.phaseEndsAt]);

  const selected = data?.selectedTour ?? null;
  const pastTours = data?.tours.filter((tour) => tour.status === "completed" || tour.status === "archived") ?? [];
  const currentRound = selected?.round;
  const viewer = selected?.viewerParticipantId ? selected.participants.find((participant) => participant.id === selected.viewerParticipantId) ?? null : null;
  const visibleCandidates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!selected || !query) return selected?.candidates ?? [];
    return selected.candidates.filter((candidate) => candidate.displayName.toLowerCase().includes(query) || candidate.name.toLowerCase().includes(query));
  }, [searchTerm, selected]);
  useEffect(() => setSearchTerm(""), [selected?.id, currentRound?.id, currentRound?.phase]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function updateRegistration(action: "join" | "leave") {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/speed-tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourId: selected.id, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Registration could not be updated");
      setData(result.data);
      setNotice(action === "join" ? "You joined the Speed Tour." : "You left the Speed Tour.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration could not be updated");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(pokemonId: number, action: "pick" | "poison") {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/speed-tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourId: selected.id, pokemonId, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Choice could not be submitted");
      setData(result.data);
      if (action === "poison") setNotice("Poison Pill submitted.");
      else if (currentRound?.viewerAction === "secondary") setNotice("Secondary pick submitted.");
      else setNotice("Choice submitted. The server will resolve the phase when everyone has locked in.");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Choice could not be submitted";
      setError(message);
      if (action === "poison") setNotice(`Poison unsuccessful: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="container mx-auto px-4 py-12"><div className="poke-card p-8 text-center text-[var(--foreground-muted)]">Loading Speed Tours…</div></main>;
  if (error && !data) return <main className="container mx-auto px-4 py-12"><div className="poke-card p-8 text-center text-[var(--error)]">{error}</div></main>;

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--accent)]">Off-season events</p>
          <h1 className="mt-2 font-pixel text-2xl text-white sm:text-3xl">Speed Tours</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-muted)]">Timed, simultaneous Pokémon drafting. Speed Tour teams and statistics are separate from regular-season and playoff competition.</p>
        </div>
        {data?.tours?.length ? (
          <select value={selected?.id ?? ""} onChange={(event) => { const next = Number(event.target.value); setTourId(next); load(next).catch(() => setError("Unable to switch Speed Tour")); }} className="min-h-11 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 text-sm text-white">
            {data.tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.name} · {tour.status}</option>)}
          </select>
        ) : null}
      </div>

      {error && <div className="mb-4 rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/10 p-3 text-sm text-[var(--error)]">{error}</div>}
      {notice && <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-[var(--accent)]/40 bg-[var(--background-secondary)] px-4 py-3 text-sm font-bold text-white shadow-2xl">{notice}</div>}

      {showPast && <section className="mb-6 poke-card p-5"><h2 className="font-pixel text-sm text-white">Past Speed Tours</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Completed brackets and team histories remain separate from league-season archives.</p>{pastTours.length ? <div className="mt-4 flex flex-wrap gap-2">{pastTours.map((tour) => <button key={tour.id} type="button" onClick={() => { setTourId(tour.id); load(tour.id).catch(() => setError("Unable to open past Speed Tour")); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${selected?.id === tour.id ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white" : "border-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-white"}`}>{tour.name}</button>)}</div> : <p className="mt-4 text-sm text-[var(--foreground-muted)]">No completed Speed Tours yet.</p>}</section>}

      {!selected ? (
        <div className="poke-card p-10 text-center text-[var(--foreground-muted)]">No Speed Tours have been created yet.</div>
      ) : (
        <div className="space-y-6">
          <section className="poke-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-widest text-[var(--foreground-muted)]">Current event</p><h2 className="mt-1 text-xl font-black text-white">{selected.name}</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Using {selected.priceSeasonName} prices</p></div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {selected.viewerCanJoin && <button type="button" disabled={submitting} onClick={() => updateRegistration("join")} className="btn-retro px-4 py-3 text-xs disabled:opacity-50">Join Speed Tour</button>}
                {selected.viewerCanLeave && <button type="button" disabled={submitting} onClick={() => updateRegistration("leave")} className="rounded-lg border border-[var(--error)]/50 px-4 py-3 text-xs font-bold text-[var(--error)] disabled:opacity-50">Leave Speed Tour</button>}
                <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-right"><p className="text-[10px] uppercase text-[var(--foreground-muted)]">Budget</p><p className="font-mono text-lg font-black text-[var(--accent)]">{viewer?.remainingBudget ?? selected.budget} points</p></div>
              </div>
            </div>
            {selected.registrationOpen && !selected.viewerCoachId && <p className="mt-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 p-3 text-sm text-[var(--primary-light)]">Log in with a coach account to join this Speed Tour before Round 1 starts.</p>}
            {currentRound ? (
              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-4"><div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-[var(--primary)]/20 px-2 py-1 text-xs font-bold text-[var(--primary-light)]">Round {currentRound.number} / {selected.totalRounds}</span><span className="text-sm font-bold text-white">{phaseLabel(currentRound.phase)}</span>{currentRound.fallbackPriceCap !== null && <span className="text-xs text-[var(--warning)]">Price cap: {currentRound.fallbackPriceCap}</span>}</div><p className="mt-3 text-sm text-[var(--foreground-muted)]">{formatCriteria(currentRound.criteria)}</p></div>
                <div className="flex min-w-32 items-center justify-center rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-4 text-center"><div><p className="text-[10px] uppercase text-[var(--foreground-muted)]">Clock</p><p className={`font-mono text-3xl font-black ${secondsLeft !== null && secondsLeft <= 10 ? "text-[var(--error)]" : "text-white"}`}>{secondsLeft === null ? "—" : `${secondsLeft}s`}</p></div></div>
              </div>
            ) : <p className="mt-5 text-sm text-[var(--foreground-muted)]">Waiting for the first round to be started by the admin.</p>}
            {currentRound?.viewerAction === "poison" && <div className="mt-4 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm text-[var(--warning)]"><b>Your first pick succeeded.</b> Select one remaining Pokémon as your Poison Pill. Coaches making secondary picks cannot receive that Pokémon.</div>}
            {currentRound?.viewerAction === "secondary" && <div className="mt-4 rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/10 p-3 text-sm text-[var(--primary-light)]"><b>Your first pick did not lock in.</b> Choose a secondary Pokémon now. This can happen after a duplicate choice or when the first timer expires without a submission.</div>}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="poke-card overflow-hidden p-0">
              <div className="border-b border-[var(--background-tertiary)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h2 className="font-pixel text-sm text-white">Draft board</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Sorted by cost from highest to lowest.</p></div>
                  <Link href={`/seasons/${selected.priceSeasonId}/draft`} className="rounded-lg border border-[var(--accent)]/40 px-3 py-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10">View {selected.priceSeasonName} board</Link>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search Pokémon" aria-label="Search eligible Pokémon" className="min-h-10 flex-1 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 text-sm text-white placeholder:text-[var(--foreground-subtle)]" />
                  <span className="text-xs text-[var(--foreground-muted)]">{visibleCandidates.length}{searchTerm.trim() ? ` of ${selected.candidates.length}` : ""} eligible Pokémon</span>
                </div>
              </div>
              {!selected.viewerParticipantId && currentRound && currentRound.phase !== "waiting" && <div className="m-4 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 p-3 text-sm text-[var(--primary-light)]">Join before Round 1 and log in as that coach to submit a pick. Spectators can still watch the teams.</div>}
              {visibleCandidates.length ? <div className="grid max-h-[680px] grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3">{visibleCandidates.map((candidate) => <div key={candidate.id} className="rounded-xl border border-[var(--background-tertiary)] bg-[var(--background)] p-3"><div className="flex items-center gap-2">{candidate.spriteUrl ? <Image src={candidate.spriteUrl} alt="" width={48} height={48} className="h-12 w-12 object-contain" /> : <div className="h-12 w-12" />}<div className="min-w-0"><p className="truncate text-sm font-bold text-white">{candidate.displayName}</p><p className="font-mono text-xs text-[var(--accent)]">{candidate.price} pts</p></div></div><div className="mt-2 flex flex-wrap gap-1">{candidate.types.map((type) => <span key={type} className="rounded bg-[var(--background-tertiary)] px-1.5 py-0.5 text-[9px] uppercase text-[var(--foreground-muted)]">{type}</span>)}</div>{selected.viewerParticipantId && currentRound?.viewerAction ? <button type="button" disabled={submitting} onClick={() => submit(candidate.id, currentRound.viewerAction === "poison" ? "poison" : "pick")} className="mt-3 min-h-10 w-full rounded-lg bg-[var(--primary)] px-2 text-xs font-black uppercase text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-50">{selected.round?.submittedPokemonId === candidate.id ? "Locked in" : currentRound.viewerAction === "poison" ? "Poison Pill" : "Select"}</button> : null}</div>)}</div> : <div className="p-10 text-center text-sm text-[var(--foreground-muted)]">{searchTerm.trim() ? `No eligible Pokémon match “${searchTerm.trim()}”.` : "No Pokémon currently meet the active rules and budget constraints."}</div>}
            </div>

            <div className="space-y-6">
              <div className="poke-card overflow-hidden p-0"><div className="border-b border-[var(--background-tertiary)] p-4"><h2 className="font-pixel text-sm text-white">Teams</h2></div><div className="divide-y divide-[var(--background-tertiary)]">{selected.participants.map((participant) => <div key={participant.id} className="p-4"><div className="flex items-center justify-between gap-3"><span className="font-bold text-white">{participant.name}</span><span className="font-mono text-xs text-[var(--accent)]">{participant.remainingBudget} pts left</span></div><div className="mt-3 flex flex-wrap gap-1.5">{participant.selections.length ? participant.selections.map((selection) => <span key={selection.id} title={`${selection.name} · ${selection.price} points`} className="rounded-md border border-[var(--background-tertiary)] bg-[var(--background)] px-2 py-1 text-[10px] text-[var(--foreground-muted)]">R{selection.roundNumber} {selection.name} <b className="text-[var(--accent)]">{selection.price}</b></span>) : <span className="text-xs text-[var(--foreground-subtle)]">No selections yet</span>}</div></div>)}</div></div>
              {selected.bracket.length ? <div className="poke-card overflow-hidden p-0"><div className="border-b border-[var(--background-tertiary)] p-4"><h2 className="font-pixel text-sm text-white">{selected.bracketFormat === "double" ? "Double-elimination" : "Single-elimination"} bracket</h2></div><div className="space-y-2 p-4">{selected.bracket.map((match) => <div key={match.id} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3 text-xs"><div className="mb-2 flex justify-between text-[var(--foreground-muted)]"><span>{match.bracketStage.replace("-", " ")} · round {match.bracketRound} · match {match.bracketPosition}</span><span>{match.status}</span></div><div className="flex justify-between"><span>{match.participantOneName}</span><b>{match.scoreOne ?? "—"}</b></div><div className="mt-1 flex justify-between"><span>{match.participantTwoName}</span><b>{match.scoreTwo ?? "—"}</b></div>{match.gameReport && <p className="mt-2 border-t border-[var(--background-tertiary)] pt-2 text-[var(--foreground-muted)]">{match.gameReport}</p>}</div>)}</div></div> : null}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
