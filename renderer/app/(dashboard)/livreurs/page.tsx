'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect } from 'react';
import { Plus, Phone, Pencil, Trash2, UserCheck, Check } from 'lucide-react';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import {
  getAllLivreurs, createLivreur, updateLivreur, deleteLivreur,
  type Livreur, type LivreurForm,
} from '@services/supabase/livreurs';

const EMPTY_FORM: LivreurForm = { name: '', phone: '', is_active: true, notes: '' };

export default function LivreursPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const can = useCan();

  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [panel, setPanel] = useState<{ item: Livreur | null } | null>(null);
  const [form, setForm]   = useState<LivreurForm>(EMPTY_FORM);

  useEffect(() => {
    if (!business) return;
    load();
  }, [business]);

  async function load() {
    if (!business) return;
    setLoading(true);
    try {
      setLivreurs(await getAllLivreurs(business.id));
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }

  function openPanel(item: Livreur | null) {
    setForm(item
      ? { name: item.name, phone: item.phone, is_active: item.is_active, notes: item.notes ?? '' }
      : EMPTY_FORM
    );
    setPanel({ item });
  }

  async function save() {
    if (!business || !form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    try {
      if (panel?.item) {
        const updated = await updateLivreur(panel.item.id, form);
        setLivreurs((prev) => prev.map((l) => l.id === updated.id ? updated : l));
        success('Livreur mis à jour');
      } else {
        const created = await createLivreur(business.id, form);
        setLivreurs((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        success('Livreur ajouté');
      }
      setPanel(null);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce livreur ?')) return;
    try {
      await deleteLivreur(id);
      setLivreurs((prev) => prev.filter((l) => l.id !== id));
      success('Livreur supprimé');
    } catch (e) { notifError(toUserError(e)); }
  }

  const total  = livreurs.length;
  const actifs = livreurs.filter((l) => l.is_active).length;

  return (
    <div className="h-full flex flex-col">

      {/* -- Header -- */}
      <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-content-primary">Livreurs</h1>
          <p className="text-xs text-content-secondary">Équipe de livraison — assignez des commandes et suivez les performances</p>
          <p className="text-xs text-content-muted">
            {total} livreur{total !== 1 ? 's' : ''} · {actifs} actif{actifs !== 1 ? 's' : ''}
          </p>
        </div>
        {can('manage_livreurs') && (
          <button
            onClick={() => openPanel(null)}
            className="btn-primary h-9 text-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 shrink-0" /> Ajouter
          </button>
        )}
      </div>

      {/* -- Corps -- */}
      <div className="flex-1 overflow-y-auto p-6">

        {loading && (
          <p className="text-center text-content-muted py-12">Chargement…</p>
        )}

        {!loading && livreurs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-surface-input flex items-center justify-center">
              <UserCheck className="w-8 h-8 text-content-muted" />
            </div>
            <div>
              <p className="text-lg font-semibold text-content-primary">Aucun livreur enregistré</p>
              <p className="text-sm text-content-secondary mt-1 max-w-sm">
                Ajoutez vos livreurs pour pouvoir les assigner aux commandes de livraison.
              </p>
            </div>
            <button onClick={() => openPanel(null)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Ajouter un livreur
            </button>
          </div>
        )}

        {!loading && livreurs.length > 0 && (
          <div className="max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-3">
            {livreurs.map((l) => (
              <div key={l.id} className="card p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-content-brand">
                  {l.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-content-primary truncate">{l.name}</p>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                      l.is_active
                        ? 'text-status-success bg-badge-success border-status-success'
                        : 'text-content-secondary bg-surface-card/40 border-surface-border'
                    }`}>
                      {l.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <a
                    href={`tel:${l.phone}`}
                    className="text-xs text-content-secondary flex items-center gap-1 hover:text-content-brand transition-colors"
                  >
                    <Phone className="w-3 h-3 shrink-0" /> {l.phone}
                  </a>
                  {l.notes && (
                    <p className="text-xs text-content-muted truncate">{l.notes}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openPanel(l)}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(l.id)}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-status-error hover:bg-badge-error"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* -- Panneau latéral -- */}
      <SideDrawer
        isOpen={!!panel}
        onClose={() => setPanel(null)}
        title={panel?.item ? 'Modifier livreur' : 'Nouveau livreur'}
        maxWidth="max-w-sm"
        footer={
          <button
            onClick={save}
            disabled={saving || !form.name.trim() || !form.phone.trim()}
            className="btn-primary w-full h-10"
          >
            {saving ? 'Enregistrement…' : <><Check className="w-4 h-4 mr-2 inline" /> Enregistrer</>}
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nom <span className="text-status-error">*</span></label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex : Amadou Diallo"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Téléphone <span className="text-status-error">*</span></label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+221 77 000 00 00"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="label mb-0">Actif</label>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.is_active ? 'bg-brand-600' : 'bg-surface-input'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                form.is_active ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
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
      </SideDrawer>
    </div>
  );
}
