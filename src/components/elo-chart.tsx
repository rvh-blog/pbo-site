"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface EloDataPoint {
  label: string;
  elo: number;
  matchId?: number;
  opponent?: string;
  result?: "W" | "L";
  date?: string;
}

interface EloChartProps {
  data: EloDataPoint[];
  height?: number;
  peakElo?: number;
  showPeakLine?: boolean;
}

export function EloChart({
  data,
  height = 300,
  peakElo,
  showPeakLine = true,
}: EloChartProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[var(--foreground-muted)]"
        style={{ height }}
      >
        No ELO history data available
      </div>
    );
  }

  // Calculate min/max for Y axis with some padding
  const eloValues = data.map((d) => d.elo);
  const minElo = Math.min(...eloValues);
  const maxElo = Math.max(...eloValues);
  const padding = Math.max(50, (maxElo - minElo) * 0.1);
  const yMin = Math.floor((minElo - padding) / 50) * 50;
  const yMax = Math.ceil((maxElo + padding) / 50) * 50;

  // Calculate label interval - fewer labels on mobile for legibility
  const maxLabels = isMobile ? 5 : 12;
  const labelInterval = data.length <= maxLabels ? 0 : Math.ceil(data.length / maxLabels);

  // Custom tick renderer to always show first and last labels
  const renderTick = (props: { x: number; y: number; payload: { value: string; index: number } }) => {
    const { x, y, payload } = props;
    const index = payload.index;
    const isFirst = index === 0;
    const isLast = index === data.length - 1;

    // Always show first and last, otherwise follow interval
    const shouldShow = isFirst || isLast || (labelInterval === 0) || (index % labelInterval === 0);

    if (!shouldShow) return null;

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={16}
          textAnchor="middle"
          fill="var(--foreground-muted)"
          fontSize={isMobile ? 10 : 12}
        >
          {payload.value}
        </text>
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--background-tertiary)"
        />
        <XAxis
          dataKey="label"
          stroke="var(--foreground-muted)"
          fontSize={12}
          tickLine={false}
          axisLine={{ stroke: "var(--background-tertiary)" }}
          tick={renderTick}
          interval={0}
        />
        <YAxis
          domain={[yMin, yMax]}
          stroke="var(--foreground-muted)"
          fontSize={isMobile ? 10 : 12}
          tickLine={false}
          axisLine={{ stroke: "var(--background-tertiary)" }}
          tickFormatter={(value) => Math.round(value).toString()}
          width={isMobile ? 35 : 40}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--background-tertiary)",
            borderRadius: "8px",
            color: "var(--foreground)",
          }}
          labelStyle={{ color: "var(--foreground-muted)" }}
          formatter={(value, name, props) => {
            if (typeof value !== "number") return ["-", "ELO"];
            const point = props.payload as EloDataPoint;
            return [
              <span key="elo">
                <span style={{ fontWeight: "bold" }}>{Math.round(value)}</span>
                {point.result && (
                  <span
                    style={{
                      marginLeft: "8px",
                      color:
                        point.result === "W"
                          ? "var(--success)"
                          : "var(--error)",
                    }}
                  >
                    {point.result === "W" ? "Win" : "Loss"}
                  </span>
                )}
                {point.opponent && (
                  <span
                    style={{
                      marginLeft: "8px",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    vs {point.opponent}
                  </span>
                )}
              </span>,
              "ELO",
            ];
          }}
        />
        {showPeakLine && peakElo && (
          <ReferenceLine
            y={peakElo}
            stroke="var(--accent)"
            strokeDasharray="5 5"
            label={{
              value: `Peak: ${peakElo}`,
              fill: "var(--accent)",
              fontSize: 11,
              position: "right",
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="elo"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={{
            fill: "var(--primary)",
            stroke: "var(--primary)",
            strokeWidth: 2,
            r: 4,
          }}
          activeDot={{
            fill: "var(--accent)",
            stroke: "var(--accent)",
            strokeWidth: 2,
            r: 6,
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
