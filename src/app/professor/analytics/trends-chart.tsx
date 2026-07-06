"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { TrendPoint } from "./page";

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function TrendsChart({ trends }: { trends: TrendPoint[] }) {
  // Fixed, alphabetical team order so colors stay stable as data changes.
  const teamNames = [...new Set(trends.flatMap((p) => Object.keys(p.teams)))].sort().slice(0, 4);
  const data = trends.map((p) => ({
    sprint: `Sprint ${p.sprint}`,
    Overall: p.overallAverage,
    ...Object.fromEntries(teamNames.map((t) => [t, p.teams[t] ?? null])),
  }));

  return (
    <div className="h-80 w-full" role="img" aria-label="Average score per sprint, overall and by team">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="sprint" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
          <YAxis
            domain={[1, 5]}
            tickCount={5}
            tick={{ fontSize: 12 }}
            stroke="var(--muted-foreground)"
            label={{ value: "Avg rating", angle: -90, position: "insideLeft", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="Overall"
            stroke="var(--foreground)"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          {teamNames.map((t, i) => (
            <Line
              key={t}
              type="monotone"
              dataKey={t}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
