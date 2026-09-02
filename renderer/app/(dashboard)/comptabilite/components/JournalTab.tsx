'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, BookOpen, ChevronLeft, Copy, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { getJournalPage, getJournalDuplicateGroups } from '@services/supabase/accounting';
import type { JournalEntry } from '@services/supabase/accounting';
import { useNotificationStore } from '@/store/notifications';
import { SOURCE_LABELS } from './accounting-constants';

interface Props {
  from?:        string;
  to?:          string;
  currency:     string | undefined;
  canDelete:    boolean;
  reloadToken:  number;                 // bump ⇒ recharge (après sync / import / suppression)
  onNewEntry:   () => void;
  onDelete:     (ids: string[]) => void | Promise<void>;
}

const PAGE_SIZE = 25;

export function JournalTab({ from, to, currency, canDelete, reloadToken, onNewEntry, onDelete }: Props) {
  const { error: notifErr } = useNotificationStore();

  const [page, setPage]       = useState(1);
  const [rows, setRows]       = useState<JournalEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  const [dupeGroups, setDupeGroups] = useState<string[][]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pageCount   = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  // Nouvelle période ⇒ page 1 + sélection vidée
  useEffect(() => { setPage(1); setSelected(new Set()); }, [from, to]);

  // Page courante
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJournalPage({ from, to, limit: PAGE_SIZE, offset: (currentPage - 1) * PAGE_SIZE })
      .then((r) => { if (!cancelled) { setRows(r.rows); setTotal(r.total); } })
      .catch((e) => { if (!cancelled) notifErr(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, currentPage, reloadToken, notifErr]);

  // Groupes de doublons (toute la période)
  useEffect(() => {
    let cancelled = false;
    getJournalDuplicateGroups(from, to)
      .then((g) => { if (!cancelled) setDupeGroups(g); })
      .catch(() => { if (!cancelled) setDupeGroups([]); });
    return () => { cancelled = true; };
  }, [from, to, reloadToken]);

  const { keeperSet, excessSet, excessIds, dupTotal } = useMemo(() => {
    const keeper = new Set<string>();
    const excess = new Set<string>();
    const exIds: string[] = [];
    let n = 0;
    for (const g of dupeGroups) {
      if (g.length < 2) continue;
      n += g.length;
      keeper.add(g[0]);
      for (let i = 1; i < g.length; i++) { excess.add(g[i]); exIds.push(g[i]); }
    }
    return { keeperSet: keeper, excessSet: excess, excessIds: exIds, dupTotal: n };
  }, [dupeGroups]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allPageSelected = rows.length > 0 && rows.every((e) => selected.has(e.id));
  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) rows.forEach((e) => next.delete(e.id));
      else rows.forEach((e) => next.add(e.id));
      return next;
    });
  }
  const selectDuplicates = useCallback(() => setSelected(new Set(excessIds)), [excessIds]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-content-secondary">
          {loading ? 'Chargement… ' : ''}
          {total} écriture{total !== 1 ? 's' : ''}
          {dupTotal > 0 && (
            <span className="ml-2 text-status-warning">
              · {dupTotal} en doublon (réf. + date + montant + libellé) · {excessIds.length} en trop
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {canDelete && excessIds.length > 0 && (
            <button
              onClick={selectDuplicates}
              title="Sélectionne les copies en trop en gardant 1 écriture par groupe réf. + date + montant + libellé"
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Copy className="w-4 h-4" /> Sélectionner les doublons (garde 1)
            </button>
          )}
          <button onClick={onNewEntry} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouvelle écriture
          </button>
        </div>
      </div>

      {canDelete && selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-badge-warning border border-status-warning">
          <span className="text-sm text-status-warning font-medium">{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="btn-secondary text-sm px-3 py-1">Annuler</button>
            <button
              onClick={() => onDelete([...selected])}
              className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-lg bg-status-error text-white hover:opacity-90"
            >
              <Trash2 className="w-3.5 h-3.5" /> Supprimer ({selected.size})
            </button>
          </div>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="card p-8 text-center text-content-secondary text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement du journal…
        </div>
      ) : total === 0 ? (
        <div className="card p-8 text-center">
          <BookOpen className="w-10 h-10 text-content-muted mx-auto mb-2" />
          <p className="text-content-secondary text-sm">Journal vide pour cette période.</p>
          <p className="text-content-primary text-xs mt-1">Cliquez sur <strong className="text-content-primary">Synchroniser</strong> pour importer les ventes et achats.</p>
        </div>
      ) : (
        <div className={`card overflow-hidden ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="text-xs text-content-secondary uppercase border-b border-surface-border bg-surface-card">
              <tr>
                {canDelete && (
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-brand-500 align-middle"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = !allPageSelected && rows.some((e) => selected.has(e.id)); }}
                      onChange={togglePage}
                    />
                  </th>
                )}
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
              {rows.map((e, i) => {
                const src         = SOURCE_LABELS[e.source] ?? SOURCE_LABELS.manual;
                const totalDebit  = e.lines?.reduce((s, l) => s + l.debit, 0) ?? 0;
                const totalCredit = e.lines?.reduce((s, l) => s + l.credit, 0) ?? 0;
                const isOpen      = expandedId === e.id;
                const isExcess    = excessSet.has(e.id);
                const isKeeper    = keeperSet.has(e.id);
                const checked     = selected.has(e.id);
                return (
                  <React.Fragment key={e.id}>
                    <tr
                      className={`border-b border-surface-border hover:bg-surface-hover cursor-pointer
                        ${isExcess ? 'bg-amber-500/10 border-l-2 border-l-amber-500'
                          : isKeeper ? 'border-l-2 border-l-emerald-500'
                          : i % 2 === 0 ? '' : 'bg-surface-card/30'}
                        ${checked ? 'ring-1 ring-inset ring-brand-500/60' : ''}`}
                      onClick={() => setExpandedId(isOpen ? null : e.id)}>
                      {canDelete && (
                        <td className="px-3 py-3" onClick={(ev) => ev.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded accent-brand-500 align-middle"
                            checked={checked}
                            onChange={() => toggle(e.id)}
                          />
                        </td>
                      )}
                      <td className="px-3 py-3 text-content-primary">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 text-content-secondary whitespace-nowrap font-mono text-xs">{e.entry_date}</td>
                      <td className="px-4 py-3 text-content-primary font-mono text-xs hidden sm:table-cell">{e.reference ?? '—'}</td>
                      <td className="px-4 py-3 text-content-primary max-w-[240px]">
                        <span className="truncate inline-block max-w-full align-bottom">{e.description}</span>
                        {isKeeper && (
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 whitespace-nowrap">conservé</span>
                        )}
                        {isExcess && (
                          <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 whitespace-nowrap">doublon</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-md border font-semibold bg-opacity-100 ${src.color}`}>
                          {src.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-content-primary">{formatCurrency(totalDebit, currency)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-content-primary">{formatCurrency(totalCredit, currency)}</td>
                      <td className="px-3 py-3">
                        {canDelete && (
                          <button onClick={(ev) => { ev.stopPropagation(); onDelete([e.id]); }}
                            className="p-1.5 text-content-muted hover:text-status-error rounded-lg hover:bg-badge-error">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && e.lines?.map((line) => (
                      <tr key={line.id ?? line.account_code} className="bg-surface-input/50 border-b border-surface-border">
                        {canDelete && <td></td>}
                        <td></td>
                        <td colSpan={2} className="px-4 py-2 font-mono text-xs text-content-brand">{line.account_code}</td>
                        <td className="px-4 py-2 text-xs text-content-primary italic">{line.account_name}</td>
                        <td className="hidden md:table-cell"></td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-content-primary">
                          {line.debit > 0 ? formatCurrency(line.debit, currency) : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-content-primary">
                          {line.credit > 0 ? formatCurrency(line.credit, currency) : ''}
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-content-secondary">
            Page {currentPage} / {pageCount} · {total} écritures
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || loading}
              className="btn-secondary flex items-center gap-1 text-sm px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Précédent</span>
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount || loading}
              className="btn-secondary flex items-center gap-1 text-sm px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Suivant</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
