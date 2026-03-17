'use client';

import { WifiOff } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';

/**
 * Bandeau rouge discret en haut de la caisse quand l'app est hors ligne.
 * Rassure le caissier : il peut continuer à encaisser, les ventes seront
 * synchronisées automatiquement à la reconnexion.
 */
export function OfflineBanner() {
  const { isOnline, pending } = useOfflineSync();

  if (isOnline) return null;

  return (
    <div className="w-full bg-yellow-900/80 border-b border-yellow-700 px-4 py-2
                    flex items-center gap-2 text-yellow-300 text-sm z-20">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        <strong>Mode hors ligne</strong> — les ventes sont enregistrées localement.
        {pending > 0 && ` ${pending} en attente de synchronisation.`}
      </span>
    </div>
  );
}
