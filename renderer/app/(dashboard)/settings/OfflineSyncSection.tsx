import { useState } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { flushSyncQueue } from '@/lib/ipc';
import { toUserError } from '@/lib/user-error';

export function OfflineSyncSection() {
  const { success, error: notifError } = useNotificationStore();
  const { isOnline, pending: pendingCount, syncing } = useOfflineSync();
  const [syncingNow, setSyncingNow] = useState(false);

  async function handleForceSync() {
    setSyncingNow(true);
    try {
      await flushSyncQueue();
      success('Synchronisation effectuée');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSyncingNow(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
        isOnline ? 'bg-badge-success/10 border-status-success/20' : 'bg-status-warning/10 border-status-warning/20'
      }`}>
        <div className={`p-2.5 rounded-xl ${isOnline ? 'bg-badge-success text-status-success' : 'bg-badge-warning text-status-warning'}`}>
          {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold uppercase tracking-tight ${isOnline ? 'text-status-success' : 'text-status-warning'}`}>
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </p>
          <p className="text-xs text-content-secondary mt-0.5">
            {isOnline 
              ? 'L\'application est synchronisée avec le serveur Cloud.' 
              : 'Les opérations sont enregistrées localement et seront synchronisées au retour de la connexion.'}
          </p>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="p-3 bg-brand-500/5 border border-brand-500/20 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
            <p className="text-xs text-content-brand font-bold uppercase tracking-wider">
              {pendingCount} opération{pendingCount > 1 ? 's' : ''} en attente
            </p>
          </div>
          {isOnline && !syncingNow && !syncing && (
            <button
              onClick={handleForceSync}
              className="text-xs font-black text-content-brand hover:underline"
            >
              Forcer la synchro
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleForceSync}
        disabled={syncingNow || syncing || !isOnline}
        className="w-full btn-secondary h-11 flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest"
      >
        {syncingNow || syncing ? <Loader2 className="w-4 h-4 animate-spin text-content-brand" /> : <Wifi className="w-4 h-4" />}
        {syncingNow || syncing ? 'Synchronisation en cours...' : 'Synchroniser manuellement'}
      </button>

      {!isOnline && (
        <p className="text-[10px] text-content-muted italic text-center">
          La synchronisation manuelle nécessite une connexion Internet active.
        </p>
      )}
    </div>
  );
}
