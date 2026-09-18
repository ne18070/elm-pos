'use client';

import React, { useState } from 'react';
import { Tag, ChevronDown, ChevronRight } from 'lucide-react';
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
  const [expanded, setExpanded] = useState<string | null>(null);

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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-content-muted border-b border-surface-border">
                <th className="py-2 pr-4 font-medium"></th>
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium text-right">Utilisations</th>
                <th className="py-2 pr-4 font-medium text-right">Montant (voir détail)</th>
                <th className="py-2 pr-4 font-medium text-right">Qté offerte</th>
                <th className="py-2 pr-4 font-medium text-right">Valeur offerte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {coupons.map((c) => {
                const isOpen = expanded === c.coupon_code;
                return (
                  <React.Fragment key={c.coupon_code}>
                    <tr
                      className="cursor-pointer hover:bg-surface-hover"
                      onClick={() => setExpanded(isOpen ? null : c.coupon_code)}
                    >
                      <td className="py-3 pl-1 text-content-muted w-6">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-sm font-mono font-semibold text-status-success">{c.coupon_code}</span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-badge-success border border-status-success/50 text-status-success">×{c.usage_count}</span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <div className="text-sm font-semibold text-content-primary">{fmt(c.revenue)}</div>
                        <div className="text-[10px] text-content-muted">{c.revenue_label}</div>
                      </td>
                      <td className="py-3 pr-4 text-right text-xs text-content-secondary">
                        {c.offered_quantity > 0
                          ? `${c.offered_quantity} ${c.offered_unit ?? 'unité'}${c.offered_quantity > 1 ? 's' : ''}`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right text-xs text-status-error">−{fmt(c.total_discount)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} className="bg-surface-input/50 px-4 py-3 space-y-3">
                          <p className="text-xs text-content-secondary leading-relaxed">
                            <span className="font-semibold text-content-primary">{fmt(c.revenue)}</span> — {c.revenue_description}
                          </p>
                          {c.usages.length === 0 ? (
                            <p className="text-xs text-content-muted">Aucun détail disponible pour ce coupon.</p>
                          ) : (
                            <ul className="space-y-2">
                              {c.usages.map((u) => (
                                <li key={u.order_id} className="text-xs text-content-secondary leading-relaxed">
                                  {u.description}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
