import { supabase as _supabase } from './client';
import { q } from './q';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

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
  note:        string | null;
  image_url:   string | null;
  items:       DailyMenuItem[];
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export async function getDailyMenu(
  businessId: string,
  date: string,             // 'YYYY-MM-DD'
): Promise<DailyMenu | null> {
  const { data: menu } = await supabase
    .from('daily_menus')
    .select('id, business_id, date, note, image_url')
    .eq('business_id', businessId)
    .eq('date', date)
    .maybeSingle();

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
): Promise<void> {
  // Upsert le menu
  const payload: Record<string, unknown> = {
    business_id: businessId, date, note, updated_at: new Date().toISOString(),
  };
  if (imageUrl !== undefined) payload.image_url = imageUrl;

  const menu = await q<{ id: string }>(
    supabase
      .from('daily_menus')
      .upsert(payload, { onConflict: 'business_id,date' })
      .select('id')
      .single(),
  );

  // Remplacer tous les items
  await supabase.from('daily_menu_items').delete().eq('daily_menu_id', menu.id);

  if (items.length > 0) {
    await supabase.from('daily_menu_items').insert(
      items.map((i) => ({ daily_menu_id: menu.id, ...i })),
    );
  }
}

export async function clearDailyMenu(businessId: string, date: string): Promise<void> {
  await supabase
    .from('daily_menus')
    .delete()
    .eq('business_id', businessId)
    .eq('date', date);
}
