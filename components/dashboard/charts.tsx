"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export function DonutScore({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const data = [
    { name: "cumplimiento", value: pct },
    { name: "resto", value: 100 - pct }
  ];
  const COLORS = ["#8E6B6B", "rgba(51,51,51,0.10)"];
  return (
    <div className="relative h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={54}
            outerRadius={76}
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-3xl font-semibold tracking-tight">{Math.round(pct)}%</div>
          <div className="mt-1 text-xs text-charcoal/60">Cumplimiento</div>
        </div>
      </div>
    </div>
  );
}

export function BarsEstado({
  data
}: {
  data: Array<{ estado: string; count: number; color: string }>;
}) {
  return (
    <div className="h-[190px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <XAxis dataKey="estado" tick={{ fontSize: 12, fill: "rgba(51,51,51,0.7)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "rgba(51,51,51,0.7)" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" radius={[10, 10, 10, 10]}>
            {data.map((d, idx) => (
              <Cell key={idx} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

