'use client';

import React from 'react';
import {
  TrendingUp, Banknote, Briefcase,
  ShoppingBag, BedDouble, Receipt, Wallet, Users, UserCheck, Palmtree
} from 'lucide-react';
import { KpiCard, KpiGrid } from './KpiCard';
import { TrendChart, type TrendPoint } from './Charts';
import { getBusinessProfile } from '../lib/profile';
import { usePeriod, periodDates } from '../lib/period';
import { WatchList, buildWatchItems, TopProductsCard, PaymentsCard } from './GeneralInsights';
import { useLowStockAlerts } from '@/hooks/useLowStockAlerts';
import { hasFeature } from '@/lib/permissions';
import { useCan } from '@/hooks/usePermission';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AnalyticsSummary, Business } from '@pos-types';
import type {
  HotelAnalyticsSummary,
  JuridiqueAnalyticsSummary,
  PrevPeriodCA,
  RHAnalyticsSummary,
  PaymentMethodStat,
} from '@services/supabase/analytics';
import type { OrderFilterTotals } from '@services/supabase/orders';

interface GeneralTabProps {
  loading: boolean;
  business: Business | null;
  data: AnalyticsSummary | null;
  juridiqueData: JuridiqueAnalyticsSummary | null;
  hotelData: HotelAnalyticsSummary | null;
  rhData: RHAnalyticsSummary | null;
  prevCA: PrevPeriodCA | null;
  fmt: (n: number) => string;
  /** 0 = aujourd'hui, sinon nombre de jours (cf. PERIODS). */
  period: number;
  /** Onglets visibles — une carte n'ouvre que ceux-là. */
  availableTabs: string[];
  onNavigate?: (tab: string) => void;
  payments: PaymentMethodStat[];
  receivables: OrderFilterTotals | null;
}

type KpiItem = Omit<React.ComponentProps<typeof KpiCard>, 'loading'>;

export function GeneralTab({
  loading,
  business,
  data,
  juridiqueData,
  hotelData,
  rhData,
  prevCA,
  fmt,
  period,
  availableTabs,
  onNavigate,
  payments,
  receivables,
}: GeneralTabProps) {

  const { isHotel, isJuridique, isRH, isStandard } = getBusinessProfile(business);
  const has  = (t: string) => availableTabs.includes(t);
  const open = (t: string) => (onNavigate && has(t) ? () => onNavigate(t) : undefined);
  const periodInfo = usePeriod();
  const { compareLabel, prev: prevBounds } = periodInfo;
  const can = useCan();
  // La période de comparaison est nommée une fois au-dessus des cartes.
  const vs = (n: number, money = true) => (money ? fmt(n) : String(n));
  const compareCaption = (() => {
    const s = new Date(`${prevBounds.start}T00:00:00`);
    const e = subDays(new Date(`${prevBounds.end}T00:00:00`), 1);
    const d = (x: Date) => format(x, 'd MMM', { locale: fr });
    const range = prevBounds.start === format(e, 'yyyy-MM-dd') ? d(s) : `${d(s)} – ${d(e)}`;
    return `Comparé à ${compareLabel === 'hier' ? 'hier' : `: ${compareLabel}`} (${range})`;
  })();

  // ── Montants consolidés (ventes + honoraires + hôtel) ──────────────────────
  const fees      = isJuridique ? (juridiqueData?.total_fees ?? 0) : 0;
  const feesPaid  = isJuridique ? (juridiqueData?.total_paid ?? 0) : 0;
  const hotelCA   = isHotel ? (hotelData?.total_revenue ?? 0) : 0;
  const hotelPaid = isHotel ? hotelCA - (hotelData?.outstanding_balance ?? 0) : 0;

  const billed    = (data?.billed_total ?? 0) + fees + hotelCA;
  const collected = (data?.collected_total ?? 0) + feesPaid + hotelPaid;
  const remaining = Math.max(0, billed - collected);
  const count     = data?.billed_count ?? 0;
  const basket    = count > 0 ? (data?.billed_total ?? 0) / count : 0;

  const p = prevCA;
  const prevBilled    = p ? p.billed_total + (isJuridique ? p.total_fees : 0) + (isHotel ? p.total_hotel : 0) : null;
  const prevCollected = p ? p.collected_total + (isJuridique ? p.fees_paid : 0) + (isHotel ? p.hotel_paid : 0) : null;
  const prevBasket    = p ? (p.billed_count > 0 ? p.billed_total / p.billed_count : 0) : null;

  // ── Mini-courbes : un point par jour, jours sans vente à 0 ─────────────────
  const series = (() => {
    if (periodInfo.span === 1 || !data) return null;
    const byDay = new Map(data.daily_stats.map((d) => [d.date, d]));
    const feesByDay  = new Map((isJuridique ? juridiqueData?.daily_fees ?? [] : []).map((d) => [d.date, d.amount]));
    const hotelByDay = new Map((isHotel ? hotelData?.daily_revenue ?? [] : []).map((d) => [d.date, d.total]));
    const dates = periodDates(periodInfo);
    return {
      billed:    dates.map((d) => (byDay.get(d)?.billed_sales ?? 0) + (feesByDay.get(d) ?? 0) + (hotelByDay.get(d) ?? 0)),
      collected: dates.map((d) => byDay.get(d)?.collected_sales ?? 0),
      count:     dates.map((d) => byDay.get(d)?.billed_count ?? 0),
      trend: dates.map((d, i): TrendPoint => {
        const st = byDay.get(d);
        const services = st?.billed_services ?? 0;
        return {
          date: d,
          ventes:      Math.max(0, (st?.billed_sales ?? 0) - services),
          prestations: services,
          hotel:       hotelByDay.get(d) ?? 0,
          honoraires:  feesByDay.get(d) ?? 0,
          prev:        prevCA?.daily[i]?.total ?? null,
        };
      }),
    };
  })();
  // L'encaissé journalier n'existe que pour les ventes : pas de courbe trompeuse en multi-activité.
  const collectedSpark = !isJuridique && !isHotel ? series?.collected : undefined;

  const getKPIs = (): KpiItem[] => {
    if (isRH && !isStandard && !isHotel && !isJuridique) {
      return [
        { label: 'Masse salariale',      value: fmt(rhData?.total_payroll ?? 0), icon: Wallet, note: 'Salaires versés sur la période' },
        { label: 'Effectif actif',       value: String(rhData?.active_staff_count ?? 0), icon: Users },
        { label: "Présents aujourd'hui", value: `${rhData?.present_today ?? 0} / ${rhData?.active_staff_count ?? 0}`, icon: UserCheck },
        { label: 'Congés en attente',    value: String(rhData?.pending_leaves ?? 0), icon: Palmtree,
          note: (rhData?.pending_leaves ?? 0) > 0 ? 'À valider' : undefined, noteTone: 'warning' },
      ];
    }

    const ca: KpiItem = {
      label: isJuridique && !isStandard && !isHotel ? 'Honoraires facturés' : "Chiffre d'affaires",
      value: fmt(billed), icon: TrendingUp, spark: series?.billed,
      delta: { current: billed, prev: prevBilled, prevLabel: vs(prevBilled ?? 0) },
    };
    const paid: KpiItem = {
      label: 'Encaissé', value: fmt(collected), icon: Banknote, spark: collectedSpark,
      delta: { current: collected, prev: prevCollected, prevLabel: vs(prevCollected ?? 0) },
      note: remaining > 0.5 ? `Reste ${fmt(remaining)}` : billed > 0 ? 'Tout est encaissé' : undefined,
      noteTone: remaining > 0.5 ? 'warning' : 'muted',
    };
    const dossiers: KpiItem = {
      label: 'Dossiers actifs', value: String(juridiqueData?.active_dossiers ?? 0), icon: Briefcase,
      note: `${juridiqueData?.upcoming_audiences ?? 0} audience(s) à venir`, onClick: open('juridique'),
    };
    const occupation: KpiItem = {
      label: 'Occupation', value: `${hotelData?.occupancy_rate ?? 0} %`, icon: BedDouble,
      note: `${hotelData?.occupied_rooms ?? 0} chambre(s) occupée(s)`, onClick: open('hotel'),
    };

    if (isJuridique && !isStandard && !isHotel) {
      return [ca, paid, dossiers, {
        label: 'Audiences à venir', value: String(juridiqueData?.upcoming_audiences ?? 0), icon: Receipt, onClick: open('juridique'),
      }];
    }

    const orders: KpiItem = {
      label: 'Ventes', value: String(count), icon: ShoppingBag, spark: series?.count,
      delta: { current: count, prev: p ? p.billed_count : null, prevLabel: vs(p?.billed_count ?? 0, false) },
      onClick: open('grossiste'),
    };
    const avg: KpiItem = {
      label: 'Panier moyen', value: fmt(basket), icon: Receipt,
      delta: { current: basket, prev: prevBasket, prevLabel: vs(prevBasket ?? 0) },
      onClick: open('produits'),
    };

    const items = [ca, paid];
    if (isJuridique) items.push(dossiers);
    if (isHotel)     items.push(occupation);
    items.push(orders, avg);
    return items.slice(0, 4);
  };

  const kpis = getKPIs();

  // Stock : seulement si le module est actif (sinon pas de requête).
  const tracksStock = hasFeature(business, 'stock');
  const { lowStock, loading: stockLoading } = useLowStockAlerts(tracksStock ? business?.id ?? '' : '');
  const watchItems = buildWatchItems({
    receivables,
    lowStock: tracksStock ? lowStock.length : null,
    outOfStock: lowStock.filter((p) => (p.stock ?? 0) <= 0).length,
    fmt,
  });
  const showCommerceBlocks = isStandard && !isRH;
  const canSeeMargin = can('view_financials');

  return (
    <>
      {!(isRH && !isStandard && !isHotel && !isJuridique) && (
        <p className="-mb-2 text-xs text-content-muted">{compareCaption}</p>
      )}
      <KpiGrid>
        {kpis.map(({ label, ...kpi }) => (
          <KpiCard key={label} label={label} {...kpi} loading={loading} />
        ))}
      </KpiGrid>

      {showCommerceBlocks && (
        <WatchList items={watchItems} loading={loading || (tracksStock && stockLoading)} />
      )}

      {isJuridique && juridiqueData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="text-sm font-black text-content-secondary uppercase tracking-widest mb-6 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-status-success" /> Répartition Honoraires
            </h2>
            <div className="space-y-4">
              {juridiqueData.fees_by_type.length === 0 ? (
                  <p className="text-sm text-content-muted text-center py-4">Aucune donnée</p>
              ) : juridiqueData.fees_by_type.map(f => {
                const max = juridiqueData.fees_by_type[0].amount;
                const pct = (f.amount / (max || 1)) * 100;
                return (
                  <div key={f.type}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-content-secondary font-bold capitalize">{f.type.replace(/_/g, ' ')}</span>
                      <span className="text-content-primary font-black">{fmt(f.amount)}</span>
                    </div>
                    <div className="h-1.5 bg-surface-card rounded-full overflow-hidden">
                      <div className="h-full bg-status-success rounded-full" style={{ width: `${pct}%` }} />
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
                  <p className="text-[10px] font-black text-content-muted uppercase tracking-tight mb-1">{s.status}</p>
                  <p className="text-xl font-black text-content-primary">{s.count}</p>
                </div>
              ))}
              {juridiqueData.dossiers_by_status.length === 0 && (
                  <p className="text-sm text-content-muted col-span-2 text-center py-4">Aucun dossier</p>
              )}
            </div>
          </div>
        </div>
      )}

      {!isRH && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-content-secondary mb-4">Chiffre d'affaires par jour</h2>
          {loading ? (
              <div className="h-[240px] w-full bg-surface-hover animate-pulse rounded-xl" />
          ) : !series ? (
              <div className="h-[120px] flex items-center justify-center border border-dashed border-surface-border rounded-xl text-content-muted text-xs text-center px-4">
                  Choisissez 7 jours ou plus pour voir l&apos;évolution jour par jour
              </div>
          ) : series.billed.some((v) => v > 0) || series.trend.some((p) => (p.prev ?? 0) > 0) ? (
              <TrendChart points={series.trend} fmt={fmt} prevLabel={compareLabel.replace(/^./, (c) => c.toUpperCase())} />
          ) : (
              <div className="h-[240px] flex items-center justify-center border border-dashed border-surface-border rounded-xl text-content-muted text-xs">
                  Aucune vente sur la période
              </div>
          )}
        </div>
      )}

      {showCommerceBlocks && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopProductsCard products={data?.top_products ?? []} loading={loading} fmt={fmt} onSeeAll={open('produits')}
            margin={canSeeMargin ? data?.gross_margin : null} />
          <PaymentsCard payments={payments} loading={loading} fmt={fmt} />
        </div>
      )}
    </>
  );
}
