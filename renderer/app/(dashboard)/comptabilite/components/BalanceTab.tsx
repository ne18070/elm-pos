'use client';

import { ChevronDown, ChevronRight, Scale } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { TrialBalanceLine } from '@services/supabase/accounting';
import { CLASS_LABELS } from './accounting-constants';

interface ByClass {
  cls:          number;
  rows:         TrialBalanceLine[];
  totalDebit:   number;
  totalCredit:  number;
}

interface Props {
  byClass:          ByClass[];
  expandedClasses:  Set<number>;
  toggleClass:      (cls: number) => void;
  currency:         string | undefined;
}

export function BalanceTab({ byClass, expandedClasses, toggleClass, currency }: Props) {
  if (byClass.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Scale className="w-10 h-10 text-slate-600 mx-auto mb-2" />
        <p className="text-content-secondary text-sm">Aucun mouvement pour cette période.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {byClass.map(({ cls, rows, totalDebit, totalCredit }) => (
        <div key={cls} className="card overflow-hidden">
          <button
            onClick={() => toggleClass(cls)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-hover transition-colors"
          >
            <span className="font-semibold text-white text-sm">
              {CLASS_LABELS[cls] ?? `Classe ${cls}`}
            </span>
            <div className="flex items-center gap-6">
              <span className="text-xs text-content-secondary hidden sm:block">
                D : {formatCurrency(totalDebit, currency)} | C : {formatCurrency(totalCredit, currency)}
              </span>
              {expandedClasses.has(cls)
                ? <ChevronDown className="w-4 h-4 text-content-secondary" />
                : <ChevronRight className="w-4 h-4 text-content-secondary" />}
            </div>
          </button>

          {expandedClasses.has(cls) && (
            <div className="border-t border-surface-border">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 uppercase bg-surface-input">
                  <tr>
                    <th className="px-4 py-2 text-left w-24">Compte</th>
                    <th className="px-4 py-2 text-left">Intitulé</th>
                    <th className="px-4 py-2 text-right">Débit</th>
                    <th className="px-4 py-2 text-right">Crédit</th>
                    <th className="px-4 py-2 text-right hidden sm:table-cell">Solde D</th>
                    <th className="px-4 py-2 text-right hidden sm:table-cell">Solde C</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const solde = row.total_debit - row.total_credit;
                    return (
                      <tr key={row.account_code} className="border-t border-surface-border hover:bg-surface-hover">
                        <td className="px-4 py-2 font-mono text-xs text-content-brand">{row.account_code}</td>
                        <td className="px-4 py-2 text-slate-300 text-xs">{row.account_name}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-white">
                          {row.total_debit > 0 ? formatCurrency(row.total_debit, currency) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-white">
                          {row.total_credit > 0 ? formatCurrency(row.total_credit, currency) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-status-success hidden sm:table-cell">
                          {solde > 0 ? formatCurrency(solde, currency) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-status-error hidden sm:table-cell">
                          {solde < 0 ? formatCurrency(-solde, currency) : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-surface-input border-t-2 border-surface-border">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-xs font-bold text-content-secondary uppercase">
                      Total Classe {cls}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-white font-mono text-xs">
                      {formatCurrency(totalDebit, currency)}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-white font-mono text-xs">
                      {formatCurrency(totalCredit, currency)}
                    </td>
                    <td colSpan={2} className="hidden sm:table-cell"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ))}

      <div className="card p-4 bg-brand-600/10 border-brand-700/40">
        <div className="flex items-center justify-between">
          <span className="font-bold text-white">TOTAL GÉNÉRAL</span>
          <div className="flex gap-8">
            <div className="text-right">
              <p className="text-xs text-content-secondary">Total Débit</p>
              <p className="font-bold text-white font-mono">
                {formatCurrency(byClass.reduce((s, c) => s + c.totalDebit, 0), currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-content-secondary">Total Crédit</p>
              <p className="font-bold text-white font-mono">
                {formatCurrency(byClass.reduce((s, c) => s + c.totalCredit, 0), currency)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
