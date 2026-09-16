'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, CheckCircle2, Clock, Ban, Trash2, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import {
  getStaffTasks, createTask, updateTaskStatus, deleteTask,
  TASK_STATUS_LABELS, TASK_PRIORITY_LABELS,
  type StaffTask, type TaskStatus, type TaskPriority,
} from '@services/supabase/staff-tasks';
import type { Staff } from '@services/supabase/staff';

const STATUS_CFG: Record<TaskStatus, { color: string; icon: typeof Clock }> = {
  a_faire:  { color: 'text-content-muted',   icon: Clock },
  en_cours: { color: 'text-status-warning',  icon: Clock },
  terminee: { color: 'text-status-success',  icon: CheckCircle2 },
  annulee:  { color: 'text-status-error',    icon: Ban },
};

export function StaffTasksTab({
  staffList, businessId, notifError, notifSuccess,
}: {
  staffList: Staff[]; businessId: string;
  notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const { askConfirm, ConfirmDialog } = useConfirm();

  const activeStaff = staffList.filter((s) => s.status === 'active');
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', priority: 'normale' as TaskPriority, due_date: '' });

  const load = useCallback(async () => {
    try { setTasks(await getStaffTasks(businessId)); }
    catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!user || !form.title.trim() || !form.assigned_to) { notifError('Titre et employé requis'); return; }
    try {
      await createTask({
        business_id: businessId,
        assigned_to: form.assigned_to,
        created_by:  user.id,
        title:       form.title.trim(),
        description: form.description.trim() || null,
        priority:    form.priority,
        due_date:    form.due_date || null,
      });
      notifSuccess('Tâche créée');
      setForm({ title: '', description: '', assigned_to: '', priority: 'normale', due_date: '' });
      setShowForm(false);
      load();
    } catch (e) { notifError(String(e)); }
  }

  async function handleStatusChange(task: StaffTask, status: TaskStatus) {
    try { await updateTaskStatus(task.id, status); load(); }
    catch (e) { notifError(String(e)); }
  }

  function handleDelete(task: StaffTask) {
    askConfirm(`Supprimer la tâche "${task.title}" ?`, async () => {
      try { await deleteTask(task.id); notifSuccess('Tâche supprimée'); load(); }
      catch (e) { notifError(String(e)); }
    });
  }

  const filtered = tasks.filter((t) => statusFilter === 'all' || t.status === statusFilter);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-content-brand" /></div>;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')} className="input h-10 text-sm">
          <option value="all">Tous les statuts</option>
          {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((k) => (
            <option key={k} value={k}>{TASK_STATUS_LABELS[k]}</option>
          ))}
        </select>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary flex items-center gap-2 h-10 px-4 text-xs font-black uppercase tracking-widest">
          <Plus size={16} /> Nouvelle tâche
        </button>
      </div>

      {showForm && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Titre de la tâche" className="input w-full text-sm" />
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optionnel)" rows={2} className="input w-full text-sm resize-none" />
          <div className="grid grid-cols-3 gap-3">
            <select value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))} className="input text-sm">
              <option value="">Assigner à…</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))} className="input text-sm">
              {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((k) => <option key={k} value={k}>{TASK_PRIORITY_LABELS[k]}</option>)}
            </select>
            <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="input text-sm" />
          </div>
          <button onClick={handleCreate} className="w-full btn-primary py-2.5 text-sm font-bold">Créer la tâche</button>
        </div>
      )}

      <div className="grid gap-3">
        {filtered.map((t) => {
          const cfg = STATUS_CFG[t.status];
          return (
            <div key={t.id} className="bg-surface-card border border-surface-border rounded-2xl p-4 flex items-center gap-4">
              <cfg.icon className={cn('w-5 h-5 shrink-0', cfg.color)} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-content-primary truncate">{t.title}</p>
                <p className="text-[11px] text-content-muted mt-0.5 truncate">
                  {t.assignee?.name ?? '—'} · {TASK_PRIORITY_LABELS[t.priority]}
                  {t.due_date && ` · ${new Date(t.due_date).toLocaleDateString('fr-FR')}`}
                </p>
              </div>
              <select value={t.status} onChange={(e) => handleStatusChange(t, e.target.value as TaskStatus)}
                className="input h-9 text-xs shrink-0 w-auto min-w-[110px]">
                {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((k) => <option key={k} value={k}>{TASK_STATUS_LABELS[k]}</option>)}
              </select>
              <button onClick={() => handleDelete(t)} className="p-2 text-content-muted hover:text-status-error rounded-lg transition-colors shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="py-16 text-center bg-surface-card/20 rounded-3xl border border-dashed border-surface-border">
            <ListChecks className="w-8 h-8 text-content-muted mx-auto mb-2 opacity-30" />
            <p className="text-content-muted text-sm italic">Aucune tâche</p>
          </div>
        )}
      </div>
      <ConfirmDialog />
    </div>
  );
}
