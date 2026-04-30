import { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { Field } from './SharedComponents';
import {
  createStaff, updateStaff,
  SALARY_TYPE_LABELS,
  type Staff, type StaffForm, type SalaryType,
} from '@services/supabase/staff';

export function StaffPanel({
  staff, onClose, onSaved, businessId, notifError,
}: {
  staff:       Staff | null;
  onClose:     () => void;
  onSaved:     (s: Staff) => void;
  businessId:  string;
  notifError:  (m: string) => void;
}) {
  const isEdit = !!staff;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    name:        string;
    phone:       string;
    email:       string;
    position:    string;
    department:  string;
    salary_type: SalaryType;
    salary_rate: string;
    hire_date:   string;
    status:      'active' | 'inactive';
    notes:       string;
  }>({
    name:        staff?.name ?? '',
    phone:       staff?.phone ?? '',
    email:       staff?.email ?? '',
    position:    staff?.position ?? '',
    department:  staff?.department ?? '',
    salary_type: staff?.salary_type ?? 'monthly',
    salary_rate: staff?.salary_rate.toString() ?? '0',
    hire_date:   staff?.hire_date ?? '',
    status:      staff?.status ?? 'active',
    notes:       staff?.notes ?? '',
  });

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.name.trim()) { notifError('Nom requis'); return; }
    const rate = parseFloat(form.salary_rate);
    if (isNaN(rate) || rate < 0) { notifError('Taux de salaire invalide'); return; }

    setSaving(true);
    try {
      const input: StaffForm = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        position: form.position.trim() || null,
        department: form.department.trim() || null,
        salary_type: form.salary_type,
        salary_rate: rate,
        hire_date: form.hire_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
        // FIX: Preserve user_id on edit to avoid unlinking account accidentally
        user_id: staff?.user_id ?? null
      };
      const saved = isEdit
        ? await updateStaff(staff.id, input)
        : await createStaff(businessId, input);
      onSaved(saved);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  const salaryUnit = form.salary_type === 'hourly' ? '/heure' : form.salary_type === 'daily' ? '/jour' : '/mois';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="flex flex-col h-full w-full max-w-md bg-surface-card border-l border-surface-border shadow-xl overflow-hidden animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
          <h2 className="font-semibold text-content-primary">{isEdit ? 'Modifier l\'employé' : 'Nouvel employé'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5 text-content-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Identité */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Identité</h3>
            <Field label="Nom complet *" value={form.name} onChange={(v) => set('name', v)} placeholder="Jean Dupont" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Téléphone" value={form.phone} onChange={(v) => set('phone', v)} placeholder="+221 77 000 00 00" />
              <Field label="Email" value={form.email} onChange={(v) => set('email', v)} type="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Poste" value={form.position} onChange={(v) => set('position', v)} placeholder="Caissier" />
              <Field label="Département" value={form.department} onChange={(v) => set('department', v)} placeholder="Admin" />
            </div>
            <Field label="Date d'embauche" value={form.hire_date} onChange={(v) => set('hire_date', v)} type="date" />
          </section>

          {/* Salaire */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Rémunération</h3>
            <div>
              <label className="text-xs text-content-secondary block mb-1">Type de salaire</label>
              <select value={form.salary_type} onChange={(e) => set('salary_type', e.target.value as SalaryType)}
                className="input w-full text-sm">
                {(Object.keys(SALARY_TYPE_LABELS) as SalaryType[]).map((k) => (
                  <option key={k} value={k}>{SALARY_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-content-secondary block mb-1">Taux ({salaryUnit})</label>
              <input
                type="number"
                min="0"
                value={form.salary_rate}
                onChange={(e) => set('salary_rate', e.target.value)}
                className="input w-full text-sm"
                placeholder="0"
              />
              <p className="mt-1 text-xs text-content-muted">
                {form.salary_type === 'hourly' && 'Montant payé par heure travaillée'}
                {form.salary_type === 'daily' && 'Montant payé par jour de présence'}
                {form.salary_type === 'monthly' && 'Salaire mensuel fixe — proratisé selon les jours travaillés'}
              </p>
            </div>
          </section>

          {/* Statut */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Statut</h3>
            <div className="flex gap-2">
              {(['active', 'inactive'] as const).map((s) => (
                <button key={s} onClick={() => set('status', s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    form.status === s
                      ? s === 'active'
                        ? 'bg-badge-success border-status-success text-status-success'
                        : 'bg-surface-hover border-surface-border text-content-secondary'
                      : 'border-surface-border text-content-muted hover:text-content-primary'
                  }`}>
                  {s === 'active' ? 'Actif' : 'Inactif'}
                </button>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section>
            <label className="text-xs text-content-secondary block mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Informations complémentaires…"
              className="input w-full text-sm resize-none"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-surface-border shrink-0">
          <button onClick={save} disabled={saving}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm font-medium disabled:opacity-60">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
              : <><Save className="w-4 h-4" /> {isEdit ? 'Mettre à jour' : 'Ajouter l\'employé'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
