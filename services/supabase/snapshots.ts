import { supabase } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SnapshotMeta {
  id:               string;
  label:            string;
  type:             'manual' | 'auto' | 'pre_restore';
  product_count:    number;
  category_count:   number;
  coupon_count:     number;
  created_by_name:  string | null;
  created_at:       string;
}

export interface SnapshotData {
  products:   unknown[];
  categories: unknown[];
  coupons:    unknown[];
}

export type RestorableTable = 'products' | 'categories' | 'coupons';

export interface RestoreResult {
  products_updated?:   number;
  categories_restored?: number;
  coupons_updated?:    number;
  safety_snapshot_id:  string;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getSnapshots(businessId: string): Promise<SnapshotMeta[]> {
  const { data, error } = await supabase.rpc('get_snapshots', { p_business_id: businessId });
  if (error) throw new Error(error.message);
  return (data ?? []) as SnapshotMeta[];
}

export async function getSnapshotData(snapshotId: string): Promise<SnapshotData> {
  const { data, error } = await supabase.rpc('get_snapshot_data', { p_snapshot_id: snapshotId });
  if (error) throw new Error(error.message);
  return data as unknown as SnapshotData;
}

export async function createSnapshot(
  businessId: string,
  label?: string
): Promise<string> {
  const { data, error } = await supabase.rpc('create_snapshot', {
    p_business_id: businessId,
    p_label:       label,
    p_type:        'manual',
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function restoreSnapshot(
  snapshotId: string,
  tables: RestorableTable[]
): Promise<RestoreResult> {
  const { data, error } = await supabase.rpc('restore_snapshot', {
    p_snapshot_id: snapshotId,
    p_tables:      tables,
  });
  if (error) throw new Error(error.message);
  return data as unknown as RestoreResult;
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_snapshot', { p_snapshot_id: snapshotId });
  if (error) throw new Error(error.message);
}
