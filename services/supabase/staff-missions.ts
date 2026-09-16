import { supabase } from './client';
import type { TablesInsert, TablesUpdate } from './database.types';

export type MissionStatus = 'en_attente' | 'approuvee' | 'rejetee' | 'terminee';

export interface StaffMission {
  id:           string;
  business_id:  string;
  requested_by: string;
  destination:  string;
  objet:        string;
  start_date:   string;
  end_date:     string;
  status:       MissionStatus;
  admin_notes:  string | null;
  created_at:   string;
  updated_at:   string;
  requester?:   { name: string; position: string | null } | null;
  members?:     { staff_id: string; staff: { name: string } | null }[];
}

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  en_attente: 'En attente',
  approuvee:  'Approuvée',
  rejetee:    'Rejetée',
  terminee:   'Terminée',
};

export async function getMissions(businessId: string): Promise<StaffMission[]> {
  const { data, error } = await supabase
    .from('staff_missions')
    .select('*, requester:staff!staff_missions_requested_by_fkey(name, position), members:staff_mission_members(staff_id, staff(name))')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffMission[];
}

/** Missions d'un employé (self-service) : celles qu'il a demandées OU dont il est membre. */
export async function getMyMissions(businessId: string, staffId: string): Promise<StaffMission[]> {
  const all = await getMissions(businessId);
  return all.filter((m) => m.requested_by === staffId || (m.members ?? []).some((mem) => mem.staff_id === staffId));
}

/** Crée la mission et inscrit automatiquement le demandeur comme membre. */
export async function createMission(input: {
  business_id:  string;
  requested_by: string;
  destination:  string;
  objet:        string;
  start_date:   string;
  end_date:     string;
}): Promise<StaffMission> {
  const { data, error } = await supabase
    .from('staff_missions')
    .insert(input as unknown as TablesInsert<'staff_missions'>)
    .select()
    .single();
  if (error) throw new Error(error.message);

  const mission = data as unknown as StaffMission;
  await addMissionMember(mission.id, input.requested_by).catch(() => {});
  return mission;
}

export async function updateMissionStatus(id: string, status: MissionStatus, adminNotes?: string | null): Promise<void> {
  const { error } = await supabase
    .from('staff_missions')
    .update({ status, admin_notes: adminNotes ?? null } as unknown as TablesUpdate<'staff_missions'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteMission(id: string): Promise<void> {
  const { error } = await supabase.from('staff_missions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addMissionMember(missionId: string, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('staff_mission_members')
    .insert({ mission_id: missionId, staff_id: staffId } as unknown as TablesInsert<'staff_mission_members'>);
  if (error) throw new Error(error.message);
}

export async function removeMissionMember(missionId: string, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('staff_mission_members')
    .delete()
    .eq('mission_id', missionId)
    .eq('staff_id', staffId);
  if (error) throw new Error(error.message);
}
