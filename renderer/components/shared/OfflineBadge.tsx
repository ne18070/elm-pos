'use client';

import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { cn } from '@/lib/utils';

/**
 * Badge persistant affiché quand l'application est hors ligne ou
 * qu'il y a des opérations en attente / en échec.
 * Visible dans la barre latérale et en bandeau si critique.
 */
export function OfflineBadge() {
  const { isOnline, syncing, pending, failed, flush, retryFailed } = useOfflineSync();

  // En ligne + rien en attente = ne rien afficher
  if (isOnline && pending === 0 && failed === 0) return null;

  const hasFailed = failed > 0;

  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2 text-xs flex flex-col gap-1',
        hasFailed
          ? 'bg-red-900/30 border border-red-800'
          : !isOnline
          ? 'bg-yellow-900/30 border border-yellow-800'
          : 'bg-blue-900/30 border border-blue-800'
      )}
    >
      {/* Ligne principale */}
      <div className="flex items-center gap-2">
        {hasFailed ? (
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        )}
        <span
          className={cn(
            'font-medium',
            hasFailed ? 'text-red-400' : 'text-yellow-400'
          )}
        >
          {!isOnline ? 'Hors ligne' : 'Synchronisation'}
        </span>
      </div>

      {/* Détails */}
      {(pending > 0 || failed > 0) && (
        <div className="text-slate-400 pl-5 space-y-0.5">
          {pending > 0 && <p>{pending} en attente</p>}
          {failed  > 0 && <p className="text-red-400">{failed} en échec</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1 mt-1">
        {isOnline && pending > 0 && (
          <button
            onClick={flush}
            disabled={syncing}
            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
            {syncing ? 'Sync...' : 'Sync'}
          </button>
        )}
        {failed > 0 && (
          <button
            onClick={retryFailed}
            className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Réessayer
          </button>
        )}
      </div>
    </div>
  );
}
