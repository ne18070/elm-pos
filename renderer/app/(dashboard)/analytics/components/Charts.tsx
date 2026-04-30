'use client';

import React from 'react';
import {
  ResponsiveContainer, BarChart as RBarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend,
} from 'recharts';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';

// --- Types --------------------------------------------------------------------

export interface DayStack { 
  date: string; 
  retail: number; 
  services: number; 
  hotel: number; 
  juridique: number; 
}

// --- Helpers ------------------------------------------------------------------

export const fmtAxis = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `${(n / 1_000).toFixed(0)}K`
  : String(Math.round(n));

export const chartTooltipStyle = {
  backgroundColor: 'var(--color-surface-card, #1e1e2e)',
  border: '1px solid var(--color-surface-border, #333)',
  borderRadius: '10px',
  fontSize: 11,
  color: 'var(--color-content-primary, #fff)',
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

export function StackedChart({ days: daysList, fmt }: { days: DayStack[]; fmt: (n: number) => string }) {
  if (daysList.length === 0) {
      return (
          <div className="h-[220px] flex items-center justify-center border border-dashed border-surface-border rounded-xl text-content-muted text-xs">
              Aucune donnée sur la période
          </div>
      );
  }

  const hasRetail   = daysList.some(d => d.retail    > 0);
  const hasServices = daysList.some(d => d.services  > 0);
  const hasHotel    = daysList.some(d => d.hotel     > 0);
  const hasJur      = daysList.some(d => d.juridique > 0);

  const data = daysList.map(d => ({
    ...d,
    label: format(new Date(d.date), 'd MMM', { locale: fr }),
  }));

  return (
    <div className="space-y-4">
        <ResponsiveContainer width="100%" height={220}>
        <RBarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-content-muted, #888)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: 'var(--color-content-muted, #888)' }} axisLine={false} tickLine={false} width={42} />
            <RTooltip
            contentStyle={chartTooltipStyle}
            formatter={(value, name) => [fmt(value as number), name as string]}
            labelStyle={{ marginBottom: 4, fontWeight: 600, color: 'var(--color-content-secondary,#aaa)' }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
            {hasRetail   && <Bar dataKey="retail"    name="Ventes"      stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />}
            {hasServices && <Bar dataKey="services"  name="Prestations" stackId="a" fill="#fb923c" radius={[0, 0, 0, 0]} />}
            {hasHotel    && <Bar dataKey="hotel"     name="Hôtel"       stackId="a" fill="#14b8a6" radius={[0, 0, 0, 0]} />}
            {hasJur      && <Bar dataKey="juridique" name="Honoraires"  stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />}
        </RBarChart>
        </ResponsiveContainer>
    </div>
  );
}

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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: 'var(--color-content-muted,#888)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: 'var(--color-content-muted,#888)' }} axisLine={false} tickLine={false} width={42} />
        <RTooltip
          contentStyle={chartTooltipStyle}
          formatter={(value) => [fmt(value as number)]}
          labelStyle={{ marginBottom: 4, fontWeight: 600, color: 'var(--color-content-secondary,#aaa)' }}
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
