import { supabase } from './client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { logAction } from './logger';
import { q } from './q';
import type { Product, Category, StockMovement } from '../../types';

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

export interface GetProductsOptions {
  /** Inclure les produits archivés (is_active = false). Défaut : false. */
  includeInactive?: boolean;
}

export async function getProducts(
  businessId: string,
  opts: GetProductsOptions = {},
): Promise<Product[]> {
  let query = supabase
    .from('products')
    .select('*, category:categories(*)')
    .eq('business_id', businessId);

  if (!opts.includeInactive) {
    query = query.eq('is_active', true);
  }

  return q<Product[]>(query.order('name') as never);
}

export async function getProductByBarcode(
  businessId: string,
  barcode: string
): Promise<Product | null> {
  // `.limit(1)` plutôt que `.single()` : robuste si d'anciennes données
  // contiennent encore un code-barres en doublon (l'index unique ne couvre
  // que les écritures futures).
  const { data, error } = await supabase
    .from('products')
    .select('*, category:categories(*)')
    .eq('business_id', businessId)
    .eq('barcode', barcode)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0] as unknown as Product;
}

/** Détecte une violation d'unicité du code-barres remontée par Postgres. */
function isBarcodeConflict(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('idx_products_barcode_unique')
    || (msg.includes('duplicate key') && msg.includes('barcode'));
}

const BARCODE_CONFLICT_MESSAGE =
  'Ce code-barres est déjà utilisé par un autre produit actif.';

export async function createProduct(
  product: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'category'>
): Promise<Product> {
  let created: Product;
  try {
    created = await q<Product>(
      supabase
        .from('products')
        .insert(product as never)
        .select('*, category:categories(*)')
        .single() as never,
    );
  } catch (err) {
    if (isBarcodeConflict(err)) throw new Error(BARCODE_CONFLICT_MESSAGE);
    throw err;
  }
  logAction({
    business_id: created.business_id,
    action:      'product.created',
    entity_type: 'product',
    entity_id:   created.id,
    metadata:    { name: created.name, price: created.price },
  });
  return created;
}

export interface UpdateProductOptions {
  /** Motif de l'ajustement de stock (inventaire, casse, vol, correction…). */
  stockAdjustmentReason?: string;
}

export async function updateProduct(
  id: string,
  updates: Partial<Omit<Product, 'id' | 'created_at' | 'category'>>,
  opts: UpdateProductOptions = {},
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

  let updated: Product;
  try {
    updated = await q<Product>(
      supabase
        .from('products')
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
        .select('*, category:categories(*)')
        .single() as never,
    );
  } catch (err) {
    if (isBarcodeConflict(err)) throw new Error(BARCODE_CONFLICT_MESSAGE);
    throw err;
  }

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
  // On EXCLUT le premier renseignement du stock (activation du suivi ou stock
  // initialement NULL) : ce n'est pas une « variation de stock » mais un solde
  // d'ouverture, à saisir via une entrée de stock.
  const wasTrackingWithKnownStock =
    before.track_stock === true && before.stock !== null && before.stock !== undefined;

  if (changes.stock && wasTrackingWithKnownStock) {
    // Awaité (le modal affiche déjà un spinner) pour garantir la tentative
    // d'écriture ; en cas d'échec on trace durablement sans bloquer la
    // sauvegarde du produit (déjà enregistrée).
    const { error } = await supabase.rpc('record_stock_adjustment', {
      p_product_id: id,
      p_qty_before: Number(changes.stock.from ?? 0),
      p_qty_after:  Number(changes.stock.to ?? 0),
      p_reason:     opts.stockAdjustmentReason || undefined,
    });
    if (error) {
      console.warn('[stock] écriture d’ajustement échouée :', error.message);
      supabase.from('monitoring_vitals').insert({
        level: 'error',
        category: 'accounting',
        message: `record_stock_adjustment failed: ${error.message}`,
        context: {
          product_id: id,
          from: Number(changes.stock.from ?? 0),
          to: Number(changes.stock.to ?? 0),
        },
        url: typeof window !== 'undefined' ? window.location.pathname : 'server',
      } as never).then(null, () => {});
    }
  }

  return updated;
}

export async function deleteProduct(id: string): Promise<void> {
  // Soft delete — on trace qui archive quoi (les créations/màj sont déjà tracées).
  const { data } = await supabase
    .from('products')
    .select('business_id, name')
    .eq('id', id)
    .maybeSingle();

  await q(
    supabase
      .from('products')
      .update({ is_active: false, updated_at: new Date().toISOString() } as never)
      .eq('id', id),
  );

  const row = data as { business_id?: string; name?: string } | null;
  if (row?.business_id) {
    logAction({
      business_id: row.business_id,
      action:      'product.deleted',
      entity_type: 'product',
      entity_id:   id,
      metadata:    { name: row.name },
    });
  }
}

/** Réactive un produit archivé. */
export async function restoreProduct(id: string): Promise<void> {
  const { data } = await supabase
    .from('products')
    .select('business_id, name')
    .eq('id', id)
    .maybeSingle();

  await q(
    supabase
      .from('products')
      .update({ is_active: true, updated_at: new Date().toISOString() } as never)
      .eq('id', id),
  );

  const row = data as { business_id?: string; name?: string } | null;
  if (row?.business_id) {
    logAction({
      business_id: row.business_id,
      action:      'product.updated',
      entity_type: 'product',
      entity_id:   id,
      metadata:    { name: row.name, fields: ['is_active'], changes: { is_active: { from: false, to: true } } },
    });
  }
}

export async function decrementStock(productId: string, quantity: number): Promise<void> {
  await q(supabase.rpc('decrement_stock', { p_product_id: productId, p_quantity: quantity }));
}

// ─── Historique des mouvements de stock ──────────────────────────────────────

export async function getStockMovements(
  productId: string,
  limit = 200,
): Promise<StockMovement[]> {
  // Tri par « seq » (ordre total monotone) et non « created_at » : toutes les
  // lignes d'une même transaction partagent le même created_at, ce qui rendait
  // l'ordre non déterministe et déclenchait de faux écarts / ruptures de chaîne
  // dans StockHistoryModal. Voir migration 125.
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('product_id', productId)
    .order('seq', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StockMovement[];
}
