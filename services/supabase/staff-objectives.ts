import { supabase } from './client';
import type { TablesInsert, TablesUpdate } from './database.types';

export type ObjectiveStatus = 'assigne' | 'en_cours' | 'atteint' | 'non_atteint';

export interface StaffObjective {
  id:            string;
  business_id:   string;
  staff_id:      string;
  assigned_by:   string | null;
  title:         string;
  description:   string | null;
  target_date:   string | null;
  status:        ObjectiveStatus;
  achieved_at:   string | null;
  achieved_note: string | null;
  created_at:    string;
  updated_at:    string;
  staff?:        { name: string; position: string | null } | null;
}

export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  assigne:     'Assigné',
  en_cours:    'En cours',
  atteint:     'Atteint',
  non_atteint: 'Non atteint',
};

export async function getObjectives(businessId: string, staffId?: string): Promise<StaffObjective[]> {
  let query = supabase
    .from('staff_objectives')
    .select('*, staff(name, position)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (staffId) query = query.eq('staff_id', staffId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffObjective[];
}

export async function createObjective(input: {
  business_id: string;
  staff_id:    string;
  assigned_by: string;
  title:       string;
  description?: string | null;
  target_date?: string | null;
}): Promise<StaffObjective> {
  const { data, error } = await supabase
    .from('staff_objectives')
    .insert(input as unknown as TablesInsert<'staff_objectives'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StaffObjective;
}

/** Édition complète : réservée à l'admin/manager (gérée par l'UI + RLS). */
export async function updateObjective(id: string, patch: Partial<{
  title: string; description: string | null; target_date: string | null; status: ObjectiveStatus;
}>): Promise<void> {
  const { error } = await supabase
    .from('staff_objectives')
    .update(patch as unknown as TablesUpdate<'staff_objectives'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Mise à jour étroite pour l'employé assigné (self-service) : auto-déclaration de progression. */
export async function markObjectiveProgress(id: string, status: ObjectiveStatus, note?: string | null): Promise<void> {
  const { error } = await supabase
    .from('staff_objectives')
    .update({
      status,
      achieved_at:   status === 'atteint' ? new Date().toISOString() : null,
      achieved_note: note ?? null,
    } as unknown as TablesUpdate<'staff_objectives'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteObjective(id: string): Promise<void> {
  const { error } = await supabase.from('staff_objectives').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
