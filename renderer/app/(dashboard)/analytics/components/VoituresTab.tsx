'use client';

import React from 'react';
import { DollarSign, Car, TrendingUp, BarChart } from 'lucide-react';
import { KpiCard, KpiGrid } from './KpiCard';
import type { VoituresAnalyticsSummary } from '@services/supabase/analytics';

interface VoituresTabProps {
  loading: boolean;
  voituresData: VoituresAnalyticsSummary | null;
  period: number;
  fmt: (n: number) => string;
}

export function VoituresTab({
  loading,
  voituresData,
  period,
  fmt
}: VoituresTabProps) {
  const periodLabel = period === 0 ? "aujourd'hui" : `les ${period} derniers jours`;

  if (loading || !voituresData) {
      return (
          <div className="space-y-5 animate-pulse">
              <KpiGrid>
                  {[1, 2, 3, 4].map(i => <KpiCard key={i} label="..." value="..." icon={Car} color="..." bg="bg-surface-card border-surface-border" loading />)}
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
          { label: 'CA Véhicules',   value: fmt(voituresData.ca_voitures),        icon: DollarSign, color: 'text-content-brand',  bg: 'bg-badge-brand border-status-brand' },
          { label: 'Vendus',          value: String(voituresData.vendus_count),     icon: Car,        color: 'text-status-success',  bg: 'bg-badge-success border-status-success' },
          { label: 'Leads',           value: String(voituresData.leads_total),      icon: TrendingUp, color: 'text-status-info',    bg: 'bg-badge-info border-status-info' },
          { label: 'Parc disponible', value: String(voituresData.parc_disponible),  icon: BarChart,   color: 'text-status-warning',  bg: 'bg-badge-warning border-status-warning' },
        ].map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </KpiGrid>

      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-content-secondary">Pipeline contacts</h2>
        <div className="space-y-2">
          {voituresData.leads_total === 0 ? (
              <p className="text-sm text-content-muted text-center py-4">Aucun lead sur {periodLabel}</p>
          ) : [
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

      {voituresData.recent_ventes.length > 0 ? (
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
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-content-muted">
          <p className="text-sm">Aucune vente récente sur {periodLabel}</p>
        </div>
      )}
    </div>
  );
}
