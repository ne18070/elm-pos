import { supabase } from './client';
import { addStockEntry } from './stock';

export type POStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseOrderItem {
  id:               string;
  order_id:         string;
  product_id:       string;
  quantity_ordered: number;
  quantity_received?: number | null;
  cost_per_unit?:   number | null;
  packaging_qty?:   number | null;
  packaging_size?:  number | null;
  packaging_unit?:  string | null;
  product?: { id: string; name: string; unit?: string };
}

export interface PurchaseOrder {
  id:            string;
  business_id:   string;
  supplier_id?:  string | null;
  supplier_name?: string | null;
  reference?:    string | null;
  status:        POStatus;
  notes?:        string | null;
  ordered_at?:   string | null;
  received_at?:  string | null;
  created_by?:   string | null;
  created_at:    string;
  items?:        PurchaseOrderItem[];
  supplier?:     { id: string; name: string } | null;
}

export async function getPurchaseOrders(businessId: string): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(id, name),
      items:purchase_order_items(*, product:products(id, name, unit))
    `)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data as unknown as PurchaseOrder[];
}

export async function createPurchaseOrder(
  businessId: string,
  order: {
    supplier_id?:   string | null;
    supplier_name?: string | null;
    reference?:     string | null;
    notes?:         string | null;
    created_by?:    string;
    items: Array<{
      product_id:       string;
      quantity_ordered: number;
      cost_per_unit?:   number | null;
      packaging_qty?:   number | null;
      packaging_size?:  number | null;
      packaging_unit?:  string | null;
    }>;
  }
): Promise<PurchaseOrder> {
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({
      business_id:   businessId,
      supplier_id:   order.supplier_id   ?? null,
      supplier_name: order.supplier_name ?? null,
      reference:     order.reference     ?? null,
      notes:         order.notes         ?? null,
      created_by:    order.created_by    ?? null,
      status:        'draft',
    })
    .select()
    .single();
  if (poErr) throw new Error(poErr.message);

  const poId = (po as any).id as string;
  const { error: itemErr } = await supabase
    .from('purchase_order_items')
    .insert(order.items.map(item => ({ order_id: poId, ...item })));
  if (itemErr) throw new Error(itemErr.message);

  return po as PurchaseOrder;
}

export async function updatePOStatus(id: string, status: POStatus): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (status === 'ordered')  updates.ordered_at  = new Date().toISOString();
  if (status === 'received') updates.received_at = new Date().toISOString();
  const { error } = await supabase.from('purchase_orders').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function receivePurchaseOrder(
  businessId: string,
  order: PurchaseOrder,
  createdBy: string
): Promise<void> {
  if (!order.items?.length) return;
  for (const item of order.items) {
    const qty = item.quantity_received ?? item.quantity_ordered;
    if (qty <= 0) continue;
    await addStockEntry({
      businessId,
      productId:     item.product_id,
      quantity:      qty,
      packagingQty:  item.packaging_qty  ?? undefined,
      packagingSize: item.packaging_size ?? undefined,
      packagingUnit: item.packaging_unit ?? undefined,
      supplier:      order.supplier_name ?? order.supplier?.name ?? undefined,
      costPerUnit:   item.cost_per_unit  ?? undefined,
      notes:         order.reference ? `BC ${order.reference}` : undefined,
      createdBy,
    });
  }
  await updatePOStatus(order.id, 'received');
}
