/**
 * Generated Supabase database types.
 * In production, generate with: supabase gen types typescript --local
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
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
          stock_units: Json | null;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          currency?: string;
          tax_rate?: number;
          receipt_footer?: string | null;
          stock_units?: Json | null;
          owner_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['businesses']['Insert']>;
        Relationships: [];
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
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: string;
          business_id?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'users_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
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
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          color?: string | null;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'categories_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
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
        Insert: {
          id?: string;
          business_id: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          price: number;
          image_url?: string | null;
          barcode?: string | null;
          sku?: string | null;
          track_stock?: boolean;
          stock?: number | null;
          variants?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'products_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          }
        ];
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
          customer_name: string | null;
          customer_phone: string | null;
          delivery_status: string | null;
          delivered_by: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          cashier_id: string;
          status?: string;
          subtotal: number;
          tax_amount?: number;
          discount_amount?: number;
          total: number;
          coupon_id?: string | null;
          coupon_code?: string | null;
          notes?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_status?: string | null;
          delivered_by?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'orders_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_cashier_id_fkey';
            columns: ['cashier_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
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
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          variant_id?: string | null;
          name: string;
          price: number;
          quantity: number;
          discount_amount?: number;
          total: number;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          }
        ];
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
        Insert: {
          id?: string;
          order_id: string;
          method: string;
          amount: number;
          reference?: string | null;
          paid_at?: string;
        };
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          }
        ];
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
        Insert: {
          id?: string;
          business_id: string;
          code: string;
          type: string;
          value: number;
          min_order_amount?: number | null;
          max_uses?: number | null;
          uses_count?: number;
          per_user_limit?: number | null;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['coupons']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'coupons_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'businesses';
            referencedColumns: ['id'];
          }
        ];
      };
      refunds: {
        Row: {
          id: string;
          order_id: string;
          amount: number;
          reason: string | null;
          refunded_by: string | null;
          refunded_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          amount: number;
          reason?: string | null;
          refunded_by?: string | null;
          refunded_at?: string;
        };
        Update: Partial<Database['public']['Tables']['refunds']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'refunds_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          }
        ];
      };
      stock_entries: {
        Row: {
          id: string;
          business_id: string;
          product_id: string;
          quantity: number;
          packaging_qty: number | null;
          packaging_size: number | null;
          packaging_unit: string | null;
          supplier: string | null;
          cost_per_unit: number | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          product_id: string;
          quantity: number;
          packaging_qty?: number | null;
          packaging_size?: number | null;
          packaging_unit?: string | null;
          supplier?: string | null;
          cost_per_unit?: number | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['stock_entries']['Insert']>;
        Relationships: [];
      };
      business_members: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          role: string;
          invited_by: string | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          user_id: string;
          role?: string;
          invited_by?: string | null;
          joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['business_members']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_order: {
        Args: { order_data: Json };
        Returns: Json;
      };
      cancel_order: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      refund_order: {
        Args: { p_order_id: string; p_amount: number; p_reason: string | null; p_refunded_by: string | null };
        Returns: undefined;
      };
      start_order_picking: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      confirm_order_delivery: {
        Args: { p_order_id: string; p_delivered_by: string };
        Returns: undefined;
      };
      decrement_stock: {
        Args: { p_product_id: string; p_quantity: number };
        Returns: undefined;
      };
      validate_coupon: {
        Args: { coupon_code: string; business_id: string; order_total: number; user_id: string };
        Returns: Json;
      };
      complete_order_payment: {
        Args: { p_order_id: string; p_method: string; p_amount: number };
        Returns: undefined;
      };
      add_stock_entry: {
        Args: {
          p_business_id: string; p_product_id: string; p_quantity: number;
          p_packaging_qty: number | null; p_packaging_size: number | null;
          p_packaging_unit: string | null; p_supplier: string | null;
          p_cost_per_unit: number | null; p_notes: string | null;
          p_created_by: string | null;
        };
        Returns: undefined;
      };
      get_my_businesses: {
        Args: Record<string, never>;
        Returns: Json;
      };
      switch_business: {
        Args: { p_business_id: string };
        Returns: undefined;
      };
      create_business: {
        Args: { business_data: Json };
        Returns: Json;
      };
      get_business_members: {
        Args: { p_business_id: string };
        Returns: Json;
      };
      set_member_role: {
        Args: { p_business_id: string; p_user_id: string; p_role: string };
        Returns: undefined;
      };
      remove_business_member: {
        Args: { p_business_id: string; p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
