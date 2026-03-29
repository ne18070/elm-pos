'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, ChevronRight, X, Rocket } from 'lucide-react';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useAuthStore } from '@/store/auth';

export function OnboardingChecklist() {
  const { business } = useAuthStore();
  const { steps, doneCount, show, dismiss } = useOnboarding(business?.id, business?.type);

  if (!show) return null;

  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="card border border-brand-700 overflow-hidden">
      {/* En-tête */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">
              {business?.type === 'hotel' ? 'Bienvenue sur Elm Hôtel !' : 'Bienvenue sur Elm POS !'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {doneCount}/{steps.length} étapes complétées
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          title="Ne plus afficher"
          className="text-slate-500 hover:text-slate-300 shrink-0 mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Barre de progression */}
      <div className="px-5 pb-3">
        <div className="h-1.5 w-full bg-surface-input rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Étapes */}
      <div className="divide-y divide-surface-border border-t border-surface-border">
        {steps.map((step) => (
          <Link
            key={step.id}
            href={step.done ? '#' : step.href}
            className={`flex items-center gap-3 px-5 py-3 transition-colors
              ${step.done
                ? 'opacity-60 cursor-default'
                : 'hover:bg-surface-hover cursor-pointer'}`}
          >
            <div className="shrink-0">
              {step.done
                ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                : <Circle className="w-5 h-5 text-slate-600" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.done ? 'line-through text-slate-500' : 'text-white'}`}>
                {step.label}
              </p>
              {!step.done && (
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.description}</p>
              )}
            </div>
            {!step.done && <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
