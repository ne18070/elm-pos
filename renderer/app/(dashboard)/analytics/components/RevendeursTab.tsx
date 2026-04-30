'use client';

import React from 'react';
import { DollarSign, ShoppingBag, Users, Banknote } from 'lucide-react';
import { KpiCard, KpiGrid } from './KpiCard';
import { RankBar } from './Charts';
import type { RevendeursAnalyticsSummary } from '@services/supabase/analytics';

const TYPE_LABELS: Record<string, string> = { gros: 'Gros', demi_gros: 'Demi-gros', detaillant: 'Détaillant' };
const TYPE_COLORS: Record<string, string> = {
  gros:      'bg-purple-500/20 text-purple-400',
  demi_gros: 'bg-blue-500/20 text-blue-400',
  detaillant:'bg-emerald-500/20 text-emerald-400',
};

interface RevendeursTabProps {
  loading: boolean;
  revendeursData: RevendeursAnalyticsSummary | null;
  period: number;
  fmt: (n: number) => string;
}

export function RevendeursTab({
  loading,
  revendeursData,
  period,
  fmt
}: RevendeursTabProps) {
  const periodLabel = period === 0 ? "aujourd'hui" : `les ${period} derniers jours`;

  if (loading || !revendeursData) {
      return (
          <div className="space-y-5 animate-pulse">
              <KpiGrid>
                  {[1, 2, 3, 4].map(i => <KpiCard key={i} label="..." value="..." icon={Users} color="..." bg="bg-surface-card border-surface-border" loading />)}
              </KpiGrid>
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
          { label: 'CA Revendeurs',   value: fmt(revendeursData.total_ca),     icon: DollarSign, color: 'text-content-brand',   bg: 'bg-badge-brand border-status-brand' },
          { label: 'Commandes',        value: String(revendeursData.total_orders), icon: ShoppingBag, color: 'text-status-success', bg: 'bg-badge-success border-status-success' },
          { label: 'Revendeurs actifs',value: String(revendeursData.top_resellers.length), icon: Users, color: 'text-status-purple', bg: 'bg-badge-purple border-status-purple' },
          { label: 'Panier moyen',     value: fmt(revendeursData.total_orders > 0 ? revendeursData.total_ca / revendeursData.total_orders : 0), icon: Banknote, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' },
        ].map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </KpiGrid>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Top revendeurs */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-content-secondary mb-4 flex items-center gap-2">
            <Users className="w-4 h-4" /> Top revendeurs
          </h2>
          {revendeursData.top_resellers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                <p className="text-sm">Aucune vente enregistrée sur {periodLabel}</p>
            </div>
          ) : (
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
          )}
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
    </div>
  );
}
