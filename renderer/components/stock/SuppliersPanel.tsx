'use client';
import { toUserError } from '@/lib/user-error';

import { useState } from 'react';
import { X, Plus, Pencil, Trash2, Loader2, Building2, Check } from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { upsertSupplier, deleteSupplier } from '@services/supabase/suppliers';
import type { Supplier } from '@services/supabase/suppliers';

interface SuppliersPanelProps {
  businessId: string;
  suppliers:  Supplier[];
  onClose:    () => void;
  onRefresh:  () => void;
}

interface SupplierForm {
  name:    string;
  phone:   string;
  address: string;
  notes:   string;
}

function emptyForm(): SupplierForm { return { name: '', phone: '', address: '', notes: '' }; }

export function SuppliersPanel({ businessId, suppliers, onClose, onRefresh }: SuppliersPanelProps) {
  const { success: notifOk, error: notifError } = useNotificationStore();

  const [form, setForm]       = useState<SupplierForm>(emptyForm());
  const [editId, setEditId]   = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function startAdd() {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function startEdit(s: Supplier) {
    setEditId(s.id);
    setForm({ name: s.name, phone: s.phone ?? '', address: s.address ?? '', notes: s.notes ?? '' });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm());
  }

  async function handleSave() {
    if (!form.name.trim()) { notifError('Nom obligatoire'); return; }
    setSaving(true);
    try {
      await upsertSupplier(businessId, {
        id:      editId ?? undefined,
        name:    form.name,
        phone:   form.phone,
        address: form.address,
        notes:   form.notes,
      });
      notifOk(editId ? 'Fournisseur mis à jour' : 'Fournisseur ajouté');
      cancelForm();
      onRefresh();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteSupplier(id);
      notifOk('Fournisseur supprimé');
      onRefresh();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-content-brand" />
            <h2 className="font-semibold text-content-primary text-lg">Fournisseurs</h2>
            <span className="text-xs text-content-muted bg-surface-input px-2 py-0.5 rounded-full">
              {suppliers.length}
            </span>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Add form */}
          {showForm && (
            <div className="p-5 border-b border-surface-border space-y-3 bg-surface-input/40">
              <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
                {editId ? 'Modifier' : 'Nouveau fournisseur'}
              </p>
              <div>
                <label className="text-xs text-content-secondary mb-1 block">Nom *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nom du fournisseur" className="input w-full" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-content-secondary mb-1 block">Téléphone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+221…" className="input w-full" />
                </div>
                <div>
                  <label className="text-xs text-content-secondary mb-1 block">Adresse</label>
                  <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Localisation…" className="input w-full" />
                </div>
              </div>
              <div>
                <label className="text-xs text-content-secondary mb-1 block">Notes</label>
                <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Délai, conditions…" className="input w-full" />
              </div>
              <div className="flex gap-2">
                <button onClick={cancelForm} className="btn-secondary flex-1 h-9 text-sm">Annuler</button>
                <button onClick={handleSave} disabled={saving || !form.name.trim()}
                  className="btn-primary flex-1 h-9 text-sm flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {editId ? 'Mettre à jour' : 'Ajouter'}
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {suppliers.length === 0 && !showForm ? (
            <div className="flex flex-col items-center justify-center py-12 text-content-muted gap-3">
              <Building2 className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">Aucun fournisseur</p>
              <button onClick={startAdd} className="btn-primary flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Ajouter
              </button>
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {suppliers.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-surface-input flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-content-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-content-primary truncate">{s.name}</p>
                    {s.phone && <p className="text-xs text-content-muted">{s.phone}</p>}
                    {s.address && <p className="text-xs text-content-muted truncate">{s.address}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(s)}
                      className="p-1.5 rounded-lg text-content-secondary hover:text-content-brand hover:bg-badge-brand transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={deletingId === s.id}
                      className="p-1.5 rounded-lg text-content-secondary hover:text-status-error hover:bg-badge-error transition-colors disabled:opacity-50"
                    >
                      {deletingId === s.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer add button */}
        {!showForm && suppliers.length > 0 && (
          <div className="px-5 py-4 border-t border-surface-border shrink-0">
            <button onClick={startAdd} className="btn-primary w-full h-10 flex items-center justify-center gap-2 text-sm">
              <Plus className="w-4 h-4" /> Ajouter un fournisseur
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
