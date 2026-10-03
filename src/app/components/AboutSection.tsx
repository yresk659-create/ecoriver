import React from 'react';
import { Gauge, LayoutDashboard, LockKeyhole, Sparkles } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';

const principles = [
  { id: 'dashboard', label: 'Dashboard terpusat', icon: LayoutDashboard },
  { id: 'readings', label: 'Data mudah dipahami', icon: Gauge },
  { id: 'access', label: 'Akses akun terlindungi', icon: LockKeyhole },
  { id: 'ai', label: 'Bantuan RiverWatch AI', icon: Sparkles },
];

export default function AboutSection() {
  return (
    <section id="about" className="relative py-20 lg:py-28">
      <div className="mx-auto grid max-w-screen-xl grid-cols-1 items-center gap-12 px-4 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <Reveal className="reveal-copy">
          <div className="section-kicker mb-6">
            Mengenal Smart River
          </div>
          <h2 className="mb-5 text-section-title text-foreground">
            Satu platform untuk memahami<br />
            <span className="text-gradient">sungai dan perangkatnya</span>
          </h2>
          <p className="mb-6 text-sm leading-7 text-muted-foreground lg:text-base">
            Smart River adalah platform digital yang membantu Anda melihat kondisi sungai dan memantau perangkat melalui satu tampilan yang ringkas, terstruktur, dan mudah dipahami.
          </p>
          <p className="text-sm leading-7 text-muted-foreground lg:text-base">
            Pembacaan sensor, status operasional, riwayat perubahan, peringatan, dan informasi pendukung disusun agar Anda dapat menemukan hal penting tanpa berpindah-pindah sistem.
          </p>
        </Reveal>

        <div className="grid grid-cols-2 gap-4">
          {principles.map(({ id, label, icon: Icon }, index) => (
            <Reveal key={id} delay={index * 55} className="h-full">
              <article className="h-full rounded-2xl border border-border bg-card/70 p-6 text-center card-hover">
                <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/10 bg-primary/[0.08]">
                  <Icon size={19} strokeWidth={1.8} className="text-primary" />
                </div>
                <p className="text-sm font-semibold leading-5 text-foreground">{label}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
