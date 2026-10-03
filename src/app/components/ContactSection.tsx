import React from 'react';
import { Bot, LayoutDashboard, UserPlus } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';

const setupSteps = [
  {
    id: 'account',
    icon: UserPlus,
    title: 'Buat akun',
    text: 'Daftarkan akun EcoRiver Anda dan selesaikan verifikasi keamanan.',
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'Jelajahi dashboard',
    text: 'Lihat ringkasan monitoring dan buka informasi perangkat yang ingin Anda tinjau.',
  },
  {
    id: 'ai',
    icon: Bot,
    title: 'Gunakan RiverWatch AI',
    text: 'Ajukan pertanyaan untuk memahami EcoRiver dan istilah yang muncul saat monitoring.',
  },
];

export default function ContactSection() {
  return (
    <section id="contact" className="relative py-20 lg:py-28">
      <div className="relative z-10 mx-auto max-w-screen-xl px-4 lg:px-8">
        <Reveal className="reveal-copy mx-auto mb-12 max-w-2xl text-center">
          <div className="section-kicker mb-5">
            Siap mencoba?
          </div>
          <h2 className="text-section-title text-foreground">
            Mulai mengenal dan memantau<br />
            <span className="text-gradient">bersama EcoRiver</span>
          </h2>
          <p className="mt-5 text-sm leading-7 text-muted-foreground lg:text-base">
            Buat akun untuk mencoba pengalaman monitoring perangkat EcoRiver melalui dashboard yang aman dan mudah digunakan.
          </p>
        </Reveal>

        <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3">
          {setupSteps.map(({ id, icon: Icon, title, text }, index) => (
            <Reveal key={id} delay={index * 65} className="h-full">
              <article className="h-full rounded-2xl border border-border bg-card/70 p-6 card-hover">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/10 bg-primary/[0.08] text-primary">
                  <Icon size={19} strokeWidth={1.8} />
                </div>
                <h3 className="mt-5 text-[0.95rem] font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
