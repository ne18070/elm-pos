import { supabase } from './client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { q } from './q';
import { logAction } from './logger';
import type { Coupon } from '../../types';

export async function validateCoupon(
  code: string,
  businessId: string,
  orderTotal: number,
  userId: string,
  cartItemCount?: number,
): Promise<{ coupon: Coupon | null; error: string | null }> {
  const { data, error } = await supabase.rpc('validate_coupon', {
    coupon_code: code.toUpperCase().trim(),
    business_id: businessId,
    order_total: orderTotal,
    user_id: userId,
    cart_item_count: cartItemCount ?? undefined,
  });

  if (error) return { coupon: null, error: error.message };

  const result = data as unknown as { valid: boolean; coupon?: Coupon; error?: string };
  if (!result.valid) {
    return { coupon: null, error: result.error ?? 'Invalid coupon' };
  }

  return { coupon: result.coupon!, error: null };
}

export async function getCoupons(businessId: string): Promise<Coupon[]> {
  return q<Coupon[]>(
    supabase.from('coupons').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
  );
}

/** Normalise un code promo : majuscules, sans espaces de bord. */
function normalizeCode(code: string): string {
  return code.toUpperCase().trim();
}

function isDuplicateCode(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('duplicate key') || msg.includes('coupons_business_id_code');
}

export async function createCoupon(
  coupon: Omit<Coupon, 'id' | 'created_at' | 'uses_count'>
): Promise<Coupon> {
  let created: Coupon;
  try {
    created = await q<Coupon>(
      supabase
        .from('coupons')
        .insert({ ...coupon, code: normalizeCode(coupon.code) })
        .select()
        .single(),
    );
  } catch (err) {
    if (isDuplicateCode(err)) throw new Error('Un coupon avec ce code existe déjà.');
    throw err;
  }
  logAction({
    business_id: created.business_id,
    action:      'coupon.created',
    entity_type: 'coupon',
    entity_id:   created.id,
    metadata:    { code: created.code, type: created.type, value: created.value },
  });
  return created;
}

/**
 * Champs qui définissent CE QU'EST le coupon (code, type, valeur, article offert).
 * Une fois le coupon utilisé (uses_count > 0), des commandes passées en dépendent
 * pour leur interprétation (ex: les statistiques recalculent le CA à partir du
 * `type`/`free_item_product_id` *actuels* du coupon — voir getCouponStats) : les
 * modifier après coup fausserait silencieusement l'historique.
 */
const LOCKED_AFTER_USE_FIELDS = [
  'code', 'type', 'value',
  'free_item_label', 'free_item_product_id', 'free_item_quantity',
  'free_item_unit_label', 'free_item_stock_consumption',
] as const satisfies ReadonlyArray<keyof Coupon>;

export async function updateCoupon(
  id: string,
  updates: Partial<Omit<Coupon, 'id' | 'created_at'>>
): Promise<Coupon> {
  const { data: currentData } = await supabase
    .from('coupons')
    .select('uses_count, code, type, value, free_item_label, free_item_product_id, free_item_quantity, free_item_unit_label, free_item_stock_consumption')
    .eq('id', id)
    .maybeSingle();
  const current = currentData as Pick<Coupon, typeof LOCKED_AFTER_USE_FIELDS[number] | 'uses_count'> | null;

  if (current && current.uses_count > 0) {
    const blockedField = LOCKED_AFTER_USE_FIELDS.find((field) => {
      if (!(field in updates)) return false;
      const nextValue = updates[field];
      return (nextValue ?? null) !== (current[field] ?? null);
    });
    if (blockedField) {
      throw new Error(
        `Ce coupon a déjà été utilisé ${current.uses_count} fois : le code, le type, la valeur et l'article offert ne peuvent plus être modifiés (cela fausserait l'historique des ventes). Vous pouvez encore l'activer/désactiver, changer sa date d'expiration ou ses conditions d'utilisation.`,
      );
    }
  }

  // Le code doit rester normalisé même à l'édition (sinon validate_coupon ne
  // le retrouve plus).
  const patch = updates.code != null ? { ...updates, code: normalizeCode(updates.code) } : updates;

  let updated: Coupon;
  try {
    updated = await q<Coupon>(
      supabase.from('coupons').update(patch).eq('id', id).select().single(),
    );
  } catch (err) {
    if (isDuplicateCode(err)) throw new Error('Un coupon avec ce code existe déjà.');
    throw err;
  }
  logAction({
    business_id: updated.business_id,
    action:      'coupon.updated',
    entity_type: 'coupon',
    entity_id:   id,
    metadata:    { code: updated.code, fields: Object.keys(updates) },
  });
  return updated;
}

/**
 * Supprime un coupon.
 * - Jamais utilisé (uses_count = 0) → suppression définitive.
 * - Déjà utilisé → désactivation (is_active = false) pour préserver l'historique
 *   des commandes qui y font référence.
 */
export async function deleteCoupon(id: string): Promise<void> {
  const { data } = await supabase
    .from('coupons')
    .select('business_id, code, uses_count')
    .eq('id', id)
    .maybeSingle();
  const row = data as { business_id?: string; code?: string; uses_count?: number } | null;

  if (row && (row.uses_count ?? 0) > 0) {
    await q(
      supabase.from('coupons').update({ is_active: false }).eq('id', id),
    );
    if (row.business_id) {
      logAction({
        business_id: row.business_id,
        action:      'coupon.updated',
        entity_type: 'coupon',
        entity_id:   id,
        metadata:    { code: row.code, fields: ['is_active'], archived: true },
      });
    }
    return;
  }

  await q(supabase.from('coupons').delete().eq('id', id));
  if (row?.business_id) {
    logAction({
      business_id: row.business_id,
      action:      'coupon.deleted',
      entity_type: 'coupon',
      entity_id:   id,
      metadata:    { code: row.code },
    });
  }
}
