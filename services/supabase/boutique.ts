import { supabase as _supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BoutiqueInfo {
  id: string;
  name: string;
  logo_url: string | null;
  currency: string;
  phone: string | null;
  address: string | null;
}

export interface BoutiqueCategory {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

export interface BoutiqueVariant {
  id: string;
  name: string;
  price_modifier: number;
  stock?: number;
}

export interface BoutiqueProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number | null;
  track_stock: boolean;
  variants: BoutiqueVariant[];
  category_id: string | null;
  category: BoutiqueCategory | null;
}

export interface BoutiqueCartItem {
  product_id: string;
  variant_id?: string;
  name: string;
  price: number;
  quantity: number;
}

export interface CreateBoutiqueOrderInput {
  business_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address?: string;
  delivery_type: 'pickup' | 'delivery';
  payment_method: 'cash' | 'mobile_money' | 'lien_paiement';
  items: BoutiqueCartItem[];
  notes?: string;
}

export interface BoutiqueOrderResult {
  id: string;
  payment_token: string;
}

export interface BoutiqueOrderDetail {
  id: string;
  status: string;
  subtotal: number;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_type: string | null;
  delivery_status: string;
  notes: string | null;
  created_at: string;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    total: number;
  }>;
}

// ─── Fonctions publiques ──────────────────────────────────────────────────────

export async function getBoutiqueInfo(businessId: string): Promise<BoutiqueInfo | null> {
  const { data } = await supabase
    .from('businesses')
    .select('id, name, logo_url, currency, phone, address')
    .eq('id', businessId)
    .single();
  return data ?? null;
}

export async function getBoutiqueProducts(businessId: string): Promise<BoutiqueProduct[]> {
  const { data } = await supabase
    .from('products')
    .select(`
      id, name, description, price, image_url,
      stock, track_stock, variants,
      category_id,
      category:categories(id, name, color, sort_order)
    `)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as BoutiqueProduct[];
}

export async function createBoutiqueOrder(
  input: CreateBoutiqueOrderInput,
): Promise<BoutiqueOrderResult> {
  const { data, error } = await supabase.rpc('create_boutique_order', {
    order_data: {
      business_id:      input.business_id,
      customer_name:    input.customer_name,
      customer_phone:   input.customer_phone,
      delivery_address: input.delivery_address ?? null,
      delivery_type:    input.delivery_type,
      payment_method:   input.payment_method,
      notes:            input.notes ?? null,
      items: input.items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id ?? null,
        name:       i.name,
        price:      i.price,
        quantity:   i.quantity,
      })),
    },
  });
  if (error) throw new Error(error.message);
  return data as BoutiqueOrderResult;
}

export async function getBoutiqueOrder(
  token: string,
): Promise<BoutiqueOrderDetail | null> {
  const { data, error } = await supabase.rpc('get_boutique_order', {
    p_token: token,
  });
  if (error || !data) return null;
  return data as BoutiqueOrderDetail;
}
