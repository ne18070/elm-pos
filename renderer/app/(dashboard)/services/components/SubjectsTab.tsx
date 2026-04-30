import React, { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, Package2, Wrench, User, History } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { 
  getSubjectHistory, 
  getOrdersByClientName, 
  type ServiceOrder, 
  type ServiceSubject 
} from '@services/supabase/service-orders';
import { useServiceSubjects } from '../hooks/useServiceSubjects';
import { subjectTypeCfg } from '../constants';
import { StatusBadge, OTNumber } from './StatusBadge';

function SubjectTypePill({ type }: { type: string | null | undefined }) {
  const cfg = subjectTypeCfg(type);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-hover text-content-secondary border border-surface-border">
      {cfg.label}
    </span>
  );
}

type HistoryEntry =
  | { kind: 'subject'; subject: ServiceSubject; count: number }
  | { kind: 'client'; name: string; phone: string | null; count: number; lastDate: string };

export function SubjectsTab({ businessId, currency }: { businessId: string; currency: string }) {
  const { subjects, summary, loading, refresh } = useServiceSubjects(businessId);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [history, setHistory] = useState<ServiceOrder[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    setHistLoading(true);
    const p = selected.kind === 'subject'
      ? getSubjectHistory(businessId, selected.subject.id)
      : getOrdersByClientName(businessId, selected.name);
    p.then(setHistory).catch(() => setHistory([])).finally(() => setHistLoading(false));
  }, [selected, businessId]);

  // Entrées unifiées : sujets + clients (ordres sans sujet groupés par client_name)
  const entries = useMemo<HistoryEntry[]>(() => {
    const subjectEntries: HistoryEntry[] = subjects.map(s => ({
      kind: 'subject',
      subject: s,
      count: summary.filter(o => o.subject_id === s.id).length,
    }));

    const clientMap = new Map<string, { name: string; phone: string | null; count: number; lastDate: string }>();
    for (const o of summary) {
      if (o.subject_id || !o.client_name) continue;
      const key = o.client_name.toLowerCase().trim();
      const existing = clientMap.get(key);
      if (!existing) {
        clientMap.set(key, { name: o.client_name, phone: o.client_phone ?? null, count: 1, lastDate: o.created_at });
      } else {
        existing.count++;
        if (o.created_at > existing.lastDate) existing.lastDate = o.created_at;
      }
    }
    const clientEntries: HistoryEntry[] = Array.from(clientMap.values()).map(v => ({
      kind: 'client' as const,
      name: v.name,
      phone: v.phone,
      count: v.count,
      lastDate: v.lastDate,
    }));

    return [...subjectEntries, ...clientEntries];
  }, [subjects, summary]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return entries;
    return entries.filter(e => {
      if (e.kind === 'subject') {
        return e.subject.reference.toLowerCase().includes(q) ||
               (e.subject.designation ?? '').toLowerCase().includes(q) ||
               e.subject.type_sujet.toLowerCase().includes(q);
      }
      return e.name.toLowerCase().includes(q) || (e.phone ?? '').includes(q);
    });
  }, [entries, search]);

  const selKey = selected
    ? selected.kind === 'subject' ? `s-${selected.subject.id}` : `c-${selected.name}`
    : null;

  return (
    <div className="flex gap-5 h-full">

      {/* ── Liste gauche ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="relative mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par référence, client…"
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
          </div>
          <button onClick={refresh} className="p-2 rounded-xl hover:bg-surface-hover text-content-secondary border border-surface-border">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>

        {loading && entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-content-secondary">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-content-secondary gap-2">
            <Package2 className="w-10 h-10 opacity-30" />
            <p className="text-sm">Aucun résultat</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {/* Sujets (véhicules, appareils…) */}
            {filtered.some(e => e.kind === 'subject') && (
              <p className="text-xs font-bold text-content-secondary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" />Sujets suivis
              </p>
            )}
            {filtered.filter(e => e.kind === 'subject').map(e => {
              if (e.kind !== 'subject') return null;
              const key = `s-${e.subject.id}`;
              return (
                <button key={key} onClick={() => setSelected(selKey === key ? null : e)}
                  className={cn('w-full text-left rounded-xl border p-3 transition-colors',
                    selKey === key ? 'bg-brand-500/10 border-brand-500/30 text-content-brand' : 'border-surface-border hover:bg-surface-hover text-content-primary')}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <SubjectTypePill type={e.subject.type_sujet} />
                    <p className="font-mono font-bold text-sm flex-1 truncate">{e.subject.reference}</p>
                    <span className="text-xs text-content-secondary">{e.count} OT</span>
                  </div>
                  {e.subject.designation && <p className="text-xs text-content-secondary truncate">{e.subject.designation}</p>}
                </button>
              );
            })}

            {/* Clients (ordres sans sujet) */}
            {filtered.some(e => e.kind === 'client') && (
              <p className={cn('text-xs font-bold text-content-secondary uppercase tracking-widest mb-2 flex items-center gap-1.5',
                filtered.some(e => e.kind === 'subject') && 'mt-4')}>
                <User className="w-3.5 h-3.5" />Clients
              </p>
            )}
            {filtered.filter(e => e.kind === 'client').map(e => {
              if (e.kind !== 'client') return null;
              const key = `c-${e.name}`;
              return (
                <button key={key} onClick={() => setSelected(selKey === key ? null : e)}
                  className={cn('w-full text-left rounded-xl border p-3 transition-colors',
                    selKey === key ? 'bg-brand-500/10 border-brand-500/30 text-content-brand' : 'border-surface-border hover:bg-surface-hover text-content-primary')}>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-content-secondary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{e.name}</p>
                      {e.phone && <p className="text-xs text-content-secondary">{e.phone}</p>}
                    </div>
                    <span className="text-xs text-content-secondary flex-shrink-0">{e.count} OT</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Panneau historique droite ── */}
      {selected && (
        <div className="w-80 flex flex-col min-h-0 border-l border-surface-border pl-5">
          <div className="mb-4">
            {selected.kind === 'subject' ? (
              <>
                <div className="flex items-center gap-2 mb-1"><SubjectTypePill type={selected.subject.type_sujet} /></div>
                <h3 className="font-bold text-content-primary font-mono">{selected.subject.reference}</h3>
                {selected.subject.designation && <p className="text-sm text-content-secondary">{selected.subject.designation}</p>}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1"><User className="w-4 h-4 text-content-secondary" /></div>
                <h3 className="font-bold text-content-primary">{selected.name}</h3>
                {selected.phone && <p className="text-sm text-content-secondary">{selected.phone}</p>}
              </>
            )}
          </div>

          <p className="text-xs text-content-secondary font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <History className="w-3.5 h-3.5" />Historique
            {!histLoading && <span>({history.length})</span>}
          </p>

          {histLoading ? (
            <div className="flex items-center justify-center py-8 text-content-secondary">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />Chargement…
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2">
              {history.length === 0 ? (
                <p className="text-content-secondary text-sm">Aucun historique</p>
              ) : history.map(o => (
                <div key={o.id} className="rounded-xl border border-surface-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <OTNumber n={o.order_number} />
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-xs text-content-secondary">{new Date(o.created_at).toLocaleDateString('fr-FR')}</p>
                  <p className="text-sm font-semibold text-content-primary mt-1">{formatCurrency(o.total, currency)}</p>
                  {(o.items ?? []).slice(0, 3).map(i => (
                    <p key={i.id} className="text-xs text-content-secondary">· {i.name}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
