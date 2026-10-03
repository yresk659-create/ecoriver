'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WaterQualityDataPoint } from '@/lib/types';

const statusColors: Record<string, string> = {
  Normal: 'var(--status-normal)',
  Watch: 'var(--status-watch)',
  Warning: 'var(--status-warning)',
  Critical: 'var(--status-critical)',
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { unit: string; status: string; max: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-soft)]">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">Nilai: <span className="font-bold text-foreground">{data.value} {data.payload.unit}</span></p>
      <p className="text-xs text-muted-foreground">Batas: <span className="font-semibold text-foreground">{data.payload.max} {data.payload.unit}</span></p>
      <p className="mt-1 text-xs" style={{ color: statusColors[data.payload.status] }}>Status: {data.payload.status}</p>
    </div>
  );
}

export default function WaterQualityChart({
  data,
  stationName,
}: {
  data: WaterQualityDataPoint[];
  stationName: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 card-hover">
      <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Kualitas Air</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Parameter perangkat — {stationName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {['Normal', 'Watch', 'Warning', 'Critical'].map((status) => (
            <div key={`legend-${status}`} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: statusColors[status] }} />
              <span>{status}</span>
            </div>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          Perangkat belum mengirim parameter kualitas air.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="parameter" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={30} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'color-mix(in srgb, var(--primary) 8%, transparent)' }}
            />
            <Bar dataKey={(entry) => (entry.value / entry.max) * 100} radius={[4, 4, 0, 0]} maxBarSize={40}>
              {data.map((entry) => <Cell key={`quality-${entry.parameter}`} fill={statusColors[entry.status]} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
