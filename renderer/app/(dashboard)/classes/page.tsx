'use client';

import { useState, useEffect } from 'react';
import { LayoutGrid, Plus, Pencil, Trash2, Users, Loader2, Save, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { getClassrooms, createClassroom, updateClassroom, deleteClassroom } from '@services/supabase/education';
import type { Classroom } from '@pos-types';

export default function ClassesPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState<Classroom | null>(null);
  const [saving, setSaving]         = useState(false);

  // Form state
  const [name, setName]         = useState('');
  const [level, setLevel]       = useState('');
  const [capacity, setCapacity] = useState(30);
  const [teacher, setTeacher]   = useState('');

  useEffect(() => {
    if (business?.id) load();
  }, [business?.id]);

  async function load() {
    if (!business?.id) return;
    setLoading(true);
    try {
      const data = await getClassrooms(business.id);
      setClassrooms(data);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(c: Classroom) {
    setEditing(c);
    setName(c.name);
    setLevel(c.level || '');
    setCapacity(c.capacity);
    setTeacher(c.teacher || '');
    setShowModal(true);
  }

  function handleAdd() {
    setEditing(null);
    setName('');
    setLevel('');
    setCapacity(30);
    setTeacher('');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.id) return;
    setSaving(true);
    try {
      const payload = {
        business_id: business.id,
        name,
        level,
        capacity,
        teacher,
      };

      if (editing) {
        await updateClassroom(editing.id, payload);
        success('Classe mise à jour');
      } else {
        await createClassroom(payload);
        success('Classe créée');
      }
      setShowModal(false);
      load();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette classe ?')) return;
    try {
      await deleteClassroom(id);
      success('Classe supprimée');
      load();
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-badge-info border border-blue-700/40 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-status-info" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-content-primary">Gestion des Classes</h1>
              <p className="text-xs text-content-secondary">Organisez vos niveaux et professeurs</p>
            </div>
          </div>

          <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouvelle Classe
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-content-secondary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classrooms.map((c) => (
              <div key={c.id} className="card p-5 bg-surface-card border-surface-border hover:border-brand-500/30 transition-colors group">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-content-primary group-hover:text-brand-300 transition-colors">{c.name}</h3>
                    <p className="text-xs text-content-muted uppercase tracking-wider font-semibold">{c.level || 'Niveau non défini'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleEdit(c)} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary hover:text-status-error">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-content-secondary">
                    <Users className="w-4 h-4" />
                    <span>Capacité : {c.capacity} élèves</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-content-secondary">
                    <div className="w-4 h-4 rounded-full bg-brand-500/20 flex items-center justify-center text-[10px] font-bold text-brand-300">
                      P
                    </div>
                    <span>{c.teacher || 'Aucun professeur assigné'}</span>
                  </div>
                </div>
              </div>
            ))}

            {classrooms.length === 0 && (
              <div className="col-span-full py-20 text-center space-y-3">
                <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto">
                  <LayoutGrid className="w-8 h-8 text-content-muted" />
                </div>
                <p className="text-content-muted">Aucune classe configurée.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Ajout/Edit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md bg-surface-card border-surface-border shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-5 border-b border-surface-border">
              <h2 className="font-bold text-content-primary">
                {editing ? 'Modifier la classe' : 'Nouvelle Classe'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-content-muted hover:text-content-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">Nom de la classe</label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Terminale S1, CP-B..."
                  className="input"
                />
              </div>

              <div>
                <label className="label">Niveau / Cycle</label>
                <input
                  type="text"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  placeholder="Ex: Lycée, Primaire, Bac+2..."
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Capacité (élèves)</label>
                  <input
                    type="number"
                    value={capacity}
                    onChange={(e) => setCapacity(parseInt(e.target.value))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Professeur Principal</label>
                  <input
                    type="text"
                    value={teacher}
                    onChange={(e) => setTeacher(e.target.value)}
                    placeholder="Nom du prof"
                    className="input"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editing ? 'Mettre à jour' : 'Créer la classe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
