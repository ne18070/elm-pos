import { supabase } from './client';
import type { TablesInsert, TablesUpdate } from './database.types';
import type { Student, Classroom, Grade } from '../../types';


// ─── Classrooms ───────────────────────────────────────────────────────────────

export async function getClassrooms(businessId: string): Promise<Classroom[]> {
  const { data, error } = await supabase
    .from('edu_classrooms')
    .select('*')
    .eq('business_id', businessId)
    .order('level', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data as unknown as Classroom[];
}

export async function createClassroom(classroom: Partial<Classroom>): Promise<Classroom> {
  const { data, error } = await supabase
    .from('edu_classrooms')
    .insert(classroom as unknown as TablesInsert<'edu_classrooms'>)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Classroom;
}

export async function updateClassroom(id: string, updates: Partial<Classroom>): Promise<Classroom> {
  const { data, error } = await supabase
    .from('edu_classrooms')
    .update(updates as unknown as TablesUpdate<'edu_classrooms'>)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Classroom;
}

export async function deleteClassroom(id: string): Promise<void> {
  const { error } = await supabase
    .from('edu_classrooms')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ─── Students ─────────────────────────────────────────────────────────────────

export async function getStudents(businessId: string, classroomId?: string): Promise<Student[]> {
  let query = supabase
    .from('edu_students')
    .select('*, classroom:edu_classrooms(name)')
    .eq('business_id', businessId);

  if (classroomId) {
    query = query.eq('classroom_id', classroomId);
  }

  const { data, error } = await query
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) throw new Error(error.message);
  return data as unknown as Student[];
}

export async function createStudent(student: Partial<Student>): Promise<Student> {
  const { data, error } = await supabase
    .from('edu_students')
    .insert(student as unknown as TablesInsert<'edu_students'>)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Student;
}

export async function updateStudent(id: string, updates: Partial<Student>): Promise<Student> {
  const { data, error } = await supabase
    .from('edu_students')
    .update(updates as unknown as TablesUpdate<'edu_students'>)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Student;
}

export async function deleteStudent(id: string): Promise<void> {
  const { error } = await supabase
    .from('edu_students')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ─── Grades ───────────────────────────────────────────────────────────────────

export async function getGrades(businessId: string, studentId?: string, term?: string): Promise<Grade[]> {
  let query = supabase
    .from('edu_grades')
    .select('*, student:edu_students(first_name, last_name)')
    .eq('business_id', businessId);

  if (studentId) query = query.eq('student_id', studentId);
  if (term)      query = query.eq('term', term);

  const { data, error } = await query.order('evaluation_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data as unknown as Grade[];
}

export async function addGrade(grade: Partial<Grade>): Promise<Grade> {
  const { data, error } = await supabase
    .from('edu_grades')
    .insert(grade as unknown as TablesInsert<'edu_grades'>)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Grade;
}

export async function deleteGrade(id: string): Promise<void> {
  const { error } = await supabase
    .from('edu_grades')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ─── Frais de scolarité (migration 171) ───────────────────────────────────────
// Un frais = une commande liée à un élève (orders.student_id, source
// 'scolarite', motif dans `notes`) ; chaque versement = une ligne payments.
// amount_paid / balance_due sont tenus à jour par la base (migration 112).

export type FeePaymentMethod = 'cash' | 'card' | 'mobile_money';

export interface SchoolFee {
  id:          string;
  created_at:  string;
  updated_at:  string;
  status:      'pending' | 'paid' | 'cancelled' | 'refunded';
  total:       number;
  amount_paid: number;
  balance_due: number;
  /** Motif du frais (« Mensualité novembre »…) */
  notes:       string | null;
  student: {
    id:           string;
    first_name:   string;
    last_name:    string;
    parent_name:  string | null;
    parent_phone: string | null;
    classroom_id: string | null;
    classroom:    { name: string } | null;
  } | null;
  payments: { method: string; amount: number; paid_at: string }[];
}

/** Frais restant à encaisser — tous, les plus anciens d'abord (à relancer en priorité). */
export async function getPendingSchoolFees(businessId: string): Promise<SchoolFee[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, created_at, updated_at, status, total, amount_paid, balance_due, notes, student:edu_students(id, first_name, last_name, parent_name, parent_phone, classroom_id, classroom:edu_classrooms(name)), payments(method, amount, paid_at)')
    .eq('business_id', businessId)
    .not('student_id', 'is', null)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SchoolFee[];
}

/** Derniers frais réglés, du plus récemment soldé au plus ancien. */
export async function getPaidSchoolFees(businessId: string, limit = 200): Promise<SchoolFee[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, created_at, updated_at, status, total, amount_paid, balance_due, notes, student:edu_students(id, first_name, last_name, parent_name, parent_phone, classroom_id, classroom:edu_classrooms(name)), payments(method, amount, paid_at)')
    .eq('business_id', businessId)
    .not('student_id', 'is', null)
    .eq('status', 'paid')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SchoolFee[];
}

/** Somme des versements reçus sur des frais de scolarité depuis `sinceIso`. */
export async function getSchoolFeesCollectedSince(businessId: string, sinceIso: string): Promise<number> {
  const { data, error } = await supabase
    .from('payments')
    .select('amount, order:orders!inner(business_id, student_id)')
    .eq('order.business_id', businessId)
    .not('order.student_id', 'is', null)
    .gte('paid_at', sinceIso);

  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
}

/** Crée un frais pour un élève ; `paidAmount` > 0 l'encaisse (en tout ou partie) dans la foulée. */
export async function createSchoolFee(params: {
  businessId: string;
  studentId:  string;
  label:      string;
  amount:     number;
  paidAmount: number;
  method:     FeePaymentMethod;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_school_fee', {
    p_business_id: params.businessId,
    p_student_id:  params.studentId,
    p_label:       params.label,
    p_amount:      params.amount,
    p_paid_amount: params.paidAmount,
    p_method:      params.method,
  });

  if (error) throw new Error(error.message);
  return data;
}

/** Émet le même frais « à payer » pour chaque élève actif de la classe. Renvoie le nombre créé. */
export async function issueClassFees(params: {
  businessId:  string;
  classroomId: string;
  label:       string;
  amount:      number;
}): Promise<number> {
  const { data, error } = await supabase.rpc('issue_class_fees', {
    p_business_id:  params.businessId,
    p_classroom_id: params.classroomId,
    p_label:        params.label,
    p_amount:       params.amount,
  });

  if (error) throw new Error(error.message);
  return data ?? 0;
}

/** Encaisse tout ou partie d'un frais en attente. Renvoie le reste dû. */
export async function paySchoolFee(orderId: string, amount: number, method: FeePaymentMethod): Promise<number> {
  const { data, error } = await supabase.rpc('pay_school_fee', {
    p_order_id: orderId,
    p_amount:   amount,
    p_method:   method,
  });

  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
