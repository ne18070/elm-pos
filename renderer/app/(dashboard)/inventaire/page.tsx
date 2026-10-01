'use client';
import { toUserError } from '@/lib/user-error';

import { useCallback, useEffect, useState } from 'react';
import { Plus, ClipboardCheck, Loader2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { useCategories } from '@/hooks/useCategories';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { InventorySessionView } from '@/components/stock/InventorySessionView';
import { getInventorySessions, createInventorySession } from '@services/supabase/inventory';
import type { InventorySession, InventoryStatus } from '@services/supabase/inventory';

const STATUS_CFG: Record<InventoryStatus, { label: string; color: string }> = {
  open:      { label: 'En cours', color: 'bg-badge-info text-status-info' },
  validated: { label: 'Validé',   color: 'bg-badge-success text-status-success' },
  cancelled: { label: 'Annulé',   color: 'bg-surface-input text-content-muted' },
};

// Lu depuis window plutôt que via useSearchParams : la build Electron/Capacitor
// est un export statique (useSearchParams y impose une frontière Suspense).
function readSessionParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('session');
}

function writeSessionParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('session', id); else url.searchParams.delete('session');
  window.history.pushState(null, '', url.toString());
}

export default function InventairePage() {
  const { business } = useAuthStore();
  const { error: notifError } = useNotificationStore();
  const can = useCan();
  const { categories } = useCategories(business?.id ?? '');
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    try {
      setSessions(await getInventorySessions(business.id));
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, notifError]);

  useEffect(() => { load(); }, [load]);

  // Lien profond ?session=<id> + boutons précédent/suivant du navigateur
  useEffect(() => {
    setSelectedId(readSessionParam());
    const onPop = () => setSelectedId(readSessionParam());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function open(id: string | null) {
    writeSessionParam(id);
    setSelectedId(id);
  }

  if (!can('view_inventaire')) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6">
        <div className="max-w-sm text-center">
          <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-content-secondary opacity-40" />
          <h1 className="text-lg font-bold text-content-primary">Accès refusé</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Vous n&apos;avez pas la permission d&apos;accéder aux inventaires.
          </p>
        </div>
      </div>
    );
  }

  const selected = selectedId ? sessions.find((s) => s.id === selectedId) : undefined;
  const categoryName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name : undefined);

  if (selectedId && selected) {
    return (
      <InventorySessionView
        key={selected.id + selected.status}
        session={selected}
        categoryName={categoryName(selected.category_id)}
        onBack={() => { open(null); load(); }}
        onChanged={load}
      />
    );
  }

  const openSessions = sessions.filter((s) => s.status === 'open');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2 sm:p-4 border-b border-surface-border">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-content-primary">Inventaire</h1>
            <p className="text-xs text-content-muted mt-0.5">
              Comptez le stock physique, comparez au théorique, corrigez les écarts avec un motif
            </p>
          </div>
          {can('validate_inventaire') && (
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nouvel inventaire</span>
              <span className="sm:hidden">Nouveau</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-card border border-surface-border animate-pulse" />
          ))
        ) : sessions.length === 0 ? (
          <div className="max-w-md mx-auto text-center py-12">
            <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-content-secondary opacity-40" />
            <h2 className="font-semibold text-content-primary">Aucun inventaire pour l&apos;instant</h2>
            <p className="mt-1 text-sm text-content-secondary">
              Un inventaire régulier (par exemple une catégorie par semaine) permet de repérer
              tôt la casse, les pertes et les erreurs de saisie. Les ventes continuent pendant le comptage.
            </p>
          </div>
        ) : (
          <>
            {openSessions.length > 0 && (
              <p className="text-xs font-semibold uppercase tracking-wide text-content-muted px-1">En cours</p>
            )}
            {sessions.map((s, i) => {
              const showHistoryLabel = s.status !== 'open' && (i === 0 || sessions[i - 1].status === 'open');
              return (
                <div key={s.id}>
                  {showHistoryLabel && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-content-muted px-1 pt-3 pb-2">Historique</p>
                  )}
                  <button
                    onClick={() => open(s.id)}
                    className="w-full text-left rounded-xl border border-surface-border bg-surface-card p-4 flex items-center gap-3 hover:border-brand-500 transition-colors min-h-[44px]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-content-primary truncate">{s.name}</p>
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium shrink-0', STATUS_CFG[s.status].color)}>
                          {STATUS_CFG[s.status].label}
                        </span>
                      </div>
                      <p className="text-xs text-content-muted mt-0.5">
                        {categoryName(s.category_id) ?? 'Tous les produits'}
                        {' · '}{s.lines_count ?? 0} produit{(s.lines_count ?? 0) > 1 ? 's' : ''} compté{(s.lines_count ?? 0) > 1 ? 's' : ''}
                        {' · '}{format(new Date(s.validated_at ?? s.created_at), 'd MMM yyyy', { locale: fr })}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-content-muted shrink-0" />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>

      {showCreate && business && (
        <CreateInventoryModal
          businessId={business.id}
          categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={async (id) => {
            setShowCreate(false);
            await load();
            open(id);
          }}
        />
      )}
    </div>
  );
}

function CreateInventoryModal({
  businessId, categories, onClose, onCreated,
}: {
  businessId: string;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { error: notifError } = useNotificationStore();
  const [name, setName] = useState(`Inventaire du ${format(new Date(), 'dd/MM/yyyy')}`);
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      const id = await createInventorySession({ businessId, name: name.trim(), categoryId: categoryId || null });
      onCreated(id);
    } catch (err) {
      notifError(toUserError(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Nouvel inventaire"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary px-5">Annuler</button>
          <button onClick={handleCreate} disabled={saving || !name.trim()} className="btn-primary px-5 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Commencer le comptage
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="inv-name">Nom</label>
          <input id="inv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="inv-cat">Périmètre</label>
          <select id="inv-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tous les produits suivis</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="text-xs text-content-muted mt-1">
            Compter une catégorie à la fois évite de fermer la boutique. Seuls les produits comptés seront ajustés.
          </p>
        </div>
      </div>
    </Modal>
  );
}
