import { supabase } from './client';
import type { Coupon } from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase) as (fn: string, args?: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;

export async function validateCoupon(
  code: string,
  businessId: string,
  orderTotal: number,
  userId: string
): Promise<{ coupon: Coupon | null; error: string | null }> {
  const { data, error } = await rpc('validate_coupon', {
    coupon_code: code.toUpperCase().trim(),
    business_id: businessId,
    order_total: orderTotal,
    user_id: userId,
  });

  if (error) return { coupon: null, error: error.message };

  const result = data as unknown as { valid: boolean; coupon?: Coupon; error?: string };
  if (!result.valid) {
    return { coupon: null, error: result.error ?? 'Invalid coupon' };
  }

  return { coupon: result.coupon!, error: null };
}

export async function getCoupons(businessId: string): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as Coupon[];
}

export async function createCoupon(
  coupon: Omit<Coupon, 'id' | 'created_at' | 'uses_count'>
): Promise<Coupon> {
  const { data, error } = await supabase
    .from('coupons')
    .insert({ ...coupon, code: coupon.code.toUpperCase().trim() })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Coupon;
}

export async function updateCoupon(
  id: string,
  updates: Partial<Omit<Coupon, 'id' | 'created_at'>>
): Promise<Coupon> {
  const { data, error } = await supabase
    .from('coupons')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Coupon;
}

export async function deleteCoupon(id: string): Promise<void> {
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
