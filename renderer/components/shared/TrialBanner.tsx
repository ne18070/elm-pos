'use client';

import { useRouter } from 'next/navigation';
import { Clock, Zap } from 'lucide-react';
import { useSubscriptionStore } from '@/store/subscription';

export function TrialBanner() {
  const router = useRouter();
  const { effectiveStatus, trialDaysRemaining } = useSubscriptionStore();

  const status = effectiveStatus();
  const days   = trialDaysRemaining();

  if (status !== 'trial') return null;

  const urgent = days <= 2;

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-xs font-medium
      ${urgent
        ? 'bg-red-900/40 border-b border-red-800 text-red-300'
        : 'bg-amber-900/30 border-b border-amber-800/50 text-amber-300'}`}
    >
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        {days === 0
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
        S'abonner
      </button>
    </div>
  );
}
