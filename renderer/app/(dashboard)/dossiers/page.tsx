'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Briefcase, Search, Loader2, X, Check, Pencil, Trash2, Phone, Scale, Calendar } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { supabase } from '@/lib/supabase';
import { canDelete } from '@/lib/permissions';
import { getReferenceData, type RefItem } from '@services/supabase/reference-data';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Dossier {
  id:             string;
  reference:      string;
  type_affaire:   string;
  client_name:    string;
  client_phone:   string | null;
  client_email:   string | null;
  adversaire:     string | null;
  tribunal:       string | null;
  juge:           string | null;
  status:         string;
  description:    string | null;
  date_ouverture: string;
  date_audience:  string | null;
  created_at:     string;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function genRef(count: number) {
  return `DOS-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
}

function StatusBadge({ status, statuts }: { status: string; statuts: RefItem[] }) {
  const s = statuts.find((x) => x.value === status);
  const cls = (s?.metadata?.cls as string) ?? 'bg-slate-800 text-slate-400 border-slate-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${cls}`}>
      {s?.label ?? status}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function DossierModal({
  initial, count, businessId,
  typesAffaire, tribunaux, statuts,
  onClose, onSaved,
}: {
  initial:      Dossier | null;
  count:        number;
  businessId:   string;
  typesAffaire: RefItem[];
  tribunaux:    RefItem[];
  statuts:      RefItem[];
  onClose:      () => void;
  onSaved:      () => void;
}) {
  const { error: notifError, success } = useNotificationStore();
  const [form, setForm] = useState({
    reference:      initial?.reference      ?? genRef(count),
    type_affaire:   initial?.type_affaire   ?? (typesAffaire[0]?.value ?? ''),
    client_name:    initial?.client_name    ?? '',
    client_phone:   initial?.client_phone   ?? '',
    client_email:   initial?.client_email   ?? '',
    adversaire:     initial?.adversaire     ?? '',
    tribunal:       initial?.tribunal       ?? '',
    juge:           initial?.juge           ?? '',
    status:         initial?.status         ?? (statuts[0]?.value ?? 'ouvert'),
    description:    initial?.description    ?? '',
    date_ouverture: initial?.date_ouverture ?? new Date().toISOString().slice(0, 10),
    date_audience:  initial?.date_audience  ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.client_name.trim() || !form.reference.trim()) return;
    setSaving(true);
    try {
      const payload = {
        business_id:    businessId,
        reference:      form.reference.trim(),
        type_affaire:   form.type_affaire,
        client_name:    form.client_name.trim(),
        client_phone:   form.client_phone.trim()  || null,
        client_email:   form.client_email.trim()  || null,
        adversaire:     form.adversaire.trim()    || null,
        tribunal:       form.tribunal             || null,
        juge:           form.juge.trim()          || null,
        status:         form.status,
        description:    form.description.trim()   || null,
        date_ouverture: form.date_ouverture,
        date_audience:  form.date_audience        || null,
        updated_at:     new Date().toISOString(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (supabase as any).from('dossiers');
      const { error } = initial ? await q.update(payload).eq('id', initial.id) : await q.insert(payload);
      if (error) throw new Error(error.message);
      success(initial ? 'Dossier mis à jour' : 'Dossier créé');
      onSaved();
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
          <h2 className="text-white font-semibold">
            {initial ? `Modifier — ${initial.reference}` : 'Nouveau dossier'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Référence</label>
              <input className="input" value={form.reference} onChange={(e) => set('reference', e.target.value)} />
            </div>
            <div>
              <label className="label">Type d&apos;affaire</label>
              <select className="input" value={form.type_affaire} onChange={(e) => set('type_affaire', e.target.value)}>
                {typesAffaire.map((t) => (
                  <option key={t.value} value={t.value} className="bg-gray-900 text-white">
                    {(t.metadata?.icon as string) ?? ''} {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Nom du client / mandant <span className="text-red-400">*</span></label>
            <input className="input" value={form.client_name} onChange={(e) => set('client_name', e.target.value)} placeholder="Ex: Mamadou Diallo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Téléphone</label>
              <input className="input" value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} placeholder="+221 7X XXX XX XX" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={form.client_email} onChange={(e) => set('client_email', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Adversaire / Partie adverse</label>
              <input className="input" value={form.adversaire} onChange={(e) => set('adversaire', e.target.value)} />
            </div>
            <div>
              <label className="label">Tribunal / Juridiction</label>
              <select className="input" value={form.tribunal} onChange={(e) => set('tribunal', e.target.value)}>
                <option value="" className="bg-gray-900 text-white">— Sélectionner —</option>
                {tribunaux.map((t) => (
                  <option key={t.value} value={t.value} className="bg-gray-900 text-white">{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Juge / Magistrat</label>
              <input className="input" value={form.juge} onChange={(e) => set('juge', e.target.value)} />
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {statuts.map((s) => (
                  <option key={s.value} value={s.value} className="bg-gray-900 text-white">{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date d&apos;ouverture</label>
              <input type="date" className="input" value={form.date_ouverture} onChange={(e) => set('date_ouverture', e.target.value)} />
            </div>
            <div>
              <label className="label">Prochaine audience</label>
              <input type="date" className="input" value={form.date_audience} onChange={(e) => set('date_audience', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Notes / Description</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Faits, procédures, notes importantes…" />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-surface-border shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Annuler</button>
          <button onClick={handleSave} disabled={saving || !form.client_name.trim()}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
            <Check className="w-4 h-4" />{saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DossiersPage() {
  const { business, user } = useAuthStore();
  const { error: notifError, success } = useNotificationStore();

  const [dossiers, setDossiers]         = useState<Dossier[]>([]);
  const [typesAffaire, setTypesAffaire] = useState<RefItem[]>([]);
  const [tribunaux, setTribunaux]       = useState<RefItem[]>([]);
  const [statuts, setStatuts]           = useState<RefItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('tous');
  const [filterType, setFilterType]     = useState('tous');
  const [modal, setModal]               = useState<'new' | Dossier | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [d, ta, tr, st] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('dossiers').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
        getReferenceData('type_affaire',   business.id),
        getReferenceData('tribunal',       business.id),
        getReferenceData('statut_dossier', business.id),
      ]);
      if (d.error) throw new Error(d.error.message);
      setDossiers(d.data ?? []);
      setTypesAffaire(ta);
      setTribunaux(tr);
      setStatuts(st);
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }, [business, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce dossier ?')) return;
    setDeletingId(id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('dossiers').delete().eq('id', id);
      if (error) throw new Error(error.message);
      success('Dossier supprimé');
      setDossiers((prev) => prev.filter((d) => d.id !== id));
    } catch (e) { notifError(toUserError(e)); }
    finally { setDeletingId(null); }
  }

  const filtered = dossiers.filter((d) => {
    if (filterStatus !== 'tous' && d.status !== filterStatus) return false;
    if (filterType !== 'tous'   && d.type_affaire !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.reference.toLowerCase().includes(q) ||
        d.client_name.toLowerCase().includes(q) ||
        (d.adversaire ?? '').toLowerCase().includes(q) ||
        (d.tribunal ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);
  const stats = {
    total:    dossiers.length,
    actifs:   dossiers.filter((d) => ['ouvert','en_cours','plaidé'].includes(d.status)).length,
    gagnés:   dossiers.filter((d) => d.status === 'gagné').length,
    audience: dossiers.filter((d) => d.date_audience && d.date_audience >= today).length,
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-purple-400" /> Dossiers & Affaires
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Gestion des affaires judiciaires et clients</p>
          </div>
          <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Nouveau dossier
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total',             value: stats.total,    cls: 'text-slate-300' },
            { label: 'Actifs',            value: stats.actifs,   cls: 'text-amber-400' },
            { label: 'Gagnés',            value: stats.gagnés,   cls: 'text-green-400' },
            { label: 'Audiences à venir', value: stats.audience, cls: 'text-purple-400' },
          ].map((s) => (
            <div key={s.label} className="card p-4">
              <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Référence, client, adversaire…" className="input pl-9 text-sm" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input text-sm w-auto">
            <option value="tous" className="bg-gray-900 text-white">Tous les statuts</option>
            {statuts.map((s) => <option key={s.value} value={s.value} className="bg-gray-900 text-white">{s.label}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input text-sm w-auto">
            <option value="tous" className="bg-gray-900 text-white">Tous les types</option>
            {typesAffaire.map((t) => (
              <option key={t.value} value={t.value} className="bg-gray-900 text-white">
                {(t.metadata?.icon as string) ?? ''} {t.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-purple-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Briefcase className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400">Aucun dossier trouvé</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="border-b border-surface-border">
                  <tr className="text-xs text-slate-400 uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Référence</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Client</th>
                    <th className="text-left px-4 py-3">Adversaire</th>
                    <th className="text-left px-4 py-3">Tribunal</th>
                    <th className="text-left px-4 py-3">Audience</th>
                    <th className="text-left px-4 py-3">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {filtered.map((d) => {
                    const typeInfo   = typesAffaire.find((t) => t.value === d.type_affaire);
                    const tribunalLbl = tribunaux.find((t) => t.value === d.tribunal)?.label ?? d.tribunal;
                    const audiencePassed = d.date_audience && d.date_audience < today;
                    const audienceSoon   = d.date_audience && !audiencePassed &&
                      (new Date(d.date_audience).getTime() - Date.now()) < 7 * 86400000;
                    return (
                      <tr key={d.id} className="hover:bg-surface-input/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-purple-300 font-semibold">{d.reference}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                          {(typeInfo?.metadata?.icon as string) ?? ''} {typeInfo?.label ?? d.type_affaire}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">{d.client_name}</p>
                          {d.client_phone && (
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" />{d.client_phone}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{d.adversaire ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-[150px] truncate">{tribunalLbl ?? '—'}</td>
                        <td className="px-4 py-3">
                          {d.date_audience ? (
                            <span className={`text-xs flex items-center gap-1 ${audiencePassed ? 'text-slate-600' : audienceSoon ? 'text-amber-400 font-medium' : 'text-slate-300'}`}>
                              <Calendar className="w-3 h-3" />{fmtDate(d.date_audience)}
                            </span>
                          ) : <span className="text-slate-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={d.status} statuts={statuts} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => setModal(d)} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-surface-input transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {canDelete(user?.role ?? 'staff') && (
                              <button onClick={() => handleDelete(d.id)} disabled={deletingId === d.id}
                                className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors disabled:opacity-40">
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
        <DossierModal
          initial={modal === 'new' ? null : modal}
          count={dossiers.length}
          businessId={business?.id ?? ''}
          typesAffaire={typesAffaire}
          tribunaux={tribunaux}
          statuts={statuts}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
