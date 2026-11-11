import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { getOrganization, updateOrganization } from '@services/supabase/business';
import { toUserError } from '@/lib/user-error';
import type { Organization } from '@pos-types';

/**
 * Entité légale (organisation) : seule la raison sociale est éditable ici.
 * Elle figure sur les factures A4 (business.organization_name). Le RIB et la
 * dénomination imprimés sur les factures sont ceux de l'établissement
 * (BusinessSettingsSection, lus par lib/invoice-templates.ts) : les champs du
 * même nom de l'organisation n'apparaissaient que dans le back office, et un
 * propriétaire qui les remplissait croyait les avoir mis sur ses factures.
 * Leurs valeurs existantes restent en base, intactes.
 */
export function OrganizationSection() {
  const { business, setBusiness } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [org, setOrg]         = useState<Organization | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [legalName, setLegalName] = useState('');

  useEffect(() => {
    if (!business?.organization_id) return;
    setLoading(true);
    getOrganization(business.organization_id)
      .then((data) => {
        setOrg(data);
        setLegalName(data.legal_name ?? '');
      })
      .catch((err) => notifError(toUserError(err)))
      .finally(() => setLoading(false));
  }, [business?.organization_id, notifError]);

  const isDirty = !!org && legalName !== (org.legal_name ?? '');

  async function handleSave() {
    if (!org || !business) return;
    if (!legalName.trim()) { notifError('Indiquez la raison sociale.'); return; }

    setSaving(true);
    try {
      await updateOrganization(org.id, { legal_name: legalName.trim() });
      setOrg({ ...org, legal_name: legalName.trim() });
      setBusiness({ ...business, organization_name: legalName.trim() });
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
      <div>
        <label className="label" htmlFor="org-legal-name">Raison sociale *</label>
        <input
          id="org-legal-name"
          type="text"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          className="input"
          placeholder="Ex : SARL Le Soleil Afrique"
        />
        <p className="text-xs text-content-muted mt-1.5">
          Nom légal de l&apos;entreprise, imprimé sur vos factures. Le nom commercial, la dénomination et le RIB
          des factures se règlent dans « Informations de l&apos;établissement ».
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        {isDirty && !saving && (
          <button
            onClick={() => setLegalName(org.legal_name ?? '')}
            className="text-xs text-content-muted hover:text-content-primary"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
