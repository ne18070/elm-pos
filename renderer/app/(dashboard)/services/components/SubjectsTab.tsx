'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, RefreshCw, Package2, Wrench, User, History,
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight,
  Trophy, Medal, Star, X, Gift, Check, AlertCircle,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import {
  getSubjectHistory, getOrdersByClientName,
  type ServiceOrder, type ServiceSubject,
} from '@services/supabase/service-orders';
import {
  redeemPoints, getClientLoyaltyHistory,
  type LoyaltyTransaction, type ClientLoyalty, type LoyaltyConfig,
} from '@services/supabase/loyalty';
import { useServiceSubjects } from '../hooks/useServiceSubjects';
import { useLoyalty } from '../hooks/useLoyalty';
import { subjectTypeCfg } from '../constants';
import { StatusBadge, OTNumber } from './StatusBadge';

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientEntry = {
  kind: 'client';
  name: string;
  phone: string | null;
  visits: number;
  paid_visits: number;
  total_spent: number;
  avg_spent: number;
  lastDate: string;
};

type SubjectEntry = {
  kind: 'subject';
  subject: ServiceSubject;
  visits: number;
  total_spent: number;
  lastDate: string;
};

type SelectedEntry = ClientEntry | SubjectEntry;
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 15;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30)  return `il y a ${days}j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)}mois`;
  return `il y a ${Math.floor(days / 365)}an`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SubjectTypePill({ type }: { type: string | null | undefined }) {
  const cfg = subjectTypeCfg(type);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-hover text-content-secondary border border-surface-border">
      {cfg.label}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <span className="inline-flex items-center gap-1 text-xs font-black text-yellow-600 bg-yellow-400/20 px-2 py-0.5 rounded-full">
      <Trophy className="w-3 h-3" /> 1
    </span>
  );
  if (rank === 2) return (
    <span className="inline-flex items-center gap-1 text-xs font-black text-slate-400 bg-slate-400/20 px-2 py-0.5 rounded-full">
      <Medal className="w-3 h-3" /> 2
    </span>
  );
  if (rank === 3) return (
    <span className="inline-flex items-center gap-1 text-xs font-black text-orange-500 bg-orange-400/20 px-2 py-0.5 rounded-full">
      <Medal className="w-3 h-3" /> 3
    </span>
  );
  return <span className="text-xs text-content-muted font-mono tabular-nums w-5 text-center inline-block">{rank}</span>;
}

function LoyaltyStars({ visits }: { visits: number }) {
  const filled = visits >= 10 ? 3 : visits >= 5 ? 2 : visits >= 2 ? 1 : 0;
  if (filled === 0) return null;
  return (
    <span className="inline-flex gap-0.5 ml-1.5 align-middle">
      {[0, 1, 2].map(i => (
        <Star key={i} className={cn('w-2.5 h-2.5', i < filled ? 'fill-yellow-400 text-yellow-400' : 'text-surface-border fill-surface-border')} />
      ))}
    </span>
  );
}

function SortTh({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: string; current: string; dir: SortDir; onSort: (k: string) => void;
}) {
  const active = current === sortKey;
  const Icon = active ? (dir === 'desc' ? ChevronDown : ChevronUp) : ChevronsUpDown;
  return (
    <th onClick={() => onSort(sortKey)}
      className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-content-muted cursor-pointer hover:text-content-primary select-none whitespace-nowrap">
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={cn('w-3 h-3', active ? 'text-content-brand' : 'opacity-40')} />
      </span>
    </th>
  );
}

// ── Loyalty redeem panel ──────────────────────────────────────────────────────

function LoyaltySection({
  businessId, clientName, clientPhone, loyalty, config, onSuccess,
}: {
  businessId: string;
  clientName: string;
  clientPhone: string | null;
  loyalty: ClientLoyalty | null;
  config: LoyaltyConfig | null;
  onSuccess: () => void;
}) {
  const [loyaltyTx,   setLoyaltyTx]   = useState<LoyaltyTransaction[]>([]);
  const [txLoading,   setTxLoading]   = useState(false);
  const [showRedeem,  setShowRedeem]  = useState(false);
  const [redeemPts,   setRedeemPts]   = useState('');
  const [redeeming,   setRedeeming]   = useState(false);
  const [feedback,    setFeedback]    = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setTxLoading(true);
    getClientLoyaltyHistory(businessId, clientName)
      .then(setLoyaltyTx)
      .catch(() => setLoyaltyTx([]))
      .finally(() => setTxLoading(false));
  }, [businessId, clientName]);

  const balance    = loyalty?.balance ?? 0;
  const minRedeem  = config?.min_redeem ?? 100;
  const pointValue = config?.point_value ?? 5;
  const canRedeem  = balance >= minRedeem;

  const maxPts   = balance;
  const inputPts = Math.min(Math.max(0, parseInt(redeemPts) || 0), maxPts);
  const cashVal  = inputPts * pointValue;

  async function handleRedeem() {
    if (!config || inputPts < minRedeem) return;
    setRedeeming(true);
    setFeedback(null);
    try {
      const { cashValue } = await redeemPoints(businessId, clientName, clientPhone, inputPts, config);
      setFeedback({ ok: true, msg: `${inputPts} pts échangés → remise de ${cashValue.toLocaleString('fr-FR')} CFA` });
      setShowRedeem(false);
      setRedeemPts('');
      onSuccess();
    } catch (e: any) {
      setFeedback({ ok: false, msg: e.message });
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="mt-4 border-t border-surface-border pt-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-content-muted flex items-center gap-1.5">
          <Gift className="w-3.5 h-3.5" /> Fidélité
        </p>
        {canRedeem && !showRedeem && (
          <button
            onClick={() => { setShowRedeem(true); setFeedback(null); }}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-brand-500/10 text-content-brand hover:bg-brand-500/20 transition-colors"
          >
            Échanger
          </button>
        )}
      </div>

      {/* Balance pill */}
      <div className="flex items-center gap-2 mb-3">
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl flex-1',
          balance > 0 ? 'bg-yellow-400/10 border border-yellow-400/30' : 'bg-surface-hover border border-surface-border'
        )}>
          <Star className={cn('w-4 h-4 shrink-0', balance > 0 ? 'fill-yellow-400 text-yellow-400' : 'text-content-muted')} />
          <div>
            <p className={cn('text-sm font-black tabular-nums', balance > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-content-muted')}>
              {balance} pt{balance > 1 ? 's' : ''}
            </p>
            <p className="text-[10px] text-content-muted">
              {balance > 0
                ? `≈ ${(balance * pointValue).toLocaleString('fr-FR')} CFA · expire déc.`
                : 'Aucun point'}
            </p>
          </div>
        </div>
        {!canRedeem && balance > 0 && (
          <p className="text-[10px] text-content-muted text-right flex-1">
            Encore {minRedeem - balance} pts<br />pour échanger
          </p>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={cn(
          'flex items-start gap-2 text-xs px-3 py-2 rounded-xl mb-3',
          feedback.ok ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-500'
        )}>
          {feedback.ok ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          {feedback.msg}
        </div>
      )}

      {/* Redeem form */}
      {showRedeem && (
        <div className="bg-surface-input border border-surface-border rounded-xl p-3 mb-3 space-y-2">
          <p className="text-xs font-semibold text-content-primary">Nombre de points à échanger</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={minRedeem}
              max={maxPts}
              value={redeemPts}
              onChange={e => setRedeemPts(e.target.value)}
              placeholder={`${minRedeem} min`}
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface-card border border-surface-border text-sm text-content-primary"
            />
            <button
              onClick={() => setRedeemPts(String(maxPts))}
              className="text-[10px] px-2 py-1.5 rounded-lg bg-surface-hover text-content-secondary hover:text-content-primary border border-surface-border"
            >
              Max
            </button>
          </div>
          {inputPts >= minRedeem && (
            <p className="text-xs text-content-secondary">
              {inputPts} pts → <span className="font-bold text-green-500">{cashVal.toLocaleString('fr-FR')} CFA</span> de remise
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setShowRedeem(false); setRedeemPts(''); }}
              className="flex-1 py-1.5 rounded-lg text-xs text-content-secondary hover:bg-surface-hover border border-surface-border"
            >
              Annuler
            </button>
            <button
              onClick={handleRedeem}
              disabled={redeeming || inputPts < minRedeem}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {redeeming ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Confirmer'}
            </button>
          </div>
        </div>
      )}

      {/* Points transaction history */}
      <p className="text-[10px] text-content-muted uppercase tracking-wider font-semibold mb-1.5">Historique points</p>
      {txLoading ? (
        <div className="flex justify-center py-3">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-content-muted" />
        </div>
      ) : loyaltyTx.length === 0 ? (
        <p className="text-xs text-content-muted">Aucune transaction</p>
      ) : (
        <div className="space-y-1">
          {loyaltyTx.slice(0, 8).map(tx => (
            <div key={tx.id} className="flex items-center justify-between text-xs">
              <span className="text-content-secondary truncate flex-1 mr-2">{tx.note ?? tx.type}</span>
              <span className={cn('font-bold tabular-nums shrink-0', tx.points > 0 ? 'text-yellow-500' : 'text-red-400')}>
                {tx.points > 0 ? '+' : ''}{tx.points} pts
              </span>
            </div>
          ))}
          {loyaltyTx.length > 8 && (
            <p className="text-[10px] text-content-muted text-center">+{loyaltyTx.length - 8} autres</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── History panel ─────────────────────────────────────────────────────────────

function HistoryPanel({
  businessId, selected, history, histLoading, currency, onClose,
  loyalty, config, onLoyaltyChange,
}: {
  businessId: string;
  selected: SelectedEntry;
  history: ServiceOrder[];
  histLoading: boolean;
  currency: string;
  onClose: () => void;
  loyalty: ClientLoyalty | null;
  config: LoyaltyConfig | null;
  onLoyaltyChange: () => void;
}) {
  return (
    <div className="w-80 shrink-0 flex flex-col min-h-0 border-l border-surface-border pl-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          {selected.kind === 'subject' ? (
            <>
              <div className="mb-1"><SubjectTypePill type={selected.subject.type_sujet} /></div>
              <h3 className="font-bold text-content-primary font-mono truncate">{selected.subject.reference}</h3>
              {selected.subject.designation && (
                <p className="text-sm text-content-secondary truncate">{selected.subject.designation}</p>
              )}
            </>
          ) : (
            <>
              <h3 className="font-bold text-content-primary truncate">{selected.name}</h3>
              {selected.phone && <p className="text-sm text-content-secondary">{selected.phone}</p>}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs font-black text-content-brand bg-brand-500/10 px-2 py-0.5 rounded-full">
                  {selected.visits} visite{selected.visits > 1 ? 's' : ''}
                </span>
                {selected.total_spent > 0 && (
                  <span className="text-xs font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                    {formatCurrency(selected.total_spent, currency)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        <button onClick={onClose} className="p-1 ml-2 shrink-0 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-hover">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
        {/* Order history */}
        <div>
          <p className="text-[10px] text-content-secondary font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <History className="w-3.5 h-3.5" /> Historique {!histLoading && `(${history.length})`}
          </p>
          {histLoading ? (
            <div className="flex items-center justify-center py-6 text-content-secondary">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Chargement…
            </div>
          ) : history.length === 0 ? (
            <p className="text-content-secondary text-sm">Aucun historique</p>
          ) : (
            <div className="space-y-2">
              {history.map(o => (
                <div key={o.id} className="rounded-xl border border-surface-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <OTNumber n={o.order_number} />
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-xs text-content-secondary">{fmtDate(o.created_at)}</p>
                  <p className="text-sm font-semibold text-content-primary mt-1">{formatCurrency(o.total, currency)}</p>
                  {(o.items ?? []).slice(0, 3).map(i => (
                    <p key={i.id} className="text-xs text-content-secondary">· {i.name}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Loyalty section — clients only */}
        {selected.kind === 'client' && (
          <LoyaltySection
            businessId={businessId}
            clientName={selected.name}
            clientPhone={selected.phone}
            loyalty={loyalty}
            config={config}
            onSuccess={onLoyaltyChange}
          />
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SubjectsTab({ businessId, currency }: { businessId: string; currency: string }) {
  const { subjects, summary, loading, refresh } = useServiceSubjects(businessId);
  const { config: loyaltyConfig, balances: loyaltyBalances, refresh: refreshLoyalty } = useLoyalty(businessId);

  const [tab,           setTab]           = useState<'clients' | 'subjects'>('clients');
  const [search,        setSearch]        = useState('');
  const [page,          setPage]          = useState(1);
  const [sortKey,       setSortKey]       = useState<string>('total_spent');
  const [sortDir,       setSortDir]       = useState<SortDir>('desc');
  const [selected,      setSelected]      = useState<SelectedEntry | null>(null);
  const [history,       setHistory]       = useState<ServiceOrder[]>([]);
  const [histLoading,   setHistLoading]   = useState(false);

  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    setHistLoading(true);
    const p = selected.kind === 'subject'
      ? getSubjectHistory(businessId, selected.subject.id)
      : getOrdersByClientName(businessId, selected.name);
    p.then(setHistory).catch(() => setHistory([])).finally(() => setHistLoading(false));
  }, [selected, businessId]);

  useEffect(() => { setPage(1); }, [search, tab, sortKey, sortDir]);

  // ── Build entries ─────────────────────────────────────────────────────────────

  const clientEntries = useMemo<ClientEntry[]>(() => {
    const map = new Map<string, ClientEntry>();
    for (const o of summary) {
      if (!o.client_name) continue;
      const key = o.client_name.toLowerCase().trim();
      let e = map.get(key);
      if (!e) {
        e = { kind: 'client', name: o.client_name, phone: o.client_phone ?? null, visits: 0, paid_visits: 0, total_spent: 0, avg_spent: 0, lastDate: o.created_at };
        map.set(key, e);
      }
      e.visits++;
      if (o.status === 'paye') { e.paid_visits++; e.total_spent += o.total; }
      if (o.created_at > e.lastDate) e.lastDate = o.created_at;
    }
    for (const e of map.values()) {
      e.avg_spent = e.paid_visits > 0 ? e.total_spent / e.paid_visits : 0;
    }
    return Array.from(map.values());
  }, [summary]);

  const subjectEntries = useMemo<SubjectEntry[]>(() => {
    return subjects.map(s => {
      const orders = summary.filter(o => o.subject_id === s.id);
      const total_spent = orders.filter(o => o.status === 'paye').reduce((a, o) => a + o.total, 0);
      const dates = orders.map(o => o.created_at).sort();
      return { kind: 'subject' as const, subject: s, visits: orders.length, total_spent, lastDate: dates[dates.length - 1] ?? s.created_at };
    });
  }, [subjects, summary]);

  const clientRank = useMemo(() => {
    const sorted = [...clientEntries].sort((a, b) => b.total_spent - a.total_spent);
    return new Map(sorted.map((e, i) => [e.name.toLowerCase().trim(), i + 1]));
  }, [clientEntries]);

  // ── Sort ──────────────────────────────────────────────────────────────────────

  function handleSort(key: string) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function sortRows<T extends Record<string, any>>(rows: T[], key: string, dir: SortDir): T[] {
    return [...rows].sort((a, b) => {
      const va = key === 'lastDate' ? new Date(a.lastDate).getTime() : (a[key] ?? 0);
      const vb = key === 'lastDate' ? new Date(b.lastDate).getTime() : (b[key] ?? 0);
      return dir === 'desc' ? vb - va : va - vb;
    });
  }

  // ── Filter + sort ─────────────────────────────────────────────────────────────

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase();
    return sortRows(
      clientEntries.filter(e => !q || e.name.toLowerCase().includes(q) || (e.phone ?? '').includes(q)),
      sortKey, sortDir
    );
  }, [clientEntries, search, sortKey, sortDir]);

  const filteredSubjects = useMemo(() => {
    const q = search.toLowerCase();
    return sortRows(
      subjectEntries.filter(e => !q || e.subject.reference.toLowerCase().includes(q) || (e.subject.designation ?? '').toLowerCase().includes(q)),
      sortKey, sortDir
    );
  }, [subjectEntries, search, sortKey, sortDir]);

  const allRows    = tab === 'clients' ? filteredClients : filteredSubjects;
  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const paged      = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Selection helpers ─────────────────────────────────────────────────────────

  function entryKey(e: SelectedEntry) {
    return e.kind === 'subject' ? `s-${e.subject.id}` : `c-${e.name}`;
  }
  function isSelected(e: SelectedEntry) {
    return !!selected && entryKey(e) === entryKey(selected);
  }
  function toggleSelect(e: SelectedEntry) {
    setSelected(prev => (prev && entryKey(prev) === entryKey(e) ? null : e));
  }

  // ── Current loyalty data for selected client ──────────────────────────────────

  const selectedLoyalty = selected?.kind === 'client'
    ? loyaltyBalances.get(selected.name.toLowerCase().trim()) ?? null
    : null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-5 h-full min-h-0">

      {/* ── Main list ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex rounded-xl border border-surface-border bg-surface-input p-0.5 shrink-0">
            {([['clients', 'Clients', User, clientEntries.length], ['subjects', 'Sujets', Wrench, subjectEntries.length]] as const).map(([val, lbl, Icon, count]) => (
              <button key={val} onClick={() => { setTab(val); setSortKey('total_spent'); setSortDir('desc'); }}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  tab === val ? 'bg-surface-card text-content-primary shadow-sm' : 'text-content-muted hover:text-content-secondary')}>
                <Icon className="w-3.5 h-3.5" />
                {lbl}
                <span className="text-[10px] font-mono bg-surface-hover text-content-muted rounded-full px-1.5 py-0.5 ml-0.5">{count}</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'clients' ? 'Nom, téléphone…' : 'Référence, désignation…'}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm" />
          </div>
          <button onClick={refresh} className="p-2 rounded-xl hover:bg-surface-hover text-content-secondary border border-surface-border shrink-0">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>

        {/* Table */}
        {loading && allRows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-content-secondary">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement…
          </div>
        ) : paged.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-content-secondary gap-2">
            <Package2 className="w-10 h-10 opacity-30" />
            <p className="text-sm">Aucun résultat</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex-1 overflow-auto rounded-xl border border-surface-border">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-surface-card z-10 border-b border-surface-border">
                  <tr>
                    {tab === 'clients' ? (
                      <>
                        <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-content-muted w-12">#</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-content-muted">Client</th>
                        <SortTh label="Visites"       sortKey="visits"      current={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortTh label="CA Total"      sortKey="total_spent" current={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortTh label="Moy./visite"   sortKey="avg_spent"   current={sortKey} dir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-content-muted">
                          <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400" />Pts</span>
                        </th>
                        <SortTh label="Dernière visite" sortKey="lastDate"  current={sortKey} dir={sortDir} onSort={handleSort} />
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-content-muted">Type</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-content-muted">Référence</th>
                        <SortTh label="OT"       sortKey="visits"      current={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortTh label="CA Total" sortKey="total_spent" current={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortTh label="Dernière intervention" sortKey="lastDate" current={sortKey} dir={sortDir} onSort={handleSort} />
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/60">
                  {tab === 'clients'
                    ? (paged as ClientEntry[]).map(e => {
                        const rank    = clientRank.get(e.name.toLowerCase().trim()) ?? 99;
                        const sel     = isSelected(e);
                        const loyalty = loyaltyBalances.get(e.name.toLowerCase().trim());
                        const pts     = loyalty?.balance ?? 0;
                        return (
                          <tr key={e.name} onClick={() => toggleSelect(e)}
                            className={cn('cursor-pointer transition-colors', sel ? 'bg-brand-500/10' : 'hover:bg-surface-hover')}>
                            <td className="px-3 py-3"><RankBadge rank={rank} /></td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black',
                                  sel ? 'bg-brand-500/20 text-content-brand' : 'bg-surface-hover text-content-secondary')}>
                                  {e.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-content-primary leading-tight">{e.name}</p>
                                  {e.phone && <p className="text-[11px] text-content-muted">{e.phone}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className="font-semibold text-content-primary">{e.visits}</span>
                              <LoyaltyStars visits={e.visits} />
                            </td>
                            <td className="px-3 py-3">
                              <span className={cn('font-bold', e.total_spent > 0 ? 'text-green-500' : 'text-content-muted')}>
                                {e.total_spent > 0 ? formatCurrency(e.total_spent, currency) : '–'}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-content-secondary tabular-nums">
                              {e.avg_spent > 0 ? formatCurrency(e.avg_spent, currency) : '–'}
                            </td>
                            <td className="px-3 py-3">
                              {pts > 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                                  <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                                  {pts}
                                </span>
                              ) : (
                                <span className="text-content-muted text-xs">–</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-content-primary text-xs">{fmtDate(e.lastDate)}</p>
                              <p className="text-[10px] text-content-muted">{fmtRelDate(e.lastDate)}</p>
                            </td>
                          </tr>
                        );
                      })
                    : (paged as SubjectEntry[]).map(e => {
                        const sel = isSelected(e);
                        return (
                          <tr key={e.subject.id} onClick={() => toggleSelect(e)}
                            className={cn('cursor-pointer transition-colors', sel ? 'bg-brand-500/10' : 'hover:bg-surface-hover')}>
                            <td className="px-3 py-3"><SubjectTypePill type={e.subject.type_sujet} /></td>
                            <td className="px-3 py-3">
                              <p className="font-mono font-bold text-content-primary">{e.subject.reference}</p>
                              {e.subject.designation && <p className="text-xs text-content-secondary">{e.subject.designation}</p>}
                            </td>
                            <td className="px-3 py-3 font-semibold text-content-primary">{e.visits}</td>
                            <td className="px-3 py-3">
                              <span className={cn('font-bold', e.total_spent > 0 ? 'text-green-500' : 'text-content-muted')}>
                                {e.total_spent > 0 ? formatCurrency(e.total_spent, currency) : '–'}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-content-primary text-xs">{fmtDate(e.lastDate)}</p>
                              <p className="text-[10px] text-content-muted">{fmtRelDate(e.lastDate)}</p>
                            </td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-content-secondary shrink-0">
                <span>{allRows.length} résultat{allRows.length > 1 ? 's' : ''} · page {page}/{totalPages}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                    const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={cn('w-7 h-7 rounded-lg text-xs font-semibold transition-colors',
                          page === p ? 'bg-brand-500 text-white' : 'hover:bg-surface-hover')}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── History + loyalty panel ────────────────────────────────────────────── */}
      {selected && (
        <HistoryPanel
          businessId={businessId}
          selected={selected}
          history={history}
          histLoading={histLoading}
          currency={currency}
          onClose={() => setSelected(null)}
          loyalty={selectedLoyalty}
          config={loyaltyConfig}
          onLoyaltyChange={refreshLoyalty}
        />
      )}

    </div>
  );
}
