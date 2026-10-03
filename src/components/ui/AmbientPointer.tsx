'use client';

import { useEffect, useRef } from 'react';

export default function AmbientPointer() {
  const auraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const aura = auraRef.current;
    const finePointer = window.matchMedia('(pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (!aura || !finePointer.matches || reducedMotion.matches) return;

    let frame: number | null = null;
    let currentX = -600;
    let currentY = -600;
    let targetX = currentX;
    let targetY = currentY;

    const animate = () => {
      currentX += (targetX - currentX) * 0.14;
      currentY += (targetY - currentY) * 0.14;
      aura.style.setProperty('--pointer-x', `${currentX}px`);
      aura.style.setProperty('--pointer-y', `${currentY}px`);

      if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
        frame = window.requestAnimationFrame(animate);
      } else {
        frame = null;
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      aura.dataset.visible = 'true';
      if (frame === null) frame = window.requestAnimationFrame(animate);
    };

    const handlePointerLeave = () => {
      aura.dataset.visible = 'false';
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={auraRef} className="pointer-aura" data-visible="false" aria-hidden="true" />;
}
