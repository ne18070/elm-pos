import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import {
  getContributionTypes, createContributionType, updateContributionType, deleteContributionType,
  type PayrollContributionType, type ContributionPayer, type ContributionMethod,
} from '@services/supabase/payroll-settings';

const PAYER_LABELS: Record<ContributionPayer, string> = { employee: 'Salarié', employer: 'Employeur', both: 'Les deux' };

export function PayrollSettingsModal({
  businessId, onClose, notifError, notifSuccess,
}: {
  businessId:   string;
  onClose:      () => void;
  notifError:   (m: string) => void;
  notifSuccess: (m: string) => void;
}) {
  const [types, setTypes] = useState<PayrollContributionType[]>([]);
  const [loading, setLoading] = useState(true);
  const { askConfirm, ConfirmDialog } = useConfirm();

  const [form, setForm] = useState({
    name: '', payer: 'employee' as ContributionPayer, calc_method: 'percent_of_gross' as ContributionMethod,
    rate_percent: '', fixed_amount: '', ceiling_amount: '',
  });

  const load = useCallback(async () => {
    try { setTypes(await getContributionTypes(businessId)); }
    catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.name.trim()) { notifError('Nom requis'); return; }
    try {
      await createContributionType({
        business_id:    businessId,
        name:           form.name.trim(),
        payer:          form.payer,
        calc_method:    form.calc_method,
        rate_percent:   form.calc_method === 'percent_of_gross' ? (parseFloat(form.rate_percent) || 0) : null,
        fixed_amount:   form.calc_method === 'fixed_amount' ? (parseFloat(form.fixed_amount) || 0) : null,
        ceiling_amount: form.ceiling_amount ? parseFloat(form.ceiling_amount) : null,
        order_index:    types.length,
      });
      setForm({ name: '', payer: 'employee', calc_method: 'percent_of_gross', rate_percent: '', fixed_amount: '', ceiling_amount: '' });
      notifSuccess('Ligne de cotisation ajoutée');
      await load();
    } catch (e) { notifError(String(e)); }
  }

  async function handleToggleActive(t: PayrollContributionType) {
    try { await updateContributionType(t.id, { is_active: !t.is_active }); await load(); }
    catch (e) { notifError(String(e)); }
  }

  function handleDelete(t: PayrollContributionType) {
    askConfirm(`Supprimer la ligne "${t.name}" ? Les bulletins déjà émis conservent leur historique.`, async () => {
      try { await deleteContributionType(t.id); notifSuccess('Ligne supprimée'); await load(); }
      catch (e) { notifError(String(e)); }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div>
            <h2 className="font-bold text-content-primary text-lg">Paramètres Paie</h2>
            <p className="text-xs text-content-muted mt-0.5">Lignes de cotisation propres à votre entreprise</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-hover text-content-muted"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-content-brand mx-auto" />
          ) : (
            <div className="space-y-2">
              {types.length === 0 && <p className="text-xs text-content-muted text-center py-2">Aucune cotisation configurée — le net = le brut.</p>}
              {types.map((t) => (
                <div key={t.id} className="flex items-center gap-2 bg-surface-input/30 border border-surface-border rounded-lg px-3 py-2.5">
                  <button onClick={() => handleToggleActive(t)} className={cn('text-[10px] font-black uppercase w-14 shrink-0', t.is_active ? 'text-status-success' : 'text-content-muted')}>
                    {t.is_active ? 'Actif' : 'Inactif'}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary truncate">{t.name}</p>
                    <p className="text-[10px] text-content-muted">
                      {PAYER_LABELS[t.payer]} · {t.calc_method === 'percent_of_gross' ? `${t.rate_percent}%` : `${t.fixed_amount} fixe`}
                      {t.ceiling_amount ? ` · plafond ${t.ceiling_amount}` : ''}
                    </p>
                  </div>
                  <button onClick={() => handleDelete(t)} className="p-1 text-content-muted hover:text-status-error shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-surface-border/50 space-y-2">
            <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Nouvelle ligne</p>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nom (ex: CNSS, Mutuelle...)" className="input w-full text-sm h-10" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.payer} onChange={(e) => setForm((f) => ({ ...f, payer: e.target.value as ContributionPayer }))} className="input h-10 text-xs">
                {(Object.keys(PAYER_LABELS) as ContributionPayer[]).map((k) => <option key={k} value={k}>{PAYER_LABELS[k]}</option>)}
              </select>
              <select value={form.calc_method} onChange={(e) => setForm((f) => ({ ...f, calc_method: e.target.value as ContributionMethod }))} className="input h-10 text-xs">
                <option value="percent_of_gross">% du brut</option>
                <option value="fixed_amount">Montant fixe</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {form.calc_method === 'percent_of_gross' ? (
                <input type="number" min="0" step="0.01" value={form.rate_percent}
                  onChange={(e) => setForm((f) => ({ ...f, rate_percent: e.target.value }))}
                  placeholder="Taux %" className="input h-10 text-sm" />
              ) : (
                <input type="number" min="0" value={form.fixed_amount}
                  onChange={(e) => setForm((f) => ({ ...f, fixed_amount: e.target.value }))}
                  placeholder="Montant fixe" className="input h-10 text-sm" />
              )}
              <input type="number" min="0" value={form.ceiling_amount}
                onChange={(e) => setForm((f) => ({ ...f, ceiling_amount: e.target.value }))}
                placeholder="Plafond (optionnel)" className="input h-10 text-sm" />
            </div>
            <button onClick={handleAdd} className="w-full h-10 flex items-center justify-center gap-2 bg-brand-600 text-content-primary rounded-lg text-xs font-bold uppercase tracking-wider">
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
}
