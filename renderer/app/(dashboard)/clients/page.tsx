'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Search, Phone, MapPin, Mail, Pencil, Trash2,
  Users, X, Check, Upload, Download,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { ClientsImportModal } from '@/components/clients/ImportModal';
import {
  getClients, createClient, updateClient, deleteClient,
  type Client, type ClientForm,
} from '@services/supabase/clients';

const EMPTY_FORM: ClientForm = { name: '', phone: '', email: '', address: '', notes: '' };

function exportCSV(clients: Client[]) {
  const header = 'nom,telephone,email,adresse,notes';
  const rows = clients.map((c) =>
    [c.name, c.phone ?? '', c.email ?? '', c.address ?? '', c.notes ?? '']
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
  }, [business]);

  async function load() {
    if (!business) return;
    setLoading(true);
    try {
      setClients(await getClients(business.id));
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }

  function openPanel(item: Client | null) {
    setForm(item
      ? { name: item.name, phone: item.phone ?? '', email: item.email ?? '', address: item.address ?? '', notes: item.notes ?? '' }
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
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce client ?')) return;
    try {
      await deleteClient(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
      success('Client supprimé');
    } catch (e) { notifError(String(e)); }
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Clients</h1>
          <p className="text-xs text-slate-500">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              className="input pl-9 h-9 text-sm w-48"
              placeholder="Nom, téléphone…"
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
      <div className="flex-1 overflow-y-auto p-6">

        {/* Explication — visible quand vide */}
        {!loading && clients.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-surface-input flex items-center justify-center">
              <Users className="w-8 h-8 text-slate-500" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">Aucun client enregistré</p>
              <p className="text-sm text-slate-400 mt-1 max-w-sm">
                Enregistrez vos clients pour les retrouver facilement au moment du paiement, suivre leurs achats et leur proposer des offres personnalisées.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2">
                <Upload className="w-4 h-4" /> Importer CSV
              </button>
              <button onClick={() => openPanel(null)} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Ajouter un client
              </button>
            </div>

            {/* Explication CSV */}
            <div className="mt-2 p-4 rounded-xl bg-surface-input border border-surface-border text-left w-full max-w-md space-y-2 text-sm">
              <p className="font-medium text-white">Vous avez déjà une liste de clients ?</p>
              <p className="text-xs text-slate-400">
                Importez un fichier <strong className="text-slate-300">.csv</strong> (Excel, Google Sheets…) avec les colonnes :
              </p>
              <div className="font-mono text-xs bg-surface-card rounded-lg px-3 py-2 text-brand-300 border border-surface-border">
                nom, telephone, email, adresse, notes
              </div>
              <p className="text-xs text-slate-500">
                Seule la colonne <strong className="text-slate-300">nom</strong> est obligatoire. Les autres sont optionnelles.
              </p>
            </div>
          </div>
        )}

        {loading && (
          <p className="text-center text-slate-500 py-12">Chargement…</p>
        )}

        {!loading && clients.length > 0 && filtered.length === 0 && (
          <p className="text-center text-slate-500 py-12">Aucun résultat pour « {search} »</p>
        )}

        <div className="max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((c) => (
            <div key={c.id} className="card p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-brand-400">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                {c.phone && (
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3 shrink-0" /> {c.phone}
                  </p>
                )}
                {c.email && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3 shrink-0" /> {c.email}
                  </p>
                )}
                {c.address && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" /> {c.address}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openPanel(c)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => remove(c.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Panneau latéral ── */}
      {panel && (
        <div className="absolute inset-y-0 right-0 w-96 bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <h3 className="font-semibold text-white">{panel.item ? 'Modifier client' : 'Nouveau client'}</h3>
            <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="label">Nom <span className="text-red-400">*</span></label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex : Fatou Diop"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Téléphone</label>
              <input
                className="input"
                value={form.phone ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+221 77 000 00 00"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="client@exemple.com"
              />
            </div>
            <div>
              <label className="label">Adresse</label>
              <input
                className="input"
                value={form.address ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Ex : Quartier Liberté 5"
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input resize-none h-20"
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Infos utiles…"
              />
            </div>
          </div>
          <div className="px-5 py-4 border-t border-surface-border">
            <button
              onClick={save}
              disabled={saving || !form.name.trim()}
              className="btn-primary w-full h-10"
            >
              {saving ? 'Enregistrement…' : <><Check className="w-4 h-4 mr-2 inline" /> Enregistrer</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Modal Import ── */}
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
