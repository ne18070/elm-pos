'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, GraduationCap, Trash2, Lightbulb, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import {
  getTrainingRequests, updateTrainingRequestStatus, deleteTrainingRequest,
  TRAINING_STATUS_LABELS,
  type StaffTrainingRequest, type TrainingStatus,
} from '@services/supabase/staff-training';

const STATUS_COLOR: Record<TrainingStatus, string> = {
  exprime:    'text-content-muted',
  en_attente: 'text-status-warning',
  approuvee:  'text-status-success',
  rejetee:    'text-status-error',
  realisee:   'text-blue-400',
};

export function StaffTrainingTab({
  businessId, notifError, notifSuccess,
}: {
  businessId: string; notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const [requests, setRequests] = useState<StaffTrainingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { askConfirm, ConfirmDialog } = useConfirm();

  const load = useCallback(async () => {
    try { setRequests(await getTrainingRequests(businessId)); }
    catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(req: StaffTrainingRequest, status: TrainingStatus) {
    try { await updateTrainingRequestStatus(req.id, status); load(); }
    catch (e) { notifError(String(e)); }
  }

  function handleDelete(req: StaffTrainingRequest) {
    askConfirm(`Supprimer la demande "${req.title}" ?`, async () => {
      try { await deleteTrainingRequest(req.id); notifSuccess('Demande supprimée'); load(); }
      catch (e) { notifError(String(e)); }
    });
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-content-brand" /></div>;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="bg-surface-card border border-surface-border rounded-2xl p-4 flex items-center gap-4">
          {r.is_need_only
            ? <Lightbulb className="w-5 h-5 text-content-muted shrink-0" />
            : <GraduationCap className="w-5 h-5 text-content-brand shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-content-primary truncate">{r.title}</p>
            <p className="text-[11px] text-content-muted mt-0.5 truncate">
              {r.staff?.name ?? '—'} · {r.is_need_only ? 'Besoin exprimé' : 'Demande'}
              {r.desired_period_start && ` · Souhaité du ${new Date(r.desired_period_start).toLocaleDateString('fr-FR')}${r.desired_period_end ? ` au ${new Date(r.desired_period_end).toLocaleDateString('fr-FR')}` : ''}`}
            </p>
            {r.justification && <p className="text-[11px] text-content-secondary mt-1 italic truncate">{r.justification}</p>}
          </div>
          <select value={r.status} onChange={(e) => handleStatusChange(r, e.target.value as TrainingStatus)}
            className={cn('input h-9 text-xs font-bold shrink-0 w-auto min-w-[110px]', STATUS_COLOR[r.status])}>
            {(Object.keys(TRAINING_STATUS_LABELS) as TrainingStatus[]).map((k) => <option key={k} value={k}>{TRAINING_STATUS_LABELS[k]}</option>)}
          </select>
          <button onClick={() => handleDelete(r)} className="p-2 text-content-muted hover:text-status-error rounded-lg transition-colors shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {requests.length === 0 && (
        <div className="py-16 text-center bg-surface-card/20 rounded-3xl border border-dashed border-surface-border">
          <FileCheck className="w-8 h-8 text-content-muted mx-auto mb-2 opacity-30" />
          <p className="text-content-muted text-sm italic">Aucun besoin ou demande de formation</p>
        </div>
      )}
      <ConfirmDialog />
    </div>
  );
}
