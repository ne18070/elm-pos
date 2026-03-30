import { toUserError } from '@/lib/user-error';
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag, Utensils, Briefcase, BedDouble,
  Check, ArrowRight, CheckCircle2, XCircle, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { BusinessType } from '@pos-types';

// ─── Matrice de fonctionnalités par type ─────────────────────────────────────

interface Feature { label: string; active: boolean }

const TYPE_CONFIG: Record<BusinessType, {
  icon:        React.ComponentType<{ className?: string }>;
  label:       string;
  description: string;
  accentBg:    string;
  accentBorder:string;
  accentIcon:  string;
  features:    Feature[];
}> = {
  retail: {
    icon:         ShoppingBag,
    label:        'Commerce / Boutique',
    description:  'Vente au détail, gestion de stock et livraisons aux clients',
    accentBg:     'bg-brand-900/30',
    accentBorder: 'border-brand-600',
    accentIcon:   'text-brand-400 bg-brand-900/50',
    features: [
      { label: 'Caisse & encaissement',    active: true  },
      { label: 'Produits & gestion stock', active: true  },
      { label: 'Approvisionnement',        active: true  },
      { label: 'Livraisons & picking',     active: true  },
      { label: 'Revendeurs & grossistes',  active: true  },
      { label: 'Coupons promotionnels',    active: true  },
      { label: 'Comptabilité & journal',   active: true  },
      { label: 'Module hôtel',             active: false },
    ],
  },
  restaurant: {
    icon:         Utensils,
    label:        'Restaurant / Café',
    description:  'Restauration, bar, commandes en salle et à emporter',
    accentBg:     'bg-orange-900/20',
    accentBorder: 'border-orange-600',
    accentIcon:   'text-orange-400 bg-orange-900/40',
    features: [
      { label: 'Caisse & encaissement',    active: true  },
      { label: 'Produits & gestion stock', active: true  },
      { label: 'Approvisionnement',        active: true  },
      { label: 'Livraisons & picking',     active: true  },
      { label: 'Coupons promotionnels',    active: true  },
      { label: 'Comptabilité & journal',   active: true  },
      { label: 'Revendeurs & grossistes',  active: false },
      { label: 'Module hôtel',             active: false },
    ],
  },
  service: {
    icon:         Briefcase,
    label:        'Prestation de service',
    description:  'Factures, devis et services professionnels',
    accentBg:     'bg-purple-900/20',
    accentBorder: 'border-purple-600',
    accentIcon:   'text-purple-400 bg-purple-900/40',
    features: [
      { label: 'Caisse & encaissement',    active: true  },
      { label: 'Catalogue de services',    active: true  },
      { label: 'Gestion des commandes',    active: true  },
      { label: 'Comptabilité & journal',   active: true  },
      { label: 'Produits & gestion stock', active: false },
      { label: 'Livraisons & picking',     active: false },
      { label: 'Revendeurs & grossistes',  active: false },
      { label: 'Coupons promotionnels',    active: false },
      { label: 'Module hôtel',             active: false },
    ],
  },
  hotel: {
    icon:         BedDouble,
    label:        'Hôtel / Hébergement',
    description:  'Chambres, réservations, check-in / check-out et prestations',
    accentBg:     'bg-teal-900/20',
    accentBorder: 'border-teal-600',
    accentIcon:   'text-teal-400 bg-teal-900/40',
    features: [
      { label: 'Caisse & encaissement',    active: true  },
      { label: 'Gestion des chambres',     active: true  },
      { label: 'Réservations & séjours',   active: true  },
      { label: 'Check-in / Check-out',     active: true  },
      { label: 'Coupons promotionnels',    active: true  },
      { label: 'Comptabilité & journal',   active: true  },
      { label: 'Produits & gestion stock', active: false },
      { label: 'Livraisons & picking',     active: false },
      { label: 'Revendeurs & grossistes',  active: false },
    ],
  },
};

const TYPES = Object.entries(TYPE_CONFIG) as [BusinessType, (typeof TYPE_CONFIG)[BusinessType]][];

// ─── Options supplémentaires par type ────────────────────────────────────────

const TYPE_OPTIONS: Partial<Record<BusinessType, { key: string; label: string; description: string }[]>> = {
  hotel: [
    { key: 'pos', label: 'Caisse POS', description: 'Activer la vente de produits (bar, boutique…) en plus du module hôtel' },
  ],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigurePage() {
  const router = useRouter();
  const { business, setBusiness } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [selected, setSelected] = useState<BusinessType>(
    (business?.type as BusinessType) ?? 'retail'
  );
  const [features, setFeatures] = useState<string[]>(business?.features ?? []);
  const [saving, setSaving] = useState(false);

  function toggleFeature(key: string) {
    setFeatures((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  }

  const hasChanged =
    selected !== business?.type ||
    JSON.stringify([...features].sort()) !== JSON.stringify([...(business?.features ?? [])].sort());

  async function handleSave() {
    if (!business) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('businesses')
        .update({ type: selected, features })
        .eq('id', business.id);
      if (error) throw new Error(error.message);

      // Mise à jour du store local
      setBusiness({ ...business, type: selected, features });
      success('Configuration enregistrée');
      router.push('/pos');
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* ── En-tête ── */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">Type d&apos;établissement</h1>
          <p className="text-slate-400">
            Choisissez votre activité — seules les fonctionnalités utiles seront affichées dans le menu.
          </p>
        </div>

        {/* ── Grille des types ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {TYPES.map(([type, cfg]) => {
            const Icon = cfg.icon;
            const isSelected = selected === type;
            return (
              <button
                key={type}
                onClick={() => setSelected(type)}
                className={cn(
                  'relative text-left rounded-2xl border-2 p-5 transition-all duration-150',
                  'flex flex-col gap-4',
                  isSelected
                    ? cn('border-2', cfg.accentBorder, cfg.accentBg)
                    : 'border-surface-border bg-surface-card hover:border-slate-600 hover:bg-surface-hover'
                )}
              >
                {/* Coche sélection */}
                {isSelected && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}

                {/* Icône */}
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', cfg.accentIcon)}>
                  <Icon className="w-6 h-6" />
                </div>

                {/* Titre + description */}
                <div>
                  <p className="font-semibold text-white">{cfg.label}</p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{cfg.description}</p>
                </div>

                {/* Fonctionnalités */}
                <ul className="space-y-1.5 mt-auto">
                  {cfg.features.map((f) => (
                    <li key={f.label} className={cn(
                      'flex items-center gap-2 text-xs',
                      f.active ? 'text-slate-200' : 'text-slate-600'
                    )}>
                      {f.active
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        : <XCircle      className="w-3.5 h-3.5 text-slate-700 shrink-0" />}
                      {f.label}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* ── Options supplémentaires (selon type) ── */}
        {TYPE_OPTIONS[selected] && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Options supplémentaires</h2>
            {TYPE_OPTIONS[selected]!.map(({ key, label, description }) => {
              const enabled = features.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleFeature(key)}
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
                      {label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Résumé sélection ── */}
        {(() => {
          const cfg = TYPE_CONFIG[selected];
          const active   = cfg.features.filter((f) => f.active);
          const inactive = cfg.features.filter((f) => !f.active);
          return (
            <div className={cn('card p-5 border', cfg.accentBorder)}>
              <p className="text-sm font-semibold text-white mb-3">
                {cfg.label} — {active.length} fonctionnalité{active.length > 1 ? 's' : ''} active{active.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {active.map((f) => (
                  <span key={f.label} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-900/20 border border-green-800 text-green-300">
                    <Check className="w-3 h-3" />{f.label}
                  </span>
                ))}
                {inactive.map((f) => (
                  <span key={f.label} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-surface-input text-slate-600">
                    <XCircle className="w-3 h-3" />{f.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

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
