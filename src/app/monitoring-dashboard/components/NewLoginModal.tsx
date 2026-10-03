'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, MapPin, Monitor, Shield, X } from 'lucide-react';
import type { Session } from '@/lib/types';
import { useAuth } from '@/lib/authContext';

interface NewLoginModalProps {
  session: Session;
}

export default function NewLoginModal({ session }: NewLoginModalProps) {
  const { allowSession, blockSession, dismissPendingSession, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      setVisible(true);
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVisible(false);
        window.setTimeout(dismissPendingSession, 220);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [dismissPendingSession]);

  const closeModal = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    window.setTimeout(dismissPendingSession, 220);
  };

  const updateSession = async (action: 'allow' | 'revoke') => {
    setError(null);
    const result =
      action === 'allow' ? await allowSession(session.id) : await blockSession(session.id);
    if (!result.success) {
      setError(result.error ?? 'Sesi perangkat belum dapat diperbarui.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={closeModal}
        aria-hidden="true"
      />
      <section
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-lifted)] transition-[opacity,transform] duration-300 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.98)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-login-title"
        aria-describedby="new-login-description"
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
              <Shield size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 id="new-login-title" className="text-base font-semibold tracking-[-0.015em] text-foreground">Login baru terdeteksi</h3>
              <p id="new-login-description" className="text-xs text-muted-foreground">Seseorang mencoba masuk ke akun Anda</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={closeModal} className="icon-button h-10 w-10" aria-label="Tutup pemberitahuan login">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-3">
              <Monitor size={16} className="shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-medium text-foreground">{session.browser} · {session.os}</p>
                <p className="text-xs text-muted-foreground">{session.deviceName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin size={16} className="shrink-0 text-amber-400" />
              <p className="text-sm text-foreground">{session.location}</p>
            </div>
            <div className="flex items-center gap-3">
              <Clock size={16} className="shrink-0 text-amber-400" />
              <p className="text-sm text-foreground">{session.lastActive}</p>
            </div>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">
            Apakah Anda mengenali perangkat ini? Izinkan jika ini Anda, atau tolak jika tidak.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void updateSession('revoke')}
              disabled={isLoading}
              className="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition-[background-color,transform] hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-50"
            >
              Tolak
            </button>
            <button
              type="button"
              onClick={() => void updateSession('allow')}
              disabled={isLoading}
              className="button-primary flex-1 px-4 py-2.5 text-sm font-semibold"
            >
              Izinkan
            </button>
          </div>
          {error && <p className="text-xs text-red-400 fade-in" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  );
}
