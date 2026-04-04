'use client';
import { toUserError } from '@/lib/user-error';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as LucideIcons from 'lucide-react';
import {
  Check, ArrowRight, CheckCircle2, XCircle, ToggleLeft, ToggleRight, Loader2, Lock,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  getBusinessTypesWithModules, getAppModules,
  type BusinessTypeWithModules, type AppModule,
} from '@services/supabase/business-config';

// ─── Icon resolver ────────────────────────────────────────────────────────────

function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return (LucideIcons as Record<string, unknown>)[name] as React.ComponentType<{ className?: string }>
    ?? LucideIcons.Package;
}

// ─── Accent color map ─────────────────────────────────────────────────────────

const ACCENT_MAP: Record<string, { bg: string; border: string; icon: string }> = {
  brand:  { bg: 'bg-brand-900/30',  border: 'border-brand-600',  icon: 'text-brand-400 bg-brand-900/50'  },
  orange: { bg: 'bg-orange-900/20', border: 'border-orange-600', icon: 'text-orange-400 bg-orange-900/40' },
  purple: { bg: 'bg-purple-900/20', border: 'border-purple-600', icon: 'text-purple-400 bg-purple-900/40' },
  teal:   { bg: 'bg-teal-900/20',   border: 'border-teal-600',   icon: 'text-teal-400 bg-teal-900/40'   },
  red:    { bg: 'bg-red-900/20',    border: 'border-red-600',    icon: 'text-red-400 bg-red-900/40'     },
  green:  { bg: 'bg-green-900/20',  border: 'border-green-600',  icon: 'text-green-400 bg-green-900/40' },
};
const defaultAccent = { bg: 'bg-surface-card', border: 'border-surface-border', icon: 'text-slate-400 bg-surface-input' };

function accent(color: string) {
  return ACCENT_MAP[color] ?? defaultAccent;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigurePage() {
  const router = useRouter();
  const { business, setBusiness } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [types,   setTypes]   = useState<BusinessTypeWithModules[]>([]);
  const [modules, setModules] = useState<AppModule[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Types définis par l'admin — le client ne peut pas les changer
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

  useEffect(() => {
    async function load() {
      setLoadingConfig(true);
      try {
        const [t, m] = await Promise.all([getBusinessTypesWithModules(), getAppModules()]);
        setTypes(t);
        setModules(m);
        // Si pas encore de features → initialiser depuis les defaults des types assignés
        if (!business?.features?.length && businessTypes.length > 0) {
          const defaults = t
            .filter((x) => businessTypes.includes(x.id))
            .flatMap((x) => x.modules.filter((mod) => mod.is_default).map((mod) => mod.module_id));
          setFeatures(Array.from(new Set(defaults)));
        }
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
      router.push('/pos');
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loadingConfig) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    );
  }

  const selectedTypes = types.filter((t) => businessTypes.includes(t.id));
  const ac = accent(selectedTypes[0]?.accent_color ?? 'brand');

  // Union des modules liés à tous les types assignés
  const linkedModuleIds = new Set(selectedTypes.flatMap((t) => t.modules.map((m) => m.module_id)));
  const linkedModules = modules.filter((m) => linkedModuleIds.has(m.id));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── En-tête ── */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">Configuration</h1>
          <p className="text-slate-400">
            Activez ou désactivez les fonctionnalités disponibles pour votre établissement.
          </p>
        </div>

        {/* ── Types assignés (read-only) ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Type d&apos;établissement</h2>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Lock className="w-3 h-3" /> Géré par l&apos;administrateur
            </span>
          </div>
          {selectedTypes.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Aucun type assigné — contactez l&apos;administrateur.</p>
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
                    <span className="text-sm font-semibold text-white">{t.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Fonctionnalités (toggleable) ── */}
        {selectedTypes.length > 0 && linkedModules.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Fonctionnalités actives</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {linkedModules.map((m) => {
                const enabled = features.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleFeature(m.id)}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                      enabled
                        ? 'border-brand-600 bg-brand-900/20'
                        : 'border-surface-border bg-surface-card hover:border-slate-600'
                    )}
                  >
                    {enabled
                      ? <ToggleRight className="w-7 h-7 text-brand-400 shrink-0" />
                      : <ToggleLeft  className="w-7 h-7 text-slate-600 shrink-0" />}
                    <div>
                      <p className={cn('text-sm font-semibold', enabled ? 'text-brand-300' : 'text-slate-300')}>
                        {m.label}
                      </p>
                      {m.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Résumé ── */}
        {selectedTypes.length > 0 && (
          <div className={cn('card p-5 border', ac.border)}>
            <p className="text-sm font-semibold text-white mb-3">
              {selectedTypes.map((t) => t.label).join(' + ')} — {features.length} fonctionnalité{features.length > 1 ? 's' : ''} active{features.length > 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {modules.filter((m) => features.includes(m.id)).map((m) => (
                <span key={m.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-900/20 border border-green-800 text-green-300">
                  <Check className="w-3 h-3" />{m.label}
                </span>
              ))}
              {modules.filter((m) => !features.includes(m.id) && linkedModuleIds.has(m.id)).map((m) => (
                <span key={m.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-surface-input text-slate-600">
                  <XCircle className="w-3 h-3" />{m.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
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
