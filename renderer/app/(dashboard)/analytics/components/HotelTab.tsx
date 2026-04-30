'use client';

import React from 'react';
import { DollarSign, LogOut, BedDouble, LogIn, Wrench, Banknote } from 'lucide-react';
import { KpiCard, KpiGrid } from './KpiCard';
import { RankBar } from './Charts';
import type { HotelAnalyticsSummary } from '@services/supabase/analytics';

interface HotelTabProps {
  loading: boolean;
  hotelData: HotelAnalyticsSummary | null;
  period: number;
  fmt: (n: number) => string;
}

export function HotelTab({
  loading,
  hotelData,
  period,
  fmt
}: HotelTabProps) {
  const periodLabel = period === 0 ? "aujourd'hui" : `les ${period} derniers jours`;

  if (loading || !hotelData) {
      return (
          <div className="space-y-5 animate-pulse">
              <KpiGrid>
                  {[1, 2, 3, 4].map(i => <KpiCard key={i} label="..." value="..." icon={BedDouble} color="..." bg="bg-surface-card border-surface-border" loading />)}
              </KpiGrid>
              <div className="card p-4 h-40 bg-surface-card" />
              <div className="card p-4 h-64 bg-surface-card" />
          </div>
      );
  }

  return (
    <div className="space-y-5">
      <KpiGrid>
        {[
          { label: 'Revenus hébergement', value: fmt(hotelData.total_revenue),       icon: DollarSign, color: 'text-status-teal',   bg: 'bg-badge-teal border-status-teal' },
          { label: 'Check-outs',           value: String(hotelData.total_checkouts),  icon: LogOut,     color: 'text-status-success',  bg: 'bg-badge-success border-status-success' },
          { label: 'Séjour moyen',         value: fmt(hotelData.avg_stay_value),      icon: BedDouble,  color: 'text-content-brand',  bg: 'bg-badge-brand border-status-brand' },
          { label: 'Nuits moyennes',       value: hotelData.avg_nights.toFixed(1),    icon: LogIn,      color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' },
        ].map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </KpiGrid>

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

      {hotelData.room_stats.length > 0 ? (
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
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-content-muted">
          <p className="text-sm">Aucune activité par chambre sur {periodLabel}</p>
        </div>
      )}
    </div>
  );
}
