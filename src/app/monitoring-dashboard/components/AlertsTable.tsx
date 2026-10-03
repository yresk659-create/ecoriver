'use client';

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { RiverAlert } from '@/lib/types';

const severityConfig = {
  critical: { icon: <AlertTriangle size={14} className="text-red-400" />, badge: 'bg-red-500/10 text-red-400', label: 'Critical', row: 'border-l-2 border-l-red-500/50' },
  warning: { icon: <AlertTriangle size={14} className="text-orange-400" />, badge: 'bg-orange-500/10 text-orange-400', label: 'Warning', row: 'border-l-2 border-l-orange-500/50' },
  info: { icon: <Info size={14} className="text-primary" />, badge: 'bg-primary/10 text-primary', label: 'Info', row: '' },
};

export default function AlertsTable({ alerts }: { alerts: RiverAlert[] }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'acknowledged'>('all');
  const filtered = alerts.filter((alert) => (filter === 'active' ? !alert.acknowledged : filter === 'acknowledged' ? alert.acknowledged : true));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card card-hover">
      <div className="flex flex-col items-stretch gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Peringatan terbaru</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{alerts.filter((alert) => !alert.acknowledged).length} alert aktif</p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:flex">
          {(['all', 'active', 'acknowledged'] as const).map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:py-1 ${filter === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {item === 'all' ? 'Semua' : item === 'active' ? 'Aktif' : 'Selesai'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['Tingkat', 'Jenis', 'Stasiun', 'Pesan', 'Waktu', 'Status'].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Belum ada alert dari perangkat.</td></tr>}
            {filtered.map((alert) => {
              const config = severityConfig[alert.severity];
              return (
                <tr key={alert.id} className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${config.row} ${alert.acknowledged ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${config.badge}`}>{config.icon}{config.label}</span></td>
                  <td className="px-4 py-3"><span className="whitespace-nowrap text-xs font-medium text-foreground">{alert.type}</span></td>
                  <td className="px-4 py-3"><span className="whitespace-nowrap text-xs text-muted-foreground">{alert.stationName}</span></td>
                  <td className="max-w-[280px] px-4 py-3"><span className="line-clamp-2 text-xs text-foreground">{alert.message}</span></td>
                  <td className="px-4 py-3"><span className="whitespace-nowrap text-xs font-tabular text-muted-foreground">{alert.timestamp}</span></td>
                  <td className="px-4 py-3">{alert.acknowledged ? <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircle2 size={12} />Selesai</span> : <span className="inline-flex items-center gap-1 text-xs text-orange-400"><span className="h-1.5 w-1.5 rounded-full bg-orange-400 pulse-dot" />Aktif</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
