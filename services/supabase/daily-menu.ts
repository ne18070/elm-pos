import { supabase } from './client';
import { q } from './q';

// eslint-disable-next-line @typescript-eslint/no-explicit-any

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyMenuItem {
  product_id:   string;
  product_name: string;
  product_price: number;
  image_url:    string | null;
  custom_price: number | null;
  sort_order:   number;
}

export interface DailyMenu {
  id:          string;
  business_id: string;
  date:        string;
  zone_id:     string | null;
  note:        string | null;
  image_url:   string | null;
  items:       DailyMenuItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyZoneFilter(query: any, zoneId: string | null | undefined) {
  return zoneId ? query.eq('zone_id', zoneId) : query.is('zone_id', null);
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export async function getDailyMenu(
  businessId: string,
  date: string,
  zoneId?: string | null,
): Promise<DailyMenu | null> {
  let q1 = supabase
    .from('daily_menus')
    .select('id, business_id, date, zone_id, note, image_url')
    .eq('business_id', businessId)
    .eq('date', date);

  q1 = applyZoneFilter(q1, zoneId ?? null);

  const { data: menu } = await q1.maybeSingle();

  if (!menu) return null;

  const { data: items } = await supabase
    .from('daily_menu_items')
    .select('product_id, custom_price, sort_order, products(name, price, image_url)')
    .eq('daily_menu_id', menu.id)
    .order('sort_order');

  return {
    id:          menu.id,
    business_id: menu.business_id,
    date:        menu.date,
    zone_id:     menu.zone_id ?? null,
    note:        menu.note,
    image_url:   menu.image_url ?? null,
    items: (items ?? []).map((i: {
      product_id: string;
      custom_price: number | null;
      sort_order: number;
      products: { name: string; price: number; image_url: string | null };
    }) => ({
      product_id:    i.product_id,
      product_name:  i.products.name,
      product_price: i.products.price,
      image_url:     i.products.image_url,
      custom_price:  i.custom_price,
      sort_order:    i.sort_order,
    })),
  };
}

// ─── Upsert menu du jour ──────────────────────────────────────────────────────

export async function saveDailyMenu(
  businessId: string,
  date: string,
  note: string | null,
  items: { product_id: string; custom_price: number | null; sort_order: number }[],
  imageUrl?: string | null,
  zoneId?: string | null,
): Promise<void> {
  const resolvedZoneId = zoneId ?? null;

  // Check for existing menu to decide insert vs. update
  let existingQuery = supabase
    .from('daily_menus')
    .select('id')
    .eq('business_id', businessId)
    .eq('date', date);
  existingQuery = applyZoneFilter(existingQuery, resolvedZoneId);
  const { data: existing } = await existingQuery.maybeSingle();

  const payload: Record<string, unknown> = {
    business_id: businessId,
    date,
    note,
    zone_id: resolvedZoneId,
    updated_at: new Date().toISOString(),
  };
  if (imageUrl !== undefined) payload.image_url = imageUrl;

  let menuId: string;

  if (existing?.id) {
    await q<{ id: string }>(
      supabase.from('daily_menus').update(payload as unknown as import('./database.types').TablesUpdate<'daily_menus'>).eq('id', existing.id).select('id').single(),
    );
    menuId = existing.id;
  } else {
    const inserted = await q<{ id: string }>(
      supabase.from('daily_menus').insert(payload as unknown as import('./database.types').TablesInsert<'daily_menus'>).select('id').single(),
    );
    menuId = inserted.id;
  }

  // Remplacer tous les items
  await supabase.from('daily_menu_items').delete().eq('daily_menu_id', menuId);

  if (items.length > 0) {
    await supabase.from('daily_menu_items').insert(
      items.map((i) => ({ daily_menu_id: menuId, ...i })),
    );
  }
}

export async function clearDailyMenu(
  businessId: string,
  date: string,
  zoneId?: string | null,
): Promise<void> {
  let del = supabase
    .from('daily_menus')
    .delete()
    .eq('business_id', businessId)
    .eq('date', date);

  del = applyZoneFilter(del, zoneId ?? null);
  await del;
}
