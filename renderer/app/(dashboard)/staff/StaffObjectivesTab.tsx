'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Target, Trash2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import {
  getObjectives, createObjective, updateObjective, deleteObjective,
  OBJECTIVE_STATUS_LABELS,
  type StaffObjective, type ObjectiveStatus,
} from '@services/supabase/staff-objectives';
import type { Staff } from '@services/supabase/staff';

const STATUS_CFG: Record<ObjectiveStatus, { color: string; icon: typeof Clock }> = {
  assigne:     { color: 'text-content-muted',   icon: Clock },
  en_cours:    { color: 'text-status-warning',  icon: Clock },
  atteint:     { color: 'text-status-success',  icon: CheckCircle2 },
  non_atteint: { color: 'text-status-error',    icon: XCircle },
};

export function StaffObjectivesTab({
  staffList, businessId, notifError, notifSuccess,
}: {
  staffList: Staff[]; businessId: string;
  notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const { user } = useAuthStore();
  const [objectives, setObjectives] = useState<StaffObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { askConfirm, ConfirmDialog } = useConfirm();

  const activeStaff = staffList.filter((s) => s.status === 'active');
  const [form, setForm] = useState({ title: '', description: '', staff_id: '', target_date: '' });

  const load = useCallback(async () => {
    try { setObjectives(await getObjectives(businessId)); }
    catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!user || !form.title.trim() || !form.staff_id) { notifError('Titre et employé requis'); return; }
    try {
      await createObjective({
        business_id: businessId,
        staff_id:    form.staff_id,
        assigned_by: user.id,
        title:       form.title.trim(),
        description: form.description.trim() || null,
        target_date: form.target_date || null,
      });
      notifSuccess('Objectif assigné');
      setForm({ title: '', description: '', staff_id: '', target_date: '' });
      setShowForm(false);
      load();
    } catch (e) { notifError(String(e)); }
  }

  async function handleStatusChange(obj: StaffObjective, status: ObjectiveStatus) {
    try { await updateObjective(obj.id, { status }); load(); }
    catch (e) { notifError(String(e)); }
  }

  function handleDelete(obj: StaffObjective) {
    askConfirm(`Supprimer l'objectif "${obj.title}" ?`, async () => {
      try { await deleteObjective(obj.id); notifSuccess('Objectif supprimé'); load(); }
      catch (e) { notifError(String(e)); }
    });
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-content-brand" /></div>;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-end">
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary flex items-center gap-2 h-10 px-4 text-xs font-black uppercase tracking-widest">
          <Plus size={16} /> Assigner un objectif
        </button>
      </div>

      {showForm && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Titre de l'objectif" className="input w-full text-sm" />
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optionnel)" rows={2} className="input w-full text-sm resize-none" />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.staff_id} onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))} className="input text-sm">
              <option value="">Assigner à…</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" value={form.target_date} onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))} className="input text-sm" />
          </div>
          <button onClick={handleCreate} className="w-full btn-primary py-2.5 text-sm font-bold">Assigner</button>
        </div>
      )}

      <div className="grid gap-3">
        {objectives.map((o) => {
          const cfg = STATUS_CFG[o.status];
          return (
            <div key={o.id} className="bg-surface-card border border-surface-border rounded-2xl p-4 flex items-center gap-4">
              <cfg.icon className={cn('w-5 h-5 shrink-0', cfg.color)} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-content-primary truncate">{o.title}</p>
                <p className="text-[11px] text-content-muted mt-0.5">
                  {o.staff?.name ?? '—'}
                  {o.target_date && ` · Échéance ${new Date(o.target_date).toLocaleDateString('fr-FR')}`}
                </p>
              </div>
              <select value={o.status} onChange={(e) => handleStatusChange(o, e.target.value as ObjectiveStatus)}
                className="input h-9 text-xs">
                {(Object.keys(OBJECTIVE_STATUS_LABELS) as ObjectiveStatus[]).map((k) => <option key={k} value={k}>{OBJECTIVE_STATUS_LABELS[k]}</option>)}
              </select>
              <button onClick={() => handleDelete(o)} className="p-2 text-content-muted hover:text-status-error rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        {objectives.length === 0 && (
          <div className="py-16 text-center bg-surface-card/20 rounded-3xl border border-dashed border-surface-border">
            <Target className="w-8 h-8 text-content-muted mx-auto mb-2 opacity-30" />
            <p className="text-content-muted text-sm italic">Aucun objectif assigné</p>
          </div>
        )}
      </div>
      <ConfirmDialog />
    </div>
  );
}
