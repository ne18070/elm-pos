'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  History, Plus, RotateCcw, Trash2, Package, LayoutGrid, Tag,
  AlertTriangle, CheckCircle2, Loader2, Info, ShieldCheck, Clock,
  ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { canDelete } from '@/lib/permissions';
import {
  getSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot, getSnapshotData,
  type SnapshotMeta, type RestorableTable, type RestoreResult,
} from '@services/supabase/snapshots';

// ─── Types ────────────────────────────────────────────────────────────────────

type SnapshotTable = RestorableTable;

const TABLE_LABELS: Record<SnapshotTable, string> = {
  products:   'Produits (stock, prix, statut)',
  categories: 'Catégories (nom, couleur, icône)',
  coupons:    'Coupons (statut, compteur)',
};

const TYPE_CONFIG = {
  manual:      { label: 'Manuel',           color: 'bg-brand-600/10 text-content-brand border-brand-600/20' },
  auto:        { label: 'Automatique',      color: 'bg-slate-700 text-content-secondary border-slate-600' },
  pre_restore: { label: 'Sécurité',         color: 'bg-amber-500/10 text-status-warning border-amber-500/20' },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RecoveryPage() {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const isOwnerOrAdmin = canDelete(user?.role);

  const [snapshots, setSnapshots]       = useState<SnapshotMeta[]>([]);
  const [loading, setLoading]           = useState(true);
  const [creating, setCreating]         = useState(false);
  const [createLabel, setCreateLabel]   = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Restore modal state
  const [restoring, setRestoring]       = useState<SnapshotMeta | null>(null);
  const [restoreTables, setRestoreTables] = useState<Set<SnapshotTable>>(
    new Set(['products', 'categories', 'coupons'])
  );
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult]   = useState<RestoreResult | null>(null);

  // Preview state
  const [previewId, setPreviewId]   = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ products: number; categories: number; coupons: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const data = await getSnapshots(business.id);
      setSnapshots(data);
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Create ──────────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!business?.id) return;
    setCreating(true);
    try {
      await createSnapshot(business.id, createLabel || undefined);
      success('Snapshot créé avec succès');
      setCreateLabel('');
      setShowCreateForm(false);
      load();
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setCreating(false);
    }
  }

  // ── Preview ─────────────────────────────────────────────────────────────────
  async function handlePreview(snap: SnapshotMeta) {
    if (previewId === snap.id) { setPreviewId(null); return; }
    setPreviewId(snap.id);
    setPreviewLoading(true);
    try {
      const data = await getSnapshotData(snap.id);
      setPreviewData({
        products:   Array.isArray(data.products)   ? data.products.length   : 0,
        categories: Array.isArray(data.categories) ? data.categories.length : 0,
        coupons:    Array.isArray(data.coupons)     ? data.coupons.length     : 0,
      });
    } catch {
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Restore ─────────────────────────────────────────────────────────────────
  async function handleRestore() {
    if (!restoring) return;
    setRestoreLoading(true);
    setRestoreResult(null);
    try {
      const result = await restoreSnapshot(restoring.id, [...restoreTables]);
      setRestoreResult(result);
      success('Restauration effectuée');
      load();
    } catch (e) {
      notifError(toUserError(e));
      setRestoring(null);
    } finally {
      setRestoreLoading(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(snap: SnapshotMeta) {
    if (!confirm(`Supprimer le snapshot "${snap.label}" ? Cette action est irréversible.`)) return;
    try {
      await deleteSnapshot(snap.id);
      success('Snapshot supprimé');
      load();
    } catch (e) {
      notifError(toUserError(e));
    }
  }

  const manualCount = snapshots.filter(s => s.type === 'manual').length;
  const autoCount   = snapshots.filter(s => s.type === 'auto').length;
  const safetyCount = snapshots.filter(s => s.type === 'pre_restore').length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <History className="w-6 h-6 text-content-brand" />
            Récupération & Sauvegardes
          </h1>
          <p className="text-content-secondary mt-1 text-sm">
            Restaurez vos données (produits, catégories, coupons) à n&apos;importe quel moment passé.
          </p>
        </div>
        {isOwnerOrAdmin && (
          <button
            onClick={() => setShowCreateForm(v => !v)}
            className="btn-primary flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nouveau snapshot
          </button>
        )}
      </div>

      {/* Explication */}
      <div className="card p-4 border-brand-600/20 bg-brand-600/5 space-y-3">
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
          <Info className="w-4 h-4 text-content-brand" />
          Comment fonctionne la récupération ?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          {[
            { icon: Zap, title: 'Snapshot automatique', desc: 'Un snapshot est créé chaque nuit à 2h pour les établissements actifs.' },
            { icon: ShieldCheck, title: 'Snapshot de sécurité', desc: 'Avant chaque restauration, l\'état actuel est sauvegardé automatiquement.' },
            { icon: RotateCcw, title: 'Restauration sélective', desc: 'Choisissez quelles données restaurer : produits, catégories, ou coupons.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-content-brand" />
              </div>
              <div>
                <p className="font-medium text-content-primary">{title}</p>
                <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="card p-5 space-y-4 border-brand-600/30">
          <h2 className="font-semibold text-white">Créer un snapshot maintenant</h2>
          <div>
            <label className="label">Label (optionnel)</label>
            <input
              type="text"
              className="input"
              placeholder="ex : Avant inventaire de fin de mois"
              value={createLabel}
              onChange={e => setCreateLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary flex items-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {creating ? 'Création…' : 'Créer le snapshot'}
            </button>
            <button onClick={() => setShowCreateForm(false)} className="btn-secondary">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Manuels',    count: manualCount,  color: 'text-content-brand' },
          { label: 'Auto',       count: autoCount,    color: 'text-content-secondary' },
          { label: 'Sécurité',   count: safetyCount,  color: 'text-status-warning' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Snapshots list */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-content-brand" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="card p-10 text-center">
            <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-content-secondary">Aucun snapshot disponible</p>
            <p className="text-slate-600 text-sm mt-1">
              Créez un snapshot manuel ou attendez le snapshot automatique de nuit.
            </p>
          </div>
        ) : (
          snapshots.map(snap => (
            <SnapshotCard
              key={snap.id}
              snap={snap}
              isOwnerOrAdmin={isOwnerOrAdmin}
              isExpanded={previewId === snap.id}
              previewLoading={previewLoading && previewId === snap.id}
              previewData={previewId === snap.id ? previewData : null}
              onPreview={() => handlePreview(snap)}
              onRestore={() => { setRestoring(snap); setRestoreResult(null); }}
              onDelete={() => handleDelete(snap)}
            />
          ))
        )}
      </div>

      {/* Restore modal */}
      {restoring && (
        <RestoreModal
          snap={restoring}
          tables={restoreTables}
          loading={restoreLoading}
          result={restoreResult}
          onToggleTable={t => {
            setRestoreTables(prev => {
              const next = new Set(prev);
              if (next.has(t)) next.delete(t); else next.add(t);
              return next;
            });
          }}
          onConfirm={handleRestore}
          onClose={() => { setRestoring(null); setRestoreResult(null); }}
        />
      )}
    </div>
  );
}

// ─── SnapshotCard ─────────────────────────────────────────────────────────────

function SnapshotCard({
  snap, isOwnerOrAdmin, isExpanded, previewLoading, previewData,
  onPreview, onRestore, onDelete,
}: {
  snap: SnapshotMeta;
  isOwnerOrAdmin: boolean;
  isExpanded: boolean;
  previewLoading: boolean;
  previewData: { products: number; categories: number; coupons: number } | null;
  onPreview: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const cfg = TYPE_CONFIG[snap.type] ?? TYPE_CONFIG.manual;

  return (
    <div className={`card overflow-hidden transition-all ${
      snap.type === 'pre_restore' ? 'border-amber-500/20' : ''
    }`}>
      <div className="p-4 flex items-center gap-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          snap.type === 'manual'      ? 'bg-brand-600/10'   :
          snap.type === 'pre_restore' ? 'bg-amber-500/10'  :
          'bg-slate-700'
        }`}>
          {snap.type === 'pre_restore'
            ? <ShieldCheck className="w-5 h-5 text-status-warning" />
            : snap.type === 'auto'
            ? <Clock className="w-5 h-5 text-content-secondary" />
            : <History className="w-5 h-5 text-content-brand" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white text-sm truncate">{snap.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs border ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            <span>{format(new Date(snap.created_at), 'dd MMM yyyy à HH:mm', { locale: fr })}</span>
            <span>·</span>
            <span>{formatDistanceToNow(new Date(snap.created_at), { addSuffix: true, locale: fr })}</span>
            {snap.created_by_name && (
              <>
                <span>·</span>
                <span>par {snap.created_by_name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <CountBadge icon={Package} count={snap.product_count} label="produits" />
            <CountBadge icon={LayoutGrid} count={snap.category_count} label="catégories" />
            <CountBadge icon={Tag} count={snap.coupon_count} label="coupons" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onPreview}
            className="p-2 rounded-lg text-content-secondary hover:text-white hover:bg-surface-hover transition-colors"
            title="Aperçu du contenu"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {isOwnerOrAdmin && (
            <button
              onClick={onRestore}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600/10 text-content-brand
                         hover:bg-brand-600/20 transition-colors border border-brand-600/20"
            >
              Restaurer
            </button>
          )}
          {isOwnerOrAdmin && snap.type !== 'pre_restore' && (
            <button
              onClick={onDelete}
              className="p-2 rounded-lg text-slate-600 hover:text-status-error hover:bg-red-500/10 transition-colors"
              title="Supprimer le snapshot"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Preview panel */}
      {isExpanded && (
        <div className="border-t border-surface-border px-4 py-3 bg-surface-hover/30">
          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm text-content-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement de l&apos;aperçu…
            </div>
          ) : previewData ? (
            <div className="grid grid-cols-3 gap-3">
              <PreviewStat icon={Package} label="Produits" count={previewData.products} />
              <PreviewStat icon={LayoutGrid} label="Catégories" count={previewData.categories} />
              <PreviewStat icon={Tag} label="Coupons" count={previewData.coupons} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Impossible de charger l&apos;aperçu</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── RestoreModal ─────────────────────────────────────────────────────────────

function RestoreModal({
  snap, tables, loading, result, onToggleTable, onConfirm, onClose,
}: {
  snap: SnapshotMeta;
  tables: Set<SnapshotTable>;
  loading: boolean;
  result: RestoreResult | null;
  onToggleTable: (t: SnapshotTable) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md space-y-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-content-brand" />
            Restaurer un snapshot
          </h2>
          <p className="text-sm text-content-secondary mt-0.5 truncate">{snap.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {format(new Date(snap.created_at), 'dd MMMM yyyy à HH:mm', { locale: fr })}
          </p>
        </div>

        {result ? (
          /* Result screen */
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-status-success" />
              </div>
              <div>
                <p className="font-medium text-white">Restauration effectuée</p>
                <p className="text-xs text-content-secondary mt-0.5">
                  Un snapshot de sécurité a été créé avant la restauration.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {result.products_updated !== undefined && (
                <ResultRow label="Produits mis à jour" count={result.products_updated} />
              )}
              {result.categories_restored !== undefined && (
                <ResultRow label="Catégories restaurées" count={result.categories_restored} />
              )}
              {result.coupons_updated !== undefined && (
                <ResultRow label="Coupons mis à jour" count={result.coupons_updated} />
              )}
            </div>

            <button onClick={onClose} className="btn-primary w-full">Fermer</button>
          </div>
        ) : (
          /* Selection screen */
          <div className="p-6 space-y-5">
            {/* Warning */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
              <p className="text-sm text-status-warning">
                Un snapshot de sécurité de l&apos;état actuel sera créé automatiquement
                avant toute modification.
              </p>
            </div>

            {/* Table selection */}
            <div>
              <p className="text-sm font-medium text-slate-300 mb-3">
                Données à restaurer :
              </p>
              <div className="space-y-2">
                {(['products', 'categories', 'coupons'] as SnapshotTable[]).map(t => (
                  <label
                    key={t}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      tables.has(t)
                        ? 'border-brand-600 bg-brand-600/10'
                        : 'border-surface-border hover:border-slate-600 hover:bg-surface-hover'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={tables.has(t)}
                      onChange={() => onToggleTable(t)}
                      className="accent-brand-500"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-white">{TABLE_LABELS[t]}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onConfirm}
                disabled={loading || tables.size === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Restauration…</>
                  : <><RotateCcw className="w-4 h-4" />Restaurer</>}
              </button>
              <button onClick={onClose} disabled={loading} className="btn-secondary flex-1">
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function CountBadge({ icon: Icon, count, label }: { icon: React.ElementType; count: number; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <Icon className="w-3 h-3" />
      {count} {label}
    </span>
  );
}

function PreviewStat({ icon: Icon, label, count }: { icon: React.ElementType; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
      <div>
        <p className="text-sm font-medium text-white">{count}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function ResultRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-surface-border last:border-0">
      <span className="text-content-secondary">{label}</span>
      <span className="font-medium text-white">{count}</span>
    </div>
  );
}
