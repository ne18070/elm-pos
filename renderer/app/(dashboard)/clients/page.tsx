'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect } from 'react';
import {
  Plus, Search, Phone, MapPin, Mail, Pencil, Trash2,
  Users, X, Check, Upload, Download, Building2, UserCircle2,
  Loader2
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { ClientsImportModal } from '@/components/clients/ImportModal';
import {
  getClients, createClient, updateClient, deleteClient,
  type Client, type ClientForm,
} from '@services/supabase/clients';
import { getReferenceData, type RefItem } from '@services/supabase/reference-data';

const EMPTY_FORM: ClientForm = { 
  name: '', 
  type: '', 
  identification_number: '', 
  representative_name: '', 
  phone: '', 
  email: '', 
  address: '', 
  notes: '' 
};

function exportCSV(clients: Client[]) {
  const header = 'nom,type,id_number,representant,telephone,email,adresse,notes';
  const rows = clients.map((c) =>
    [c.name, c.type ?? '', c.identification_number ?? '', c.representative_name ?? '', c.phone ?? '', c.email ?? '', c.address ?? '', c.notes ?? '']
      .map((v) => `"${v.replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'clients.csv';
  a.click();
}

export default function ClientsPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [clients, setClients]     = useState<Client[]>([]);
  const [typesClient, setTypesClient] = useState<RefItem[]>([]);
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Panneau latéral
  const [panel, setPanel] = useState<{ item: Client | null } | null>(null);
  const [form, setForm]   = useState<ClientForm>(EMPTY_FORM);

  useEffect(() => {
    if (!business) return;
    load();
    getReferenceData('type_client', business.id).then(setTypesClient);
  }, [business]);

  async function load() {
    if (!business) return;
    setLoading(true);
    try {
      setClients(await getClients(business.id));
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }

  function openPanel(item: Client | null) {
    setForm(item
      ? { 
          name: item.name, 
          type: item.type ?? '', 
          identification_number: item.identification_number ?? '',
          representative_name: item.representative_name ?? '',
          phone: item.phone ?? '', 
          email: item.email ?? '', 
          address: item.address ?? '', 
          notes: item.notes ?? '' 
        }
      : EMPTY_FORM
    );
    setPanel({ item });
  }

  async function save() {
    if (!business || !form.name.trim()) return;
    setSaving(true);
    try {
      if (panel?.item) {
        const updated = await updateClient(panel.item.id, form);
        setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c));
        success('Client mis à jour');
      } else {
        const created = await createClient(business.id, form);
        setClients((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        success('Client ajouté');
      }
      setPanel(null);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce client ?')) return;
    try {
      await deleteClient(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
      success('Entité supprimée');
    } catch (e) { notifError(toUserError(e)); }
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search) ||
    (c.representative_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const isMoral = form.type === 'personne_morale' || form.type === 'association';

  return (
    <div className="h-full flex flex-col">

      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between gap-3 flex-wrap bg-slate-900/50">
        <div>
          <h1 className="text-xl font-bold text-white">Clients</h1>
          <p className="text-xs text-slate-500">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className="input pl-9 h-9 text-sm w-36 sm:w-48"
              placeholder="Nom, Représentant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {clients.length > 0 && (
            <button
              onClick={() => exportCSV(clients)}
              className="btn-secondary h-9 text-sm flex items-center gap-1.5 px-3"
              title="Exporter en CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exporter</span>
            </button>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="btn-secondary h-9 text-sm flex items-center gap-1.5 px-3"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importer</span>
          </button>
          <button
            onClick={() => openPanel(null)}
            className="btn-primary h-9 text-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 shrink-0" /> Nouveau client
          </button>
        </div>
      </div>

      {/* ── Corps ── */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-950/20">

        {!loading && clients.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-5">
            <div className="w-20 h-20 rounded-3xl bg-surface-input flex items-center justify-center border border-surface-border">
              <Building2 className="w-10 h-10 text-slate-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">Aucun client enregistré</p>
              <p className="text-sm text-content-secondary mt-1 max-w-sm">
                Ajoutez vos clients, partenaires et contacts (sociétés, associations, particuliers).
              </p>
            </div>
            <button onClick={() => openPanel(null)} className="btn-primary flex items-center gap-2 px-6">
              <Plus className="w-5 h-5" /> Ajouter votre premier client
            </button>
          </div>
        )}

        {loading && <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-500" /></div>}

        <div className="max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const isEntity = c.type === 'personne_morale' || c.type === 'association';
            return (
              <div key={c.id} className="card p-5 flex items-start gap-4 hover:border-brand-500/30 transition-all group">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${isEntity ? 'bg-purple-500/10 border-purple-500/20 text-status-purple' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                  {isEntity ? <Building2 className="w-6 h-6" /> : <UserCircle2 className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white truncate">{c.name}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-surface-card text-slate-500 uppercase font-black tracking-tighter border border-slate-700">
                      {typesClient.find(t => t.value === c.type)?.label || c.type || 'Inconnu'}
                    </span>
                  </div>
                  {c.representative_name && (
                    <p className="text-xs text-slate-300 flex items-center gap-1.5">
                      <UserCircle2 className="w-3 h-3 text-slate-500" /> Rep: {c.representative_name}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                    {c.phone && <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Phone className="w-3 h-3" /> {c.phone}</p>}
                    {c.email && <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Mail className="w-3 h-3" /> {c.email}</p>}
                    {c.identification_number && <p className="text-[11px] text-content-secondary font-mono flex items-center gap-1.5"><Check className="w-3 h-3 text-content-brand" /> {c.identification_number}</p>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openPanel(c)} className="p-2 rounded-xl bg-surface hover:text-white transition-all"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(c.id)} className="p-2 rounded-xl bg-surface hover:text-status-error transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Panneau latéral (Formulaire Complet) ── */}
      {panel && (
        <div className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[450px] bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40 animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between px-6 py-5 border-b border-surface-border">
            <h3 className="font-bold text-white text-lg">{panel.item ? 'Modifier le client' : 'Nouveau client'}</h3>
            <button onClick={() => setPanel(null)} className="p-2 rounded-xl hover:bg-surface-card text-content-secondary transition-all"><X className="w-5 h-5" /></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="label">Type de client <span className="text-status-error">*</span></label>
                <select 
                  className="input bg-surface-overlay" 
                  value={form.type || ''} 
                  onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}
                >
                  <option value="">— Sélectionner le type —</option>
                  {typesClient.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Nom complet / Raison sociale <span className="text-status-error">*</span></label>
                <input className="input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Cabinet MBAYE ou Jean Dupont" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">{isMoral ? 'RCCM / NINEA' : 'CNI / Passeport'}</label>
                  <input className="input font-mono" value={form.identification_number || ''} onChange={(e) => setForm(f => ({ ...f, identification_number: e.target.value }))} placeholder="ID..." />
                </div>
                {isMoral && (
                  <div>
                    <label className="label">Représentant légal</label>
                    <input className="input" value={form.representative_name || ''} onChange={(e) => setForm(f => ({ ...f, representative_name: e.target.value }))} placeholder="Nom du gérant..." />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Phone className="w-3.5 h-3.5" /> <span className="text-[10px] font-black uppercase tracking-widest">Coordonnées</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Téléphone</label>
                  <input className="input" value={form.phone || ''} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+221 ..." />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.email || ''} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="client@exemple.com" />
                </div>
              </div>
              <div>
                <label className="label">Adresse</label>
                <input className="input" value={form.address || ''} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Adresse complète..." />
              </div>
            </div>

            <div>
              <label className="label">Notes internes</label>
              <textarea className="input resize-none h-24 text-xs" value={form.notes || ''} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Informations complémentaires..." />
            </div>
          </div>

          <div className="p-6 border-t border-surface-border bg-slate-900/50">
            <button
              onClick={save}
              disabled={saving || !form.name.trim() || !form.type}
              className="bg-brand-500 hover:bg-brand-600 text-white font-bold w-full py-3.5 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-brand-500/20 disabled:opacity-50 transition-all active:scale-95"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {panel.item ? 'Enregistrer les modifications' : 'Ajouter le client'}
            </button>
          </div>
        </div>
      )}

      {showImport && business && (
        <ClientsImportModal
          businessId={business.id}
          onClose={() => setShowImport(false)}
          onDone={load}
        />
      )}
    </div>
  );
}
