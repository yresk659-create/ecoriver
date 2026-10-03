import AppLogo from '@/components/ui/AppLogo';
import Reveal from '@/components/ui/Reveal';

export default function LandingFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/30">
      <div className="mx-auto max-w-screen-xl px-4 py-12 lg:px-8">
        <Reveal className="reveal-copy mb-10">
          <div className="mb-4 flex items-center gap-2.5">
            <AppLogo size={32} />
            <span className="text-base font-semibold tracking-[-0.02em] text-foreground">EcoRiver</span>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            Platform untuk memahami kondisi sungai dan memantau perangkat EcoRiver melalui satu dashboard.
          </p>
        </Reveal>

        <Reveal delay={80} className="flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">© 2026 EcoRiver. Hak cipta dilindungi.</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            <span>Monitoring sungai dalam satu platform</span>
          </div>
        </Reveal>
      </div>
    </footer>
  );
}
