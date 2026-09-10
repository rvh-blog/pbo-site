"use client";

import { useState } from "react";
import type { ExperimentalAppearance, ExperimentalMatch } from "./experimental-stats-client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDistinctHeldItemNames, isTransferredItemReveal } from "@/lib/revealed-items";

type InsightAppearance = ExperimentalAppearance & { match: ExperimentalMatch; coachId: number; coachName: string; teamName: string; won: boolean };
type RecordRow = { wins: number; losses: number; games: number };
const format = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
const damage = (appearance: ExperimentalAppearance) => (appearance.damageDealt ?? 0) + (appearance.damageDealtIndirect ?? 0);
const matchTurns = (match: ExperimentalMatch) => Math.max(0, ...match.turnSnapshots.map((snapshot) => snapshot.turn), ...match.keyEvents.map((event) => event.turn));
const winnerSide = (match: ExperimentalMatch) => match.winnerId === match.coach1.seasonCoachId ? "coach1" : match.winnerId === match.coach2.seasonCoachId ? "coach2" : null;
const playerSide = (match: ExperimentalMatch, player?: "p1" | "p2") => !player || match.p1IsCoach1 === null ? null : (player === "p1") === match.p1IsCoach1 ? "coach1" : "coach2";
const firstFaint = (match: ExperimentalMatch) => match.keyEvents.filter((event) => event.type === "faint").sort((a, b) => a.turn - b.turn)[0];
const percent = (value: number, total: number) => total ? `${format(value / total * 100, 1)}%` : "—";
const heldItemNames = (appearance: ExperimentalAppearance) => getDistinctHeldItemNames(appearance.revealedItems.filter((reveal) => !isTransferredItemReveal(reveal.source)));

function coachGameStats(rows: InsightAppearance[]) {
  const groupedGames = new Map<number, InsightAppearance[]>();
  rows.forEach((appearance) => groupedGames.set(appearance.match.id, [...(groupedGames.get(appearance.match.id) ?? []), appearance]));
  let wins = 0;
  let recordedDamage = 0;
  let damageGames = 0;
  for (const gameRows of groupedGames.values()) {
    if (gameRows[0]?.won) wins += 1;
    const coveredRows = gameRows.filter((appearance) => appearance.damageDealt !== null);
    if (coveredRows.length) {
      recordedDamage += coveredRows.reduce((sum, appearance) => sum + damage(appearance), 0);
      damageGames += 1;
    }
  }
  return { games: groupedGames.size, wins, recordedDamage, damageGames };
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function combinations(names: string[], size: 2 | 3) {
  const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b)); const output: string[][] = [];
  const visit = (start: number, selected: string[]) => { if (selected.length === size) { output.push(selected); return; } for (let index = start; index < sorted.length; index += 1) visit(index + 1, [...selected, sorted[index]]); };
  visit(0, []); return output;
}

export function ExperimentalInsights({ matches, appearances }: { matches: ExperimentalMatch[]; appearances: InsightAppearance[] }) {
  const [compareA, setCompareA] = useState<number | null>(matches[0]?.id ?? null);
  const [compareB, setCompareB] = useState<number | null>(matches[1]?.id ?? matches[0]?.id ?? null);
  const [momentumMatchId, setMomentumMatchId] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const activeCompareA = compareA && matches.some((match) => match.id === compareA) ? compareA : matches[0]?.id ?? null;
  const activeCompareB = compareB && matches.some((match) => match.id === compareB) ? compareB : matches[1]?.id ?? matches[0]?.id ?? null;

  const firstFaintRows = matches.flatMap((match) => { const faint = firstFaint(match); const side = playerSide(match, faint?.player); const winner = winnerSide(match); return faint && side && winner ? [{ match, faint, comeback: side === winner }] : []; });
  const firstFaintWins = firstFaintRows.filter((row) => !row.comeback).length; const comebackWins = firstFaintRows.filter((row) => row.comeback).length;
  const conversion = new Map<number, { name: string; kills: number; deaths: number; appearances: number }>();
  appearances.forEach((appearance) => { const row = conversion.get(appearance.pokemonId) ?? { name: appearance.pokemonName, kills: 0, deaths: 0, appearances: 0 }; row.kills += appearance.kills; row.deaths += appearance.deaths; row.appearances += 1; conversion.set(appearance.pokemonId, row); });
  const conversionRows = [...conversion.values()].filter((row) => row.kills + row.deaths > 0).map((row) => ({ ...row, rate: row.kills / (row.kills + row.deaths) * 100 })).sort((a, b) => b.rate - a.rate || b.kills - a.kills).slice(0, 6);

  const teamDamage = new Map<string, number>();
  matches.forEach((match) => match.pokemon.forEach((appearance) => teamDamage.set(`${match.id}:${appearance.seasonCoachId}`, (teamDamage.get(`${match.id}:${appearance.seasonCoachId}`) ?? 0) + damage(appearance))));
  const shareRows = new Map<number, { name: string; total: number; covered: number }>();
  appearances.filter((appearance) => appearance.damageDealt !== null).forEach((appearance) => { const total = teamDamage.get(`${appearance.match.id}:${appearance.seasonCoachId}`) ?? 0; if (!total) return; const row = shareRows.get(appearance.pokemonId) ?? { name: appearance.pokemonName, total: 0, covered: 0 }; row.total += damage(appearance) / total * 100; row.covered += 1; shareRows.set(appearance.pokemonId, row); });
  const topShare = [...shareRows.values()].map((row) => ({ ...row, average: row.total / row.covered })).sort((a, b) => b.average - a.average).slice(0, 6);

  const koMoves = new Map<string, number>();
  matches.forEach((match) => match.keyEvents.filter((event) => event.type === "faint" && event.move).forEach((event) => { const move = event.move?.trim(); if (move) koMoves.set(move, (koMoves.get(move) ?? 0) + 1); }));
  const topKoMoves = [...koMoves].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const matchupMap = new Map<string, RecordRow & { left: string; right: string }>();
  matches.forEach((match) => { const left = match.pokemon.filter((appearance) => appearance.seasonCoachId === match.coach1.seasonCoachId); const right = match.pokemon.filter((appearance) => appearance.seasonCoachId === match.coach2.seasonCoachId); left.forEach((a) => right.forEach((b) => { const key = `${a.pokemonName}|${b.pokemonName}`; const row = matchupMap.get(key) ?? { left: a.pokemonName, right: b.pokemonName, wins: 0, losses: 0, games: 0 }; row.games += 1; if (match.winnerId === match.coach1.seasonCoachId) row.wins += 1; else row.losses += 1; matchupMap.set(key, row); })); });
  const matchups = [...matchupMap.values()].filter((row) => row.games >= 2).sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 8);

  const coachRows = [...new Map(appearances.map((appearance) => [appearance.coachId, appearance.coachName])).entries()].map(([coachId, coachName]) => {
    const rows = appearances.filter((appearance) => appearance.coachId === coachId);
    const pokemon = new Map<string, number>();
    rows.forEach((appearance) => pokemon.set(appearance.pokemonName, (pokemon.get(appearance.pokemonName) ?? 0) + 1));
    const favorite = [...pokemon].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { coachId, coachName, ...coachGameStats(rows), favorite: favorite?.[0] ?? "—" };
  }).sort((a, b) => b.wins - a.wins || b.games - a.games || a.coachName.localeCompare(b.coachName)).slice(0, 20);

  const itemRows = new Map<string, { item: string; wins: number; appearances: number }>();
  appearances.flatMap((appearance) => heldItemNames(appearance).map((item) => ({ appearance, item }))).forEach(({ appearance, item }) => { const row = itemRows.get(item) ?? { item, wins: 0, appearances: 0 }; row.appearances += 1; if (appearance.won) row.wins += 1; itemRows.set(item, row); });
  const topItems = [...itemRows.values()].sort((a, b) => b.appearances - a.appearances).slice(0, 8);

  const paceRows = matches.map((match) => ({ match, turns: matchTurns(match) })).filter((row) => row.turns > 0); const sortedPaceTurns = paceRows.map((row) => row.turns).sort((a, b) => a - b); const averageTurns = paceRows.length ? paceRows.reduce((sum, row) => sum + row.turns, 0) / paceRows.length : null; const medianTurns = sortedPaceTurns.length ? sortedPaceTurns.length % 2 ? sortedPaceTurns[Math.floor(sortedPaceTurns.length / 2)] : (sortedPaceTurns[sortedPaceTurns.length / 2 - 1] + sortedPaceTurns[sortedPaceTurns.length / 2]) / 2 : null; const averageFirstFaint = firstFaintRows.length ? firstFaintRows.reduce((sum, row) => sum + row.faint.turn, 0) / firstFaintRows.length : null;
  const momentumMatches = matches.filter((match) => match.turnSnapshots.length > 0 && match.p1IsCoach1 !== null);
  const momentumMatch = momentumMatches.find((match) => match.id === momentumMatchId) ?? momentumMatches[0] ?? null;
  const momentumSelectWidth = Math.min(560, Math.max(320, ...momentumMatches.map((match) => (`${match.coach1.teamName} vs ${match.coach2.teamName} · W${match.week}`).length * 7 + 48), 320));
  const momentumData = momentumMatch?.turnSnapshots.map((snapshot) => ({
    turn: snapshot.turn,
    [momentumMatch.coach1.teamName]: Math.round(momentumMatch.p1IsCoach1 === false ? snapshot.p2TotalHp : snapshot.p1TotalHp),
    [momentumMatch.coach2.teamName]: Math.round(momentumMatch.p1IsCoach1 === false ? snapshot.p1TotalHp : snapshot.p2TotalHp),
  })) ?? [];

  const coreMap = new Map<string, RecordRow & { core: string }>();
  matches.forEach((match) => [match.coach1.seasonCoachId, match.coach2.seasonCoachId].forEach((seasonCoachId) => combinations(match.pokemon.filter((appearance) => appearance.seasonCoachId === seasonCoachId).map((appearance) => appearance.pokemonName), 3).forEach((core) => { const key = core.join("|"); const row = coreMap.get(key) ?? { core: core.join(" + "), wins: 0, losses: 0, games: 0 }; row.games += 1; if (match.winnerId === seasonCoachId) row.wins += 1; else row.losses += 1; coreMap.set(key, row); })));
  const topCores = [...coreMap.values()].filter((row) => row.games >= 2).sort((a, b) => b.wins - a.wins || b.games - a.games).slice(0, 6);
  const stageRows = coachRows.map((coach) => {
    const rows = appearances.filter((appearance) => appearance.coachId === coach.coachId);
    const regular = coachGameStats(rows.filter((appearance) => appearance.match.week <= 100));
    const playoffs = coachGameStats(rows.filter((appearance) => appearance.match.week > 100));
    return { ...coach, regular, playoffs };
  }).filter((row) => row.regular.games && row.playoffs.games).slice(0, 8);
  const scopedRowsByMatch = new Map<number, InsightAppearance[]>();
  appearances.forEach((appearance) => scopedRowsByMatch.set(appearance.match.id, [...(scopedRowsByMatch.get(appearance.match.id) ?? []), appearance]));
  const coachRecords = new Map<number, RecordRow>();
  matches.forEach((match) => [match.coach1, match.coach2].forEach((coach) => { const row = coachRecords.get(coach.seasonCoachId) ?? { wins: 0, losses: 0, games: 0 }; row.games += 1; if (match.winnerId === coach.seasonCoachId) row.wins += 1; else if (match.winnerId !== null) row.losses += 1; coachRecords.set(coach.seasonCoachId, row); }));
  const opponentMap = new Map<number, { teamName: string; coachName: string; games: number; wins: number; damage: number; damageGames: number; favorite: Map<string, number> }>();
  const strengthMap = new Map<string, { label: string; games: number; wins: number; damage: number; damageGames: number }>();
  const teamMatchupMap = new Map<string, { left: string; right: string; games: number; leftWins: number; rightWins: number; leftDamage: number; rightDamage: number; damageGames: number; leftPokemon: Map<string, number>; rightPokemon: Map<string, number> }>();
  matches.forEach((match) => {
    const activeRows = scopedRowsByMatch.get(match.id) ?? [];
    const sides = [match.coach1, match.coach2];
    sides.forEach((owner, index) => {
      const opponent = sides[index === 0 ? 1 : 0];
      const ownRows = activeRows.filter((appearance) => appearance.seasonCoachId === owner.seasonCoachId);
      if (!ownRows.length) return;
      const opponentRow = opponentMap.get(opponent.seasonCoachId) ?? { teamName: opponent.teamName, coachName: opponent.coachName, games: 0, wins: 0, damage: 0, damageGames: 0, favorite: new Map<string, number>() };
      opponentRow.games += 1;
      if (match.winnerId === owner.seasonCoachId) opponentRow.wins += 1;
      const recordedRows = ownRows.filter((appearance) => appearance.damageDealt !== null);
      opponentRow.damage += ownRows.reduce((sum, appearance) => sum + damage(appearance), 0);
      opponentRow.damageGames += recordedRows.length ? 1 : 0;
      ownRows.forEach((appearance) => opponentRow.favorite.set(appearance.pokemonName, (opponentRow.favorite.get(appearance.pokemonName) ?? 0) + 1));
      opponentMap.set(opponent.seasonCoachId, opponentRow);
      const opponentRecord = coachRecords.get(opponent.seasonCoachId);
      const opponentWinRate = opponentRecord && opponentRecord.games ? opponentRecord.wins / opponentRecord.games : 0;
      const strengthLabel = opponentWinRate >= 0.5 ? "Winning opponents (50%+ record)" : "Non-winning opponents (<50% record)";
      const strengthRow = strengthMap.get(strengthLabel) ?? { label: strengthLabel, games: 0, wins: 0, damage: 0, damageGames: 0 };
      strengthRow.games += 1;
      if (match.winnerId === owner.seasonCoachId) strengthRow.wins += 1;
      strengthRow.damage += ownRows.reduce((sum, appearance) => sum + damage(appearance), 0);
      strengthRow.damageGames += recordedRows.length ? 1 : 0;
      strengthMap.set(strengthLabel, strengthRow);
    });
    const [left, right] = sides[0].seasonCoachId < sides[1].seasonCoachId ? sides : [sides[1], sides[0]];
    const leftRows = activeRows.filter((appearance) => appearance.seasonCoachId === left.seasonCoachId);
    const rightRows = activeRows.filter((appearance) => appearance.seasonCoachId === right.seasonCoachId);
    if (!leftRows.length || !rightRows.length) return;
    const matchupKey = `${left.seasonCoachId}|${right.seasonCoachId}`;
    const matchup = teamMatchupMap.get(matchupKey) ?? { left: left.teamName, right: right.teamName, games: 0, leftWins: 0, rightWins: 0, leftDamage: 0, rightDamage: 0, damageGames: 0, leftPokemon: new Map<string, number>(), rightPokemon: new Map<string, number>() };
    matchup.games += 1;
    if (match.winnerId === left.seasonCoachId) matchup.leftWins += 1;
    if (match.winnerId === right.seasonCoachId) matchup.rightWins += 1;
    matchup.leftDamage += leftRows.reduce((sum, appearance) => sum + damage(appearance), 0);
    matchup.rightDamage += rightRows.reduce((sum, appearance) => sum + damage(appearance), 0);
    if (leftRows.some((appearance) => appearance.damageDealt !== null) && rightRows.some((appearance) => appearance.damageDealt !== null)) matchup.damageGames += 1;
    leftRows.forEach((appearance) => matchup.leftPokemon.set(appearance.pokemonName, (matchup.leftPokemon.get(appearance.pokemonName) ?? 0) + 1));
    rightRows.forEach((appearance) => matchup.rightPokemon.set(appearance.pokemonName, (matchup.rightPokemon.get(appearance.pokemonName) ?? 0) + 1));
    teamMatchupMap.set(matchupKey, matchup);
  });
  const opponentRows = [...opponentMap.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 12);
  const strengthRows = [...strengthMap.values()].sort((a, b) => b.games - a.games);
  const teamMatchupRows = [...teamMatchupMap.values()].sort((a, b) => b.games - a.games || (b.leftWins + b.rightWins) - (a.leftWins + a.rightWins)).slice(0, 12);
  const battleLengthRows = [{ label: "Short battles (1–20 turns)", min: 1, max: 20 }, { label: "Standard battles (21–50 turns)", min: 21, max: 50 }, { label: "Long battles (51+ turns)", min: 51, max: Infinity }].map((bucket) => { const bucketMatches = paceRows.filter((row) => row.turns >= bucket.min && row.turns <= bucket.max); const bucketFaints = firstFaintRows.filter((row) => bucketMatches.some((matchRow) => matchRow.match.id === row.match.id)); return { label: bucket.label, games: bucketMatches.length, averageTurns: bucketMatches.length ? bucketMatches.reduce((sum, row) => sum + row.turns, 0) / bucketMatches.length : null, firstFaintRate: percent(bucketFaints.length, bucketMatches.length), comebacks: bucketFaints.filter((row) => row.comeback).length }; }).filter((row) => row.games);

  const addedReports = <>
    <div className="grid gap-4 xl:grid-cols-2"><DataTable title="Opponent splits" description="Performance against each opposing team in the active replay scope. Games count once per matchup; damage uses visible recorded fields." headers={["Opponent", "Games", "Record", "Win rate", "Damage / game", "Favorite"]} rows={opponentRows.map((row) => { const favorite = [...row.favorite].sort((a, b) => b[1] - a[1])[0]; return [`${row.teamName} · ${row.coachName}`, row.games, `${row.wins}-${row.games - row.wins}`, percent(row.wins, row.games), row.damageGames ? format(row.damage / row.damageGames, 1) : "—", favorite?.[0] ?? "—"]; })} empty="No opponent splits are available in this scope." /><DataTable title="Opponent-strength splits" description="Results against opponents with a winning versus non-winning record in the active replay scope. This is descriptive, not a rating system." headers={["Opponent tier", "Games", "Record", "Win rate", "Damage / game"]} rows={strengthRows.map((row) => [row.label, row.games, `${row.wins}-${row.games - row.wins}`, percent(row.wins, row.games), row.damageGames ? format(row.damage / row.damageGames, 1) : "—"])} empty="No opponent-strength split is available." /></div>
    <div className="grid gap-4 xl:grid-cols-2"><DataTable title="Situational stats" description="Battle-length context from saved timelines, including first-faint and comeback patterns." headers={["Situation", "Games", "Avg turns", "Faint order recorded", "Comebacks"]} rows={battleLengthRows.map((row) => [row.label, row.games, row.averageTurns === null ? "—" : format(row.averageTurns, 1), row.firstFaintRate, row.comebacks])} empty="No saved turn timelines are available for situational splits." /><DataTable title="Coach matchup report" description="Head-to-head coach/team pairings with recorded team damage and the most-used Pokémon on each side." headers={["Matchup", "Games", "Record (left-right)", "Left win rate", "Damage / game", "Most-used Pokémon"]} rows={teamMatchupRows.map((row) => { const leftTop = [...row.leftPokemon].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"; const rightTop = [...row.rightPokemon].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"; return [`${row.left} vs ${row.right}`, row.games, `${row.leftWins}-${row.rightWins}`, percent(row.leftWins, row.games), row.damageGames ? format((row.leftDamage + row.rightDamage) / row.damageGames, 1) : "—", `${leftTop} · ${rightTop}`]; })} empty="No repeated coach/team matchups are available." /></div>
  </>;
  const selectedA = matches.find((match) => match.id === activeCompareA) ?? matches[0]; const selectedB = matches.find((match) => match.id === activeCompareB) ?? matches[1] ?? matches[0];
  const coverage = { timelines: matches.filter((match) => match.turnSnapshots.length > 0).length, faintLogs: matches.filter((match) => match.keyEvents.length > 0).length, moves: appearances.filter((appearance) => appearance.moveDataRecorded).length, items: appearances.filter((appearance) => appearance.itemDataRecorded).length };
  const saveReport = () => { window.localStorage.setItem("pbo-experimental-stats-report", JSON.stringify({ savedAt: new Date().toISOString(), matches: matches.length, appearances: appearances.length })); setSaved(true); window.setTimeout(() => setSaved(false), 1800); };
  const exportCoachRows = () => downloadCsv("pbo-coach-tendencies.csv", [["Coach", "Games", "Wins", "Win rate", "Favorite Pokemon", "Recorded damage per game"], ...coachRows.map((row) => [row.coachName, row.games, row.wins, percent(row.wins, row.games), row.favorite, row.damageGames ? format(row.recordedDamage / row.damageGames, 1) : ""])]);

  return <section className="space-y-4">
    {addedReports}
    <div className="poke-card border-violet-400/25 bg-violet-500/[0.04] p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-pixel text-sm text-white">Insights overview</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--foreground-muted)]">Momentum, matchups, roles, pace, items, cores, and playoff changes from the active replay filters.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={saveReport} className="btn-retro-secondary px-3 py-2 text-[9px]">{saved ? "Saved" : "Save report"}</button><button type="button" onClick={exportCoachRows} className="btn-retro-secondary px-3 py-2 text-[9px]">Export tendencies</button></div></div><div className="mt-4 flex flex-wrap gap-2 text-[9px] font-bold"><ConfidenceBadge tone="full" text={`${coverage.timelines}/${matches.length} timelines`} /><ConfidenceBadge tone="partial" text={`${coverage.faintLogs}/${matches.length} faint logs`} /><ConfidenceBadge tone="full" text={`${coverage.moves}/${appearances.length} move records`} /><ConfidenceBadge tone="limited" text="Role labels are evidence-based proxies" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><InsightCard label="First-faint advantage" value={percent(firstFaintWins, firstFaintRows.length)} detail={firstFaintRows.length ? `${firstFaintWins} of ${firstFaintRows.length} mapped matches` : "No mapped faint order yet"} /><InsightCard label="Comeback wins" value={format(comebackWins)} detail="Winner was first to lose a Pokémon" /><InsightCard label="Average match pace" value={averageTurns === null ? "—" : `${format(averageTurns, 1)} turns`} detail={averageFirstFaint === null ? "First faint timing unavailable" : `First faint at turn ${format(averageFirstFaint, 1)}`} /><InsightCard label="Item coverage" value={percent(coverage.items, appearances.length)} detail="Appearances with saved item data" /></div></div>
    <div className="grid gap-4 xl:grid-cols-2"><div className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-pixel text-xs text-white">Battle momentum</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Team HP is a momentum proxy. It shows who held the lead, not every tactical decision.</p></div><label className="text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Replay<select value={momentumMatch?.id ?? ""} onChange={(event) => setMomentumMatchId(Number(event.target.value))} style={{ width: `${momentumSelectWidth}px` }} className="ml-2 max-w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-[10px] font-bold text-white"><option value="">Choose replay</option>{momentumMatches.map((match) => <option key={match.id} value={match.id}>{match.coach1.teamName} vs {match.coach2.teamName} · W{match.week}</option>)}</select></label></div>{momentumData.length ? <div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={momentumData}><CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" /><XAxis dataKey="turn" stroke="var(--foreground-muted)" tick={{ fontSize: 9 }} /><YAxis stroke="var(--foreground-muted)" tick={{ fontSize: 9 }} /><Tooltip contentStyle={{ background: "var(--background-secondary)", border: "1px solid var(--border)" }} /><Legend wrapperStyle={{ fontSize: 10 }} /><Line type="monotone" dataKey={momentumMatch?.coach1.teamName} stroke="#22d3ee" dot={false} /><Line type="monotone" dataKey={momentumMatch?.coach2.teamName} stroke="#e879f9" dot={false} /></LineChart></ResponsiveContainer></div> : <EmptyMessage text="No saved team HP timeline is available in this scope." />}</div><div className="poke-card p-5 md:p-6"><h3 className="font-pixel text-xs text-white">Battle pace records</h3><div className="mt-4 grid grid-cols-2 gap-3"><InsightCard label="Fastest replay" value={paceRows.length ? `${Math.min(...paceRows.map((row) => row.turns))} turns` : "—"} detail="Shortest saved timeline" /><InsightCard label="Longest replay" value={paceRows.length ? `${Math.max(...paceRows.map((row) => row.turns))} turns` : "—"} detail="Longest saved timeline" /><InsightCard label="Average replay" value={averageTurns === null ? "—" : `${format(averageTurns, 1)} turns`} detail="Mean saved timeline length" /><InsightCard label="Median replay" value={medianTurns === null ? "—" : `${format(medianTurns, 1)} turns`} detail="Middle saved timeline length" /></div><div className="mt-5 border-t border-[var(--border)] pt-4"><h4 className="text-[9px] font-black uppercase tracking-wide text-[var(--foreground-muted)]">Replay length distribution</h4><div className="mt-3 space-y-3">{battleLengthRows.map((row) => <div key={row.label}><div className="mb-1 flex justify-between gap-3 text-[10px]"><span className="text-white">{row.label}</span><span className="font-mono text-[var(--foreground-muted)]">{row.games} {row.games === 1 ? "timeline" : "timelines"}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--background-tertiary)]"><div className="h-full rounded-full bg-violet-400" style={{ width: `${(row.games / Math.max(paceRows.length, 1)) * 100}%` }} /></div></div>)}</div></div><div className="mt-4 text-xs text-[var(--foreground-muted)]">{paceRows.length} replay timelines support pace measurements.</div></div></div>
    <div><DataTable title="Pokémon matchup matrix" description="Cross-team Pokémon records from repeated appearances." headers={["Matchup", "Record", "Games", "Win rate"]} rows={matchups.map((row) => [`${row.left} vs ${row.right}`, `${row.wins}-${row.losses}`, row.games, percent(row.wins, row.games)])} empty="Not enough repeated matchup data." /></div>
    <div className="grid gap-4 xl:grid-cols-2"><DataTable title="KO conversion" description="Recorded kills divided by kills plus deaths." headers={["Pokémon", "KOs", "Deaths", "Conversion"]} rows={conversionRows.map((row) => [row.name, row.kills, row.deaths, `${format(row.rate, 1)}%`])} empty="No recorded KOs or deaths." /><DataTable title="Team damage share" description="Average share of recorded team damage by Pokémon." headers={["Pokémon", "Average share", "Covered appearances"]} rows={topShare.map((row) => [row.name, `${format(row.average, 1)}%`, row.covered])} empty="No damage coverage." /></div>
    <div className="grid gap-4 xl:grid-cols-2"><DataTable title="Coach tendencies" description="Game record, most-used Pokémon, and recorded in-scope damage by coach." headers={["Coach", "Record", "Favorite", "Damage / game"]} rows={coachRows.map((row) => [row.coachName, `${row.wins}-${row.games - row.wins}`, row.favorite, row.damageGames ? format(row.recordedDamage / row.damageGames, 1) : "—"])} empty="No coach tendency data." /><DataTable title="Item impact" description="Win rates associated with revealed held items; transferred items are excluded and this does not prove causation." headers={["Item", "Wins", "Appearances", "Win rate"]} rows={topItems.map((row) => [row.item, row.wins, row.appearances, percent(row.wins, row.appearances)])} empty="No saved item reveals." /></div>
    <div className="grid gap-4 xl:grid-cols-2"><DataTable title="Three-Pokémon cores" description="Repeated three-Pokémon combinations with recorded win-loss results." headers={["Core", "Record", "Games", "Win rate"]} rows={topCores.map((row) => [row.core, `${row.wins}-${row.losses}`, row.games, percent(row.wins, row.games)])} empty="Not enough repeated cores." /><DataTable title="Move-to-KO signals" description="Counts faint events where that move was saved as the cause." note="How to read this: Earthquake · 22 means Earthquake was named as the cause of 22 saved Pokémon faint events in the active filters. It does not mean Earthquake was used 22 times, dealt 22% damage, or won 22 games." headers={["Move named in faint event", "Faint events"]} rows={topKoMoves.map(([move, count]) => [move, count])} empty="No saved faint events include a move name." /></div>
    <div className="poke-card p-5 md:p-6"><h3 className="font-pixel text-xs text-white">Regular season versus playoffs</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Each record counts games once. Damage is recorded in-scope damage per covered game; Shift is playoff damage per game minus regular-season damage per game.</p>{stageRows.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr><th className="p-2 text-left">Coach</th><th>Regular record</th><th>Playoff record</th><th>Regular damage/game</th><th>Playoff damage/game</th><th>Shift</th></tr></thead><tbody>{stageRows.map((row) => { const regularDamage = row.regular.damageGames ? row.regular.recordedDamage / row.regular.damageGames : null; const playoffDamage = row.playoffs.damageGames ? row.playoffs.recordedDamage / row.playoffs.damageGames : null; const shift = regularDamage !== null && playoffDamage !== null ? playoffDamage - regularDamage : null; return <tr key={row.coachId} className="border-t border-[var(--border)] text-center"><td className="p-2 text-left font-bold text-white">{row.coachName}</td><td>{row.regular.wins}-{row.regular.games - row.regular.wins}</td><td>{row.playoffs.wins}-{row.playoffs.games - row.playoffs.wins}</td><td>{regularDamage === null ? "—" : format(regularDamage, 1)}</td><td>{playoffDamage === null ? "—" : format(playoffDamage, 1)}</td><td className={shift !== null && shift >= 0 ? "text-emerald-300" : "text-red-300"}>{shift === null ? "—" : `${shift >= 0 ? "+" : ""}${format(shift, 1)}`}</td></tr>; })}</tbody></table></div> : <EmptyMessage text="Choose a scope containing both regular-season and playoff matches." />}</div>
    <div className="poke-card p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-pixel text-xs text-white">Replay comparison</h3><p className="mt-1 text-[10px] text-[var(--foreground-muted)]">Compare two saved battles side by side.</p></div><div className="flex flex-wrap gap-2"><MatchSelect matches={matches} value={activeCompareA} onChange={setCompareA} /><MatchSelect matches={matches} value={activeCompareB} onChange={setCompareB} /></div></div>{selectedA && selectedB ? <div className="mt-5 grid gap-3 md:grid-cols-2"><ComparisonCard match={selectedA} /><ComparisonCard match={selectedB} /></div> : <EmptyMessage text="At least one replay is needed for comparison." />}</div>
  </section>;
}

function MatchSelect({ matches, value, onChange }: { matches: ExperimentalMatch[]; value: number | null; onChange: (value: number) => void }) { return <select value={value ?? ""} onChange={(event) => onChange(Number(event.target.value))} className="max-w-full rounded-lg border-2 border-[var(--background-tertiary)] bg-[var(--background)] px-2 py-2 text-[10px] font-bold"><option value="">Choose replay</option>{matches.map((match) => <option key={match.id} value={match.id}>{match.coach1.teamName} vs {match.coach2.teamName} · W{match.week}</option>)}</select>; }
function ComparisonCard({ match }: { match: ExperimentalMatch }) { const faint = firstFaint(match); const totalDamage = match.pokemon.reduce((sum, appearance) => sum + damage(appearance), 0); const winner = match.winnerId === match.coach1.seasonCoachId ? match.coach1.teamName : match.coach2.teamName; return <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"><div className="text-xs font-bold text-white">{match.coach1.teamName} vs {match.coach2.teamName}</div><div className="mt-1 text-[10px] text-[var(--foreground-muted)]">{match.seasonName} · {match.divisionName} · Week {match.week}</div><div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs"><MetricCell label="Winner" value={winner} /><MetricCell label="Turns" value={matchTurns(match) ? format(matchTurns(match)) : "—"} /><MetricCell label="First faint" value={faint ? `T${faint.turn}` : "—"} /><MetricCell label="Damage" value={totalDamage ? `${format(totalDamage, 1)}%` : "—"} /></div></div>; }
function MetricCell({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-[var(--border)] p-2"><div className="text-[8px] uppercase text-[var(--foreground-muted)]">{label}</div><div className="mt-1 break-words font-mono text-[11px] font-black text-white">{value}</div></div>; }
function ConfidenceBadge({ tone, text }: { tone: "full" | "partial" | "limited"; text: string }) { const color = tone === "full" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : tone === "partial" ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-slate-500/30 bg-slate-500/10 text-slate-300"; return <span className={`rounded-full border px-2 py-1 ${color}`}>{text}</span>; }
function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 text-center"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 break-words font-mono text-xl font-black text-white">{value}</div><div className="mt-1 text-[10px] leading-4 text-[var(--foreground-subtle)]">{detail}</div></div>; }
function EmptyMessage({ text }: { text: string }) { return <p className="mt-4 text-xs text-[var(--foreground-muted)]">{text}</p>; }
const tableReadingGuides: Record<string, string> = {
  "Opponent splits": "Each row is one opposing team. Record is wins–losses against that opponent; damage is the average recorded team damage in those games.",
  "Opponent-strength splits": "Opponents are grouped by their record in the active scope: 50% or better versus below 50%. The result is descriptive, not a power rating.",
  "Situational stats": "Each row groups battles by saved timeline length. Faint order recorded is the share of games with a known first faint; 100% means the data is complete, not that your side won the first faint.",
  "Coach matchup report": "Record is shown from the left team’s perspective. Damage per game combines the recorded damage from both teams.",
  "Pokémon matchup matrix": "Each row is a repeated Pokémon-versus-Pokémon pairing. Record shows the first listed Pokémon’s team result in those pairings.",
  "KO conversion": "Conversion is KOs divided by KOs plus deaths. It only uses recorded KO and faint totals.",
  "Team damage share": "Average share is the percentage of recorded team damage produced by that Pokémon when team damage was available.",
  "Coach tendencies": "Each game counts once in the record. Favorite is the Pokémon used most often; damage/game averages the recorded in-scope damage in covered games.",
  "Item impact": "Each item row counts appearances where that item was revealed. Win rate is association, not proof that the item caused the result.",
  "Three-Pokémon cores": "Each core is a three-Pokémon combination that appeared together. Record and win rate summarize the battles where that combination was present.",
  "Move-to-KO signals": "Each count is a saved faint event that named the move as its cause. It is not total move usage, damage, accuracy, or win rate.",
};

function DataTable({ title, description, note, headers, rows, empty }: { title: string; description: string; note?: string; headers: string[]; rows: Array<Array<string | number>>; empty: string }) { const reading = note?.replace("How to read this: ", "") ?? tableReadingGuides[title] ?? "Read each row within the active replay filters; unavailable fields are not treated as zero."; return <div className="poke-card p-5 md:p-6"><h3 className="font-pixel text-xs text-white">{title}</h3><p className="mt-1 text-[10px] leading-4 text-[var(--foreground-muted)]">{description}</p><div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] p-3 text-[10px] leading-4 text-cyan-100"><strong className="text-cyan-200">How to read this:</strong> {reading}</div>{rows.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[430px] text-xs"><thead className="text-[9px] uppercase text-[var(--foreground-muted)]"><tr>{headers.map((header, index) => <th key={header} className={`p-2 ${index === 0 ? "text-left" : "text-center"}`}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`} className="border-t border-[var(--border)]">{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`} className={`p-2 ${cellIndex === 0 ? "font-bold text-white" : "text-center font-mono"}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <EmptyMessage text={empty} />}</div>; }
