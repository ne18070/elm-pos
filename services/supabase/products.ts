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
      .order('name')
      // Filet de sécurité — pas une vraie pagination : utilisé par la caisse
      // (recherche locale instantanée) et les sélecteurs produit (coupons,
      // stock), qui ont besoin du catalogue entier en mémoire. Pour la liste
      // paginée de gestion des produits, voir getProductsPage ci-dessous.
      .limit(5000) as never,
  );
}

/** Page paginée + recherche serveur — utilisé par l'écran de gestion des produits. */
export async function getProductsPage(
  businessId: string,
  options?: { search?: string; limit?: number; offset?: number },
): Promise<{ products: Product[]; count: number }> {
  const limit  = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  let query = supabase
    .from('products')
    .select('*, category:categories(*)', { count: 'exact' })
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name');

  const term = options?.search?.trim().replace(/[,()]/g, ' ');
  if (term) {
    query = query.or(`name.ilike.%${term}%,barcode.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { products: (data ?? []) as unknown as Product[], count: count ?? 0 };
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
  const updated = await q<Product>(
    supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .select('*, category:categories(*)')
      .single() as never,
  );
  logAction({
    business_id: updated.business_id,
    action:      'product.updated',
    entity_type: 'product',
    entity_id:   id,
    metadata:    { name: updated.name, fields: Object.keys(updates) },
  });
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
