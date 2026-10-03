'use client';

import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WaterLevelDataPoint } from '@/lib/types';

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{label}</p>
      {payload.map((entry) => (
        <div key={`tooltip-${entry.dataKey}`} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-muted-foreground">{entry.name}</span>
          </div>
          <span className="text-xs font-bold font-tabular text-foreground">
            {entry.value} {entry.dataKey === 'level' ? 'm' : 'mm/h'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function WaterLevelChart({
  data,
  stationName,
}: {
  data: WaterLevelDataPoint[];
  stationName: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 card-hover">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Tren ketinggian air</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{stationName} — riwayat pembacaan perangkat</p>
      </div>
      {data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
          Perangkat belum mengirim riwayat ketinggian air.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="waterLevelGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.32} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rainfallGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="level" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={35} />
            <YAxis yAxisId="rain" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={35} />
            <Tooltip content={<CustomTooltip />} />
            <Area yAxisId="rain" type="monotone" dataKey="rainfall" name="Rainfall" stroke="var(--accent)" strokeWidth={1.5} fill="url(#rainfallGradient)" />
            <Area yAxisId="level" type="monotone" dataKey="level" name="Ketinggian air" stroke="var(--primary)" strokeWidth={2.5} fill="url(#waterLevelGradient)" dot={false} activeDot={{ r: 4, fill: 'var(--primary)' }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
