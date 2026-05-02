// ─── Authentication & Users ───────────────────────────────────────────────────

export type UserRole = 'admin' | 'owner' | 'staff' | 'manager';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  business_id: string | null;
  avatar_url?: string;
  is_blocked?:    boolean;
  is_superadmin?: boolean;
  /** Permission overrides for the current business: { permissionKey: granted } */
  permissions_overrides?: Record<string, boolean>;
  created_at: string;
}

// ─── Organization ─────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  legal_name: string;        // Raison sociale
  denomination?: string;     // Dénomination commerciale (si différente)
  rib?: string;
  owner_id?: string;
  currency: string;
  country?: string;
  created_at: string;
}

// ─── Business ─────────────────────────────────────────────────────────────────

export type BusinessType = 'restaurant' | 'retail' | 'service' | 'hotel' | 'juridique';

export interface Business {
  id: string;
  name: string;              // Nom de l'établissement
  public_slug?: string;
  type: BusinessType;
  industry_sector?: string;
  denomination?: string;
  rib?: string;
  brand_config?: Record<string, any>;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  currency: string;
  tax_rate: number;
  tax_inclusive: boolean;
  webhook_whitelist?: string[];
  receipt_footer?: string;
  stock_units?: string[];
  whatsapp_routing_code?: string;
  types: string[];
  features: string[];
  onboarding_done?: boolean;
  owner_id?: string;
  organization_id?: string;
  organization_name?: string; // jointure depuis organizations.legal_name
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
  /** How many base units of stock this variant consumes per sale (default 1) */
  stock_consumption?: number;
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
  /** Base unit of measure for stock (e.g. "kg", "pièce", "litre") */
  unit?: string;
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
export type PaymentMethod = 'cash' | 'card' | 'mobile_money' | 'partial' | 'room_charge' | 'free';

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
  coupon_notes?: string;  // description affichée sur la facture (ex: "1 bouteille offerte")
  notes?: string;
  customer_name?: string;
  customer_phone?: string;
  hotel_reservation_id?: string;
  table_id?: string;
  created_at: string;
  updated_at: string;
  source?: string;
  // livraison
  delivery_status: DeliveryStatus;
  delivered_by?: string;
  delivered_at?: string;
  delivery_type?: 'pickup' | 'delivery' | null;
  delivery_address?: string | null;
  delivery_location?: { latitude: number; longitude: number; name?: string; address?: string } | null;
  livreur_id?: string | null;
  // joined
  cashier?: User;
  livreur?: import('../services/supabase/livreurs').Livreur;
}

// ─── Restaurant & Seating ────────────────────────────────────────────────────

export interface RestaurantFloor {
  id: string;
  business_id: string;
  name: string;
  position: number;
  is_active: boolean;
  created_at: string;
}

export type TableShape = 'square' | 'round' | 'rectangle';
export type TableStatus = 'free' | 'occupied' | 'reserved' | 'cleaning';

export interface RestaurantTable {
  id: string;
  business_id: string;
  floor_id: string;
  name: string;
  capacity: number;
  shape: TableShape;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  status: TableStatus;
  current_order_id?: string | null;
  is_active: boolean;
  created_at: string;
  // joined
  floor?: { name: string };
}

// ─── Cart (local state, not persisted to DB) ──────────────────────────────────

export interface CartItem {
  product_id: string;
  variant_id?: string;
  name: string;
  price: number;           // final unit price (base + variant modifier); 0 pour les articles offerts
  quantity: number;
  notes?: string;
  product?: Product;
  /** How many base stock units this item consumes per unit sold (default 1) */
  stock_consumption?: number;
  /** True si cet article a été ajouté automatiquement par un coupon free_item */
  is_free_item?: boolean;
}

export interface Cart {
  items: CartItem[];
  coupons: Coupon[];
  discount_amount: number;
  notes?: string;
}

// ─── Coupons ──────────────────────────────────────────────────────────────────

export type CouponType = 'percentage' | 'fixed' | 'free_item';

export interface Coupon {
  id: string;
  business_id: string;
  code: string;
  type: CouponType;
  value: number;            // percentage (0–100) or fixed amount; 0 for free_item
  min_order_amount?: number;
  min_quantity?: number;         // free_item: nb minimum d'articles dans le panier
  free_item_label?: string;      // free_item: description affichée (ex: "1 bouteille")
  free_item_product_id?: string; // free_item: produit à offrir (sortie de stock automatique)
  free_item_quantity?: number;   // free_item: quantité offerte (défaut 1)
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
  /** Mode grossiste : nom du revendeur (affiché à gauche sur la facture) */
  reseller_name?: string;
  /** Mode grossiste : nom du client du revendeur (affiché à droite) */
  reseller_client_name?: string;
  reseller_client_phone?: string;
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

// ─── Hôtel ────────────────────────────────────────────────────────────────────

export type { RoomType, RoomStatus, ReservationStatus, HotelRoom, HotelGuest, HotelReservation, HotelService } from '../services/supabase/hotel';
export type { Livreur } from '../services/supabase/livreurs';
export type * from './workflow';

// ─── Subscriptions ────────────────────────────────────────────────────────────

export interface SubscriptionRequest {
  id:           string;
  business_id:  string;
  business_name: string;
  plan_id:      string | null;
  plan_label:   string | null;
  plan_price:   number | null;
  plan_currency: string | null;
  receipt_url:  string;
  status:       'pending' | 'approved' | 'rejected';
  note:         string | null;
  created_at:   string;
  processed_at: string | null;
}

export interface PublicSubscriptionRequest {
  id:            string;
  business_name: string;
  denomination:  string | null;
  email:         string;
  full_name:     string | null;
  phone:         string | null;
  plan_id:       string | null;
  plan_label:    string | null;
  plan_price:    number | null;
  plan_currency: string | null;
  receipt_url:   string | null;
  password:      string | null;
  status:        'pending' | 'approved' | 'rejected';
  note:          string | null;
  created_at:    string;
  processed_at:  string | null;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}
