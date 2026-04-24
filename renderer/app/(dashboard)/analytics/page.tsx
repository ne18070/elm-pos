'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, ShoppingBag, BarChart, DollarSign, Sun,
  RefreshCw, Store, Tag, BedDouble, LogIn, LogOut, Banknote, Wrench, Download, Car,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import {
  getAnalyticsSummary, getDailySales, getCouponStats, getHotelAnalytics, getJuridiqueAnalytics, getVoituresAnalytics,
} from '@services/supabase/analytics';
import { supabase } from '@services/supabase/client';
import type { AnalyticsSummary } from '@pos-types';
import type { CouponStat, HotelAnalyticsSummary, JuridiqueAnalyticsSummary, VoituresAnalyticsSummary } from '@services/supabase/analytics';
import { GrossisteTab } from '@/components/analytics/GrossisteTab';
import { format, isFuture, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Briefcase, Gavel, Scale, Receipt } from 'lucide-react';

const PERIODS = [
  { label: "Aujourd'hui", value: 0  },
  { label: '7 jours',     value: 7  },
  { label: '30 jours',    value: 30 },
  { label: '90 jours',    value: 90 },
];

type Tab = 'general' | 'produits' | 'grossiste' | 'promos' | 'hotel' | 'juridique' | 'voitures';

export default function AnalyticsPage() {
  const { business } = useAuthStore();
  const { error: notifError } = useNotificationStore();
  const [period, setPeriod]   = useState(30);
  const [tab, setTab]         = useState<Tab>('general');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [data, setData]       = useState<AnalyticsSummary | null>(null);
  const [today, setToday]     = useState<{ total: number; count: number } | null>(null);
  const [coupons, setCoupons] = useState<CouponStat[]>([]);
  const [hotelData, setHotelData] = useState<HotelAnalyticsSummary | null>(null);
  const [juridiqueData, setJuridiqueData] = useState<JuridiqueAnalyticsSummary | null>(null);
  const [voituresData, setVoituresData] = useState<VoituresAnalyticsSummary | null>(null);

  const isHotel     = business?.type === 'hotel' || business?.features?.includes('hotel');
  const isJuridique = business?.type === 'juridique' ||
                      business?.features?.includes('dossiers') ||
                      business?.features?.includes('honoraires');
  const isStandard  = business?.type === 'retail' || business?.type === 'restaurant' || business?.type === 'service' ||
                      business?.features?.includes('retail') || business?.features?.includes('restaurant');
  const isVoitures  = business?.features?.includes('voitures');

  const fmt = (n: number) => formatCurrency(n, business?.currency ?? 'XOF');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const days = period === 0 ? 1 : period;

  const [audiences, setAudiences] = useState<any[]>([]);

  const loadAll = useCallback(async (silent = false) => {
    if (!business) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [summary, todayData, couponData, hotelStats, juridiqueStats, voituresStats] = await Promise.all([
        getAnalyticsSummary(business.id, days),
        getDailySales(business.id, todayStr),
        getCouponStats(business.id, days),
        isHotel ? getHotelAnalytics(business.id, days) : Promise.resolve(null),
        isJuridique ? getJuridiqueAnalytics(business.id, days) : Promise.resolve(null),
        isVoitures ? getVoituresAnalytics(business.id, days) : Promise.resolve(null),
      ]);

      setHotelData(hotelStats);
      setJuridiqueData(juridiqueStats);
      setVoituresData(voituresStats);

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
      notifError('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business, days, period, todayStr, isHotel, isJuridique, isVoitures]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [business, period, loadAll]);

  // ── KPIs Consolidés pour Multi-Métiers ──
  const getKPIs = () => {
    const totalSales = data?.total_sales ?? 0;
    const totalFees  = juridiqueData?.total_fees ?? 0;
    const totalHotel = hotelData?.total_revenue ?? 0;
    const globalCA   = totalSales + totalFees + totalHotel;

    const totalPaidFees  = juridiqueData?.total_paid ?? 0;
    const totalHotelPaid = (hotelData?.total_revenue ?? 0) - (hotelData?.outstanding_balance ?? 0);
    const globalPaid     = totalSales + totalPaidFees + totalHotelPaid;

    // Si l'établissement est purement Juridique, on garde la vue spécialisée
    if (isJuridique && !isHotel && !isStandard) {
      return [
        { label: 'Total Honoraires', value: fmt(totalFees), icon: DollarSign, color: 'text-content-brand', bg: 'bg-badge-brand border-status-brand' },
        { label: 'Encaissé', value: fmt(totalPaidFees), sub: `${fmt(juridiqueData?.total_pending ?? 0)} en attente`, icon: Banknote, color: 'text-status-success', bg: 'bg-badge-success border-status-success' },
        { label: 'Dossiers Actifs', value: String(juridiqueData?.active_dossiers ?? 0), icon: Briefcase, color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' },
        { label: 'Audiences', value: String(juridiqueData?.upcoming_audiences ?? 0), icon: Gavel, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' },
      ];
    }

    // Vue Consolidée Dynamique
    const items = [
      {
        label: 'C.A Global',
        value: fmt(globalCA),
        sub: totalSales > 0 ? `Dont ${Math.round((totalSales/globalCA)*100 || 0)}% ventes` : 'Toutes activités',
        icon: TrendingUp, color: 'text-content-brand', bg: 'bg-badge-brand border-status-brand',
      },
      {
        label: 'Total Encaissé',
        value: fmt(globalPaid),
        sub: `Reste: ${fmt(globalCA - globalPaid)}`,
        icon: Banknote, color: 'text-status-success', bg: 'bg-badge-success border-status-success',
      }
    ];

    // On n'ajoute les cartes spécifiques que si le module est actif
    if (isJuridique) {
      items.push({
        label: 'Dossiers Actifs',
        value: String(juridiqueData?.active_dossiers ?? 0),
        sub: 'Espace Juridique',
        icon: Briefcase, color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple',
      });
    }

    if (isStandard) {
      items.push({
        label: 'Commandes',
        value: String(data?.order_count ?? 0),
        sub: 'Ventes & Boutique',
        icon: ShoppingBag, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning',
      });
    }

    // Si on a encore de la place (ex: pas de ventes), on peut mettre l'occupation hôtel
    if (isHotel && items.length < 4) {
      items.push({
        label: 'Occupation Hôtel',
        value: `${hotelData?.occupancy_rate ?? 0}%`,
        sub: `${hotelData?.occupied_rooms ?? 0} chambres occupées`,
        icon: BedDouble, color: 'text-status-info', bg: 'bg-badge-info border-status-info',
      });
    }

    return items;
  };

  const kpis = getKPIs();

  function exportCSV() {
    if (!data) return;
    const rows = [
      ['Date', 'Ventes (CA)', 'Commandes', 'Panier moyen'],
      ...data.daily_stats.map((d) => [
        d.date,
        d.total_sales.toFixed(0),
        d.order_count,
        d.avg_order_value?.toFixed(0) ?? '0',
      ]),
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `stats-${period}j-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const TABS = ([
    { id: 'general',   label: 'Général',   icon: TrendingUp },
    { id: 'produits',  label: 'Produits',  icon: BarChart,   feature: 'retail' },
    { id: 'grossiste', label: 'Grossiste', icon: Store,      feature: 'retail' },
    { id: 'promos',    label: 'Promos',    icon: Tag,        feature: 'retail' },
    { id: 'juridique', label: 'Dossiers',  icon: Briefcase,  feature: 'dossiers' },
    { id: 'hotel',     label: 'Hôtel',     icon: BedDouble,  feature: 'hotel' },
    { id: 'voitures',  label: 'Voitures',  icon: Car,        feature: 'voitures' },
  ] as any[]).filter(t => {
    return !t.feature || business?.features?.includes(t.feature);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border flex flex-wrap items-center justify-between gap-2 shrink-0">
        <h1 className="text-lg font-bold text-content-primary">Statistiques {isJuridique ? 'Juridiques' : ''}</h1>
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
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  period === value ? 'bg-brand-600 text-white' : 'text-content-secondary hover:text-content-primary'
                }`}>
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
                ? 'border-brand-500 text-content-brand'
                : 'border-transparent text-content-secondary hover:text-content-primary'
            }`}
          >
            <Icon className="w-4 h-4" />
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
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-content-secondary">{label}</p>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <p className={`text-xl font-bold ${loading ? 'text-content-muted animate-pulse' : 'text-content-primary'}`}>
                    {loading ? '...' : value}
                  </p>
                  {sub && !loading && <p className="text-xs text-content-muted mt-0.5">{sub}</p>}
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
                              <div className="h-full bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)]" style={{ width: `${pct}%` }} />
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

            {/* Chart section */}
            {((isJuridique && juridiqueData && juridiqueData.daily_fees.length > 0) || (data && data.daily_stats.length > 0)) && (
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-content-secondary mb-4">
                  {isJuridique ? 'Volume Honoraires (par jour)' : 'Ventes journalières'}
                </h2>
                <div className="flex items-end gap-1 h-36">
                  {(isJuridique ? juridiqueData!.daily_fees : data!.daily_stats).map((day: any) => {
                    const stats = isJuridique ? juridiqueData!.daily_fees : data!.daily_stats;
                    const val = isJuridique ? day.amount : day.total_sales;
                    const maxVal = Math.max(...stats.map((d: any) => isJuridique ? d.amount : d.total_sales), 1);
                    const height = (val / maxVal) * 100;
                    return (
                      <div
                        key={day.date}
                        className="group flex-1 flex flex-col items-center gap-1"
                        title={`${format(new Date(day.date), 'd MMM', { locale: fr })} — ${fmt(val)}`}
                      >
                        <div
                          className={`w-full ${isJuridique ? 'bg-purple-600 hover:bg-purple-500' : 'bg-brand-600 hover:bg-brand-500'} rounded-t transition-colors`}
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

        {/* ── Juridique (Détails) ── */}
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
                      {juridiqueData.total_fees > 0 
                        ? Math.round((juridiqueData.total_paid / juridiqueData.total_fees) * 100) 
                        : 0}%
                    </p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-xs text-content-muted font-bold uppercase tracking-widest text-center">Efficacité Clôture</p>
                    <p className="text-3xl font-black text-content-brand text-center">
                      {juridiqueData.total_dossiers > 0 
                        ? Math.round(((juridiqueData.total_dossiers - juridiqueData.active_dossiers) / juridiqueData.total_dossiers) * 100) 
                        : 0}%
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
                  {audiences.length === 0 ? (
                    <p className="text-sm text-content-muted text-center py-8">Aucune audience prévue</p>
                  ) : (
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
                            <p className="text-[9px] font-bold text-content-muted uppercase tracking-tighter mt-1">À {format(new Date(aud.date_audience), 'HH:mm') === '00:00' ? 'Heure à confirmer' : format(new Date(aud.date_audience), 'HH:mm')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
               </div>

               <div className="card p-5">
                  <h2 className="text-sm font-black text-content-secondary uppercase tracking-widest mb-6 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-status-success" /> Croissance Honoraires
                  </h2>
                  
                  {juridiqueData.monthly_fees.length < 2 ? (
                    <p className="text-sm text-content-muted text-center py-8 italic">Pas assez de données historiques pour calculer la croissance</p>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-1">Tendance (6 mois)</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black text-content-primary">
                              {fmt(juridiqueData.monthly_fees[juridiqueData.monthly_fees.length - 1].amount)}
                            </span>
                            {(() => {
                              const last = juridiqueData.monthly_fees[juridiqueData.monthly_fees.length - 1].amount;
                              const prev = juridiqueData.monthly_fees[juridiqueData.monthly_fees.length - 2].amount;
                              if (prev === 0) return null;
                              const growth = ((last - prev) / prev) * 100;
                              return (
                                <span className={`text-xs font-black flex items-center gap-0.5 ${growth >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                  {growth >= 0 ? '↑' : '↓'} {Math.abs(Math.round(growth))}%
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-1">Mois en cours</p>
                           <p className="text-xs font-bold text-content-secondary capitalize">
                             {format(parseISO(juridiqueData.monthly_fees[juridiqueData.monthly_fees.length - 1].month + '-01'), 'MMMM yyyy', { locale: fr })}
                           </p>
                        </div>
                      </div>

                      <div className="flex items-end gap-2 h-24">
                        {juridiqueData.monthly_fees.map((m) => {
                          const max = Math.max(...juridiqueData!.monthly_fees.map(x => x.amount), 1);
                          const height = (m.amount / max) * 100;
                          return (
                            <div key={m.month} className="group relative flex-1 flex flex-col items-center gap-2 h-full justify-end">
                              <div 
                                className="w-full bg-emerald-500/20 hover:bg-emerald-500/40 border-t-2 border-emerald-500/50 rounded-t-sm transition-all cursor-help"
                                style={{ height: `${height}%` }}
                              />
                              <span className="text-[8px] font-black text-content-muted uppercase group-hover:text-content-secondary transition-colors">
                                {format(parseISO(m.month + '-01'), 'MMM', { locale: fr })}
                              </span>
                              
                              {/* Tooltip */}
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-card text-content-primary text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-xl border border-surface-border">
                                {fmt(m.amount)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
               </div>
            </div>
          </div>
        )}

        {/* ── Produits ── */}
        {tab === 'produits' && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-content-secondary mb-4">Top produits</h2>
            {loading ? (
              <p className="text-sm text-content-muted">Chargement…</p>
            ) : !data || data.top_products.length === 0 ? (
              <p className="text-sm text-content-muted text-center py-6">Aucune vente sur la période</p>
            ) : (
              <div className="space-y-3">
                {data.top_products.map((p, i) => {
                  const maxRev = data.top_products[0].revenue;
                  const pct = maxRev > 0 ? (p.revenue / maxRev) * 100 : 0;
                  return (
                    <div key={p.product_id} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-content-muted w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-content-primary font-medium truncate">{p.name}</span>
                          <span className="text-content-secondary shrink-0 ml-2">{fmt(p.revenue)}</span>
                        </div>
                        <div className="h-1.5 bg-surface-input rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-content-muted w-16 text-right shrink-0">
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
              <Tag className="w-4 h-4 text-status-success" />
              <h2 className="text-sm font-semibold text-content-secondary">Utilisation des coupons</h2>
            </div>
            {loading ? (
              <p className="text-sm text-content-muted">Chargement…</p>
            ) : coupons.length === 0 ? (
              <p className="text-sm text-content-muted text-center py-6">Aucun coupon utilisé sur la période</p>
            ) : (
              <div className="space-y-0 divide-y divide-surface-border">
                {coupons.map((c) => (
                  <div key={c.coupon_code} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-mono font-semibold text-status-success">{c.coupon_code}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-badge-success border border-status-success/50 text-status-success">
                          ×{c.usage_count}
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs text-content-muted">
                        <span>CA : {fmt(c.revenue)}</span>
                        <span>Remise : <span className="text-status-error">−{fmt(c.total_discount)}</span></span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-content-primary">{fmt(c.revenue)}</p>
                      <p className="text-xs text-content-muted">{c.usage_count} utilisation{c.usage_count > 1 ? 's' : ''}</p>
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
              <p className="text-sm text-content-muted">Chargement…</p>
            ) : !hotelData ? (
              <p className="text-sm text-content-muted text-center py-6">Aucun séjour terminé sur la période</p>
            ) : (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Revenus hébergement', value: fmt(hotelData.total_revenue),      icon: DollarSign, color: 'text-status-teal',   bg: 'bg-badge-teal border-status-teal' },
                    { label: 'Check-outs',           value: String(hotelData.total_checkouts), icon: LogOut,     color: 'text-status-success',  bg: 'bg-badge-success border-status-success' },
                    { label: 'Séjour moyen',         value: fmt(hotelData.avg_stay_value),     icon: BedDouble,  color: 'text-content-brand',  bg: 'bg-badge-brand border-status-brand' },
                    { label: 'Nuits moyennes',       value: hotelData.avg_nights.toFixed(1),   icon: LogIn,      color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-content-secondary">{label}</p>
                        <Icon className={`w-4 h-4 ${color}`} />
                      </div>
                      <p className="text-xl font-bold text-content-primary">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Détail revenus */}
                <div className="card p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-content-secondary">Détail des revenus</h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-content-secondary flex items-center gap-2"><BedDouble className="w-3.5 h-3.5" /> Nuitées</span>
                      <span className="text-content-primary font-medium">{fmt(hotelData.total_room_revenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-secondary flex items-center gap-2"><Wrench className="w-3.5 h-3.5" /> Prestations</span>
                      <span className="text-content-primary font-medium">{fmt(hotelData.total_services_revenue)}</span>
                    </div>
                    {hotelData.outstanding_balance > 0 && (
                      <div className="flex justify-between border-t border-surface-border pt-2">
                        <span className="text-content-secondary flex items-center gap-2"><Banknote className="w-3.5 h-3.5" /> Soldes impayés</span>
                        <span className="text-status-error font-medium">{fmt(hotelData.outstanding_balance)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-surface-border pt-2 font-bold">
                      <span className="text-content-secondary">Total encaissé</span>
                      <span className="text-status-teal">{fmt(hotelData.total_revenue - hotelData.outstanding_balance)}</span>
                    </div>
                  </div>
                </div>

                {/* Top chambres */}
                {hotelData.room_stats.length > 0 && (
                  <div className="card p-4">
                    <h2 className="text-sm font-semibold text-content-secondary mb-4">Performance par chambre</h2>
                    <div className="space-y-3">
                      {hotelData.room_stats.map((r) => {
                        const maxRev = hotelData.room_stats[0].revenue;
                        const pct = maxRev > 0 ? (r.revenue / maxRev) * 100 : 0;
                        return (
                          <div key={r.room_id} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-badge-teal flex items-center justify-center shrink-0">
                              <BedDouble className="w-4 h-4 text-status-teal" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-content-primary font-medium">Ch. {r.room_number} <span className="text-content-muted text-xs capitalize">{r.room_type}</span></span>
                                <span className="text-content-secondary shrink-0 ml-2">{fmt(r.revenue)}</span>
                              </div>
                              <div className="h-1.5 bg-surface-input rounded-full overflow-hidden">
                                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <span className="text-xs text-content-muted w-20 text-right shrink-0">
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

        {/* ── Voitures ── */}
        {tab === 'voitures' && (
          <div className="space-y-5">
            {loading ? (
              <p className="text-sm text-content-muted">Chargement…</p>
            ) : !voituresData ? (
              <p className="text-sm text-content-muted text-center py-6">Aucune donnée sur la période</p>
            ) : (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'CA Véhicules',    value: fmt(voituresData.ca_voitures),             icon: DollarSign, color: 'text-content-brand',   bg: 'bg-badge-brand border-status-brand' },
                    { label: 'Vendus',           value: String(voituresData.vendus_count),          icon: Car,        color: 'text-status-success',  bg: 'bg-badge-success border-status-success' },
                    { label: 'Leads',            value: String(voituresData.leads_total),           icon: TrendingUp, color: 'text-status-info',     bg: 'bg-badge-info border-status-info' },
                    { label: 'Parc disponible',  value: String(voituresData.parc_disponible),       icon: BarChart,   color: 'text-status-warning',  bg: 'bg-badge-warning border-status-warning' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className={`p-4 rounded-xl border ${bg}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-content-secondary">{label}</p>
                        <Icon className={`w-4 h-4 ${color}`} />
                      </div>
                      <p className="text-xl font-bold text-content-primary">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Pipeline leads */}
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
                          <div className="h-1.5 bg-surface-input rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ventes récentes */}
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
            )}
          </div>
        )}

      </div>
    </div>
  );
}
