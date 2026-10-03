'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Box, ChevronLeft, ChevronRight, Pause, Play, RotateCw } from 'lucide-react';

const modelViews = [
  {
    label: 'Perspektif depan',
    shortLabel: 'Depan',
    src: '/assets/images/smart-river/smart-river-front.png',
    alt: 'Render 3D Smart River dari perspektif depan',
  },
  {
    label: 'Tampilan bawah',
    shortLabel: 'Bawah',
    src: '/assets/images/smart-river/smart-river-underside.png',
    alt: 'Render 3D Smart River dari bagian bawah',
  },
  {
    label: 'Tampilan atas',
    shortLabel: 'Atas',
    src: '/assets/images/smart-river/smart-river-top.png',
    alt: 'Render 3D Smart River dari bagian atas',
  },
] as const;

export default function SmartRiverModelPreview({ connected = false }: { connected?: boolean }) {
  const [activeView, setActiveView] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    if (!autoRotate) return undefined;
    const timer = window.setInterval(() => {
      setActiveView((current) => (current + 1) % modelViews.length);
    }, 5_500);
    return () => window.clearInterval(timer);
  }, [autoRotate]);

  const selectView = (index: number) => {
    setActiveView(index);
    setAutoRotate(false);
  };

  const previousView = () => {
    setActiveView((current) => (current - 1 + modelViews.length) % modelViews.length);
    setAutoRotate(false);
  };

  const nextView = () => {
    setActiveView((current) => (current + 1) % modelViews.length);
    setAutoRotate(false);
  };

  return (
    <section
      id="device-model"
      className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-[var(--shadow-soft)]"
      aria-label="Pratinjau 3D Smart River"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Box size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Gambaran 3D Smart River</p>
            <p className="text-xs text-muted-foreground">
              {connected ? 'Model perangkat yang sedang terhubung' : 'Model referensi sambil menunggu koneksi alat'}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            connected
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
              : 'border-border bg-muted text-muted-foreground'
          }`}
        >
          {connected ? 'Perangkat terhubung' : 'Pratinjau offline'}
        </span>
      </div>

      <div
        className="relative aspect-[16/9] min-h-[230px] overflow-hidden sm:min-h-[300px]"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 58%), linear-gradient(135deg, rgba(15,23,42,0.92), rgba(2,8,23,0.98))',
        }}
      >
        <div
          aria-hidden="true"
          className="bg-grid pointer-events-none absolute inset-0 opacity-45"
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-2/3 w-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />

        {modelViews.map((view, index) => (
          <Image
            key={view.src}
            src={view.src}
            alt={view.alt}
            fill
            sizes="(max-width: 1279px) 100vw, 56vw"
            priority={index === 0}
            draggable={false}
            className={`absolute inset-0 h-full w-full select-none object-contain p-3 drop-shadow-[0_22px_24px_rgba(0,0,0,0.42)] transition-[opacity,transform] duration-700 ease-out sm:p-6 ${
              index === activeView ? 'scale-100 opacity-100' : 'pointer-events-none scale-[0.97] opacity-0'
            }`}
          />
        ))}

        <button
          type="button"
          onClick={previousView}
          className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/55 text-white/80 backdrop-blur transition hover:scale-105 hover:bg-slate-950/75 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Tampilan 3D sebelumnya"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={nextView}
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/55 text-white/80 backdrop-blur transition hover:scale-105 hover:bg-slate-950/75 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Tampilan 3D berikutnya"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>

        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/60 p-1 backdrop-blur">
          {modelViews.map((view, index) => (
            <button
              type="button"
              key={`dot-${view.src}`}
              onClick={() => selectView(index)}
              className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                index === activeView ? 'w-6 bg-primary' : 'w-1.5 bg-white/45 hover:bg-white/75'
              }`}
              aria-label={`Pilih ${view.label}`}
              aria-pressed={index === activeView}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sudut model 3D">
          {modelViews.map((view, index) => (
            <button
              type="button"
              key={`view-${view.src}`}
              onClick={() => selectView(index)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                index === activeView
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              aria-pressed={index === activeView}
            >
              {view.shortLabel}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAutoRotate((current) => !current)}
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:self-auto"
          aria-pressed={autoRotate}
        >
          {autoRotate ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
          {autoRotate ? 'Jeda putar' : 'Putar otomatis'}
          <RotateCw size={12} className={autoRotate ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
