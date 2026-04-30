'use client';

import React from 'react';
import { RankBar } from './Charts';
import type { AnalyticsSummary } from '@pos-types';

interface ProductsTabProps {
  loading: boolean;
  data: AnalyticsSummary | null;
  period: number;
  fmt: (n: number) => string;
}

export function ProductsTab({
  loading,
  data,
  period,
  fmt
}: ProductsTabProps) {
  const periodLabel = period === 0 ? "aujourd'hui" : `les ${period} derniers jours`;

  if (loading) {
      return (
          <div className="card p-4 space-y-4 animate-pulse">
              <div className="h-4 w-32 bg-surface-hover rounded" />
              <div className="space-y-6">
                  {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="flex items-center gap-3">
                          <div className="h-3 w-4 bg-surface-hover rounded" />
                          <div className="flex-1 space-y-2">
                              <div className="flex justify-between">
                                  <div className="h-3 w-32 bg-surface-hover rounded" />
                                  <div className="h-3 w-16 bg-surface-hover rounded" />
                              </div>
                              <div className="h-1.5 w-full bg-surface-hover rounded-full" />
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );
  }

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-content-secondary mb-4">Top produits</h2>
      {!data || data.top_products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <p className="text-sm">Aucune vente enregistrée sur {periodLabel}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.top_products.map((p, i) => {
            const maxRev = data.top_products[0].revenue;
            return (
              <div key={p.product_id} className="flex items-center gap-3">
                <span className="text-xs font-mono text-content-muted w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <RankBar 
                    label={p.name} 
                    value={p.revenue} 
                    max={maxRev} 
                    color="bg-brand-500" 
                    fmt={fmt} 
                    sub={`${p.quantity_sold} ventes`} 
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
