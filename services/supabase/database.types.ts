/**
 * Generated Supabase database types.
 * In production, generate with: supabase gen types typescript --local
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          name: string;
          type: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          logo_url: string | null;
          currency: string;
          tax_rate: number;
          receipt_footer: string | null;
          owner_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['businesses']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['businesses']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: string;
          business_id: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      categories: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          color: string | null;
          icon: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['categories']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
      };
      products: {
        Row: {
          id: string;
          business_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          price: number;
          image_url: string | null;
          barcode: string | null;
          sku: string | null;
          track_stock: boolean;
          stock: number | null;
          variants: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
      };
      orders: {
        Row: {
          id: string;
          business_id: string;
          cashier_id: string;
          status: string;
          subtotal: number;
          tax_amount: number;
          discount_amount: number;
          total: number;
          coupon_id: string | null;
          coupon_code: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          variant_id: string | null;
          name: string;
          price: number;
          quantity: number;
          discount_amount: number;
          total: number;
          notes: string | null;
        };
        Insert: Omit<Database['public']['Tables']['order_items']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>;
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          method: string;
          amount: number;
          reference: string | null;
          paid_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
      };
      coupons: {
        Row: {
          id: string;
          business_id: string;
          code: string;
          type: string;
          value: number;
          min_order_amount: number | null;
          max_uses: number | null;
          uses_count: number;
          per_user_limit: number | null;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['coupons']['Row'], 'id' | 'created_at' | 'uses_count'> & {
          id?: string;
          created_at?: string;
          uses_count?: number;
        };
        Update: Partial<Database['public']['Tables']['coupons']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_order: {
        Args: { order_data: Json };
        Returns: Json;
      };
      validate_coupon: {
        Args: { coupon_code: string; business_id: string; order_total: number; user_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
  };
}
