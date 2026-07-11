import { useState, useRef, useCallback } from "react";
import type { SlideData, TransactionPokemon, RosterPokemon, MatchPokemonStat, ScheduleMatch } from "./page";

interface Props {
  data: SlideData;
  divisionColor: string;
}

const TX_COLORS: Record<string, string> = {
  FA_PICKUP: "#22c55e",
  FA_DROP: "#ef4444",
  FA_SWAP: "#a855f7",
  P2P_TRADE: "#3b82f6",
  TERA_SWAP: "#eab308",
};

const TX_LABELS: Record<string, string> = {
  FA_PICKUP: "Pickup",
  FA_DROP: "Drop",
  FA_SWAP: "FA Swap",
  P2P_TRADE: "Trade",
  TERA_SWAP: "Tera",
};

export function Slide({ data, divisionColor }: Props) {
  const rosterCols = Math.ceil(data.roster.length / 2);
  const row1 = data.roster.slice(0, rosterCols);
  const row2 = data.roster.slice(rosterCols);

  const slideRef = useRef<HTMLDivElement>(null);
  const [hoveredMatch, setHoveredMatch] = useState<{ idx: number; top: number } | null>(null);

  const handleMatchEnter = useCallback((idx: number, e: React.MouseEvent) => {
    if (!slideRef.current) return;
    const slideRect = slideRef.current.getBoundingClientRect();
    const rowRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const scale = slideRect.width / 1920;
    let top = (rowRect.top - slideRect.top) / scale;
    // Clamp so tooltip doesn't overflow bottom of slide
    const tooltipHeight = 260;
    if (top + tooltipHeight > 1080) top = 1080 - tooltipHeight;
    setHoveredMatch({ idx, top });
  }, []);

  return (
    <div ref={slideRef} className="w-full h-full flex flex-col relative overflow-hidden text-slate-100" style={{ background: "#020617", fontFamily: "'Chakra Petch', sans-serif" }}>
      {/* Scoped retro styles */}
      <style>{`
        .slide-bg-dots {
          background-image: radial-gradient(#334155 1.5px, transparent 1.5px);
          background-size: 24px 24px;
        }
        .slide-poke-card {
          position: relative;
          background: rgba(15, 23, 42, 0.95);
          border: 4px solid ${divisionColor};
          box-shadow: 6px 6px 0px rgba(0,0,0,0.5);
        }
        .slide-poke-card::before, .slide-poke-card::after {
          content: '';
          position: absolute;
          width: 8px;
          height: 8px;
          background: ${divisionColor};
        }
        .slide-poke-card::before { top: -4px; left: -4px; }
        .slide-poke-card::after { bottom: -4px; right: -4px; }
        .slide-scanlines {
          background: linear-gradient(
            to bottom,
            rgba(255,255,255,0),
            rgba(255,255,255,0) 50%,
            rgba(0,0,0,0.1) 50%,
            rgba(0,0,0,0.1)
          );
          background-size: 100% 4px;
          pointer-events: none;
        }
        .slide-retro-scrollbar::-webkit-scrollbar { width: 0px; height: 0px; }
        .slide-retro-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      {/* Background Ambience */}
      <div className="absolute inset-0 slide-bg-dots opacity-20 pointer-events-none" />
      <div className="absolute inset-0 slide-scanlines opacity-30 pointer-events-none z-50" />

      {/* Division Color Glow */}
      <div
        className="absolute top-[-20%] left-[-10%] w-[60%] h-[80%] rounded-full opacity-30 pointer-events-none mix-blend-screen"
        style={{ background: divisionColor, filter: "blur(150px)" }}
      />

      {/* Decorative Pokeball Wireframe */}
      <div
        className="absolute -right-24 top-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none flex items-center justify-center"
        style={{ border: `2px solid ${divisionColor}` }}
      >
        <div className="w-[80%] h-[2px]" style={{ backgroundColor: divisionColor }} />
        <div className="absolute w-[2px] h-[80%]" style={{ backgroundColor: divisionColor }} />
        <div className="absolute w-[30%] h-[30%] rounded-full" style={{ border: `2px solid ${divisionColor}` }} />
      </div>

      {/* ===== HERO SECTION (Top 60%) ===== */}
      <div className="h-[60%] flex relative z-10 px-8 pt-8 pb-4 gap-6 shrink-0">

        {/* LEFT: Team Identity Card */}
        <div className="w-[30%] flex flex-col slide-poke-card rounded-lg p-8">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            {/* Logo + Rank Badge */}
            <div className="relative mb-8">
              <div
                className="w-52 h-52 flex items-center justify-center relative z-10"
                style={{
                  background: "#020617",
                  border: `4px solid ${divisionColor}`,
                  borderRadius: "14px",
                  boxShadow: "6px 6px 0 rgba(0,0,0,0.3)",
                }}
              >
                {data.teamLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.teamLogoUrl} alt="" className="w-40 h-40 object-contain drop-shadow-md" />
                ) : (
                  <div className="w-40 h-40 bg-slate-800 rounded" />
                )}
              </div>

              {/* Rank Badge - Sticker Style */}
              <div
                className="absolute -top-4 -right-4 px-4 py-1.5 z-20 transform rotate-6"
                style={{ background: "#020617", border: `3px solid ${divisionColor}`, boxShadow: "3px 3px 0 rgba(0,0,0,0.5)" }}
              >
                <span className="font-pixel text-xs block mb-0.5 text-white">RANK</span>
                <span className="font-pixel text-3xl leading-none" style={{ color: divisionColor }}>#{data.rank}</span>
              </div>
            </div>

            {/* Team Name */}
            <h1
              className="font-pixel text-3xl text-white tracking-wide leading-tight mb-3 uppercase"
              style={{ textShadow: `2px 2px 0 ${divisionColor}` }}
            >
              {data.teamName}
            </h1>

            {/* Coach Badge */}
            <div
              className="flex items-center gap-3 mb-8 px-4 py-1.5 rounded transform rotate-1"
              style={{ backgroundColor: `${divisionColor}20`, border: `1px solid ${divisionColor}60` }}
            >
              <span className="font-pixel text-[10px] uppercase text-white">COACH</span>
              <span className="text-lg text-white font-bold tracking-wide uppercase">{data.coachName}</span>
            </div>

            {/* Record */}
            <div className="flex items-center gap-2 p-3 rounded w-full justify-center" style={{ background: "#020617", border: "2px solid #334155" }}>
              <div className="flex flex-col items-center px-5">
                <span className="font-pixel text-4xl text-[#22c55e] leading-none" style={{ filter: "drop-shadow(0 0 8px rgba(34,197,94,0.5))" }}>{data.wins}</span>
                <span className="text-[10px] font-pixel text-slate-500 mt-1.5">WIN</span>
              </div>
              <div className="font-pixel text-slate-600 text-2xl">-</div>
              <div className="flex flex-col items-center px-5">
                <span className="font-pixel text-4xl text-[#ef4444] leading-none" style={{ filter: "drop-shadow(0 0 8px rgba(239,68,68,0.5))" }}>{data.losses}</span>
                <span className="text-[10px] font-pixel text-slate-500 mt-1.5">LOSS</span>
              </div>
            </div>
            {(data.inheritedWins > 0 || data.inheritedLosses > 0) && (
              <span className="text-xs text-slate-500 font-mono mt-2">
                ({data.inheritedWins + data.wins}-{data.inheritedLosses + data.losses} overall)
              </span>
            )}
          </div>
        </div>

        {/* RIGHT: Roster Grid */}
        <div className="flex-1 flex flex-col justify-center min-w-0">
          {/* Header */}
          <div className="flex items-end gap-3 mb-5 pb-2" style={{ borderBottom: `4px solid ${divisionColor}` }}>
            <div className="w-5 h-7" style={{ backgroundColor: divisionColor }} />
            <h2 className="text-2xl font-pixel text-white uppercase tracking-widest" style={{ textShadow: "2px 2px 0 #000" }}>
              Active Roster
            </h2>
          </div>

          {/* Grid */}
          <div className="w-full h-full max-h-[500px] flex flex-col gap-4 justify-center">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${row1.length}, minmax(0, 1fr))` }}>
              {row1.map((pk) => (
                <RosterCard key={pk.pokemonId} pk={pk} divisionColor={divisionColor} />
              ))}
            </div>
            {row2.length > 0 && (
              <div className="grid gap-3 px-[4%]" style={{ gridTemplateColumns: `repeat(${row2.length}, minmax(0, 1fr))` }}>
                {row2.map((pk) => (
                  <RosterCard key={pk.pokemonId} pk={pk} divisionColor={divisionColor} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== BOTTOM SECTION (Data Tables) ===== */}
      <div className="flex-1 min-h-0 relative z-20" style={{ background: "#0f172a", borderTop: `4px solid ${divisionColor}` }}>
        <div className="h-full grid grid-cols-4 divide-x-2 divide-slate-700">

          {/* Schedule */}
          <div className="flex flex-col p-5 overflow-hidden">
            <h3 className="font-pixel text-sm mb-3 flex items-center gap-2" style={{ color: divisionColor }}>
              <span className="w-3 h-3" style={{ backgroundColor: divisionColor }} /> SCHEDULE
            </h3>
            <div className="flex-1 overflow-y-auto slide-retro-scrollbar">
              <div className="space-y-1.5">
                {data.schedule.map((m, i) => {
                  const absDiff = Math.abs(m.differential);
                  const myScore = m.result === "W" ? absDiff : 0;
                  const oppScore = m.result === "L" ? absDiff : 0;
                  return (
                    <div
                      key={i}
                      className={`flex items-center py-2 px-2 border border-slate-800 transition-colors ${m.isPredecessorGame ? "opacity-40" : ""} ${m.result !== "upcoming" ? "hover:border-slate-500 cursor-pointer" : ""}`}
                      style={{ background: hoveredMatch?.idx === i ? "#0f172a" : "#020617" }}
                      onMouseEnter={m.result !== "upcoming" ? (e) => handleMatchEnter(i, e) : undefined}
                      onMouseLeave={() => setHoveredMatch(null)}
                    >
                      <span className="font-mono text-slate-500 w-7 text-center text-xs bg-slate-900 border-r border-slate-800 py-0.5 shrink-0">{m.week}</span>
                      <div className="flex items-center gap-2 flex-1 px-3 truncate min-w-0">
                        {m.opponentLogoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.opponentLogoUrl} alt="" className="w-5 h-5 object-contain rounded shrink-0" />
                        )}
                        <span className="text-slate-300 font-bold uppercase truncate text-sm">{m.opponentName}</span>
                      </div>
                      {m.result !== "upcoming" ? (
                        <span className={`font-pixel text-xs shrink-0 ${m.result === "W" ? "text-green-400" : "text-red-400"}`}>
                          {m.isForfeit ? "FF" : `${myScore}-${oppScore}`} {m.result}
                        </span>
                      ) : (
                        <span className="font-pixel text-xs text-slate-600 shrink-0">-</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Standings */}
          <div className="flex flex-col p-5 overflow-hidden">
            <h3 className="font-pixel text-sm mb-3 flex items-center gap-2" style={{ color: divisionColor }}>
              <span className="w-3 h-3" style={{ backgroundColor: divisionColor }} /> STANDINGS
            </h3>
            <div className="flex-1 overflow-y-auto slide-retro-scrollbar">
              <div className="space-y-0">
                {data.nearbyStandings.map((s) => (
                  <div
                    key={s.rank}
                    className={`flex items-center text-sm py-3 px-3 gap-3 border-b border-slate-800 ${s.isCurrent ? "bg-slate-800" : ""}`}
                    style={s.isCurrent ? { borderLeft: `3px solid ${divisionColor}`, background: `${divisionColor}10` } : { borderLeft: `3px solid transparent` }}
                  >
                    <span className="font-pixel text-[10px] text-slate-500 w-8 shrink-0 text-right">#{s.rank}</span>
                    <span className={`font-bold uppercase truncate flex-1 ${s.isCurrent ? "text-white" : "text-slate-400"}`}>{s.teamName}</span>
                    <span className={`font-mono text-sm shrink-0 ${s.isCurrent ? "text-slate-200" : "text-slate-400"}`}>{s.wins}-{s.losses}</span>
                    <span className={`font-mono text-sm shrink-0 w-10 text-right ${s.differential >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {s.differential >= 0 ? "+" : ""}{s.differential}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pokemon Stats */}
          <div className="flex flex-col p-5 overflow-hidden">
            <h3 className="font-pixel text-sm mb-3 flex items-center gap-2" style={{ color: divisionColor }}>
              <span className="w-3 h-3" style={{ backgroundColor: divisionColor }} /> POKEMON STATS
            </h3>
            <div className="flex text-[11px] text-slate-500 font-pixel mb-2 px-1">
              <span className="flex-1">MON</span>
              <span className="w-8 text-center">K</span>
              <span className="w-8 text-center">D</span>
              <span className="w-8 text-center">GP</span>
            </div>
            <div className="flex-1 overflow-y-auto slide-retro-scrollbar">
              <div className="space-y-0.5">
                {data.allPokemonStats.map((pk) => (
                  <div key={pk.pokemonId} className={`flex items-center py-1.5 px-1 border-b border-slate-800 ${!pk.isOnRoster ? "opacity-50" : ""}`}>
                    <div className="w-7 h-7 mr-2 shrink-0">
                      {pk.spriteUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pk.spriteUrl} className="w-full h-full object-contain" alt="" />
                      )}
                    </div>
                    <span className="font-bold text-slate-300 truncate flex-1 text-sm">
                      {pk.displayName || pk.name}
                      {!pk.isOnRoster && <span className="text-red-400 ml-1 text-[10px] font-pixel">DROP</span>}
                    </span>
                    <span className="font-mono text-green-400 w-8 text-center text-sm">{pk.kills}</span>
                    <span className="font-mono text-red-400 w-8 text-center text-sm">{pk.deaths}</span>
                    <span className="font-mono text-slate-500 w-8 text-center text-sm">{pk.gamesPlayed}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="flex flex-col p-5 overflow-hidden">
            <h3 className="font-pixel text-sm mb-3 flex items-center gap-2" style={{ color: divisionColor }}>
              <span className="w-3 h-3" style={{ backgroundColor: divisionColor }} /> TRANSACTIONS
              <span className="ml-auto flex gap-2 text-[11px]">
                <span className="px-1.5 py-0.5 rounded" style={{ background: "#0f172a" }}>
                  <span className="text-slate-500">{data.faRemaining}/6 FA</span>
                </span>
                <span className="px-1.5 py-0.5 rounded" style={{ background: "#0f172a" }}>
                  <span className="text-slate-500">{data.p2pRemaining}/6 P2P</span>
                </span>
              </span>
            </h3>
            <div className="flex-1 overflow-y-auto slide-retro-scrollbar">
              {data.transactions.length > 0 ? (
                <div className="space-y-2.5">
                  {data.transactions.slice(0, 10).map((tx, i) => (
                    <div key={i} className="flex flex-col gap-2 p-2.5 border border-slate-800" style={{ background: "#020617" }}>
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[11px] font-pixel uppercase px-2 py-0.5 text-black"
                          style={{ backgroundColor: TX_COLORS[tx.type] || "#94a3b8" }}
                        >
                          {TX_LABELS[tx.type] || tx.type}
                        </span>
                        <span className="text-[11px] font-pixel text-slate-600">WK {tx.week}</span>
                      </div>
                      <div className="pl-1">
                        <TransactionDetails tx={tx} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-slate-600 text-sm italic font-pixel">NO TRANSACTIONS</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating match tooltip — rendered at slide root to escape overflow clipping */}
      {hoveredMatch !== null && (() => {
        const m = data.schedule[hoveredMatch.idx];
        if (!m || m.result === "upcoming") return null;
        const absDiff = Math.abs(m.differential);
        const myScore = m.result === "W" ? absDiff : 0;
        const oppScore = m.result === "L" ? absDiff : 0;
        const displayTeamName = m.myTeamAbbreviation || data.teamAbbreviation || data.teamName;
        return (
          <div
            className="absolute z-50 pointer-events-none"
            style={{ top: hoveredMatch.top, left: 490 }}
          >
            <MatchTooltip m={m} myScore={myScore} oppScore={oppScore} divisionColor={divisionColor} teamName={displayTeamName} />
          </div>
        );
      })()}
    </div>
  );
}

function RosterCard({ pk, divisionColor }: { pk: RosterPokemon; divisionColor: string }) {
  return (
    <div className="group relative w-full h-full min-h-[220px] flex flex-col items-center justify-end pb-3">
      {/* Card Base (Slot Style) */}
      <div className="absolute inset-0 bg-[#0f172a] border-2 border-slate-700 hover:border-slate-500 transition-colors flex flex-col justify-end overflow-hidden" style={{ boxShadow: "3px 3px 0 rgba(0,0,0,0.5)" }}>
        {/* Division Color Tint at bottom */}
        <div className="h-[40%] w-full opacity-20" style={{ background: `linear-gradient(to top, ${divisionColor}, transparent)` }} />
        {/* Selection Highlight */}
        <div className="absolute inset-0 border-2 border-transparent group-hover:border-white/20 pointer-events-none" />
      </div>

      {/* Tera Captain Badge */}
      {pk.isTeraCaptain && (
        <div className="absolute top-1.5 right-1.5 z-20 w-6 h-6 bg-yellow-500 border-2 border-yellow-300 flex items-center justify-center" style={{ boxShadow: "2px 2px 0 rgba(0,0,0,0.3)" }}>
          <span className="text-xs text-black font-bold">★</span>
        </div>
      )}

      {/* Price Tag */}
      <div className="absolute top-1.5 left-1.5 z-20">
        <span className="font-pixel text-[8px] text-slate-400 bg-slate-900/80 px-1 py-0.5 border border-slate-700">{pk.price}P</span>
      </div>

      {/* Pokemon Image */}
      <div className="absolute inset-0 z-10 flex items-center justify-center transform group-hover:-translate-y-2 transition-transform duration-200">
        {(pk.artworkUrl || pk.spriteUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pk.artworkUrl || pk.spriteUrl || ""}
            alt=""
            className="w-[130px] h-[130px] object-contain drop-shadow-[0_4px_0_rgba(0,0,0,0.4)] group-hover:brightness-110 group-hover:contrast-110 transition-all duration-200 scale-125"
          />
        ) : (
          <div className="w-[80px] h-[80px] bg-slate-800 border-2 border-slate-700 border-dashed" />
        )}
      </div>

      {/* Name Plate */}
      <div className="relative z-20 w-[92%] py-1.5 text-center" style={{ background: "#020617", border: "2px solid #475569", boxShadow: "2px 2px 0 rgba(0,0,0,0.3)" }}>
        <span className="font-pixel text-[9px] text-slate-200 tracking-tight leading-none uppercase block truncate px-1">
          {pk.displayName || pk.name}
        </span>
      </div>

      {/* Stat tooltip on hover */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none w-max">
        <div className="bg-[#22c55e] text-black border-2 border-black px-2.5 py-1" style={{ boxShadow: "2px 2px 0 rgba(0,0,0,1)" }}>
          <span className="font-pixel text-[9px]">{pk.kills}K / {pk.deaths}D</span>
        </div>
      </div>
    </div>
  );
}

function MatchTooltip({ m, myScore, oppScore, divisionColor, teamName }: { m: ScheduleMatch; myScore: number; oppScore: number; divisionColor: string; teamName: string }) {
  const resultColor = m.result === "W" ? "#22c55e" : "#ef4444";
  return (
    <div
      className="w-[420px] border-2 border-slate-600"
      style={{ background: "#0a0f1a", boxShadow: "4px 4px 0 rgba(0,0,0,0.8)" }}
    >
      {/* Score Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `3px solid ${resultColor}`, background: `${resultColor}15` }}
      >
        <span className="font-pixel text-xs text-white uppercase truncate flex-1">{teamName}</span>
        <span className={`font-pixel text-base mx-3 ${m.result === "W" ? "text-green-400" : "text-red-400"}`}>
          {m.isForfeit ? "FF" : `${myScore}-${oppScore}`}
        </span>
        <span className="font-pixel text-xs text-slate-400 uppercase truncate flex-1 text-right">{m.opponentName}</span>
      </div>

      {m.isForfeit ? (
        <div className="px-4 py-3 text-center">
          <span className="font-pixel text-xs text-red-400">FORFEIT</span>
        </div>
      ) : (
        /* Pokemon Stats - Two columns */
        <div className="flex divide-x divide-slate-700">
          {/* My Pokemon */}
          <div className="flex-1 p-2.5 space-y-1.5">
            {m.myPokemon.map((pk, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {pk.spriteUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pk.spriteUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
                )}
                <span className="text-slate-300 truncate flex-1">{pk.name}</span>
                <span className="font-mono text-green-400">{pk.kills}</span>
                <span className="text-slate-600">/</span>
                <span className="font-mono text-red-400">{pk.deaths}</span>
              </div>
            ))}
          </div>
          {/* Opponent Pokemon */}
          <div className="flex-1 p-2.5 space-y-1.5">
            {m.opponentPokemon.map((pk, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {pk.spriteUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pk.spriteUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
                )}
                <span className="text-slate-300 truncate flex-1">{pk.name}</span>
                <span className="font-mono text-green-400">{pk.kills}</span>
                <span className="text-slate-600">/</span>
                <span className="font-mono text-red-400">{pk.deaths}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PokemonSprite({ pk }: { pk: TransactionPokemon }) {
  if (!pk.spriteUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={pk.spriteUrl} alt="" className="w-5 h-5 object-contain inline-block align-middle mx-0.5" style={{ filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.5))" }} />
  );
}

function TxArrow({ symbol = "→" }: { symbol?: string }) {
  return (
    <span className="inline-flex items-center justify-center mx-1.5 text-white text-lg leading-none font-bold shrink-0">
      {symbol}
    </span>
  );
}

function TransactionDetails({
  tx,
}: {
  tx: {
    type: string;
    pokemonIn: TransactionPokemon[];
    pokemonOut: TransactionPokemon[];
    newTeraCaptain: TransactionPokemon | null;
    oldTeraCaptain: TransactionPokemon | null;
  };
}) {
  const addedClass = "text-[#22c55e] font-bold font-mono text-xs";
  const removedClass = "text-[#ef4444] font-bold font-mono text-xs";
  const teraClass = "text-[#eab308] font-bold font-mono text-xs";

  // Helper to check if a pokemon is the old/new tera captain
  const isOldTera = (pk: TransactionPokemon) => tx.oldTeraCaptain?.name === pk.name;
  const isNewTera = (pk: TransactionPokemon) => tx.newTeraCaptain?.name === pk.name;

  if (tx.type === "TERA_SWAP") {
    return (
      <span className="inline-flex items-center flex-wrap gap-1">
        {tx.oldTeraCaptain && (
          <span className={`inline-flex items-center gap-1 ${removedClass}`}>
            <PokemonSprite pk={tx.oldTeraCaptain} />
            <span className="whitespace-nowrap">{tx.oldTeraCaptain.name} [TC]</span>
          </span>
        )}
        <TxArrow />
        {tx.newTeraCaptain && (
          <span className={`inline-flex items-center gap-1 ${teraClass}`}>
            <PokemonSprite pk={tx.newTeraCaptain} />
            <span className="whitespace-nowrap">{tx.newTeraCaptain.name} [TC]</span>
          </span>
        )}
      </span>
    );
  }

  if (tx.type === "P2P_TRADE") {
    return (
      <span className="inline-flex items-center flex-wrap gap-1">
        {tx.pokemonOut.map((pk, i) => (
          <span key={i} className={`inline-flex items-center gap-1 ${removedClass}`}>
            <PokemonSprite pk={pk} />
            <span className="whitespace-nowrap">{pk.name}</span>
            {pk.isTeraCaptain && <span className="ml-0.5">[TC]</span>}
          </span>
        ))}
        <TxArrow symbol="↔" />
        {tx.pokemonIn.map((pk, i) => (
          <span key={i} className={`inline-flex items-center gap-1 ${addedClass}`}>
            <PokemonSprite pk={pk} />
            <span className="whitespace-nowrap">{pk.name}</span>
            {pk.isTeraCaptain && <span className="ml-0.5">[TC]</span>}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center flex-wrap gap-1">
      {tx.pokemonOut.map((pk, i) => (
        <span key={i} className={`inline-flex items-center gap-1 ${removedClass}`}>
          <PokemonSprite pk={pk} />
          <span className="whitespace-nowrap">{pk.name}</span>
          {isOldTera(pk) && <span className="ml-0.5">[TC]</span>}
        </span>
      ))}
      <TxArrow />
      {tx.pokemonIn.map((pk, i) => (
        <span key={i} className={`inline-flex items-center gap-1 ${addedClass}`}>
          <PokemonSprite pk={pk} />
          <span className="whitespace-nowrap">{pk.name}</span>
          {isNewTera(pk) && <span className="ml-0.5">[TC]</span>}
        </span>
      ))}
    </span>
  );
}
