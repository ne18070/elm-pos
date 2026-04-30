'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ShoppingCart, XCircle, RotateCcw, CreditCard,
  Package, Pencil, Trash2, Warehouse, UserCog, UserMinus,
  UserPlus, LogIn, Settings, Tag, RefreshCw, Search, Filter,
  ShieldAlert, History, BedDouble, LogOut, CalendarX,
  Briefcase, Receipt, Archive, ArchiveRestore, Wrench, Car, FileSignature,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { hasRole } from '@/lib/permissions';

// --- Types --------------------------------------------------------------------

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
  users?: { full_name: string } | null;
}

// --- Config des actions -------------------------------------------------------

const ACTION_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  'order.created':           { label: 'Commande créée',       Icon: ShoppingCart, color: 'text-status-success' },
  'order.cancelled':         { label: 'Commande annulée',     Icon: XCircle,      color: 'text-status-error' },
  'order.refunded':          { label: 'Remboursement',        Icon: RotateCcw,    color: 'text-status-purple' },
  'order.payment_completed': { label: 'Solde encaissé',       Icon: CreditCard,   color: 'text-content-brand' },
  'product.created':         { label: 'Produit ajouté',       Icon: Package,      color: 'text-status-success' },
  'product.updated':         { label: 'Produit modifié',      Icon: Pencil,       color: 'text-status-warning' },
  'product.deleted':         { label: 'Produit supprimé',     Icon: Trash2,       color: 'text-status-error' },
  'stock.entry':             { label: 'Approvisionnement',    Icon: Warehouse,    color: 'text-status-info' },
  'user.role_changed':       { label: 'Rôle modifié',         Icon: UserCog,      color: 'text-status-warning' },
  'user.removed':            { label: 'Membre retiré',        Icon: UserMinus,    color: 'text-status-error' },
  'user.invited':            { label: 'Invitation envoyée',   Icon: UserPlus,     color: 'text-status-success' },
  'user.login':              { label: 'Connexion',            Icon: LogIn,        color: 'text-content-secondary' },
  'settings.updated':        { label: 'Paramètres modifiés',  Icon: Settings,     color: 'text-content-secondary' },
  'coupon.created':          { label: 'Coupon créé',          Icon: Tag,          color: 'text-status-success' },
  'coupon.deleted':          { label: 'Coupon supprimé',      Icon: Tag,          color: 'text-status-error' },
  'cash_session.opened':     { label: 'Caisse ouverte',       Icon: ShieldAlert,  color: 'text-content-brand' },
  'cash_session.closed':     { label: 'Caisse clôturée',      Icon: ShieldAlert,  color: 'text-status-purple' },
  'user.blocked':            { label: 'Utilisateur bloqué',   Icon: UserMinus,    color: 'text-status-error' },
  'user.unblocked':          { label: 'Utilisateur débloqué', Icon: UserPlus,     color: 'text-status-success' },
  'user.password_reset':     { label: 'MDP réinitialisé',     Icon: UserCog,      color: 'text-status-warning' },
  'subscription.activated':  { label: 'Abonnement activé',    Icon: ShieldAlert,  color: 'text-status-success' },
  'snapshot.created':              { label: 'Snapshot créé',          Icon: History,    color: 'text-content-brand' },
  'snapshot.restored':             { label: 'Restauration effectuée', Icon: RotateCcw,  color: 'text-status-warning' },
  'hotel.reservation.created':     { label: 'Réservation hôtel',      Icon: BedDouble,       color: 'text-status-teal' },
  'hotel.reservation.cancelled':   { label: 'Réservation annulée',    Icon: CalendarX,       color: 'text-status-error' },
  'hotel.checkin':                 { label: 'Check-in',               Icon: LogIn,           color: 'text-status-success' },
  'hotel.checkout':                { label: 'Check-out',              Icon: LogOut,          color: 'text-status-teal' },
  'hotel.payment':                 { label: 'Acompte / Paiement',     Icon: CreditCard,      color: 'text-status-teal' },
  'dossier.created':               { label: 'Dossier créé',           Icon: Briefcase,       color: 'text-status-purple' },
  'dossier.updated':               { label: 'Dossier modifié',        Icon: Pencil,          color: 'text-status-warning' },
  'dossier.archived':              { label: 'Dossier archivé',        Icon: Archive,         color: 'text-content-secondary' },
  'dossier.unarchived':            { label: 'Dossier désarchivé',     Icon: ArchiveRestore,  color: 'text-status-success' },
  'honoraire.added':               { label: 'Honoraire ajouté',       Icon: Receipt,         color: 'text-status-success' },
  'honoraire.paid':                { label: 'Honoraire encaissé',     Icon: CreditCard,      color: 'text-status-success' },
  // Ordres de travail (Prestations)
  'service_order.created':         { label: 'OT créé',                Icon: Wrench,          color: 'text-status-success' },
  'service_order.updated':         { label: 'OT modifié',             Icon: Pencil,          color: 'text-status-warning' },
  'service_order.status_updated':  { label: 'Statut OT mis à jour',   Icon: RefreshCw,       color: 'text-content-brand' },
  'service_order.paid':            { label: 'OT encaissé',            Icon: CreditCard,      color: 'text-status-success' },
  'service_order.cancelled':       { label: 'OT annulé',              Icon: XCircle,         color: 'text-status-error' },
  // Voitures
  'voiture.created':               { label: 'Véhicule ajouté',        Icon: Car,             color: 'text-status-success' },
  'voiture.updated':               { label: 'Véhicule modifié',       Icon: Pencil,          color: 'text-status-warning' },
  'voiture.deleted':               { label: 'Véhicule supprimé',      Icon: Trash2,          color: 'text-status-error' },
  'voiture.sold':                  { label: 'Véhicule vendu',         Icon: Car,             color: 'text-content-brand' },
  // Contrats
  'contrat.created':               { label: 'Contrat créé',           Icon: FileSignature,   color: 'text-status-success' },
  'contrat.updated':               { label: 'Contrat modifié',        Icon: Pencil,          color: 'text-status-warning' },
  'contrat.cancelled':             { label: 'Contrat annulé',         Icon: XCircle,         color: 'text-status-error' },
};

const ENTITY_LABELS: Record<string, string> = {
  service_order:    'OT / Prestation',
  order:            'Commande',
  product:          'Produit',
  stock:            'Stock',
  coupon:           'Coupon',
  user:             'Utilisateur',
  cash_session:     'Session caisse',
  hotel_room:       'Chambre',
  hotel_reservation:'Réservation hôtel',
  dossier:          'Dossier',
  honoraire:        'Honoraire',
  voiture:          'Véhicule',
  contrat:          'Contrat',
  snapshot:         'Sauvegarde',
};

const STATUS_LABELS: Record<string, string> = {
  attente:  'En attente',
  en_cours: 'En cours',
  termine:  'Terminé',
  paye:     'Payé',
  annule:   'Annulé',
  paid:     'Payé',
  pending:  'En attente',
  cancelled:'Annulé',
  refunded: 'Remboursé',
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? { label: action, Icon: Filter, color: 'text-content-secondary' };
}

function getEntityLabel(entityType: string | null): string {
  if (!entityType) return '';
  return ENTITY_LABELS[entityType] ?? entityType;
}

function metaSummary(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '';
  const parts: string[] = [];
  if (metadata.order_number !== undefined)  parts.push(`OT #${metadata.order_number}`);
  if (metadata.client_name  !== undefined && metadata.client_name)  parts.push(`${metadata.client_name}`);
  if (metadata.subject_ref  !== undefined && metadata.subject_ref)  parts.push(`Réf : ${metadata.subject_ref}`);
  if (metadata.status       !== undefined)  parts.push(STATUS_LABELS[metadata.status as string] ?? String(metadata.status));
  if (metadata.items_count  !== undefined)  parts.push(`${metadata.items_count} prestation${Number(metadata.items_count) > 1 ? 's' : ''}`);
  if (metadata.total        !== undefined)  parts.push(`Total : ${metadata.total}`);
  if (metadata.amount       !== undefined)  parts.push(`Montant : ${metadata.amount}`);
  if (metadata.payment_method !== undefined && metadata.payment_method) parts.push(`${metadata.payment_method}`);
  if (metadata.name         !== undefined)  parts.push(`${metadata.name}`);
  if (metadata.quantity     !== undefined)  parts.push(`Qté : ${metadata.quantity}`);
  if (metadata.supplier     !== undefined && metadata.supplier)  parts.push(`Fournisseur : ${metadata.supplier}`);
  if (metadata.method       !== undefined)  parts.push(`${metadata.method}`);
  if (metadata.reason       !== undefined && metadata.reason)    parts.push(`Motif : ${metadata.reason}`);
  if (metadata.new_role     !== undefined)  parts.push(`→ ${metadata.new_role}`);
  if (metadata.fields       !== undefined)  parts.push(`Champs : ${(metadata.fields as string[]).join(', ')}`);
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
  { value: 'cash_session.opened',     label: 'Ouvertures de caisse' },
  { value: 'cash_session.closed',     label: 'Clôtures de caisse' },
  { value: 'user.blocked',            label: 'Blocages utilisateur' },
  { value: 'subscription.activated',  label: 'Activations abonnement' },
  { value: 'dossier.created',         label: 'Dossiers créés' },
  { value: 'dossier.updated',         label: 'Dossiers modifiés' },
  { value: 'dossier.archived',        label: 'Dossiers archivés' },
  { value: 'honoraire.added',         label: 'Honoraires ajoutés' },
  { value: 'honoraire.paid',          label: 'Honoraires encaissés' },
];

// --- Page ---------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function ActivityPage() {
  const { business, user } = useAuthStore();
  const { error: notifError } = useNotificationStore();
  const isAdmin = hasRole(user?.role, 'manager');

  const [logs, setLogs]           = useState<ActivityLog[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [page, setPage]           = useState(0);
  const [total, setTotal]         = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchLogs = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('activity_logs')
        .select('*, users(full_name)', { count: 'exact' })
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (actionFilter) query = query.eq('action', actionFilter);
      if (dateFrom)     query = query.gte('created_at', `${dateFrom}T00:00:00Z`);
      if (dateTo)       query = query.lte('created_at', `${dateTo}T23:59:59Z`);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      setLogs(data as ActivityLog[]);
      setTotal(count ?? 0);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business, actionFilter, dateFrom, dateTo, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-content-secondary">
        <ShieldAlert className="w-10 h-10 opacity-40" />
        <p>Accès réservé aux administrateurs</p>
      </div>
    );
  }

  const filtered = logs.filter((log) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const displayName = (log.user_name ?? log.users?.full_name ?? '').toLowerCase();
    return (
      displayName.includes(q) ||
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
            <h1 className="text-xl font-bold text-content-primary">Journal d&apos;activité</h1>
            <p className="text-xs text-content-muted mt-0.5">Toutes les actions enregistrées sur cet établissement</p>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
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
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
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
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="input w-40"
            title="Date début"
          />

          {/* Date de fin */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="input w-40"
            title="Date fin"
          />
        </div>
      </div>

      {/* Tableau */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-content-secondary">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-content-secondary">
            <Filter className="w-8 h-8 mb-2 opacity-40" />
            <p>Aucun événement trouvé</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
              <tr className="text-left text-xs text-content-secondary uppercase tracking-wide">
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
                    <td className="px-4 py-3 text-xs text-content-secondary whitespace-nowrap">
                      <p>{format(new Date(log.created_at), 'dd MMM yyyy', { locale: fr })}</p>
                      <p className="text-content-muted">{format(new Date(log.created_at), 'HH:mm:ss')}</p>
                    </td>

                    {/* Utilisateur */}
                    <td className="px-4 py-3">
                      <p className="text-sm text-content-primary">{log.user_name ?? log.users?.full_name ?? '-'}</p>
                      {log.user_id && (
                        <p className="text-xs text-content-muted font-mono">{log.user_id.slice(0, 8)}</p>
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
                        <span className="px-2 py-0.5 rounded-md bg-surface-input text-content-secondary">
                          {getEntityLabel(log.entity_type)}
                        </span>
                      )}
                      {log.entity_id && (
                        <p className="text-content-muted font-mono mt-0.5">{log.entity_id.slice(0, 8)}</p>
                      )}
                    </td>

                    {/* Détails */}
                    <td className="px-4 py-3 text-xs text-content-secondary hidden lg:table-cell max-w-xs truncate">
                      {metaSummary(log.metadata)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer pagination */}
      {!loading && (
        <div className="px-6 py-2 border-t border-surface-border flex items-center justify-between text-xs text-content-muted">
          <span>
            {filtered.length > 0
              ? `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + filtered.length} sur ${total} événement${total !== 1 ? 's' : ''}`
              : `0 événement`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary py-1 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Précédent
            </button>
            <span className="font-medium">Page {page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary py-1 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
