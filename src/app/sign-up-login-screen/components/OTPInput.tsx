'use client';
import React, { useRef, useEffect, ClipboardEvent, KeyboardEvent } from 'react';

interface OTPInputProps {
  value: string[];
  onChange: (val: string[]) => void;
  onComplete?: (code: string) => void;
  hasError: boolean;
  disabled?: boolean;
}

export default function OTPInput({ value, onChange, onComplete, hasError, disabled }: OTPInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const updateValue = (next: string[]) => {
    onChange(next);
    if (next.every((digit) => /^\d$/.test(digit))) {
      onComplete?.(next.join(''));
    }
  };

  const handleChange = (i: number, v: string) => {
    const digits = v.replace(/\D/g, '');
    const next = [...value];

    if (digits.length > 1) {
      for (let offset = 0; offset < digits.length && i + offset < 6; offset += 1) {
        next[i + offset] = digits[offset];
      }
      updateValue(next);
      refs.current[Math.min(i + digits.length - 1, 5)]?.focus();
      return;
    }

    const digit = digits.slice(-1);
    next[i] = digit;
    updateValue(next);
    if (digit && i < 5) {
      refs.current[i + 1]?.focus();
    }
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!value[i] && i > 0) {
        const next = [...value];
        next[i - 1] = '';
        updateValue(next);
        refs.current[i - 1]?.focus();
      } else {
        const next = [...value];
        next[i] = '';
        updateValue(next);
      }
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = [...value];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] ?? '';
    }
    updateValue(next);
    const lastFilled = Math.min(pasted.length, 5);
    refs.current[lastFilled]?.focus();
  };

  return (
    <div className="mx-auto flex w-full max-w-sm items-center justify-center gap-1.5 sm:gap-2.5" aria-label="Kode OTP enam digit">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={`otp-${i}`}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit OTP ${i + 1}`}
          aria-invalid={hasError}
          maxLength={i === 0 ? 6 : 1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={`h-12 min-w-0 flex-1 rounded-xl border bg-muted text-center text-lg font-semibold text-foreground font-tabular sm:h-14 sm:max-w-12 sm:text-xl
            transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20
            ${hasError
              ? 'border-red-500 bg-red-500/5 text-red-400'
              : value[i]
                ? 'border-primary bg-primary/5 text-primary' :'border-border focus:border-primary'
            }
            disabled:opacity-50
          `}
        />
      ))}
    </div>
  );
}
