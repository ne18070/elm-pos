'use client';

import { useEffect, useState } from 'react';
import { Ban, LockOpen, X, RefreshCw } from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { cn } from '@/lib/utils';
import { setOrganizationBlocked, type OrganizationBlock } from '@services/supabase/business';

export interface OrganizationBlockTarget {
  organizationId: string;
  name: string;
}

/**
 * Confirmation de blocage / déblocage d'une organisation (migration 166).
 * Utilisé par /backoffice/structures et /backoffice/abonnements.
 * `block` : blocage en cours de l'organisation (undefined = non bloquée).
 */
export function OrganizationBlockModal({
  target, block, onClose, onDone,
}: {
  target: OrganizationBlockTarget | null;
  block: OrganizationBlock | undefined;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const { error: notifError, success: notifSuccess } = useNotificationStore();
  const [reason, setReason]   = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => { setReason(''); }, [target?.organizationId]);

  if (!target) return null;

  const handleConfirm = async () => {
    const blocking = !block;
    setWorking(true);
    try {
      const { banned, restored } = await setOrganizationBlocked(target.organizationId, blocking, reason);
      notifSuccess(blocking
        ? `${target.name} bloquée · ${banned} compte${banned > 1 ? 's' : ''} suspendu${banned > 1 ? 's' : ''}`
        : `${target.name} débloquée · ${restored} compte${restored > 1 ? 's' : ''} réactivé${restored > 1 ? 's' : ''}`);
      onClose();
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setWorking(false);
      // Le blocage peut être enregistré même si la synchro des comptes a échoué
      await onDone();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className={cn(
        "bg-surface-card rounded-2xl shadow-xl w-full max-w-sm border",
        block ? "border-status-success/30" : "border-status-warning/30",
      )}>
        <div className="flex items-center gap-3 p-5 border-b border-surface-border">
          <div className={cn("p-2 rounded-xl shrink-0", block ? "bg-badge-success text-status-success" : "bg-badge-warning text-status-warning")}>
            {block ? <LockOpen className="w-5 h-5" /> : <Ban className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-content-primary">{block ? "Débloquer l'organisation" : "Bloquer l'organisation"}</p>
            <p className="text-xs text-content-muted mt-0.5 truncate">{target.name}</p>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {block ? (
            <>
              <p className="text-sm text-content-secondary">
                Les comptes du propriétaire et des employés seront réactivés, la boutique en ligne
                et l&apos;annuaire réaffichés, et les commandes à nouveau acceptées.
              </p>
              {block.reason && (
                <p className="text-xs text-content-muted bg-surface-input border border-surface-border rounded-xl px-3 py-2">
                  <span className="font-bold">Motif du blocage :</span> {block.reason}
                </p>
              )}
            </>
          ) : (
            <>
              <ul className="text-sm text-content-secondary space-y-1.5 list-disc pl-5">
                <li>Le propriétaire et les employés sont déconnectés et ne peuvent plus se connecter</li>
                <li>Boutique en ligne et annuaire masqués</li>
                <li>Nouvelles commandes et API refusées</li>
              </ul>
              <div>
                <label htmlFor="block-reason" className="label text-[10px] uppercase font-bold tracking-widest text-content-muted">Motif (interne, facultatif)</label>
                <textarea
                  id="block-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  className="input min-h-[80px] py-3 text-sm"
                  placeholder="Ex : impayé, fraude signalée…"
                />
              </div>
            </>
          )}
          <p className="text-xs text-content-muted bg-badge-info border border-status-info/20 rounded-xl px-3 py-2">
            Aucune donnée n&apos;est modifiée ni supprimée (commandes, produits, clients, abonnement).
            {!block && ' Un déblocage rétablit tout à l’identique.'}
          </p>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={working}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all",
              block ? "bg-status-success" : "bg-status-warning",
            )}
          >
            {working
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> En cours…</>
              : block
                ? <><LockOpen className="w-4 h-4" /> Débloquer</>
                : <><Ban className="w-4 h-4" /> Bloquer</>}
          </button>
        </div>
      </div>
    </div>
  );
}
