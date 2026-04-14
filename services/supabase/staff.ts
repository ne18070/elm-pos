import { supabase as _supabase } from './client';

// Tables not yet in database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

export type SalaryType  = 'hourly' | 'daily' | 'monthly';
export type StaffStatus = 'active' | 'inactive';
export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave' | 'holiday';
export type PaymentMethod = 'cash' | 'transfer' | 'mobile_money' | 'check';
export type PaymentStatus = 'pending' | 'paid';

export interface Staff {
  id:           string;
  business_id:  string;
  name:         string;
  phone:        string | null;
  email:        string | null;
  position:     string | null;
  department:   string | null;
  salary_type:  SalaryType;
  salary_rate:  number;
  hire_date:    string | null;
  status:       StaffStatus;
  notes:        string | null;
  user_id:      string | null;  // lié à un compte système
  created_at:   string;
  updated_at:   string;
}

export interface StaffAttendance {
  id:           string;
  business_id:  string;
  staff_id:     string;
  date:         string;        // YYYY-MM-DD
  status:       AttendanceStatus;
  clock_in:     string | null; // HH:MM
  clock_out:    string | null; // HH:MM
  hours_worked: number | null;
  notes:        string | null;
  created_at:   string;
}

export interface StaffPayment {
  id:             string;
  business_id:    string;
  staff_id:       string;
  period_start:   string;
  period_end:     string;
  base_amount:    number;
  bonuses:        number;
  deductions:     number;
  net_amount:     number;
  days_worked:    number | null;
  hours_worked:   number | null;
  payment_method: PaymentMethod;
  payment_date:   string | null;
  status:         PaymentStatus;
  notes:          string | null;
  created_at:     string;
  staff?:         Pick<Staff, 'name' | 'position' | 'salary_type'> | null;
}

export type StaffForm = Omit<Staff, 'id' | 'business_id' | 'created_at' | 'updated_at'>;

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  hourly:  'Horaire',
  daily:   'Journalier',
  monthly: 'Mensuel',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:         'Espèces',
  transfer:     'Virement',
  mobile_money: 'Mobile Money',
  check:        'Chèque',
};

// ─── Staff CRUD ───────────────────────────────────────────────────────────────

export async function getStaff(businessId: string): Promise<Staff[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('business_id', businessId)
    .order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createStaff(businessId: string, form: StaffForm): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .insert({ ...form, business_id: businessId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateStaff(id: string, form: Partial<StaffForm>): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update({ ...form, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteStaff(id: string): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function getAttendanceForMonth(
  businessId: string,
  year: number,
  month: number, // 1-12
): Promise<StaffAttendance[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('staff_attendance')
    .select('*')
    .eq('business_id', businessId)
    .gte('date', start)
    .lte('date', end);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertAttendance(record: {
  business_id:  string;
  staff_id:     string;
  date:         string;
  status:       AttendanceStatus;
  clock_in?:    string | null;
  clock_out?:   string | null;
  hours_worked?: number | null;
  notes?:       string | null;
}): Promise<StaffAttendance> {
  const { data, error } = await supabase
    .from('staff_attendance')
    .upsert(record, { onConflict: 'staff_id,date' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteAttendance(id: string): Promise<void> {
  const { error } = await supabase.from('staff_attendance').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function getPayments(
  businessId: string,
  options?: { year?: number; month?: number },
): Promise<StaffPayment[]> {
  let query = supabase
    .from('staff_payments')
    .select('*, staff(name, position, salary_type)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (options?.year && options?.month) {
    const start = `${options.year}-${String(options.month).padStart(2, '0')}-01`;
    const lastDay = new Date(options.year, options.month, 0).getDate();
    const end = `${options.year}-${String(options.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    query = query.gte('period_start', start).lte('period_start', end);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPayment(input: {
  business_id:    string;
  staff_id:       string;
  period_start:   string;
  period_end:     string;
  base_amount:    number;
  bonuses:        number;
  deductions:     number;
  net_amount:     number;
  days_worked:    number | null;
  hours_worked:   number | null;
  payment_method: PaymentMethod;
  payment_date:   string | null;
  status:         PaymentStatus;
  notes:          string;
}): Promise<StaffPayment> {
  const { data, error } = await supabase
    .from('staff_payments')
    .insert(input)
    .select('*, staff(name, position, salary_type)')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function markPaymentPaid(
  id: string,
  paymentDate: string,
  method: PaymentMethod,
): Promise<void> {
  const { error } = await supabase
    .from('staff_payments')
    .update({ status: 'paid', payment_date: paymentDate, payment_method: method })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from('staff_payments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Payroll calculation (client-side) ───────────────────────────────────────

export interface PayrollCalc {
  daysWorked:  number;  // includes 0.5 for half_day
  hoursWorked: number;
  absentDays:  number;
  baseAmount:  number;
}

/** Compute payroll for one staff member based on attendance records */
export function computePayroll(
  staff: Staff,
  attendance: StaffAttendance[],
  year: number,
  month: number,
): PayrollCalc {
  const records = attendance.filter((a) => a.staff_id === staff.id);
  const daysInMonth = new Date(year, month, 0).getDate();

  let daysWorked  = 0;
  let hoursWorked = 0;
  let absentDays  = 0;

  for (const r of records) {
    if (r.status === 'present' || r.status === 'holiday' || r.status === 'leave') {
      daysWorked  += 1;
      hoursWorked += r.hours_worked ?? 8;
    } else if (r.status === 'half_day') {
      daysWorked  += 0.5;
      hoursWorked += r.hours_worked ?? 4;
    } else if (r.status === 'absent') {
      absentDays += 1;
    }
  }

  let baseAmount = 0;
  if (staff.salary_type === 'hourly') {
    baseAmount = hoursWorked * staff.salary_rate;
  } else if (staff.salary_type === 'daily') {
    baseAmount = daysWorked * staff.salary_rate;
  } else {
    // monthly: proportional to days attended vs days in month
    baseAmount = daysInMonth > 0
      ? (daysWorked / daysInMonth) * staff.salary_rate
      : staff.salary_rate;
    // If no attendance recorded at all, assume full month (don't penalize for missing data)
    if (records.length === 0) baseAmount = staff.salary_rate;
  }

  return { daysWorked, hoursWorked, absentDays, baseAmount };
}

// ─── Liaison compte système ───────────────────────────────────────────────────

/** Lie un employé à un compte utilisateur système */
export async function linkStaffToUser(staffId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('staff')
    .update({ user_id: userId })
    .eq('id', staffId);
  if (error) throw new Error(error.message);
}

/** Supprime le lien entre un employé et son compte système */
export async function unlinkStaffUser(staffId: string): Promise<void> {
  const { error } = await supabase
    .from('staff')
    .update({ user_id: null })
    .eq('id', staffId);
  if (error) throw new Error(error.message);
}
