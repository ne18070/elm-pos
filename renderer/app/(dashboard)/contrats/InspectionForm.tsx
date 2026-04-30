import { CheckCircle, Loader2 } from 'lucide-react';
import { fmtDate } from './contract-utils';
import { type ContractInspection } from '@services/supabase/contracts';

export function InspectionSummary({
  title,
  inspection,
  actionLabel,
  disabled,
  onEdit,
}: {
  title: string;
  inspection: ContractInspection | null;
  actionLabel: string;
  disabled: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-input p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-content-primary">{title}</p>
        <button type="button" onClick={onEdit} disabled={disabled}
          className="text-xs px-2 py-1 rounded-lg border border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-hover disabled:opacity-40">
          {actionLabel}
        </button>
      </div>
      {inspection ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <p><span className="text-content-muted">Km:</span> {inspection.mileage?.toLocaleString('fr-FR') ?? '-'}</p>
          <p><span className="text-content-muted">Carburant:</span> {inspection.fuel_level ?? '-'}</p>
          <p><span className="text-content-muted">Etat:</span> {inspection.condition ?? '-'}</p>
          <p><span className="text-content-muted">Date:</span> {fmtDate(inspection.done_at)}</p>
          {inspection.notes && <p className="col-span-2 text-content-secondary">{inspection.notes}</p>}
        </div>
      ) : (
        <p className="text-xs text-content-muted">Non renseigne.</p>
      )}
    </div>
  );
}

export function InspectionForm({
  form,
  onChange,
  showCharges,
  saving,
  onCancel,
  onSave,
}: {
  form: { mileage: string; fuel_level: string; condition: string; notes: string; charges: string };
  onChange: (patch: Partial<{ mileage: string; fuel_level: string; condition: string; notes: string; charges: string }>) => void;
  showCharges: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-surface-border p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label text-xs">Kilometrage</label><input type="number" className="input text-sm h-9" value={form.mileage} onChange={(e) => onChange({ mileage: e.target.value })} /></div>
        <div><label className="label text-xs">Carburant</label><select className="input text-sm h-9" value={form.fuel_level} onChange={(e) => onChange({ fuel_level: e.target.value })}><option value="full">Plein</option><option value="three_quarters">3/4</option><option value="half">1/2</option><option value="quarter">1/4</option><option value="empty">Vide</option></select></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label text-xs">Etat</label><select className="input text-sm h-9" value={form.condition} onChange={(e) => onChange({ condition: e.target.value })}><option value="ok">Bon etat</option><option value="dirty">Sale</option><option value="damaged">Dommage constate</option><option value="mechanical_issue">Probleme mecanique</option></select></div>
        {showCharges && <div><label className="label text-xs">Frais retour</label><input type="number" className="input text-sm h-9" value={form.charges} onChange={(e) => onChange({ charges: e.target.value })} /></div>}
      </div>
      <div><label className="label text-xs">Notes</label><textarea className="input text-sm resize-none" rows={2} value={form.notes} onChange={(e) => onChange({ notes: e.target.value })} /></div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 h-9 text-sm">Annuler</button>
        <button type="button" onClick={onSave} disabled={saving} className="btn-primary flex-1 h-9 text-sm flex items-center justify-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}Enregistrer</button>
      </div>
    </div>
  );
}
