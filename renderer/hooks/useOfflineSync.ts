'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getSyncStatus,
  flushSyncQueue,
  retryFailedSync,
  onSyncStarted,
  onSyncComplete,
  onNetworkOnline,
  type SyncStats,
} from '@/lib/ipc';

export interface OfflineSyncState {
  isOnline:    boolean;
  syncing:     boolean;
  pending:     number;
  failed:      number;
  synced:      number;
  flush:       () => Promise<void>;
  retryFailed: () => Promise<void>;
}

export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline] = useState(true);
  const [stats, setStats]       = useState<SyncStats>({
    pending: 0, failed: 0, synced: 0, syncing: false,
  });

  const refreshStats = useCallback(async () => {
    const s = await getSyncStatus();
    setStats(s);
  }, []);

  useEffect(() => {
    // Statut réseau initial
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }

    // Événements réseau navigateur
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Événements IPC sync
    const unOnline   = onNetworkOnline(() => setIsOnline(true));
    const unStarted  = onSyncStarted(() =>
      setStats((s) => ({ ...s, syncing: true }))
    );
    const unComplete = onSyncComplete(({ stats: newStats }) => {
      setStats({ ...newStats, syncing: false });
    });

    // Chargement initial
    refreshStats();

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      unOnline();
      unStarted();
      unComplete();
    };
  }, [refreshStats]);

  const flush = useCallback(async () => {
    await flushSyncQueue();
    await refreshStats();
  }, [refreshStats]);

  const retryFailed = useCallback(async () => {
    await retryFailedSync();
    await refreshStats();
  }, [refreshStats]);

  return {
    isOnline,
    syncing:  stats.syncing,
    pending:  stats.pending,
    failed:   stats.failed,
    synced:   stats.synced,
    flush,
    retryFailed,
  };
}
