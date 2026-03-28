'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, ShoppingBag, BarChart, DollarSign, Sun,
  RefreshCw, Store, Tag, BedDouble, LogIn, LogOut, Banknote, Wrench,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import {
  getAnalyticsSummary, getDailySales, getCouponStats, getHotelAnalytics,
} from '@services/supabase/analytics';
import type { AnalyticsSummary } from '@pos-types';
import type { CouponStat, HotelAnalyticsSummary } from '@services/supabase/analytics';
import { GrossisteTab } from '@/components/analytics/GrossisteTab';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const PERIODS = [
  { label: "Aujourd'hui", value: 0  },
  { label: '7 jours',     value: 7  },
  { label: '30 jours',    value: 30 },
  { label: '90 jours',    value: 90 },
];

type Tab = 'general' | 'produits' | 'grossiste' | 'promos' | 'hotel';

export default function AnalyticsPage() {
  const { business } = useAuthStore();
  const [period, setPeriod]   = useState(30);
  const [tab, setTab]         = useState<Tab>('general');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [data, setData]       = useState<AnalyticsSummary | null>(null);
  const [today, setToday]     = useState<{ total: number; count: number } | null>(null);
  const [coupons, setCoupons] = useState<CouponStat[]>([]);
  const [hotelData, setHotelData] = useState<HotelAnalyticsSummary | null>(null);
  const isHotel = business?.type === 'hotel';

  const fmt = (n: number) => formatCurrency(n, business?.currency ?? 'XOF');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const days = period === 0 ? 1 : period;

  const loadAll = useCallback(async (silent = false) => {
    if (!business) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [summary, todayData, couponData, hotelStats] = await Promise.all([
        getAnalyticsSummary(business.id, days),
        getDailySales(business.id, todayStr),
        getCouponStats(business.id, days),
        business.type === 'hotel' ? getHotelAnalytics(business.id, days) : Promise.resolve(null),
      ]);
      setHotelData(hotelStats);
      if (period === 0) {
        const todayStat = summary.daily_stats.find((d) => d.date === todayStr);
        setData({
          ...summary,
          total_sales:     todayStat?.total_sales     ?? 0,
          order_count:     todayStat?.order_count     ?? 0,
          avg_order_value: todayStat?.avg_order_value ?? 0,
          daily_stats:     todayStat ? [todayStat] : [],
        });
      } else {
        setData(summary);
      }
      setToday(todayData);
      setCoupons(couponData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business, days, period, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [business, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = [
    {
      label: period === 0 ? "Ventes aujourd'hui" : 'Chiffre d\'affaires',
      value: data ? fmt(data.total_sales) : '—',
      icon: DollarSign, color: 'text-brand-400', bg: 'bg-brand-900/20 border-brand-800',
    },
    {
      label: period === 0 ? "Commandes aujourd'hui" : 'Commandes',
      value: data ? String(data.order_count) : '—',
      icon: ShoppingBag, color: 'text-green-400', bg: 'bg-green-900/20 border-green-800',
    },
    {
      label: 'Panier moyen',
      value: data ? fmt(data.avg_order_value) : '—',
      icon: BarChart, color: 'text-purple-400', bg: 'bg-purple-900/20 border-purple-800',
    },
    {
      label: 'Ventes du jour (live)',
      value: today ? fmt(today.total) : '—',
      sub: today ? `${today.count} commande${today.count !== 1 ? 's' : ''}` : undefined,
      icon: Sun, color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800',
    },
  ];

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'general',   label: 'Général',   icon: TrendingUp },
    { id: 'produits',  label: 'Produits',  icon: BarChart   },
    { id: 'grossiste', label: 'Grossiste', icon: Store      },
    { id: 'promos',    label: 'Promos',    icon: Tag        },
    ...(isHotel ? [{ id: 'hotel' as Tab, label: 'Hôtel', icon: BedDouble }] : []),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-surface-border flex items-center justify-between shrink-0">
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

      {/* Tabs */}
      <div className="flex border-b border-surface-border shrink-0 bg-surface">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors border-b-2 ${
              tab === id
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── Général ── */}
        {tab === 'general' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {kpis.map(({ label, value, icon: Icon, color, bg, sub }) => (
                <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-400">{label}</p>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <p className={`text-xl font-bold ${loading ? 'text-slate-600 animate-pulse' : 'text-white'}`}>
                    {loading ? '...' : value}
                  </p>
                  {sub && !loading && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
                </div>
              ))}
            </div>

            {data && data.daily_stats.length > 0 && (
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-slate-300 mb-4">Ventes journalières</h2>
                <div className="flex items-end gap-1 h-36">
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
                          className="w-full bg-brand-600 rounded-t hover:bg-brand-500 transition-colors"
                          style={{ height: `${height}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Produits ── */}
        {tab === 'produits' && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Top produits</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Chargement…</p>
            ) : !data || data.top_products.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Aucune vente sur la période</p>
            ) : (
              <div className="space-y-3">
                {data.top_products.map((p, i) => {
                  const maxRev = data.top_products[0].revenue;
                  const pct = maxRev > 0 ? (p.revenue / maxRev) * 100 : 0;
                  return (
                    <div key={p.product_id} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-500 w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-white font-medium truncate">{p.name}</span>
                          <span className="text-slate-400 shrink-0 ml-2">{fmt(p.revenue)}</span>
                        </div>
                        <div className="h-1.5 bg-surface-input rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 w-16 text-right shrink-0">
                        {p.quantity_sold} ventes
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Grossiste ── */}
        {tab === 'grossiste' && business && (
          <GrossisteTab businessId={business.id} days={days} fmt={fmt} />
        )}

        {/* ── Promos ── */}
        {tab === 'promos' && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-4 h-4 text-green-400" />
              <h2 className="text-sm font-semibold text-slate-300">Utilisation des coupons</h2>
            </div>
            {loading ? (
              <p className="text-sm text-slate-500">Chargement…</p>
            ) : coupons.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Aucun coupon utilisé sur la période</p>
            ) : (
              <div className="space-y-0 divide-y divide-surface-border">
                {coupons.map((c) => (
                  <div key={c.coupon_code} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-mono font-semibold text-green-400">{c.coupon_code}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/30 border border-green-800/50 text-green-300">
                          ×{c.usage_count}
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>CA : {fmt(c.revenue)}</span>
                        <span>Remise : <span className="text-rose-400">−{fmt(c.total_discount)}</span></span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-white">{fmt(c.revenue)}</p>
                      <p className="text-xs text-slate-500">{c.usage_count} utilisation{c.usage_count > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Hôtel ── */}
        {tab === 'hotel' && (
          <div className="space-y-5">
            {loading ? (
              <p className="text-sm text-slate-500">Chargement…</p>
            ) : !hotelData ? (
              <p className="text-sm text-slate-500 text-center py-6">Aucun séjour terminé sur la période</p>
            ) : (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Revenus hébergement', value: fmt(hotelData.total_revenue),      icon: DollarSign, color: 'text-teal-400',   bg: 'bg-teal-900/20 border-teal-700' },
                    { label: 'Check-outs',           value: String(hotelData.total_checkouts), icon: LogOut,     color: 'text-green-400',  bg: 'bg-green-900/20 border-green-800' },
                    { label: 'Séjour moyen',         value: fmt(hotelData.avg_stay_value),     icon: BedDouble,  color: 'text-brand-400',  bg: 'bg-brand-900/20 border-brand-800' },
                    { label: 'Nuits moyennes',       value: hotelData.avg_nights.toFixed(1),   icon: LogIn,      color: 'text-purple-400', bg: 'bg-purple-900/20 border-purple-800' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-slate-400">{label}</p>
                        <Icon className={`w-4 h-4 ${color}`} />
                      </div>
                      <p className="text-xl font-bold text-white">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Détail revenus */}
                <div className="card p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-slate-300">Détail des revenus</h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400 flex items-center gap-2"><BedDouble className="w-3.5 h-3.5" /> Nuitées</span>
                      <span className="text-white font-medium">{fmt(hotelData.total_room_revenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 flex items-center gap-2"><Wrench className="w-3.5 h-3.5" /> Prestations</span>
                      <span className="text-white font-medium">{fmt(hotelData.total_services_revenue)}</span>
                    </div>
                    {hotelData.outstanding_balance > 0 && (
                      <div className="flex justify-between border-t border-surface-border pt-2">
                        <span className="text-slate-400 flex items-center gap-2"><Banknote className="w-3.5 h-3.5" /> Soldes impayés</span>
                        <span className="text-red-400 font-medium">{fmt(hotelData.outstanding_balance)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-surface-border pt-2 font-bold">
                      <span className="text-slate-300">Total encaissé</span>
                      <span className="text-teal-400">{fmt(hotelData.total_revenue - hotelData.outstanding_balance)}</span>
                    </div>
                  </div>
                </div>

                {/* Top chambres */}
                {hotelData.room_stats.length > 0 && (
                  <div className="card p-4">
                    <h2 className="text-sm font-semibold text-slate-300 mb-4">Performance par chambre</h2>
                    <div className="space-y-3">
                      {hotelData.room_stats.map((r) => {
                        const maxRev = hotelData.room_stats[0].revenue;
                        const pct = maxRev > 0 ? (r.revenue / maxRev) * 100 : 0;
                        return (
                          <div key={r.room_id} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-teal-900/40 flex items-center justify-center shrink-0">
                              <BedDouble className="w-4 h-4 text-teal-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-white font-medium">Ch. {r.room_number} <span className="text-slate-500 text-xs capitalize">{r.room_type}</span></span>
                                <span className="text-slate-400 shrink-0 ml-2">{fmt(r.revenue)}</span>
                              </div>
                              <div className="h-1.5 bg-surface-input rounded-full overflow-hidden">
                                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <span className="text-xs text-slate-500 w-20 text-right shrink-0">
                              {r.checkouts} séjour{r.checkouts > 1 ? 's' : ''} · {r.nights}n
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
