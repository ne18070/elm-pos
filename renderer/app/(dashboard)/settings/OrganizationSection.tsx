import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { getOrganization, updateOrganization } from '@services/supabase/business';
import { toUserError } from '@/lib/user-error';
import type { Organization } from '@pos-types';

export function OrganizationSection() {
  const { business, setBusiness } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  const [form, setForm] = useState({
    legal_name: '',
    denomination: '',
    rib: '',
  });

  useEffect(() => {
    if (!business?.organization_id) return;
    setLoading(true);
    getOrganization(business.organization_id)
      .then((data) => {
        setOrg(data);
        setForm({
          legal_name:   data.legal_name  ?? '',
          denomination: data.denomination ?? '',
          rib:          data.rib          ?? '',
        });
      })
      .catch((err) => notifError(toUserError(err)))
      .finally(() => setLoading(false));
  }, [business?.organization_id, notifError]);

  const handleChange = (patch: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
  };

  async function handleSave() {
    if (!org || !business) return;
    if (!form.legal_name.trim()) { notifError('La raison sociale est requise'); return; }

    setSaving(true);
    try {
      await updateOrganization(org.id, {
        legal_name:   form.legal_name,
        denomination: form.denomination || undefined,
        rib:          form.rib || undefined,
      });
      
      setOrg({ ...org, ...form });
      setBusiness({ ...business, organization_name: form.legal_name });
      setIsDirty(false);
      success('Organisation enregistrée');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-content-secondary"><Loader2 className="w-4 h-4 animate-spin" /> Chargement de l&apos;organisation…</div>;
  if (!org) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Raison sociale *</label>
          <input
            type="text"
            value={form.legal_name}
            onChange={(e) => handleChange({ legal_name: e.target.value })}
            className="input"
            placeholder="Ex : SARL Le Soleil Afrique"
          />
        </div>
        <div>
          <label className="label">Dénomination commerciale <span className="text-content-muted font-normal">(si différente)</span></label>
          <input
            type="text"
            value={form.denomination}
            onChange={(e) => handleChange({ denomination: e.target.value })}
            className="input"
            placeholder="Ex : Restaurant Le Soleil"
          />
        </div>
      </div>
      <div>
        <label className="label">RIB / Coordonnées bancaires</label>
        <textarea
          value={form.rib}
          onChange={(e) => handleChange({ rib: e.target.value })}
          className="input min-h-[70px] py-3 font-mono text-xs"
          placeholder="Saisir le RIB complet…"
        />
      </div>
      
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Enregistrement...' : 'Enregistrer l\'organisation'}
        </button>
        {isDirty && !saving && (
          <button
            onClick={() => {
              if (org) {
                setForm({
                  legal_name:   org.legal_name  ?? '',
                  denomination: org.denomination ?? '',
                  rib:          org.rib          ?? '',
                });
                setIsDirty(false);
              }
            }}
            className="text-xs text-content-muted hover:text-content-primary"
          >
            Annuler
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
