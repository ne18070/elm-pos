import { supabase } from './client';
import type { TablesInsert } from './database.types';

export interface StaffSchedule {
  id:          string;
  business_id: string;
  staff_id:    string;
  weekday:     number;   // 0 = dimanche ... 6 = samedi
  start_time:  string;   // HH:MM:SS
  end_time:    string;   // HH:MM:SS
  is_active:   boolean;
  created_at:  string;
}

export interface StaffTimeSettings {
  business_id:             string;
  weekly_hours_threshold:  number;
  daily_hours_threshold:   number;
  overtime_multiplier:     number;
  updated_at:              string;
}

export const DEFAULT_TIME_SETTINGS: Omit<StaffTimeSettings, 'business_id' | 'updated_at'> = {
  weekly_hours_threshold: 40,
  daily_hours_threshold:  8,
  overtime_multiplier:    1.5,
};

export const WEEKDAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// ─── Horaires ────────────────────────────────────────────────────────────────

export async function getStaffSchedules(staffId: string): Promise<StaffSchedule[]> {
  const { data, error } = await supabase
    .from('staff_schedules')
    .select('*')
    .eq('staff_id', staffId)
    .order('weekday');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffSchedule[];
}

export async function getSchedulesForBusiness(businessId: string): Promise<StaffSchedule[]> {
  const { data, error } = await supabase
    .from('staff_schedules')
    .select('*')
    .eq('business_id', businessId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffSchedule[];
}

export async function setStaffSchedule(input: {
  business_id: string; staff_id: string; weekday: number; start_time: string; end_time: string;
}): Promise<StaffSchedule> {
  const { data, error } = await supabase
    .from('staff_schedules')
    .insert(input as unknown as TablesInsert<'staff_schedules'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StaffSchedule;
}

export async function deleteStaffSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('staff_schedules').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Seuils / heures supplémentaires ────────────────────────────────────────

export async function getTimeSettings(businessId: string): Promise<StaffTimeSettings> {
  const { data, error } = await supabase
    .from('staff_time_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as unknown as StaffTimeSettings;
  return { business_id: businessId, updated_at: new Date().toISOString(), ...DEFAULT_TIME_SETTINGS };
}

export async function upsertTimeSettings(input: {
  business_id: string; weekly_hours_threshold: number; daily_hours_threshold: number; overtime_multiplier: number;
}): Promise<StaffTimeSettings> {
  const { data, error } = await supabase
    .from('staff_time_settings')
    .upsert(input as unknown as TablesInsert<'staff_time_settings'>, { onConflict: 'business_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StaffTimeSettings;
}
