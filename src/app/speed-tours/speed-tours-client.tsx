"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type PoisonResult = {
  pokemonId: number;
  pokemonName: string;
  poisonerNames: string[];
  affectedParticipantNames: string[];
  successful: boolean;
};

type ReplaySummary = {
  tier: string | null;
  p1Username: string;
  p2Username: string;
  winner: "p1" | "p2" | null;
  p1Remaining: number;
  p2Remaining: number;
  turnCount: number;
  keyEvents: Array<{ turn: number; type: string; player: string; pokemon?: string; cause?: string; killer?: string; move?: string }>;
  p1Team: Array<{ name: string; kills: number; deaths: number }>;
  p2Team: Array<{ name: string; kills: number; deaths: number }>;
};

type ChatMessage = {
  id: number;
  participantId: number;
  participantName: string;
  content: string;
  createdAt: string;
};

type RoundSummary = {
  roundNumber: number;
  phase: "secondary" | "fallback" | "complete";
  selections: Array<{ participantName: string; pokemonName: string; price: number }>;
  failedSelections: Array<{ participantName: string; pokemonName: string; price: number }>;
  pendingParticipantNames: string[];
  poisonResults: PoisonResult[];
};

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
    roundSummary: RoundSummary | null;
    chatMessages: ChatMessage[];
    participants: Array<{
      id: number;
      coachId: number;
      name: string;
      remainingBudget: number;
      selections: Array<{ id: number; roundNumber: number; pokemonId: number; name: string; spriteUrl: string | null; price: number }>;
    }>;
    round: { id: number; number: number; phase: string; criteria: Criteria; phaseEndsAt: string | null; fallbackPriceCap: number | null; submittedPokemonId: number | null; viewerAction: "pick" | "poison" | "secondary" | "fallback" | null; maxAffordablePrice: number | null; poisonResults: PoisonResult[] } | null;
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
      replayUrl: string | null;
      replaySummary: ReplaySummary | null;
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

function bracketLabel(format: string | null) {
  if (format === "double") return "Double-elimination";
  if (format === "round-robin") return "Round-robin";
  return "Single-elimination";
}

function ReplaySummaryCard({ summary, replayUrl }: { summary: ReplaySummary; replayUrl: string | null }) {
  const winner = summary.winner === "p1" ? summary.p1Username : summary.winner === "p2" ? summary.p2Username : "Not identified";
  return <div className="mt-3 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">Parsed replay summary</p>{replayUrl && <a href={replayUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[var(--accent)] underline">Open replay</a>}</div><p className="mt-2 text-xs text-[var(--foreground-muted)]">{summary.tier || "Pokémon Showdown replay"} · {summary.turnCount} turns · Winner: <b className="text-white">{winner}</b></p><div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="rounded border border-[var(--background-tertiary)] bg-[var(--background)] p-2 text-xs"><b className="text-white">{summary.p1Username}</b><span className="ml-2 text-[var(--accent)]">{summary.p1Remaining} remaining</span><div className="mt-1 text-[var(--foreground-muted)]">{summary.p1Team.map((pokemon) => `${pokemon.name} ${pokemon.kills}K/${pokemon.deaths}D`).join(" · ") || "Team data unavailable"}</div></div><div className="rounded border border-[var(--background-tertiary)] bg-[var(--background)] p-2 text-xs"><b className="text-white">{summary.p2Username}</b><span className="ml-2 text-[var(--accent)]">{summary.p2Remaining} remaining</span><div className="mt-1 text-[var(--foreground-muted)]">{summary.p2Team.map((pokemon) => `${pokemon.name} ${pokemon.kills}K/${pokemon.deaths}D`).join(" · ") || "Team data unavailable"}</div></div></div>{summary.keyEvents.length ? <details className="mt-2 text-xs"><summary className="cursor-pointer font-bold text-[var(--foreground-muted)]">Show key events</summary><div className="mt-2 space-y-1 text-[var(--foreground-muted)]">{summary.keyEvents.map((event, index) => <p key={`${event.turn}-${event.type}-${index}`}>Turn {event.turn}: {event.pokemon || event.player} {event.type}{event.killer ? ` · by ${event.killer}` : ""}{event.cause ? ` · ${event.cause}` : ""}</p>)}</div></details> : null}</div>;
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
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [roundSummaryNotice, setRoundSummaryNotice] = useState<RoundSummary | null>(null);
  const seenRoundSummaryKey = useRef<string | null>(null);

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
    if (data?.selectedTour?.status === "archived") return;
    const interval = window.setInterval(() => {
      load().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [data?.selectedTour?.status, load]);

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
  const pastTours = data?.tours.filter((tour) => ["bracket", "completed", "archived"].includes(tour.status)) ?? [];
  const currentRound = selected?.round;
  const viewer = selected?.viewerParticipantId ? selected.participants.find((participant) => participant.id === selected.viewerParticipantId) ?? null : null;
  const secondaryTeamNames = selected?.roundSummary?.phase === "secondary" ? selected.roundSummary.pendingParticipantNames : [];
  const visibleCandidates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!selected || !query) return selected?.candidates ?? [];
    return selected.candidates.filter((candidate) => candidate.displayName.toLowerCase().includes(query) || candidate.name.toLowerCase().includes(query));
  }, [searchTerm, selected]);
  useEffect(() => setSearchTerm(""), [selected?.id, currentRound?.id, currentRound?.phase]);
  useEffect(() => {
    const summary = selected?.roundSummary;
    if (!summary || !selected) return;
    const summaryKey = `${selected.id}:${summary.roundNumber}:${summary.phase}`;
    if (seenRoundSummaryKey.current === null) {
      seenRoundSummaryKey.current = summaryKey;
      setRoundSummaryNotice(summary);
      return;
    }
    if (seenRoundSummaryKey.current !== summaryKey) {
      seenRoundSummaryKey.current = summaryKey;
      setRoundSummaryNotice(summary);
    }
  }, [selected]);
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

  async function submitChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !selected.viewerParticipantId || !chatDraft.trim() || chatSending) return;
    setChatSending(true);
    setError(null);
    try {
      const response = await fetch("/api/speed-tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tourId: selected.id, action: "chat", content: chatDraft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chat message could not be sent");
      setData(result.data);
      setChatDraft("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chat message could not be sent");
    } finally {
      setChatSending(false);
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
      {roundSummaryNotice && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-live="polite" aria-label={`Round ${roundSummaryNotice.roundNumber} results`}>
        <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-2 border-[var(--accent)] bg-[var(--background-secondary)] p-5 shadow-2xl shadow-[var(--accent)]/20">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">Speed Tour update</p><h2 className="mt-1 text-2xl font-black text-white">Round {roundSummaryNotice.roundNumber} results</h2></div>
            <button type="button" onClick={() => setRoundSummaryNotice(null)} className="rounded-lg border border-[var(--background-tertiary)] px-3 py-1 text-sm font-bold text-[var(--foreground-muted)] hover:text-white" aria-label="Close round results">Close</button>
          </div>
          <p className="mt-3 text-sm text-[var(--foreground-muted)]">{roundSummaryNotice.phase === "secondary" ? "Initial selections are locked. The following teams need a secondary selection." : roundSummaryNotice.phase === "fallback" ? "The secondary phase is complete. The following teams need a fallback selection." : "The round is complete. Here are the Pokémon drafted by each participant."}</p>
          {roundSummaryNotice.failedSelections.length ? <div className="mt-4 rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/10 p-3"><p className="text-sm font-bold text-[var(--primary-light)]">Initial picks that did not lock in</p><p className="mt-1 text-xs text-[var(--foreground-muted)]">These were the Pokémon selected by teams whose first choice was unavailable, including duplicate picks.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{roundSummaryNotice.failedSelections.map((selection, index) => <div key={`${selection.participantName}-${selection.pokemonName}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2"><span className="font-bold text-white">{selection.participantName}</span><span className="text-right text-sm text-[var(--primary-light)]">{selection.pokemonName} <b className="text-xs">({selection.price})</b></span></div>)}</div></div> : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{roundSummaryNotice.selections.length ? roundSummaryNotice.selections.map((selection) => <div key={`${selection.participantName}-${selection.pokemonName}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 py-2"><span className="font-bold text-white">{selection.participantName}</span><span className="text-right text-sm text-[var(--accent)]">{selection.pokemonName} <b className="text-xs">({selection.price})</b></span></div>) : <p className="text-sm text-[var(--foreground-muted)]">No Pokémon were drafted in this phase.</p>}</div>
          {roundSummaryNotice.poisonResults.length ? <div className="mt-4 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm text-[var(--warning)]"><b>Poison Pill results:</b> {roundSummaryNotice.poisonResults.filter((result) => result.successful).map((result) => `${result.pokemonName} affected ${result.affectedParticipantNames.join(", ")}`).join("; ") || "No Poison Pill affected a secondary pick."}</div> : null}
          {roundSummaryNotice.pendingParticipantNames.length ? <div className="mt-4 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm text-[var(--warning)]"><b>{roundSummaryNotice.phase === "secondary" ? "Secondary selection required:" : roundSummaryNotice.phase === "fallback" ? "Fallback selection required:" : "No selection recorded:"}</b> {roundSummaryNotice.pendingParticipantNames.join(", ")}</div> : <p className="mt-4 text-sm font-bold text-[var(--success)]">Every participant has a Pokémon for this round.</p>}
        </div>
      </div>}

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
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[var(--primary)]/20 px-2 py-1 text-xs font-bold text-[var(--primary-light)]">Round {currentRound.number} / {selected.totalRounds}</span><span className="text-sm font-bold text-white">{phaseLabel(currentRound.phase)}</span>{currentRound.fallbackPriceCap !== null && <span className="text-xs text-[var(--warning)]">Price cap: {currentRound.fallbackPriceCap}</span>}</div><p className="mt-2 text-sm text-[var(--foreground-muted)]">{formatCriteria(currentRound.criteria)}</p>{currentRound.maxAffordablePrice !== null && <p className="mt-1 text-xs font-bold text-[var(--accent)]">Max this pick: {currentRound.maxAffordablePrice} pts <span className="font-normal text-[var(--foreground-muted)]">· 1 point reserved for each remaining round</span></p>}</div>
                <div className="flex min-w-28 items-center justify-center rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-4 py-3 text-center"><div><p className="text-[10px] uppercase text-[var(--foreground-muted)]">Clock</p><p className={`font-mono text-3xl font-black ${secondsLeft !== null && secondsLeft <= 10 ? "text-[var(--error)]" : "text-white"}`}>{secondsLeft === null ? "—" : `${secondsLeft}s`}</p></div></div>
              </div>
            ) : <p className="mt-5 text-sm text-[var(--foreground-muted)]">Waiting for the first round to be started by the admin.</p>}
            {currentRound?.viewerAction === "poison" && <div className="mt-4 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm text-[var(--warning)]"><b>Teams ({secondaryTeamNames.length ? secondaryTeamNames.join(", ") : "the remaining teams"}) were unable to draft their Pokemon in the initial phase.</b> Now you can &quot;poison&quot; a Pokemon so they are forced to select something worth 5 points or fewer. Select below a Pokemon you guess or predict the remaining teams will try to take.</div>}
            {currentRound?.viewerAction === "secondary" && <div className="mt-4 rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/10 p-3 text-sm text-[var(--primary-light)]"><b>OH NO, you made the same selection as someone else, choose another Pokemon.</b> If a participant &quot;poisons&quot; the Pokemon that you select during this phase, you will be forced to draft a Pokemon worth 5 points or less.</div>}
            {currentRound?.poisonResults.length ? <div className="mt-4 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 p-3 text-sm text-[var(--warning)]"><p className="font-bold">Poison Pill results</p><div className="mt-2 space-y-1">{currentRound.poisonResults.map((result) => <p key={result.pokemonId}>{result.successful ? <><b>{result.pokemonName}</b> was successfully poisoned by {result.poisonerNames.join(", ")}. {result.affectedParticipantNames.join(", ")} {result.affectedParticipantNames.length === 1 ? "must" : "must each"} use the fallback phase with a Pokemon worth 5 points or less.</> : <>Poison Pill submitted for <b>{result.pokemonName}</b> by {result.poisonerNames.join(", ")}; no secondary pick has been affected.</>}</p>)}</div></div> : null}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="poke-card overflow-hidden p-0">
              <div className="border-b border-[var(--background-tertiary)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h2 className="font-pixel text-sm text-white">Draft board</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Sorted by cost from highest to lowest.</p></div>
                  <Link href={`/seasons/${selected.priceSeasonId}/draft`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[var(--accent)]/40 px-3 py-2 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10">View {selected.priceSeasonName} board</Link>
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
              {selected.bracket.length ? <div className="poke-card overflow-hidden p-0"><div className="border-b border-[var(--background-tertiary)] p-4"><h2 className="font-pixel text-sm text-white">{bracketLabel(selected.bracketFormat)} bracket</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Matches and results update with the Speed Tour.</p></div><div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">{selected.bracket.map((match) => <div key={match.id} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3 text-xs"><div className="mb-2 flex justify-between text-[var(--foreground-muted)]"><span>{match.bracketStage.replace("-", " ")} · round {match.bracketRound} · match {match.bracketPosition}</span><span>{match.status}</span></div><div className="flex justify-between"><span>{match.participantOneName}</span><b>{match.scoreOne ?? "—"}</b></div><div className="mt-1 flex justify-between"><span>{match.participantTwoName}</span><b>{match.scoreTwo ?? "—"}</b></div>{match.gameReport && <p className="mt-2 border-t border-[var(--background-tertiary)] pt-2 text-[var(--foreground-muted)]">{match.gameReport}</p>}{match.replaySummary && <ReplaySummaryCard summary={match.replaySummary} replayUrl={match.replayUrl} />}</div>)}</div></div> : null}
            </div>
          </section>
          <section className="poke-card overflow-hidden p-0"><div className="border-b border-[var(--background-tertiary)] p-4"><div className="flex items-center justify-between gap-2"><div><h2 className="font-pixel text-sm text-white">Speed Tour chat</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Live room for participating coaches. Messages update automatically while the room is active.</p></div><span className="text-xs text-[var(--accent)]">{selected.chatMessages.length} recent</span></div></div><div className="max-h-72 space-y-2 overflow-y-auto p-4">{selected.chatMessages.length ? selected.chatMessages.map((message) => <div key={message.id} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-2 text-sm"><div className="flex items-center justify-between gap-2"><b className="text-white">{message.participantName}</b><span className="text-[10px] text-[var(--foreground-subtle)]">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div><p className="mt-1 whitespace-pre-wrap break-words text-[var(--foreground-muted)]">{message.content}</p></div>) : <p className="text-sm text-[var(--foreground-muted)]">No messages yet. Start the conversation.</p>}</div>{selected.viewerParticipantId ? <form onSubmit={submitChat} className="flex gap-2 border-t border-[var(--background-tertiary)] p-4"><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={500} placeholder="Message the room…" className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] px-3 text-sm text-white placeholder:text-[var(--foreground-subtle)]" /><button type="submit" disabled={chatSending || !chatDraft.trim()} className="btn-retro-secondary px-4 py-2 text-xs disabled:opacity-50">{chatSending ? "Sending…" : "Send"}</button></form> : <p className="border-t border-[var(--background-tertiary)] p-4 text-xs text-[var(--foreground-muted)]">Join this Speed Tour as a coach to participate in chat.</p>}</section>
          {selected.bracket.some((match) => match.replaySummary) && <section className="poke-card p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-pixel text-sm text-white">Match replay summaries</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Published results parsed from Pokémon Showdown replays.</p></div><span className="text-xs text-[var(--foreground-muted)]">Available in this Speed Tour history</span></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{selected.bracket.filter((match) => match.replaySummary).map((match) => <div key={`summary-${match.id}`} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-bold text-white">{match.participantOneName} vs {match.participantTwoName}</span><Link href={`/speed-tours/matches/${match.id}`} className="font-bold text-[var(--accent)] underline">Open summary page</Link></div><ReplaySummaryCard summary={match.replaySummary!} replayUrl={match.replayUrl} /></div>)}</div></section>}
        </div>
      )}
    </main>
  );
}
