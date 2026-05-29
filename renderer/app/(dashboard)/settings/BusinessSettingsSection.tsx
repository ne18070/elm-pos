import { useState, useEffect, useCallback } from 'react';
import { Save, Loader2, Upload, ImageIcon, X, ToggleLeft, ToggleRight, Plus, Trash2, Clock } from 'lucide-react';
import type { EcheanceRule } from '@/lib/invoice-templates';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { updateBusiness, uploadBusinessLogo, deleteBusinessLogo } from '@services/supabase/business';
import { normalizeSlug, isValidUrl } from './settings-utils';
import { toUserError } from '@/lib/user-error';

export function BusinessSettingsSection() {
  const { business, setBusiness } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const DEFAULT_ECHEANCE_RULES: EcheanceRule[] = [
    { max:    500_000, label: 'Paiement comptant'    },
    { max:  1_000_000, label: 'Échéance : 2 jours'  },
    { max:  2_500_000, label: 'Échéance : 5 jours'  },
    { max: 10_000_000, label: 'Échéance : 7 jours'  },
    { max: 20_000_000, label: 'Échéance : 10 jours' },
    { max: 50_000_000, label: 'Échéance : 16 jours' },
    {                  label: 'Échéance : 30 jours' },
  ];

  const [form, setForm] = useState({
    name:           business?.name ?? '',
    public_slug:    business?.public_slug ?? '',
    denomination:   business?.denomination ?? '',
    rib:            business?.rib ?? '',
    address:        business?.address ?? '',
    phone:          business?.phone ?? '',
    tax_rate:       String(business?.tax_rate ?? '0'),
    tax_inclusive:  business?.tax_inclusive ?? false,
    currency:       business?.currency ?? 'XOF',
    receipt_footer: business?.receipt_footer ?? '',
  });

  const [echeanceEnabled, setEcheanceEnabled] = useState<boolean>(
    (business?.brand_config?.echeance_enabled as boolean | undefined) ?? false
  );
  const [echeanceRules, setEcheanceRules] = useState<EcheanceRule[]>(
    (business?.brand_config?.echeance_rules as EcheanceRule[] | undefined) ?? DEFAULT_ECHEANCE_RULES
  );

  useEffect(() => {
    if (business) {
      setForm({
        name:           business.name ?? '',
        public_slug:    business.public_slug ?? '',
        denomination:   business.denomination ?? '',
        rib:            business.rib ?? '',
        address:        business.address ?? '',
        phone:          business.phone ?? '',
        tax_rate:       String(business.tax_rate ?? '0'),
        tax_inclusive:  business.tax_inclusive ?? false,
        currency:       business.currency ?? 'XOF',
        receipt_footer: business.receipt_footer ?? '',
      });
      setEcheanceEnabled((business.brand_config?.echeance_enabled as boolean | undefined) ?? false);
      setEcheanceRules((business.brand_config?.echeance_rules as EcheanceRule[] | undefined) ?? DEFAULT_ECHEANCE_RULES);
    }
  }, [business]);

  const updateRule = useCallback((i: number, patch: Partial<EcheanceRule>) => {
    setEcheanceRules(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
    setIsDirty(true);
  }, []);

  const addRule = useCallback(() => {
    setEcheanceRules(prev => {
      // Insert before the last (fallback) entry
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { max: undefined, label: '' }, last];
    });
    setIsDirty(true);
  }, []);

  const removeRule = useCallback((i: number) => {
    setEcheanceRules(prev => prev.filter((_, idx) => idx !== i));
    setIsDirty(true);
  }, []);

  const handleChange = (patch: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  async function handleSave() {
    if (!business) return;
    
    // Validations
    const slug = normalizeSlug(form.public_slug);
    const tax = parseFloat(form.tax_rate);
    
    if (!form.name.trim()) { notifError('Le nom commercial est requis'); return; }
    if (isNaN(tax) || tax < 0 || tax > 100) { notifError('TVA invalide (0-100)'); return; }
    
    setSaving(true);
    try {
      const brand_config = {
        ...(business.brand_config ?? {}),
        echeance_enabled: echeanceEnabled,
        echeance_rules:   echeanceEnabled ? echeanceRules : undefined,
      };

      await updateBusiness(business.id, {
        ...form,
        public_slug: slug,
        tax_rate: tax,
        brand_config,
      });

      setBusiness({
        ...business,
        ...form,
        public_slug: slug,
        tax_rate: tax,
        brand_config,
      });
      
      setIsDirty(false);
      success('Paramètres de l\'établissement enregistrés');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadLogo(file: File) {
    if (!business) return;
    
    // Validation
    if (file.size > 2 * 1024 * 1024) { notifError('Fichier trop volumineux (max 2MB)'); return; }
    if (!file.type.startsWith('image/')) { notifError('Le fichier doit être une image'); return; }

    setUploadingLogo(true);
    try {
      const url = await uploadBusinessLogo(business.id, file);
      setBusiness({ ...business, logo_url: url });
      success('Logo mis à jour');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleDeleteLogo() {
    if (!business || !window.confirm('Supprimer le logo ?')) return;
    try {
      await deleteBusinessLogo(business.id);
      setBusiness({ ...business, logo_url: undefined });
      success('Logo supprimé');
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nom commercial *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange({ name: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="label">Nom sur les reçus <span className="text-content-muted font-normal">(si différent)</span></label>
          <input
            type="text"
            value={form.denomination}
            onChange={(e) => handleChange({ denomination: e.target.value })}
            className="input"
            placeholder="Affiché sur les reçus et factures"
          />
        </div>
      </div>

      <div>
        <label className="label">RIB / Coordonnées bancaires</label>
        <textarea
          value={form.rib}
          onChange={(e) => handleChange({ rib: e.target.value })}
          className="input min-h-[80px] py-3"
          placeholder="Saisir votre RIB..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Téléphone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => handleChange({ phone: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="label">Devise</label>
          <select
            value={form.currency}
            onChange={(e) => {
              const newCur = e.target.value;
              if (business?.currency && newCur !== business.currency) {
                if (!window.confirm('Changer la devise peut affecter la cohérence de vos anciens rapports de vente. Confirmer ?')) return;
              }
              handleChange({ currency: newCur });
            }}
            className="input"
          >
            <option value="XOF">XOF - Franc CFA</option>
            <option value="EUR">EUR - Euro</option>
            <option value="USD">USD - Dollar</option>
            <option value="GBP">GBP - Livre sterling</option>
            <option value="MAD">MAD - Dirham marocain</option>
            <option value="DZD">DZD - Dinar algérien</option>
            <option value="TND">TND - Dinar tunisien</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Adresse</label>
        <input
          type="text"
          value={form.address}
          onChange={(e) => handleChange({ address: e.target.value })}
          className="input"
        />
      </div>

      <div>
        <label className="label">Slug public</label>
        <input
          type="text"
          value={form.public_slug}
          onChange={(e) => handleChange({ public_slug: e.target.value })}
          className="input"
          placeholder="mon-business"
        />
        <p className="mt-1 text-xs text-content-muted">
          Utilisé dans les liens publics. Lettres, chiffres et tirets uniquement.
        </p>
      </div>

      <div>
        <label className="label">TVA (%)</label>
        <input
          type="number"
          min="0"
          max="100"
          step="any"
          value={form.tax_rate}
          onChange={(e) => handleChange({ tax_rate: e.target.value })}
          className="input"
        />
        {parseFloat(form.tax_rate) > 0 && (
          <button
            type="button"
            onClick={() => handleChange({ tax_inclusive: !form.tax_inclusive })}
            className="mt-2 flex items-center gap-2 text-sm text-content-primary hover:text-content-primary transition-colors"
          >
            {form.tax_inclusive
              ? <ToggleRight className="w-5 h-5 text-content-brand" />
              : <ToggleLeft  className="w-5 h-5 text-content-muted" />}
            <span>
              TVA incluse dans les prix
              <span className="ml-1 text-xs text-content-muted">
                ({form.tax_inclusive ? 'prix TTC saisis - TVA déduite' : 'prix HT saisis - TVA ajoutée'})
              </span>
            </span>
          </button>
        )}
      </div>

      <div>
        <label className="label">Message pied de reçu</label>
        <textarea
          value={form.receipt_footer}
          onChange={(e) => handleChange({ receipt_footer: e.target.value })}
          className="input resize-none"
          rows={2}
          placeholder="Merci de votre visite !"
        />
      </div>

      {/* ── Échéance ─────────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-surface-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-content-secondary" />
            <span className="text-sm font-semibold text-content-primary">Échéance sur factures</span>
          </div>
          <button
            type="button"
            onClick={() => { setEcheanceEnabled(v => !v); setIsDirty(true); }}
            className="flex items-center gap-2 text-sm text-content-primary transition-colors"
          >
            {echeanceEnabled
              ? <ToggleRight className="w-6 h-6 text-content-brand" />
              : <ToggleLeft  className="w-6 h-6 text-content-muted" />}
            <span className={echeanceEnabled ? 'text-content-brand font-medium' : 'text-content-muted'}>
              {echeanceEnabled ? 'Activée' : 'Désactivée'}
            </span>
          </button>
        </div>

        {echeanceEnabled && (
          <div className="rounded-xl border border-surface-border overflow-hidden">
            <div className="bg-surface px-4 py-2 border-b border-surface-border">
              <p className="text-xs text-content-secondary">
                Règles appliquées du haut vers le bas. La dernière ligne (sans seuil) est le cas par défaut.
              </p>
            </div>

            <div className="divide-y divide-surface-border">
              {echeanceRules.map((rule, i) => {
                const isLast = i === echeanceRules.length - 1;
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex items-center gap-2 flex-1">
                      {!isLast ? (
                        <>
                          <span className="text-xs text-content-muted shrink-0">Si total &lt;</span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={rule.max ?? ''}
                            onChange={e => updateRule(i, { max: e.target.value ? Number(e.target.value) : undefined })}
                            className="input w-32 text-right text-sm"
                            placeholder="500000"
                          />
                          <span className="text-xs text-content-muted shrink-0">F →</span>
                        </>
                      ) : (
                        <span className="text-xs text-content-muted shrink-0 w-[calc(128px+6rem)]">Sinon →</span>
                      )}
                      <input
                        type="text"
                        value={rule.label}
                        onChange={e => updateRule(i, { label: e.target.value })}
                        className="input flex-1 text-sm"
                        placeholder="ex: Échéance : 7 jours"
                      />
                    </div>
                    {!isLast && (
                      <button
                        type="button"
                        onClick={() => removeRule(i)}
                        className="p-1.5 rounded-lg text-content-muted hover:text-status-error hover:bg-badge-error transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2 border-t border-surface-border">
              <button
                type="button"
                onClick={addRule}
                className="flex items-center gap-1.5 text-xs text-content-brand hover:text-content-brand/80 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter une règle
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-surface-border">
        <label className="label flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" />Logo de l&apos;établissement</label>
        <div className="flex items-center gap-4">
          {business?.logo_url ? (
            <div className="w-20 h-20 rounded-2xl bg-surface-input border border-surface-border flex items-center justify-center overflow-hidden p-2">
              <img src={business.logo_url} alt="logo" className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-surface-input border border-surface-border flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-content-muted" />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="btn-secondary h-9 px-4 text-sm flex items-center gap-2 cursor-pointer">
              {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploadingLogo ? 'Chargement…' : 'Choisir un fichier'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadLogo(f); }}
              />
            </label>
            {business?.logo_url && (
              <button
                onClick={handleDeleteLogo}
                className="text-xs text-status-error hover:text-status-error/80 font-medium flex items-center gap-1 px-1"
              >
                <X className="w-3 h-3" /> Supprimer le logo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="pt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
        </button>
        {isDirty && !saving && (
          <button
            onClick={() => {
              if (business) {
                setForm({
                  name:           business.name ?? '',
                  public_slug:    business.public_slug ?? '',
                  denomination:   business.denomination ?? '',
                  rib:            business.rib ?? '',
                  address:        business.address ?? '',
                  phone:          business.phone ?? '',
                  tax_rate:       String(business.tax_rate ?? '0'),
                  tax_inclusive:  business.tax_inclusive ?? false,
                  currency:       business.currency ?? 'XOF',
                  receipt_footer: business.receipt_footer ?? '',
                });
                setIsDirty(false);
              }
            }}
            className="text-xs text-content-muted hover:text-content-primary"
          >
            Annuler les changements
          </button>
        )}
        {isDirty && (
          <span className="text-[10px] bg-brand-500/10 text-content-brand px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Modifié
          </span>
        )}
      </div>
    </div>
  );
}
