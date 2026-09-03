'use client';

import React from 'react';
import { DollarSign, ShoppingBag, UserCheck, Banknote, Award } from 'lucide-react';
import { KpiCard, KpiGrid } from './KpiCard';
import { RankBar } from './Charts';
import type { VendeursAnalyticsSummary } from '@services/supabase/analytics';

interface VendeursTabProps {
  loading: boolean;
  vendeursData: VendeursAnalyticsSummary | null;
  period: number;
  fmt: (n: number) => string;
}

export function VendeursTab({ loading, vendeursData, period, fmt }: VendeursTabProps) {
  const periodLabel = period === 0 ? "aujourd'hui" : `les ${period} derniers jours`;

  if (loading || !vendeursData) {
    return (
      <div className="space-y-5 animate-pulse">
        <KpiGrid>
          {[1, 2, 3, 4].map((i) => (
            <KpiCard key={i} label="..." value="..." icon={UserCheck} color="..." bg="bg-surface-card border-surface-border" loading />
          ))}
        </KpiGrid>
        <div className="card p-4 h-72 bg-surface-card" />
      </div>
    );
  }

  const { sellers } = vendeursData;
  const maxRevenue = sellers[0]?.revenue ?? 0;

  return (
    <div className="space-y-5">
      <KpiGrid>
        {[
          { label: 'CA vendeurs',    value: fmt(vendeursData.total_ca),                icon: DollarSign, color: 'text-content-brand',   bg: 'bg-badge-brand border-status-brand' },
          { label: 'Commandes',      value: String(vendeursData.total_orders),         icon: ShoppingBag, color: 'text-status-success', bg: 'bg-badge-success border-status-success' },
          { label: 'Vendeurs actifs',value: String(vendeursData.active_sellers),       icon: UserCheck,   color: 'text-status-purple',  bg: 'bg-badge-purple border-status-purple' },
          { label: 'Panier moyen',   value: fmt(vendeursData.avg_order),               icon: Banknote,    color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' },
        ].map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </KpiGrid>

      {vendeursData.top_seller_name && (
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-badge-warning border border-status-warning flex items-center justify-center shrink-0">
            <Award className="w-4 h-4 text-status-warning" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-content-secondary">Meilleur vendeur — {periodLabel}</p>
            <p className="text-sm font-semibold text-content-primary truncate">
              {vendeursData.top_seller_name} · {fmt(sellers[0].revenue)}
            </p>
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-content-secondary mb-4 flex items-center gap-2">
          <UserCheck className="w-4 h-4" /> Classement des vendeurs
        </h2>
        {sellers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <p className="text-sm">Aucune vente enregistrée sur {periodLabel}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sellers.map((s, i) => {
              const share = vendeursData.total_ca > 0 ? Math.round((s.revenue / vendeursData.total_ca) * 100) : 0;
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-content-muted w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <RankBar
                      label={s.name}
                      sub={`${s.order_count} cmd · ${s.item_count} art. · panier ${fmt(s.avg_order)} · ${share}%`}
                      value={s.revenue}
                      max={maxRevenue}
                      color="bg-brand-500"
                      fmt={fmt}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {vendeursData.unassigned_orders > 0 && (
          <p className="mt-4 pt-3 border-t border-surface-border text-xs text-content-muted">
            Non attribué à un caissier (API, imports…) : {fmt(vendeursData.unassigned_ca)} · {vendeursData.unassigned_orders} cmd
          </p>
        )}
      </div>
    </div>
  );
}
