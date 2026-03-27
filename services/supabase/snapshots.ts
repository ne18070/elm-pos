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
  const db = supabase as any;
  const { data, error } = await db.rpc('get_snapshots', { p_business_id: businessId });
  if (error) throw new Error(error.message);
  return (data ?? []) as SnapshotMeta[];
}

export async function getSnapshotData(snapshotId: string): Promise<SnapshotData> {
  const db = supabase as any;
  const { data, error } = await db.rpc('get_snapshot_data', { p_snapshot_id: snapshotId });
  if (error) throw new Error(error.message);
  return data as SnapshotData;
}

export async function createSnapshot(
  businessId: string,
  label?: string
): Promise<string> {
  const db = supabase as any;
  const { data, error } = await db.rpc('create_snapshot', {
    p_business_id: businessId,
    p_label:       label ?? null,
    p_type:        'manual',
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function restoreSnapshot(
  snapshotId: string,
  tables: RestorableTable[]
): Promise<RestoreResult> {
  const db = supabase as any;
  const { data, error } = await db.rpc('restore_snapshot', {
    p_snapshot_id: snapshotId,
    p_tables:      tables,
  });
  if (error) throw new Error(error.message);
  return data as RestoreResult;
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const db = supabase as any;
  const { error } = await db.rpc('delete_snapshot', { p_snapshot_id: snapshotId });
  if (error) throw new Error(error.message);
}
