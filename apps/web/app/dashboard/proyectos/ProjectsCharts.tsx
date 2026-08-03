"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ExecutionPoint = {
  name: string;
  value: number;
};

type FlowPoint = {
  name: string;
  abiertos: number;
  cerrados: number;
};

const barColors = ["#059669", "#0284c7", "#f59e0b", "#dc2626"];

export function ProjectHealthChart({ data }: { data: ExecutionPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="projectHealth" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.62)", fontSize: 12 }} />
        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb", color: "#111827" }} />
        <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={3} fill="url(#projectHealth)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ProjectFlowChart({ data }: { data: FlowPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e5e7eb" }} />
        <Bar dataKey="abiertos" radius={[6, 6, 0, 0]}>
          {data.map((_, index) => <Cell fill={barColors[index % barColors.length]} key={index} />)}
        </Bar>
        <Bar dataKey="cerrados" fill="#10b981" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
