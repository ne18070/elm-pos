'use client';

import { useState, useEffect } from 'react';
import { Users, Plus, Pencil, Trash2, Search, Loader2, Save, X, GraduationCap, Phone, User } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { getStudents, createStudent, updateStudent, deleteStudent, getClassrooms } from '@services/supabase/education';
import type { Student, Classroom } from '@pos-types';

export default function ElevesPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [students, setStudents]     = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState<Student | null>(null);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');

  // Form state
  const [firstName, setFirstName]     = useState('');
  const [lastName, setLastName]       = useState('');
  const [classroomId, setClassroomId] = useState('');
  const [parentName, setParentName]   = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [status, setStatus]           = useState<'active' | 'suspended' | 'graduated'>('active');

  useEffect(() => {
    if (business?.id) load();
  }, [business?.id]);

  async function load() {
    if (!business?.id) return;
    setLoading(true);
    try {
      const [sData, cData] = await Promise.all([
        getStudents(business.id),
        getClassrooms(business.id)
      ]);
      setStudents(sData);
      setClassrooms(cData);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(s: Student) {
    setEditing(s);
    setFirstName(s.first_name);
    setLastName(s.last_name);
    setClassroomId(s.classroom_id || '');
    setParentName(s.parent_name || '');
    setParentPhone(s.parent_phone || '');
    setStatus(s.status);
    setShowModal(true);
  }

  function handleAdd() {
    setEditing(null);
    setFirstName('');
    setLastName('');
    setClassroomId('');
    setParentName('');
    setParentPhone('');
    setStatus('active');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.id) return;
    setSaving(true);
    try {
      const payload = {
        business_id: business.id,
        first_name: firstName,
        last_name: lastName,
        classroom_id: classroomId || null,
        parent_name: parentName,
        parent_phone: parentPhone,
        status,
      };

      if (editing) {
        await updateStudent(editing.id, payload);
        success('Fiche élève mise à jour');
      } else {
        await createStudent(payload);
        success('Élève inscrit avec succès');
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
    if (!confirm('Supprimer cet élève ?')) return;
    try {
      await deleteStudent(id);
      success('Élève supprimé');
      load();
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  const filtered = students.filter(s => 
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    s.parent_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-badge-brand border border-brand-500/40 flex items-center justify-center">
              <Users className="w-5 h-5 text-content-brand" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-content-primary">Base Élèves</h1>
              <p className="text-xs text-content-secondary">Gérez les inscriptions et dossiers</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un élève..."
                className="input pl-10 w-64"
              />
            </div>
            <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nouvel Élève
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-content-secondary" />
          </div>
        ) : (
          <div className="card overflow-hidden bg-surface-card border-surface-border">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-hover/50 text-xs font-bold text-content-muted uppercase tracking-wider border-b border-surface-border">
                  <th className="px-6 py-4">Élève</th>
                  <th className="px-6 py-4">Classe</th>
                  <th className="px-6 py-4">Parent / Contact</th>
                  <th className="px-6 py-4 text-center">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border text-sm">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-hover/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-300 font-bold">
                          {s.first_name[0]}{s.last_name[0]}
                        </div>
                        <div>
                          <p className="font-medium text-content-primary group-hover:text-brand-300 transition-colors">
                            {s.first_name} {s.last_name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {s.classroom ? (
                        <div className="flex items-center gap-2 text-content-secondary">
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span>{s.classroom.name}</span>
                        </div>
                      ) : (
                        <span className="text-content-muted italic">Non assigné</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-content-primary">{s.parent_name || '-'}</p>
                        <p className="text-xs text-content-secondary flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {s.parent_phone || '-'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        s.status === 'active' ? 'bg-badge-success text-status-success' :
                        s.status === 'suspended' ? 'bg-badge-error text-status-error' :
                        'bg-badge-info text-status-info'
                      }`}>
                        {s.status === 'active' ? 'Actif' : s.status === 'suspended' ? 'Suspendu' : 'Diplômé'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(s)} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary hover:text-status-error">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="py-20 text-center space-y-3">
                <Users className="w-12 h-12 text-content-muted mx-auto" />
                <p className="text-content-muted">Aucun élève trouvé.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Ajout/Edit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-lg bg-surface-card border-surface-border shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-5 border-b border-surface-border">
              <h2 className="font-bold text-content-primary">
                {editing ? 'Modifier la fiche élève' : 'Nouvelle Inscription'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-content-muted hover:text-content-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Prénom</label>
                  <input
                    autoFocus
                    required
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Nom</label>
                  <input
                    required
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Classe</label>
                  <select
                    value={classroomId}
                    onChange={(e) => setClassroomId(e.target.value)}
                    className="input"
                  >
                    <option value="">-- Non assigné --</option>
                    {classrooms.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.level})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Statut</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="input"
                  >
                    <option value="active">Actif</option>
                    <option value="suspended">Suspendu</option>
                    <option value="graduated">Diplômé</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-surface-border">
                <h3 className="text-sm font-bold text-content-primary mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" /> Parent / Tuteur
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nom du parent</label>
                    <input
                      type="text"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Téléphone</label>
                    <input
                      type="text"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
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
                  {editing ? 'Enregistrer' : 'Inscrire l\'élève'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
