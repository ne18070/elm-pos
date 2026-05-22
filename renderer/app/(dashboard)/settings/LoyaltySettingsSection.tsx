'use client';

import { useState, useEffect } from 'react';
import { Save, Loader2, ToggleLeft, ToggleRight, Star } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { getLoyaltyConfig, saveLoyaltyConfig, type LoyaltyConfig } from '@services/supabase/loyalty';
import { cn } from '@/lib/utils';

const DEFAULTS: Omit<LoyaltyConfig, 'business_id'> = {
  is_active:   false,
  earn_per:    1000,
  point_value: 5,
  min_redeem:  100,
};

export function LoyaltySettingsSection() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [form,    setForm]    = useState<Omit<LoyaltyConfig, 'business_id'>>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    setLoading(true);
    getLoyaltyConfig(business.id)
      .then(cfg => setForm({ is_active: cfg.is_active, earn_per: cfg.earn_per, point_value: cfg.point_value, min_redeem: cfg.min_redeem }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [business?.id]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!business?.id) return;
    setSaving(true);
    try {
      await saveLoyaltyConfig({ ...form, business_id: business.id });
      success('Programme de fidélité mis à jour');
    } catch (e: any) {
      notifError(e.message ?? 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  // Simulation for 100 000 CFA
  const exampleSpend = 100_000;
  const examplePts   = Math.floor(exampleSpend / Math.max(1, form.earn_per));
  const exampleCash  = examplePts * form.point_value;
  const examplePct   = exampleSpend > 0 ? ((exampleCash / exampleSpend) * 100).toFixed(2) : '0';

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-content-muted text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Active toggle */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-surface-border bg-surface-input">
        <div>
          <p className="font-semibold text-content-primary text-sm">Activer le programme de fidélité</p>
          <p className="text-xs text-content-muted mt-0.5">
            Les points s'accumulent automatiquement à chaque paiement client
          </p>
        </div>
        <button
          onClick={() => set('is_active', !form.is_active)}
          className={cn('shrink-0 transition-colors', form.is_active ? 'text-brand-500' : 'text-content-muted hover:text-content-secondary')}
        >
          {form.is_active
            ? <ToggleRight className="w-10 h-10" />
            : <ToggleLeft  className="w-10 h-10" />}
        </button>
      </div>

      {/* Config fields */}
      <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4 transition-opacity', !form.is_active && 'opacity-40 pointer-events-none')}>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-content-secondary uppercase tracking-wider">
            Achat par point
          </label>
          <p className="text-[11px] text-content-muted">1 point gagné par X CFA dépensés</p>
          <div className="relative mt-1">
            <input
              type="number" min={1}
              value={form.earn_per}
              onChange={e => set('earn_per', Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 pr-12 py-2.5 rounded-xl bg-surface-input border border-surface-border text-sm text-content-primary"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-content-muted">CFA</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-content-secondary uppercase tracking-wider">
            Valeur d'un point
          </label>
          <p className="text-[11px] text-content-muted">Équivalent CFA lors du rachat</p>
          <div className="relative mt-1">
            <input
              type="number" min={1}
              value={form.point_value}
              onChange={e => set('point_value', Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 pr-14 py-2.5 rounded-xl bg-surface-input border border-surface-border text-sm text-content-primary"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-content-muted">CFA/pt</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-content-secondary uppercase tracking-wider">
            Minimum pour échanger
          </label>
          <p className="text-[11px] text-content-muted">Points requis avant tout rachat</p>
          <div className="relative mt-1">
            <input
              type="number" min={1}
              value={form.min_redeem}
              onChange={e => set('min_redeem', Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 pr-10 py-2.5 rounded-xl bg-surface-input border border-surface-border text-sm text-content-primary"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-content-muted">pts</span>
          </div>
        </div>
      </div>

      {/* Live simulation */}
      {form.is_active && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-400/5 border border-yellow-400/20">
          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 mt-0.5 shrink-0" />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-content-primary text-xs uppercase tracking-wider mb-2">Simulation — achat de 100 000 CFA</p>
            <p className="text-content-secondary">
              Le client gagne{' '}
              <span className="font-bold text-yellow-500">{examplePts} point{examplePts > 1 ? 's' : ''}</span>
            </p>
            <p className="text-content-secondary">
              Valeur rachat :{' '}
              <span className="font-bold text-green-500">{exampleCash.toLocaleString('fr-FR')} CFA</span>
              {' '}({examplePct}% de remise effective)
            </p>
            <p className="text-xs text-content-muted mt-1">
              Seuil minimum : {form.min_redeem} pts = {(form.min_redeem * form.point_value).toLocaleString('fr-FR')} CFA
            </p>
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
