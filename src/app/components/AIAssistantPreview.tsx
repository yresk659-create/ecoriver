import Image from 'next/image';
import { Languages } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';

export default function AIAssistantPreview() {
  return (
    <section id="ai-assistant" className="relative overflow-hidden py-20 lg:py-28">
      <div className="absolute right-0 top-1/2 h-96 w-96 rounded-full bg-purple-500/5 blur-3xl" />
      <div className="relative z-10 mx-auto grid max-w-screen-xl items-center gap-10 px-4 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <Reveal className="reveal-copy">
          <div className="section-kicker mb-6">
            RiverWatch AI
          </div>
          <h2 className="text-section-title text-foreground">Pendamping saat menjelajahi EcoRiver</h2>
          <p className="mt-5 text-sm leading-7 text-muted-foreground lg:text-base">
            RiverWatch AI membantu menjelaskan EcoRiver, fitur dashboard, dan istilah monitoring dengan bahasa yang menyesuaikan percakapan Anda.
          </p>
        </Reveal>
        <Reveal delay={90}>
        <div className="rounded-3xl border border-border bg-card/75 p-6 shadow-[var(--shadow-soft)] card-hover">
          <div className="flex items-start gap-4">
            <Image
              src="/assets/images/riverwatch-ai-logo.png"
              alt="Logo RiverWatch AI"
              width={72}
              height={72}
              className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-2xl border border-primary/15 object-cover shadow-[var(--shadow-soft)]"
              priority={false}
            />
            <div>
              <p className="text-sm font-semibold text-foreground">Tersedia di seluruh halaman</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Buka RiverWatch AI kapan saja saat Anda membutuhkan penjelasan.</p>
            </div>
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <Languages size={16} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">Bahasa jawaban menyesuaikan bahasa yang digunakan pada pesan terbaru Anda.</p>
          </div>
        </div>
        </Reveal>
      </div>
    </section>
  );
}
