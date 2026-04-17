'use client';

import Link from 'next/link';
import {
  CheckCircle2, ChevronRight, X, Rocket,
  Tag, Package, Printer, Users, ShoppingCart,
  Building2, UserPlus, CalendarDays,
  FolderOpen, Receipt,
} from 'lucide-react';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useAuthStore } from '@/store/auth';

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  categories:  Tag,
  products:    Package,
  printer:     Printer,
  team:        Users,
  first_sale:  ShoppingCart,
  rooms:       Building2,
  guest:       UserPlus,
  reservation: CalendarDays,
  // juridique
  client:      UserPlus,
  dossier:     FolderOpen,
  honoraires:  Receipt,
};

export function OnboardingChecklist() {
  const { business } = useAuthStore();
  const { steps, doneCount, show, dismiss } = useOnboarding(business?.id, business?.type);

  if (!show) return null;

  const progress  = Math.round((doneCount / steps.length) * 100);
  const nextStep  = steps.find((s) => !s.done);

  return (
    <div className="card border border-brand-800/50 overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4 bg-brand-950/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
            <Rocket className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Configurez votre espace</p>
            <p className="text-xs text-brand-300 mt-0.5 font-medium">
              {doneCount}/{steps.length} étapes · {progress}%
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          title="Ne plus afficher"
          className="text-slate-600 hover:text-slate-300 transition-colors mt-0.5 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-surface-input">
        <div
          className="h-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="px-5 py-4 space-y-0">
        {steps.map((step, index) => {
          const Icon      = STEP_ICONS[step.id] ?? ChevronRight;
          const isActive  = step.id === nextStep?.id;
          const isLast    = index === steps.length - 1;

          return (
            <div key={step.id} className="flex gap-3">

              {/* Timeline column */}
              <div className="flex flex-col items-center shrink-0 w-7">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                  ${step.done
                    ? 'bg-green-500/15 border border-green-500/40 text-green-400'
                    : isActive
                      ? 'bg-brand-600 border border-brand-400 text-white shadow-[0_0_14px_rgba(37,99,235,0.45)]'
                      : 'bg-surface-input border border-surface-border text-slate-600'}`}
                >
                  {step.done
                    ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : index + 1}
                </div>
                {!isLast && (
                  <div className={`w-px flex-1 my-1 min-h-[12px] ${step.done ? 'bg-green-500/25' : 'bg-surface-border'}`} />
                )}
              </div>

              {/* Content column */}
              <div className={`flex-1 min-w-0 ${!isLast ? 'pb-1' : ''}`}>
                {isActive ? (
                  /* Active step — expanded card */
                  <div className="bg-brand-950/50 border border-brand-800/60 rounded-xl p-3.5 mb-1.5">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                      <p className="text-sm font-semibold text-white">{step.label}</p>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      {step.description}
                    </p>
                    <Link
                      href={step.href}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Commencer <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : (
                  /* Done or pending step — collapsed row */
                  <div className={`flex items-center gap-2 py-2 ${step.done ? 'opacity-45' : ''}`}>
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${step.done ? 'text-green-400' : 'text-slate-600'}`} />
                    <p className={`text-sm ${step.done ? 'line-through text-slate-500' : 'text-slate-500'}`}>
                      {step.label}
                    </p>
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
