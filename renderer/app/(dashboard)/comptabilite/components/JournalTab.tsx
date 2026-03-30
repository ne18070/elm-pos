'use client';

import { Plus, Trash2, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { JournalEntry } from '@services/supabase/accounting';
import { SOURCE_LABELS } from './accounting-constants';

interface Props {
  entries:        JournalEntry[];
  expandedEntry:  string | null;
  setExpandedEntry: (id: string | null) => void;
  currency:       string | undefined;
  onNewEntry:     () => void;
  onDeleteEntry:  (id: string) => void;
}

export function JournalTab({ entries, expandedEntry, setExpandedEntry, currency, onNewEntry, onDeleteEntry }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{entries.length} écriture{entries.length !== 1 ? 's' : ''}</p>
        <button onClick={onNewEntry} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouvelle écriture
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="card p-8 text-center">
          <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Journal vide pour cette période.</p>
          <p className="text-slate-500 text-xs mt-1">Cliquez sur <strong className="text-white">Synchroniser</strong> pour importer les ventes et achats.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 uppercase border-b border-surface-border bg-surface-card">
              <tr>
                <th className="px-4 py-3 text-left w-8"></th>
                <th className="px-4 py-3 text-left w-28">Date</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell w-24">Réf.</th>
                <th className="px-4 py-3 text-left">Libellé</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Type</th>
                <th className="px-4 py-3 text-right">Débit</th>
                <th className="px-4 py-3 text-right">Crédit</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const src         = SOURCE_LABELS[e.source] ?? SOURCE_LABELS.manual;
                const totalDebit  = e.lines?.reduce((s, l) => s + l.debit, 0) ?? 0;
                const totalCredit = e.lines?.reduce((s, l) => s + l.credit, 0) ?? 0;
                const isOpen      = expandedEntry === e.id;
                return (
                  <>
                    <tr key={e.id}
                      className={`border-b border-surface-border hover:bg-surface-hover cursor-pointer ${i % 2 === 0 ? '' : 'bg-surface-card/30'}`}
                      onClick={() => setExpandedEntry(isOpen ? null : e.id)}>
                      <td className="px-3 py-3 text-slate-500">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap font-mono text-xs">{e.entry_date}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs hidden sm:table-cell">{e.reference ?? '—'}</td>
                      <td className="px-4 py-3 text-white max-w-[200px] truncate">{e.description}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium ${src.color}`}>{src.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-white">{formatCurrency(totalDebit, currency)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-white">{formatCurrency(totalCredit, currency)}</td>
                      <td className="px-3 py-3">
                        {e.source === 'manual' && (
                          <button onClick={(ev) => { ev.stopPropagation(); onDeleteEntry(e.id); }}
                            className="p-1.5 text-slate-600 hover:text-red-400 rounded-lg hover:bg-red-900/20">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && e.lines?.map((line, li) => (
                      <tr key={li} className="bg-surface-input/50 border-b border-surface-border">
                        <td></td>
                        <td colSpan={2} className="px-4 py-2 font-mono text-xs text-brand-400">{line.account_code}</td>
                        <td className="px-4 py-2 text-xs text-slate-300 italic">{line.account_name}</td>
                        <td className="hidden md:table-cell"></td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-white">
                          {line.debit > 0 ? formatCurrency(line.debit, currency) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-white">
                          {line.credit > 0 ? formatCurrency(line.credit, currency) : ''}
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
