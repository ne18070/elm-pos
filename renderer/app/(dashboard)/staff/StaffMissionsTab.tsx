'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plane, Trash2, MapPin, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import {
  getMissions, updateMissionStatus, deleteMission, addMissionMember, removeMissionMember,
  MISSION_STATUS_LABELS,
  type StaffMission, type MissionStatus,
} from '@services/supabase/staff-missions';
import type { Staff } from '@services/supabase/staff';

const STATUS_COLOR: Record<MissionStatus, string> = {
  en_attente: 'text-status-warning',
  approuvee:  'text-status-success',
  rejetee:    'text-status-error',
  terminee:   'text-content-muted',
};

export function StaffMissionsTab({
  staffList, businessId, notifError, notifSuccess,
}: {
  staffList: Staff[]; businessId: string;
  notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const [missions, setMissions] = useState<StaffMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState('');
  const { askConfirm, ConfirmDialog } = useConfirm();

  const activeStaff = staffList.filter((s) => s.status === 'active');

  const load = useCallback(async () => {
    try { setMissions(await getMissions(businessId)); }
    catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(m: StaffMission, status: MissionStatus) {
    try { await updateMissionStatus(m.id, status); load(); }
    catch (e) { notifError(String(e)); }
  }

  function handleDelete(m: StaffMission) {
    askConfirm(`Supprimer la mission "${m.objet}" ?`, async () => {
      try { await deleteMission(m.id); notifSuccess('Mission supprimée'); load(); }
      catch (e) { notifError(String(e)); }
    });
  }

  async function handleAddMember(missionId: string) {
    if (!newMemberId) return;
    try {
      await addMissionMember(missionId, newMemberId);
      setNewMemberId('');
      setAddingTo(null);
      load();
    } catch (e) { notifError(String(e)); }
  }

  async function handleRemoveMember(missionId: string, staffId: string) {
    try { await removeMissionMember(missionId, staffId); load(); }
    catch (e) { notifError(String(e)); }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-content-brand" /></div>;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-3">
      {missions.map((m) => {
        const memberIds = new Set((m.members ?? []).map((mem) => mem.staff_id));
        const availableToAdd = activeStaff.filter((s) => !memberIds.has(s.id));
        return (
          <div key={m.id} className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-4">
              <Plane className="w-5 h-5 text-content-brand shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-content-primary truncate">{m.objet}</p>
                <p className="text-[11px] text-content-muted mt-0.5 flex items-center gap-1 min-w-0">
                  <MapPin size={11} className="shrink-0" />
                  <span className="truncate">
                    {m.destination} · {m.requester?.name ?? '—'} ·{' '}
                    {new Date(m.start_date).toLocaleDateString('fr-FR')} – {new Date(m.end_date).toLocaleDateString('fr-FR')}
                  </span>
                </p>
              </div>
              <select value={m.status} onChange={(e) => handleStatusChange(m, e.target.value as MissionStatus)}
                className={cn('input h-9 text-xs font-bold shrink-0 w-auto min-w-[110px]', STATUS_COLOR[m.status])}>
                {(Object.keys(MISSION_STATUS_LABELS) as MissionStatus[]).map((k) => <option key={k} value={k}>{MISSION_STATUS_LABELS[k]}</option>)}
              </select>
              <button onClick={() => handleDelete(m)} className="p-2 text-content-muted hover:text-status-error rounded-lg transition-colors shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap pl-9">
              {(m.members ?? []).map((mem) => (
                <span key={mem.staff_id} className="flex items-center gap-1.5 bg-surface-input/40 border border-surface-border rounded-full px-2.5 py-1 text-[11px] font-bold text-content-secondary">
                  {mem.staff?.name ?? '—'}
                  <button onClick={() => handleRemoveMember(m.id, mem.staff_id)} className="text-content-muted hover:text-status-error">
                    <X size={11} />
                  </button>
                </span>
              ))}

              {addingTo === m.id ? (
                <div className="flex items-center gap-1.5">
                  <select value={newMemberId} onChange={(e) => setNewMemberId(e.target.value)} className="input h-8 text-xs">
                    <option value="">Choisir…</option>
                    {availableToAdd.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={() => handleAddMember(m.id)} className="text-status-success text-xs font-bold">OK</button>
                  <button onClick={() => setAddingTo(null)} className="text-content-muted text-xs">Annuler</button>
                </div>
              ) : (
                <button onClick={() => setAddingTo(m.id)}
                  className="flex items-center gap-1 text-[11px] font-bold text-content-muted hover:text-content-brand transition-colors">
                  <UserPlus size={12} /> Ajouter un membre
                </button>
              )}
            </div>
          </div>
        );
      })}
      {missions.length === 0 && (
        <div className="py-16 text-center bg-surface-card/20 rounded-3xl border border-dashed border-surface-border">
          <Plane className="w-8 h-8 text-content-muted mx-auto mb-2 opacity-30" />
          <p className="text-content-muted text-sm italic">Aucune mission</p>
        </div>
      )}
      <ConfirmDialog />
    </div>
  );
}
