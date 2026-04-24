'use client';

import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { cn } from '@/lib/utils';

/**
 * Badge persistant affiché quand l'application est hors ligne ou
 * qu'il y a des opérations en attente / en échec.
 * Visible dans la barre latérale et en bandeau si critique.
 */
export function OfflineBadge({ compact = false }: { compact?: boolean }) {
  const { isOnline, syncing, pending, failed, flush, retryFailed } = useOfflineSync();

  // En ligne + rien en attente = ne rien afficher
  if (isOnline && pending === 0 && failed === 0) return null;

  // Version compacte pour la top bar mobile
  if (compact) {
    const hasFailed = failed > 0;
    return (
      <div className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium',
        hasFailed ? 'bg-badge-error text-status-error' : 'bg-yellow-900/40 text-status-warning'
      )}>
        {hasFailed
          ? <AlertTriangle className="w-3.5 h-3.5" />
          : <WifiOff className="w-3.5 h-3.5" />}
        {(pending + failed) > 0 && <span>{pending + failed}</span>}
      </div>
    );
  }

  const hasFailed = failed > 0;

  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2 text-xs flex flex-col gap-1',
        hasFailed
          ? 'bg-badge-error border border-status-error'
          : !isOnline
          ? 'bg-yellow-900/30 border border-yellow-800'
          : 'bg-badge-info border border-blue-800'
      )}
    >
      {/* Ligne principale */}
      <div className="flex items-center gap-2">
        {hasFailed ? (
          <AlertTriangle className="w-3.5 h-3.5 text-status-error shrink-0" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-status-warning shrink-0" />
        )}
        <span
          className={cn(
            'font-medium',
            hasFailed ? 'text-status-error' : 'text-status-warning'
          )}
        >
          {!isOnline ? 'Hors ligne' : 'Synchronisation'}
        </span>
      </div>

      {/* Détails */}
      {(pending > 0 || failed > 0) && (
        <div className="text-content-secondary pl-5 space-y-0.5">
          {pending > 0 && <p>{pending} en attente</p>}
          {failed  > 0 && <p className="text-status-error">{failed} en échec</p>}
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
            className="flex items-center gap-1 text-status-error hover:text-status-error transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Réessayer
          </button>
        )}
      </div>
    </div>
  );
}
