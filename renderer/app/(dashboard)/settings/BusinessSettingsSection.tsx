import { useState, useEffect } from 'react';
import { Save, Loader2, Upload, ImageIcon, X, ToggleLeft, ToggleRight } from 'lucide-react';
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
    }
  }, [business]);

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
      await updateBusiness(business.id, {
        ...form,
        public_slug: slug,
        tax_rate: tax,
      });
      
      setBusiness({
        ...business,
        ...form,
        public_slug: slug,
        tax_rate: tax,
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
