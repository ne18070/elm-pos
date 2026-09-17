import { supabase } from './client';
import type { TablesInsert, TablesUpdate } from './database.types';

export type TaskStatus   = 'a_faire' | 'en_cours' | 'terminee' | 'annulee';
export type TaskPriority = 'basse' | 'normale' | 'haute';

export interface StaffTask {
  id:           string;
  business_id:  string;
  assigned_to:  string;
  created_by:   string | null;
  title:        string;
  description:  string | null;
  status:       TaskStatus;
  priority:     TaskPriority;
  due_date:     string | null;
  completed_at: string | null;
  created_at:   string;
  updated_at:   string;
  assignee?:    { name: string; position: string | null } | null;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  a_faire:  'À faire',
  en_cours: 'En cours',
  terminee: 'Terminée',
  annulee:  'Annulée',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  basse:   'Basse',
  normale: 'Normale',
  haute:   'Haute',
};

/**
 * Liste les tâches d'un business, avec filtres optionnels. Sans filtre, la
 * requête renvoie tout ce que la RLS autorise pour l'appelant : la totalité
 * pour un admin/manager, seulement ses propres tâches (assignées ou créées)
 * pour un compte 'staff' — donc la même fonction sert la vue admin (non
 * filtrée) et la vue self-service (filtrée côté client ou via ces options).
 */
export async function getStaffTasks(
  businessId: string,
  options?: { assignedTo?: string; createdBy?: string },
): Promise<StaffTask[]> {
  let query = supabase
    .from('staff_tasks')
    .select('*, assignee:staff!staff_tasks_assigned_to_fkey(name, position)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (options?.assignedTo) query = query.eq('assigned_to', options.assignedTo);
  if (options?.createdBy)  query = query.eq('created_by', options.createdBy);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffTask[];
}

export async function createTask(input: {
  business_id: string;
  assigned_to: string;
  created_by:  string;
  title:       string;
  description?: string | null;
  priority?:   TaskPriority;
  due_date?:   string | null;
}): Promise<StaffTask> {
  const { data, error } = await supabase
    .from('staff_tasks')
    .insert(input as unknown as TablesInsert<'staff_tasks'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StaffTask;
}

/** Mise à jour étroite pour l'assigné (self-service) : uniquement le statut. */
export async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase
    .from('staff_tasks')
    .update({
      status,
      completed_at: status === 'terminee' ? new Date().toISOString() : null,
    } as unknown as TablesUpdate<'staff_tasks'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Édition complète : réservée au créateur ou à un admin/manager (gérée par l'UI + RLS). */
export async function updateTask(id: string, patch: Partial<{
  title: string; description: string | null; priority: TaskPriority; due_date: string | null; assigned_to: string;
}>): Promise<void> {
  const { error } = await supabase
    .from('staff_tasks')
    .update(patch as unknown as TablesUpdate<'staff_tasks'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('staff_tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
