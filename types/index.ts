// ─── Authentication & Users ───────────────────────────────────────────────────

export type UserRole = 'admin' | 'owner' | 'staff';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  business_id: string | null;
  avatar_url?: string;
  created_at: string;
}

// ─── Business ─────────────────────────────────────────────────────────────────

export type BusinessType = 'restaurant' | 'retail' | 'service' | 'hotel';

export interface Business {
  id: string;
  name: string;
  type: BusinessType;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  currency: string;
  tax_rate: number;          // percentage, e.g. 18
  receipt_footer?: string;
  owner_id: string;
  created_at: string;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  business_id: string;
  name: string;
  color?: string;
  icon?: string;
  sort_order: number;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  name: string;           // e.g. "Large", "Red"
  price_modifier: number; // added to base price
  sku?: string;
  stock?: number;
}

export interface Product {
  id: string;
  business_id: string;
  category_id?: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  barcode?: string;
  sku?: string;
  track_stock: boolean;
  stock?: number;
  variants: ProductVariant[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  category?: Category;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderStatus   = 'pending' | 'paid' | 'cancelled' | 'refunded';
export type DeliveryStatus = 'pending' | 'picking' | 'delivered';
export type PaymentMethod = 'cash' | 'card' | 'mobile_money' | 'partial';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id?: string;
  name: string;
  price: number;
  quantity: number;
  discount_amount: number;
  total: number;
  notes?: string;
  // joined
  product?: Product & { barcode?: string; image_url?: string };
}

export interface Payment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;      // card/mobile ref
  paid_at: string;
}

export interface Order {
  id: string;
  business_id: string;
  cashier_id: string;
  status: OrderStatus;
  items: OrderItem[];
  payments: Payment[];
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  coupon_id?: string;
  coupon_code?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // livraison
  delivery_status: DeliveryStatus;
  delivered_by?: string;
  delivered_at?: string;
  // joined
  cashier?: User;
}

// ─── Cart (local state, not persisted to DB) ──────────────────────────────────

export interface CartItem {
  product_id: string;
  variant_id?: string;
  name: string;
  price: number;           // final unit price (base + variant modifier)
  quantity: number;
  notes?: string;
  product?: Product;
}

export interface Cart {
  items: CartItem[];
  coupon?: Coupon;
  discount_amount: number;
  notes?: string;
}

// ─── Coupons ──────────────────────────────────────────────────────────────────

export type CouponType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  business_id: string;
  code: string;
  type: CouponType;
  value: number;           // percentage (0–100) or fixed amount
  min_order_amount?: number;
  max_uses?: number;
  uses_count: number;
  per_user_limit?: number;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface DailyStat {
  date: string;
  total_sales: number;
  order_count: number;
  avg_order_value: number;
}

export interface TopProduct {
  product_id: string;
  name: string;
  quantity_sold: number;
  revenue: number;
}

export interface AnalyticsSummary {
  total_sales: number;
  order_count: number;
  avg_order_value: number;
  top_products: TopProduct[];
  daily_stats: DailyStat[];
}

// ─── Hardware ─────────────────────────────────────────────────────────────────

export interface PrinterStatus {
  connected: boolean;
  name?: string;
  error?: string;
}

export interface ScannerStatus {
  connected: boolean;
  type: 'hid' | 'usb' | 'none';
}

export interface NfcStatus {
  connected: boolean;
  reader?: string;
}

export interface HardwareStatus {
  printer: PrinterStatus;
  scanner: ScannerStatus;
  nfc: NfcStatus;
}

export interface ReceiptData {
  order: Order;
  business: Business;
  cashier_name: string;
}

// ─── IPC Channel Types ────────────────────────────────────────────────────────

export type IpcChannel =
  // Hardware
  | 'hardware:printer:print'
  | 'hardware:printer:status'
  | 'hardware:scanner:status'
  | 'hardware:scanner:scan'
  | 'hardware:nfc:status'
  | 'hardware:nfc:read'
  // Offline sync
  | 'sync:queue:add'
  | 'sync:queue:flush'
  | 'sync:status'
  // Orders (local DB)
  | 'orders:create-local'
  | 'orders:get-pending'
  | 'orders:mark-synced';

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Offline Queue ────────────────────────────────────────────────────────────

export type QueueOperation = 'create_order' | 'update_order' | 'create_payment';

export interface QueueItem {
  id: string;
  operation: QueueOperation;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
  last_attempt?: string;
}

// ─── Remboursements ───────────────────────────────────────────────────────────

export interface Refund {
  id: string;
  order_id: string;
  amount: number;
  reason?: string;
  refunded_by?: string;
  refunded_at: string;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}
