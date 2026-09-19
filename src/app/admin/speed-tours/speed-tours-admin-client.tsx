"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Criteria = {
  types?: string[];
  stat?: string;
  min?: number | null;
  max?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
} | null;

type AdminTour = {
  id: number;
  name: string;
  status: string;
  currentRound: number;
  totalRounds: number;
  budget: number;
  bracketFormat: string | null;
  registrationOpen: boolean;
  participants: Array<{ id: number; coachId: number; name: string; remainingBudget: number; selections: Array<{ id: number; roundNumber: number; name: string; price: number }> }>;
  round: { id: number; number: number; phase: string; criteria: Criteria; phaseEndsAt: string | null; fallbackPriceCap: number | null; submittedPokemonId: number | null } | null;
  bracket: Array<{ id: number; bracketRound: number; bracketPosition: number; bracketStage: string; participantOneId: number | null; participantTwoId: number | null; participantOneName: string; participantTwoName: string; winnerParticipantId: number | null; scoreOne: number | null; scoreTwo: number | null; gameReport: string | null; status: string }>;
};

type AdminData = {
  tours: AdminTour[];
  seasons: Array<{ id: number; name: string; seasonNumber: number }>;
};

const TYPES = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"];
const STATS = ["hp", "attack", "defense", "specialAttack", "specialDefense", "speed", "baseStatTotal"];

export function SpeedToursAdminClient() {
  const [data, setData] = useState<AdminData | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [priceSeasonId, setPriceSeasonId] = useState<number | "">("");
  const [type, setType] = useState("");
  const [stat, setStat] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [bracketFormat, setBracketFormat] = useState<"single" | "double">("single");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/speed-tours", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load Speed Tours");
    const next = await response.json() as AdminData;
    setData(next);
    if (!selectedTourId && next.tours[0]) setSelectedTourId(next.tours[0].id);
  }, [selectedTourId]);

  useEffect(() => { load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load Speed Tours")).finally(() => setLoading(false)); }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => load().catch(() => undefined), 3000);
    return () => window.clearInterval(interval);
  }, [load]);

  const selectedTour = useMemo(() => data?.tours.find((tour) => tour.id === selectedTourId) ?? null, [data, selectedTourId]);

  async function post(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/speed-tours", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Speed Tour update failed");
      setMessage(successMessage);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Speed Tour update failed");
    } finally {
      setSaving(false);
    }
  }

  function criteriaPayload(): Criteria {
    const criteria: Criteria = {
      types: type ? [type] : undefined,
      stat: stat || undefined,
      min: min ? Number(min) : null,
      max: max ? Number(max) : null,
      priceMax: priceMax ? Number(priceMax) : null,
    };
    return criteria;
  }

  if (loading) return <div className="p-8 text-sm text-[var(--foreground-muted)]">Loading Speed Tours…</div>;

  return (
    <div className="space-y-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Off-season event control</p><h1 className="mt-2 font-pixel text-2xl text-white">Speed Tours</h1><p className="mt-2 max-w-3xl text-sm text-[var(--foreground-muted)]">Create isolated eight-round events with a 90-point budget. These teams, picks, brackets, scores, reports, and future analytics stay separate from regular-season and playoff data.</p></div>
      {message && <div className="rounded-lg border border-[var(--success)]/40 bg-[var(--success)]/10 p-3 text-sm text-[var(--success)]">{message}</div>}
      {error && <div className="rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/10 p-3 text-sm text-[var(--error)]">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle>Create Speed Tour</CardTitle><p className="text-sm text-[var(--foreground-muted)]">The event remains in a registration lobby so coaches can opt in before Round 1 starts.</p></CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-sm font-bold text-white">Event name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Water Week Speed Tour" className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
            <label className="block text-sm font-bold text-white">Price source<select value={priceSeasonId} onChange={(event) => setPriceSeasonId(Number(event.target.value) || "")} className="mt-1 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="">Select season</option>{data?.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
            <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-xs text-[var(--foreground-muted)]">After creation, logged-in coaches join from the public Speed Tours room. Registration closes when Round 1 starts.</div>
            <button type="button" disabled={saving || !name.trim() || !priceSeasonId} onClick={() => post({ action: "create", name, priceSeasonId }, "Speed Tour created")} className="btn-retro w-full px-4 py-3 text-xs disabled:opacity-50">Create event</button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Event manager</CardTitle><p className="text-sm text-[var(--foreground-muted)]">Start one round at a time. The server owns the 45-second clock and resolves submissions.</p></CardHeader>
          <CardContent className="space-y-4">
            <select value={selectedTourId ?? ""} onChange={(event) => setSelectedTourId(Number(event.target.value) || null)} className="min-h-11 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm"><option value="">Select event</option>{data?.tours.map((tour) => <option key={tour.id} value={tour.id}>{tour.name} · {tour.status}</option>)}</select>
            {selectedTour ? <>
              <div className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs uppercase text-[var(--foreground-muted)]">Round</p><p className="text-lg font-black text-white">{selectedTour.currentRound} / {selectedTour.totalRounds}</p></div><div><p className="text-xs uppercase text-[var(--foreground-muted)]">Phase</p><p className="text-lg font-black text-[var(--accent)]">{selectedTour.round?.phase ?? "waiting"}</p></div><div><p className="text-xs uppercase text-[var(--foreground-muted)]">Teams</p><p className="text-lg font-black text-white">{selectedTour.participants.length}</p></div></div></div>
              <div className="rounded-lg border border-[var(--card-border)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="font-bold text-white">Participants</h3><p className="text-xs text-[var(--foreground-muted)]">{selectedTour.registrationOpen ? "Registration is open on the public Speed Tours page." : "Registration is closed."}</p></div>
                  <div className="flex flex-wrap gap-2">
                    {selectedTour.round && !["waiting", "complete"].includes(selectedTour.round.phase) && <><button type="button" disabled={saving} onClick={() => post({ action: "force-advance", tourId: selectedTour.id }, "Current phase resolved")} className="btn-retro-secondary px-3 py-2 text-xs disabled:opacity-50">Resolve phase now</button><button type="button" disabled={saving} onClick={() => { if (window.confirm("Force the next round? Participants without a successful pick will skip this team slot.")) post({ action: "force-next-round", tourId: selectedTour.id }, "Advanced to the next round"); }} className="btn-retro-secondary px-3 py-2 text-xs disabled:opacity-50">Force next round</button></>}
                    {!['completed', 'archived'].includes(selectedTour.status) && <button type="button" disabled={saving} onClick={() => { if (window.confirm(`End ${selectedTour.name}? Active drafting will stop immediately.`)) post({ action: "end-tour", tourId: selectedTour.id }, "Speed Tour ended"); }} className="rounded-lg border border-[var(--error)]/60 px-3 py-2 text-xs font-bold text-[var(--error)] disabled:opacity-50">End Speed Tour</button>}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {selectedTour.participants.length ? selectedTour.participants.map((participant) => <div key={participant.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--background)] px-3 py-2"><div><p className="text-sm font-bold text-white">{participant.name}</p><p className="text-[10px] text-[var(--foreground-muted)]">{participant.remainingBudget} points left · {participant.selections.length} picks</p></div><button type="button" disabled={saving || selectedTour.bracket.length > 0} onClick={() => { if (window.confirm(`Remove ${participant.name} from ${selectedTour.name}? Their Speed Tour picks will also be removed.`)) post({ action: "remove-participant", tourId: selectedTour.id, participantId: participant.id }, `${participant.name} removed`); }} className="rounded border border-[var(--error)]/40 px-2 py-1 text-[10px] font-bold uppercase text-[var(--error)] disabled:opacity-40">Remove</button></div>) : <p className="text-sm text-[var(--foreground-subtle)]">No coaches have joined yet.</p>}
                </div>
              </div>
              {selectedTour.round?.phase === "waiting" && selectedTour.currentRound <= 6 && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-white">Type restriction<select value={type} onChange={(event) => setType(event.target.value)} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--background)] p-2 text-sm"><option value="">Any type</option>{TYPES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label><label className="text-sm font-bold text-white">Stat filter<select value={stat} onChange={(event) => setStat(event.target.value)} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--background)] p-2 text-sm"><option value="">No stat threshold</option>{STATS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label><label className="text-sm font-bold text-white">Minimum<input value={min} onChange={(event) => setMin(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--background)] p-2 text-sm" /></label><label className="text-sm font-bold text-white">Maximum<input value={max} onChange={(event) => setMax(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--background)] p-2 text-sm" /></label><label className="text-sm font-bold text-white">Maximum price<input value={priceMax} onChange={(event) => setPriceMax(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--background)] p-2 text-sm" /></label></div>}
              {selectedTour.round?.phase === "waiting" && <button type="button" disabled={saving || !selectedTour.participants.length || selectedTour.status === "completed"} onClick={() => post({ action: "start-round", tourId: selectedTour.id, criteria: selectedTour.currentRound <= 6 ? criteriaPayload() : null }, `Round ${selectedTour.currentRound} started`)} className="btn-retro px-4 py-3 text-xs disabled:opacity-50">Start round {selectedTour.currentRound}{selectedTour.currentRound > 6 ? " (unrestricted)" : ""}</button>}
              <div className="rounded-lg border border-[var(--card-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-white">Bracket</h3><p className="text-xs text-[var(--foreground-muted)]">Available after all eight team slots are filled. Score and game-report fields stay inside Speed Tours.</p></div><div className="flex gap-2"><select value={bracketFormat} onChange={(event) => setBracketFormat(event.target.value as "single" | "double")} className="rounded border border-[var(--card-border)] bg-[var(--background)] px-2 py-2 text-xs"><option value="single">Single elimination</option><option value="double">Double elimination</option></select><button type="button" disabled={saving} onClick={() => post({ action: "create-bracket", tourId: selectedTour.id, format: bracketFormat }, "Bracket created")} className="btn-retro-secondary px-3 py-2 text-xs disabled:opacity-50">Create bracket</button></div></div>
                {selectedTour.bracket.length ? <div className="mt-4 space-y-3">{selectedTour.bracket.map((match) => <BracketResultEditor key={match.id} match={match} participants={selectedTour.participants} saving={saving} onSave={(body) => post({ action: "bracket-result", ...body }, "Bracket result saved")} />)}</div> : <p className="mt-3 text-sm text-[var(--foreground-subtle)]">No bracket created yet.</p>}
              </div>
            </> : <p className="text-sm text-[var(--foreground-muted)]">Choose an event to manage it.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BracketResultEditor({ match, participants, saving, onSave }: { match: AdminTour["bracket"][number]; participants: AdminTour["participants"]; saving: boolean; onSave: (body: Record<string, unknown>) => void }) {
  const [winner, setWinner] = useState(match.winnerParticipantId ?? match.participantOneId ?? match.participantTwoId ?? "");
  const [scoreOne, setScoreOne] = useState(match.scoreOne?.toString() ?? "");
  const [scoreTwo, setScoreTwo] = useState(match.scoreTwo?.toString() ?? "");
  const [gameReport, setGameReport] = useState(match.gameReport ?? "");
  const canSubmit = match.participantOneId && match.participantTwoId && winner;
  return <div className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3"><div className="mb-3 flex items-center justify-between text-xs text-[var(--foreground-muted)]"><span>{match.bracketStage.replace("-", " ")} · round {match.bracketRound} · match {match.bracketPosition}</span><span>{match.status}</span></div><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs font-bold text-white">Winner<select value={winner} onChange={(event) => setWinner(Number(event.target.value) || "")} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--background-secondary)] p-2 text-xs"><option value="">Select winner</option>{[match.participantOneId, match.participantTwoId].filter((id): id is number => id !== null).map((id) => <option key={id} value={id}>{participants.find((participant) => participant.id === id)?.name ?? "Team"}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-white">Score 1<input value={scoreOne} onChange={(event) => setScoreOne(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--background-secondary)] p-2 text-xs" /></label><label className="text-xs font-bold text-white">Score 2<input value={scoreTwo} onChange={(event) => setScoreTwo(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--background-secondary)] p-2 text-xs" /></label></div></div><label className="mt-3 block text-xs font-bold text-white">Game report<textarea value={gameReport} onChange={(event) => setGameReport(event.target.value)} rows={2} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--background-secondary)] p-2 text-xs" placeholder="Battle report, replay notes, or result summary" /></label><button type="button" disabled={saving || !canSubmit} onClick={() => onSave({ matchId: match.id, winnerParticipantId: winner, scoreOne: Number(scoreOne), scoreTwo: Number(scoreTwo), gameReport })} className="btn-retro-secondary mt-3 px-3 py-2 text-xs disabled:opacity-50">Save result</button></div>;
}
