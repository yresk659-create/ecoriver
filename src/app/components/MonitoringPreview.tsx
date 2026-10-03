import { ChartNoAxesCombined, LayoutDashboard, ScanSearch } from 'lucide-react';
import Reveal from '@/components/ui/Reveal';

const monitoringSteps = [
  { icon: LayoutDashboard, title: 'Buka dashboard', text: 'Masuk ke ruang monitoring untuk melihat ringkasan perangkat EcoRiver.' },
  { icon: ScanSearch, title: 'Temukan informasi', text: 'Telusuri pembacaan sensor, status perangkat, peringatan, dan deteksi dari satu tempat.' },
  { icon: ChartNoAxesCombined, title: 'Amati perubahan', text: 'Gunakan data terbaru dan riwayat grafik untuk memahami perubahan kondisi dari waktu ke waktu.' },
];

export default function MonitoringPreview() {
  return (
    <section id="monitoring" className="relative py-20 lg:py-28">
      <div className="relative z-10 mx-auto max-w-screen-xl px-4 lg:px-8">
        <Reveal className="reveal-copy mx-auto mb-12 max-w-2xl text-center">
          <div className="section-kicker mb-5">
            Cara menggunakan
          </div>
          <h2 className="text-section-title text-foreground">Mulai memantau dengan alur yang sederhana</h2>
          <p className="mx-auto mt-5 text-sm leading-7 text-muted-foreground lg:text-base">
            EcoRiver membantu Anda berpindah dari ringkasan umum menuju informasi perangkat yang lebih terperinci dalam beberapa langkah.
          </p>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          {monitoringSteps.map(({ icon: Icon, title, text }, index) => (
            <Reveal key={title} delay={index * 65} className="h-full">
              <article className="h-full rounded-2xl border border-border bg-card/70 p-6 card-hover">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/10 bg-primary/[0.08] text-primary"><Icon size={19} strokeWidth={1.8} /></div>
                <h3 className="mt-5 text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
