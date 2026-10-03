'use client';
import React from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthProps {
  password: string;
}

function checkStrength(pw: string) {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  const score = Object.values(checks).filter(Boolean).length;
  return { checks, score };
}

const levels = [
  { min: 0, max: 1, label: 'Sangat Lemah', color: 'bg-red-500' },
  { min: 2, max: 2, label: 'Lemah', color: 'bg-orange-500' },
  { min: 3, max: 3, label: 'Cukup', color: 'bg-amber-500' },
  { min: 4, max: 4, label: 'Kuat', color: 'bg-green-500' },
  { min: 5, max: 5, label: 'SangatKuat', color: 'bg-primary' },
];

const requirementLabels: Record<string, string> = {
  length: 'Minimal 8 karakter',
  upper: 'Huruf kapital (A-Z)',
  lower: 'Huruf kecil (a-z)',
  number: 'Angka (0-9)',
  special: 'Karakter khusus (!@#$)',
};

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  if (!password) return null;
  const { checks, score } = checkStrength(password);
  const level = levels.find((l) => score >= l.min && score <= l.max) ?? levels[0];

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`bar-${i}`}
              className={`h-1.5 flex-1 rounded-full transition-[background-color,transform] duration-300 ${
                i < score ? level.color : 'bg-border'
              }`}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{level.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {Object.entries(checks).map(([key, passed]) => (
          <div key={`req-${key}`} className="flex items-center gap-1.5">
            {passed
              ? <Check size={11} className="text-green-400 shrink-0" />
              : <X size={11} className="text-muted-foreground/50 shrink-0" />
            }
            <span className={`text-xs ${passed ? 'text-green-400' : 'text-muted-foreground/60'}`}>
              {requirementLabels[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
