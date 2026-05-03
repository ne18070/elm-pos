'use client';
import { toUserError } from '@/lib/user-error';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as LucideIcons from 'lucide-react';
import {
  Check, ArrowRight, XCircle, ToggleLeft, ToggleRight, Loader2, Lock,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { hasFeature } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  getBusinessTypes, getAppModules,
  type BusinessTypeRow, type AppModule,
} from '@services/supabase/business-config';

// --- Icon resolver ------------------------------------------------------------

function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return (LucideIcons as Record<string, unknown>)[name] as React.ComponentType<{ className?: string }>
    ?? LucideIcons.Package;
}

// --- Accent color map ---------------------------------------------------------

const ACCENT_MAP: Record<string, { bg: string; border: string; icon: string }> = {
  brand:  { bg: 'bg-badge-brand',  border: 'border-brand-600',  icon: 'text-content-brand bg-badge-brand'  },
  orange: { bg: 'bg-badge-orange', border: 'border-orange-600', icon: 'text-status-orange bg-badge-orange' },
  purple: { bg: 'bg-badge-purple', border: 'border-purple-600', icon: 'text-status-purple bg-badge-purple' },
  teal:   { bg: 'bg-badge-teal',   border: 'border-teal-600',   icon: 'text-status-teal bg-badge-teal'   },
  red:    { bg: 'bg-badge-error',    border: 'border-red-600',    icon: 'text-status-error bg-badge-error'     },
  green:  { bg: 'bg-badge-success',  border: 'border-green-600',  icon: 'text-status-success bg-badge-success' },
};
const defaultAccent = { bg: 'bg-surface-card', border: 'border-surface-border', icon: 'text-content-secondary bg-surface-input' };

function accent(color: string) {
  return ACCENT_MAP[color] ?? defaultAccent;
}

// --- Page ---------------------------------------------------------------------

export default function ConfigurePage() {
  const router = useRouter();
  const { business, setBusiness } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [types,   setTypes]   = useState<BusinessTypeRow[]>([]);
  const [modules, setModules] = useState<AppModule[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Types définis par l'admin —le client ne peut pas les changer
  const businessTypes: string[] = business?.types?.length
    ? business.types
    : business?.type ? [business.type as string] : [];

  const [features, setFeatures] = useState<string[]>(business?.features ?? []);
  const [saving, setSaving] = useState(false);

  function toggleFeature(key: string) {
    setFeatures((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  }

  const isModuleEnabled = (moduleId: string) => features.includes(moduleId);

  useEffect(() => {
    async function load() {
      setLoadingConfig(true);
      try {
        const [t, m] = await Promise.all([getBusinessTypes(), getAppModules()]);
        setTypes(t);
        setModules(m);
      } finally {
        setLoadingConfig(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasChanged =
    JSON.stringify([...features].sort()) !== JSON.stringify([...(business?.features ?? [])].sort());

  async function handleSave() {
    if (!business) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('businesses')
        .update({ features })
        .eq('id', business.id);
      if (error) throw new Error(error.message);

      setBusiness({ ...business, features });
      success('Configuration enregistrée');
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loadingConfig) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-content-brand" />
      </div>
    );
  }

  const selectedTypes = types.filter((t) => businessTypes.includes(t.id));
  const ac = accent(selectedTypes[0]?.accent_color ?? 'brand');

  // Modules visibles = ceux que l'admin a activés pour ce store (business.features)
  // intersectés avec les modules globalement actifs (is_active=true dans app_modules)
  const adminFeatures = new Set(business?.features ?? []);
  const allowedModules = modules.filter((m) => adminFeatures.has(m.id));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* -- En-tête -- */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-content-primary">Configuration</h1>
          <p className="text-content-secondary">
            Activez ou désactivez les fonctionnalités disponibles pour votre établissement.
          </p>
        </div>

        {/* -- Types assignés (read-only) -- */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-content-primary">Type d&apos;établissement</h2>
            <span className="flex items-center gap-1 text-xs text-content-primary">
              <Lock className="w-3 h-3" /> Géré par l&apos;administrateur
            </span>
          </div>
          {selectedTypes.length === 0 ? (
            <p className="text-sm text-content-primary italic">Aucun type assigné —contactez l&apos;administrateur.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {selectedTypes.map((t) => {
                const Icon = getIcon(t.icon);
                const a = accent(t.accent_color);
                return (
                  <div
                    key={t.id}
                    className={cn(
                      'flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2',
                      a.border, a.bg
                    )}
                  >
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', a.icon)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-semibold text-content-primary">{t.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* -- Fonctionnalités (toggleable) -- */}
        {allowedModules.length === 0 ? (
          <p className="text-sm text-content-primary italic">
            Aucun module disponible —contactez l&apos;administrateur.
          </p>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-content-primary">Fonctionnalités actives</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allowedModules.map((m) => {
                const enabled = features.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleFeature(m.id)}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                      enabled
                        ? 'border-brand-600 bg-badge-brand'
                        : 'border-surface-border bg-surface-card hover:border-slate-600'
                    )}
                  >
                    {enabled
                      ? <ToggleRight className="w-7 h-7 text-content-brand shrink-0" />
                      : <ToggleLeft  className="w-7 h-7 text-content-muted shrink-0" />}
                    <div>
                      <p className={cn('text-sm font-semibold', enabled ? 'text-content-brand' : 'text-content-primary')}>
                        {m.label}
                      </p>
                      {m.description && (
                        <p className="text-xs text-content-primary mt-0.5">{m.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* -- Résumé -- */}
        {allowedModules.length > 0 && (
          <div className={cn('card p-5 border', ac.border)}>
            <p className="text-sm font-semibold text-content-primary mb-3">
              {features.length} fonctionnalité{features.length > 1 ? 's' : ''} active{features.length > 1 ? 's' : ''} sur {allowedModules.length} disponible{allowedModules.length > 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {allowedModules.filter((m) => features.includes(m.id)).map((m) => (
                <span key={m.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-badge-success border border-status-success text-status-success">
                  <Check className="w-3 h-3" />{m.label}
                </span>
              ))}
              {allowedModules.filter((m) => !features.includes(m.id)).map((m) => (
                <span key={m.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-surface-input text-content-muted">
                  <XCircle className="w-3 h-3" />{m.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* -- Actions -- */}
        <div className="flex items-center justify-between gap-4 pb-6">
          <button
            onClick={() => router.back()}
            className="btn-secondary h-10 px-5 text-sm"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanged}
            className="btn-primary h-10 px-6 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving
              ? 'Enregistrement…'
              : <><Check className="w-4 h-4" /> Confirmer la configuration</>}
            {!saving && hasChanged && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}


