'use client';

import React from 'react';
import { Banknote, Package, Truck, Store } from 'lucide-react';
import { KpiCard, KpiGrid } from './KpiCard';
import { SimpleBarChart, RankBar } from './Charts';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ApprovAnalyticsSummary } from '@services/supabase/analytics';

interface ApprovisionnementTabProps {
  loading: boolean;
  approvData: ApprovAnalyticsSummary | null;
  period: number;
  fmt: (n: number) => string;
}

export function ApprovisionnementTab({
  loading,
  approvData,
  period,
  fmt
}: ApprovisionnementTabProps) {
  const periodLabel = period === 0 ? "aujourd'hui" : `les ${period} derniers jours`;

  if (loading || !approvData) {
      return (
          <div className="space-y-5 animate-pulse">
              <KpiGrid>
                  {[1, 2, 3, 4].map(i => <KpiCard key={i} label="..." value="..." icon={Package} color="..." bg="bg-surface-card border-surface-border" loading />)}
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
          { label: 'Total dépensé',    value: fmt(approvData.total_depense), icon: Banknote,  color: 'text-status-error',    bg: 'bg-badge-error border-status-error' },
          { label: 'Entrées stock',     value: String(approvData.total_entries), icon: Package, color: 'text-content-brand',  bg: 'bg-badge-brand border-status-brand' },
          { label: 'BCs reçus',         value: String(approvData.po_received),  icon: Truck,   color: 'text-status-success',  bg: 'bg-badge-success border-status-success' },
          { label: 'Fournisseurs',      value: String(approvData.top_suppliers.length), icon: Store, color: 'text-status-warning', bg: 'bg-badge-warning border-status-warning' },
        ].map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </KpiGrid>

      {/* Graphe mensuel dépenses */}
      {approvData.monthly.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-content-secondary mb-4">Dépenses mensuelles</h2>
          <SimpleBarChart
            data={approvData.monthly.map(m => ({ label: format(parseISO(m.month + '-01'), 'MMM yy', { locale: fr }), total: m.total }))}
            dataKey="total"
            color="#ef4444"
            fmt={fmt}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Top fournisseurs */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-content-secondary mb-4 flex items-center gap-2">
            <Store className="w-4 h-4" /> Top fournisseurs
          </h2>
          {approvData.top_suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                <p className="text-sm">Aucun fournisseur sur {periodLabel}</p>
            </div>
          ) : (
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
          )}
        </div>

        {/* Top produits réappro */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-content-secondary mb-4 flex items-center gap-2">
            <Package className="w-4 h-4" /> Produits les plus réapprovisionnés
          </h2>
          {approvData.top_products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-content-muted">
                <p className="text-sm">Aucune entrée sur {periodLabel}</p>
            </div>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
