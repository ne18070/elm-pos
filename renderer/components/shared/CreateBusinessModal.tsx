'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Building2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { createBusiness } from '@services/supabase/business';
import { useNotificationStore } from '@/store/notifications';
import type { Business } from '@pos-types';

interface CreateBusinessModalProps {
  onClose: () => void;
  onCreated: (business: Business) => void;
}

const BUSINESS_TYPES = [
  { value: 'retail',      label: 'Commerce / Boutique' },
  { value: 'restaurant',  label: 'Restaurant / Café' },
  { value: 'service',     label: 'Prestation de service' },
  { value: 'hotel',       label: 'Hôtel / Hébergement' },
];

const CURRENCIES = [
  { value: 'XOF', label: 'XOF — Franc CFA' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'USD', label: 'USD — Dollar US' },
  { value: 'GBP', label: 'GBP — Livre sterling' },
  { value: 'MAD', label: 'MAD — Dirham marocain' },
  { value: 'DZD', label: 'DZD — Dinar algérien' },
  { value: 'TND', label: 'TND — Dinar tunisien' },
];

export function CreateBusinessModal({ onClose, onCreated }: CreateBusinessModalProps) {
  const router = useRouter();
  const { error: notifError } = useNotificationStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name:     '',
    type:     'retail',
    currency: 'XOF',
    tax_rate: '0',
  });

  const isValid = form.name.trim().length > 0;

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    try {
      const biz = await createBusiness({
        name:     form.name.trim(),
        type:     form.type,
        currency: form.currency,
        tax_rate: parseFloat(form.tax_rate) || 0,
      });
      onCreated(biz);
      // Rediriger vers l'écran de configuration au premier lancement
      router.push('/configure');
    } catch (err) {
      notifError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Nouvel établissement"
      onClose={onClose}
      size="sm"
      guard={form.name.trim().length > 0}
      footer={(requestClose) => (
        <div className="flex gap-3 justify-end">
          <button onClick={requestClose} className="btn-secondary">Annuler</button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" />Création…</>
              : <><Building2 className="w-4 h-4" />Créer</>}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <label className="label">Nom de l'établissement <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex : Boutique Centre-Ville"
            className="input"
            autoFocus
          />
        </div>

        <div>
          <label className="label">Type d'activité</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="input"
          >
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Devise</label>
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="input"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">TVA (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.tax_rate}
              onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              className="input"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
