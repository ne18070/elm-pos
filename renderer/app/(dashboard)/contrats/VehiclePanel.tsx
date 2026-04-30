import { useState } from 'react';
import { X, Car, Loader2 } from 'lucide-react';
import { SlidePanel, Field } from './SharedComponents';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';
import {
  uploadVehicleImage, updateVehicle, createVehicle,
  type RentalVehicle
} from '@services/supabase/contracts';

export function VehiclePanel({
  vehicle, businessId, currency, onClose, onSaved, notifError, notifSuccess,
}: {
  vehicle: RentalVehicle | null;
  businessId: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  notifError: (m: string) => void;
  notifSuccess: (m: string) => void;
}) {
  const [saving, setSaving]         = useState(false);
  const [imageFile, setImageFile]   = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(vehicle?.image_url ?? '');

  const [form, setForm] = useState({
    name:           vehicle?.name ?? '',
    brand:          vehicle?.brand ?? '',
    model:          vehicle?.model ?? '',
    year:           vehicle?.year?.toString() ?? '',
    license_plate:  vehicle?.license_plate ?? '',
    color:          vehicle?.color ?? '',
    price_per_day:  vehicle?.price_per_day.toString() ?? '0',
    price_per_hour: vehicle?.price_per_hour?.toString() ?? '',
    deposit_amount: vehicle?.deposit_amount.toString() ?? '0',
    currency:       vehicle?.currency ?? currency,
    description:    vehicle?.description ?? '',
    is_available:   vehicle?.is_available ?? true,
    owner_type:      vehicle?.owner_type ?? 'owned',
    owner_name:      vehicle?.owner_name ?? '',
    owner_phone:     vehicle?.owner_phone ?? '',
    commission_type: vehicle?.commission_type ?? 'percent',
    commission_value: vehicle?.commission_value?.toString() ?? '0',
  });

  function set(k: string, v: string | boolean) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.name.trim()) { notifError('Nom du véhicule requis'); return; }
    setSaving(true);
    try {
      let imageUrl = vehicle?.image_url ?? null;
      if (imageFile) {
        imageUrl = await uploadVehicleImage(businessId, imageFile);
      }
      const payload = {
        name:           form.name.trim(),
        brand:          form.brand || null,
        model:          form.model || null,
        year:           form.year ? parseInt(form.year) : null,
        license_plate:  form.license_plate || null,
        color:          form.color || null,
        price_per_day:  parseFloat(form.price_per_day) || 0,
        price_per_hour: form.price_per_hour ? parseFloat(form.price_per_hour) : null,
        deposit_amount: parseFloat(form.deposit_amount) || 0,
        currency:       form.currency,
        description:    form.description || null,
        image_url:      imageUrl,
        is_available:   form.is_available,
        owner_type:      form.owner_type as 'owned' | 'third_party',
        owner_name:      form.owner_type === 'third_party' ? form.owner_name.trim() || null : null,
        owner_phone:     form.owner_type === 'third_party' ? form.owner_phone.trim() || null : null,
        commission_type: form.commission_type as 'percent' | 'fixed',
        commission_value: parseFloat(form.commission_value) || 0,
      };
      if (vehicle) {
        await updateVehicle(vehicle.id, payload);
        notifSuccess('Véhicule mis à jour');
      } else {
        await createVehicle(businessId, payload);
        notifSuccess('Véhicule ajouté');
      }
      onSaved();
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlidePanel title={vehicle ? 'Modifier le véhicule' : 'Nouveau véhicule'} onClose={onClose}>
      <div className="space-y-4">
        {/* Image */}
        <label className="block cursor-pointer">
          <p className="text-xs text-content-secondary mb-1">Photo</p>
          {imagePreview
            ? <div className="relative w-fit">
                <img src={imagePreview} alt="" className="h-32 w-auto rounded-xl object-cover border border-surface-border" />
                <button type="button" onClick={(e) => { e.preventDefault(); setImagePreview(''); setImageFile(null); }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            : <div className="h-24 border-2 border-dashed border-surface-border rounded-xl flex items-center justify-center text-content-muted hover:border-brand-500 transition-colors">
                <Car className="w-6 h-6" />
              </div>
          }
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setImageFile(f);
              setImagePreview(URL.createObjectURL(f));
            }} />
        </label>

        <Field label="Nom *" value={form.name} onChange={(v) => set('name', v)} placeholder="Toyota Corolla" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marque" value={form.brand} onChange={(v) => set('brand', v)} placeholder="Toyota" />
          <Field label="Modèle" value={form.model} onChange={(v) => set('model', v)} placeholder="Corolla" />
          <Field label="Année" value={form.year} onChange={(v) => set('year', v)} placeholder="2022" type="number" />
          <Field label="Couleur" value={form.color} onChange={(v) => set('color', v)} placeholder="Blanc" />
        </div>
        <Field label="Immatriculation" value={form.license_plate} onChange={(v) => set('license_plate', v)} placeholder="AB-123-CD" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix/jour *" value={form.price_per_day} onChange={(v) => set('price_per_day', v)} type="number" />
          <Field label="Prix/heure" value={form.price_per_hour} onChange={(v) => set('price_per_hour', v)} type="number" />
          <Field label="Caution" value={form.deposit_amount} onChange={(v) => set('deposit_amount', v)} type="number" />
          <div>
            <label className="text-xs text-content-secondary block mb-1">Devise</label>
            <select value={form.currency} onChange={(e) => set('currency', e.target.value)}
              className="input w-full text-sm">
              <option value="XOF">XOF (FCFA)</option>
              <option value="XAF">XAF (FCFA)</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-content-secondary block mb-1">Description</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
            rows={2} className="input w-full text-sm resize-none" placeholder="Climatisé, GPS…" />
        </div>
        <div className="pt-3 border-t border-surface-border space-y-3">
          <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Propriété & commission</p>
          <div>
            <label className="text-xs text-content-secondary block mb-1">Propriétaire du véhicule</label>
            <select value={form.owner_type as string} onChange={(e) => set('owner_type', e.target.value)}
              className="input w-full text-sm">
              <option value="owned">Véhicule propre à l'entreprise</option>
              <option value="third_party">Véhicule confié par un tiers</option>
            </select>
          </div>
          {form.owner_type === 'third_party' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom propriétaire" value={form.owner_name as string} onChange={(v) => set('owner_name', v)} />
                <Field label="Téléphone propriétaire" value={form.owner_phone as string} onChange={(v) => set('owner_phone', v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-content-secondary block mb-1">Type commission</label>
                  <select value={form.commission_type as string} onChange={(e) => set('commission_type', e.target.value)}
                    className="input w-full text-sm">
                    <option value="percent">Pourcentage</option>
                    <option value="fixed">Montant fixe</option>
                  </select>
                </div>
                <Field
                  label={form.commission_type === 'percent' ? 'Commission (%)' : 'Commission fixe'}
                  value={form.commission_value as string}
                  onChange={(v) => set('commission_value', v)}
                  type="number"
                />
              </div>
            </>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_available}
            onChange={(e) => set('is_available', e.target.checked)}
            className="rounded border-surface-border" />
          <span className="text-sm text-content-primary">Disponible à la location</span>
        </label>
      </div>

      <div className="flex gap-2 pt-4 border-t border-surface-border mt-6">
        <button onClick={onClose} className="btn-secondary flex-1 h-10 text-sm">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1 h-10 text-sm flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {vehicle ? 'Mettre à jour' : 'Ajouter'}
        </button>
      </div>
    </SlidePanel>
  );
}
