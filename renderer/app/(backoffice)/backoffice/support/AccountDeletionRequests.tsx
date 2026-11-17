'use client';

import { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { Badge, Button } from '@/components/ui';
import { ConfirmModal } from '@/components/ui/Modal';
import {
  getPendingAccountDeletionRequests, markAccountDeletionProcessed,
  type AccountDeletionRequest,
} from '@services/supabase/support';
import { deleteAccount } from '@services/supabase/subscriptions';

// Demandes faites depuis l'app ELM Boutique (« Supprimer mon compte », App Store 5.1.1(v)).
// L'app annonce un traitement sous 30 jours.
const DEADLINE_DAYS = 30;

type Pending = { request: AccountDeletionRequest; action: 'delete' | 'close' };

function daysLeft(createdAt: string) {
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return Math.ceil(DEADLINE_DAYS - elapsed);
}

export function AccountDeletionRequests({ refreshKey }: { refreshKey: number }) {
  const { user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [requests, setRequests] = useState<AccountDeletionRequest[]>([]);
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getPendingAccountDeletionRequests()
      .then(setRequests)
      .catch(() => notifError('Impossible de charger les demandes de suppression de compte.'));
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run({ request, action }: Pending) {
    if (!user) return;
    setConfirming(null);
    setBusyId(request.id);
    const who = request.email ?? 'ce compte';
    try {
      // Compte encore présent : suppression complète (compte, organisation, boutiques et
      // leurs données — /api/admin/delete-account). La demande survit (user_id → NULL).
      if (action === 'delete' && request.user_id) await deleteAccount(request.user_id);
      await markAccountDeletionProcessed(request.id, user.id);
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      success(action === 'delete' ? `Compte ${who} supprimé.` : `Demande de ${who} close.`);
    } catch (e) {
      notifError(e instanceof Error ? e.message : 'Suppression impossible. Réessayez.');
    } finally {
      setBusyId(null);
    }
  }

  // Rien à traiter : pas d'encadré
  if (requests.length === 0) return null;

  return (
    <section className="card p-5 space-y-4 border-status-error/30">
      <div className="flex items-start gap-3">
        <UserX className="w-5 h-5 text-status-error shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-content-primary">
            Demandes de suppression de compte ({requests.length})
          </h2>
          <p className="text-sm text-content-secondary mt-0.5">
            Envoyées depuis l’app ELM Boutique, à traiter sous {DEADLINE_DAYS} jours. Vérifiez qu’aucun
            abonnement en cours ou litige n’impose d’attendre, puis supprimez le compte.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-surface-border">
        {requests.map((r) => {
          const left = daysLeft(r.created_at);
          const busy = busyId === r.id;
          return (
            <li key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-content-primary select-all">{r.email ?? 'Email inconnu'}</span>
                  <Badge tone={left <= 7 ? 'error' : 'warning'}>
                    {left > 0 ? `${left} j restants` : `En retard de ${-left} j`}
                  </Badge>
                  {!r.user_id && <Badge>Compte déjà supprimé</Badge>}
                </div>
                <p className="text-xs text-content-muted mt-0.5">
                  Demandé le {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                {r.reason && <p className="text-sm text-content-secondary mt-1">« {r.reason} »</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                {r.user_id ? (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy}
                    disabled={busyId !== null}
                    onClick={() => setConfirming({ request: r, action: 'delete' })}
                  >
                    Supprimer le compte
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy}
                    disabled={busyId !== null}
                    onClick={() => setConfirming({ request: r, action: 'close' })}
                  >
                    Clore la demande
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {confirming && (
        <ConfirmModal
          type={confirming.action === 'delete' ? 'danger' : 'primary'}
          title={confirming.action === 'delete' ? 'Supprimer ce compte ?' : 'Clore la demande ?'}
          message={
            confirming.action === 'delete'
              ? `${confirming.request.email ?? 'Ce compte'} sera supprimé avec son organisation et toutes ses boutiques (produits, ventes, clients, caisse). Les factures d’abonnement sont conservées. Action irréversible.`
              : 'Le compte n’existe plus : la demande sera marquée comme traitée.'
          }
          confirmLabel={confirming.action === 'delete' ? 'Supprimer définitivement' : 'Clore la demande'}
          onConfirm={() => run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  );
}
