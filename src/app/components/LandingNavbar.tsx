'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

const navLinks = [
  { id: 'nav-home', label: 'Beranda', href: '#hero' },
  { id: 'nav-features', label: 'Fitur', href: '#features' },
  { id: 'nav-monitoring', label: 'Monitoring', href: '#monitoring' },
  { id: 'nav-ai', label: 'Asisten AI', href: '#ai-assistant' },
  { id: 'nav-about', label: 'Tentang', href: '#about' },
  { id: 'nav-contact', label: 'Mulai', href: '#contact' },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300
        ${scrolled || mobileOpen
          ? 'border-border/80 bg-background/80 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl'
          : 'border-transparent bg-transparent'}
      `}
    >
      <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-4 lg:px-8">
        <Link href="#hero" className="group flex items-center gap-2.5 rounded-lg" aria-label="EcoRiver, kembali ke beranda">
          <span className="transition-transform duration-300 ease-out group-hover:scale-105">
            <AppLogo size={34} />
          </span>
          <span className="text-[0.95rem] font-semibold tracking-[-0.02em] text-foreground">EcoRiver</span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Navigasi utama">
          {navLinks.map((link) => (
            <a
              key={link.id}
              href={link.href}
              className="button-ghost px-3 py-2 text-[0.8rem] font-medium"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/sign-up-login-screen" className="button-ghost px-4 py-2 text-sm font-medium">
            Masuk
          </Link>
          <Link href="/sign-up-login-screen?mode=signup" className="button-primary px-4 py-2 text-sm font-semibold">
            Buat akun
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          className="icon-button h-11 w-11 md:hidden"
          aria-label={mobileOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
        >
          <span className="transition-transform duration-300 ease-out" style={{ transform: mobileOpen ? 'rotate(90deg)' : 'rotate(0)' }}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </span>
        </button>
      </div>

      <div
        id="mobile-navigation"
        className={`grid border-t transition-[grid-template-rows,opacity,border-color] duration-300 ease-out md:hidden
          ${mobileOpen
            ? 'grid-rows-[1fr] border-border/70 opacity-100'
            : 'pointer-events-none grid-rows-[0fr] border-transparent opacity-0'}
        `}
        aria-hidden={!mobileOpen}
      >
        <div className="overflow-hidden">
          <nav className="space-y-1 px-4 py-4" aria-label="Navigasi seluler">
            {navLinks.map((link) => (
              <a
                key={`mobile-${link.id}`}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="button-ghost block w-full px-3 py-2.5 text-sm font-medium"
                tabIndex={mobileOpen ? 0 : -1}
              >
                {link.label}
              </a>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-3">
              <Link
                href="/sign-up-login-screen"
                className="button-secondary px-4 py-2.5 text-sm font-semibold"
                tabIndex={mobileOpen ? 0 : -1}
              >
                Masuk
              </Link>
              <Link
                href="/sign-up-login-screen?mode=signup"
                className="button-primary px-4 py-2.5 text-sm font-semibold"
                tabIndex={mobileOpen ? 0 : -1}
              >
                Buat akun
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
