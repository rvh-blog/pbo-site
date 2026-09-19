import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getSiteFeatureSettings } from "@/lib/site-settings";
import { getSpeedTourBracketMatchSummary } from "@/lib/speed-tours";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Speed Tour Match Summary",
  description: "Parsed replay summary for a completed Speed Tour match.",
};

export default async function SpeedTourMatchSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const settings = await getSiteFeatureSettings();
  if (!settings.speedToursEnabled) notFound();
  const { id } = await params;
  const match = await getSpeedTourBracketMatchSummary(Number(id));
  if (!match) notFound();
  const winner = match.replaySummary.winner === "p1" ? match.replaySummary.p1Username : match.replaySummary.winner === "p2" ? match.replaySummary.p2Username : "Not identified";

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/speed-tours?past=true" className="text-sm font-bold text-[var(--accent)] underline">← Back to Past Speed Tours</Link>
      <section className="mt-5 poke-card p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">{match.tourName} · Match summary</p>
        <h1 className="mt-2 text-2xl font-black text-white">{match.participantOneName} vs {match.participantTwoName}</h1>
        <p className="mt-2 text-sm text-[var(--foreground-muted)]">{match.bracketStage.replace("-", " ")} · Round {match.bracketRound}, match {match.bracketPosition} · Published result: {match.scoreOne}–{match.scoreTwo}</p>
        <div className="mt-5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-white">Parsed replay</h2>{match.replayUrl && <a href={match.replayUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[var(--accent)] underline">Open replay</a>}</div>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">{match.replaySummary.tier || "Pokémon Showdown replay"} · {match.replaySummary.turnCount} turns · Parser winner: <b className="text-white">{winner}</b></p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[{ name: match.replaySummary.p1Username, remaining: match.replaySummary.p1Remaining, team: match.replaySummary.p1Team }, { name: match.replaySummary.p2Username, remaining: match.replaySummary.p2Remaining, team: match.replaySummary.p2Team }].map((player) => <div key={player.name} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-3"><div className="flex items-center justify-between gap-2"><b className="text-white">{player.name}</b><span className="text-xs text-[var(--accent)]">{player.remaining} remaining</span></div><div className="mt-2 space-y-1 text-xs text-[var(--foreground-muted)]">{player.team.map((pokemon) => <p key={pokemon.name}>{pokemon.name} · {pokemon.kills} K / {pokemon.deaths} D</p>)}</div></div>)}
          </div>
          {match.replaySummary.keyEvents.length ? <div className="mt-4 border-t border-[var(--background-tertiary)] pt-3"><h2 className="text-sm font-bold text-white">Key events</h2><div className="mt-2 space-y-1 text-xs text-[var(--foreground-muted)]">{match.replaySummary.keyEvents.map((event, index) => <p key={`${event.turn}-${event.type}-${index}`}>Turn {event.turn}: {event.pokemon || event.player} {event.type}{event.killer ? ` · by ${event.killer}` : ""}{event.cause ? ` · ${event.cause}` : ""}</p>)}</div></div> : null}
        </div>
        {match.gameReport && <div className="mt-4 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background)] p-4 text-sm text-[var(--foreground-muted)]"><b className="text-white">Admin report:</b> {match.gameReport}</div>}
      </section>
    </main>
  );
}
