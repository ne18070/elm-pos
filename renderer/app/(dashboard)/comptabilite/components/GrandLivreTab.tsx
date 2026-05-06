'use client';

import { useState } from 'react';
import { Search, Edit3, Check, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { JournalEntry, Account } from '@services/supabase/accounting';

interface Props {
  entries:  JournalEntry[];
  accounts: Account[];
  currency: string | undefined;
}

export function GrandLivreTab({ entries, accounts, currency }: Props) {
  const [selectedAccount, setSelectedAccount] = useState<string>(accounts[0]?.code || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [revisionMode, setRevisionMode] = useState(false);
  const [editingLine, setEditingLine] = useState<{ entryId: string, desc: string } | null>(null);

  const filteredAccounts = accounts.filter(a => 
    a.code.includes(searchTerm) || a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const accountLines = entries.flatMap(e => 
    (e.lines ?? [])
      .filter(l => l.account_code === selectedAccount)
      .map(l => ({
        ...l,
        entryId: e.id,
        date: e.entry_date,
        description: e.description,
        reference: e.reference
      }))
  ).sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  const linesWithBalance = accountLines.map(l => {
    runningBalance += (l.debit - l.credit);
    return { ...l, balance: runningBalance };
  });

  const currentAccount = accounts.find(a => a.code === selectedAccount);

  return (
    <div className="grid lg:grid-cols-4 gap-6 h-full">
      {/* Liste des comptes */}
      <div className="lg:col-span-1 flex flex-col gap-4 border-r border-surface-border pr-6 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
          <input
            type="text"
            placeholder="Rechercher un compte..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 py-2 text-sm w-full"
          />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-2">
          {filteredAccounts.map(a => (
            <button
              key={a.code}
              onClick={() => setSelectedAccount(a.code)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedAccount === a.code 
                  ? 'bg-brand-600/10 text-brand-500 font-semibold border border-brand-500/20' 
                  : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
              }`}
            >
              <span className="font-mono mr-2">{a.code}</span>
              <span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Détail du compte */}
      <div className="lg:col-span-3 flex flex-col gap-6 overflow-hidden">
        {currentAccount ? (
          <>
            <div className="flex items-center justify-between p-4 bg-surface-card border border-surface-border rounded-xl">
              <div>
                <h2 className="text-lg font-bold text-content-primary flex items-center gap-3">
                  <span className="font-mono text-brand-500">{currentAccount.code}</span>
                  {currentAccount.name}
                </h2>
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-xs text-content-secondary uppercase tracking-wider">
                    Nature : {currentAccount.nature} · Solde normal : {currentAccount.balance_type}
                  </p>
                  <button 
                    onClick={() => setRevisionMode(!revisionMode)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tighter transition-colors ${
                      revisionMode ? 'bg-status-warning text-black' : 'bg-surface-hover text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    <Edit3 className="w-3 h-3" />
                    {revisionMode ? 'Mode Révision Actif' : 'Activer Révision'}
                  </button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-content-secondary uppercase font-bold">Solde Période</p>
                <p className={`text-xl font-mono font-bold ${runningBalance >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                  {formatCurrency(Math.abs(runningBalance), currency)}
                  <span className="text-xs ml-1">{runningBalance >= 0 ? 'D' : 'C'}</span>
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto border border-surface-border rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold text-content-secondary uppercase">Date</th>
                    <th className="px-4 py-3 text-xs font-bold text-content-secondary uppercase">Réf.</th>
                    <th className="px-4 py-3 text-xs font-bold text-content-secondary uppercase">Libellé</th>
                    <th className="px-4 py-3 text-xs font-bold text-content-secondary uppercase text-right">Débit</th>
                    <th className="px-4 py-3 text-xs font-bold text-content-secondary uppercase text-right">Crédit</th>
                    <th className="px-4 py-3 text-xs font-bold text-content-secondary uppercase text-right">Solde Cumulé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {linesWithBalance.length > 0 ? (
                    linesWithBalance.map((l, i) => (
                      <tr key={i} className={`group hover:bg-surface-hover/50 transition-colors ${revisionMode ? 'cursor-help' : ''}`}>
                        <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">{l.date}</td>
                        <td className="px-4 py-3 text-sm font-mono text-content-secondary">{l.reference || '—'}</td>
                        <td className="px-4 py-3 text-sm text-content-primary font-medium relative">
                          {editingLine?.entryId === l.entryId ? (
                            <div className="flex items-center gap-2">
                              <input 
                                autoFocus
                                className="input py-0.5 px-2 text-sm flex-1"
                                value={editingLine.desc}
                                onChange={e => setEditingLine({ ...editingLine, desc: e.target.value })}
                                onKeyDown={e => e.key === 'Enter' && setEditingLine(null)}
                              />
                              <button onClick={() => setEditingLine(null)} className="text-status-success p-1"><Check className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>{l.description}</span>
                              {revisionMode && (
                                <button 
                                  onClick={() => setEditingLine({ entryId: l.entryId, desc: l.description })}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-brand-500 hover:bg-brand-500/10 rounded transition-all"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-right text-content-primary">
                          {l.debit > 0 ? formatCurrency(l.debit, currency) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-right text-content-primary">
                          {l.credit > 0 ? formatCurrency(l.credit, currency) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-sm font-mono text-right font-bold ${l.balance >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                          {formatCurrency(Math.abs(l.balance), currency)}
                          <span className="text-[10px] ml-1">{l.balance >= 0 ? 'D' : 'C'}</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-content-secondary italic">
                        Aucune écriture pour ce compte sur la période sélectionnée.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-content-secondary">
            <Search className="w-12 h-12 mb-4 opacity-20" />
            <p>Sélectionnez un compte pour voir son détail</p>
          </div>
        )}
      </div>
    </div>
  );
}
