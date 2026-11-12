'use client';

import React from 'react';
import { LucideIcon, ArrowUpRight, ArrowDownRight, Minus, ChevronRight } from 'lucide-react';

export interface KpiDelta {
  current: number;
  /** null = pas de comparaison possible (masqué). */
  prev: number | null;
  /** Valeur précédente formatée, affichée en clair (« vs 1 240 000 F »). */
  prevLabel: string;
  /** true quand une baisse est une bonne nouvelle (ex. reste à encaisser). */
  invert?: boolean;
}

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  delta?: KpiDelta;
  /** Ligne d'info sous la valeur ; `noteTone="warning"` pour ce qui demande une action. */
  note?: React.ReactNode;
  noteTone?: 'muted' | 'warning';
  /** Série journalière pour la mini-courbe (≥ 2 points). */
  spark?: number[];
  /** Ouvre la vue détaillée — la carte devient un bouton. */
  onClick?: () => void;
  loading?: boolean;
  /** Contenu libre sous la valeur (ancienne API des onglets détaillés). */
  sub?: React.ReactNode;
  /** @deprecated Ignorés : les cartes sont neutres, la couleur est réservée aux tendances. */
  color?: string;
  bg?: string;
}

export function KpiCard({ label, value, icon: Icon, delta, note, noteTone = 'muted', spark, onClick, loading, sub }: KpiCardProps) {
  if (loading) {
    return (
      <div className="p-4 rounded-xl border border-surface-border bg-surface-card animate-pulse">
        <div className="h-3 w-20 bg-surface-hover rounded mb-3" />
        <div className="h-8 w-32 bg-surface-hover rounded mb-2" />
        <div className="h-3 w-24 bg-surface-hover rounded" />
      </div>
    );
  }

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-content-secondary truncate">{label}</p>
        {onClick
          ? <ChevronRight className="w-4 h-4 text-content-muted shrink-0" aria-hidden />
          : <Icon className="w-4 h-4 text-content-muted shrink-0" aria-hidden />}
      </div>

      <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-content-primary tabular-nums leading-none truncate">
        {value}
      </p>

      <div className="mt-2 min-h-[18px] flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta && <DeltaBadge {...delta} />}
        {sub}
        {note && (
          <span className={`text-xs ${noteTone === 'warning' ? 'text-status-warning font-medium' : 'text-content-muted'}`}>
            {note}
          </span>
        )}
      </div>

      {spark && spark.length >= 2 && <Sparkline values={spark} />}
    </>
  );

  const base = 'block w-full text-left p-4 rounded-xl border border-surface-border bg-surface-card';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} transition-colors hover:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

function DeltaBadge({ current, prev, prevLabel, invert = false }: KpiDelta) {
  if (prev === null) return null;
  if (prev === 0) {
    return <span className="text-xs text-content-muted">{current > 0 ? 'Rien sur la période préc.' : 'Stable'}</span>;
  }
  const pct = ((current - prev) / prev) * 100;
  const flat = Math.abs(pct) < 0.5;
  const good = invert ? pct < 0 : pct > 0;
  const tone = flat ? 'text-content-muted' : good ? 'text-status-success' : 'text-status-error';
  const Arrow = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${tone}`}>
        <Arrow className="w-3.5 h-3.5" aria-hidden />
        {flat ? '0 %' : `${pct > 0 ? '+' : '−'}${Math.abs(Math.round(pct))} %`}
      </span>
      <span className="text-content-muted">vs {prevLabel}</span>
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 100, h = 24;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - 2 - ((v - min) / range) * (h - 4),
  ]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 w-full h-6 text-brand-400" aria-hidden>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="currentColor" opacity={0.12} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {children}
    </div>
  );
}
