import { useState, useEffect, useCallback } from 'react';
import { Loader2, Check, Receipt } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { displayCurrency } from '@/lib/utils';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { getHonorairesByDossier, createHonoraire, type Dossier, type HonoraireLine } from '@services/supabase/dossiers';

export function FinancesPanel({ dossier, businessId, onClose, canEdit }: { dossier: Dossier; businessId: string; onClose: () => void; canEdit: boolean; }) {
  const { business } = useAuthStore();
  const currency = business?.currency ?? 'XOF';
  const [lines, setLines] = useState<HonoraireLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const { success, error: notifError } = useNotificationStore();

  const [form, setForm] = useState({
    type_prestation: 'provision',
    montant: '',
    description: '',
    date_facture: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getHonorairesByDossier(dossier.id);
      setLines(data);
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [dossier.id, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    if (!canEdit) return;
    e.preventDefault();
    const m = parseFloat(form.montant) || 0;
    if (m <= 0) return;
    setSaving(true);
    try {
      await createHonoraire(businessId, {
        dossier_id: dossier.id,
        client_name: dossier.client_name,
        type_prestation: form.type_prestation,
        description: form.description || null,
        montant: m,
        montant_paye: 0,
        status: 'impayé',
        date_facture: form.date_facture,
      });
      success('Honoraire ajouté');
      setShowAdd(false);
      setForm({ ...form, montant: '', description: '' });
      load();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  const total = lines.reduce((s, l) => s + l.montant, 0);
  const paye = lines.reduce((s, l) => s + l.montant_paye, 0);

  return (
    <SideDrawer
      isOpen={true}
      onClose={onClose}
      title={`Honoraires — ${dossier.reference}`}
      headerActions={canEdit ? (
        <button onClick={() => setShowAdd(!showAdd)} className="bg-brand-600 text-white text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-lg hover:bg-brand-500 transition-all">
          {showAdd ? 'Fermer' : 'Ajouter'}
        </button>
      ) : undefined}
    >
      <div className="space-y-4">
        {showAdd && (
          <form onSubmit={handleAdd} className="p-4 bg-surface border border-brand-500/30 rounded-2xl space-y-3 animate-in zoom-in-95 duration-200">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] uppercase font-black text-content-muted block mb-1">Montant</label>
                <input type="number" className="input text-sm h-9" value={form.montant} onChange={e => setForm({...form, montant: e.target.value})} placeholder="0" required />
              </div>
              <div>
                <label className="text-[9px] uppercase font-black text-content-muted block mb-1">Type</label>
                <select className="input text-sm h-9" value={form.type_prestation} onChange={e => setForm({...form, type_prestation: e.target.value})}>
                  <option value="provision">Provision</option>
                  <option value="honoraire">Honoraire</option>
                  <option value="consultation">Consultation</option>
                  <option value="frais">Frais / Débours</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[9px] uppercase font-black text-content-muted block mb-1">Libellé / Note</label>
              <input className="input text-sm h-9" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Détail de la prestation..." />
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Enregistrer l'honoraire
            </button>
          </form>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3 bg-surface/30 border-surface-border">
            <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">Total Facturé</p>
            <p className="text-sm font-bold text-content-primary">{new Intl.NumberFormat('fr-FR').format(total)} {displayCurrency(currency)}</p>
          </div>
          <div className="card p-3 bg-surface/30 border-surface-border">
            <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">Reste à payer</p>
            <p className="text-sm font-bold text-status-error">{new Intl.NumberFormat('fr-FR').format(total - paye)} {displayCurrency(currency)}</p>
          </div>
        </div>

        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : lines.length === 0 ? (
          <div className="py-20 text-center opacity-30">
            <Receipt className="w-10 h-10 mx-auto mb-2 text-content-muted" />
            <p className="text-[10px] font-black uppercase tracking-widest">Aucune facture liée</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map(l => (
              <div key={l.id} className="p-3 bg-surface/50 border border-surface-border rounded-xl hover:border-surface-border transition-all group">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <p className="text-xs font-bold text-content-primary">{new Intl.NumberFormat('fr-FR').format(l.montant)} {displayCurrency(currency)}</p>
                    <p className="text-[10px] text-content-muted font-medium capitalize">{l.type_prestation}</p>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                    l.status === 'payé' ? 'bg-badge-success text-status-success' : 'bg-badge-error text-status-error'
                  }`}>{l.status}</span>
                </div>
                {l.description && <p className="text-[10px] text-content-secondary italic mt-1 border-t border-surface-border pt-1">{l.description}</p>}
                <p className="text-[9px] text-content-muted mt-1">{new Date(l.date_facture).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SideDrawer>
  );
}
