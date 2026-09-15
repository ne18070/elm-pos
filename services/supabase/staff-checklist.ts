import { supabase } from './client';
import type { TablesInsert, TablesUpdate } from './database.types';

export type ChecklistType = 'onboarding' | 'offboarding';

export interface StaffChecklistTemplate {
  id:          string;
  business_id: string;
  type:        ChecklistType;
  label:       string;
  order_index: number;
  is_active:   boolean;
  created_at:  string;
  updated_at:  string;
}

export interface StaffChecklistItem {
  id:          string;
  business_id: string;
  staff_id:    string;
  type:        ChecklistType;
  label:       string;
  order_index: number;
  is_done:     boolean;
  done_at:     string | null;
  done_by:     string | null;
  due_date:    string | null;
  created_at:  string;
}

// ─── Templates (configuration par business) ────────────────────────────────

export async function getChecklistTemplates(businessId: string, type?: ChecklistType): Promise<StaffChecklistTemplate[]> {
  let query = supabase
    .from('staff_checklist_templates')
    .select('*')
    .eq('business_id', businessId)
    .order('order_index');
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffChecklistTemplate[];
}

export async function createChecklistTemplate(input: {
  business_id: string; type: ChecklistType; label: string; order_index?: number;
}): Promise<StaffChecklistTemplate> {
  const { data, error } = await supabase
    .from('staff_checklist_templates')
    .insert(input as unknown as TablesInsert<'staff_checklist_templates'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StaffChecklistTemplate;
}

export async function updateChecklistTemplate(id: string, patch: Partial<Pick<StaffChecklistTemplate, 'label' | 'order_index' | 'is_active'>>): Promise<void> {
  const { error } = await supabase
    .from('staff_checklist_templates')
    .update(patch as unknown as TablesUpdate<'staff_checklist_templates'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteChecklistTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('staff_checklist_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Items (instances par employé) ──────────────────────────────────────────

export async function getChecklistItems(staffId: string, type?: ChecklistType): Promise<StaffChecklistItem[]> {
  let query = supabase
    .from('staff_checklist_items')
    .select('*')
    .eq('staff_id', staffId)
    .order('order_index');
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffChecklistItem[];
}

/** Génère les items d'un employé à partir des templates actifs du business (idempotent : ignore si déjà généré). */
export async function generateChecklistItems(businessId: string, staffId: string, type: ChecklistType): Promise<StaffChecklistItem[]> {
  const existing = await getChecklistItems(staffId, type);
  if (existing.length > 0) return existing;

  const templates = await getChecklistTemplates(businessId, type);
  const active = templates.filter((t) => t.is_active);
  if (active.length === 0) return [];

  const rows = active.map((t) => ({
    business_id: businessId,
    staff_id:    staffId,
    type,
    label:       t.label,
    order_index: t.order_index,
  }));

  const { data, error } = await supabase
    .from('staff_checklist_items')
    .insert(rows as unknown as TablesInsert<'staff_checklist_items'>[])
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffChecklistItem[];
}

export async function toggleChecklistItem(id: string, isDone: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('staff_checklist_items')
    .update({
      is_done: isDone,
      done_at: isDone ? new Date().toISOString() : null,
      done_by: isDone ? (user?.id ?? null) : null,
    } as unknown as TablesUpdate<'staff_checklist_items'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}
