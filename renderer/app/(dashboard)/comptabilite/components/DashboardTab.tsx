'use client';

import { TrendingUp, TrendingDown, DollarSign, Wallet, BookOpen } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { JournalEntry } from '@services/supabase/accounting';
import type { computeIncomeStatement, computeBalanceSheet } from '@services/supabase/accounting';
import { SOURCE_LABELS } from './accounting-constants';

interface Props {
  entries:  JournalEntry[];
  is:       ReturnType<typeof computeIncomeStatement>;
  bs:       ReturnType<typeof computeBalanceSheet>;
  currency: string | undefined;
}

export function DashboardTab({ entries, is, bs, currency }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-green-900/20 text-green-400"><TrendingUp className="w-5 h-5" /></div>
            <span className="text-xs text-slate-400 uppercase tracking-wide">Chiffre d&apos;affaires</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(is.caNet, currency)}</p>
          {is.rrrAccordes > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              Brut : {formatCurrency(is.ventesGross, currency)} – Remises : {formatCurrency(is.rrrAccordes, currency)}
            </p>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-red-900/20 text-red-400"><TrendingDown className="w-5 h-5" /></div>
            <span className="text-xs text-slate-400 uppercase tracking-wide">Charges totales</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {formatCurrency(is.achatsMarchandises + is.autresCharges, currency)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Achats : {formatCurrency(is.achatsMarchandises, currency)}</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-xl ${is.resultatNet >= 0 ? 'bg-brand-900/20 text-brand-400' : 'bg-red-900/20 text-red-400'}`}>
              <DollarSign className="w-5 h-5" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wide">Résultat net</span>
          </div>
          <p className={`text-2xl font-bold ${is.resultatNet >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
            {formatCurrency(is.resultatNet, currency)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Marge brute : {formatCurrency(is.margeBrute, currency)}</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-cyan-900/20 text-cyan-400"><Wallet className="w-5 h-5" /></div>
            <span className="text-xs text-slate-400 uppercase tracking-wide">Trésorerie</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(bs.tresorerie, currency)}</p>
          <p className="text-xs text-slate-500 mt-1">Caisse + Banque + Mobile</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border">
          <h2 className="font-semibold text-white">Dernières écritures ({entries.length})</h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-8 text-center">
            <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Aucune écriture pour cette période.</p>
            <p className="text-slate-500 text-xs mt-1">Cliquez sur <strong className="text-white">Synchroniser</strong> pour importer les ventes et achats.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 uppercase border-b border-surface-border">
              <tr>
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Libellé</th>
                <th className="px-5 py-3 text-left hidden sm:table-cell">Type</th>
                <th className="px-5 py-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 10).map((e) => {
                const src = SOURCE_LABELS[e.source] ?? SOURCE_LABELS.manual;
                const amt = e.lines?.reduce((s, l) => s + l.debit, 0) ?? 0;
                return (
                  <tr key={e.id} className="border-b border-surface-border last:border-0 hover:bg-surface-hover">
                    <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{e.entry_date}</td>
                    <td className="px-5 py-3 text-white">
                      {e.reference && <span className="font-mono text-xs text-slate-500 mr-2">{e.reference}</span>}
                      {e.description}
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium ${src.color}`}>{src.label}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-white">{formatCurrency(amt, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
