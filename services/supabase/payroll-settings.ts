import { supabase } from './client';
import type { TablesInsert, TablesUpdate } from './database.types';

export type ContributionPayer  = 'employee' | 'employer' | 'both';
export type ContributionMethod = 'percent_of_gross' | 'fixed_amount';

export interface PayrollContributionType {
  id:              string;
  business_id:     string;
  name:            string;
  code:            string | null;
  payer:           ContributionPayer;
  calc_method:     ContributionMethod;
  rate_percent:    number | null;
  fixed_amount:    number | null;
  ceiling_amount:  number | null;
  is_active:       boolean;
  order_index:     number;
  created_at:      string;
  updated_at:      string;
}

export interface StaffPaymentLine {
  id:                    string;
  payment_id:            string;
  contribution_type_id:  string | null;
  name:                  string;
  payer:                 'employee' | 'employer';
  base_amount:           number;
  computed_amount:       number;
  created_at:            string;
}

// ─── CRUD lignes de cotisation ──────────────────────────────────────────────

export async function getContributionTypes(businessId: string): Promise<PayrollContributionType[]> {
  const { data, error } = await supabase
    .from('payroll_contribution_types')
    .select('*')
    .eq('business_id', businessId)
    .order('order_index');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PayrollContributionType[];
}

export async function createContributionType(input: {
  business_id: string; name: string; payer: ContributionPayer; calc_method: ContributionMethod;
  rate_percent?: number | null; fixed_amount?: number | null; ceiling_amount?: number | null; order_index?: number;
}): Promise<PayrollContributionType> {
  const { data, error } = await supabase
    .from('payroll_contribution_types')
    .insert(input as unknown as TablesInsert<'payroll_contribution_types'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as PayrollContributionType;
}

export async function updateContributionType(id: string, patch: Partial<Omit<PayrollContributionType, 'id' | 'business_id' | 'created_at' | 'updated_at'>>): Promise<void> {
  const { error } = await supabase
    .from('payroll_contribution_types')
    .update(patch as unknown as TablesUpdate<'payroll_contribution_types'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteContributionType(id: string): Promise<void> {
  const { error } = await supabase.from('payroll_contribution_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Lignes de bulletin (snapshot par paiement) ─────────────────────────────

export async function getPaymentLines(paymentId: string): Promise<StaffPaymentLine[]> {
  const { data, error } = await supabase
    .from('staff_payment_lines')
    .select('*')
    .eq('payment_id', paymentId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffPaymentLine[];
}

export async function insertPaymentLines(paymentId: string, lines: NetPayrollLine[]): Promise<void> {
  if (lines.length === 0) return;
  const rows = lines.map((l) => ({
    payment_id:            paymentId,
    contribution_type_id:  l.contribution_type_id,
    name:                  l.name,
    payer:                 l.payer,
    base_amount:           l.base_amount,
    computed_amount:       l.computed_amount,
  }));
  const { error } = await supabase
    .from('staff_payment_lines')
    .insert(rows as unknown as TablesInsert<'staff_payment_lines'>[]);
  if (error) throw new Error(error.message);
}

// ─── Moteur de calcul brut → net (générique, configurable par business) ────

export interface NetPayrollLine {
  contribution_type_id: string;
  name:                  string;
  payer:                 'employee' | 'employer';
  base_amount:           number;
  computed_amount:       number;
}

export interface NetPayrollResult {
  gross:                        number;
  lines:                        NetPayrollLine[];
  totalEmployeeContributions:   number;
  totalEmployerContributions:   number;
  net:                          number; // gross - cotisations salariales
  employerCost:                 number; // gross + cotisations patronales
}

export function computeNetPayroll(gross: number, types: PayrollContributionType[]): NetPayrollResult {
  const lines: NetPayrollLine[] = [];

  for (const t of types.filter((t) => t.is_active)) {
    const base = t.ceiling_amount != null ? Math.min(gross, t.ceiling_amount) : gross;
    const amount = t.calc_method === 'percent_of_gross'
      ? base * ((t.rate_percent ?? 0) / 100)
      : (t.fixed_amount ?? 0);

    if (t.payer === 'employee' || t.payer === 'both') {
      lines.push({ contribution_type_id: t.id, name: t.name, payer: 'employee', base_amount: base, computed_amount: amount });
    }
    if (t.payer === 'employer' || t.payer === 'both') {
      lines.push({ contribution_type_id: t.id, name: t.name, payer: 'employer', base_amount: base, computed_amount: amount });
    }
  }

  const totalEmployeeContributions = lines.filter((l) => l.payer === 'employee').reduce((s, l) => s + l.computed_amount, 0);
  const totalEmployerContributions = lines.filter((l) => l.payer === 'employer').reduce((s, l) => s + l.computed_amount, 0);

  return {
    gross,
    lines,
    totalEmployeeContributions,
    totalEmployerContributions,
    net:          Math.max(0, gross - totalEmployeeContributions),
    employerCost: gross + totalEmployerContributions,
  };
}
