import { supabase } from './client';

// Tables not yet in database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// ─── Types ────────────────────────────────────────────────────────────────────

export type SalaryType  = 'hourly' | 'daily' | 'monthly';
export type StaffStatus = 'active' | 'inactive';
export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave' | 'holiday' | 'retard';
export type ClockMethod = 'manual' | 'login' | 'badge';
export type ClockMode   = 'auto' | 'badge' | 'manual'; // canal automatique autorisé pour cet employé
export type PaymentMethod = 'cash' | 'transfer' | 'mobile_money' | 'check';
export type PaymentStatus = 'pending' | 'paid';

export const CLOCK_MODE_LABELS: Record<ClockMode, string> = {
  auto:   'Automatique (connexion)',
  badge:  'Badge',
  manual: 'Manuel (grille de présence)',
};

export interface Staff {
  id:                   string;
  business_id:          string;
  name:                 string;
  phone:                string | null;
  email:                string | null;
  position:             string | null;
  department:           string | null;
  salary_type:          SalaryType;
  salary_rate:          number;
  hire_date:            string | null;
  status:                StaffStatus;
  notes:                string | null;
  user_id:              string | null;  // lié à un compte système
  badge_code:           string | null;  // code-barres du badge de pointage
  clock_mode:           ClockMode;      // canal de pointage automatique autorisé
  manager_id:           string | null;  // organigramme : rattaché à un autre employé
  contract_type:        string | null;  // ex: CDI, CDD, Stage, Freelance — libre, non contraint
  contract_start_date:  string | null;
  contract_end_date:    string | null;
  probation_end_date:   string | null;
  termination_date:     string | null;
  termination_reason:   string | null;
  created_at:           string;
  updated_at:           string;
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
  clock_method: ClockMethod;
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
  gross_amount:                  number | null;
  total_employee_contributions:  number | null;
  total_employer_contributions:  number | null;
  staff?:         Pick<Staff, 'name' | 'position' | 'salary_type' | 'salary_rate'> | null;
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
  return (data ?? []) as unknown as Staff[];
}

export async function createStaff(businessId: string, form: StaffForm): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .insert({ ...form, business_id: businessId } as unknown as import('./database.types').TablesInsert<'staff'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Staff;
}

export async function updateStaff(id: string, form: Partial<StaffForm>): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update({ ...form, updated_at: new Date().toISOString() } as unknown as import('./database.types').TablesUpdate<'staff'>)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Staff;
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
  return (data ?? []) as unknown as StaffAttendance[];
}

/**
 * Présences d'un seul employé (self-service) — filtre explicitement par
 * staff_id plutôt que de compter sur la RLS pour ne pas renvoyer tout le
 * business à un admin/manager consultant sa propre vue.
 */
export async function getMyAttendance(
  staffId: string,
  year: number,
  month: number, // 1-12
): Promise<StaffAttendance[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('staff_attendance')
    .select('*')
    .eq('staff_id', staffId)
    .gte('date', start)
    .lte('date', end);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffAttendance[];
}

/**
 * Comme `getAttendanceForMonth`, mais élargi aux semaines ISO (lundi-dimanche)
 * complètes chevauchant le mois, pour que `computeOvertime` voie le total
 * hebdomadaire réel même sur les semaines à cheval sur deux mois. À combiner
 * avec l'attribution par mois de `computeOvertime` (le mois du lundi de la
 * semaine) pour ne compter chaque semaine que dans un seul mois.
 */
export async function getAttendanceForOvertimeWindow(
  businessId: string,
  year: number,
  month: number,
): Promise<StaffAttendance[]> {
  const first = new Date(year, month - 1, 1);
  const last  = new Date(year, month, 0);
  const firstWeekday = (first.getDay() + 6) % 7; // lundi = 0
  const lastWeekday  = (last.getDay() + 6) % 7;
  const start = new Date(first); start.setDate(start.getDate() - firstWeekday);
  const end   = new Date(last);  end.setDate(end.getDate() + (6 - lastWeekday));

  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('staff_attendance')
    .select('*')
    .eq('business_id', businessId)
    .gte('date', fmt(start))
    .lte('date', fmt(end));
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffAttendance[];
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
  clock_method?: ClockMethod;
}): Promise<StaffAttendance> {
  const { data, error } = await supabase
    .from('staff_attendance')
    .upsert(record as unknown as import('./database.types').TablesInsert<'staff_attendance'>, { onConflict: 'staff_id,date' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StaffAttendance;
}

export async function deleteAttendance(id: string): Promise<void> {
  const { error } = await supabase.from('staff_attendance').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function getPayments(
  businessId: string,
  options?: { year?: number; month?: number; staff_id?: string },
): Promise<StaffPayment[]> {
  let query = supabase
    .from('staff_payments')
    .select('*, staff(name, position, salary_type, salary_rate)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (options?.staff_id) query = query.eq('staff_id', options.staff_id);

  if (options?.year && options?.month) {
    const start = `${options.year}-${String(options.month).padStart(2, '0')}-01`;
    const lastDay = new Date(options.year, options.month, 0).getDate();
    const end = `${options.year}-${String(options.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    query = query.gte('period_start', start).lte('period_start', end);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffPayment[];
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
  gross_amount?:                  number;
  total_employee_contributions?:  number;
  total_employer_contributions?:  number;
}): Promise<StaffPayment> {
  const { data, error } = await supabase
    .from('staff_payments')
    .insert(input as unknown as import('./database.types').TablesInsert<'staff_payments'>)
    .select('*, staff(name, position, salary_type, salary_rate)')
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StaffPayment;
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

// ─── Heures supplémentaires (client-side) ─────────────────────────────────────

export interface OvertimeCalc {
  regularHours:  number;
  overtimeHours: number;
}

/**
 * Heures sup calculées par semaine calendaire (lundi-dimanche) : pour chaque semaine
 * couverte par le mois, tout ce qui dépasse `weekly_hours_threshold` est compté en
 * heures sup. Seuil générique et configurable par business (pas de règle légale figée).
 *
 * `attribution` (année/mois) n'est nécessaire que si `attendance` provient de
 * `getAttendanceForOvertimeWindow` (fenêtre élargie aux semaines complètes) : une
 * semaine à cheval sur deux mois n'est alors comptée que dans le mois de son lundi,
 * pour éviter un double comptage entre la vue de janvier et celle de février.
 * Avec `getAttendanceForMonth` (fenêtre stricte, sans padding), omettre `attribution`
 * conserve l'ancien comportement (semaines partielles en bord de mois).
 */
export function computeOvertime(
  attendance: StaffAttendance[],
  staffId: string,
  weeklyHoursThreshold: number,
  attribution?: { year: number; month: number }, // 1-12
): OvertimeCalc {
  const records = attendance.filter((a) => a.staff_id === staffId && a.hours_worked);

  function isoWeekMonday(dateStr: string): Date {
    const d = new Date(dateStr + 'T00:00:00');
    const day = (d.getDay() + 6) % 7; // lundi = 0
    d.setDate(d.getDate() - day);
    return d;
  }

  const byWeek = new Map<string, { total: number; monday: Date }>();
  for (const r of records) {
    const monday = isoWeekMonday(r.date);
    const key = monday.toISOString().split('T')[0];
    const entry = byWeek.get(key) ?? { total: 0, monday };
    entry.total += r.hours_worked ?? 0;
    byWeek.set(key, entry);
  }

  let regularHours = 0;
  let overtimeHours = 0;
  for (const { total, monday } of byWeek.values()) {
    if (attribution && (monday.getFullYear() !== attribution.year || monday.getMonth() + 1 !== attribution.month)) {
      continue;
    }
    const overtime = Math.max(0, total - weeklyHoursThreshold);
    overtimeHours += overtime;
    regularHours += total - overtime;
  }

  return { regularHours, overtimeHours };
}

// ─── Payroll calculation (client-side) ───────────────────────────────────────

export interface PayrollCalc {
  daysWorked:    number;  // includes 0.5 for half_day
  hoursWorked:   number;
  absentDays:    number;
  baseAmount:    number;
  overtimeHours: number;
  overtimePay:   number;
}

import { getLeaveRequests, type LeaveRequest } from './leave';

// ... (types and other functions)

/**
 * Compute payroll for one staff member based on attendance records and leave requests.
 * `overtime`/`overtimeMultiplier` (from computeOvertime + staff_time_settings) only affect
 * `baseAmount` for hourly staff — daily/monthly salary types have no per-hour rate to apply
 * a premium to.
 */
export function computePayroll(
  staff: Staff,
  attendance: StaffAttendance[],
  year: number,
  month: number,
  leaveRequests: LeaveRequest[] = [], // Optional for backward compatibility
  overtime?: OvertimeCalc,
  overtimeMultiplier = 1,
): PayrollCalc {
  const records = attendance.filter((a) => a.staff_id === staff.id);
  const leaves  = leaveRequests.filter((l) => l.staff_id === staff.id && l.status === 'approved');
  const daysInMonth = new Date(year, month, 0).getDate();

  let daysWorked  = 0;
  let hoursWorked = 0;
  let absentDays  = 0;

  // 1. Process attendance records
  for (const r of records) {
    if (r.status === 'present' || r.status === 'holiday' || r.status === 'leave' || r.status === 'retard') {
      daysWorked  += 1;
      hoursWorked += r.hours_worked ?? 8;
    } else if (r.status === 'half_day') {
      daysWorked  += 0.5;
      hoursWorked += r.hours_worked ?? 4;
    } else if (r.status === 'absent') {
      absentDays += 1;
    }
  }

  // 2. Process leave requests (if not already in attendance as 'leave')
  // Usually approved leave requests are synced to attendance table, 
  // but we add this check for robustness.
  for (const l of leaves) {
    // Only count if it's a PAID leave and NOT already in attendance to avoid double counting
    // This is a placeholder for more complex logic if needed.
  }

  let baseAmount = 0;
  let overtimeHours = 0;
  let overtimePay = 0;
  if (staff.salary_type === 'hourly') {
    if (overtime) {
      overtimeHours = overtime.overtimeHours;
      overtimePay   = overtime.overtimeHours * staff.salary_rate * overtimeMultiplier;
      baseAmount    = overtime.regularHours * staff.salary_rate + overtimePay;
    } else {
      baseAmount = hoursWorked * staff.salary_rate;
    }
  } else if (staff.salary_type === 'daily') {
    baseAmount = daysWorked * staff.salary_rate;
  } else {
    // monthly: Base is full salary. 
    if (records.length === 0 && leaves.length === 0) {
      baseAmount = staff.salary_rate;
      daysWorked = 30; 
    } else {
      const deductionDays = absentDays + (records.filter(r => r.status === 'half_day').length * 0.5);
      baseAmount = Math.max(0, staff.salary_rate * (1 - (deductionDays / daysInMonth)));
    }
  }

  return { daysWorked, hoursWorked, absentDays, baseAmount, overtimeHours, overtimePay };
}

/** Fiche employé liée au compte de l'utilisateur connecté (self-service) */
export async function getMyStaffRecord(businessId: string, userId: string): Promise<Staff | null> {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as Staff | null;
}

export async function getStaffById(id: string): Promise<Staff | null> {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as Staff | null;
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

/**
 * Enregistre automatiquement la présence pour l'utilisateur connecté
 * S'il est lié à une fiche staff active dans ce business.
 */
export async function autoRecordPresence(businessId: string, userId: string): Promise<boolean> {
  try {
    // 1. Trouver l'employé actif lié à cet utilisateur
    const { data: staff, error: staffErr } = await supabase
      .from('staff')
      .select('id, clock_mode')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (staffErr || !staff) return false;
    if (staff.clock_mode !== 'auto') return false; // canal auto désactivé pour cet employé

    const today = new Date().toISOString().split('T')[0];

    // 2. Vérifier s'il a déjà pointé aujourd'hui
    const { data: existing } = await supabase
      .from('staff_attendance')
      .select('id')
      .eq('staff_id', staff.id)
      .eq('date', today)
      .maybeSingle();

    if (existing) return true; // Déjà pointé

    // 3. Pointer automatiquement (Présent + Heure actuelle)
    const now = new Date();
    const clockIn = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    await upsertAttendance({
      business_id:  businessId,
      staff_id:     staff.id,
      date:         today,
      status:       'present',
      clock_in:     clockIn,
      hours_worked: 8, // Par défaut une journée complète
      notes:        'Pointage automatique au login',
      clock_method: 'login',
    });

    return true;
  } catch (e) {
    console.error('[autoRecordPresence]', e);
    return false;
  }
}

/**
 * Enregistre automatiquement le départ pour l'utilisateur connecté
 */
export async function autoRecordDeparture(businessId: string, userId: string): Promise<boolean> {
  try {
    const { data: staff } = await supabase
      .from('staff')
      .select('id, clock_mode')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!staff) return false;
    if (staff.clock_mode !== 'auto') return false; // canal auto désactivé pour cet employé

    const today = new Date().toISOString().split('T')[0];

    // Trouver le pointage d'aujourd'hui
    const { data: existing } = await supabase
      .from('staff_attendance')
      .select('*')
      .eq('staff_id', staff.id)
      .eq('date', today)
      .maybeSingle();

    if (!existing) return false; // Pas d'entrée aujourd'hui

    const now = new Date();
    const clockOut = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Calculer les heures travaillées (optionnel, basé sur clock_in)
    let hours = existing.hours_worked;
    if (existing.clock_in) {
      const [hIn, mIn] = existing.clock_in.split(':').map(Number);
      const startTime = new Date();
      startTime.setHours(hIn, mIn, 0);
      const diffMs = now.getTime() - startTime.getTime();
      hours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10; // Arrondi à 1 décimale
    }

    await upsertAttendance({
      ...existing,
      status: existing.status as AttendanceStatus,
      clock_out: clockOut,
      hours_worked: (hours ?? 0) > 0 ? hours : 8,
      notes: (existing.notes ? existing.notes + ' | ' : '') + 'Départ auto à la déconnexion',
      clock_method: existing.clock_method as ClockMethod,
    });

    return true;
  } catch (e) {
    console.error('[autoRecordDeparture]', e);
    return false;
  }
}

/**
 * Met à jour silencieusement l'heure de dernière activité (heartbeat)
 */
export async function updateStaffHeartbeat(businessId: string, userId: string): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: staff } = await supabase
      .from('staff')
      .select('id, clock_mode')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!staff) return;
    if (staff.clock_mode !== 'auto') return; // canal auto désactivé pour cet employé

    const { data: existing } = await supabase
      .from('staff_attendance')
      .select('*')
      .eq('staff_id', staff.id)
      .eq('date', today)
      .maybeSingle();

    if (!existing) {
      // Si par hasard il n'a pas pointé au login, on le fait maintenant
      await autoRecordPresence(businessId, userId);
      return;
    }

    const now = new Date();
    const clockOut = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Calcul des heures
    let hours = 8;
    if (existing.clock_in) {
      const [hIn, mIn] = existing.clock_in.split(':').map(Number);
      const startTime = new Date();
      startTime.setHours(hIn, mIn, 0);
      const diffMs = now.getTime() - startTime.getTime();
      hours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
    }

    await supabase
      .from('staff_attendance')
      .update({
        clock_out: clockOut,
        hours_worked: hours > 0 ? hours : 8
      })
      .eq('id', existing.id);

  } catch (e) {
    // Silencieux pour ne pas gêner l'utilisateur
  }
}

// ─── Pointage par badge (code-barres) ──────────────────────────────────────────

export interface BadgeClockResult {
  staffId:   string;
  staffName: string;
  action:    'clock_in' | 'clock_out';
  time:      string; // HH:MM
}

/**
 * Pointe l'employé associé à ce code de badge : premier scan du jour =
 * arrivée, second scan = départ (avec calcul des heures). Un troisième
 * scan le même jour est refusé — corriger via la grille de présence.
 */
export async function recordBadgeClock(businessId: string, badgeCode: string): Promise<BadgeClockResult> {
  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('id, name, clock_mode')
    .eq('business_id', businessId)
    .eq('badge_code', badgeCode)
    .eq('status', 'active')
    .maybeSingle();

  if (staffErr) throw new Error(staffErr.message);
  if (!staff) throw new Error('Badge inconnu — aucun employé actif associé à ce code');
  if (staff.clock_mode !== 'badge') {
    throw new Error(`Le pointage par badge n'est pas activé pour ${staff.name} (méthode actuelle : ${CLOCK_MODE_LABELS[staff.clock_mode as ClockMode] ?? staff.clock_mode})`);
  }

  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('staff_attendance')
    .select('*')
    .eq('staff_id', staff.id)
    .eq('date', today)
    .maybeSingle();

  const now  = new Date();
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (!existing || !existing.clock_in) {
    await upsertAttendance({
      business_id:  businessId,
      staff_id:     staff.id,
      date:         today,
      status:       'present',
      clock_in:     time,
      clock_out:    existing?.clock_out ?? null,
      hours_worked: existing?.hours_worked ?? null,
      notes:        existing?.notes ?? null,
      clock_method: 'badge',
    });
    return { staffId: staff.id, staffName: staff.name, action: 'clock_in', time };
  }

  if (!existing.clock_out) {
    const [hIn, mIn] = existing.clock_in.split(':').map(Number);
    const startTime = new Date();
    startTime.setHours(hIn, mIn, 0);
    const diffMs = now.getTime() - startTime.getTime();
    const hours  = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;

    await upsertAttendance({
      business_id:  businessId,
      staff_id:     staff.id,
      date:         today,
      status:       existing.status as AttendanceStatus,
      clock_in:     existing.clock_in,
      clock_out:    time,
      hours_worked: hours > 0 ? hours : existing.hours_worked,
      notes:        existing.notes,
      clock_method: 'badge',
    });
    return { staffId: staff.id, staffName: staff.name, action: 'clock_out', time };
  }

  throw new Error(`${staff.name} a déjà pointé son départ aujourd'hui (${existing.clock_out})`);
}
