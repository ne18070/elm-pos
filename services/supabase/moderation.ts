import { supabase } from './client';
import type { TablesUpdate } from './database.types';

// Signalements envoyés depuis l'app ELM Boutique (RPC report_content, migration 164)
// et suspensions de l'annuaire. Réservé aux superadmins (RLS is_superadmin()).

export type ReportReason = 'offensive' | 'fraud' | 'illegal' | 'spam' | 'other';
export type ReportStatus = 'open' | 'dismissed' | 'actioned';
export type ReportTargetType = 'business' | 'product' | 'service';

export interface ContentReport {
  id:           string;
  business_id:  string;
  target_type:  ReportTargetType;
  target_id:    string | null;
  target_label: string | null;
  reason:       ReportReason | null;
  details:      string | null;
  blocked:      boolean;
  device_id:    string | null;
  platform:     string | null;
  status:       ReportStatus;
  reviewed_at:  string | null;
  created_at:   string;
  business?:    { name: string; logo_url: string | null } | null;
}

export interface DirectorySuspension {
  business_id: string;
  reason:      string | null;
  created_at:  string;
}

export async function getContentReports(): Promise<ContentReport[]> {
  const { data, error } = await supabase
    .from('content_reports')
    .select('*, business:businesses(name, logo_url)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ContentReport[];
}

export async function countOpenContentReports(): Promise<number> {
  const { count, error } = await supabase
    .from('content_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Clôt tous les signalements ouverts d'une boutique. */
export async function resolveBusinessReports(
  businessId: string,
  status: Exclude<ReportStatus, 'open'>,
  reviewerId: string,
): Promise<void> {
  const patch = { status, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId };
  const { error } = await supabase
    .from('content_reports')
    .update(patch as unknown as TablesUpdate<'content_reports'>)
    .eq('business_id', businessId)
    .eq('status', 'open');

  if (error) throw new Error(error.message);
}

export async function getDirectorySuspensions(): Promise<DirectorySuspension[]> {
  const { data, error } = await supabase
    .from('directory_suspensions')
    .select('business_id, reason, created_at');

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DirectorySuspension[];
}

/** Retire la boutique de l'annuaire de l'app ; le propriétaire ne peut pas l'y remettre. */
export async function suspendFromDirectory(businessId: string, reason: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('directory_suspensions')
    .upsert({ business_id: businessId, reason, suspended_by: adminId });

  if (error) throw new Error(error.message);
}

export async function restoreToDirectory(businessId: string): Promise<void> {
  const { error } = await supabase
    .from('directory_suspensions')
    .delete()
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
}
