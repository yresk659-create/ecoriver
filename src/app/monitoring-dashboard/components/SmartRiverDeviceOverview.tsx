'use client';

import React from 'react';
import {
  BatteryCharging,
  Bot,
  Compass,
  Droplets,
  Gauge,
  Lightbulb,
  MapPin,
  Navigation,
  Radio,
  Satellite,
  ScanSearch,
  Waves,
  Zap,
} from 'lucide-react';
import type { SmartRiverDeviceState } from '@/lib/types';

function Metric({
  icon,
  label,
  value,
  unit,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 card-hover">
      <div className="mb-3 flex items-center gap-2 text-primary">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="font-tabular text-2xl font-bold leading-none text-foreground">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {note && <p className="mt-2 text-xs leading-5 text-muted-foreground/75">{note}</p>}
    </article>
  );
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits }).format(value);
}

export default function SmartRiverDeviceOverview({
  state,
  model,
}: {
  state: SmartRiverDeviceState;
  model?: React.ReactNode;
}) {
  const hasCoordinates = state.latitude !== 0 || state.longitude !== 0;
  const observedAt = new Date(state.observedAt).toLocaleString('id-ID');

  return (
    <div className="space-y-4">
      <div className={model ? 'grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]' : undefined}>
        {model}
        <section
          id="active-devices"
          className="h-full overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Bot size={21} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Perangkat Smart River</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{state.deviceId}</h2>
                <p className="mt-1 text-xs text-muted-foreground">Telemetri diterima {observedAt}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                Terhubung
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  state.remoteMode
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                    : 'border-primary/20 bg-primary/10 text-primary'
                }`}
              >
                {state.remoteMode ? 'Mode remote / power rendah' : 'Mode otomatis'}
              </span>
            </div>
          </div>

          <div id="station-status" className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-background/35 p-4">
              <div className="flex items-center gap-2 text-muted-foreground"><Navigation size={15} /><span className="text-xs">Aksi robot</span></div>
              <p className="mt-2 font-mono text-sm font-semibold text-foreground">{state.action}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/35 p-4">
              <div className="flex items-center gap-2 text-muted-foreground"><Waves size={15} /><span className="text-xs">Pompa</span></div>
              <p className="mt-2 text-sm font-semibold text-foreground">{state.pumpActive ? 'Aktif' : 'Tidak aktif'}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/35 p-4">
              <div className="flex items-center gap-2 text-muted-foreground"><ScanSearch size={15} /><span className="text-xs">Deteksi sampah</span></div>
              <p className="mt-2 text-sm font-semibold text-foreground">{state.trashDetected ? 'Terdeteksi' : 'Tidak terdeteksi'}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/35 p-4">
              <div className="flex items-center gap-2 text-muted-foreground"><Radio size={15} /><span className="text-xs">Confidence</span></div>
              <p className="mt-2 font-tabular text-sm font-semibold text-foreground">
                {state.trashDetected ? `${formatNumber(state.detectionConfidence)}%` : '—'}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div id="monitoring-overview">
        <section id="sensor-metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Data sensor Smart River">
          <Metric icon={<Lightbulb size={16} />} label="Sensor cahaya (LDR)" value={formatNumber(state.ldr)} note="Nilai mentah dari ESP32" />
          <Metric icon={<Droplets size={16} />} label="Sensor air" value={formatNumber(state.water)} note="Nilai mentah dari ESP32" />
          <Metric icon={<Gauge size={16} />} label="Jarak objek" value={formatNumber(state.distanceCm, 1)} unit="cm" />
          <Metric icon={<Compass size={16} />} label="Kecepatan" value={formatNumber(state.speedKmh, 1)} unit="km/j" />
          <Metric icon={<BatteryCharging size={16} />} label="Tegangan" value={formatNumber(state.voltageV)} unit="V" />
          <Metric icon={<Zap size={16} />} label="Arus" value={formatNumber(state.currentMa, 0)} unit="mA" />
          <Metric icon={<Zap size={16} />} label="Daya" value={formatNumber(state.powerW)} unit="W" />
          <Metric icon={<Satellite size={16} />} label="Satelit GPS" value={String(state.satelliteCount)} unit="satelit" />
        </section>
      </div>

      <div>
        <section id="device-location" className="rounded-xl border border-border bg-card p-5 card-hover">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapPin size={17} /></span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Lokasi perangkat</h3>
              <p className="mt-1 font-tabular text-sm text-muted-foreground">
                {hasCoordinates
                  ? `${state.latitude.toFixed(6)}, ${state.longitude.toFixed(6)}`
                  : 'Koordinat GPS belum tersedia.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
