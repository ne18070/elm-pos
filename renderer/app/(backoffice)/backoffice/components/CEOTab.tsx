'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp, Users, DollarSign, Target,
  ShoppingCart, RefreshCw, ArrowUpRight, Zap,
} from 'lucide-react';
import { getCEOStats, type CEOStats } from '@services/supabase/monitoring';
import { cn, formatCurrency } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';

export function CEOTab() {
  const [stats, setStats]     = useState<CEOStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    setRefreshing(true);
    try {
      setStats(await getCEOStats());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  if (loading) return (
    <div className="h-64 flex flex-col items-center justify-center gap-4">
      <RefreshCw className="w-8 h-8 animate-spin text-content-brand" />
      <p className="text-content-secondary text-sm font-medium">Chargement des métriques business...</p>
    </div>
  );

  if (!stats) return (
    <div className="h-64 flex items-center justify-center">
      <p className="text-content-muted text-sm">Données indisponibles</p>
    </div>
  );

  const conversionOk = stats.conversion_rate >= 50;
  const last7days    = Array.from({ length: 7 }, (_, i) => {
    const d   = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
    const day = format(subDays(new Date(), 6 - i), 'EEE', { locale: fr });
    return { day, count: stats.signups_by_day[d] ?? 0 };
  });
  const maxSignups = Math.max(...last7days.map(d => d.count), 1);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* MRR */}
        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-badge-success text-status-success">
              <DollarSign size={22} />
            </div>
            <button onClick={loadData} className="text-content-muted hover:text-content-primary">
              <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
            </button>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">MRR</p>
          <p className="text-2xl font-black text-content-primary mt-1">{formatCurrency(stats.mrr, 'XOF')}</p>
          <p className="text-[10px] text-status-success font-bold uppercase tracking-tight mt-1">
            {stats.active_businesses} abonnés actifs
          </p>
        </div>

        {/* Trial Pipeline */}
        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-badge-info text-status-info">
              <Zap size={22} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Pipeline Trial</p>
          <p className="text-2xl font-black text-content-primary mt-1">{stats.trial_businesses}</p>
          <p className="text-[10px] text-status-info font-bold uppercase tracking-tight mt-1">
            En période d'essai
          </p>
        </div>

        {/* Signups today */}
        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-badge-purple text-content-brand">
              <Users size={22} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Signups Aujourd'hui</p>
          <p className="text-2xl font-black text-content-primary mt-1">{stats.signup_today}</p>
          <p className="text-[10px] text-content-muted font-bold uppercase tracking-tight mt-1">
            {stats.signup_7d} cette semaine
          </p>
        </div>

        {/* Conversion */}
        <div className={cn(
          'card p-6 border-2',
          conversionOk ? 'border-surface-border' : 'border-status-warning/30 bg-badge-warning'
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              'p-3 rounded-2xl',
              conversionOk ? 'bg-badge-success text-status-success' : 'bg-badge-warning text-status-warning'
            )}>
              <Target size={22} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Conversion Trial</p>
          <p className="text-2xl font-black text-content-primary mt-1">{stats.conversion_rate}%</p>
          <p className={cn(
            'text-[10px] font-bold uppercase tracking-tight mt-1',
            conversionOk ? 'text-status-success' : 'text-status-warning'
          )}>
            {conversionOk ? 'Objectif atteint' : 'Sous l\'objectif (50%)'}
          </p>
        </div>
      </div>

      {/* Revenue + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Signup sparkline (7j) */}
        <div className="card p-6 border-surface-border">
          <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-6 flex items-center gap-2">
            <TrendingUp size={16} className="text-content-brand" />
            Signups — 7 derniers jours
          </h3>
          <div className="flex items-end justify-between gap-1 h-24">
            {last7days.map(({ day, count }) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md bg-content-brand/60 transition-all hover:bg-content-brand"
                  style={{ height: `${Math.round((count / maxSignups) * 80)}px`, minHeight: count > 0 ? '4px' : '2px' }}
                />
                <span className="text-[9px] font-bold text-content-muted capitalize">{day}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-surface-border flex items-center justify-between">
            <span className="text-[10px] text-content-muted font-medium">Total 7j</span>
            <span className="text-sm font-black text-content-primary">{stats.signup_7d} signups</span>
          </div>
        </div>

        {/* Conversion funnel */}
        <div className="card p-6 border-surface-border">
          <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-6 flex items-center gap-2">
            <ShoppingCart size={16} className="text-content-brand" />
            Funnel Activation (7j)
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Inscription démarrée',    value: stats.funnel.signup_started },
              { label: 'Inscription complétée',   value: stats.funnel.signup_completed },
              { label: 'Provisioning OK',         value: stats.funnel.provisioning_success },
              { label: 'Première vente',          value: stats.funnel.first_sale },
            ].map(({ label, value }, i, arr) => {
              const top = arr[0].value || 1;
              const pct = Math.round((value / top) * 100);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-content-secondary">{label}</span>
                    <span className="text-[11px] font-black text-content-primary">{value}</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-input rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', i === 0 ? 'bg-content-brand' : i === arr.length - 1 ? 'bg-status-success' : 'bg-content-brand/60')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-surface-border flex items-center justify-between">
            <span className="text-[10px] text-content-muted font-medium">Revenu 30j (commandes)</span>
            <span className="text-sm font-black text-content-primary">{formatCurrency(stats.revenue_30d, 'XOF')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
