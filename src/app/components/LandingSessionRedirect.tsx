'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Restores a persistent HttpOnly-cookie session without storing any token in the browser. */
export default function LandingSessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const restore = async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (active && response.ok) {
          router.replace('/monitoring-dashboard');
        }
      } catch {
        // An unavailable auth API should leave the public landing page usable.
      }
    };

    void restore();
    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
