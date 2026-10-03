'use client';
import React from 'react';
import { Wifi, WifiOff, Droplets, FlaskConical, Thermometer } from 'lucide-react';
import type { SensorReading } from '@/lib/types';
import StatusBadge from '@/components/ui/StatusBadge';

export default function StationStatusList({ stations }: { stations: SensorReading[] }) {
  return (
    <div className="card-hover bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Status stasiun</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {stations.filter((station) => station.sensorStatus === 'Online').length} dari {stations.length} online
        </p>
      </div>
      <div className="divide-y divide-border/50">
        {stations.map((station) => (
          <div
            key={`station-${station?.stationId}`}
            className="px-5 py-3.5 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                  ${station?.sensorStatus === 'Online' ? 'bg-green-500/10' : 'bg-red-500/10'}
                `}>
                  {station?.sensorStatus === 'Online'
                    ? <Wifi size={15} className="text-green-400" />
                    : <WifiOff size={15} className="text-red-400" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{station?.stationName}</p>
                  <p className="text-xs text-muted-foreground/60">Diperbarui {station?.lastUpdated}</p>
                </div>
              </div>
              <StatusBadge status={station?.status} size="sm" />
            </div>

            {station?.sensorStatus === 'Online' && (
              <div className="grid grid-cols-3 gap-2 mt-3 pl-11">
                <div className="flex items-center gap-1.5">
                  <Droplets size={11} className="text-primary shrink-0" />
                  <span className="text-xs font-tabular text-foreground">{station?.waterLevel}m</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FlaskConical size={11} className="text-accent shrink-0" />
                  <span className="text-xs font-tabular text-foreground">pH {station?.pH}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Thermometer size={11} className="text-orange-400 shrink-0" />
                  <span className="text-xs font-tabular text-foreground">{station?.temperature}°C</span>
                </div>
              </div>
            )}

            {station?.sensorStatus === 'Offline' && (
              <div className="mt-2 pl-11">
                <p className="text-xs text-red-400">Tidak merespons — Battery {station?.battery}%</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
