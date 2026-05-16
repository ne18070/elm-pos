'use client';

import { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Plus, Trash2, Loader2, Save, X, User, BookOpen, Calendar } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { getStudents, getGrades, addGrade, deleteGrade, getClassrooms } from '@services/supabase/education';
import type { Student, Grade, Classroom } from '@pos-types';

export default function BulletinsPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [students, setStudents]     = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [grades, setGrades]         = useState<Grade[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');

  // Filters
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm]   = useState('Trimestre 1');

  // Form state
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject]     = useState('');
  const [score, setScore]         = useState(10);
  const [maxScore, setMaxScore]   = useState(20);
  const [date, setDate]           = useState(new Date().toISOString().split('T')[0]);
  const [comment, setComment]     = useState('');

  const loadData = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const [sData, cData, gData] = await Promise.all([
        getStudents(business.id),
        getClassrooms(business.id),
        getGrades(business.id, undefined, selectedTerm)
      ]);
      setStudents(sData);
      setClassrooms(cData);
      setGrades(gData);
      
      if (cData.length > 0 && !selectedClass) {
        setSelectedClass(cData[0].id);
      }
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, selectedTerm, notifError, selectedClass]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!business?.id) return;

    if (maxScore <= 0)    { setFormError('Le barème doit être supérieur à 0'); return; }
    if (score < 0)        { setFormError('La note ne peut pas être négative'); return; }
    if (score > maxScore) { setFormError(`La note dépasse le barème (max ${maxScore})`); return; }

    setSaving(true);
    setFormError('');
    try {
      await addGrade({
        business_id:     business.id,
        student_id:      studentId,
        subject,
        score,
        max_score:       maxScore,
        evaluation_date: date,
        term:            selectedTerm,
        comment,
      });
      success('Note enregistrée');
      setShowModal(false);
      loadData();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette note ?')) return;
    try {
      await deleteGrade(id);
      success('Note supprimée');
      loadData();
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  const filteredStudents = students.filter(s => s.classroom_id === selectedClass);
  const terms = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3', 'Semestre 1', 'Semestre 2'];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-badge-info border border-blue-700/40 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-status-info" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-content-primary">Notes & Bulletins</h1>
              <p className="text-xs text-content-secondary">Saisie des évaluations et performances</p>
            </div>
          </div>

          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Saisir une Note
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 bg-surface-card p-4 rounded-xl border border-surface-border">
          <div className="flex-1">
            <label className="text-[10px] font-bold text-content-muted uppercase mb-1 block">Classe</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="input text-sm"
            >
              {classrooms.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.level})</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-bold text-content-muted uppercase mb-1 block">Période</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="input text-sm"
            >
              {terms.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-content-secondary" />
          </div>
        ) : (
          <div className="space-y-6">
            {filteredStudents.map(student => {
              const studentGrades = grades.filter(g => g.student_id === student.id);
              const average = studentGrades.length > 0 
                ? (studentGrades.reduce((acc, g) => acc + (g.score / g.max_score), 0) / studentGrades.length) * 20
                : null;

              return (
                <div key={student.id} className="card bg-surface-card border-surface-border overflow-hidden">
                  <div className="p-4 border-b border-surface-border bg-surface-hover/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center text-xs font-bold text-brand-300">
                        {student.first_name[0]}{student.last_name[0]}
                      </div>
                      <span className="font-bold text-content-primary">{student.first_name} {student.last_name}</span>
                    </div>
                    {average !== null && (
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-content-muted uppercase">Moyenne</p>
                        <p className={`text-sm font-bold ${average >= 10 ? 'text-status-success' : 'text-status-error'}`}>
                          {average.toFixed(2)} / 20
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    {studentGrades.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {studentGrades.map(g => (
                          <div key={g.id} className="p-3 rounded-lg border border-surface-border bg-surface-card flex items-center justify-between group">
                            <div>
                              <p className="text-xs font-bold text-content-primary">{g.subject}</p>
                              <p className="text-[10px] text-content-secondary">{new Date(g.evaluation_date).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-sm font-bold ${g.score >= g.max_score / 2 ? 'text-brand-300' : 'text-status-error'}`}>
                                {g.score} / {g.max_score}
                              </span>
                              <button onClick={() => handleDelete(g.id)} className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-hover text-content-muted hover:text-status-error">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-content-muted italic py-2 text-center">Aucune note saisie pour cette période.</p>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredStudents.length === 0 && (
              <div className="py-20 text-center space-y-3">
                <GraduationCap className="w-12 h-12 text-content-muted mx-auto" />
                <p className="text-content-muted">Aucun élève dans cette classe.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Saisie Note */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md bg-surface-card border-surface-border shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-5 border-b border-surface-border">
              <h2 className="font-bold text-content-primary flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand-500" /> Saisir une note
              </h2>
              <button onClick={() => setShowModal(false)} className="text-content-muted hover:text-content-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">Élève</label>
                <select
                  required
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="input"
                >
                  <option value="">-- Sélectionner l'élève --</option>
                  {filteredStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Matière</label>
                <div className="relative">
                  <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                  <input
                    required
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Mathématiques, Français..."
                    className="input pl-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Note</label>
                  <input
                    required
                    type="number"
                    step="0.25"
                    min="0"
                    max={maxScore}
                    value={score}
                    onChange={(e) => { setScore(parseFloat(e.target.value) || 0); setFormError(''); }}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Sur (/)</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={maxScore}
                    onChange={(e) => { setMaxScore(parseFloat(e.target.value) || 20); setFormError(''); }}
                    className="input"
                  />
                </div>
              </div>

              {formError && (
                <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                    <input
                      required
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="input pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Période</label>
                  <select
                    value={selectedTerm}
                    onChange={(e) => setSelectedTerm(e.target.value)}
                    className="input"
                  >
                    {terms.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Appréciation / Commentaire</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  className="input py-2"
                />
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
                  disabled={saving || !studentId}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
