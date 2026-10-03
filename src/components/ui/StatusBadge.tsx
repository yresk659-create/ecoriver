import React from 'react';
import type { RiverStatus, SensorStatus } from '@/lib/types';

interface StatusBadgeProps {
  status: RiverStatus | SensorStatus | string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  Normal: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    dot: 'bg-green-400',
    label: 'Normal',
  },
  Watch: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    label: 'Watch',
  },
  Warning: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    dot: 'bg-orange-400',
    label: 'Warning',
  },
  Critical: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    dot: 'bg-red-400',
    label: 'Critical',
  },
  Online: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    dot: 'bg-green-400',
    label: 'Online',
  },
  Offline: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-400',
    dot: 'bg-gray-400',
    label: 'Offline',
  },
  Good: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    dot: 'bg-green-400',
    label: 'Good',
  },
  owner: {
    bg: 'bg-primary/10',
    text: 'text-primary',
    dot: 'bg-primary',
    label: 'Owner',
  },
  allowed: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    dot: 'bg-green-400',
    label: 'Allowed',
  },
  pending: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    label: 'Pending',
  },
  blocked: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    dot: 'bg-red-400',
    label: 'Blocked',
  },
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    label: status,
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-xs gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${cfg.bg} ${cfg.text} ${sizeClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} pulse-dot`} />
      {cfg.label}
    </span>
  );
}