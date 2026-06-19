"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceDot } from "recharts";

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
  killer?: string;
  killerPlayer?: "p1" | "p2";
}

interface HpChartProps {
  turnSnapshots: TurnSnapshot[];
  keyEvents: KeyEvent[];
  team1Name: string;
  team2Name: string;
  team1Color: string;
  team2Color: string;
  p1IsCoach1: boolean;
}

export function HpChart({ turnSnapshots, keyEvents, team1Name, team2Name, team1Color, team2Color, p1IsCoach1 }: HpChartProps) {
  // Map the data to use coach1/coach2 instead of p1/p2
  const chartData = turnSnapshots.map((snapshot) => ({
    turn: snapshot.turn,
    [team1Name]: p1IsCoach1 ? snapshot.p1TotalHp : snapshot.p2TotalHp,
    [team2Name]: p1IsCoach1 ? snapshot.p2TotalHp : snapshot.p1TotalHp,
  }));

  // Group faints by turn for tooltip display
  const faintsByTurn = new Map<number, Array<{ pokemon: string; team: string; color: string }>>();
  keyEvents
    .filter((e) => e.type === "faint")
    .forEach((event) => {
      const isCoach1Team = (event.player === "p1") === p1IsCoach1;
      const teamName = isCoach1Team ? team1Name : team2Name;
      const color = isCoach1Team ? team1Color : team2Color;

      if (!faintsByTurn.has(event.turn)) {
        faintsByTurn.set(event.turn, []);
      }
      faintsByTurn.get(event.turn)!.push({
        pokemon: event.pokemon || "Unknown",
        team: teamName,
        color,
      });
    });

  // Get faint events with their positions on the chart
  // Snapshots now represent end-of-turn HP, so turn N snapshot includes faints from turn N
  const faintMarkers = keyEvents
    .filter((e) => e.type === "faint")
    .map((event) => {
      // Find the snapshot for this turn (end-of-turn HP includes this faint)
      const snapshot = turnSnapshots.find((s) => s.turn === event.turn);
      if (!snapshot) return null;

      const hp = event.player === "p1" ? snapshot.p1TotalHp : snapshot.p2TotalHp;

      // Map player to team color
      const isCoach1Team = (event.player === "p1") === p1IsCoach1;
      const color = isCoach1Team ? team1Color : team2Color;

      return {
        turn: event.turn,
        hp,
        pokemon: event.pokemon,
        color,
        player: event.player,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  return (
    <div className="w-full h-64 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--background-tertiary)" />
          <XAxis
            dataKey="turn"
            stroke="var(--foreground-muted)"
            tick={{ fill: "var(--foreground-muted)", fontSize: 11 }}
            tickLine={{ stroke: "var(--background-tertiary)" }}
            axisLine={{ stroke: "var(--background-tertiary)" }}
            label={{ value: "Turn", position: "insideBottomRight", offset: -5, fill: "var(--foreground-muted)", fontSize: 11 }}
          />
          <YAxis
            stroke="var(--foreground-muted)"
            tick={{ fill: "var(--foreground-muted)", fontSize: 11 }}
            tickLine={{ stroke: "var(--background-tertiary)" }}
            axisLine={{ stroke: "var(--background-tertiary)" }}
            domain={[0, 600]}
            ticks={[0, 100, 200, 300, 400, 500, 600]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--background-secondary)",
              border: "1px solid var(--background-tertiary)",
              borderRadius: "8px",
              fontSize: "12px",
              padding: "8px 12px",
            }}
            labelStyle={{ color: "var(--foreground-muted)", marginBottom: "4px" }}
            formatter={(value) => [`${value}%`, null]}
            labelFormatter={(turn) => turn === 0 ? "Battle Start" : `Turn ${turn}`}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const turn = label as number;
              const faints = faintsByTurn.get(turn) || [];

              return (
                <div style={{
                  backgroundColor: "var(--background-secondary)",
                  border: "1px solid var(--background-tertiary)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontSize: "12px",
                }}>
                  <div style={{ color: "var(--foreground-muted)", marginBottom: "6px", fontWeight: 600 }}>
                    {turn === 0 ? "Battle Start" : `Turn ${turn}`}
                  </div>
                  {payload.map((entry, index) => (
                    <div key={index} style={{ color: entry.color, marginBottom: "2px" }}>
                      {entry.name}: {entry.value}%
                    </div>
                  ))}
                  {faints.length > 0 && (
                    <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid var(--background-tertiary)" }}>
                      {faints.map((faint, index) => (
                        <div key={index} style={{ color: faint.color, fontSize: "11px" }}>
                          ✕ {faint.pokemon} fainted
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
            formatter={(value) => <span style={{ color: "var(--foreground)" }}>{value}</span>}
          />
          <Line
            type="monotone"
            dataKey={team1Name}
            stroke={team1Color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: team1Color }}
          />
          <Line
            type="monotone"
            dataKey={team2Name}
            stroke={team2Color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: team2Color }}
          />
          {/* Faint markers - X marks for KOs */}
          {faintMarkers.map((marker, index) => (
            <ReferenceDot
              key={`faint-${index}`}
              x={marker.turn}
              y={marker.hp as number}
              r={8}
              fill="transparent"
              shape={(props: { cx?: number; cy?: number }) => {
                const cx = props.cx || 0;
                const cy = props.cy || 0;
                const size = 5;
                return (
                  <g>
                    {/* Background circle to cover the line */}
                    <circle cx={cx} cy={cy} r={7} fill="var(--background-secondary)" />
                    {/* X mark */}
                    <path
                      d={`M${cx - size},${cy - size} L${cx + size},${cy + size} M${cx + size},${cy - size} L${cx - size},${cy + size}`}
                      stroke={marker.color}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  </g>
                );
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
