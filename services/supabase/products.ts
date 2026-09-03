import { supabase } from './client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { logAction } from './logger';
import { q } from './q';
import type { Product, Category } from '../../types';

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(businessId: string): Promise<Category[]> {
  return q<Category[]>(
    supabase.from('categories').select('*').eq('business_id', businessId).order('sort_order'),
  );
}

export async function createCategory(
  category: Omit<Category, 'id' | 'created_at'>
): Promise<Category> {
  return q<Category>(supabase.from('categories').insert(category).select().single());
}

export async function updateCategory(
  id: string,
  updates: Partial<Category>
): Promise<Category> {
  return q<Category>(
    supabase.from('categories').update(updates).eq('id', id).select().single(),
  );
}

export async function deleteCategory(id: string): Promise<void> {
  await q(supabase.from('categories').delete().eq('id', id));
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getProducts(businessId: string): Promise<Product[]> {
  return q<Product[]>(
    supabase
      .from('products')
      .select('*, category:categories(*)')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name') as never,
  );
}

export async function getProductByBarcode(
  businessId: string,
  barcode: string
): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*, category:categories(*)')
    .eq('business_id', businessId)
    .eq('barcode', barcode)
    .eq('is_active', true)
    .single();

  if (error) return null;
  return data as unknown as Product;
}

export async function createProduct(
  product: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'category'>
): Promise<Product> {
  const created = await q<Product>(
    supabase
      .from('products')
      .insert(product as never)
      .select('*, category:categories(*)')
      .single() as never,
  );
  logAction({
    business_id: created.business_id,
    action:      'product.created',
    entity_type: 'product',
    entity_id:   created.id,
    metadata:    { name: created.name, price: created.price },
  });
  return created;
}

export async function updateProduct(
  id: string,
  updates: Partial<Omit<Product, 'id' | 'created_at' | 'category'>>
): Promise<Product> {
  // Valeurs AVANT modification pour tracer les champs suivis (stock, prix…)
  const TRACKED: (keyof Product)[] = ['stock', 'price', 'track_stock'];
  let before: Partial<Product> = {};
  if (TRACKED.some((k) => k in updates)) {
    const { data } = await supabase
      .from('products')
      .select('stock, price, track_stock')
      .eq('id', id)
      .single();
    before = (data ?? {}) as Partial<Product>;
  }

  const updated = await q<Product>(
    supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .select('*, category:categories(*)')
      .single() as never,
  );

  // Diff des champs suivis réellement changés → { from, to }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of TRACKED) {
    if (!(k in updates)) continue;
    const from = (before as Record<string, unknown>)[k as string];
    const to   = (updated as unknown as Record<string, unknown>)[k as string];
    if (from !== to) changes[k as string] = { from: from ?? null, to: to ?? null };
  }

  logAction({
    business_id: updated.business_id,
    action:      'product.updated',
    entity_type: 'product',
    entity_id:   id,
    metadata:    { name: updated.name, fields: Object.keys(updates), changes },
  });

  // Ajustement manuel de stock → écriture comptable (valorisée au coût moyen).
  // Non bloquant : l'échec ne compromet pas la sauvegarde du produit.
  if (changes.stock) {
    supabase.rpc('record_stock_adjustment', {
      p_product_id: id,
      p_qty_before: Number(changes.stock.from ?? 0),
      p_qty_after:  Number(changes.stock.to ?? 0),
    }).then(({ error }) => {
      if (error) console.warn('[stock] écriture d’ajustement échouée :', error.message);
    });
  }

  return updated;
}

export async function deleteProduct(id: string): Promise<void> {
  // Soft delete
  await q(
    supabase
      .from('products')
      .update({ is_active: false, updated_at: new Date().toISOString() } as never)
      .eq('id', id),
  );
}

export async function decrementStock(productId: string, quantity: number): Promise<void> {
  await q(supabase.rpc('decrement_stock', { p_product_id: productId, p_quantity: quantity }));
}
