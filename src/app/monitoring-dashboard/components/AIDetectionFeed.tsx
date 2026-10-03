'use client';

import React from 'react';
import { Brain, MapPin, Clock } from 'lucide-react';
import type { AIDetection } from '@/lib/types';
import type { MonitoringSourceInfo } from '@/lib/monitoringTypes';

export default function AIDetectionFeed({
  detections,
  source,
}: {
  detections: AIDetection[];
  source: MonitoringSourceInfo;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card card-hover">
      <div className="flex flex-col items-start gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Brain size={14} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Deteksi AI</h3>
            <p className="text-xs text-muted-foreground">{detections.length} deteksi diterima dari perangkat</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="text-xs font-medium text-emerald-400">
            {source.connectedToHardware ? 'Terhubung' : 'Tidak tersedia'}
          </span>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {detections.length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">Belum ada deteksi dari perangkat kamera.</p>
        )}
        {detections.map((detection) => {
          return (
            <div
              key={`detect-${detection.id}`}
              className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Brain size={14} />
              </div>
              {detection.imageUrl && (
                // The authenticated image endpoint must be requested directly by the browser so its session cookie is included.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detection.imageUrl}
                  alt={`Deteksi ${detection.objectType} dari ${detection.cameraName}`}
                  className="h-16 w-24 shrink-0 rounded-lg border border-border object-cover"
                  loading="lazy"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{detection.objectType}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold font-tabular ${
                      detection.confidence >= 90
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {detection.confidence}%
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin size={10} />
                    <span className="truncate">{detection.location}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock size={10} />
                    <span className="font-tabular">{detection.timestamp}</span>
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground/60">{detection.cameraName}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
