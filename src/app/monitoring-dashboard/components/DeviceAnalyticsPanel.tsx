'use client';

import { BarChart3, Clock3 } from 'lucide-react';
import type { SmartRiverDeviceState } from '@/lib/types';

/**
 * Analytics landing section for the direct-device telemetry view.
 *
 * The direct Raspberry Pi snapshot currently contains the latest reading,
 * while historical samples are exposed separately by the bridge/database.
 * Keep this state explicit instead of presenting a chart with fabricated
 * points. Once history is available, the section can be replaced by the
 * chart components without changing the sidebar target.
 */
export default function DeviceAnalyticsPanel({ state }: { state: SmartRiverDeviceState }) {
  const observedAt = new Date(state.observedAt);
  const observedLabel = Number.isFinite(observedAt.getTime())
    ? observedAt.toLocaleString('id-ID')
    : 'waktu belum tersedia';

  return (
    <section
      id="analytics-overview"
      aria-labelledby="device-analytics-title"
      className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="device-analytics-title" className="text-sm font-semibold text-foreground">
            Analitik perangkat
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Ringkasan analitik akan dihitung dari riwayat telemetri Smart River.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-background/35 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Perangkat</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{state.deviceId}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/35 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Jarak terakhir</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{state.distanceCm.toFixed(1)} cm</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/35 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pembacaan</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{observedLabel}</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed border-border px-3 py-3 text-xs leading-5 text-muted-foreground">
        <Clock3 size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Riwayat grafik belum dikirim oleh bridge. Hubungkan Raspberry Pi dan biarkan telemetri tersimpan agar tren ketinggian air, daya, dan sensor dapat ditampilkan di sini.
        </p>
      </div>
    </section>
  );
}
