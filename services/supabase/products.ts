import { supabase } from './client';
import type { Product, Category } from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase) as (fn: string, args?: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(businessId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order');

  if (error) throw new Error(error.message);
  return data as Category[];
}

export async function createCategory(
  category: Omit<Category, 'id' | 'created_at'>
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert(category)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Category;
}

export async function updateCategory(
  id: string,
  updates: Partial<Category>
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getProducts(businessId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, category:categories(*)')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(error.message);
  return data as unknown as Product[];
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
  const { data, error } = await supabase
    .from('products')
    .insert(product as never)
    .select('*, category:categories(*)')
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Product;
}

export async function updateProduct(
  id: string,
  updates: Partial<Omit<Product, 'id' | 'created_at' | 'category'>>
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select('*, category:categories(*)')
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Product;
}

export async function deleteProduct(id: string): Promise<void> {
  // Soft delete
  const { error } = await supabase
    .from('products')
    .update({ is_active: false, updated_at: new Date().toISOString() } as never)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function decrementStock(productId: string, quantity: number): Promise<void> {
  const { error } = await rpc('decrement_stock', {
    p_product_id: productId,
    p_quantity: quantity,
  });
  if (error) throw new Error(error.message);
}
