import React from 'react';
import { Waves, Cpu, Droplets, FlaskConical, Bell, Bot } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';


const features = [
  {
    id: 'feat-monitoring',
    icon: Waves,
    title: 'Ringkasan Kondisi Sungai',
    description:
      'Lihat informasi utama kondisi sungai dan status pemantauan dalam satu ringkasan.',
  },
  {
    id: 'feat-sensor',
    icon: Cpu,
    title: 'Status Perangkat',
    description:
      'Periksa status sensor, waktu pembaruan, dan kondisi operasional perangkat Smart River.',
  },
  {
    id: 'feat-waterlevel',
    icon: Droplets,
    title: 'Pelacakan Ketinggian Air',
    description:
      'Amati pembacaan terbaru dan riwayat perubahan ketinggian air melalui grafik yang jelas.',
  },
  {
    id: 'feat-quality',
    icon: FlaskConical,
    title: 'Analisis Kualitas Air',
    description:
      'Tinjau pH, TDS, kekeruhan, oksigen terlarut, dan suhu dalam format yang mudah dibandingkan.',
  },
  {
    id: 'feat-alerts',
    icon: Bell,
    title: 'Peringatan Terpusat',
    description:
      'Temukan kejadian penting dan tingkat peringatannya tanpa harus memeriksa setiap perangkat satu per satu.',
  },
  {
    id: 'feat-ai',
    icon: Bot,
    title: 'Asisten AI',
    description:
      'Tanyakan fungsi Smart River, arti parameter sensor, atau informasi yang sedang Anda pelajari.',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="relative py-20 lg:py-28">
      <div className="mx-auto max-w-screen-xl px-4 lg:px-8">
        <Reveal className="reveal-copy mb-14 text-center lg:mb-16">
          <div className="section-kicker mb-5">
            Yang dapat Anda pantau
          </div>
          <h2 className="mb-5 text-section-title text-foreground">
            Informasi penting tersedia<br />
            <span className="text-gradient">dalam satu Dashboard</span>
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-7 text-muted-foreground lg:text-base">
            Mulai dari status perangkat hingga tren kondisi sungai, Smart River menyajikannya dalam tampilan yang mudah ditelusuri.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feat, index) => {
            const Icon = feat?.icon;
            return (
              <Reveal key={feat.id} delay={index * 55} className="h-full">
                <article className="group h-full rounded-2xl border border-border bg-card/70 p-6 card-hover">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/10 bg-primary/[0.08] text-primary transition-transform duration-300 ease-out group-hover:scale-105">
                    <Icon size={19} strokeWidth={1.8} />
                  </div>
                  <h3 className="mb-2 text-[0.95rem] font-semibold tracking-[-0.015em] text-foreground">{feat.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{feat.description}</p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
