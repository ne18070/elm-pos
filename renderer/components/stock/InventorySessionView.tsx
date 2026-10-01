'use client';
import { toUserError } from '@/lib/user-error';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ScanLine, Minus, Plus, CheckCircle2, Loader2, RefreshCw, Download, X, RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { useProducts } from '@/hooks/useProducts';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { formatCurrency, cn } from '@/lib/utils';
import {
  getInventoryLines, setInventoryCount, validateInventorySession, cancelInventorySession,
  INVENTORY_REASONS,
} from '@services/supabase/inventory';
import type { InventorySession, InventoryCountLine } from '@services/supabase/inventory';
import type { Product } from '@pos-types';

type Filter = 'all' | 'todo' | 'gaps';

interface Draft { qty: string; reason: string }

const SAVE_DELAY_MS = 500;
const MAX_ROWS = 200;

function parseQty(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const fmtQty = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });

function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

interface Props {
  session: InventorySession;
  categoryName?: string;
  onBack: () => void;
  onChanged: () => void;
}

export function InventorySessionView({ session, categoryName, onBack, onChanged }: Props) {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const can = useCan();
  const { askConfirm, ConfirmDialog } = useConfirm();
  const showCost = can('view_financials');
  const canValidate = can('validate_inventaire');
  const isOpen = session.status === 'open';
  const currency = business?.currency;

  const { products, loading: loadingProducts } = useProducts(business?.id ?? '');
  const [lines, setLines] = useState<Record<string, InventoryCountLine>>({});
  const [drafts, setDraftsState] = useState<Record<string, Draft>>({});
  // Miroir synchrone : deux scans rapprochés lisent toujours la dernière valeur
  const draftsRef = useRef<Record<string, Draft>>({});
  const setDrafts = useCallback((next: Record<string, Draft>) => {
    draftsRef.current = next;
    setDraftsState(next);
  }, []);
  const [loadingLines, setLoadingLines] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scanRef = useRef<HTMLInputElement>(null);

  const loadLines = useCallback(async () => {
    setLoadingLines(true);
    try {
      const rows = await getInventoryLines(session.id);
      const byProduct: Record<string, InventoryCountLine> = {};
      const d: Record<string, Draft> = {};
      for (const l of rows) {
        byProduct[l.product_id] = l;
        d[l.product_id] = { qty: String(Number(l.counted_qty)), reason: l.reason ?? '' };
      }
      setLines(byProduct);
      setDrafts(d);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoadingLines(false);
    }
  }, [session.id, notifError, setDrafts]);

  useEffect(() => { loadLines(); }, [loadLines]);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  // Produits du périmètre : suivi de stock actif (+ catégorie si l'inventaire est ciblé).
  // Pour un inventaire clos, on montre aussi les produits comptés devenus hors périmètre.
  const scope = useMemo(() => {
    return products.filter((p) =>
      (p.track_stock && (!session.category_id || p.category_id === session.category_id)) ||
      !!lines[p.id],
    );
  }, [products, session.category_id, lines]);

  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  // ─── Sauvegarde (debounce par produit) ─────────────────────────────────────

  const save = useCallback(async (productId: string, draft: Draft | null) => {
    setPending((s) => new Set(s).add(productId));
    try {
      const qty = draft ? parseQty(draft.qty) : null;
      if (qty !== null && Number.isNaN(qty)) return;
      const line = await setInventoryCount(session.id, productId, qty, draft?.reason || null);
      setLines((prev) => {
        const next = { ...prev };
        if (line) next[productId] = line; else delete next[productId];
        return next;
      });
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(productId); return n; });
    }
  }, [session.id, notifError]);

  function scheduleSave(productId: string, draft: Draft | null) {
    clearTimeout(timers.current[productId]);
    setPending((s) => new Set(s).add(productId));
    timers.current[productId] = setTimeout(() => {
      delete timers.current[productId];
      save(productId, draft);
    }, SAVE_DELAY_MS);
  }

  function setDraft(productId: string, patch: Partial<Draft>) {
    const cur = draftsRef.current[productId] ?? { qty: '', reason: '' };
    const next = { ...cur, ...patch };
    setDrafts({ ...draftsRef.current, [productId]: next });
    scheduleSave(productId, next.qty.trim() === '' ? null : next);
  }

  function increment(productId: string, by: number) {
    const cur = parseQty(draftsRef.current[productId]?.qty ?? '');
    const base = cur === null || Number.isNaN(cur) ? 0 : cur;
    setDraft(productId, { qty: String(Math.max(0, base + by)) });
  }

  function resetLine(productId: string) {
    const n = { ...draftsRef.current };
    delete n[productId];
    setDrafts(n);
    scheduleSave(productId, null);
  }

  // ─── Scan / recherche ──────────────────────────────────────────────────────

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = search.trim();
    if (!code || !isOpen) return;
    const lc = code.toLowerCase();
    const match =
      scope.find((p) => (p.barcode ?? '').toLowerCase() === lc || (p.sku ?? '').toLowerCase() === lc) ??
      (visible.length === 1 ? visible[0] : undefined);
    if (!match) {
      if (visible.length === 0) notifError(`Aucun produit suivi pour « ${code} ».`);
      return; // plusieurs résultats : la liste reste filtrée
    }
    increment(match.id, 1);
    setFlashId(match.id);
    setSearch('');
    setTimeout(() => {
      document.getElementById(`inv-row-${match.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 30);
    setTimeout(() => setFlashId((f) => (f === match.id ? null : f)), 1200);
    scanRef.current?.focus();
  }

  // ─── Calculs ───────────────────────────────────────────────────────────────

  function rowInfo(p: Product) {
    const line = lines[p.id];
    const draft = drafts[p.id];
    const qty = draft ? parseQty(draft.qty) : line ? Number(line.counted_qty) : null;
    const counted = qty !== null && !Number.isNaN(qty);
    // Théorique : figé au premier comptage ; sinon stock actuel (indicatif)
    const expected = line ? Number(line.expected_qty) : Number(p.stock ?? 0);
    const delta = counted ? (qty as number) - expected : 0;
    const appliedDelta = line?.applied_delta != null ? Number(line.applied_delta) : null;
    const unitValue = showCost
      ? Number(line?.unit_cost ?? p.cost_price ?? line?.unit_price ?? p.price ?? 0)
      : Number(line?.unit_price ?? p.price ?? 0);
    return { line, draft, qty, counted, expected, delta, appliedDelta, unitValue };
  }

  const stats = useMemo(() => {
    let counted = 0, gaps = 0, loss = 0, gain = 0, missingReason = 0;
    for (const p of scope) {
      const r = rowInfo(p);
      if (!r.counted) continue;
      counted++;
      const d = isOpen ? r.delta : (r.appliedDelta ?? 0);
      if (Math.abs(d) > 0.0005) {
        gaps++;
        if (d < 0) loss += -d * r.unitValue; else gain += d * r.unitValue;
        if (!(r.draft?.reason ?? r.line?.reason)) missingReason++;
      }
    }
    return { counted, gaps, loss, gain, missingReason };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, lines, drafts, showCost, isOpen]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = scope.filter((p) => {
      const r = rowInfo(p);
      if (filter === 'todo' && r.counted) return false;
      if (filter === 'gaps' && (!r.counted || Math.abs(isOpen ? r.delta : (r.appliedDelta ?? 0)) < 0.0005)) return false;
      if (!isOpen && !r.line) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q)
      );
    });
    // Comptés récemment en haut, puis ordre alphabétique
    return list.sort((a, b) => {
      const la = lines[a.id]?.counted_at ?? '';
      const lb = lines[b.id]?.counted_at ?? '';
      if (la !== lb) return lb.localeCompare(la);
      return a.name.localeCompare(b.name, 'fr');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, filter, q, lines, drafts, isOpen]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  function handleValidate() {
    if (!business) return;
    const msg =
      `Valider « ${session.name} » ? ` +
      (stats.gaps > 0
        ? `Le stock de ${stats.gaps} produit${stats.gaps > 1 ? 's' : ''} sera ajusté selon le comptage.`
        : 'Aucun écart : le stock ne changera pas.') +
      ' Les produits non comptés ne sont pas modifiés. Cette action est définitive.';
    askConfirm(msg, async () => {
      setValidating(true);
      try {
        const res = await validateInventorySession(business.id, session.id);
        success(`Inventaire validé — ${res.adjusted} produit${res.adjusted > 1 ? 's' : ''} ajusté${res.adjusted > 1 ? 's' : ''}`);
        onChanged();
      } catch (err) {
        notifError(toUserError(err));
      } finally {
        setValidating(false);
      }
    }, { confirmLabel: 'Valider et ajuster le stock', danger: false });
  }

  function handleCancel() {
    if (!business) return;
    askConfirm(`Annuler « ${session.name} » ? Les comptages seront abandonnés, le stock ne sera pas modifié.`, async () => {
      try {
        await cancelInventorySession(business.id, session.id);
        success('Inventaire annulé');
        onChanged();
      } catch (err) {
        notifError(toUserError(err));
      }
    }, { confirmLabel: 'Annuler l’inventaire', danger: true });
  }

  function exportCSV() {
    const headers = ['produit', 'code_barres', 'sku', 'theorique', 'compte', 'ecart', 'motif', showCost ? 'valeur_ecart_cout' : 'valeur_ecart_prix'];
    const rows = scope
      .map((p) => ({ p, r: rowInfo(p) }))
      .filter(({ r }) => r.counted)
      .map(({ p, r }) => {
        const d = isOpen ? r.delta : (r.appliedDelta ?? 0);
        return [
          p.name, p.barcode ?? '', p.sku ?? '', r.expected, r.qty, d,
          r.draft?.reason ?? r.line?.reason ?? '', Math.round(d * r.unitValue * 100) / 100,
        ];
      });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventaire_${format(new Date(session.created_at), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const loading = loadingProducts || loadingLines;
  const total = isOpen ? scope.filter((p) => p.track_stock).length : stats.counted;
  const progress = total > 0 ? Math.min(100, Math.round((stats.counted / total) * 100)) : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* En-tête */}
      <div className="px-4 py-3 border-b border-surface-border space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button onClick={onBack} className="flex items-center gap-1 text-xs text-content-secondary hover:text-content-primary mb-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Inventaires
            </button>
            <h1 className="text-xl font-bold text-content-primary truncate">{session.name}</h1>
            <p className="text-xs text-content-muted mt-0.5">
              {categoryName ? `Catégorie : ${categoryName}` : 'Tous les produits suivis'}
              {' · '}créé le {format(new Date(session.created_at), 'd MMM yyyy à HH:mm', { locale: fr })}
              {session.validated_at && ` · validé le ${format(new Date(session.validated_at), 'd MMM yyyy à HH:mm', { locale: fr })}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isOpen && (
              <button onClick={loadLines} className="btn-secondary p-2" title="Recharger les comptages">
                <RefreshCw className={cn('w-4 h-4', loadingLines && 'animate-spin')} />
              </button>
            )}
            <button onClick={exportCSV} disabled={stats.counted === 0} className="btn-secondary flex items-center gap-2" title="Exporter en CSV">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        {/* Progression */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-semibold text-content-primary">
              {stats.counted} / {total} produit{total > 1 ? 's' : ''} compté{stats.counted > 1 ? 's' : ''}
            </span>
            {isOpen && <span className="text-xs text-content-muted">{progress} %</span>}
          </div>
          {isOpen && (
            <div className="h-2 rounded-full bg-surface-input overflow-hidden">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {/* Scan / recherche */}
        <form onSubmit={handleScanSubmit} className="relative">
          <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-content-secondary" />
          <input
            ref={scanRef}
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isOpen ? 'Scanner un code-barres (+1) ou rechercher un produit…' : 'Rechercher un produit…'}
            className="input pl-11 py-3 text-base"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-content-muted hover:text-content-primary" aria-label="Effacer">
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        {/* Filtres */}
        <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1 w-fit">
          {([
            ['all', 'Tous'],
            ...(isOpen ? [['todo', 'Non comptés']] : []),
            ['gaps', `Écarts${stats.gaps ? ` (${stats.gaps})` : ''}`],
          ] as [Filter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filter === val ? 'bg-brand-600 text-content-primary' : 'text-content-secondary hover:text-content-primary',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-card border border-surface-border animate-pulse" />
          ))
        ) : visible.length === 0 ? (
          <div className="text-center py-12 text-sm text-content-secondary">
            {scope.length === 0
              ? 'Aucun produit avec suivi de stock dans ce périmètre. Activez « Gérer le stock » sur vos fiches produits.'
              : filter === 'todo'
              ? 'Tous les produits ont été comptés.'
              : filter === 'gaps'
              ? 'Aucun écart entre le stock théorique et le comptage.'
              : 'Aucun produit ne correspond à la recherche.'}
          </div>
        ) : (
          <>
            {visible.slice(0, MAX_ROWS).map((p) => {
              const r = rowInfo(p);
              const d = isOpen ? r.delta : (r.appliedDelta ?? 0);
              const hasGap = r.counted && Math.abs(d) > 0.0005;
              const invalid = r.qty !== null && Number.isNaN(r.qty);
              return (
                <div
                  key={p.id}
                  id={`inv-row-${p.id}`}
                  className={cn(
                    'rounded-xl border bg-surface-card p-3 transition-colors',
                    flashId === p.id ? 'border-brand-500 ring-2 ring-brand-500/40' : 'border-surface-border',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[10rem]">
                      <p className="font-medium text-content-primary truncate">{p.name}</p>
                      <p className="text-xs text-content-muted">
                        Théorique : {fmtQty(r.expected)}{p.unit ? ` ${p.unit}` : ''}
                        {!r.line && isOpen && ' (actuel)'}
                        {p.barcode && <span className="ml-2 font-mono">{p.barcode}</span>}
                      </p>
                    </div>

                    {/* Saisie du comptage */}
                    {isOpen ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => increment(p.id, -1)}
                          disabled={!r.counted || (r.qty ?? 0) <= 0}
                          className="w-11 h-11 rounded-xl bg-surface-input flex items-center justify-center text-content-primary disabled:opacity-40"
                          aria-label="Moins un"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={r.draft?.qty ?? ''}
                          onChange={(e) => setDraft(p.id, { qty: e.target.value })}
                          placeholder="—"
                          aria-label={`Quantité comptée pour ${p.name}`}
                          className={cn('input w-20 h-11 text-center text-base font-semibold', invalid && 'border-status-error')}
                        />
                        <button
                          onClick={() => increment(p.id, 1)}
                          className="w-11 h-11 rounded-xl bg-surface-input flex items-center justify-center text-content-primary"
                          aria-label="Plus un"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-right">
                        <p className="text-xs text-content-muted">Compté</p>
                        <p className="font-semibold text-content-primary">{fmtQty(r.qty ?? 0)}</p>
                      </div>
                    )}

                    {/* Écart */}
                    <div className="w-24 text-right">
                      {r.counted ? (
                        hasGap ? (
                          <>
                            <p className={cn('font-bold', d < 0 ? 'text-status-error' : 'text-status-warning')}>
                              {d > 0 ? '+' : ''}{fmtQty(d)}
                            </p>
                            <p className="text-xs text-content-muted">
                              {formatCurrency(d * r.unitValue, currency)}
                            </p>
                          </>
                        ) : (
                          <p className="flex items-center justify-end gap-1 text-sm font-medium text-status-success">
                            <CheckCircle2 className="w-4 h-4" /> OK
                          </p>
                        )
                      ) : (
                        <p className="text-xs text-content-muted">Non compté</p>
                      )}
                      {pending.has(p.id) && (
                        <p className="flex items-center justify-end gap-1 text-[10px] text-content-muted">
                          <Loader2 className="w-3 h-3 animate-spin" /> enregistrement
                        </p>
                      )}
                    </div>

                    {isOpen && r.counted && (
                      <button
                        onClick={() => resetLine(p.id)}
                        className="p-2 text-content-muted hover:text-content-primary"
                        title="Remettre en « non compté »"
                        aria-label="Remettre en non compté"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Motif de l'écart */}
                  {hasGap && (
                    isOpen ? (
                      <div className="mt-2">
                        <select
                          value={r.draft?.reason ?? ''}
                          onChange={(e) => setDraft(p.id, { reason: e.target.value })}
                          className={cn('input py-2 text-sm', !r.draft?.reason && 'border-status-warning')}
                          aria-label={`Motif de l'écart pour ${p.name}`}
                        >
                          <option value="">Motif de l’écart…</option>
                          {INVENTORY_REASONS.map((m) => <option key={m} value={m}>{m}</option>)}
                          {r.draft?.reason && !(INVENTORY_REASONS as readonly string[]).includes(r.draft.reason) && (
                            <option value={r.draft.reason}>{r.draft.reason}</option>
                          )}
                        </select>
                      </div>
                    ) : r.line?.reason ? (
                      <p className="mt-1 text-xs text-content-secondary">Motif : {r.line.reason}</p>
                    ) : null
                  )}
                </div>
              );
            })}
            {visible.length > MAX_ROWS && (
              <p className="text-center text-xs text-content-muted py-2">
                {visible.length - MAX_ROWS} autres produits — affinez la recherche ou scannez.
              </p>
            )}
          </>
        )}
      </div>

      {/* Synthèse + actions */}
      <div className="border-t border-surface-border px-4 py-3 bg-surface-card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm mb-2">
          <span className="text-content-secondary">
            Écarts : <span className="font-semibold text-content-primary">{stats.gaps}</span>
          </span>
          <span className="text-content-secondary">
            Manquants : <span className="font-semibold text-status-error">{formatCurrency(-stats.loss, currency)}</span>
          </span>
          <span className="text-content-secondary">
            Surplus : <span className="font-semibold text-status-warning">{formatCurrency(stats.gain, currency)}</span>
          </span>
          <span className="text-xs text-content-muted">valorisé au {showCost ? 'coût d’achat' : 'prix de vente'}</span>
        </div>
        {isOpen && canValidate && (
          <div className="flex items-center justify-between gap-3">
            <button onClick={handleCancel} className="btn-secondary">Annuler l’inventaire</button>
            <div className="flex items-center gap-3">
              {stats.missingReason > 0 && (
                <span className="hidden sm:inline text-xs text-status-warning">
                  {stats.missingReason} écart{stats.missingReason > 1 ? 's' : ''} sans motif
                </span>
              )}
              <button
                onClick={handleValidate}
                disabled={validating || pending.size > 0 || stats.counted === 0}
                className="btn-primary flex items-center gap-2"
                title={pending.size > 0 ? 'Enregistrement en cours…' : undefined}
              >
                {validating && <Loader2 className="w-4 h-4 animate-spin" />}
                Valider l’inventaire
              </button>
            </div>
          </div>
        )}
        {isOpen && !canValidate && (
          <p className="text-xs text-content-muted">Comptage enregistré automatiquement. Un responsable validera l’inventaire.</p>
        )}
      </div>

      <ConfirmDialog />
    </div>
  );
}
