'use client';

import React from 'react';
import { 
  DollarSign, TrendingUp, Banknote, Briefcase, 
  ShoppingBag, BedDouble, Receipt 
} from 'lucide-react';
import { KpiCard, KpiGrid } from './KpiCard';
import { StackedChart, SimpleBarChart, Delta, DayStack } from './Charts';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AnalyticsSummary } from '@pos-types';
import type { 
  HotelAnalyticsSummary, 
  JuridiqueAnalyticsSummary,
  PrevPeriodCA
} from '@services/supabase/analytics';

interface GeneralTabProps {
  loading: boolean;
  business: any;
  data: AnalyticsSummary | null;
  juridiqueData: JuridiqueAnalyticsSummary | null;
  hotelData: HotelAnalyticsSummary | null;
  prevCA: PrevPeriodCA | null;
  stackedDays: DayStack[];
  hasMultiSource: boolean;
  fmt: (n: number) => string;
}

export function GeneralTab({
  loading,
  business,
  data,
  juridiqueData,
  hotelData,
  prevCA,
  stackedDays,
  hasMultiSource,
  fmt
}: GeneralTabProps) {
  
  const isHotel     = business?.type === 'hotel' || business?.features?.includes('hotel');
  const isJuridique = business?.type === 'juridique' ||
                      business?.features?.includes('dossiers') ||
                      business?.features?.includes('honoraires');
  const isStandard  = business?.type === 'retail' || business?.type === 'restaurant' || business?.type === 'service' ||
                      business?.features?.includes('retail') || business?.features?.includes('restaurant');

  const totalSales = data?.total_sales ?? 0;
  const totalFees  = juridiqueData?.total_fees ?? 0;
  const totalHotel = hotelData?.total_revenue ?? 0;
  const globalCA   = totalSales + totalFees + totalHotel;
  const prevGlobalCA = prevCA ? (prevCA.total_sales + prevCA.total_fees + prevCA.total_hotel) : 0;

  const totalPaidFees  = juridiqueData?.total_paid ?? 0;
  const totalHotelPaid = (hotelData?.total_revenue ?? 0) - (hotelData?.outstanding_balance ?? 0);
  const globalPaid     = totalSales + totalPaidFees + totalHotelPaid;

  const getKPIs = () => {
    if (isJuridique && !isHotel && !isStandard) {
      return [
        { label: 'Total Honoraires', value: fmt(totalFees),  sub: <Delta current={totalFees} prev={prevCA?.total_fees ?? 0} />,  icon: DollarSign, color: 'text-content-brand',   bg: 'bg-badge-brand border-status-brand' },
        { label: 'Encaissé',         value: fmt(totalPaidFees), sub: <Delta current={totalPaidFees} prev={prevCA?.total_fees ? prevCA.total_fees * (totalPaidFees / (totalFees || 1)) : 0} />, icon: Banknote, color: 'text-status-success', bg: 'bg-badge-success border-status-success' },
        { label: 'Dossiers Actifs',  value: String(juridiqueData?.active_dossiers ?? 0), sub: null, icon: Briefcase, color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' },
        { label: 'Audiences',        value: String(juridiqueData?.upcoming_audiences ?? 0), sub: null, icon: Receipt, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' },
      ];
    }

    const items = [
      {
        label: 'C.A Global', value: fmt(globalCA),
        sub: <Delta current={globalCA} prev={prevGlobalCA} />,
        icon: TrendingUp, color: 'text-content-brand', bg: 'bg-badge-brand border-status-brand',
      },
      {
        label: 'Total Encaissé', value: fmt(globalPaid),
        sub: globalCA > 0 && (globalCA - globalPaid) > 0 ? <span className="text-[10px] text-content-muted">Reste : {fmt(globalCA - globalPaid)}</span> : null,
        icon: Banknote, color: 'text-status-success', bg: 'bg-badge-success border-status-success',
      },
    ];

    if (isJuridique) items.push({ label: 'Dossiers Actifs', value: String(juridiqueData?.active_dossiers ?? 0), sub: <span className="text-[10px] text-content-muted">Espace juridique</span>, icon: Briefcase, color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' });
    
    if (isStandard) {
        // Fix for the meaningful KPIs: use previous order count if available or hide delta
        const prevOrderCount = prevCA?.order_count ?? 0;
        items.push({ 
            label: 'Commandes', 
            value: String(data?.order_count ?? 0), 
            sub: prevCA && prevCA.order_count > 0 ? <Delta current={data?.order_count ?? 0} prev={prevCA.order_count} /> : null, 
            icon: ShoppingBag, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' 
        });
    }

    if (isHotel && items.length < 4) items.push({ label: 'Occupation Hôtel', value: `${hotelData?.occupancy_rate ?? 0}%`, sub: <span className="text-[10px] text-content-muted">{hotelData?.occupied_rooms ?? 0} ch. occupées</span>, icon: BedDouble, color: 'text-status-info', bg: 'bg-badge-info border-status-info' });

    return items;
  };

  const kpis = getKPIs();

  return (
    <>
      <KpiGrid>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </KpiGrid>

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

      <div className="card p-4">
        <h2 className="text-sm font-semibold text-content-secondary mb-4">
          {hasMultiSource ? 'CA journalier — toutes sources' : 'Ventes journalières'}
        </h2>
        {loading ? (
            <div className="h-[220px] w-full bg-surface-hover animate-pulse rounded-xl" />
        ) : stackedDays.length > 0 ? (
            hasMultiSource
                ? <StackedChart days={stackedDays} fmt={fmt} />
                : (
                    <SimpleBarChart
                    data={stackedDays.map(d => ({ label: format(new Date(d.date), 'd MMM', { locale: fr }), total: d.retail + d.services }))}
                    dataKey="total"
                    fmt={fmt}
                    />
                )
        ) : (
            <div className="h-[220px] flex items-center justify-center border border-dashed border-surface-border rounded-xl text-content-muted text-xs">
                Aucune vente sur la période
            </div>
        )}
      </div>
    </>
  );
}
