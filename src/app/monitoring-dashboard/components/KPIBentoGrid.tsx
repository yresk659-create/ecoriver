'use client';

import React from 'react';
import {
  AlertTriangle,
  Battery,
  CloudRain,
  Droplets,
  Eye,
  FlaskConical,
  Scan,
  Thermometer,
  TrendingUp,
  Waves,
  Wifi,
  WifiOff,
  Wind,
  Zap,
} from 'lucide-react';
import type { AIDetection, RiverAlert, RiverStatus, SensorReading } from '@/lib/types';

const statusClass: Record<RiverStatus, string> = {
  Normal: 'bg-green-500/10 text-green-400',
  Watch: 'bg-amber-500/10 text-amber-400',
  Warning: 'bg-orange-500/10 text-orange-400',
  Critical: 'bg-red-500/10 text-red-400',
};

function MetricCard({
  icon,
  label,
  value,
  unit,
  status,
  updatedAt,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  status?: RiverStatus;
  updatedAt?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 card-hover">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
        {status && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[status]}`}>{status}</span>}
      </div>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold font-tabular leading-none text-foreground">{value}</span>
        {unit && <span className="mb-0.5 text-sm text-muted-foreground">{unit}</span>}
      </div>
      {updatedAt && <p className="mt-2 text-xs text-muted-foreground/70">Diperbarui {updatedAt}</p>}
    </div>
  );
}

export default function KPIBentoGrid({
  primaryStation,
  allStations,
  alerts,
  detections,
}: {
  primaryStation: SensorReading;
  allStations: SensorReading[];
  alerts: RiverAlert[];
  detections: AIDetection[];
}) {
  const onlineCount = allStations.filter((station) => station.sensorStatus === 'Online').length;
  const offlineCount = allStations.filter((station) => station.sensorStatus === 'Offline').length;
  const activeAlerts = alerts.filter((alert) => !alert.acknowledged);
  const severitySummary = ['critical', 'warning', 'info']
    .map((severity) => {
      const count = activeAlerts.filter((alert) => alert.severity === severity).length;
      return count ? `${count} ${severity}` : null;
    })
    .filter(Boolean)
    .join(', ');
  const lowestBatteryStation = [...allStations].sort((left, right) => left.battery - right.battery)[0];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      <div className="relative col-span-1 overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-card p-5 card-hover sm:col-span-2">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <Waves size={18} className="text-primary" />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ketinggian air</span>
              <p className="text-xs text-muted-foreground/70">{primaryStation.stationName}</p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[primaryStation.status]}`}>
            {primaryStation.status}
          </span>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-5xl font-bold font-tabular leading-none text-primary">{primaryStation.waterLevel}</span>
          <span className="mb-1 text-lg text-primary/70">m</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <TrendingUp size={12} className="text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Diperbarui {primaryStation.lastUpdated}</span>
        </div>
        <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-primary/5" />
      </div>

      <MetricCard icon={<Wind size={16} />} label="Debit aliran" value={String(primaryStation.flowRate)} unit="m³/s" status={primaryStation.status} updatedAt={primaryStation.lastUpdated} />
      <MetricCard icon={<Thermometer size={16} />} label="Suhu" value={String(primaryStation.temperature)} unit="°C" status={primaryStation.status} updatedAt={primaryStation.lastUpdated} />
      <MetricCard icon={<FlaskConical size={16} />} label="pH" value={String(primaryStation.pH)} status={primaryStation.status} updatedAt={primaryStation.lastUpdated} />
      <MetricCard icon={<Zap size={16} />} label="TDS" value={String(primaryStation.tds)} unit="mg/L" status={primaryStation.status} updatedAt={primaryStation.lastUpdated} />
      <MetricCard icon={<Eye size={16} />} label="Kekeruhan" value={String(primaryStation.turbidity)} unit="NTU" status={primaryStation.status} updatedAt={primaryStation.lastUpdated} />
      <MetricCard icon={<Droplets size={16} />} label="Oksigen terlarut" value={String(primaryStation.dissolvedOxygen)} unit="mg/L" status={primaryStation.status} updatedAt={primaryStation.lastUpdated} />
      <MetricCard icon={<CloudRain size={16} />} label="Curah hujan" value={String(primaryStation.rainfall)} unit="mm/h" status={primaryStation.status} updatedAt={primaryStation.lastUpdated} />
      <MetricCard icon={<Battery size={16} />} label="Baterai terendah" value={lowestBatteryStation ? String(lowestBatteryStation.battery) : '—'} unit="%" updatedAt={lowestBatteryStation?.lastUpdated} />

      <MetricCard icon={<Wifi size={16} />} label="Sensor online" value={String(onlineCount)} unit={`/ ${allStations.length}`} />
      <MetricCard icon={<WifiOff size={16} />} label="Sensor offline" value={String(offlineCount)} unit="sensor" />
      <MetricCard icon={<AlertTriangle size={16} />} label="Alert aktif" value={String(activeAlerts.length)} unit="alert" />
      <MetricCard icon={<Scan size={16} />} label="Deteksi AI" value={String(detections.length)} unit="deteksi" />

      {severitySummary && <p className="col-span-full px-1 text-xs text-muted-foreground">Ringkasan alert: {severitySummary}</p>}
    </div>
  );
}
