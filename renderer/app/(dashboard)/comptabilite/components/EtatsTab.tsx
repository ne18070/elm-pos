'use client';

import { formatCurrency } from '@/lib/utils';
import type { computeIncomeStatement, computeBalanceSheet } from '@services/supabase/accounting';

interface Props {
  is:       ReturnType<typeof computeIncomeStatement>;
  bs:       ReturnType<typeof computeBalanceSheet>;
  currency: string | undefined;
}

export function EtatsTab({ is, bs, currency }: Props) {
  const plRows: { label: string; val: number; indent: number; style: string; separator?: boolean }[] = [
    { label: 'Ventes & Prestations (70x)',   val: is.ventesGross,         indent: 0, style: 'text-slate-300' },
    { label: 'RRR accordés (7091)',           val: -is.rrrAccordes,        indent: 1, style: 'text-red-400' },
    { label: "CHIFFRE D'AFFAIRES NET",        val: is.caNet,               indent: 0, style: 'font-bold text-white', separator: true },
    { label: 'Achats de marchandises (601)',  val: -is.achatsMarchandises, indent: 1, style: 'text-red-400' },
    { label: 'MARGE BRUTE',                   val: is.margeBrute,          indent: 0, style: `font-semibold ${is.margeBrute >= 0 ? 'text-green-400' : 'text-red-400'}`, separator: true },
    { label: 'Autres charges (6xx)',          val: -is.autresCharges,      indent: 1, style: 'text-red-400' },
    { label: "RÉSULTAT D'EXPLOITATION",       val: is.resultatExpl,        indent: 0, style: `font-semibold ${is.resultatExpl >= 0 ? 'text-green-400' : 'text-red-400'}`, separator: true },
    { label: 'Produits financiers',           val: is.produitsFinanciers,  indent: 1, style: 'text-slate-300' },
    { label: 'Charges financières (661)',     val: -is.chargesFinancieres, indent: 1, style: 'text-red-400' },
    { label: "RÉSULTAT AVANT IMPÔT",          val: is.resultatAvantImpot,  indent: 0, style: `font-semibold ${is.resultatAvantImpot >= 0 ? 'text-green-400' : 'text-red-400'}`, separator: true },
    { label: 'Impôts sur résultat (691)',     val: -is.impots,             indent: 1, style: 'text-red-400' },
    { label: 'RÉSULTAT NET',                  val: is.resultatNet,         indent: 0, style: `font-bold text-lg ${is.resultatNet >= 0 ? 'text-brand-400' : 'text-red-400'}`, separator: true },
  ];

  const actifRows = [
    { label: 'Actif immobilisé',  val: bs.actifImmobilise },
    { label: 'Stocks',            val: bs.stocks },
    { label: 'Clients',           val: bs.creancesClients },
    { label: 'TVA récupérable',   val: bs.tvaRecuperable },
    { label: 'Autres actifs CT',  val: bs.autresActifCT },
    { label: 'Trésorerie',        val: bs.tresorerie },
  ];

  const passifRows = [
    { label: 'Capitaux propres', val: bs.capitaux },
    { label: 'Emprunts LT',      val: bs.dettesLT },
    { label: 'Fournisseurs',     val: bs.dettesFF },
    { label: 'Dettes fiscales',  val: bs.dettesFiscales },
    { label: 'Dettes sociales',  val: bs.dettesSociales },
    { label: 'Autres dettes CT', val: bs.autresDettesCT },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Compte de résultat */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border bg-surface-card">
          <h2 className="font-bold text-white">Compte de résultat</h2>
          <p className="text-xs text-slate-500 mt-0.5">Activités ordinaires – SYSCOHADA</p>
        </div>
        <div className="p-5 space-y-1">
          {plRows.map((row, i) => (
            <div key={i}>
              {row.separator && <div className="border-t border-surface-border my-2" />}
              <div className={`flex justify-between items-center py-1 ${row.indent ? 'pl-4' : ''}`}>
                <span className={`text-sm ${row.indent ? 'text-slate-400' : row.style}`}>{row.label}</span>
                <span className={`font-mono text-sm ${row.style}`}>
                  {row.val !== 0 ? formatCurrency(row.val, currency) : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bilan simplifié */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border bg-surface-card">
          <h2 className="font-bold text-white">Bilan simplifié</h2>
          <p className="text-xs text-slate-500 mt-0.5">Situation patrimoniale</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">ACTIF</p>
            {actifRows.map((row, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-xs text-slate-400">{row.label}</span>
                <span className="text-xs font-mono text-white">{formatCurrency(row.val, currency)}</span>
              </div>
            ))}
            <div className="border-t border-surface-border pt-2 flex justify-between">
              <span className="text-sm font-bold text-white">TOTAL ACTIF</span>
              <span className="text-sm font-bold font-mono text-brand-400">{formatCurrency(bs.totalActif, currency)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">PASSIF</p>
            {passifRows.map((row, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-xs text-slate-400">{row.label}</span>
                <span className="text-xs font-mono text-white">{formatCurrency(row.val, currency)}</span>
              </div>
            ))}
            <div className="border-t border-surface-border pt-2 flex justify-between">
              <span className="text-sm font-bold text-white">TOTAL PASSIF</span>
              <span className="text-sm font-bold font-mono text-brand-400">{formatCurrency(bs.totalPassif, currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
