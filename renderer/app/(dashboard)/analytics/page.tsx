'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  TrendingUp, ShoppingBag, BarChart, DollarSign, Sun,
  RefreshCw, Store, Tag, BedDouble, LogIn, LogOut, Banknote, Wrench, Download, Car,
  Package, ArrowUpRight, ArrowDownRight, Minus, Users, Truck,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import {
  getAnalyticsSummary, getDailySales, getCouponStats,
  getHotelAnalytics, getJuridiqueAnalytics, getVoituresAnalytics,
  getRevendeursAnalytics, getApprovisionnementAnalytics, getPrevPeriodCA,
} from '@services/supabase/analytics';
import { supabase } from '@services/supabase/client';
import type { AnalyticsSummary } from '@pos-types';
import type {
  CouponStat, HotelAnalyticsSummary, JuridiqueAnalyticsSummary,
  VoituresAnalyticsSummary, RevendeursAnalyticsSummary,
  ApprovAnalyticsSummary, PrevPeriodCA,
} from '@services/supabase/analytics';
import { GrossisteTab } from '@/components/analytics/GrossisteTab';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Briefcase, Gavel, Scale, Receipt } from 'lucide-react';

const PERIODS = [
  { label: "Aujourd'hui", value: 0  },
  { label: '7 jours',     value: 7  },
  { label: '30 jours',    value: 30 },
  { label: '90 jours',    value: 90 },
];

const TYPE_LABELS: Record<string, string> = { gros: 'Gros', demi_gros: 'Demi-gros', detaillant: 'Détaillant' };
const TYPE_COLORS: Record<string, string> = {
  gros:      'bg-purple-500/20 text-purple-400',
  demi_gros: 'bg-blue-500/20 text-blue-400',
  detaillant:'bg-emerald-500/20 text-emerald-400',
};

type Tab = 'general' | 'produits' | 'grossiste' | 'promos' | 'hotel' | 'juridique' | 'voitures' | 'revendeurs' | 'appro';

// --- Delta badge --------------------------------------------------------------

function Delta({ current, prev, invert = false }: { current: number; prev: number; invert?: boolean }) {
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

// --- Stacked bar chart --------------------------------------------------------

interface DayStack { date: string; retail: number; hotel: number; juridique: number }

function StackedChart({ days: daysList, fmt }: { days: DayStack[]; fmt: (n: number) => string }) {
  if (daysList.length === 0) return null;
  const maxTotal = Math.max(...daysList.map(d => d.retail + d.hotel + d.juridique), 1);

  return (
    <div>
      <div className="flex items-end gap-0.5 h-32">
        {daysList.map((day) => {
          const total   = day.retail + day.hotel + day.juridique;
          const pctH    = (total / maxTotal) * 100;
          const pRetail = total > 0 ? (day.retail    / total) * 100 : 0;
          const pHotel  = total > 0 ? (day.hotel     / total) * 100 : 0;
          const pJur    = total > 0 ? (day.juridique / total) * 100 : 0;
          return (
            <div
              key={day.date}
              className="group flex-1 flex flex-col justify-end h-full relative"
              title={`${format(new Date(day.date), 'd MMM', { locale: fr })} — ${fmt(total)}`}
            >
              <div className="w-full flex flex-col rounded-t overflow-hidden" style={{ height: `${pctH}%` }}>
                {pJur > 0    && <div className="w-full bg-purple-500 group-hover:brightness-110 transition-all" style={{ height: `${pJur}%` }} />}
                {pHotel > 0  && <div className="w-full bg-teal-500   group-hover:brightness-110 transition-all" style={{ height: `${pHotel}%` }} />}
                {pRetail > 0 && <div className="w-full bg-brand-600  group-hover:brightness-110 transition-all" style={{ height: `${pRetail}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] text-content-muted"><span className="w-2.5 h-2.5 rounded-sm bg-brand-600 inline-block" /> Ventes</span>
        <span className="flex items-center gap-1 text-[10px] text-content-muted"><span className="w-2.5 h-2.5 rounded-sm bg-teal-500 inline-block" /> Hôtel</span>
        <span className="flex items-center gap-1 text-[10px] text-content-muted"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500 inline-block" /> Honoraires</span>
      </div>
    </div>
  );
}

// --- Horizontal bar ranking --------------------------------------------------

function RankBar({ label, sub, value, max, color, fmt }: { label: string; sub?: string; value: number; max: number; color: string; fmt: (n: number) => string }) {
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

// --- Page --------------------------------------------------------------------

export default function AnalyticsPage() {
  const { business } = useAuthStore();
  const { error: notifError } = useNotificationStore();
  const [period, setPeriod]   = useState(30);
  const [tab, setTab]         = useState<Tab>('general');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [data, setData]             = useState<AnalyticsSummary | null>(null);
  const [today, setToday]           = useState<{ total: number; count: number } | null>(null);
  const [coupons, setCoupons]       = useState<CouponStat[]>([]);
  const [hotelData, setHotelData]   = useState<HotelAnalyticsSummary | null>(null);
  const [juridiqueData, setJuridiqueData] = useState<JuridiqueAnalyticsSummary | null>(null);
  const [voituresData, setVoituresData]   = useState<VoituresAnalyticsSummary | null>(null);
  const [revendeursData, setRevendeursData] = useState<RevendeursAnalyticsSummary | null>(null);
  const [approvData, setApprovData]         = useState<ApprovAnalyticsSummary | null>(null);
  const [prevCA, setPrevCA]                 = useState<PrevPeriodCA | null>(null);
  const [audiences, setAudiences]           = useState<any[]>([]);

  const isHotel     = business?.type === 'hotel' || business?.features?.includes('hotel');
  const isJuridique = business?.type === 'juridique' ||
                      business?.features?.includes('dossiers') ||
                      business?.features?.includes('honoraires');
  const isStandard  = business?.type === 'retail' || business?.type === 'restaurant' || business?.type === 'service' ||
                      business?.features?.includes('retail') || business?.features?.includes('restaurant');
  const isVoitures  = business?.features?.includes('voitures');
  const isGrossiste = business?.features?.includes('retail') || business?.features?.includes('grossiste');

  const fmt = (n: number) => formatCurrency(n, business?.currency ?? 'XOF');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const days = period === 0 ? 1 : period;

  const loadAll = useCallback(async (silent = false) => {
    if (!business) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [summary, todayData, couponData, hotelStats, juridiqueStats, voituresStats, revendStats, approvStats, prevStats] = await Promise.all([
        getAnalyticsSummary(business.id, days),
        getDailySales(business.id, todayStr),
        getCouponStats(business.id, days),
        isHotel     ? getHotelAnalytics(business.id, days)          : Promise.resolve(null),
        isJuridique ? getJuridiqueAnalytics(business.id, days)      : Promise.resolve(null),
        isVoitures  ? getVoituresAnalytics(business.id, days)       : Promise.resolve(null),
        isGrossiste ? getRevendeursAnalytics(business.id, days)     : Promise.resolve(null),
        getApprovisionnementAnalytics(business.id, days),
        period > 0  ? getPrevPeriodCA(business.id, days, !!isHotel, !!isJuridique) : Promise.resolve(null),
      ]);

      setHotelData(hotelStats);
      setJuridiqueData(juridiqueStats);
      setVoituresData(voituresStats);
      setRevendeursData(revendStats);
      setApprovData(approvStats);
      setPrevCA(prevStats);

      if (isJuridique) {
        const { data: audData } = await (supabase as any)
          .from('dossiers')
          .select('id, reference, client_name, date_audience, tribunal')
          .eq('business_id', business.id)
          .gte('date_audience', todayStr)
          .order('date_audience', { ascending: true })
          .limit(5);
        setAudiences(audData ?? []);
      }

      if (period === 0) {
        const todayStat = summary.daily_stats.find((d) => d.date === todayStr);
        setData({ ...summary, total_sales: todayStat?.total_sales ?? 0, order_count: todayStat?.order_count ?? 0, avg_order_value: todayStat?.avg_order_value ?? 0, daily_stats: todayStat ? [todayStat] : [] });
      } else {
        setData(summary);
      }
      setToday(todayData);
      setCoupons(couponData);
    } catch {
      notifError('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business, days, period, todayStr, isHotel, isJuridique, isVoitures, isGrossiste]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [business, period, loadAll]);

  // -- Stacked daily chart data -------------------------------------------------
  const stackedDays = useMemo<DayStack[]>(() => {
    const map = new Map<string, DayStack>();
    const ensure = (d: string) => { if (!map.has(d)) map.set(d, { date: d, retail: 0, hotel: 0, juridique: 0 }); return map.get(d)!; };
    (data?.daily_stats ?? []).forEach(d => { ensure(d.date).retail = d.total_sales; });
    (juridiqueData?.daily_fees ?? []).forEach(d => { ensure(d.date).juridique = d.amount; });
    (hotelData?.daily_revenue ?? []).forEach(d => { ensure(d.date).hotel = d.total; });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, juridiqueData, hotelData]);

  const hasMultiSource = (stackedDays.some(d => d.hotel > 0) || stackedDays.some(d => d.juridique > 0));

  // -- KPIs ----------------------------------------------------------------------
  const getKPIs = () => {
    const totalSales = data?.total_sales ?? 0;
    const totalFees  = juridiqueData?.total_fees ?? 0;
    const totalHotel = hotelData?.total_revenue ?? 0;
    const globalCA   = totalSales + totalFees + totalHotel;
    const prevGlobalCA = prevCA ? (prevCA.total_sales + prevCA.total_fees + prevCA.total_hotel) : 0;

    const totalPaidFees  = juridiqueData?.total_paid ?? 0;
    const totalHotelPaid = (hotelData?.total_revenue ?? 0) - (hotelData?.outstanding_balance ?? 0);
    const globalPaid     = totalSales + totalPaidFees + totalHotelPaid;

    if (isJuridique && !isHotel && !isStandard) {
      return [
        { label: 'Total Honoraires', value: fmt(totalFees),  sub: <Delta current={totalFees} prev={prevCA?.total_fees ?? 0} />,  icon: DollarSign, color: 'text-content-brand',   bg: 'bg-badge-brand border-status-brand' },
        { label: 'Encaissé',         value: fmt(totalPaidFees), sub: <Delta current={totalPaidFees} prev={prevCA?.total_fees ? prevCA.total_fees * (totalPaidFees / (totalFees || 1)) : 0} />, icon: Banknote, color: 'text-status-success', bg: 'bg-badge-success border-status-success' },
        { label: 'Dossiers Actifs',  value: String(juridiqueData?.active_dossiers ?? 0), sub: null, icon: Briefcase, color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' },
        { label: 'Audiences',        value: String(juridiqueData?.upcoming_audiences ?? 0), sub: null, icon: Gavel, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' },
      ];
    }

    const items: any[] = [
      {
        label: 'C.A Global', value: fmt(globalCA),
        sub: <Delta current={globalCA} prev={prevGlobalCA} />,
        icon: TrendingUp, color: 'text-content-brand', bg: 'bg-badge-brand border-status-brand',
      },
      {
        label: 'Total Encaissé', value: fmt(globalPaid),
        sub: globalCA > 0 ? <span className="text-[10px] text-content-muted">Reste : {fmt(globalCA - globalPaid)}</span> : null,
        icon: Banknote, color: 'text-status-success', bg: 'bg-badge-success border-status-success',
      },
    ];

    if (isJuridique) items.push({ label: 'Dossiers Actifs', value: String(juridiqueData?.active_dossiers ?? 0), sub: <span className="text-[10px] text-content-muted">Espace juridique</span>, icon: Briefcase, color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' });
    if (isStandard)  items.push({ label: 'Commandes',        value: String(data?.order_count ?? 0), sub: <Delta current={data?.order_count ?? 0} prev={0} />, icon: ShoppingBag, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' });
    if (isHotel && items.length < 4) items.push({ label: 'Occupation Hôtel', value: `${hotelData?.occupancy_rate ?? 0}%`, sub: <span className="text-[10px] text-content-muted">{hotelData?.occupied_rooms ?? 0} ch. occupées</span>, icon: BedDouble, color: 'text-status-info', bg: 'bg-badge-info border-status-info' });

    return items;
  };

  const kpis = getKPIs();

  function exportCSV() {
    if (!data) return;
    const rows = [
      ['Date', 'Ventes (CA)', 'Commandes', 'Panier moyen'],
      ...data.daily_stats.map((d) => [d.date, d.total_sales.toFixed(0), d.order_count, d.avg_order_value?.toFixed(0) ?? '0']),
    ];
    const csv  = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `stats-${period}j-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const TABS = ([
    { id: 'general',    label: 'Général',     icon: TrendingUp                         },
    { id: 'produits',   label: 'Produits',    icon: BarChart,   feature: 'retail'      },
    { id: 'grossiste',  label: 'Détail ventes',icon: Store,     feature: 'retail'      },
    { id: 'revendeurs', label: 'Revendeurs',  icon: Users,      feature: 'retail'      },
    { id: 'promos',     label: 'Promos',      icon: Tag,        feature: 'retail'      },
    { id: 'appro',      label: 'Achats',      icon: Package                            },
    { id: 'juridique',  label: 'Dossiers',    icon: Briefcase,  feature: 'dossiers'   },
    { id: 'hotel',      label: 'Hôtel',       icon: BedDouble,  feature: 'hotel'       },
    { id: 'voitures',   label: 'Voitures',    icon: Car,        feature: 'voitures'   },
  ] as any[]).filter(t => !t.feature || business?.features?.includes(t.feature));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border flex flex-wrap items-center justify-between gap-2 shrink-0">
        <h1 className="text-lg font-bold text-content-primary">Statistiques</h1>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} disabled={!data} className="btn-secondary p-2" title="Exporter CSV">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={() => loadAll(true)} disabled={refreshing} className="btn-secondary p-2" title="Actualiser">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex gap-1 bg-surface-input rounded-xl p-1">
            {PERIODS.map(({ label, value }) => (
              <button key={value} onClick={() => setPeriod(value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${period === value ? 'bg-brand-600 text-white' : 'text-content-secondary hover:text-content-primary'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border shrink-0 bg-surface overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-none flex items-center justify-center gap-1.5 px-3 py-3 text-xs sm:text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${tab === id ? 'border-brand-500 text-content-brand' : 'border-transparent text-content-secondary hover:text-content-primary'}`}>
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">

        {/* ── Général ── */}
        {tab === 'general' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {kpis.map(({ label, value, icon: Icon, color, bg, sub }) => (
                <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-content-secondary">{label}</p>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <p className={`text-xl font-bold ${loading ? 'text-content-muted animate-pulse' : 'text-content-primary'}`}>
                    {loading ? '...' : value}
                  </p>
                  {sub && !loading && <div className="mt-0.5">{sub}</div>}
                </div>
              ))}
            </div>

            {isJuridique && juridiqueData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card p-5">
                  <h2 className="text-sm font-black text-content-secondary uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-status-success" /> Répartition Honoraires
                  </h2>
                  <div className="space-y-4">
                    {juridiqueData.fees_by_type.map(f => {
                      const max = juridiqueData.fees_by_type[0].amount;
                      const pct = (f.amount / max) * 100;
                      return (
                        <div key={f.type}>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-content-secondary font-bold capitalize">{f.type.replace(/_/g, ' ')}</span>
                            <span className="text-content-primary font-black">{fmt(f.amount)}</span>
                          </div>
                          <div className="h-1.5 bg-surface-card rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="card p-5">
                  <h2 className="text-sm font-black text-content-secondary uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-content-brand" /> État des Dossiers
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    {juridiqueData.dossiers_by_status.map(s => (
                      <div key={s.status} className="bg-surface-input p-3 rounded-xl border border-surface-border">
                        <p className="text-[10px] font-black text-content-muted uppercase tracking-tight mb-1 capitalize">{s.status}</p>
                        <p className="text-xl font-black text-content-primary">{s.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Graphique multi-sources */}
            {stackedDays.length > 0 && (
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-content-secondary mb-4">
                  {hasMultiSource ? 'CA journalier — toutes sources' : 'Ventes journalières'}
                </h2>
                {hasMultiSource
                  ? <StackedChart days={stackedDays} fmt={fmt} />
                  : (
                    <div className="flex items-end gap-0.5 h-32">
                      {stackedDays.map((day) => {
                        const maxVal = Math.max(...stackedDays.map(d => d.retail), 1);
                        const height = (day.retail / maxVal) * 100;
                        return (
                          <div key={day.date} className="group flex-1 flex flex-col items-center gap-1" title={`${format(new Date(day.date), 'd MMM', { locale: fr })} — ${fmt(day.retail)}`}>
                            <div className="w-full bg-brand-600 hover:bg-brand-500 rounded-t transition-colors" style={{ height: `${height}%` }} />
                          </div>
                        );
                      })}
                    </div>
                  )
                }
              </div>
            )}
          </>
        )}

        {/* ── Dossiers ── */}
        {tab === 'juridique' && isJuridique && juridiqueData && (
          <div className="space-y-5">
            <div className="card p-6">
              <h2 className="text-lg font-black text-content-primary mb-6 flex items-center gap-3">
                <Scale className="w-5 h-5 text-brand-500" /> Performance du Cabinet
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-xs text-content-muted font-bold uppercase tracking-widest text-center">Taux de Recouvrement</p>
                  <p className="text-3xl font-black text-status-success text-center">
                    {juridiqueData.total_fees > 0 ? Math.round((juridiqueData.total_paid / juridiqueData.total_fees) * 100) : 0}%
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-content-muted font-bold uppercase tracking-widest text-center">Efficacité Clôture</p>
                  <p className="text-3xl font-black text-content-brand text-center">
                    {juridiqueData.total_dossiers > 0 ? Math.round(((juridiqueData.total_dossiers - juridiqueData.active_dossiers) / juridiqueData.total_dossiers) * 100) : 0}%
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-content-muted font-bold uppercase tracking-widest text-center">Moyenne / Dossier</p>
                  <p className="text-3xl font-black text-status-purple text-center">
                    {fmt(juridiqueData.total_dossiers > 0 ? juridiqueData.total_fees / juridiqueData.total_dossiers : 0)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="card p-5">
                <h2 className="text-sm font-black text-content-secondary uppercase tracking-widest mb-6 flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-status-warning" /> Prochaines Audiences
                </h2>
                {audiences.length === 0
                  ? <p className="text-sm text-content-muted text-center py-8">Aucune audience prévue</p>
                  : (
                    <div className="space-y-3">
                      {audiences.map(aud => (
                        <div key={aud.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-input border border-surface-border">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-content-brand uppercase">{aud.reference}</p>
                            <p className="text-sm text-content-primary font-bold truncate">{aud.client_name}</p>
                            <p className="text-[10px] text-content-muted font-medium truncate">{aud.tribunal}</p>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <p className="text-xs font-black text-content-primary">{format(new Date(aud.date_audience), 'dd MMM yyyy', { locale: fr })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>

              <div className="card p-5">
                <h2 className="text-sm font-black text-content-secondary uppercase tracking-widest mb-6 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-status-success" /> Croissance Honoraires
                </h2>
                {juridiqueData.monthly_fees.length < 2
                  ? <p className="text-sm text-content-muted text-center py-8 italic">Pas assez de données historiques</p>
                  : (
                    <div className="space-y-6">
                      <div className="flex items-end gap-2 h-24">
                        {juridiqueData.monthly_fees.map((m) => {
                          const max    = Math.max(...juridiqueData!.monthly_fees.map(x => x.amount), 1);
                          const height = (m.amount / max) * 100;
                          return (
                            <div key={m.month} className="group relative flex-1 flex flex-col items-center gap-2 h-full justify-end">
                              <div className="w-full bg-emerald-500/20 hover:bg-emerald-500/40 border-t-2 border-emerald-500/50 rounded-t-sm transition-all cursor-help" style={{ height: `${height}%` }} />
                              <span className="text-[8px] font-black text-content-muted uppercase">{format(parseISO(m.month + '-01'), 'MMM', { locale: fr })}</span>
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-card text-content-primary text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl border border-surface-border">
                                {fmt(m.amount)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                }
              </div>
            </div>
          </div>
        )}

        {/* ── Produits ── */}
        {tab === 'produits' && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-content-secondary mb-4">Top produits</h2>
            {loading
              ? <p className="text-sm text-content-muted">Chargement…</p>
              : !data || data.top_products.length === 0
              ? <p className="text-sm text-content-muted text-center py-6">Aucune vente sur la période</p>
              : (
                <div className="space-y-3">
                  {data.top_products.map((p, i) => {
                    const maxRev = data.top_products[0].revenue;
                    return (
                      <div key={p.product_id} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-content-muted w-4 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <RankBar label={p.name} value={p.revenue} max={maxRev} color="bg-brand-500" fmt={fmt} sub={`${p.quantity_sold} ventes`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* ── Détail ventes (Grossiste) ── */}
        {tab === 'grossiste' && business && (
          <GrossisteTab businessId={business.id} days={days} fmt={fmt} />
        )}

        {/* ── Revendeurs ── */}
        {tab === 'revendeurs' && (
          <div className="space-y-5">
            {loading || !revendeursData
              ? <p className="text-sm text-content-muted text-center py-8">Chargement…</p>
              : (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'CA Revendeurs',   value: fmt(revendeursData.total_ca),     icon: DollarSign, color: 'text-content-brand',   bg: 'bg-badge-brand border-status-brand' },
                      { label: 'Commandes',        value: String(revendeursData.total_orders), icon: ShoppingBag, color: 'text-status-success', bg: 'bg-badge-success border-status-success' },
                      { label: 'Revendeurs actifs',value: String(revendeursData.top_resellers.length), icon: Users, color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' },
                      { label: 'Panier moyen',     value: fmt(revendeursData.total_orders > 0 ? revendeursData.total_ca / revendeursData.total_orders : 0), icon: Banknote, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' },
                    ].map(({ label, value, icon: Icon, color, bg }) => (
                      <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                        <div className="flex items-center justify-between mb-2"><p className="text-xs text-content-secondary">{label}</p><Icon className={`w-4 h-4 ${color}`} /></div>
                        <p className="text-xl font-bold text-content-primary">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Top revendeurs */}
                    <div className="card p-5">
                      <h2 className="text-sm font-semibold text-content-secondary mb-4 flex items-center gap-2">
                        <Users className="w-4 h-4" /> Top revendeurs
                      </h2>
                      {revendeursData.top_resellers.length === 0
                        ? <p className="text-sm text-content-muted text-center py-6">Aucune vente sur la période</p>
                        : (
                          <div className="space-y-3">
                            {revendeursData.top_resellers.map((r, i) => (
                              <div key={r.id} className="flex items-center gap-3">
                                <span className="text-xs font-mono text-content-muted w-4 shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <RankBar
                                    label={r.name}
                                    sub={`${TYPE_LABELS[r.type] ?? r.type}${r.zone ? ` · Zone ${r.zone}` : ''} · ${r.order_count} cmd`}
                                    value={r.revenue}
                                    max={revendeursData.top_resellers[0].revenue}
                                    color="bg-brand-500"
                                    fmt={fmt}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      }
                    </div>

                    <div className="space-y-4">
                      {/* Par type */}
                      {revendeursData.by_type.length > 0 && (
                        <div className="card p-5">
                          <h2 className="text-sm font-semibold text-content-secondary mb-4">Par type de revendeur</h2>
                          <div className="space-y-3">
                            {revendeursData.by_type.map(t => (
                              <div key={t.type} className="flex items-center gap-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLORS[t.type] ?? 'bg-surface-input text-content-muted'}`}>
                                  {TYPE_LABELS[t.type] ?? t.type}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <RankBar label="" sub={`${t.count} commandes`} value={t.revenue} max={revendeursData.by_type[0].revenue} color="bg-purple-500" fmt={fmt} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Par zone */}
                      {revendeursData.by_zone.length > 0 && (
                        <div className="card p-5">
                          <h2 className="text-sm font-semibold text-content-secondary mb-4">Par zone</h2>
                          <div className="space-y-3">
                            {revendeursData.by_zone.map(z => (
                              <RankBar key={z.zone} label={z.zone} sub={`${z.count} cmd`} value={z.revenue} max={revendeursData.by_zone[0].revenue} color="bg-blue-500" fmt={fmt} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )
            }
          </div>
        )}

        {/* ── Promos ── */}
        {tab === 'promos' && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-4 h-4 text-status-success" />
              <h2 className="text-sm font-semibold text-content-secondary">Utilisation des coupons</h2>
            </div>
            {loading
              ? <p className="text-sm text-content-muted">Chargement…</p>
              : coupons.length === 0
              ? <p className="text-sm text-content-muted text-center py-6">Aucun coupon utilisé sur la période</p>
              : (
                <div className="space-y-0 divide-y divide-surface-border">
                  {coupons.map((c) => (
                    <div key={c.coupon_code} className="py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-mono font-semibold text-status-success">{c.coupon_code}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-badge-success border border-status-success/50 text-status-success">×{c.usage_count}</span>
                        </div>
                        <div className="flex gap-4 text-xs text-content-muted">
                          <span>CA : {fmt(c.revenue)}</span>
                          <span>Remise : <span className="text-status-error">−{fmt(c.total_discount)}</span></span>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-content-primary shrink-0">{fmt(c.revenue)}</p>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        )}

        {/* ── Achats / Approvisionnement ── */}
        {tab === 'appro' && (
          <div className="space-y-5">
            {loading || !approvData
              ? <p className="text-sm text-content-muted text-center py-8">Chargement…</p>
              : (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total dépensé',    value: fmt(approvData.total_depense), icon: Banknote,  color: 'text-status-error',    bg: 'bg-badge-error border-status-error' },
                      { label: 'Entrées stock',     value: String(approvData.total_entries), icon: Package, color: 'text-content-brand',  bg: 'bg-badge-brand border-status-brand' },
                      { label: 'BCs reçus',         value: String(approvData.po_received),  icon: Truck,   color: 'text-status-success',  bg: 'bg-badge-success border-status-success' },
                      { label: 'Fournisseurs',      value: String(approvData.top_suppliers.length), icon: Store, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' },
                    ].map(({ label, value, icon: Icon, color, bg }) => (
                      <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                        <div className="flex items-center justify-between mb-2"><p className="text-xs text-content-secondary">{label}</p><Icon className={`w-4 h-4 ${color}`} /></div>
                        <p className="text-xl font-bold text-content-primary">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Graphe mensuel dépenses */}
                  {approvData.monthly.length > 0 && (
                    <div className="card p-4">
                      <h2 className="text-sm font-semibold text-content-secondary mb-4">Dépenses mensuelles</h2>
                      <div className="flex items-end gap-1 h-28">
                        {approvData.monthly.map((m) => {
                          const maxVal = Math.max(...approvData.monthly.map(x => x.total), 1);
                          const height = (m.total / maxVal) * 100;
                          return (
                            <div key={m.month} className="group relative flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${m.month} — ${fmt(m.total)}`}>
                              <div className="w-full bg-red-500/70 hover:bg-red-500 rounded-t transition-colors" style={{ height: `${height}%` }} />
                              <span className="text-[8px] text-content-muted font-medium">{m.month.slice(5)}</span>
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-card text-content-primary text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 shadow-xl border border-surface-border pointer-events-none">
                                {fmt(m.total)}<br/><span className="text-content-muted font-normal">{m.entries} entrée{m.entries > 1 ? 's' : ''}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Top fournisseurs */}
                    <div className="card p-5">
                      <h2 className="text-sm font-semibold text-content-secondary mb-4 flex items-center gap-2">
                        <Store className="w-4 h-4" /> Top fournisseurs
                      </h2>
                      {approvData.top_suppliers.length === 0
                        ? <p className="text-sm text-content-muted text-center py-6">Aucun fournisseur sur la période</p>
                        : (
                          <div className="space-y-3">
                            {approvData.top_suppliers.map((s, i) => (
                              <div key={s.name} className="flex items-center gap-3">
                                <span className="text-xs font-mono text-content-muted w-4 shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <RankBar label={s.name} sub={`${s.entries} entrée${s.entries > 1 ? 's' : ''}`} value={s.total} max={approvData.top_suppliers[0].total} color="bg-orange-500" fmt={fmt} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      }
                    </div>

                    {/* Top produits réappro */}
                    <div className="card p-5">
                      <h2 className="text-sm font-semibold text-content-secondary mb-4 flex items-center gap-2">
                        <Package className="w-4 h-4" /> Produits les plus réapprovisionnés
                      </h2>
                      {approvData.top_products.length === 0
                        ? <p className="text-sm text-content-muted text-center py-6">Aucune entrée sur la période</p>
                        : (
                          <div className="space-y-3">
                            {approvData.top_products.map((p, i) => (
                              <div key={p.product_id} className="flex items-center gap-3">
                                <span className="text-xs font-mono text-content-muted w-4 shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <RankBar
                                    label={p.name}
                                    sub={p.cost > 0 ? `${p.quantity} unités · coût ${fmt(p.cost)}` : `${p.quantity} unités`}
                                    value={p.cost > 0 ? p.cost : p.quantity}
                                    max={approvData.top_products[0].cost > 0 ? approvData.top_products[0].cost : approvData.top_products[0].quantity}
                                    color="bg-teal-500"
                                    fmt={p.cost > 0 ? fmt : (n) => String(Math.round(n))}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      }
                    </div>
                  </div>
                </>
              )
            }
          </div>
        )}

        {/* ── Hôtel ── */}
        {tab === 'hotel' && (
          <div className="space-y-5">
            {loading
              ? <p className="text-sm text-content-muted">Chargement…</p>
              : !hotelData
              ? <p className="text-sm text-content-muted text-center py-6">Aucun séjour terminé sur la période</p>
              : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Revenus hébergement', value: fmt(hotelData.total_revenue),       icon: DollarSign, color: 'text-status-teal',   bg: 'bg-badge-teal border-status-teal' },
                      { label: 'Check-outs',           value: String(hotelData.total_checkouts),  icon: LogOut,     color: 'text-status-success',  bg: 'bg-badge-success border-status-success' },
                      { label: 'Séjour moyen',         value: fmt(hotelData.avg_stay_value),      icon: BedDouble,  color: 'text-content-brand',  bg: 'bg-badge-brand border-status-brand' },
                      { label: 'Nuits moyennes',       value: hotelData.avg_nights.toFixed(1),    icon: LogIn,      color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' },
                    ].map(({ label, value, icon: Icon, color, bg }) => (
                      <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                        <div className="flex items-center justify-between mb-2"><p className="text-xs text-content-secondary">{label}</p><Icon className={`w-4 h-4 ${color}`} /></div>
                        <p className="text-xl font-bold text-content-primary">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="card p-4 space-y-3">
                    <h2 className="text-sm font-semibold text-content-secondary">Détail des revenus</h2>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-content-secondary flex items-center gap-2"><BedDouble className="w-3.5 h-3.5" /> Nuitées</span><span className="text-content-primary font-medium">{fmt(hotelData.total_room_revenue)}</span></div>
                      <div className="flex justify-between"><span className="text-content-secondary flex items-center gap-2"><Wrench className="w-3.5 h-3.5" /> Prestations</span><span className="text-content-primary font-medium">{fmt(hotelData.total_services_revenue)}</span></div>
                      {hotelData.outstanding_balance > 0 && (
                        <div className="flex justify-between border-t border-surface-border pt-2"><span className="text-content-secondary flex items-center gap-2"><Banknote className="w-3.5 h-3.5" /> Soldes impayés</span><span className="text-status-error font-medium">{fmt(hotelData.outstanding_balance)}</span></div>
                      )}
                      <div className="flex justify-between border-t border-surface-border pt-2 font-bold"><span className="text-content-secondary">Total encaissé</span><span className="text-status-teal">{fmt(hotelData.total_revenue - hotelData.outstanding_balance)}</span></div>
                    </div>
                  </div>

                  {hotelData.room_stats.length > 0 && (
                    <div className="card p-4">
                      <h2 className="text-sm font-semibold text-content-secondary mb-4">Performance par chambre</h2>
                      <div className="space-y-3">
                        {hotelData.room_stats.map((r) => (
                          <div key={r.room_id} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-badge-teal flex items-center justify-center shrink-0"><BedDouble className="w-4 h-4 text-status-teal" /></div>
                            <div className="flex-1 min-w-0">
                              <RankBar label={`Ch. ${r.room_number}`} sub={`${r.room_type} · ${r.checkouts} séj. · ${r.nights}n`} value={r.revenue} max={hotelData.room_stats[0].revenue} color="bg-teal-500" fmt={fmt} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            }
          </div>
        )}

        {/* ── Voitures ── */}
        {tab === 'voitures' && (
          <div className="space-y-5">
            {loading
              ? <p className="text-sm text-content-muted">Chargement…</p>
              : !voituresData
              ? <p className="text-sm text-content-muted text-center py-6">Aucune donnée sur la période</p>
              : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'CA Véhicules',   value: fmt(voituresData.ca_voitures),        icon: DollarSign, color: 'text-content-brand',  bg: 'bg-badge-brand border-status-brand' },
                      { label: 'Vendus',          value: String(voituresData.vendus_count),     icon: Car,        color: 'text-status-success',  bg: 'bg-badge-success border-status-success' },
                      { label: 'Leads',           value: String(voituresData.leads_total),      icon: TrendingUp, color: 'text-status-info',    bg: 'bg-badge-info border-status-info' },
                      { label: 'Parc disponible', value: String(voituresData.parc_disponible),  icon: BarChart,   color: 'text-status-warning',  bg: 'bg-badge-warning border-status-warning' },
                    ].map(({ label, value, icon: Icon, color, bg }) => (
                      <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                        <div className="flex items-center justify-between mb-2"><p className="text-xs text-content-secondary">{label}</p><Icon className={`w-4 h-4 ${color}`} /></div>
                        <p className="text-xl font-bold text-content-primary">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="card p-4 space-y-3">
                    <h2 className="text-sm font-semibold text-content-secondary">Pipeline contacts</h2>
                    <div className="space-y-2">
                      {[
                        { label: 'Nouveaux',  value: voituresData.leads_nouveaux,  color: 'bg-blue-500' },
                        { label: 'Convertis', value: voituresData.leads_convertis, color: 'bg-green-500' },
                      ].map(({ label, value, color }) => {
                        const pct = voituresData.leads_total > 0 ? (value / voituresData.leads_total) * 100 : 0;
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-content-secondary">{label}</span>
                              <span className="text-content-primary font-bold">{value} <span className="text-content-muted">({Math.round(pct)}%)</span></span>
                            </div>
                            <div className="h-1.5 bg-surface-input rounded-full overflow-hidden"><div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {voituresData.recent_ventes.length > 0 && (
                    <div className="card p-4">
                      <h2 className="text-sm font-semibold text-content-secondary mb-3">Ventes récentes</h2>
                      <div className="space-y-2">
                        {voituresData.recent_ventes.map((v) => (
                          <div key={v.id} className="flex items-center justify-between py-2 border-b border-surface-border last:border-0">
                            <div>
                              <p className="text-sm font-bold text-content-primary">{v.marque} {v.modele} {v.annee ? `(${v.annee})` : ''}</p>
                              <p className="text-[10px] text-content-muted">{new Date(v.updated_at).toLocaleDateString('fr-FR')}</p>
                            </div>
                            <p className="text-sm font-black text-status-success">{fmt(v.prix)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            }
          </div>
        )}

      </div>
    </div>
  );
}
