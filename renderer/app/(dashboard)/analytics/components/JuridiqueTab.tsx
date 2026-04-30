'use client';

import React from 'react';
import { Scale, Gavel, TrendingUp, Receipt, Briefcase } from 'lucide-react';
import { SimpleBarChart } from './Charts';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { JuridiqueAnalyticsSummary } from '@services/supabase/analytics';

interface JuridiqueTabProps {
  loading: boolean;
  juridiqueData: JuridiqueAnalyticsSummary | null;
  audiences: any[];
  fmt: (n: number) => string;
}

export function JuridiqueTab({
  loading,
  juridiqueData,
  audiences,
  fmt
}: JuridiqueTabProps) {

  if (loading || !juridiqueData) {
      return (
          <div className="space-y-5 animate-pulse">
              <div className="card p-6 h-40 bg-surface-card" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="card p-5 h-64 bg-surface-card" />
                  <div className="card p-5 h-64 bg-surface-card" />
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <h2 className="text-lg font-black text-content-primary mb-6 flex items-center gap-3">
          <Scale className="w-5 h-5 text-brand-500" /> Performance du Cabinet
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-1">
            <p className="text-xs text-content-muted font-bold uppercase tracking-widest text-center">Taux de Recouvrement</p>
            <p className="text-3xl font-black text-status-success text-center">
              {juridiqueData.total_fees > 0 ? Math.round((juridiqueData.total_paid / juridiqueData.total_fees) * 100) : 0}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-content-muted font-bold uppercase tracking-widest text-center">Efficacité Clôture</p>
            <p className="text-3xl font-black text-content-brand text-center">
              {juridiqueData.total_dossiers > 0 ? Math.round(((juridiqueData.total_dossiers - juridiqueData.active_dossiers) / juridiqueData.total_dossiers) * 100) : 0}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-content-muted font-bold uppercase tracking-widest text-center">Moyenne / Dossier</p>
            <p className="text-3xl font-black text-status-purple text-center">
              {fmt(juridiqueData.total_dossiers > 0 ? juridiqueData.total_fees / juridiqueData.total_dossiers : 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="text-sm font-black text-content-secondary uppercase tracking-widest mb-6 flex items-center gap-2">
            <Gavel className="w-4 h-4 text-status-warning" /> Prochaines Audiences
          </h2>
          {audiences.length === 0
            ? <p className="text-sm text-content-muted text-center py-8">Aucune audience prévue</p>
            : (
              <div className="space-y-3">
                {audiences.map(aud => (
                  <div key={aud.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-input border border-surface-border">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-content-brand uppercase">{aud.reference}</p>
                      <p className="text-sm text-content-primary font-bold truncate">{aud.client_name}</p>
                      <p className="text-[10px] text-content-muted font-medium truncate">{aud.tribunal}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-xs font-black text-content-primary">{format(new Date(aud.date_audience), 'dd MMM yyyy', { locale: fr })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-black text-content-secondary uppercase tracking-widest mb-6 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-status-success" /> Croissance Honoraires
          </h2>
          {juridiqueData.monthly_fees.length < 1
            ? <p className="text-sm text-content-muted text-center py-8 italic">Pas assez de données historiques</p>
            : (
              <SimpleBarChart
                data={juridiqueData.monthly_fees.map(m => ({ label: format(parseISO(m.month + '-01'), 'MMM yy', { locale: fr }), total: m.amount }))}
                dataKey="total"
                color="#a855f7"
                fmt={fmt}
              />
            )
          }
        </div>
      </div>
    </div>
  );
}
