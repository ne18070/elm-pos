import { supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db  = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = db.rpc.bind(db) as (fn: string, args?: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;

export interface StockEntry {
  id: string;
  business_id: string;
  product_id: string;
  quantity: number;
  packaging_qty?: number;
  packaging_size?: number;
  packaging_unit?: string;
  supplier?: string;
  cost_per_unit?: number;
  notes?: string;
  created_by?: string;
  created_at: string;
  // joined
  product?: { id: string; name: string; unit?: string };
  creator?: { id: string; full_name: string };
}

export interface AddStockEntryInput {
  businessId: string;
  productId: string;
  quantity: number;
  packagingQty?: number;
  packagingSize?: number;
  packagingUnit?: string;
  supplier?: string;
  costPerUnit?: number;
  notes?: string;
  createdBy?: string;
}

export async function getStockEntries(
  businessId: string,
  productId?: string
): Promise<StockEntry[]> {
  let query = db
    .from('stock_entries')
    .select(`
      *,
      product:products(id, name, unit),
      creator:created_by(id, full_name)
    `)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (productId) {
    query = query.eq('product_id', productId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as unknown as StockEntry[];
}

export async function addStockEntry(input: AddStockEntryInput): Promise<void> {
  const { error } = await rpc('add_stock_entry', {
    p_business_id:    input.businessId,
    p_product_id:     input.productId,
    p_quantity:       input.quantity,
    p_packaging_qty:  input.packagingQty  ?? null,
    p_packaging_size: input.packagingSize ?? null,
    p_packaging_unit: input.packagingUnit ?? null,
    p_supplier:       input.supplier      ?? null,
    p_cost_per_unit:  input.costPerUnit   ?? null,
    p_notes:          input.notes         ?? null,
    p_created_by:     input.createdBy     ?? null,
  });
  if (error) throw new Error(error.message);
}
