"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Copy, Download, ExternalLink, Loader2, Search, Share2, ShieldAlert, Swords } from "lucide-react";
import { HpChart } from "@/components/hp-chart";

interface PokemonStats {
  name: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageDealtIndirect: number;
  damageTaken: number;
  damageTakenIndirect: number;
  hpRestored: number;
  revealedItems: Array<{ item: string; turn: number; source: string }>;
}

interface TurnSnapshot {
  turn: number;
  p1TotalHp: number;
  p2TotalHp: number;
}

interface KeyEvent {
  turn: number;
  type: "faint" | "win";
  player: "p1" | "p2";
  pokemon?: string;
  cause?: string;
  killer?: string;
  killerPlayer?: "p1" | "p2";
  move?: string;
}

interface ParsedReplay {
  p1Username: string;
  p2Username: string;
  p1Team: PokemonStats[];
  p2Team: PokemonStats[];
  winner: "p1" | "p2" | null;
  p1Remaining: number;
  p2Remaining: number;
  startedAt: string | null;
  endedAt: string | null;
  zoroarkInvolved: boolean;
  turnSnapshots: TurnSnapshot[];
  keyEvents: KeyEvent[];
  replayJsonUrl?: string;
}

function formatNumber(value: number) {
  return Math.round(value).toString();
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPlayerName(data: ParsedReplay, player: "p1" | "p2") {
  return player === "p1" ? data.p1Username || "Player 1" : data.p2Username || "Player 2";
}

function getDifferential(data: ParsedReplay) {
  if (data.winner === "p1") return `+${data.p1Remaining}`;
  if (data.winner === "p2") return `+${data.p2Remaining}`;
  return "Unknown";
}

function formatTeamForCopy(name: string, team: PokemonStats[]) {
  return [
    name,
    ...team.map(
      (pokemon) =>
        `${pokemon.name}: ${pokemon.kills}K/${pokemon.deaths}D, ${formatNumber(pokemon.damageDealt)} dmg, ${formatNumber(pokemon.hpRestored)} restored, item: ${pokemon.revealedItems?.map((entry) => entry.item).join(" → ") || "Unknown"}`
    ),
  ].join("\n");
}

function buildCopyResults(data: ParsedReplay, sourceUrl: string, winnerName: string) {
  const parts = [
    "Replay Analyzer Results",
    sourceUrl ? `Replay: ${sourceUrl}` : null,
    data.replayJsonUrl ? `JSON: ${data.replayJsonUrl}` : null,
    `Winner: ${winnerName}`,
    `Differential: ${getDifferential(data)}`,
    `Turns: ${data.turnSnapshots.at(-1)?.turn ?? 0}`,
    data.zoroarkInvolved ? "Warning: Zoroark/Illusion attribution should be reviewed manually." : null,
    "",
    formatTeamForCopy(data.p1Username || "Player 1", data.p1Team),
    "",
    formatTeamForCopy(data.p2Username || "Player 2", data.p2Team),
  ];

  return parts.filter((part) => part !== null).join("\n");
}

const ANALYZER_CHECKS = ["Kills", "Deaths", "Damage", "Recovery", "HP timeline", "Key events"];
const EXAMPLE_REPLAY_URL = "https://replay.pokemonshowdown.com/gen9ou-2377693385";

function validateReplayUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Enter a Pokemon Showdown replay link.";

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return "Enter a valid replay URL, such as replay.pokemonshowdown.com/gen9ou-...";
  }

  if (url.hostname.toLowerCase() !== "replay.pokemonshowdown.com") {
    return "Only public replay.pokemonshowdown.com links are supported.";
  }
  if (url.pathname.replace(/^\/+|\/+$/g, "").length < 5) {
    return "Include the replay ID after replay.pokemonshowdown.com.";
  }
  return null;
}

function TeamTable({ title, team }: { title: string; team: PokemonStats[] }) {
  return (
    <section className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--background-tertiary)]">
        <h2 className="text-sm font-black uppercase tracking-wide text-white">{title}</h2>
        <span className="text-xs font-bold text-[var(--foreground-muted)]">{team.length} Pokemon</span>
      </div>
      <div className="grid gap-3 p-3 md:hidden">
        {team.map((pokemon) => (
          <div key={pokemon.name} className="rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-sm font-black text-white">{pokemon.name}</h3>
              <div className="flex shrink-0 gap-2 text-xs font-black">
                <span className="text-[var(--success)]">{pokemon.kills}K</span>
                <span className="text-[var(--error)]">{pokemon.deaths}D</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="col-span-2">
                <div className="font-black uppercase tracking-wider text-[var(--foreground-subtle)]">Revealed item</div>
                <div className="mt-0.5 font-bold text-[var(--accent)]">
                  {pokemon.revealedItems?.map((entry) => `${entry.item} (T${entry.turn || 0})`).join(" → ") || "Unknown"}
                </div>
              </div>
              <div>
                <div className="font-black uppercase tracking-wider text-[var(--foreground-subtle)]">Damage</div>
                <div className="mt-0.5 font-bold text-[var(--foreground)]">{formatNumber(pokemon.damageDealt)}</div>
              </div>
              <div>
                <div className="font-black uppercase tracking-wider text-[var(--foreground-subtle)]">Indirect</div>
                <div className="mt-0.5 font-bold text-[var(--foreground)]">{formatNumber(pokemon.damageDealtIndirect)}</div>
              </div>
              <div>
                <div className="font-black uppercase tracking-wider text-[var(--foreground-subtle)]">Taken</div>
                <div className="mt-0.5 font-bold text-[var(--foreground-muted)]">{formatNumber(pokemon.damageTaken)}</div>
              </div>
              <div>
                <div className="font-black uppercase tracking-wider text-[var(--foreground-subtle)]">Restored</div>
                <div className="mt-0.5 font-bold text-[var(--accent)]">{formatNumber(pokemon.hpRestored)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden md:block">
        <table className="w-full table-fixed text-xs lg:text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead className="bg-[var(--background-secondary)] text-[10px] uppercase tracking-widest text-[var(--foreground-muted)]">
            <tr>
              <th className="px-2 py-3 text-left">Pokemon</th>
              <th className="px-1 py-3 text-left">Item</th>
              <th className="px-1 py-3 text-center">K</th>
              <th className="px-1 py-3 text-center">D</th>
              <th className="px-1 py-3 text-center">Dmg</th>
              <th className="px-1 py-3 text-center">Indirect</th>
              <th className="px-1 py-3 text-center">Taken</th>
              <th className="px-1 py-3 text-center">Ind. Taken</th>
              <th className="px-1 py-3 text-center">Restored</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--background-tertiary)]">
            {team.map((pokemon) => (
              <tr key={pokemon.name} className="hover:bg-[var(--glass-hover)] transition-colors">
                <td className="truncate px-2 py-3 font-bold text-white" title={pokemon.name}>{pokemon.name}</td>
                <td className="truncate px-1 py-3 text-[var(--accent)]" title={pokemon.revealedItems?.map((entry) => `${entry.item}, turn ${entry.turn}, ${entry.source}`).join(" → ") || "Unknown"}>
                  {pokemon.revealedItems?.map((entry) => entry.item).join(" → ") || "Unknown"}
                </td>
                <td className="px-1 py-3 text-center text-[var(--success)] font-bold">{pokemon.kills}</td>
                <td className="px-1 py-3 text-center text-[var(--error)] font-bold">{pokemon.deaths}</td>
                <td className="px-1 py-3 text-center text-[var(--foreground)]">{formatNumber(pokemon.damageDealt)}</td>
                <td className="px-1 py-3 text-center text-[var(--foreground)]">{formatNumber(pokemon.damageDealtIndirect)}</td>
                <td className="px-1 py-3 text-center text-[var(--foreground-muted)]">{formatNumber(pokemon.damageTaken)}</td>
                <td className="px-1 py-3 text-center text-[var(--foreground-muted)]">{formatNumber(pokemon.damageTakenIndirect)}</td>
                <td className="px-1 py-3 text-center text-[var(--accent)]">{formatNumber(pokemon.hpRestored)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AnalyzerClient() {
  const [replayUrl, setReplayUrl] = useState("");
  const [data, setData] = useState<ParsedReplay | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    const sharedReplay = new URLSearchParams(window.location.search).get("replay");
    if (sharedReplay) setReplayUrl(sharedReplay);
  }, []);

  const winnerName = useMemo(() => {
    if (!data?.winner) return "Unknown";
    return getPlayerName(data, data.winner);
  }, [data]);

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateReplayUrl(replayUrl);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");
    setData(null);

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      const res = await fetch("/api/replay-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replayUrl, preserveMegas: true }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || "Failed to analyze replay.");
      }

      setData(payload);
      setCopied(false);
    } catch (err) {
      setError(err instanceof DOMException && err.name === "AbortError"
        ? "The replay took too long to respond. Check that it is public and try again."
        : err instanceof Error ? err.message : "Failed to analyze replay.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyResults() {
    if (!data) return;

    await navigator.clipboard.writeText(buildCopyResults(data, replayUrl.trim(), winnerName));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function handleShare() {
    const url = new URL(window.location.href);
    url.searchParams.set("replay", replayUrl.trim());
    try {
      if (navigator.share) {
        await navigator.share({ title: "Replay Analyzer", text: `${winnerName} — Replay Analyzer`, url: url.toString() });
      } else {
        await navigator.clipboard.writeText(url.toString());
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    } catch {
      // Sharing can be cancelled by the user; do not show an error for that case.
    }
  }

  function handleDownload() {
    if (!data) return;
    const blob = new Blob([buildCopyResults(data, replayUrl.trim(), winnerName)], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `replay-analysis-${(data.p1Username || "player-1").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    anchor.click();
    URL.revokeObjectURL(href);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 1600);
  }

  return (
    <main className="relative z-10 min-h-screen">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <section className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--card)] p-4 shadow-xl sm:p-6">
          <div className="max-w-5xl">
            <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--background-tertiary)] bg-[var(--glass)] px-3 py-1.5 text-xs font-black uppercase tracking-widest text-[var(--accent)]">
              <BarChart3 className="h-4 w-4" />
              Replay Analyzer
            </div>
            <h1 className="mt-5 font-pixel text-2xl leading-relaxed text-white sm:text-4xl">
              Showdown replay analyzer
            </h1>
            <p className="mt-4 max-w-3xl text-sm text-[var(--foreground-muted)] sm:text-base">
              Paste any public Pokemon Showdown replay link to calculate kills, deaths, damage,
              recovery, HP swing, and key events.
            </p>
          </div>

          <form onSubmit={handleAnalyze} className="mt-6">
            <label htmlFor="replay-url" className="block text-xs font-black uppercase tracking-widest text-[var(--foreground-muted)]">
              Replay link
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                id="replay-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                maxLength={300}
                value={replayUrl}
                onChange={(event) => setReplayUrl(event.target.value)}
                placeholder="https://replay.pokemonshowdown.com/gen9..."
                className="min-w-0 flex-1 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-[var(--foreground-subtle)] focus:border-[var(--primary)]"
              />
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-[4px_4px_0px_var(--primary-dark)] transition-all hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? "Analyzing…" : "Analyze"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setReplayUrl(EXAMPLE_REPLAY_URL)}
                className="font-bold text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Try an example replay
              </button>
              <span className="text-[var(--foreground-subtle)]">Loads a public replay you can analyze immediately.</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {ANALYZER_CHECKS.map((check) => (
                <span
                  key={check}
                  className="rounded-md border border-[var(--background-tertiary)] bg-[var(--background)]/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[var(--foreground-muted)]"
                >
                  {check}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs font-bold text-[var(--foreground-subtle)]">
              Public Pokemon Showdown replay links only. Nothing is saved. Large or private replays may be rejected.
            </p>
            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/10 px-3 py-2 text-sm text-[var(--error)]">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>
        </section>

        {data && (
          <div className="space-y-8">
            <section className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--card)] p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-white">Analysis Summary</h2>
                  <p className="mt-1 text-xs font-bold text-[var(--foreground-muted)]">
                    {data.p1Username || "Player 1"} vs {data.p2Username || "Player 2"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.replayJsonUrl && (
                    <a
                      href={data.replayJsonUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-black uppercase tracking-wide text-[var(--foreground-muted)] transition-colors hover:text-white"
                    >
                      JSON
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyResults}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-black uppercase tracking-wide text-[var(--foreground-muted)] transition-colors hover:text-white"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-black uppercase tracking-wide text-[var(--foreground-muted)] transition-colors hover:text-white"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {shared ? "Link copied" : "Share"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--background-tertiary)] bg-[var(--background-secondary)] px-3 py-2 text-xs font-black uppercase tracking-wide text-[var(--foreground-muted)] transition-colors hover:text-white"
                  >
                    {downloaded ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Download className="h-3.5 w-3.5" />}
                    {downloaded ? "Saved" : "Download"}
                  </button>
                </div>
              </div>

              <nav aria-label="Analysis sections" className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {[{ id: "analyzer-stats", label: "Stats" }, { id: "analyzer-timeline", label: "Timeline" }, { id: "analyzer-events", label: "Key events" }].map((section) => (
                  <a key={section.id} href={`#${section.id}`} className="shrink-0 rounded-md border border-[var(--background-tertiary)] bg-[var(--background)]/60 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-[var(--foreground-muted)] hover:border-[var(--primary)] hover:text-white">
                    {section.label}
                  </a>
                ))}
              </nav>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border-2 border-[var(--accent)]/50 bg-[var(--background-secondary)] p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground-muted)]">Winner</div>
                  <div className="mt-2 text-xl font-black text-[var(--accent)]">{winnerName}</div>
                </div>
                <div className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground-muted)]">Differential</div>
                  <div className="mt-2 text-xl font-black text-white">{getDifferential(data)}</div>
                </div>
                <div className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground-muted)]">Turns</div>
                  <div className="mt-2 text-xl font-black text-white">{data.turnSnapshots.at(-1)?.turn ?? 0}</div>
                </div>
                <div className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground-muted)]">Started</div>
                  <div className="mt-2 text-xl font-black text-white">{formatDate(data.startedAt)}</div>
                </div>
                <div className="rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background-secondary)] p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--foreground-muted)]">Ended</div>
                  <div className="mt-2 text-xl font-black text-white">{formatDate(data.endedAt)}</div>
                </div>
              </div>
            </section>

            {data.zoroarkInvolved && (
              <div className="rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-4 py-3 text-sm font-bold text-[var(--warning)]">
                Zoroark was involved, so illusion-related attribution should be reviewed manually.
              </div>
            )}

            <section id="analyzer-stats" className="scroll-mt-24 space-y-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide text-white">Coach Stats</h2>
                <p className="mt-1 text-xs font-bold text-[var(--foreground-muted)]">
                  Parsed K/D, damage, and recovery by replay side.
                </p>
              </div>
              <div className="grid gap-6 2xl:grid-cols-2">
                <TeamTable title={data.p1Username || "Player 1"} team={data.p1Team} />
                <TeamTable title={data.p2Username || "Player 2"} team={data.p2Team} />
              </div>
              {data.zoroarkInvolved && (
                <div className="rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-4 py-3 text-sm font-bold text-[var(--warning)]">
                  Illusion may affect Pokemon attribution in the coach stats above.
                </div>
              )}
            </section>

            {data.turnSnapshots.length > 0 && (
              <section id="analyzer-timeline" className="scroll-mt-24 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--card)] p-4 sm:p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wide text-white">Battle Timeline</h2>
                    <p className="mt-1 text-xs font-bold text-[var(--foreground-muted)]">
                      {data.p1Username || "Player 1"} vs {data.p2Username || "Player 2"}
                    </p>
                  </div>
                </div>
                <HpChart
                  turnSnapshots={data.turnSnapshots}
                  keyEvents={data.keyEvents}
                  team1Name={data.p1Username || "Player 1"}
                  team2Name={data.p2Username || "Player 2"}
                  team1Color="var(--secondary-light)"
                  team2Color="var(--primary-light)"
                  p1IsCoach1={true}
                />
              </section>
            )}

            {data.keyEvents.length > 0 && (
              <section id="analyzer-events" className="scroll-mt-24 rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--card)] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--background-tertiary)]">
                  <Swords className="h-4 w-4 text-[var(--accent)]" />
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wide text-white">Key events</h2>
                    {data.zoroarkInvolved && (
                      <p className="mt-1 text-xs font-bold text-[var(--warning)]">
                        Illusion may affect faint attribution.
                      </p>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-[var(--background-tertiary)]">
                  {data.keyEvents.map((event, index) => {
                    const playerName = getPlayerName(data, event.player);
                    const killerName = event.killerPlayer ? getPlayerName(data, event.killerPlayer) : null;

                    return (
                      <div key={`${event.turn}-${event.type}-${index}`} className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="rounded bg-[var(--background-tertiary)] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--foreground-muted)]">
                            Turn {event.turn}
                          </span>
                          <span className="font-bold text-white">
                            {event.type === "win"
                              ? `${playerName} won`
                              : `${event.pokemon || "A Pokemon"} fainted for ${playerName}`}
                          </span>
                        </div>
                        {event.type === "faint" && (event.killer || event.cause || event.move) && (
                          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                            {event.killer && killerName ? `${event.killer} (${killerName})` : event.killer}
                            {event.move ? ` via ${event.move}` : ""}
                            {event.cause ? ` from ${event.cause}` : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
