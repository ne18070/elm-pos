import { supabase } from './client';
import type { TablesInsert, TablesUpdate } from './database.types';

export type FinancialRequestKind   = 'pret' | 'avance_salaire';
export type FinancialRequestStatus = 'en_attente' | 'approuvee' | 'rejetee' | 'decaissee' | 'remboursee';

export interface StaffFinancialRequest {
  id:               string;
  business_id:      string;
  staff_id:         string;
  kind:             FinancialRequestKind;
  amount:           number;
  reason:           string | null;
  repayment_months: number | null;
  status:           FinancialRequestStatus;
  admin_notes:      string | null;
  approved_at:      string | null;
  approved_by:      string | null;
  created_at:       string;
  updated_at:       string;
  staff?:           { name: string; position: string | null } | null;
}

export const FINANCIAL_REQUEST_KIND_LABELS: Record<FinancialRequestKind, string> = {
  pret:           'Prêt',
  avance_salaire: 'Avance sur salaire',
};

export const FINANCIAL_REQUEST_STATUS_LABELS: Record<FinancialRequestStatus, string> = {
  en_attente: 'En attente',
  approuvee:  'Approuvée',
  rejetee:    'Rejetée',
  decaissee:  'Décaissée',
  remboursee: 'Remboursée',
};

export async function getFinancialRequests(
  businessId: string,
  options?: { staffId?: string; kind?: FinancialRequestKind },
): Promise<StaffFinancialRequest[]> {
  let query = supabase
    .from('staff_financial_requests')
    .select('*, staff(name, position)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (options?.staffId) query = query.eq('staff_id', options.staffId);
  if (options?.kind) query = query.eq('kind', options.kind);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StaffFinancialRequest[];
}

export async function createFinancialRequest(input: {
  business_id: string;
  staff_id:    string;
  kind:        FinancialRequestKind;
  amount:      number;
  reason?:     string | null;
  repayment_months?: number | null;
}): Promise<StaffFinancialRequest> {
  const { data, error } = await supabase
    .from('staff_financial_requests')
    .insert(input as unknown as TablesInsert<'staff_financial_requests'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as StaffFinancialRequest;
}

export async function updateFinancialRequestStatus(
  id: string,
  status: FinancialRequestStatus,
  adminId?: string,
  adminNotes?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('staff_financial_requests')
    .update({
      status,
      admin_notes: adminNotes ?? null,
      approved_at: status === 'approuvee' ? new Date().toISOString() : null,
      approved_by: status === 'approuvee' ? (adminId ?? null) : null,
    } as unknown as TablesUpdate<'staff_financial_requests'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteFinancialRequest(id: string): Promise<void> {
  const { error } = await supabase.from('staff_financial_requests').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
