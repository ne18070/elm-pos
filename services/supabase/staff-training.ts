import { supabase } from './client';
import type { TablesInsert, TablesUpdate } from './database.types';

export type TrainingStatus = 'exprime' | 'en_attente' | 'approuvee' | 'rejetee' | 'realisee';

export interface StaffTrainingRequest {
  id:                    string;
  business_id:           string;
  staff_id:              string;
  title:                 string;
  is_need_only:          boolean;
  desired_period_start:  string | null;
  desired_period_end:    string | null;
  justification:         string | null;
  status:                TrainingStatus;
  admin_notes:           string | null;
  created_at:            string;
  updated_at:            string;
  staff?:                { name: string; position: string | null } | null;
}

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  exprime:     'Besoin exprimé',
  en_attente:  'En attente',
  approuvee:   'Approuvée',
  rejetee:     'Rejetée',
  realisee:    'Réalisée',
};

export async function getTrainingRequests(businessId: string, staffId?: string): Promise<StaffTrainingRequest[]> {
  let query = supabase
    .from('staff_training_requests')
    .select('*, staff(name, position)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (staffId) query = query.eq('staff_id', staffId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffTrainingRequest[];
}

export async function createTrainingRequest(input: {
  business_id:  string;
  staff_id:     string;
  title:        string;
  is_need_only: boolean;
  desired_period_start?: string | null;
  desired_period_end?:   string | null;
  justification?: string | null;
}): Promise<StaffTrainingRequest> {
  const { data, error } = await supabase
    .from('staff_training_requests')
    .insert(input as unknown as TablesInsert<'staff_training_requests'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StaffTrainingRequest;
}

export async function updateTrainingRequestStatus(id: string, status: TrainingStatus, adminNotes?: string | null): Promise<void> {
  const { error } = await supabase
    .from('staff_training_requests')
    .update({ status, admin_notes: adminNotes ?? null } as unknown as TablesUpdate<'staff_training_requests'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTrainingRequest(id: string): Promise<void> {
  const { error } = await supabase.from('staff_training_requests').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
