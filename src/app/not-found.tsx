'use client';

import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-4">
      <div className="max-w-md text-center slide-up">
        <div className="mb-6 flex justify-center">
          <h1 className="text-8xl font-semibold tracking-[-0.07em] text-primary opacity-20 sm:text-9xl">404</h1>
        </div>

        <h2 className="mb-2 text-2xl font-semibold tracking-[-0.035em] text-foreground">Halaman tidak ditemukan</h2>
        <p className="mb-8 leading-7 text-muted-foreground">
          Halaman yang Anda cari tidak tersedia atau sudah dipindahkan.
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={() => router.back()} className="button-secondary gap-2 px-6 py-3 font-medium">
            <Icon name="ArrowLeftIcon" size={16} />
            Kembali
          </button>

          <button type="button" onClick={() => router.push('/')} className="button-primary gap-2 px-6 py-3 font-medium">
            <Icon name="HomeIcon" size={16} />
            Ke beranda
          </button>
        </div>
      </div>
    </div>
  );
}
