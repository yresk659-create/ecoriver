'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Waves } from 'lucide-react';

export default function HeroSection() {
  return (
    <section id="hero" className="relative flex min-h-[100svh] items-center justify-center overflow-hidden pb-16 pt-28 sm:pb-20">
      <div className="absolute left-1/2 top-[34%] h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.055] blur-3xl" aria-hidden="true" />
      <div className="hero-content relative z-10 mx-auto max-w-5xl px-4 text-center">
        <div className="section-kicker mb-7">
          <Waves size={13} /> Platform monitoring sungai pintar
        </div>
        <h1 className="mb-7 text-hero-display text-gradient-hero">
          <span className="hero-title-line">Eksplorasi EcoRiver.</span>
          <span className="hero-title-line">Amati Perangkat.</span>
          <span className="hero-title-line">Pulihkan Sungai.</span>
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-[0.95rem] leading-7 text-muted-foreground sm:text-base lg:text-lg">
          EcoRiver membantu Anda memahami pembacaan sensor, memeriksa status perangkat, meninjau peringatan, dan memperoleh bantuan AI dari satu dashboard yang mudah digunakan.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/sign-up-login-screen?mode=signup" className="button-primary group w-full gap-2 px-6 py-3.5 text-sm font-semibold sm:w-auto">
            Mulai sekarang <ArrowRight size={16} className="transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
          </Link>
          <Link href="/sign-up-login-screen" className="button-secondary w-full gap-2 px-6 py-3.5 text-sm font-semibold sm:w-auto">
            Masuk
          </Link>
          <a href="#monitoring" className="button-ghost w-full gap-2 px-5 py-3.5 text-sm font-medium sm:w-auto">
            <ShieldCheck size={15} /> Pelajari EcoRiver
          </a>
        </div>
      </div>
    </section>
  );
}
