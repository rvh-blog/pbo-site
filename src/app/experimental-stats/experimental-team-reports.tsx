import Link from "next/link";
import type { ExperimentalAppearance, ExperimentalBattleEvent, ExperimentalMatch } from "./experimental-stats-client";

type TeamRef = {
  seasonCoachId: number;
  coachId: number;
  coachName: string;
  teamName: string;
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

export type TopPlayRecord = {
  category: string;
  value: number;
  valueLabel: string;
  detail: string;
  match: ExperimentalMatch;
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
        const eventTeam = eventTeamForMatch(match, event);
        if (!eventTeam || eventTeam.seasonCoachId !== team.seasonCoachId) continue;
        row.eventIds.add(match.id);
        if (event.eventType === "switch" || event.eventType === "drag") row.switches += 1;
        if (event.eventType === "terastallize") row.teraUses += 1;
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

export function TeamStatsReport({ matches, selectedTeamIds }: { matches: ExperimentalMatch[]; selectedTeamIds: number[] }) {
  const rows = buildTeamStats(matches, new Set(selectedTeamIds));
  const eventCoveredTeams = rows.filter((row) => row.eventGames > 0).length;
  const exportRows = [
    ["Team", "Coach", "Games", "Wins", "Losses", "Win rate", "Damage for/game", "Damage against/game", "Damage differential/game", "KOs/game", "Deaths/game", "Damage/active turn", "First faint for-against", "Switch/drag events", "Tera uses", "Event coverage"],
    ...rows.map((row) => [
      row.team.teamName,
      row.team.coachName,
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
        <div><h2 className="font-pixel text-sm text-white">Team Stats</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">Season- and division-specific team rows, using an NFL-style offense / defense / control layout. Team totals use all saved Pokemon in the filtered matches; event metrics only use attributed normalized events.</p></div>
        <button type="button" onClick={() => downloadCsv("pbo-team-stats.csv", exportRows)} className="btn-retro-secondary px-3 py-2 text-[9px]">CSV</button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Teams" value={number(rows.length)} /><StatCard label="Filtered matches" value={number(matches.length)} /><StatCard label="Damage coverage" value={number(new Set(rows.flatMap((row) => row.damageForGames ? [row.team.seasonCoachId] : [])).size)} detail="Teams with recorded damage" /><StatCard label="Event coverage" value={number(eventCoveredTeams)} detail="Teams with attributed events" /></div>
    </div>

    <div className="poke-card p-5 md:p-6">
      <div className="mb-4"><h3 className="font-pixel text-xs text-white">Offense, defense, and control</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Damage and recovery are reported only when the underlying match fields were saved. First-faint records are team-level, not persistent-coach records.</p></div>
      {rows.length ? <div className="overflow-x-auto rounded-xl border border-[var(--border)]"><table className="w-full min-w-[1180px] text-xs"><thead className="bg-[var(--background)] text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-3 text-left">Team</th><th>GP</th><th>Record</th><th>Win rate</th><th>DMG for / G</th><th>DMG against / G</th><th>Diff / G</th><th>KOs / G</th><th>Deaths / G</th><th>DMG / active turn</th><th>First faint</th><th>Switches / Tera</th></tr></thead><tbody>{rows.map((row) => { const differential = row.damageForGames && row.damageAgainstGames ? row.damageFor / row.damageForGames - row.damageAgainst / row.damageAgainstGames : null; return <tr key={row.team.seasonCoachId} className="border-t border-[var(--border)] text-center"><td className="p-3 text-left"><div className="font-bold text-white">{row.team.teamName}</div><div className="text-[10px] text-[var(--foreground-muted)]">{row.team.coachName}</div></td><td>{row.games}</td><td>{row.wins}-{row.games - row.wins}</td><td>{number(rate(row.wins, row.games) * 100, 1)}%</td><td>{perGame(row.damageFor, row.damageForGames, 1)}</td><td>{perGame(row.damageAgainst, row.damageAgainstGames, 1)}</td><td className={differential !== null && differential >= 0 ? "text-emerald-300" : "text-red-300"}>{differential === null ? "—" : number(differential, 1)}</td><td>{perGame(row.kills, row.games, 2)}</td><td>{perGame(row.deaths, row.games, 2)}</td><td>{row.turnsActive && row.turnsGames && row.damageForGames ? number(row.damageFor / row.turnsActive, 2) : "—"}</td><td>{row.firstFaintGames ? `${row.firstFaintFor}-${row.firstFaintAgainst}` : "—"}</td><td>{row.eventGames ? `${row.switches} / ${row.teraUses}` : "—"}</td></tr>; })}</tbody></table></div> : <p className="text-xs text-[var(--foreground-muted)]">No team rows match the active filters.</p>}
    </div>
  </section>;
}

export function buildTopPlays(matches: ExperimentalMatch[]) {
  const hpSwings: TopPlayRecord[] = [];
  const comebacks: TopPlayRecord[] = [];
  const earliestFaints: TopPlayRecord[] = [];
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
        hpSwings.push({ category: "HP swing", value: candidate.loss / 6, valueLabel: `${number(candidate.loss / 6, 1)}% HP`, detail: `${team.teamName} lost team HP at turn ${current.turn}`, match });
      }
    }

    if (match.p1IsCoach1 !== null && match.winnerId !== null && snapshots.length) {
      const winnerIsCoach1 = match.winnerId === match.coach1.seasonCoachId;
      const winner = winnerIsCoach1 ? match.coach1 : match.coach2;
      const loser = winnerIsCoach1 ? match.coach2 : match.coach1;
      const winnerIsP1 = winnerIsCoach1 === match.p1IsCoach1;
      const lowPoint = snapshots.map((snapshot) => ({ snapshot, lead: winnerIsP1 ? snapshot.p1TotalHp - snapshot.p2TotalHp : snapshot.p2TotalHp - snapshot.p1TotalHp })).sort((a, b) => a.lead - b.lead)[0];
      if (lowPoint && lowPoint.lead < 0) comebacks.push({ category: "Comeback", value: -lowPoint.lead / 6, valueLabel: `${number(-lowPoint.lead / 6, 1)}% deficit`, detail: `${winner.teamName} overcame ${loser.teamName} at turn ${lowPoint.snapshot.turn}`, match });
    }

    const faint = firstFaint(match);
    if (faint?.player) {
      const victimTeam = teamForPlayer(match, faint.player);
      earliestFaints.push({ category: "First faint", value: faint.turn, valueLabel: `Turn ${faint.turn}`, detail: `${faint.pokemon ?? "Pokemon"} from ${victimTeam?.teamName ?? "unknown team"}${faint.killer ? ` · ${faint.killer}${faint.move ? ` with ${faint.move}` : ""}` : ""}`, match });
    }

    for (const appearance of match.pokemon) {
      if (appearance.turnsActive === null) continue;
      const team = appearance.seasonCoachId === match.coach1.seasonCoachId ? match.coach1 : match.coach2;
      longestAppearances.push({ category: "Longest active", value: appearance.turnsActive, valueLabel: `${number(appearance.turnsActive)} turns`, detail: `${appearance.pokemonName} · ${team.teamName}`, match });
    }
  }

  return {
    hpSwings: hpSwings.sort((a, b) => b.value - a.value),
    comebacks: comebacks.sort((a, b) => b.value - a.value),
    earliestFaints: earliestFaints.sort((a, b) => a.value - b.value),
    longestAppearances: longestAppearances.sort((a, b) => b.value - a.value),
  };
}

function TopPlayList({ title, description, records }: { title: string; description: string; records: TopPlayRecord[] }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><h3 className="font-pixel text-xs text-white">{title}</h3><p className="mt-1 text-[10px] leading-4 text-[var(--foreground-muted)]">{description}</p>{records.length ? <div className="mt-4 space-y-2">{records.slice(0, 5).map((record, index) => <Link key={`${record.match.id}-${record.detail}-${index}`} href={matchHref(record.match)} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background-secondary)] p-3 transition-colors hover:border-violet-400/50"><span className="font-mono text-[10px] text-[var(--foreground-muted)]">#{index + 1}</span><span className="min-w-0"><strong className="block truncate text-xs text-white">{record.detail}</strong><span className="text-[9px] text-[var(--foreground-muted)]">{record.match.coach1.teamName} vs {record.match.coach2.teamName} · {record.match.seasonName} · {record.match.divisionName} · Week {record.match.week}</span></span><span className="whitespace-nowrap font-mono text-xs font-black text-violet-300">{record.valueLabel}</span></Link>)}</div> : <p className="mt-4 text-xs text-[var(--foreground-muted)]">No saved evidence is available in this scope.</p>}</div>;
}

export function TopPlaysReport({ matches }: { matches: ExperimentalMatch[] }) {
  const records = buildTopPlays(matches);
  const allRecords = [...records.hpSwings, ...records.comebacks, ...records.earliestFaints, ...records.longestAppearances];
  const exportRows = [["Category", "Value", "Detail", "Match", "Season", "Division", "Week"], ...allRecords.map((record) => [record.category, record.valueLabel, record.detail, `${record.match.coach1.teamName} vs ${record.match.coach2.teamName}`, record.match.seasonName, record.match.divisionName, record.match.week])];
  const timelineMatches = matches.filter((match) => match.turnSnapshots.length > 1).length;
  const faintMatches = matches.filter((match) => firstFaint(match)).length;

  return <section className="space-y-4">
    <div className="poke-card border-fuchsia-400/20 bg-fuchsia-500/[0.03] p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Top Plays</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">Replay-linked records from saved turn snapshots and faint events. This report focuses on individual battle moments, not aggregate leaderboards.</p></div><button type="button" onClick={() => downloadCsv("pbo-top-plays.csv", exportRows)} className="btn-retro-secondary px-3 py-2 text-[9px]">CSV</button></div><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Filtered matches" value={number(matches.length)} /><StatCard label="HP-swing coverage" value={number(timelineMatches)} detail="Matches with turn snapshots" /><StatCard label="Faint coverage" value={number(faintMatches)} detail="Matches with a mapped first faint" /><StatCard label="Evidence records" value={number(allRecords.length)} /></div></div>
    <div className="grid gap-4 xl:grid-cols-2"><TopPlayList title="Biggest HP swings" description="Largest saved turn-to-turn loss in team HP, shown as a percentage of a six-Pokemon team total." records={records.hpSwings} /><TopPlayList title="Biggest comebacks" description="Largest recorded team-HP deficit overcome by the eventual winner." records={records.comebacks} /><TopPlayList title="Earliest first faints" description="Fastest opening knockout based on the first mapped faint event in a replay." records={records.earliestFaints} /><TopPlayList title="Longest active appearances" description="Pokemon with the most saved turns active in one battle." records={records.longestAppearances} /></div>
  </section>;
}
