export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance_type: string
          business_id: string | null
          class: number
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          nature: string
        }
        Insert: {
          balance_type?: string
          business_id?: string | null
          class: number
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          nature: string
        }
        Update: {
          balance_type?: string
          business_id?: string | null
          class?: number
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          nature?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          business_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          business_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          business_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey_public"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          answer: string
          business_id: string
          created_at: string
          id: string
          model: string | null
          question: string
          user_id: string | null
        }
        Insert: {
          answer: string
          business_id: string
          created_at?: string
          id?: string
          model?: string | null
          question: string
          user_id?: string | null
        }
        Update: {
          answer?: string
          business_id?: string
          created_at?: string
          id?: string
          model?: string | null
          question?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          business_id: string
          comment: string | null
          conversation_id: string | null
          created_at: string
          id: string
          rating: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          comment?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          rating: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          comment?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          rating?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge: {
        Row: {
          business_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          business_id: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          business_id: string | null
          created_at: string | null
          event_name: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          event_name: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          event_name?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          scopes: string[]
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          scopes?: string[]
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_modules: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean
          is_core: boolean
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string
          id: string
          is_active?: boolean
          is_core?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_core?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      business_members: {
        Row: {
          business_id: string
          id: string
          invited_by: string | null
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          business_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          business_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_type_modules: {
        Row: {
          business_type_id: string
          is_default: boolean
          module_id: string
        }
        Insert: {
          business_type_id: string
          is_default?: boolean
          module_id: string
        }
        Update: {
          business_type_id?: string
          is_default?: boolean
          module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_type_modules_business_type_id_fkey"
            columns: ["business_type_id"]
            isOneToOne: false
            referencedRelation: "business_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_type_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "app_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      business_types: {
        Row: {
          accent_color: string
          created_at: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          accent_color?: string
          created_at?: string | null
          description?: string | null
          icon?: string
          id: string
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          accent_color?: string
          created_at?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      businesses: {
        Row: {
          address: string | null
          brand_config: Json | null
          created_at: string
          currency: string
          denomination: string | null
          email: string | null
          features: string[]
          hotel_cancellation_policy: string | null
          hotel_deposit_info: string | null
          id: string
          industry_sector: string | null
          logo_url: string | null
          name: string
          onboarding_done: boolean | null
          organization_id: string | null
          owner_id: string | null
          phone: string | null
          public_slug: string
          receipt_footer: string | null
          rib: string | null
          stock_units: Json
          storage_quota_bytes: number
          storage_used_bytes: number
          tax_inclusive: boolean
          tax_rate: number
          type: string
          types: string[]
          webhook_whitelist: string[] | null
          whatsapp_routing_code: string | null
        }
        Insert: {
          address?: string | null
          brand_config?: Json | null
          created_at?: string
          currency?: string
          denomination?: string | null
          email?: string | null
          features?: string[]
          hotel_cancellation_policy?: string | null
          hotel_deposit_info?: string | null
          id?: string
          industry_sector?: string | null
          logo_url?: string | null
          name: string
          onboarding_done?: boolean | null
          organization_id?: string | null
          owner_id?: string | null
          phone?: string | null
          public_slug: string
          receipt_footer?: string | null
          rib?: string | null
          stock_units?: Json
          storage_quota_bytes?: number
          storage_used_bytes?: number
          tax_inclusive?: boolean
          tax_rate?: number
          type: string
          types?: string[]
          webhook_whitelist?: string[] | null
          whatsapp_routing_code?: string | null
        }
        Update: {
          address?: string | null
          brand_config?: Json | null
          created_at?: string
          currency?: string
          denomination?: string | null
          email?: string | null
          features?: string[]
          hotel_cancellation_policy?: string | null
          hotel_deposit_info?: string | null
          id?: string
          industry_sector?: string | null
          logo_url?: string | null
          name?: string
          onboarding_done?: boolean | null
          organization_id?: string | null
          owner_id?: string | null
          phone?: string | null
          public_slug?: string
          receipt_footer?: string | null
          rib?: string | null
          stock_units?: Json
          storage_quota_bytes?: number
          storage_used_bytes?: number
          tax_inclusive?: boolean
          tax_rate?: number
          type?: string
          types?: string[]
          webhook_whitelist?: string[] | null
          whatsapp_routing_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          actual_cash: number | null
          business_id: string
          closed_at: string | null
          closed_by: string | null
          difference: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_amount: number
          status: string
          total_card: number | null
          total_cash: number | null
          total_mobile: number | null
          total_orders: number | null
          total_refunds: number | null
          total_sales: number | null
        }
        Insert: {
          actual_cash?: number | null
          business_id: string
          closed_at?: string | null
          closed_by?: string | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          status?: string
          total_card?: number | null
          total_cash?: number | null
          total_mobile?: number | null
          total_orders?: number | null
          total_refunds?: number | null
          total_sales?: number | null
        }
        Update: {
          actual_cash?: number | null
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          status?: string
          total_card?: number | null
          total_cash?: number | null
          total_mobile?: number | null
          total_orders?: number | null
          total_refunds?: number | null
          total_sales?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          business_id: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          business_id: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          business_id?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      client_push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          token: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          token: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          token?: string
        }
        Relationships: []
      }
      client_tracking_tokens: {
        Row: {
          client_email: string | null
          client_phone: string | null
          created_at: string
          dossier_id: string | null
          expires_at: string
          id: string
          instance_id: string | null
          last_viewed: string | null
          service_order_id: string | null
          token: string
          view_count: number
        }
        Insert: {
          client_email?: string | null
          client_phone?: string | null
          created_at?: string
          dossier_id?: string | null
          expires_at?: string
          id?: string
          instance_id?: string | null
          last_viewed?: string | null
          service_order_id?: string | null
          token?: string
          view_count?: number
        }
        Update: {
          client_email?: string | null
          client_phone?: string | null
          created_at?: string
          dossier_id?: string | null
          expires_at?: string
          id?: string
          instance_id?: string | null
          last_viewed?: string | null
          service_order_id?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_tracking_tokens_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tracking_tokens_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          email: string | null
          id: string
          identification_number: string | null
          name: string
          notes: string | null
          phone: string | null
          representative_name: string | null
          type: string | null
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          identification_number?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          representative_name?: string | null
          type?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          identification_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          representative_name?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          body: string
          business_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          body: string
          business_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          amount_paid: number | null
          body: string
          business_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          client_address: string | null
          client_email: string | null
          client_id_number: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          created_by: string | null
          currency: string
          deposit_amount: number | null
          documents: Json
          end_date: string
          end_time: string | null
          extra_charges: number
          id: string
          lessor_signature_image: string | null
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          pdf_url: string | null
          pickup_inspection: Json | null
          pickup_location: string | null
          price_per_day: number | null
          required_documents: Json
          return_inspection: Json | null
          return_location: string | null
          signature_image: string | null
          signed_at: string | null
          source: string | null
          start_date: string
          start_time: string | null
          status: string
          template_id: string | null
          token: string
          token_expires_at: string
          total_amount: number | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount_paid?: number | null
          body: string
          business_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_address?: string | null
          client_email?: string | null
          client_id_number?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_amount?: number | null
          documents?: Json
          end_date: string
          end_time?: string | null
          extra_charges?: number
          id?: string
          lessor_signature_image?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          pickup_inspection?: Json | null
          pickup_location?: string | null
          price_per_day?: number | null
          required_documents?: Json
          return_inspection?: Json | null
          return_location?: string | null
          signature_image?: string | null
          signed_at?: string | null
          source?: string | null
          start_date: string
          start_time?: string | null
          status?: string
          template_id?: string | null
          token: string
          token_expires_at: string
          total_amount?: number | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount_paid?: number | null
          body?: string
          business_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_address?: string | null
          client_email?: string | null
          client_id_number?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deposit_amount?: number | null
          documents?: Json
          end_date?: string
          end_time?: string | null
          extra_charges?: number
          id?: string
          lessor_signature_image?: string | null
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          pickup_inspection?: Json | null
          pickup_location?: string | null
          price_per_day?: number | null
          required_documents?: Json
          return_inspection?: Json | null
          return_location?: string | null
          signature_image?: string | null
          signed_at?: string | null
          source?: string | null
          start_date?: string
          start_time?: string | null
          status?: string
          template_id?: string | null
          token?: string
          token_expires_at?: string
          total_amount?: number | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "rental_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          business_id: string
          code: string
          created_at: string
          expires_at: string | null
          free_item_label: string | null
          free_item_product_id: string | null
          free_item_quantity: number
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_amount: number | null
          min_quantity: number | null
          per_user_limit: number | null
          type: string
          uses_count: number
          value: number
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          expires_at?: string | null
          free_item_label?: string | null
          free_item_product_id?: string | null
          free_item_quantity?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number | null
          min_quantity?: number | null
          per_user_limit?: number | null
          type: string
          uses_count?: number
          value: number
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          expires_at?: string | null
          free_item_label?: string | null
          free_item_product_id?: string | null
          free_item_quantity?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number | null
          min_quantity?: number | null
          per_user_limit?: number | null
          type?: string
          uses_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_free_item_product_id_fkey"
            columns: ["free_item_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_menu_items: {
        Row: {
          custom_price: number | null
          daily_menu_id: string
          id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          custom_price?: number | null
          daily_menu_id: string
          id?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          custom_price?: number | null
          daily_menu_id?: string
          id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_menu_items_daily_menu_id_fkey"
            columns: ["daily_menu_id"]
            isOneToOne: false
            referencedRelation: "daily_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_menu_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_menus: {
        Row: {
          business_id: string
          created_at: string
          date: string
          id: string
          image_url: string | null
          note: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          date?: string
          id?: string
          image_url?: string | null
          note?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          date?: string
          id?: string
          image_url?: string | null
          note?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_menus_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_menus_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "restaurant_floors"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          created_at: string
          data_types: string[] | null
          email: string
          id: string
          reason: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          data_types?: string[] | null
          email: string
          id?: string
          reason?: string | null
          status?: string
          type?: string
        }
        Update: {
          created_at?: string
          data_types?: string[] | null
          email?: string
          id?: string
          reason?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      dossier_fichiers: {
        Row: {
          business_id: string
          created_at: string
          dossier_id: string
          id: string
          mime_type: string | null
          nom: string
          storage_path: string
          taille_bytes: number
          uploaded_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          dossier_id: string
          id?: string
          mime_type?: string | null
          nom: string
          storage_path: string
          taille_bytes?: number
          uploaded_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          dossier_id?: string
          id?: string
          mime_type?: string | null
          nom?: string
          storage_path?: string
          taille_bytes?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_fichiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_fichiers_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_fichiers_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dossier_time_entries: {
        Row: {
          business_id: string
          created_at: string | null
          date_record: string
          description: string
          dossier_id: string
          duration_minutes: number
          hourly_rate: number
          id: string
          is_billed: boolean
          total_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          date_record?: string
          description: string
          dossier_id: string
          duration_minutes: number
          hourly_rate?: number
          id?: string
          is_billed?: boolean
          total_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          date_record?: string
          description?: string
          dossier_id?: string
          duration_minutes?: number
          hourly_rate?: number
          id?: string
          is_billed?: boolean
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_time_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_time_entries_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dossiers: {
        Row: {
          adversaire: string | null
          business_id: string
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string | null
          date_audience: string | null
          date_ouverture: string
          description: string | null
          id: string
          juge: string | null
          reference: string
          status: string
          tribunal: string | null
          type_affaire: string
          updated_at: string | null
        }
        Insert: {
          adversaire?: string | null
          business_id: string
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string | null
          date_audience?: string | null
          date_ouverture?: string
          description?: string | null
          id?: string
          juge?: string | null
          reference: string
          status?: string
          tribunal?: string | null
          type_affaire?: string
          updated_at?: string | null
        }
        Update: {
          adversaire?: string | null
          business_id?: string
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string | null
          date_audience?: string | null
          date_ouverture?: string
          description?: string | null
          id?: string
          juge?: string | null
          reference?: string
          status?: string
          tribunal?: string | null
          type_affaire?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_classrooms: {
        Row: {
          business_id: string
          capacity: number | null
          created_at: string | null
          id: string
          level: string | null
          name: string
          teacher: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          capacity?: number | null
          created_at?: string | null
          id?: string
          level?: string | null
          name: string
          teacher?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          capacity?: number | null
          created_at?: string | null
          id?: string
          level?: string | null
          name?: string
          teacher?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edu_classrooms_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_grades: {
        Row: {
          business_id: string
          comment: string | null
          created_at: string | null
          evaluation_date: string | null
          id: string
          max_score: number | null
          score: number
          student_id: string
          subject: string
          term: string | null
        }
        Insert: {
          business_id: string
          comment?: string | null
          created_at?: string | null
          evaluation_date?: string | null
          id?: string
          max_score?: number | null
          score: number
          student_id: string
          subject: string
          term?: string | null
        }
        Update: {
          business_id?: string
          comment?: string | null
          created_at?: string | null
          evaluation_date?: string | null
          id?: string
          max_score?: number | null
          score?: number
          student_id?: string
          subject?: string
          term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edu_grades_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edu_grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "edu_students"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_students: {
        Row: {
          address: string | null
          birth_date: string | null
          business_id: string
          classroom_id: string | null
          created_at: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          photo_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          business_id: string
          classroom_id?: string | null
          created_at?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          business_id?: string
          classroom_id?: string | null
          created_at?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edu_students_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edu_students_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "edu_classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          created_at: string | null
          description: string | null
          html_body: string
          id: string
          is_active: boolean | null
          key: string
          name: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          html_body: string
          id?: string
          is_active?: boolean | null
          key: string
          name: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          html_body?: string
          id?: string
          is_active?: boolean | null
          key?: string
          name?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      event_guests: {
        Row: {
          business_id: string
          category: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          company: string | null
          created_at: string
          event_id: string
          full_name: string
          id: string
          notes: string | null
          pass_code: string | null
          phone: string | null
          status: string
        }
        Insert: {
          business_id: string
          category?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          company?: string | null
          created_at?: string
          event_id: string
          full_name: string
          id?: string
          notes?: string | null
          pass_code?: string | null
          phone?: string | null
          status?: string
        }
        Update: {
          business_id?: string
          category?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          company?: string | null
          created_at?: string
          event_id?: string
          full_name?: string
          id?: string
          notes?: string | null
          pass_code?: string | null
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          business_id: string
          created_at: string
          event_date: string | null
          id: string
          location: string | null
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          event_date?: string | null
          id?: string
          location?: string | null
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          event_date?: string | null
          id?: string
          location?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      honoraires_cabinet: {
        Row: {
          business_id: string
          client_name: string
          created_at: string | null
          date_facture: string
          description: string | null
          dossier_id: string | null
          id: string
          montant: number
          montant_paye: number
          status: string
          type_prestation: string
        }
        Insert: {
          business_id: string
          client_name: string
          created_at?: string | null
          date_facture?: string
          description?: string | null
          dossier_id?: string | null
          id?: string
          montant?: number
          montant_paye?: number
          status?: string
          type_prestation?: string
        }
        Update: {
          business_id?: string
          client_name?: string
          created_at?: string | null
          date_facture?: string
          description?: string | null
          dossier_id?: string | null
          id?: string
          montant?: number
          montant_paye?: number
          status?: string
          type_prestation?: string
        }
        Relationships: [
          {
            foreignKeyName: "honoraires_cabinet_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "honoraires_cabinet_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_cleaning_logs: {
        Row: {
          action: string
          business_id: string
          cleaner_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          reservation_id: string | null
          room_id: string
        }
        Insert: {
          action: string
          business_id: string
          cleaner_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reservation_id?: string | null
          room_id: string
        }
        Update: {
          action?: string
          business_id?: string
          cleaner_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reservation_id?: string | null
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_cleaning_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_cleaning_logs_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_cleaning_logs_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_cleaning_logs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_guests: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          id: string
          id_number: string | null
          id_type: string | null
          nationality: string | null
          notes: string | null
          phone: string | null
          preferences: string | null
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_guests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_payments: {
        Row: {
          amount: number
          business_id: string
          id: string
          method: string
          note: string | null
          paid_at: string
          reservation_id: string
          session_id: string | null
        }
        Insert: {
          amount: number
          business_id: string
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          reservation_id: string
          session_id?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          reservation_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_reservations: {
        Row: {
          actual_check_in: string | null
          actual_check_out: string | null
          business_id: string
          check_in: string
          check_out: string
          confirmation_token: string | null
          created_at: string
          created_by: string | null
          group_id: string | null
          guest_id: string
          id: string
          notes: string | null
          num_guests: number
          paid_amount: number
          price_per_night: number
          room_id: string
          source: string | null
          status: string
          total: number
          total_room: number
          total_services: number
          updated_at: string
        }
        Insert: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          business_id: string
          check_in: string
          check_out: string
          confirmation_token?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          guest_id: string
          id?: string
          notes?: string | null
          num_guests?: number
          paid_amount?: number
          price_per_night: number
          room_id: string
          source?: string | null
          status?: string
          total: number
          total_room: number
          total_services?: number
          updated_at?: string
        }
        Update: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          business_id?: string
          check_in?: string
          check_out?: string
          confirmation_token?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          guest_id?: string
          id?: string
          notes?: string | null
          num_guests?: number
          paid_amount?: number
          price_per_night?: number
          room_id?: string
          source?: string | null
          status?: string
          total?: number
          total_room?: number
          total_services?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "hotel_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_rooms: {
        Row: {
          amenities: string[]
          assigned_cleaner_id: string | null
          business_id: string
          capacity: number
          created_at: string
          description: string | null
          floor: string | null
          id: string
          is_active: boolean
          number: string
          price_per_night: number
          status: string
          type: string
          weekend_price_per_night: number | null
        }
        Insert: {
          amenities?: string[]
          assigned_cleaner_id?: string | null
          business_id: string
          capacity?: number
          created_at?: string
          description?: string | null
          floor?: string | null
          id?: string
          is_active?: boolean
          number: string
          price_per_night: number
          status?: string
          type?: string
          weekend_price_per_night?: number | null
        }
        Update: {
          amenities?: string[]
          assigned_cleaner_id?: string | null
          business_id?: string
          capacity?: number
          created_at?: string
          description?: string | null
          floor?: string | null
          id?: string
          is_active?: boolean
          number?: string
          price_per_night?: number
          status?: string
          type?: string
          weekend_price_per_night?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rooms_assigned_cleaner_id_fkey"
            columns: ["assigned_cleaner_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rooms_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_services: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          id: string
          label: string
          order_id: string | null
          reservation_id: string
          service_date: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          id?: string
          label: string
          order_id?: string | null
          reservation_id: string
          service_date?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          id?: string
          label?: string
          order_id?: string | null
          reservation_id?: string
          service_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_services_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_services_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_configs: {
        Row: {
          business_id: string
          column_map: Json
          connection: Json
          created_at: string | null
          id: string
          last_count: number | null
          last_run_at: string | null
          name: string
          source_table: string
          source_type: string
          target_entity: string
          updated_at: string | null
        }
        Insert: {
          business_id: string
          column_map: Json
          connection: Json
          created_at?: string | null
          id?: string
          last_count?: number | null
          last_run_at?: string | null
          name: string
          source_table: string
          source_type: string
          target_entity: string
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          column_map?: Json
          connection?: Json
          created_at?: string | null
          id?: string
          last_count?: number | null
          last_run_at?: string | null
          name?: string
          source_table?: string
          source_type?: string
          target_entity?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_configs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      intouch_configs: {
        Row: {
          api_key: string
          business_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          merchant_id: string
          partner_id: string
          updated_at: string | null
        }
        Insert: {
          api_key: string
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          merchant_id: string
          partner_id: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          merchant_id?: string
          partner_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intouch_configs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          business_id: string
          created_at: string | null
          created_by: string | null
          description: string
          entry_date: string
          id: string
          reference: string | null
          source: string
          source_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          created_by?: string | null
          description: string
          entry_date?: string
          id?: string
          reference?: string | null
          source?: string
          source_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          entry_date?: string
          id?: string
          reference?: string | null
          source?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_code: string
          account_name: string
          credit: number
          debit: number
          entry_id: string
          id: string
        }
        Insert: {
          account_code: string
          account_name: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
        }
        Update: {
          account_code?: string
          account_name?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          attachments: string[] | null
          business_id: string
          created_at: string | null
          end_date: string
          id: string
          leave_type_id: string
          reason: string | null
          staff_id: string
          start_date: string
          status: string
          total_days: number
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachments?: string[] | null
          business_id: string
          created_at?: string | null
          end_date: string
          id?: string
          leave_type_id: string
          reason?: string | null
          staff_id: string
          start_date: string
          status?: string
          total_days: number
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachments?: string[] | null
          business_id?: string
          created_at?: string | null
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string | null
          staff_id?: string
          start_date?: string
          status?: string
          total_days?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          business_id: string
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_paid: boolean | null
          name: string
          requires_approval: boolean | null
          updated_at: string | null
          yearly_days: number | null
        }
        Insert: {
          business_id: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_paid?: boolean | null
          name: string
          requires_approval?: boolean | null
          updated_at?: string | null
          yearly_days?: number | null
        }
        Update: {
          business_id?: string
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_paid?: boolean | null
          name?: string
          requires_approval?: boolean | null
          updated_at?: string | null
          yearly_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      livreurs: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "livreurs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_config: {
        Row: {
          business_id: string
          earn_per: number
          is_active: boolean
          min_redeem: number
          point_value: number
          updated_at: string
        }
        Insert: {
          business_id: string
          earn_per?: number
          is_active?: boolean
          min_redeem?: number
          point_value?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          earn_per?: number
          is_active?: boolean
          min_redeem?: number
          point_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_config_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          business_id: string
          client_name: string
          client_phone: string | null
          created_at: string
          expires_at: string | null
          id: string
          note: string | null
          order_amount: number | null
          order_id: string | null
          points: number
          service_order_id: string | null
          type: string
        }
        Insert: {
          business_id: string
          client_name: string
          client_phone?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string | null
          order_amount?: number | null
          order_id?: string | null
          points: number
          service_order_id?: string | null
          type: string
        }
        Update: {
          business_id?: string
          client_name?: string
          client_phone?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          note?: string | null
          order_amount?: number | null
          order_id?: string | null
          points?: number
          service_order_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permission_overrides: {
        Row: {
          business_id: string
          created_at: string
          granted: boolean
          permission: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          granted?: boolean
          permission: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          granted?: boolean
          permission?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permission_overrides_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_alert_log: {
        Row: {
          channels: string[] | null
          fired_at: string | null
          id: string
          rule_code: string
          value: number | null
        }
        Insert: {
          channels?: string[] | null
          fired_at?: string | null
          id?: string
          rule_code: string
          value?: number | null
        }
        Update: {
          channels?: string[] | null
          fired_at?: string | null
          id?: string
          rule_code?: string
          value?: number | null
        }
        Relationships: []
      }
      monitoring_alert_rules: {
        Row: {
          channels: string[] | null
          code: string
          cooldown_min: number
          is_active: boolean | null
          label: string
          threshold: number
          updated_at: string | null
          window_min: number
        }
        Insert: {
          channels?: string[] | null
          code: string
          cooldown_min?: number
          is_active?: boolean | null
          label: string
          threshold: number
          updated_at?: string | null
          window_min?: number
        }
        Update: {
          channels?: string[] | null
          code?: string
          cooldown_min?: number
          is_active?: boolean | null
          label?: string
          threshold?: number
          updated_at?: string | null
          window_min?: number
        }
        Relationships: []
      }
      monitoring_vitals: {
        Row: {
          business_id: string | null
          category: string
          context: Json | null
          created_at: string | null
          id: string
          latency_ms: number | null
          level: string
          message: string
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          category: string
          context?: Json | null
          created_at?: string | null
          id?: string
          latency_ms?: number | null
          level: string
          message: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          category?: string
          context?: Json | null
          created_at?: string | null
          id?: string
          latency_ms?: number | null
          level?: string
          message?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_vitals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          discount_amount: number
          id: string
          name: string
          notes: string | null
          order_id: string
          price: number
          product_id: string
          quantity: number
          total: number
          variant_id: string | null
        }
        Insert: {
          discount_amount?: number
          id?: string
          name: string
          notes?: string | null
          order_id: string
          price: number
          product_id: string
          quantity: number
          total: number
          variant_id?: string | null
        }
        Update: {
          discount_amount?: number
          id?: string
          name?: string
          notes?: string | null
          order_id?: string
          price?: number
          product_id?: string
          quantity?: number
          total?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          business_id: string
          cashier_id: string | null
          coupon_code: string | null
          coupon_codes: Json
          coupon_id: string | null
          coupon_ids: Json
          coupon_notes: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivered_by: string | null
          delivery_address: string | null
          delivery_location: Json | null
          delivery_status: string
          delivery_type: string | null
          discount_amount: number
          hotel_reservation_id: string | null
          id: string
          livreur_id: string | null
          notes: string | null
          order_channel: string
          order_type: string
          payment_token: string | null
          reseller_client_id: string | null
          reseller_id: string | null
          source: string
          status: string
          student_id: string | null
          subtotal: number
          table_id: string | null
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          cashier_id?: string | null
          coupon_code?: string | null
          coupon_codes?: Json
          coupon_id?: string | null
          coupon_ids?: Json
          coupon_notes?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_address?: string | null
          delivery_location?: Json | null
          delivery_status?: string
          delivery_type?: string | null
          discount_amount?: number
          hotel_reservation_id?: string | null
          id?: string
          livreur_id?: string | null
          notes?: string | null
          order_channel?: string
          order_type?: string
          payment_token?: string | null
          reseller_client_id?: string | null
          reseller_id?: string | null
          source?: string
          status?: string
          student_id?: string | null
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          cashier_id?: string | null
          coupon_code?: string | null
          coupon_codes?: Json
          coupon_id?: string | null
          coupon_ids?: Json
          coupon_notes?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_address?: string | null
          delivery_location?: Json | null
          delivery_status?: string
          delivery_type?: string | null
          discount_amount?: number
          hotel_reservation_id?: string | null
          id?: string
          livreur_id?: string | null
          notes?: string | null
          order_channel?: string
          order_type?: string
          payment_token?: string | null
          reseller_client_id?: string | null
          reseller_id?: string | null
          source?: string
          status?: string
          student_id?: string | null
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_hotel_reservation_id_fkey"
            columns: ["hotel_reservation_id"]
            isOneToOne: false
            referencedRelation: "hotel_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_livreur_id_fkey"
            columns: ["livreur_id"]
            isOneToOne: false
            referencedRelation: "livreurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reseller_client_id_fkey"
            columns: ["reseller_client_id"]
            isOneToOne: false
            referencedRelation: "reseller_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "edu_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country: string | null
          created_at: string
          currency: string
          denomination: string | null
          id: string
          legal_name: string
          owner_id: string | null
          rib: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          currency?: string
          denomination?: string | null
          id?: string
          legal_name: string
          owner_id?: string | null
          rib?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          currency?: string
          denomination?: string | null
          id?: string
          legal_name?: string
          owner_id?: string | null
          rib?: string | null
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          id: number
          om_qr_url: string | null
          updated_at: string | null
          wave_qr_url: string | null
          whatsapp_number: string | null
        }
        Insert: {
          id?: number
          om_qr_url?: string | null
          updated_at?: string | null
          wave_qr_url?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          id?: number
          om_qr_url?: string | null
          updated_at?: string | null
          wave_qr_url?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          business_id: string | null
          created_at: string | null
          currency: string | null
          error_message: string | null
          external_reference: string | null
          id: string
          method: string
          order_id: string | null
          phone: string | null
          provider: string
          provider_response: Json | null
          status: string
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          business_id?: string | null
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          external_reference?: string | null
          id?: string
          method: string
          order_id?: string | null
          phone?: string | null
          provider: string
          provider_response?: Json | null
          status?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          business_id?: string | null
          created_at?: string | null
          currency?: string | null
          error_message?: string | null
          external_reference?: string | null
          id?: string
          method?: string
          order_id?: string | null
          phone?: string | null
          provider?: string
          provider_response?: Json | null
          status?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          id: string
          method: string
          order_id: string
          paid_at: string
          reference: string | null
        }
        Insert: {
          amount: number
          id?: string
          method: string
          order_id: string
          paid_at?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          id?: string
          method?: string
          order_id?: string
          paid_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          currency: string
          duration_days: number
          features: string[] | null
          id: string
          is_active: boolean | null
          label: string
          name: string
          price: number
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          currency?: string
          duration_days?: number
          features?: string[] | null
          id?: string
          is_active?: boolean | null
          label: string
          name: string
          price?: number
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          currency?: string
          duration_days?: number
          features?: string[] | null
          id?: string
          is_active?: boolean | null
          label?: string
          name?: string
          price?: number
          sort_order?: number | null
        }
        Relationships: []
      }
      pressure_days: {
        Row: {
          business_id: string
          created_at: string | null
          date: string
          id: string
          reason: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          date: string
          id?: string
          reason: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          date?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "pressure_days_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pretentions: {
        Row: {
          business_id: string
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          tags: string[]
          template: string
          updated_at: string
          variables: Json
        }
        Insert: {
          business_id: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tags?: string[]
          template: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          business_id?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tags?: string[]
          template?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pretentions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          business_id: string
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          sku: string | null
          stock: number | null
          track_stock: boolean
          unit: string | null
          updated_at: string
          variants: Json
          wholesale_price: number | null
        }
        Insert: {
          barcode?: string | null
          business_id: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price: number
          sku?: string | null
          stock?: number | null
          track_stock?: boolean
          unit?: string | null
          updated_at?: string
          variants?: Json
          wholesale_price?: number | null
        }
        Update: {
          barcode?: string | null
          business_id?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          sku?: string | null
          stock?: number | null
          track_stock?: boolean
          unit?: string | null
          updated_at?: string
          variants?: Json
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      public_subscription_requests: {
        Row: {
          business_name: string
          created_at: string | null
          denomination: string | null
          email: string
          full_name: string | null
          id: string
          note: string | null
          password: string | null
          phone: string | null
          plan_id: string | null
          processed_at: string | null
          processed_by: string | null
          receipt_url: string | null
          status: string
        }
        Insert: {
          business_name: string
          created_at?: string | null
          denomination?: string | null
          email: string
          full_name?: string | null
          id?: string
          note?: string | null
          password?: string | null
          phone?: string | null
          plan_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          receipt_url?: string | null
          status?: string
        }
        Update: {
          business_name?: string
          created_at?: string | null
          denomination?: string | null
          email?: string
          full_name?: string | null
          id?: string
          note?: string | null
          password?: string | null
          phone?: string | null
          plan_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          receipt_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_subscription_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_subscription_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          cost_per_unit: number | null
          id: string
          order_id: string
          packaging_qty: number | null
          packaging_size: number | null
          packaging_unit: string | null
          product_id: string
          quantity_ordered: number
          quantity_received: number | null
        }
        Insert: {
          cost_per_unit?: number | null
          id?: string
          order_id: string
          packaging_qty?: number | null
          packaging_size?: number | null
          packaging_unit?: string | null
          product_id: string
          quantity_ordered?: number
          quantity_received?: number | null
        }
        Update: {
          cost_per_unit?: number | null
          id?: string
          order_id?: string
          packaging_qty?: number | null
          packaging_size?: number | null
          packaging_unit?: string | null
          product_id?: string
          quantity_ordered?: number
          quantity_received?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          business_id: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          ordered_at: string | null
          received_at: string | null
          reference: string | null
          status: string
          supplier_id: string | null
          supplier_name: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          received_at?: string | null
          reference?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          received_at?: string | null
          reference?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          business_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          business_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          business_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_end: string
        }
        Insert: {
          count?: number
          key: string
          window_end: string
        }
        Update: {
          count?: number
          key?: string
          window_end?: string
        }
        Relationships: []
      }
      reference_data: {
        Row: {
          business_id: string | null
          category: string
          color: string | null
          created_at: string | null
          id: string
          is_active: boolean
          label: string
          metadata: Json
          sort_order: number
          value: string
        }
        Insert: {
          business_id?: string | null
          category: string
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          metadata?: Json
          sort_order?: number
          value: string
        }
        Update: {
          business_id?: string | null
          category?: string
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          metadata?: Json
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_data_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          id: string
          order_id: string
          reason: string | null
          refunded_at: string
          refunded_by: string | null
        }
        Insert: {
          amount: number
          id?: string
          order_id: string
          reason?: string | null
          refunded_at?: string
          refunded_by?: string | null
        }
        Update: {
          amount?: number
          id?: string
          order_id?: string
          reason?: string | null
          refunded_at?: string
          refunded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_vehicles: {
        Row: {
          brand: string | null
          business_id: string
          color: string | null
          commission_type: string
          commission_value: number
          created_at: string
          currency: string
          deposit_amount: number
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          license_plate: string | null
          model: string | null
          name: string
          owner_name: string | null
          owner_phone: string | null
          owner_report_token: string
          owner_type: string
          price_per_day: number
          price_per_hour: number | null
          year: number | null
        }
        Insert: {
          brand?: string | null
          business_id: string
          color?: string | null
          commission_type?: string
          commission_value?: number
          created_at?: string
          currency?: string
          deposit_amount?: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          license_plate?: string | null
          model?: string | null
          name: string
          owner_name?: string | null
          owner_phone?: string | null
          owner_report_token?: string
          owner_type?: string
          price_per_day?: number
          price_per_hour?: number | null
          year?: number | null
        }
        Update: {
          brand?: string | null
          business_id?: string
          color?: string | null
          commission_type?: string
          commission_value?: number
          created_at?: string
          currency?: string
          deposit_amount?: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          license_plate?: string | null
          model?: string | null
          name?: string
          owner_name?: string | null
          owner_phone?: string | null
          owner_report_token?: string
          owner_type?: string
          price_per_day?: number
          price_per_hour?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_vehicles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_clients: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          id: string
          name: string
          phone: string | null
          reseller_id: string
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          reseller_id: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          reseller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_clients_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_offers: {
        Row: {
          bonus_qty: number
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          min_qty: number
          product_id: string
          reseller_id: string | null
        }
        Insert: {
          bonus_qty?: number
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          min_qty: number
          product_id: string
          reseller_id?: string | null
        }
        Update: {
          bonus_qty?: number
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          min_qty?: number
          product_id?: string
          reseller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_offers_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      resellers: {
        Row: {
          address: string | null
          business_id: string
          chef_id: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          type: string
          zone: string | null
        }
        Insert: {
          address?: string | null
          business_id: string
          chef_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          type?: string
          zone?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string
          chef_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          type?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resellers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resellers_chef_id_fkey"
            columns: ["chef_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_floors: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          position: number | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          position?: number | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          position?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_floors_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          business_id: string
          capacity: number | null
          created_at: string | null
          current_order_id: string | null
          floor_id: string
          height: number | null
          id: string
          is_active: boolean | null
          name: string
          pos_x: number | null
          pos_y: number | null
          rotation: number | null
          shape: Database["public"]["Enums"]["table_shape"] | null
          status: Database["public"]["Enums"]["table_status"] | null
          updated_at: string | null
          width: number | null
        }
        Insert: {
          business_id: string
          capacity?: number | null
          created_at?: string | null
          current_order_id?: string | null
          floor_id: string
          height?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          pos_x?: number | null
          pos_y?: number | null
          rotation?: number | null
          shape?: Database["public"]["Enums"]["table_shape"] | null
          status?: Database["public"]["Enums"]["table_status"] | null
          updated_at?: string | null
          width?: number | null
        }
        Update: {
          business_id?: string
          capacity?: number | null
          created_at?: string | null
          current_order_id?: string | null
          floor_id?: string
          height?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          pos_x?: number | null
          pos_y?: number | null
          rotation?: number | null
          shape?: Database["public"]["Enums"]["table_shape"] | null
          status?: Database["public"]["Enums"]["table_status"] | null
          updated_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "restaurant_floors"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          business_id: string
          category: string
          category_id: string | null
          created_at: string | null
          description: string | null
          duration_min: number | null
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          business_id: string
          category?: string
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_min?: number | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          business_id?: string
          category?: string
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_min?: number | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_catalog_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          business_id: string
          color: string | null
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          business_id: string
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          business_id?: string
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_counters: {
        Row: {
          business_id: string
          last_number: number
        }
        Insert: {
          business_id: string
          last_number?: number
        }
        Update: {
          business_id?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_counters_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_events: {
        Row: {
          actor_name: string | null
          business_id: string
          created_at: string | null
          event_type: string
          id: string
          label: string
          metadata: Json | null
          service_order_id: string
        }
        Insert: {
          actor_name?: string | null
          business_id: string
          created_at?: string | null
          event_type?: string
          id?: string
          label: string
          metadata?: Json | null
          service_order_id: string
        }
        Update: {
          actor_name?: string | null
          business_id?: string
          created_at?: string | null
          event_type?: string
          id?: string
          label?: string
          metadata?: Json | null
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_events_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_items: {
        Row: {
          id: string
          name: string
          order_id: string
          price: number
          quantity: number
          service_id: string | null
          total: number
        }
        Insert: {
          id?: string
          name: string
          order_id: string
          price?: number
          quantity?: number
          service_id?: string | null
          total?: number
        }
        Update: {
          id?: string
          name?: string
          order_id?: string
          price?: number
          quantity?: number
          service_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_payments: {
        Row: {
          amount: number
          business_id: string
          id: string
          method: string
          order_id: string
          paid_at: string
        }
        Insert: {
          amount: number
          business_id: string
          id?: string
          method?: string
          order_id: string
          paid_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          id?: string
          method?: string
          order_id?: string
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_technician_tokens: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          service_order_id: string
          staff_id: string
          token: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          service_order_id: string
          staff_id: string
          token: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          service_order_id?: string
          staff_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_technician_tokens_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_technician_tokens_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_technician_tokens_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          assigned_name: string | null
          assigned_to: string | null
          business_id: string
          client_feedback: string | null
          client_name: string | null
          client_phone: string | null
          client_rating: number | null
          created_at: string | null
          created_by: string | null
          finished_at: string | null
          id: string
          notes: string | null
          order_number: number
          paid_amount: number
          paid_at: string | null
          payment_method: string | null
          source: string | null
          started_at: string | null
          status: string
          subject_id: string | null
          subject_info: string | null
          subject_ref: string | null
          subject_type: string | null
          total: number
        }
        Insert: {
          assigned_name?: string | null
          assigned_to?: string | null
          business_id: string
          client_feedback?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_rating?: number | null
          created_at?: string | null
          created_by?: string | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          order_number: number
          paid_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          source?: string | null
          started_at?: string | null
          status?: string
          subject_id?: string | null
          subject_info?: string | null
          subject_ref?: string | null
          subject_type?: string | null
          total?: number
        }
        Update: {
          assigned_name?: string | null
          assigned_to?: string | null
          business_id?: string
          client_feedback?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_rating?: number | null
          created_at?: string | null
          created_by?: string | null
          finished_at?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          paid_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          source?: string | null
          started_at?: string | null
          status?: string
          subject_id?: string | null
          subject_info?: string | null
          subject_ref?: string | null
          subject_type?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "service_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_subjects: {
        Row: {
          business_id: string
          client_id: string | null
          created_at: string | null
          designation: string | null
          id: string
          notes: string | null
          reference: string
          type_sujet: string
        }
        Insert: {
          business_id: string
          client_id?: string | null
          created_at?: string | null
          designation?: string | null
          id?: string
          notes?: string | null
          reference: string
          type_sujet?: string
        }
        Update: {
          business_id?: string
          client_id?: string | null
          created_at?: string | null
          designation?: string | null
          id?: string
          notes?: string | null
          reference?: string
          type_sujet?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_subjects_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_subjects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshots: {
        Row: {
          business_id: string
          category_count: number
          coupon_count: number
          created_at: string
          created_by: string | null
          data: Json
          id: string
          label: string | null
          product_count: number
          type: string
        }
        Insert: {
          business_id: string
          category_count?: number
          coupon_count?: number
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          label?: string | null
          product_count?: number
          type?: string
        }
        Update: {
          business_id?: string
          category_count?: number
          coupon_count?: number
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          label?: string | null
          product_count?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          business_id: string
          created_at: string | null
          department: string | null
          email: string | null
          hire_date: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          position: string | null
          salary_rate: number
          salary_type: string
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          department?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          salary_rate?: number
          salary_type?: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          department?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          salary_rate?: number
          salary_type?: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance: {
        Row: {
          business_id: string
          clock_in: string | null
          clock_out: string | null
          created_at: string | null
          date: string
          hours_worked: number | null
          id: string
          notes: string | null
          staff_id: string
          status: string
        }
        Insert: {
          business_id: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string | null
          date: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          staff_id: string
          status?: string
        }
        Update: {
          business_id?: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string | null
          date?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          staff_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leave_balances: {
        Row: {
          id: string
          leave_type_id: string
          remaining: number
          staff_id: string
          total_accrued: number
          total_used: number
          updated_at: string | null
          year: number
        }
        Insert: {
          id?: string
          leave_type_id: string
          remaining?: number
          staff_id: string
          total_accrued?: number
          total_used?: number
          updated_at?: string | null
          year: number
        }
        Update: {
          id?: string
          leave_type_id?: string
          remaining?: number
          staff_id?: string
          total_accrued?: number
          total_used?: number
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leave_balances_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_payments: {
        Row: {
          base_amount: number
          bonuses: number
          business_id: string
          created_at: string | null
          days_worked: number | null
          deductions: number
          hours_worked: number | null
          id: string
          net_amount: number
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          period_end: string
          period_start: string
          staff_id: string
          status: string
        }
        Insert: {
          base_amount?: number
          bonuses?: number
          business_id: string
          created_at?: string | null
          days_worked?: number | null
          deductions?: number
          hours_worked?: number | null
          id?: string
          net_amount?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          period_end: string
          period_start: string
          staff_id: string
          status?: string
        }
        Update: {
          base_amount?: number
          bonuses?: number
          business_id?: string
          created_at?: string | null
          days_worked?: number | null
          deductions?: number
          hours_worked?: number | null
          id?: string
          net_amount?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          period_end?: string
          period_start?: string
          staff_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_entries: {
        Row: {
          business_id: string
          cost_per_unit: number | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          packaging_qty: number | null
          packaging_size: number | null
          packaging_unit: string | null
          product_id: string
          quantity: number
          supplier: string | null
        }
        Insert: {
          business_id: string
          cost_per_unit?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          packaging_qty?: number | null
          packaging_size?: number | null
          packaging_unit?: string | null
          product_id: string
          quantity: number
          supplier?: string | null
        }
        Update: {
          business_id?: string
          cost_per_unit?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          packaging_qty?: number | null
          packaging_size?: number | null
          packaging_unit?: string | null
          product_id?: string
          quantity?: number
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_requests: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          note: string | null
          plan_id: string | null
          processed_at: string | null
          processed_by: string | null
          receipt_url: string
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          note?: string | null
          plan_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          receipt_url: string
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          note?: string | null
          plan_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          receipt_url?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          activated_at: string | null
          business_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          owner_id: string | null
          payment_note: string | null
          plan_id: string | null
          status: string
          trial_ends_at: string | null
        }
        Insert: {
          activated_at?: string | null
          business_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          owner_id?: string | null
          payment_note?: string | null
          plan_id?: string | null
          status?: string
          trial_ends_at?: string | null
        }
        Update: {
          activated_at?: string | null
          business_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          owner_id?: string | null
          payment_note?: string | null
          plan_id?: string | null
          status?: string
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          business_id: string
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          attachments: string[] | null
          business_id: string
          created_at: string
          id: string
          message: string
          metadata: Json
          priority: string
          status: string
          subject: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: string[] | null
          business_id: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          priority?: string
          status?: string
          subject: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: string[] | null
          business_id?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          priority?: string
          status?: string
          subject?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          business_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_blocked: boolean
          is_superadmin: boolean | null
          last_seen_at: string | null
          role: string
        }
        Insert: {
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          is_blocked?: boolean
          is_superadmin?: boolean | null
          last_seen_at?: string | null
          role?: string
        }
        Update: {
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_blocked?: boolean
          is_superadmin?: boolean | null
          last_seen_at?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      voiture_leads: {
        Row: {
          business_id: string
          created_at: string
          id: string
          message: string | null
          nom: string
          statut: string
          telephone: string
          voiture_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          message?: string | null
          nom: string
          statut?: string
          telephone: string
          voiture_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          message?: string | null
          nom?: string
          statut?: string
          telephone?: string
          voiture_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voiture_leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiture_leads_voiture_id_fkey"
            columns: ["voiture_id"]
            isOneToOne: false
            referencedRelation: "voitures"
            referencedColumns: ["id"]
          },
        ]
      }
      voitures: {
        Row: {
          annee: number | null
          business_id: string
          carburant: string | null
          commission_type: string
          commission_value: number
          couleur: string | null
          created_at: string
          description: string | null
          id: string
          image_principale: string | null
          kilometrage: number | null
          marque: string
          modele: string
          owner_name: string | null
          owner_phone: string | null
          owner_report_token: string
          owner_type: string
          prix: number
          statut: string
          transmission: string | null
          updated_at: string
        }
        Insert: {
          annee?: number | null
          business_id: string
          carburant?: string | null
          commission_type?: string
          commission_value?: number
          couleur?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_principale?: string | null
          kilometrage?: number | null
          marque: string
          modele: string
          owner_name?: string | null
          owner_phone?: string | null
          owner_report_token?: string
          owner_type?: string
          prix?: number
          statut?: string
          transmission?: string | null
          updated_at?: string
        }
        Update: {
          annee?: number | null
          business_id?: string
          carburant?: string | null
          commission_type?: string
          commission_value?: number
          couleur?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_principale?: string | null
          kilometrage?: number | null
          marque?: string
          modele?: string
          owner_name?: string | null
          owner_phone?: string | null
          owner_report_token?: string
          owner_type?: string
          prix?: number
          statut?: string
          transmission?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voitures_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_broadcast_logs: {
        Row: {
          business_id: string
          date: string
          id: string
          phone: string
          sent_at: string
        }
        Insert: {
          business_id: string
          date?: string
          id?: string
          phone: string
          sent_at?: string
        }
        Update: {
          business_id?: string
          date?: string
          id?: string
          phone?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_broadcast_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_carts: {
        Row: {
          business_id: string
          context: Json
          created_at: string
          from_phone: string
          id: string
          items: Json
          step: string
          updated_at: string
        }
        Insert: {
          business_id: string
          context?: Json
          created_at?: string
          from_phone: string
          id?: string
          items?: Json
          step?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          context?: Json
          created_at?: string
          from_phone?: string
          id?: string
          items?: Json
          step?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_carts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_configs: {
        Row: {
          access_token: string
          business_id: string
          catalog_enabled: boolean
          confirm_message: string
          created_at: string
          delivery_fee: number
          display_phone: string | null
          enable_delivery: boolean
          enable_pickup: boolean
          id: string
          is_active: boolean
          last_api_error_message: string | null
          last_health_check_at: string | null
          menu_keyword: string
          msg_address_request: string
          msg_cart_footer: string
          msg_delivery_confirmation: string
          msg_shipping_question: string
          phone_number_id: string
          status_health: string | null
          updated_at: string
          use_shared_number: boolean | null
          verify_token: string
          wave_payment_url: string | null
          welcome_message: string
        }
        Insert: {
          access_token?: string
          business_id: string
          catalog_enabled?: boolean
          confirm_message?: string
          created_at?: string
          delivery_fee?: number
          display_phone?: string | null
          enable_delivery?: boolean
          enable_pickup?: boolean
          id?: string
          is_active?: boolean
          last_api_error_message?: string | null
          last_health_check_at?: string | null
          menu_keyword?: string
          msg_address_request?: string
          msg_cart_footer?: string
          msg_delivery_confirmation?: string
          msg_shipping_question?: string
          phone_number_id?: string
          status_health?: string | null
          updated_at?: string
          use_shared_number?: boolean | null
          verify_token?: string
          wave_payment_url?: string | null
          welcome_message?: string
        }
        Update: {
          access_token?: string
          business_id?: string
          catalog_enabled?: boolean
          confirm_message?: string
          created_at?: string
          delivery_fee?: number
          display_phone?: string | null
          enable_delivery?: boolean
          enable_pickup?: boolean
          id?: string
          is_active?: boolean
          last_api_error_message?: string | null
          last_health_check_at?: string | null
          menu_keyword?: string
          msg_address_request?: string
          msg_cart_footer?: string
          msg_delivery_confirmation?: string
          msg_shipping_question?: string
          phone_number_id?: string
          status_health?: string | null
          updated_at?: string
          use_shared_number?: boolean | null
          verify_token?: string
          wave_payment_url?: string | null
          welcome_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_configs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          business_id: string
          created_at: string
          direction: string
          from_name: string | null
          from_phone: string
          id: string
          message_type: string
          order_id: string | null
          payload: Json | null
          replied_by: string | null
          status: string
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          business_id: string
          created_at?: string
          direction: string
          from_name?: string | null
          from_phone: string
          id?: string
          message_type?: string
          order_id?: string | null
          payload?: Json | null
          replied_by?: string | null
          status?: string
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          business_id?: string
          created_at?: string
          direction?: string
          from_name?: string | null
          from_phone?: string
          id?: string
          message_type?: string
          order_id?: string | null
          payload?: Json | null
          replied_by?: string | null
          status?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_shared_sessions: {
        Row: {
          business_id: string
          from_phone: string
          last_active_at: string | null
        }
        Insert: {
          business_id: string
          from_phone: string
          last_active_at?: string | null
        }
        Update: {
          business_id?: string
          from_phone?: string
          last_active_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_shared_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_documents: {
        Row: {
          generated_at: string
          generated_by: string | null
          id: string
          instance_id: string
          mime_type: string
          name: string
          node_id: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          instance_id: string
          mime_type?: string
          name: string
          node_id: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          instance_id?: string
          mime_type?: string
          name?: string
          node_id?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_documents_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_history: {
        Row: {
          action_label: string | null
          context_snapshot: Json
          edge_id: string | null
          from_node_id: string | null
          id: string
          instance_id: string
          metadata: Json
          performed_at: string
          performed_by: string | null
          to_node_id: string
        }
        Insert: {
          action_label?: string | null
          context_snapshot: Json
          edge_id?: string | null
          from_node_id?: string | null
          id?: string
          instance_id: string
          metadata?: Json
          performed_at?: string
          performed_by?: string | null
          to_node_id: string
        }
        Update: {
          action_label?: string | null
          context_snapshot?: Json
          edge_id?: string | null
          from_node_id?: string | null
          id?: string
          instance_id?: string
          metadata?: Json
          performed_at?: string
          performed_by?: string | null
          to_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_history_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instances: {
        Row: {
          completed_at: string | null
          context: Json
          created_at: string
          current_node_id: string
          dossier_id: string
          id: string
          last_error: string | null
          paused_at: string | null
          retry_count: number
          scheduled_resume_at: string | null
          started_at: string
          started_by: string | null
          status: string
          triggered_by: string | null
          updated_at: string
          version: number | null
          workflow_id: string
          workflow_snapshot: Json
          workflow_version: number
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_node_id: string
          dossier_id: string
          id?: string
          last_error?: string | null
          paused_at?: string | null
          retry_count?: number
          scheduled_resume_at?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
          version?: number | null
          workflow_id: string
          workflow_snapshot: Json
          workflow_version: number
        }
        Update: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          current_node_id?: string
          dossier_id?: string
          id?: string
          last_error?: string | null
          paused_at?: string | null
          retry_count?: number
          scheduled_resume_at?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
          version?: number | null
          workflow_id?: string
          workflow_snapshot?: Json
          workflow_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instances_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_jobs: {
        Row: {
          created_at: string
          id: string
          instance_id: string
          job_type: string
          last_error: string | null
          max_retries: number
          payload: Json
          priority: number
          process_after: string
          processed_at: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id: string
          job_type: string
          last_error?: string | null
          max_retries?: number
          payload?: Json
          priority?: number
          process_after?: string
          processed_at?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string
          job_type?: string
          last_error?: string | null
          max_retries?: number
          payload?: Json
          priority?: number
          process_after?: string
          processed_at?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_jobs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_logs: {
        Row: {
          context_snapshot: Json
          created_at: string
          edge_id: string | null
          error_details: Json | null
          event_type: string
          from_node_id: string | null
          id: string
          instance_id: string
          level: string
          message: string | null
          performed_by: string | null
          to_node_id: string | null
        }
        Insert: {
          context_snapshot?: Json
          created_at?: string
          edge_id?: string | null
          error_details?: Json | null
          event_type: string
          from_node_id?: string | null
          id?: string
          instance_id: string
          level?: string
          message?: string | null
          performed_by?: string | null
          to_node_id?: string | null
        }
        Update: {
          context_snapshot?: Json
          created_at?: string
          edge_id?: string | null
          error_details?: Json | null
          event_type?: string
          from_node_id?: string | null
          id?: string
          instance_id?: string
          level?: string
          message?: string | null
          performed_by?: string | null
          to_node_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_triggers: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          trigger_type: string
          workflow_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          trigger_type: string
          workflow_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          trigger_type?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_triggers_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_versions: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          id: string
          version: number
          workflow_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition: Json
          id?: string
          version: number
          workflow_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          id?: string
          version?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          definition: Json
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflows_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      intouch_configs_public: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          merchant_id: string | null
          partner_id: string | null
          updated_at: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          merchant_id?: string | null
          partner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          merchant_id?: string | null
          partner_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intouch_configs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_subscription: {
        Args: {
          p_business_id: string
          p_days?: number
          p_note?: string
          p_plan_id: string
        }
        Returns: undefined
      }
      activate_trial_v2: { Args: { p_biz_id: string }; Returns: undefined }
      add_stock_entry: {
        Args: {
          p_business_id: string
          p_cost_per_unit?: number
          p_created_by?: string
          p_notes?: string
          p_packaging_qty?: number
          p_packaging_size?: number
          p_packaging_unit?: string
          p_product_id: string
          p_quantity: number
          p_supplier?: string
        }
        Returns: undefined
      }
      admin_reset_user_password: {
        Args: {
          p_business_id: string
          p_new_password: string
          p_user_id: string
        }
        Returns: undefined
      }
      assign_user_to_business: {
        Args: {
          p_business_id: string
          p_email: string
          p_full_name: string
          p_role: string
        }
        Returns: undefined
      }
      auto_snapshot_all_businesses: { Args: never; Returns: undefined }
      cancel_order: { Args: { p_order_id: string }; Returns: undefined }
      check_email_exists: { Args: { p_email: string }; Returns: boolean }
      check_in_guest: { Args: { p_guest_id: string }; Returns: unknown }
      check_rate_limit: {
        Args: { p_key: string; p_max_count: number; p_window_seconds?: number }
        Returns: boolean
      }
      check_tracking_access: { Args: { order_id: string }; Returns: boolean }
      check_workflow_tracking_access: {
        Args: { instance_id: string }
        Returns: boolean
      }
      cleanup_activity_logs: { Args: { p_keep_days?: number }; Returns: number }
      cleanup_monitoring_vitals: { Args: never; Returns: undefined }
      cleanup_whatsapp_sessions: { Args: never; Returns: undefined }
      close_cash_session: {
        Args: { p_actual_cash: number; p_notes?: string; p_session_id: string }
        Returns: {
          actual_cash: number | null
          business_id: string
          closed_at: string | null
          closed_by: string | null
          difference: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_amount: number
          status: string
          total_card: number | null
          total_cash: number | null
          total_mobile: number | null
          total_orders: number | null
          total_refunds: number | null
          total_sales: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_order_payment: {
        Args: { p_amount: number; p_method: string; p_order_id: string }
        Returns: undefined
      }
      confirm_order_delivery: {
        Args: { p_delivered_by: string; p_order_id: string }
        Returns: undefined
      }
      create_boutique_order: { Args: { order_data: Json }; Returns: Json }
      create_business: { Args: { business_data: Json }; Returns: Json }
      create_business_v2: {
        Args: { p_name: string; p_sector: string }
        Returns: string
      }
      create_order: { Args: { order_data: Json }; Returns: Json }
      create_public_rental_request: { Args: { p_data: Json }; Returns: Json }
      create_public_reservation: { Args: { p_data: Json }; Returns: Json }
      create_public_service_order: {
        Args: {
          p_business_id: string
          p_client_name: string
          p_client_phone: string
          p_items?: Json
          p_notes?: string
          p_subject_info?: string
          p_subject_ref?: string
          p_subject_type?: string
        }
        Returns: Json
      }
      create_snapshot: {
        Args: { p_business_id: string; p_label?: string; p_type?: string }
        Returns: string
      }
      decrement_stock:
        | {
            Args: { p_product_id: string; p_quantity: number }
            Returns: undefined
          }
        | {
            Args: { p_product_id: string; p_quantity: number }
            Returns: undefined
          }
      delete_snapshot: { Args: { p_snapshot_id: string }; Returns: undefined }
      evaluate_monitoring_alerts: { Args: never; Returns: undefined }
      generate_unique_business_public_slug: {
        Args: { base_value: string; current_business_id?: string }
        Returns: string
      }
      get_all_organizations_admin: { Args: never; Returns: Json }
      get_all_subscriptions: {
        Args: never
        Returns: {
          activated_at: string
          business_id: string
          business_name: string
          businesses: Json
          expires_at: string
          owner_email: string
          owner_id: string
          owner_name: string
          payment_note: string
          plan_currency: string
          plan_label: string
          plan_price: number
          status: string
          trial_ends_at: string
        }[]
      }
      get_available_rooms: {
        Args: { p_business_id: string; p_check_in: string; p_check_out: string }
        Returns: {
          amenities: string[]
          assigned_cleaner_id: string | null
          business_id: string
          capacity: number
          created_at: string
          description: string | null
          floor: string | null
          id: string
          is_active: boolean
          number: string
          price_per_night: number
          status: string
          type: string
          weekend_price_per_night: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "hotel_rooms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_available_vehicles:
        | {
            Args: {
              p_business_id: string
              p_end_date: string
              p_start_date: string
            }
            Returns: {
              brand: string | null
              business_id: string
              color: string | null
              commission_type: string
              commission_value: number
              created_at: string
              currency: string
              deposit_amount: number
              description: string | null
              id: string
              image_url: string | null
              is_available: boolean
              license_plate: string | null
              model: string | null
              name: string
              owner_name: string | null
              owner_phone: string | null
              owner_report_token: string
              owner_type: string
              price_per_day: number
              price_per_hour: number | null
              year: number | null
            }[]
            SetofOptions: {
              from: "*"
              to: "rental_vehicles"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: {
              p_business_id: string
              p_end_date: string
              p_end_time: string
              p_start_date: string
              p_start_time: string
            }
            Returns: {
              brand: string | null
              business_id: string
              color: string | null
              commission_type: string
              commission_value: number
              created_at: string
              currency: string
              deposit_amount: number
              description: string | null
              id: string
              image_url: string | null
              is_available: boolean
              license_plate: string | null
              model: string | null
              name: string
              owner_name: string | null
              owner_phone: string | null
              owner_report_token: string
              owner_type: string
              price_per_day: number
              price_per_hour: number | null
              year: number | null
            }[]
            SetofOptions: {
              from: "*"
              to: "rental_vehicles"
              isOneToOne: false
              isSetofReturn: true
            }
          }
      get_boutique_order: { Args: { p_token: string }; Returns: Json }
      get_business_members: {
        Args: { p_business_id: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          joined_at: string
          role: string
          user_id: string
        }[]
      }
      get_db_health: { Args: never; Returns: Json }
      get_member_permissions: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: {
          granted: boolean
          permission: string
        }[]
      }
      get_my_businesses: {
        Args: never
        Returns: {
          address: string
          brand_config: Json
          created_at: string
          currency: string
          denomination: string
          email: string
          features: string[]
          id: string
          industry_sector: string
          logo_url: string
          member_role: string
          name: string
          onboarding_done: boolean
          organization_id: string
          organization_name: string
          owner_id: string
          phone: string
          public_slug: string
          receipt_footer: string
          rib: string
          stock_units: Json
          tax_inclusive: boolean
          tax_rate: number
          type: string
          types: string[]
          webhook_whitelist: string[]
        }[]
      }
      get_my_permissions: {
        Args: { p_business_id: string }
        Returns: {
          granted: boolean
          permission: string
        }[]
      }
      get_my_subscription: {
        Args: never
        Returns: {
          activated_at: string | null
          business_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          owner_id: string | null
          payment_note: string | null
          plan_id: string | null
          status: string
          trial_ends_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_or_create_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          business_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_blocked: boolean
          is_superadmin: boolean | null
          last_seen_at: string | null
          role: string
        }[]
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_or_create_service_technician_token: {
        Args: {
          p_business_id: string
          p_service_order_id: string
          p_staff_id: string
        }
        Returns: string
      }
      get_public_loyalty: { Args: { p_token: string }; Returns: Json }
      get_public_rental_request: { Args: { p_token: string }; Returns: Json }
      get_public_reservation: { Args: { p_token: string }; Returns: Json }
      get_public_tracking: { Args: { p_token: string }; Returns: Json }
      get_room_conflicts: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_exclude_id?: string
          p_room_id: string
        }
        Returns: {
          check_in: string
          check_out: string
          guest_name: string
          id: string
          status: string
        }[]
      }
      get_service_order_counts: {
        Args: { p_business_id: string; p_date?: string; p_search?: string }
        Returns: Json
      }
      get_session_live_summary: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_slow_queries: {
        Args: { p_limit?: number }
        Returns: {
          calls: number
          mean_ms: number
          query_text: string
          rows_returned: number
          total_ms: number
        }[]
      }
      get_snapshot_data: { Args: { p_snapshot_id: string }; Returns: Json }
      get_snapshots: {
        Args: { p_business_id: string }
        Returns: {
          category_count: number
          coupon_count: number
          created_at: string
          created_by_name: string
          id: string
          label: string
          product_count: number
          type: string
        }[]
      }
      get_technician_service_order: { Args: { p_token: string }; Returns: Json }
      get_technician_service_orders: {
        Args: { p_token: string }
        Returns: Json
      }
      get_trial_balance: {
        Args: {
          p_business_id: string
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          account_code: string
          account_name: string
          balance: number
          balance_type: string
          class_num: number
          nature: string
          total_credit: number
          total_debit: number
        }[]
      }
      get_user_business_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      get_vehicle_owner_report: { Args: { p_token: string }; Returns: Json }
      get_whatsapp_conversations: {
        Args: {
          p_business_id: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_unread_only?: boolean
        }
        Returns: {
          from_name: string
          from_phone: string
          last_at: string
          last_message: string
          unread: number
        }[]
      }
      get_whatsapp_health_summary: { Args: never; Returns: Json }
      increment_coupon_uses: {
        Args: { p_coupon_id: string }
        Returns: undefined
      }
      increment_tracking_view: { Args: { t: string }; Returns: undefined }
      invoke_workflow_processor: { Args: never; Returns: undefined }
      is_superadmin: { Args: never; Returns: boolean }
      open_cash_session: {
        Args: { p_business_id: string; p_opening_amount?: number }
        Returns: {
          actual_cash: number | null
          business_id: string
          closed_at: string | null
          closed_by: string | null
          difference: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_amount: number
          status: string
          total_card: number | null
          total_cash: number | null
          total_mobile: number | null
          total_orders: number | null
          total_refunds: number | null
          total_sales: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pay_service_order: {
        Args: { p_amount: number; p_id: string; p_method: string }
        Returns: Json
      }
      refund_order: {
        Args: {
          p_amount: number
          p_order_id: string
          p_reason?: string
          p_refunded_by?: string
        }
        Returns: undefined
      }
      remove_business_member: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: undefined
      }
      restore_snapshot: {
        Args: { p_snapshot_id: string; p_tables?: string[] }
        Returns: Json
      }
      seed_demo_data: {
        Args: { p_biz_id: string; p_sector: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_business_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      slugify_public_text: { Args: { value: string }; Returns: string }
      start_order_picking: { Args: { p_order_id: string }; Returns: undefined }
      submit_service_order_feedback: {
        Args: { p_feedback?: string; p_rating: number; p_token: string }
        Returns: undefined
      }
      switch_business: { Args: { p_business_id: string }; Returns: undefined }
      sync_accounting: { Args: { p_business_id: string }; Returns: number }
      sync_service_orders_accounting: {
        Args: { p_business_id: string }
        Returns: number
      }
      toggle_user_block: {
        Args: { p_blocked: boolean; p_business_id: string; p_user_id: string }
        Returns: undefined
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_last_seen: { Args: never; Returns: undefined }
      update_payment_transaction_status: {
        Args: {
          p_error?: string
          p_external_ref: string
          p_response?: Json
          p_status: string
          p_transaction_id?: string
        }
        Returns: undefined
      }
      update_technician_service_order_status:
        | {
            Args: { p_order_id: string; p_status: string; p_token: string }
            Returns: Json
          }
        | { Args: { p_status: string; p_token: string }; Returns: Json }
      validate_coupon: {
        Args: {
          business_id: string
          coupon_code: string
          order_total: number
          user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      table_shape: "square" | "round" | "rectangle"
      table_status: "free" | "occupied" | "reserved" | "cleaning"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      table_shape: ["square", "round", "rectangle"],
      table_status: ["free", "occupied", "reserved", "cleaning"],
    },
  },
} as const
