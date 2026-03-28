'use client';

import { useRouter } from 'next/navigation';
import { Clock, Zap, AlertTriangle } from 'lucide-react';
import { useSubscriptionStore } from '@/store/subscription';

export function TrialBanner() {
  const router = useRouter();
  const { effectiveStatus, trialDaysRemaining, loaded } = useSubscriptionStore();

  // Attendre que le chargement soit terminé pour éviter un flash
  if (!loaded) return null;

  const status = effectiveStatus();
  const days   = trialDaysRemaining();

  // Abonnement actif → aucune bannière
  if (status === 'active') return null;

  // Aucun abonnement trouvé → alerte discrète
  if (status === 'none') {
    return (
      <div className="flex items-center justify-between px-4 py-2 text-xs font-medium bg-slate-800/60 border-b border-slate-700 text-slate-400">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Aucun abonnement actif
        </div>
        <button
          onClick={() => router.push('/billing')}
          className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-colors"
        >
          <Zap className="w-3 h-3" />
          S'abonner
        </button>
      </div>
    );
  }

  // Essai expiré → géré par le layout (redirect /billing), pas de bannière ici
  if (status === 'expired') return null;

  // Période d'essai en cours
  const urgent   = days <= 2;
  const isFirst  = days >= 6; // Premier ou deuxième jour → message d'accueil

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-xs font-medium
      ${urgent
        ? 'bg-red-900/40 border-b border-red-800 text-red-300'
        : 'bg-amber-900/30 border-b border-amber-800/50 text-amber-300'}`}
    >
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        {isFirst
          ? `Bienvenue ! Votre essai gratuit de 7 jours a commencé.`
          : days === 0
            ? 'Votre essai gratuit expire aujourd\'hui'
            : `Essai gratuit — ${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}`}
      </div>
      <button
        onClick={() => router.push('/billing')}
        className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-colors
          ${urgent
            ? 'bg-red-700 hover:bg-red-600 text-white'
            : 'bg-amber-700 hover:bg-amber-600 text-white'}`}
      >
        <Zap className="w-3 h-3" />
        {isFirst ? 'Voir les plans' : 'S\'abonner'}
      </button>
    </div>
  );
}
