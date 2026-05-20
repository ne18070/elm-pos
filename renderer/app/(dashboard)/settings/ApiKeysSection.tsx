'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Trash2, Copy, Check, ToggleLeft, ToggleRight,
  Loader2, KeyRound, Clock, AlertTriangle,
} from 'lucide-react';
import { copyTextToClipboard } from '@/lib/clipboard';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import {
  getApiKeys, createApiKey, revokeApiKey, reactivateApiKey, deleteApiKey,
  type ApiKey,
} from '@services/supabase/api-keys';
import { cn } from '@/lib/utils';

const SCOPE_GROUPS: { label: string; scopes: { value: string; label: string }[] }[] = [
  {
    label: 'Ventes & Commandes',
    scopes: [
      { value: 'read:orders',   label: 'Lire les commandes' },
      { value: 'write:orders',  label: 'Créer des commandes' },
    ],
  },
  {
    label: 'Catalogue',
    scopes: [
      { value: 'read:products',  label: 'Lire les produits' },
      { value: 'write:products', label: 'Modifier le stock' },
    ],
  },
  {
    label: 'Clients',
    scopes: [
      { value: 'read:clients',  label: 'Lire les clients' },
      { value: 'write:clients', label: 'Créer / mettre à jour' },
    ],
  },
  {
    label: 'Élèves',
    scopes: [
      { value: 'read:students',  label: 'Lire les élèves' },
      { value: 'write:students', label: 'Inscrire des élèves' },
    ],
  },
  {
    label: 'Services / Atelier',
    scopes: [
      { value: 'read:services',  label: 'Lire les ordres de travail' },
      { value: 'write:services', label: 'Créer / modifier les OT' },
    ],
  },
  {
    label: 'Revendeurs',
    scopes: [
      { value: 'read:resellers',  label: 'Lire les revendeurs' },
      { value: 'write:resellers', label: 'Créer / modifier' },
    ],
  },
  {
    label: 'Hôtel',
    scopes: [
      { value: 'read:hotel',  label: 'Chambres, réservations, clients' },
      { value: 'write:hotel', label: 'Créer réservations & clients' },
    ],
  },
  {
    label: 'Restaurant',
    scopes: [
      { value: 'read:restaurant',  label: 'Tables & salles' },
      { value: 'write:restaurant', label: 'Modifier statut des tables' },
    ],
  },
  {
    label: 'Analytiques',
    scopes: [
      { value: 'read:analytics', label: 'Accéder aux statistiques' },
    ],
  },
];

function ScopeBadge({ scope }: { scope: string }) {
  const isWrite = scope.startsWith('write:');
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
      isWrite
        ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
        : 'bg-brand-500/10 text-brand-400 border border-brand-500/20',
    )}>
      {scope.replace('read:', 'R:').replace('write:', 'W:')}
    </span>
  );
}

function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function selectAll(e: React.MouseEvent<HTMLInputElement>) {
    (e.target as HTMLInputElement).select();
  }

  async function copy() {
    // Try modern clipboard API first (works in all browsers on localhost/https)
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      } catch { /* fall through */ }
    }
    // Electron / no-secure-context fallback
    try {
      await copyTextToClipboard(value);
      setCopied(true);
    } catch {
      const el = document.getElementById('api-key-copy-input') as HTMLInputElement | null;
      el?.select();
    }
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-input border border-green-500/30">
      <input
        id="api-key-copy-input"
        type="text"
        readOnly
        value={value}
        onClick={selectAll}
        className="flex-1 text-xs font-mono text-green-600 bg-transparent outline-none cursor-text select-all min-w-0"
      />
      <button
        onClick={copy}
        title="Copier"
        className="shrink-0 p-1.5 rounded hover:bg-surface-hover transition-colors"
      >
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-content-muted" />}
      </button>
    </div>
  );
}

export function ApiKeysSection() {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const businessId = business?.id ?? '';

  useEffect(() => {
    if (!businessId) return;
    getApiKeys(businessId)
      .then(setKeys)
      .catch(() => notifError('Impossible de charger les clés API.'))
      .finally(() => setLoading(false));
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleCreate() {
    if (!newKeyName.trim()) { notifError('Donnez un nom à cette clé.'); return; }
    if (selectedScopes.length === 0) { notifError('Sélectionnez au moins une permission.'); return; }
    if (!user?.id) return;
    setCreating(true);
    try {
      const { raw, key } = await createApiKey(businessId, newKeyName.trim(), selectedScopes, user.id);
      setKeys((prev) => [key, ...prev]);
      setRawKey(raw);
      setShowForm(false);
      setNewKeyName('');
      setSelectedScopes([]);
      success('Clé API créée. Copiez-la maintenant — elle ne sera plus affichée.');
    } catch (e) {
      notifError(e instanceof Error ? e.message : 'Erreur lors de la création.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(key: ApiKey) {
    setTogglingId(key.id);
    try {
      if (key.is_active) {
        await revokeApiKey(key.id);
      } else {
        await reactivateApiKey(key.id);
      }
      setKeys((prev) => prev.map((k) => k.id === key.id ? { ...k, is_active: !k.is_active } : k));
    } catch {
      notifError('Impossible de modifier le statut.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      success('Clé supprimée.');
    } catch {
      notifError('Impossible de supprimer la clé.');
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return 'Jamais';
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-content-secondary">
        Permettez à des systèmes externes (e-commerce, comptabilité, ERP) de lire et écrire des données
        via l'API REST <code className="text-xs text-brand-400 bg-surface-input px-1 rounded">/api/v1/*</code>.
        Chaque clé possède des permissions limitées et peut être révoquée à tout moment.
      </p>

      {/* One-time raw key display */}
      {rawKey && (
        <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/5 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            <p className="text-xs text-green-600 font-semibold">
              Copiez cette clé maintenant - elle ne sera plus affichée après fermeture.
            </p>
          </div>
          <CopyBox value={rawKey} />
          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-content-muted italic">
              Cliquez le bouton <span className="font-semibold">Copier</span> à droite de la clé ci-dessus.
            </p>
            <button
              onClick={() => setRawKey(null)}
              className="text-[11px] text-content-muted hover:text-content-secondary px-2 py-1 rounded border border-surface-border hover:bg-surface-hover transition-colors"
            >
              ✕ Fermer
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm ? (
        <div className="p-4 rounded-xl border border-surface-border bg-surface-input/50 space-y-4">
          <h3 className="text-sm font-bold text-content-primary">Nouvelle clé API</h3>

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-1.5">Nom (usage interne)</label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Ex : WooCommerce boutique, Odoo, Dashboard Excel…"
              className="w-full text-sm px-3 py-2 rounded-lg bg-surface-card border border-surface-border text-content-primary placeholder:text-content-muted outline-none focus:border-brand-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-content-secondary mb-2">Permissions</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SCOPE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-content-muted mb-2">{group.label}</p>
                  <div className="space-y-1.5">
                    {group.scopes.map((scope) => (
                      <label key={scope.value} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(scope.value)}
                          onChange={() => toggleScope(scope.value)}
                          className="w-3.5 h-3.5 accent-brand-500"
                        />
                        <span className="text-xs text-content-secondary group-hover:text-content-primary transition-colors">
                          {scope.label}
                        </span>
                        <ScopeBadge scope={scope.value} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              Générer la clé
            </button>
            <button
              onClick={() => { setShowForm(false); setNewKeyName(''); setSelectedScopes([]); }}
              className="px-4 py-2 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-500/30 text-brand-400 text-sm font-semibold hover:bg-brand-500/10 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle clé API
        </button>
      )}

      {/* Keys table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-content-muted" />
        </div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-content-muted text-center py-6">Aucune clé API créée.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className={cn(
                'flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border transition-colors',
                key.is_active
                  ? 'bg-surface-card border-surface-border'
                  : 'bg-surface-input/50 border-surface-border opacity-60',
              )}
            >
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-content-primary truncate">{key.name}</span>
                  {!key.is_active && (
                    <span className="text-[10px] font-semibold text-content-muted uppercase tracking-wide">Révoquée</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-[11px] font-mono text-content-muted bg-surface-input px-1.5 py-0.5 rounded">
                    {key.key_prefix}…
                  </code>
                  {key.scopes.map((s) => <ScopeBadge key={s} scope={s} />)}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-content-muted">
                  <Clock className="w-3 h-3" />
                  Dernière utilisation : {formatDate(key.last_used_at)}
                  <span className="mx-1">·</span>
                  Créée le {formatDate(key.created_at)}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggle(key)}
                  disabled={togglingId === key.id}
                  title={key.is_active ? 'Révoquer' : 'Réactiver'}
                  className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-content-secondary disabled:opacity-50"
                >
                  {togglingId === key.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : key.is_active
                      ? <ToggleRight className="w-5 h-5 text-green-500" />
                      : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => handleDelete(key.id)}
                  disabled={deletingId === key.id}
                  title="Supprimer définitivement"
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-content-muted hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {deletingId === key.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
