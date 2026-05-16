import { supabase as _supabase } from './client';
import type { Student, Classroom, Grade } from '../../types';

const supabase = _supabase as any;

// ─── Classrooms ───────────────────────────────────────────────────────────────

export async function getClassrooms(businessId: string): Promise<Classroom[]> {
  const { data, error } = await supabase
    .from('edu_classrooms')
    .select('*')
    .eq('business_id', businessId)
    .order('level', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function createClassroom(classroom: Partial<Classroom>): Promise<Classroom> {
  const { data, error } = await supabase
    .from('edu_classrooms')
    .insert(classroom)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateClassroom(id: string, updates: Partial<Classroom>): Promise<Classroom> {
  const { data, error } = await supabase
    .from('edu_classrooms')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
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
  return data;
}

export async function createStudent(student: Partial<Student>): Promise<Student> {
  const { data, error } = await supabase
    .from('edu_students')
    .insert(student)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateStudent(id: string, updates: Partial<Student>): Promise<Student> {
  const { data, error } = await supabase
    .from('edu_students')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
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
  return data;
}

export async function addGrade(grade: Partial<Grade>): Promise<Grade> {
  const { data, error } = await supabase
    .from('edu_grades')
    .insert(grade)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteGrade(id: string): Promise<void> {
  const { error } = await supabase
    .from('edu_grades')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
