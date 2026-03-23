'use client';

import React, { useEffect, useState } from 'react';
import { TrendingUp, ShoppingBag, BarChart, DollarSign, Sun, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { getAnalyticsSummary, getDailySales } from '@services/supabase/analytics';
import type { AnalyticsSummary } from '@pos-types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const PERIODS = [
  { label: 'Aujourd\'hui', value: 0  },
  { label: '7 jours',      value: 7  },
  { label: '30 jours',     value: 30 },
  { label: '90 jours',     value: 90 },
];

export default function AnalyticsPage() {
  const { business } = useAuthStore();
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [today, setToday] = useState<{ total: number; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fmt = (n: number) => formatCurrency(n, business?.currency ?? 'XOF');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  async function loadAll(silent = false) {
    if (!business) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [summary, todayData] = await Promise.all([
        getAnalyticsSummary(business.id, period === 0 ? 1 : period),
        getDailySales(business.id, todayStr),
      ]);
      // For "Aujourd'hui", filter summary to today only
      if (period === 0) {
        const todayStat = summary.daily_stats.find((d) => d.date === todayStr);
        setData({
          ...summary,
          total_sales: todayStat?.total_sales ?? 0,
          order_count: todayStat?.order_count ?? 0,
          avg_order_value: todayStat?.avg_order_value ?? 0,
          daily_stats: todayStat ? [todayStat] : [],
        });
      } else {
        setData(summary);
      }
      setToday(todayData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadAll(); }, [business, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats: { label: string; value: string; sub?: string; icon: React.ElementType; color: string; bg: string }[] = [
    {
      label: period === 0 ? 'Ventes aujourd\'hui' : 'Chiffre d\'affaires',
      value: data ? fmt(data.total_sales) : '—',
      icon: DollarSign,
      color: 'text-brand-400',
      bg: 'bg-brand-900/20 border-brand-800',
    },
    {
      label: period === 0 ? 'Commandes aujourd\'hui' : 'Commandes',
      value: data ? String(data.order_count) : '—',
      icon: ShoppingBag,
      color: 'text-green-400',
      bg: 'bg-green-900/20 border-green-800',
    },
    {
      label: 'Panier moyen',
      value: data ? fmt(data.avg_order_value) : '—',
      icon: BarChart,
      color: 'text-purple-400',
      bg: 'bg-purple-900/20 border-purple-800',
    },
    {
      label: 'Ventes du jour (live)',
      value: today ? fmt(today.total) : '—',
      sub: today ? `${today.count} commande${today.count !== 1 ? 's' : ''}` : undefined,
      icon: Sun,
      color: 'text-yellow-400',
      bg: 'bg-yellow-900/20 border-yellow-800',
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-surface-border flex items-center justify-between sticky top-0 bg-surface z-10">
        <h1 className="text-xl font-bold text-white">Statistiques</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="btn-secondary p-2"
            title="Actualiser"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex gap-1 bg-surface-input rounded-xl p-1">
            {PERIODS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === value ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Cartes KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, color, bg, sub }) => (
            <div key={label} className={`p-5 rounded-xl border ${bg}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-slate-400">{label}</p>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className={`text-2xl font-bold ${loading ? 'text-slate-600 animate-pulse' : 'text-white'}`}>
                {loading ? '...' : value}
              </p>
              {sub && !loading && (
                <p className="text-xs text-slate-500 mt-1">{sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* Graphe des ventes journalières */}
        {data && data.daily_stats.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Ventes journalières</h2>
            <div className="flex items-end gap-1 h-40">
              {data.daily_stats.map((day) => {
                const maxVal = Math.max(...data.daily_stats.map((d) => d.total_sales), 1);
                const height = (day.total_sales / maxVal) * 100;
                return (
                  <div
                    key={day.date}
                    className="group flex-1 flex flex-col items-center gap-1"
                    title={`${format(new Date(day.date), 'd MMM', { locale: fr })} — ${fmt(day.total_sales)}`}
                  >
                    <div
                      className="w-full bg-brand-600 rounded-t hover:bg-brand-500 transition-colors cursor-pointer"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top produits */}
        {data && data.top_products.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Top produits</h2>
            <div className="space-y-3">
              {data.top_products.slice(0, 10).map((p, i) => {
                const maxRev = data.top_products[0].revenue;
                const pct = maxRev > 0 ? (p.revenue / maxRev) * 100 : 0;
                return (
                  <div key={p.product_id} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-500 w-4">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white font-medium truncate">{p.name}</span>
                        <span className="text-slate-400 shrink-0 ml-2">{fmt(p.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-surface-input rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 w-16 text-right">
                      {p.quantity_sold} ventes
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
