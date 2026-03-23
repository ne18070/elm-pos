'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ShoppingCart, XCircle, RotateCcw, CreditCard,
  Package, Pencil, Trash2, Warehouse, UserCog, UserMinus,
  UserPlus, LogIn, Settings, Tag, RefreshCw, Search, Filter,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityLog {
  id: string;
  business_id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Config des actions ───────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  'order.created':           { label: 'Commande créée',       Icon: ShoppingCart, color: 'text-green-400' },
  'order.cancelled':         { label: 'Commande annulée',     Icon: XCircle,      color: 'text-red-400' },
  'order.refunded':          { label: 'Remboursement',        Icon: RotateCcw,    color: 'text-purple-400' },
  'order.payment_completed': { label: 'Solde encaissé',       Icon: CreditCard,   color: 'text-brand-400' },
  'product.created':         { label: 'Produit ajouté',       Icon: Package,      color: 'text-green-400' },
  'product.updated':         { label: 'Produit modifié',      Icon: Pencil,       color: 'text-amber-400' },
  'product.deleted':         { label: 'Produit supprimé',     Icon: Trash2,       color: 'text-red-400' },
  'stock.entry':             { label: 'Approvisionnement',    Icon: Warehouse,    color: 'text-blue-400' },
  'user.role_changed':       { label: 'Rôle modifié',         Icon: UserCog,      color: 'text-amber-400' },
  'user.removed':            { label: 'Membre retiré',        Icon: UserMinus,    color: 'text-red-400' },
  'user.invited':            { label: 'Invitation envoyée',   Icon: UserPlus,     color: 'text-green-400' },
  'user.login':              { label: 'Connexion',            Icon: LogIn,        color: 'text-slate-400' },
  'settings.updated':        { label: 'Paramètres modifiés',  Icon: Settings,     color: 'text-slate-400' },
  'coupon.created':          { label: 'Coupon créé',          Icon: Tag,          color: 'text-green-400' },
  'coupon.deleted':          { label: 'Coupon supprimé',      Icon: Tag,          color: 'text-red-400' },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? { label: action, Icon: Filter, color: 'text-slate-400' };
}

function metaSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '';
  const parts: string[] = [];
  if (metadata.total !== undefined)       parts.push(`Total : ${metadata.total}`);
  if (metadata.amount !== undefined)      parts.push(`Montant : ${metadata.amount}`);
  if (metadata.name !== undefined)        parts.push(`${metadata.name}`);
  if (metadata.quantity !== undefined)    parts.push(`Qté : ${metadata.quantity}`);
  if (metadata.supplier !== undefined && metadata.supplier)   parts.push(`Fournisseur : ${metadata.supplier}`);
  if (metadata.method !== undefined)      parts.push(`${metadata.method}`);
  if (metadata.reason !== undefined && metadata.reason)       parts.push(`Motif : ${metadata.reason}`);
  if (metadata.new_role !== undefined)    parts.push(`→ ${metadata.new_role}`);
  if (metadata.fields !== undefined)      parts.push(`Champs : ${(metadata.fields as string[]).join(', ')}`);
  return parts.join(' · ');
}

const ACTION_FILTERS = [
  { value: '', label: 'Toutes les actions' },
  { value: 'order.created',           label: 'Commandes créées' },
  { value: 'order.cancelled',         label: 'Annulations' },
  { value: 'order.refunded',          label: 'Remboursements' },
  { value: 'order.payment_completed', label: 'Soldes encaissés' },
  { value: 'product.created',         label: 'Produits ajoutés' },
  { value: 'product.updated',         label: 'Produits modifiés' },
  { value: 'product.deleted',         label: 'Produits supprimés' },
  { value: 'stock.entry',             label: 'Approvisionnements' },
  { value: 'user.role_changed',       label: 'Changements de rôle' },
  { value: 'user.removed',            label: 'Membres retirés' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { business, user } = useAuthStore();
  const { error: notifError } = useNotificationStore();
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  const [logs, setLogs]           = useState<ActivityLog[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');

  const fetchLogs = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('activity_logs')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (actionFilter) query = query.eq('action', actionFilter);
      if (dateFrom)     query = query.gte('created_at', `${dateFrom}T00:00:00Z`);
      if (dateTo)       query = query.lte('created_at', `${dateTo}T23:59:59Z`);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      setLogs(data as ActivityLog[]);
    } catch (err) {
      notifError(String(err));
    } finally {
      setLoading(false);
    }
  }, [business, actionFilter, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <ShieldAlert className="w-10 h-10 opacity-40" />
        <p>Accès réservé aux administrateurs</p>
      </div>
    );
  }

  const filtered = logs.filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      log.user_name?.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.entity_id?.toLowerCase().includes(q) ||
      JSON.stringify(log.metadata ?? {}).toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Journal d&apos;activité</h1>
            <p className="text-xs text-slate-500 mt-0.5">Toutes les actions enregistrées sur cet établissement</p>
          </div>
          <button onClick={fetchLogs} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-3">
          {/* Recherche */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par utilisateur, action, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>

          {/* Filtre action */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="input w-56"
          >
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          {/* Date de début */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input w-40"
            title="Date début"
          />

          {/* Date de fin */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input w-40"
            title="Date fin"
          />
        </div>
      </div>

      {/* Tableau */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <Filter className="w-8 h-8 mb-2 opacity-40" />
            <p>Aucun événement trouvé</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 whitespace-nowrap">Date / Heure</th>
                <th className="px-4 py-3 whitespace-nowrap">Utilisateur</th>
                <th className="px-4 py-3 whitespace-nowrap">Action</th>
                <th className="px-4 py-3 whitespace-nowrap hidden md:table-cell">Entité</th>
                <th className="px-4 py-3 hidden lg:table-cell">Détails</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                const cfg = getActionConfig(log.action);
                const Icon = cfg.Icon;
                return (
                  <tr
                    key={log.id}
                    className="border-b border-surface-border hover:bg-surface-hover transition-colors"
                  >
                    {/* Date */}
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      <p>{format(new Date(log.created_at), 'dd MMM yyyy', { locale: fr })}</p>
                      <p className="text-slate-500">{format(new Date(log.created_at), 'HH:mm:ss')}</p>
                    </td>

                    {/* Utilisateur */}
                    <td className="px-4 py-3">
                      <p className="text-sm text-white">{log.user_name ?? '—'}</p>
                      {log.user_id && (
                        <p className="text-xs text-slate-500 font-mono">{log.user_id.slice(0, 8)}</p>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
                        <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </td>

                    {/* Entité */}
                    <td className="px-4 py-3 text-xs hidden md:table-cell">
                      {log.entity_type && (
                        <span className="px-2 py-0.5 rounded-md bg-surface-input text-slate-400 capitalize">
                          {log.entity_type}
                        </span>
                      )}
                      {log.entity_id && (
                        <p className="text-slate-500 font-mono mt-0.5">{log.entity_id.slice(0, 8)}</p>
                      )}
                    </td>

                    {/* Détails */}
                    <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell max-w-xs truncate">
                      {metaSummary(log.metadata)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer compteur */}
      {!loading && (
        <div className="px-6 py-2 border-t border-surface-border text-xs text-slate-500">
          {filtered.length} événement{filtered.length !== 1 ? 's' : ''} affiché{filtered.length !== 1 ? 's' : ''}
          {logs.length >= 500 && ' (limité à 500 — affiner les filtres pour voir plus)'}
        </div>
      )}
    </div>
  );
}
