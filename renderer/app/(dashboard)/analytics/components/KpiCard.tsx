'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  sub?: React.ReactNode;
  loading?: boolean;
}

export function KpiCard({ label, value, icon: Icon, color, bg, sub, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className={`p-4 rounded-xl border border-surface-border bg-surface-card animate-pulse`}>
        <div className="flex items-center justify-between mb-2">
          <div className="h-3 w-16 bg-surface-hover rounded" />
          <div className="w-4 h-4 bg-surface-hover rounded" />
        </div>
        <div className="h-6 w-24 bg-surface-hover rounded mb-2" />
        <div className="h-2 w-12 bg-surface-hover rounded" />
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border transition-all hover:shadow-md ${bg}`}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-content-secondary font-medium">{label}</p>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-xl font-bold text-content-primary">
        {value}
      </p>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {children}
    </div>
  );
}
