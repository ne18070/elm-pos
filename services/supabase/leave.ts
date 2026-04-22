import { supabase as _supabase } from './client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveType {
  id:           string;
  business_id:  string;
  name:         string;
  description:  string | null;
  color:        string;
  icon:         string;
  yearly_days:  number;
  requires_approval: boolean;
  is_paid:      boolean;
  created_at:   string;
}

export interface LeaveRequest {
  id:             string;
  business_id:    string;
  staff_id:       string;
  leave_type_id:  string;
  start_date:     string;
  end_date:       string;
  total_days:     number;
  status:         LeaveStatus;
  reason:         string | null;
  admin_notes:    string | null;
  approved_at:    string | null;
  approved_by:    string | null;
  attachments:    string[];
  created_at:     string;
  staff?:         { name: string };
  leave_type?:    LeaveType;
}

export interface PressureDay {
  id:           string;
  business_id:  string;
  date:         string;
  reason:       string;
}

// ─── Leave Types ─────────────────────────────────────────────────────────────

export async function getLeaveTypes(businessId: string): Promise<LeaveType[]> {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('business_id', businessId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertLeaveType(type: Partial<LeaveType>): Promise<LeaveType> {
  const { data, error } = await supabase
    .from('leave_types')
    .upsert(type)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── Leave Requests ──────────────────────────────────────────────────────────

export async function getLeaveRequests(businessId: string, options?: { staff_id?: string; status?: LeaveStatus }): Promise<LeaveRequest[]> {
  let query = supabase
    .from('leave_requests')
    .select('*, staff(name), leave_type:leave_type_id(*)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (options?.staff_id) query = query.eq('staff_id', options.staff_id);
  if (options?.status)   query = query.eq('status', options.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createLeaveRequest(request: Omit<LeaveRequest, 'id' | 'created_at' | 'status'>): Promise<LeaveRequest> {
  const { data, error } = await supabase
    .from('leave_requests')
    .insert(request)
    .select('*, staff(name), leave_type:leave_type_id(*)')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateLeaveRequestStatus(id: string, status: LeaveStatus, notes?: string, adminId?: string): Promise<void> {
  const updates: any = { status, updated_at: new Date().toISOString() };
  if (notes) updates.admin_notes = notes;
  if (status === 'approved' && adminId) {
    updates.approved_at = new Date().toISOString();
    updates.approved_by = adminId;
  }
  
  const { error } = await supabase
    .from('leave_requests')
    .update(updates)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Pressure Days ───────────────────────────────────────────────────────────

export async function getPressureDays(businessId: string): Promise<PressureDay[]> {
  const { data, error } = await supabase
    .from('pressure_days')
    .select('*')
    .eq('business_id', businessId)
    .order('date');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addPressureDay(day: Omit<PressureDay, 'id'>): Promise<PressureDay> {
  const { data, error } = await supabase
    .from('pressure_days')
    .insert(day)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePressureDay(id: string): Promise<void> {
  const { error } = await supabase.from('pressure_days').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
