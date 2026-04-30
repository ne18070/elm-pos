'use client';

import React from 'react';
import { DollarSign, Banknote, ShoppingBag, TrendingUp, Wrench, BarChart as BarChartIcon } from 'lucide-react';
import { KpiCard, KpiGrid } from './KpiCard';
import { SimpleBarChart, RankBar } from './Charts';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ServicesAnalyticsSummary } from '@services/supabase/analytics';

interface ServicesTabProps {
  loading: boolean;
  servicesData: ServicesAnalyticsSummary | null;
  period: number;
  fmt: (n: number) => string;
}

export function ServicesTab({
  loading,
  servicesData,
  period,
  fmt
}: ServicesTabProps) {
  const periodLabel = period === 0 ? "aujourd'hui" : `les ${period} derniers jours`;

  if (loading || !servicesData) {
      return (
          <div className="space-y-5 animate-pulse">
              <KpiGrid>
                  {[1, 2, 3, 4].map(i => <KpiCard key={i} label="..." value="..." icon={Wrench} color="..." bg="bg-surface-card border-surface-border" loading />)}
              </KpiGrid>
              <div className="card p-4 h-40 bg-surface-card" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="card p-4 h-60 bg-surface-card" />
                  <div className="card p-4 h-60 bg-surface-card" />
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <KpiGrid>
        {[
          { label: 'CA encaissé',      value: fmt(servicesData.ca_paye),           icon: DollarSign,  color: 'text-content-brand',   bg: 'bg-badge-brand border-status-brand' },
          { label: 'En attente paiement', value: fmt(servicesData.ca_pending),      icon: Banknote,    color: 'text-status-warning',  bg: 'bg-badge-warning border-status-warning' },
          { label: 'Prestations payées',  value: String(servicesData.count_paye),   icon: ShoppingBag, color: 'text-status-success',  bg: 'bg-badge-success border-status-success' },
          { label: 'Taux de complétion',  value: `${servicesData.completion_rate}%`, icon: TrendingUp,  color: 'text-status-info',    bg: 'bg-badge-info border-status-info' },
        ].map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </KpiGrid>

      {/* Répartition par statut */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-content-secondary mb-4 flex items-center gap-2">
          <Wrench className="w-4 h-4" /> Répartition par statut
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'En attente', value: servicesData.count_attente,  color: 'bg-badge-warning  text-status-warning  border-status-warning/30' },
            { label: 'En cours',   value: servicesData.count_en_cours, color: 'bg-badge-info     text-status-info     border-status-info/30' },
            { label: 'Terminées',  value: servicesData.count_termine,  color: 'bg-badge-brand    text-content-brand   border-status-brand/30' },
            { label: 'Payées',     value: servicesData.count_paye,     color: 'bg-badge-success  text-status-success  border-status-success/30' },
            { label: 'Annulées',   value: servicesData.count_annule,   color: 'bg-badge-error    text-status-error    border-status-error/30' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl border px-3 py-2.5 text-center ${color}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1 opacity-70">{label}</p>
              <p className="text-2xl font-black">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Graphique CA journalier */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-content-secondary mb-4">CA journalier encaissé</h2>
          {servicesData.daily_revenue.length > 0 ? (
            <SimpleBarChart
              data={servicesData.daily_revenue.map(d => ({ label: format(new Date(d.date), 'd MMM', { locale: fr }), total: d.total }))}
              dataKey="total"
              color="#fb923c"
              fmt={fmt}
            />
          ) : (
            <div className="h-[200px] flex items-center justify-center border border-dashed border-surface-border rounded-xl text-content-muted text-xs">
              Aucun encaissement sur {periodLabel}
            </div>
          )}
        </div>

        {/* Top prestations */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-content-secondary mb-4 flex items-center gap-2">
            <BarChartIcon className="w-4 h-4" /> Top prestations
          </h2>
          {servicesData.top_services.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-content-muted">
              <p className="text-sm">Aucune prestation payée sur {periodLabel}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {servicesData.top_services.map((s, i) => (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-content-muted w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <RankBar
                      label={s.name}
                      sub={`${s.count} fois`}
                      value={s.revenue}
                      max={servicesData.top_services[0].revenue}
                      color="bg-brand-500"
                      fmt={fmt}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
