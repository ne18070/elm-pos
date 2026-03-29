import { supabase } from './client';
import { q } from './q';

const db = supabase as any;

export interface CashSession {
  id: string;
  business_id: string;
  opened_by: string | null;
  closed_by: string | null;
  opening_amount: number;
  total_sales: number | null;
  total_cash: number | null;
  total_card: number | null;
  total_mobile: number | null;
  total_orders: number | null;
  total_refunds: number | null;
  expected_cash: number | null;
  actual_cash: number | null;
  difference: number | null;
  status: 'open' | 'closed';
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface SessionLiveSummary {
  total_sales: number;
  total_cash: number;
  total_card: number;
  total_mobile: number;
  total_orders: number;
  total_refunds: number;
}

export async function getCurrentSession(businessId: string): Promise<CashSession | null> {
  const { data, error } = await db
    .from('cash_sessions')
    .select('*')
    .eq('business_id', businessId)
    .eq('status', 'open')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getSessionHistory(businessId: string): Promise<CashSession[]> {
  const rows = await q<CashSession[]>(
    db.from('cash_sessions')
      .select('*')
      .eq('business_id', businessId)
      .order('opened_at', { ascending: false })
      .limit(50),
  );
  return rows ?? [];
}

export async function openSession(
  businessId: string,
  openingAmount: number
): Promise<CashSession> {
  return q<CashSession>(db.rpc('open_cash_session', {
    p_business_id:    businessId,
    p_opening_amount: openingAmount,
  }));
}

export async function closeSession(
  sessionId: string,
  actualCash: number,
  notes?: string
): Promise<CashSession> {
  return q<CashSession>(db.rpc('close_cash_session', {
    p_session_id:  sessionId,
    p_actual_cash: actualCash,
    p_notes:       notes ?? null,
  }));
}

export async function getLiveSummary(sessionId: string): Promise<SessionLiveSummary> {
  return q<SessionLiveSummary>(db.rpc('get_session_live_summary', { p_session_id: sessionId }));
}
