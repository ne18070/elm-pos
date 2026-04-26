'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Receipt, Search, Loader2, X, Check, Pencil, Trash2, TrendingUp, AlertCircle, CheckCircle2, ExternalLink, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { supabase } from '@/lib/supabase';
import { canDelete } from '@/lib/permissions';
import { getReferenceData, type RefItem } from '@services/supabase/reference-data';
import { displayCurrency } from '@/lib/utils';
import { generateHonorairesReceipt, printHtml } from '@/lib/invoice-templates';

// --- Types --------------------------------------------------------------------

interface HonoraireLine {
  id:              string;
  dossier_id:      string | null;
  client_name:     string;
  type_prestation: string;
  description:     string | null;
  montant:         number;
  montant_paye:    number;
  status:          string;
  date_facture:    string;
  dossier?:        { reference: string } | null;
}

interface Dossier { id: string; reference: string; client_name: string }

function fmtMoney(n: number, currency: string) {
  return new Intl.NumberFormat('fr-FR').format(n) + '\u00a0' + displayCurrency(currency);
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function computeStatus(montant: number, paye: number): string {
  if (paye <= 0) return 'impayé';
  if (paye >= montant) return 'payé';
  return 'partiel';
}

// --- Sync comptabilité honoraires ---------------------------------------------

async function syncHonorairesEntry(
  db: typeof supabase,
  businessId: string,
  honoraireId: string,
  data: { montant: number; montantPaye: number; date_facture: string; client_name: string; dossier_ref?: string },
) {
  const s = db as any;
  // Supprimer l'écriture existante pour cet honoraire
  await s.from('journal_entries')
    .delete()
    .eq('business_id', businessId)
    .eq('source', 'honoraires')
    .eq('source_id', honoraireId);

  if (data.montantPaye <= 0) return; // rien encaissé → pas d'écriture

  const outstanding = Math.max(0, data.montant - data.montantPaye);
  const desc = `Honoraires — ${data.client_name}${data.dossier_ref ? ` (${data.dossier_ref})` : ''}`;

  const lines: { account_code: string; account_name: string; debit: number; credit: number }[] = [
    { account_code: '571', account_name: 'Caisse', debit: data.montantPaye, credit: 0 },
    ...(outstanding > 0.01 ? [{ account_code: '411', account_name: 'Clients', debit: outstanding, credit: 0 }] : []),
    { account_code: '706', account_name: 'Honoraires & Prestations', debit: 0, credit: data.montant },
  ];

  const { data: entry, error: entryErr } = await s.from('journal_entries')
    .insert({ business_id: businessId, entry_date: data.date_facture, description: desc, source: 'honoraires', source_id: honoraireId })
    .select().single();
  if (entryErr) throw new Error(entryErr.message);

  const { error: linesErr } = await s.from('journal_lines')
    .insert(lines.map((l) => ({ ...l, entry_id: entry.id })));
  if (linesErr) throw new Error(linesErr.message);
}

function StatusBadge({ status, statuts }: { status: string; statuts: RefItem[] }) {
  const s = statuts.find((x) => x.value === status);
  const cls = (s?.metadata?.cls as string) ?? 'bg-surface-card text-content-secondary border-surface-border';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${cls}`}>
      {s?.label ?? status}
    </span>
  );
}

// --- Modal --------------------------------------------------------------------

function HonorairesModal({
  initial, businessId, dossiers, typesPrestation, statutsPaiement, onClose, onSaved,
}: {
  initial:          HonoraireLine | null;
  businessId:       string;
  dossiers:         Dossier[];
  typesPrestation:  RefItem[];
  statutsPaiement:  RefItem[];
  onClose:          () => void;
  onSaved:          () => void;
}) {
  const { error: notifError, success } = useNotificationStore();
  const [form, setForm] = useState({
    dossier_id:      initial?.dossier_id      ?? '',
    client_name:     initial?.client_name     ?? '',
    type_prestation: initial?.type_prestation ?? (typesPrestation[0]?.value ?? ''),
    description:     initial?.description     ?? '',
    montant:         String(initial?.montant     ?? ''),
    montant_paye:    String(initial?.montant_paye ?? '0'),
    date_facture:    initial?.date_facture    ?? new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function handleDossierChange(dossierId: string) {
    set('dossier_id', dossierId);
    if (dossierId) {
      const d = dossiers.find((x) => x.id === dossierId);
      if (d) set('client_name', d.client_name);
    }
  }

  async function handleSave() {
    const montant     = parseFloat(form.montant)      || 0;
    const montantPaye = parseFloat(form.montant_paye) || 0;
    if (!form.client_name.trim()) { notifError('Le nom du client est requis'); return; }
    if (montant <= 0) { notifError('Le montant doit être supérieur à 0'); return; }
    if (montantPaye < 0) { notifError('Le montant payé ne peut pas être négatif'); return; }
    if (montantPaye > montant) { notifError('Le montant payé ne peut pas dépasser le montant facturé'); return; }
    setSaving(true);
    try {
      const payload = {
        business_id:     businessId,
        dossier_id:      form.dossier_id      || null,
        client_name:     form.client_name.trim(),
        type_prestation: form.type_prestation,
        description:     form.description.trim() || null,
        montant,
        montant_paye:    montantPaye,
        status:          computeStatus(montant, montantPaye),
        date_facture:    form.date_facture,
      };

      let honoraireId: string;
      if (initial) {
        const { error } = await (supabase as any).from('honoraires_cabinet').update(payload).eq('id', initial.id);
        if (error) throw new Error(error.message);
        honoraireId = initial.id;
      } else {
        const { data, error } = await (supabase as any).from('honoraires_cabinet').insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        honoraireId = data.id;
      }

      // Sync écriture comptable
      const dossierRef = dossiers.find((d) => d.id === form.dossier_id)?.reference;
      await syncHonorairesEntry(supabase, businessId, honoraireId, {
        montant, montantPaye, date_facture: form.date_facture,
        client_name: form.client_name.trim(), dossier_ref: dossierRef,
      });

      success(initial ? 'Honoraires mis à jour' : 'Honoraires enregistrés');
      onSaved();
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  const montant     = parseFloat(form.montant)      || 0;
  const montantPaye = parseFloat(form.montant_paye) || 0;
  const reste       = Math.max(0, montant - montantPaye);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
          <h2 className="text-content-primary font-semibold">
            {initial ? 'Modifier les honoraires' : 'Nouveaux honoraires'}
          </h2>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div>
            <label className="label">Dossier lié (optionnel)</label>
            <select className="input" value={form.dossier_id} onChange={(e) => handleDossierChange(e.target.value)}>
              <option value="" className="bg-gray-900 text-content-primary">— Sans dossier —</option>
              {dossiers.map((d) => (
                <option key={d.id} value={d.id} className="bg-gray-900 text-content-primary">
                  {d.reference} — {d.client_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Client <span className="text-status-error">*</span></label>
            <input className="input" value={form.client_name} onChange={(e) => set('client_name', e.target.value)} placeholder="Nom du client" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type de prestation</label>
              <select className="input" value={form.type_prestation} onChange={(e) => set('type_prestation', e.target.value)}>
                {typesPrestation.map((t) => (
                  <option key={t.value} value={t.value} className="bg-gray-900 text-content-primary">{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Date de facturation</label>
              <input type="date" className="input" value={form.date_facture} onChange={(e) => set('date_facture', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Montant total</label>
              <input type="number" className="input" value={form.montant} onChange={(e) => set('montant', e.target.value)} placeholder="0" min="0" />
            </div>
            <div>
              <label className="label">Montant payé</label>
              <input type="number" className="input" value={form.montant_paye} onChange={(e) => set('montant_paye', e.target.value)} placeholder="0" min="0" />
            </div>
          </div>

          {form.montant && (
            <div className={`p-3 rounded-xl border text-sm ${
              reste === 0 ? 'border-status-success bg-badge-success text-status-success' : 'border-status-warning bg-badge-warning text-status-warning'
            }`}>
              Reste à payer : <strong>{fmtMoney(reste, 'XOF')}</strong>
            </div>
          )}

          <div>
            <label className="label">Description / Notes</label>
            <textarea className="input resize-none" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Détail de la prestation…" />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-surface-border shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Annuler</button>
          <button onClick={handleSave} disabled={saving || !form.client_name.trim() || !form.montant}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" />{saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Page ---------------------------------------------------------------------

export default function HonorairesPage() {
  const { business, user } = useAuthStore();
  const { error: notifError, success } = useNotificationStore();
  const router = useRouter();
  const currency = business?.currency ?? 'XOF';

  const [lines, setLines]                   = useState<HonoraireLine[]>([]);
  const [dossiers, setDossiers]             = useState<Dossier[]>([]);
  const [typesPrestation, setTypesPrest]    = useState<RefItem[]>([]);
  const [statutsPaiement, setStatutsPaiem]  = useState<RefItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState('');
  const [filterStatus, setFilterStatus]     = useState('tous');
  const [modal, setModal]                   = useState<'new' | HonoraireLine | null>(null);
  const [deletingId, setDeletingId]         = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [h, d, tp, sp] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('honoraires_cabinet').select('*, dossier:dossiers(reference)').eq('business_id', business.id).order('date_facture', { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('dossiers').select('id, reference, client_name').eq('business_id', business.id).order('reference'),
        getReferenceData('type_prestation',  business.id),
        getReferenceData('statut_paiement',  business.id),
      ]);
      if (h.error) throw new Error(h.error.message);
      setLines(h.data ?? []);
      setDossiers(d.data ?? []);
      setTypesPrest(tp);
      setStatutsPaiem(sp);
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }, [business, notifError]);

  useEffect(() => { load(); }, [load]);

  function handlePrint(l: HonoraireLine) {
    if (!business) return;
    const typeLabel = typesPrestation.find((t) => t.value === l.type_prestation)?.label ?? l.type_prestation;
    const html = generateHonorairesReceipt({
      id:             l.id,
      date:           l.date_facture,
      dossier_ref:    l.dossier?.reference ?? null,
      client_name:    l.client_name,
      items: [{ label: typeLabel + (l.description ? ` — ${l.description}` : ''), amount: l.montant }],
      total:          l.montant,
      paid:           l.montant_paye,
    }, business as any);
    printHtml(html);
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ces honoraires ?')) return;
    setDeletingId(id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('honoraires_cabinet').delete().eq('id', id);
      if (error) throw new Error(error.message);
      // Supprimer l'écriture comptable liée
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('journal_entries').delete()
        .eq('source', 'honoraires').eq('source_id', id);
      success('Supprimé');
      setLines((prev) => prev.filter((l) => l.id !== id));
    } catch (e) { notifError(toUserError(e)); }
    finally { setDeletingId(null); }
  }

  const filtered = lines.filter((l) => {
    if (filterStatus !== 'tous' && l.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.client_name.toLowerCase().includes(q) ||
        (l.dossier?.reference ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const totalFacturé = lines.reduce((s, l) => s + l.montant, 0);
  const totalPerçu   = lines.reduce((s, l) => s + l.montant_paye, 0);
  const totalImpayé  = lines.filter((l) => l.status !== 'payé').reduce((s, l) => s + (l.montant - l.montant_paye), 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-content-primary flex items-center gap-2">
              <Receipt className="w-5 h-5 text-status-purple" /> Honoraires & Facturation
            </h1>
            <p className="text-xs text-content-secondary mt-0.5">Suivi des prestations et paiements</p>
          </div>
          <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Nouveaux honoraires
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: TrendingUp,  label: 'Total facturé',       value: fmtMoney(totalFacturé, currency), cls: 'text-status-purple' },
            { icon: CheckCircle2,label: 'Encaissé',            value: fmtMoney(totalPerçu,   currency), cls: 'text-status-success'  },
            { icon: AlertCircle, label: 'Reste à percevoir',   value: fmtMoney(totalImpayé,  currency), cls: 'text-status-error'    },
          ].map(({ icon: Icon, label, value, cls }) => (
            <div key={label} className="card p-4 flex items-center gap-4">
              <div className={`p-3 rounded-xl bg-surface-input ${cls}`}><Icon className="w-5 h-5" /></div>
              <div>
                <p className={`text-xl font-bold ${cls}`}>{value}</p>
                <p className="text-xs text-content-secondary">{label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Client, dossier…" className="input pl-9 text-sm" />
          </div>
          <div className="flex gap-1 bg-surface-input rounded-lg p-1">
            <button onClick={() => setFilterStatus('tous')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterStatus === 'tous' ? 'bg-brand-600 text-content-primary' : 'text-content-secondary hover:text-content-primary'}`}>
              Tous
            </button>
            {statutsPaiement.map((s) => (
              <button key={s.value} onClick={() => setFilterStatus(s.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterStatus === s.value ? 'bg-brand-600 text-content-primary' : 'text-content-secondary hover:text-content-primary'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-status-purple" /></div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Receipt className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-content-secondary">Aucun honoraire trouvé</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="border-b border-surface-border">
                  <tr className="text-xs text-content-secondary uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Client</th>
                    <th className="text-left px-4 py-3">Dossier</th>
                    <th className="text-left px-4 py-3">Prestation</th>
                    <th className="text-right px-4 py-3">Montant</th>
                    <th className="text-right px-4 py-3">Payé</th>
                    <th className="text-right px-4 py-3">Reste</th>
                    <th className="text-left px-4 py-3">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {filtered.map((l) => {
                    const reste     = l.montant - l.montant_paye;
                    const typeLabel = typesPrestation.find((t) => t.value === l.type_prestation)?.label ?? l.type_prestation;
                    return (
                      <tr key={l.id} className="hover:bg-surface-input/40 transition-colors">
                        <td className="px-4 py-3 text-content-secondary text-xs">{fmtDate(l.date_facture)}</td>
                        <td className="px-4 py-3 text-content-primary font-medium">{l.client_name}</td>
                        <td className="px-4 py-3">
                          {l.dossier?.reference ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-status-purple">{l.dossier.reference}</span>
                              <button 
                                onClick={() => router.push(`/dossiers?ref=${l.dossier!.reference}`)}
                                className="p-1 text-content-muted hover:text-status-purple transition-all"
                                title="Voir le dossier"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-content-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-content-primary text-xs">{typeLabel}</td>
                        <td className="px-4 py-3 text-right text-content-primary font-medium">{fmtMoney(l.montant, currency)}</td>
                        <td className="px-4 py-3 text-right text-status-success">{fmtMoney(l.montant_paye, currency)}</td>
                        <td className="px-4 py-3 text-right">
                          {reste > 0 ? <span className="text-status-error">{fmtMoney(reste, currency)}</span>
                                     : <span className="text-content-muted">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={l.status} statuts={statutsPaiement} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => handlePrint(l)} className="p-1.5 text-content-muted hover:text-status-purple rounded-lg hover:bg-surface-input transition-colors" title="Imprimer le reçu">
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setModal(l)} className="p-1.5 text-content-muted hover:text-content-primary rounded-lg hover:bg-surface-input transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {canDelete(user?.role ?? 'staff') && (
                              <button onClick={() => handleDelete(l.id)} disabled={deletingId === l.id}
                                className="p-1.5 text-content-muted hover:text-status-error rounded-lg hover:bg-badge-error transition-colors disabled:opacity-40">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <HonorairesModal
          initial={modal === 'new' ? null : modal}
          businessId={business?.id ?? ''}
          dossiers={dossiers}
          typesPrestation={typesPrestation}
          statutsPaiement={statutsPaiement}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
