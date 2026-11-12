'use client';

import React from 'react';
import {
  ResponsiveContainer, BarChart as RBarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend, ComposedChart, Line,
} from 'recharts';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';

// --- Types --------------------------------------------------------------------


// --- Helpers ------------------------------------------------------------------

export const fmtAxis = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(0)}K`
  : String(Math.round(n));

// Variables du thème (globals.css) — triplets RGB, d'où rgb(var(--x)).
export const chartTheme = {
  surface: 'rgb(var(--surface-card))',
  grid:    'rgb(var(--surface-border))',
  axis:    'rgb(var(--text-placeholder))',
  text:    'rgb(var(--text-base))',
  textSecondary: 'rgb(var(--text-secondary))',
  series:  ['rgb(var(--chart-1))', 'rgb(var(--chart-2))', 'rgb(var(--chart-3))', 'rgb(var(--chart-4))'],
};

export const chartTooltipStyle = {
  backgroundColor: chartTheme.surface,
  border: `1px solid ${chartTheme.grid}`,
  borderRadius: '10px',
  fontSize: 11,
  color: chartTheme.text,
};

export function Delta({ current, prev, invert = false }: { current: number; prev: number; invert?: boolean }) {
  if (prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  const positive = invert ? pct < 0 : pct >= 0;
  if (Math.abs(pct) < 0.5) return <span className="text-[10px] text-content-muted flex items-center gap-0.5"><Minus className="w-2.5 h-2.5" /> 0%</span>;
  return (
    <span className={`text-[10px] font-bold flex items-center gap-0.5 ${positive ? 'text-status-success' : 'text-status-error'}`}>
      {positive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

// --- Components ---------------------------------------------------------------

export function SimpleBarChart({
  data, dataKey, color = '#6366f1', fmt, xKey = 'label',
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  color?: string;
  fmt: (n: number) => string;
  xKey?: string;
}) {
  if (data.length === 0) {
    return (
        <div className="h-[200px] flex items-center justify-center border border-dashed border-surface-border rounded-xl text-content-muted text-xs">
            Aucune donnée sur la période
        </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <RBarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--surface-border))" strokeOpacity={0.6} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: 'rgb(var(--text-placeholder))' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: 'rgb(var(--text-placeholder))' }} axisLine={false} tickLine={false} width={42} />
        <RTooltip
          contentStyle={chartTooltipStyle}
          formatter={(value) => [fmt(value as number)]}
          labelStyle={{ marginBottom: 4, fontWeight: 600, color: 'rgb(var(--text-secondary))' }}
        />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
      </RBarChart>
    </ResponsiveContainer>
  );
}

export function RankBar({ label, sub, value, max, color, fmt }: { label: string; sub?: string; value: number; max: number; color: string; fmt: (n: number) => string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <div className="min-w-0">
          <span className="text-content-primary font-medium truncate block">{label}</span>
          {sub && <span className="text-content-muted text-[10px]">{sub}</span>}
        </div>
        <span className="text-content-secondary shrink-0 ml-2">{fmt(value)}</span>
      </div>
      <div className="h-1.5 bg-surface-input rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// --- Tendance : CA par jour, par activité, + période précédente ---------------

export interface TrendPoint {
  date: string;
  ventes: number;
  prestations: number;
  hotel: number;
  honoraires: number;
  /** CA facturé du même rang de jour sur la période précédente (null = pas de comparaison). */
  prev: number | null;
}

const TREND_SERIES = [
  { key: 'ventes',      name: 'Ventes' },
  { key: 'prestations', name: 'Prestations' },
  { key: 'hotel',       name: 'Hôtel' },
  { key: 'honoraires',  name: 'Honoraires' },
] as const;

/**
 * Barres empilées par activité (ordre et couleurs fixes : une activité garde sa
 * couleur quelle que soit la combinaison affichée) + ligne pointillée neutre
 * pour la période précédente, sur le même axe.
 */
export function TrendChart({ points, fmt, prevLabel }: { points: TrendPoint[]; fmt: (n: number) => string; prevLabel: string }) {
  const active = TREND_SERIES
    .map((s, i) => ({ ...s, color: chartTheme.series[i] }))
    .filter((s) => points.some((p) => p[s.key] > 0));
  const hasPrev = points.some((p) => (p.prev ?? 0) > 0);
  const data = points.map((p) => ({ ...p, label: format(new Date(`${p.date}T00:00:00`), 'd MMM', { locale: fr }) }));
  const topKey = active[active.length - 1]?.key;
  const showLegend = active.length + (hasPrev ? 1 : 0) >= 2;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} strokeOpacity={0.6} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.axis }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: chartTheme.axis }} axisLine={false} tickLine={false} width={42} />
        <RTooltip
          contentStyle={chartTooltipStyle}
          cursor={{ fill: chartTheme.grid, fillOpacity: 0.35 }}
          formatter={(value, name) => [value == null ? '—' : fmt(value as number), name as string]}
          labelStyle={{ marginBottom: 4, fontWeight: 600, color: chartTheme.textSecondary }}
        />
        {showLegend && <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10, color: chartTheme.textSecondary }} />}
        {active.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="ca" fill={s.color}
            stroke={chartTheme.surface} strokeWidth={1}
            radius={s.key === topKey ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
        {hasPrev && (
          <Line dataKey="prev" name={prevLabel} type="monotone" stroke={chartTheme.axis}
            strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 4 }} connectNulls />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
