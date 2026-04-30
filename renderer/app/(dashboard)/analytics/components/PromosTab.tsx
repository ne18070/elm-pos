'use client';

import React from 'react';
import { Tag } from 'lucide-react';
import type { CouponStat } from '@services/supabase/analytics';

interface PromosTabProps {
  loading: boolean;
  coupons: CouponStat[];
  period: number;
  fmt: (n: number) => string;
}

export function PromosTab({
  loading,
  coupons,
  period,
  fmt
}: PromosTabProps) {
  const periodLabel = period === 0 ? "aujourd'hui" : `les ${period} derniers jours`;

  if (loading) {
      return (
          <div className="card p-4 space-y-4 animate-pulse">
              <div className="h-4 w-40 bg-surface-hover rounded" />
              <div className="space-y-4 divide-y divide-surface-border">
                  {[1, 2, 3].map(i => (
                      <div key={i} className="py-3 flex items-center gap-3">
                          <div className="flex-1 space-y-2">
                              <div className="h-4 w-20 bg-surface-hover rounded" />
                              <div className="h-3 w-32 bg-surface-hover rounded" />
                          </div>
                          <div className="h-4 w-16 bg-surface-hover rounded" />
                      </div>
                  ))}
              </div>
          </div>
      );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="w-4 h-4 text-status-success" />
        <h2 className="text-sm font-semibold text-content-secondary">Utilisation des coupons</h2>
      </div>
      {coupons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-content-muted">
            <p className="text-sm">Aucun coupon utilisé sur {periodLabel}</p>
        </div>
      ) : (
        <div className="space-y-0 divide-y divide-surface-border">
          {coupons.map((c) => (
            <div key={c.coupon_code} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-mono font-semibold text-status-success">{c.coupon_code}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-badge-success border border-status-success/50 text-status-success">×{c.usage_count}</span>
                </div>
                <div className="flex gap-4 text-xs text-content-muted">
                  <span>CA : {fmt(c.revenue)}</span>
                  <span>Remise : <span className="text-status-error">−{fmt(c.total_discount)}</span></span>
                </div>
              </div>
              <p className="text-sm font-semibold text-content-primary shrink-0">{fmt(c.revenue)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
