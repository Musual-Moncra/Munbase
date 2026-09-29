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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: Json
          slug: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: Json
          slug: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: Json
          slug?: string
        }
        Relationships: []
      }
      digital_entitlements: {
        Row: {
          buyer_id: string
          granted_at: string
          id: string
          order_item_id: string
          product_id: string
          storage_path: string
        }
        Insert: {
          buyer_id: string
          granted_at?: string
          id?: string
          order_item_id: string
          product_id: string
          storage_path: string
        }
        Update: {
          buyer_id?: string
          granted_at?: string
          id?: string
          order_item_id?: string
          product_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_entitlements_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_entitlements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_entitlements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_settings: {
        Row: {
          id: boolean
          physical_seller_shipping_fee: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          physical_seller_shipping_fee?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          physical_seller_shipping_fee?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          product_title: string
          product_type: Database["public"]["Enums"]["product_kind"]
          quantity: number
          seller_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          product_title: string
          product_type: Database["public"]["Enums"]["product_kind"]
          quantity: number
          seller_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          product_title?: string
          product_type?: Database["public"]["Enums"]["product_kind"]
          quantity?: number
          seller_id?: string
          unit_price?: number
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
          {
            foreignKeyName: "order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          cancelled_at: string | null
          cod_remittance_reference: string | null
          cod_remitted_at: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          expires_at: string | null
          id: string
          order_code: number
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          payment_status: Database["public"]["Enums"]["payment_state"]
          payos_order_code: number | null
          payos_payment_link_id: string | null
          shipping_address: Json | null
          shipping_total: number
          subtotal: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          cancelled_at?: string | null
          cod_remittance_reference?: string | null
          cod_remitted_at?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          order_code?: never
          paid_at?: string | null
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_state"]
          payos_order_code?: number | null
          payos_payment_link_id?: string | null
          shipping_address?: Json | null
          shipping_total?: number
          subtotal: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          cancelled_at?: string | null
          cod_remittance_reference?: string | null
          cod_remitted_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          order_code?: never
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["order_payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_state"]
          payos_order_code?: number | null
          payos_payment_link_id?: string | null
          shipping_address?: Json | null
          shipping_total?: number
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_code: number | null
          order_id: string | null
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_code?: number | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider: string
          provider_event_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_code?: number | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string
          digital_file_path: string | null
          id: string
          images: string[]
          is_active: boolean
          price: number
          product_type: Database["public"]["Enums"]["product_kind"]
          seller_id: string
          slug: string
          stock_quantity: number
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string
          digital_file_path?: string | null
          id?: string
          images?: string[]
          is_active?: boolean
          price: number
          product_type: Database["public"]["Enums"]["product_kind"]
          seller_id: string
          slug: string
          stock_quantity?: number
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string
          digital_file_path?: string | null
          id?: string
          images?: string[]
          is_active?: boolean
          price?: number
          product_type?: Database["public"]["Enums"]["product_kind"]
          seller_id?: string
          slug?: string
          stock_quantity?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_applications: {
        Row: {
          contact_phone: string
          created_at: string
          description: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          shop_name: string
          status: Database["public"]["Enums"]["seller_application_state"]
          user_id: string
        }
        Insert: {
          contact_phone: string
          created_at?: string
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_name: string
          status?: Database["public"]["Enums"]["seller_application_state"]
          user_id: string
        }
        Update: {
          contact_phone?: string
          created_at?: string
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shop_name?: string
          status?: Database["public"]["Enums"]["seller_application_state"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_payout_accounts: {
        Row: {
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          seller_id: string
          updated_at: string
        }
        Insert: {
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          seller_id: string
          updated_at?: string
        }
        Update: {
          bank_account_name?: string
          bank_account_number?: string
          bank_name?: string
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_payout_accounts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_reconciliations: {
        Row: {
          commission_amount: number
          created_at: string
          gross_amount: number
          id: string
          order_item_id: string
          reconciled_at: string | null
          reconciled_by: string | null
          seller_id: string
          status: string
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          gross_amount: number
          id?: string
          order_item_id: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          seller_id: string
          status?: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          gross_amount?: number
          id?: string
          order_item_id?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_reconciliations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reconciliations_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reconciliations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          created_at: string
          delivered_at: string | null
          id: string
          order_id: string
          seller_id: string
          shipped_at: string | null
          shipping_fee: number
          status: Database["public"]["Enums"]["shipment_state"]
          tracking_number: string | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id: string
          seller_id: string
          shipped_at?: string | null
          shipping_fee: number
          status?: Database["public"]["Enums"]["shipment_state"]
          tracking_number?: string | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id?: string
          seller_id?: string
          shipped_at?: string | null
          shipping_fee?: number
          status?: Database["public"]["Enums"]["shipment_state"]
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          created_at: string
          description: string
          is_active: boolean
          logo_url: string | null
          seller_id: string
          shop_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          is_active?: boolean
          logo_url?: string | null
          seller_id: string
          shop_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          is_active?: boolean
          logo_url?: string | null
          seller_id?: string
          shop_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shops_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_confirm_cod_remittance: {
        Args: { p_order_id: string; p_reference: string }
        Returns: undefined
      }
      admin_mark_reconciled: {
        Args: { p_reconciliation_id: string }
        Returns: undefined
      }
      admin_review_seller_application: {
        Args: { p_application_id: string; p_approve: boolean }
        Returns: undefined
      }
      cancel_cod_order: { Args: { p_order_id: string }; Returns: undefined }
      confirm_payos_payment: {
        Args: {
          p_amount: number
          p_event_id: string
          p_order_code: number
          p_payload: Json
        }
        Returns: boolean
      }
      confirm_sepay_payment: {
        Args: {
          p_amount: number
          p_event_id: string
          p_order_code: number
          p_payload: Json
        }
        Returns: boolean
      }
      create_marketplace_order: {
        Args: {
          p_customer: Json
          p_items: Json
          p_payment_method: Database["public"]["Enums"]["order_payment_method"]
        }
        Returns: string
      }
      expire_unpaid_orders: { Args: never; Returns: number }
      is_order_paid: { Args: { p_order_id: string }; Returns: boolean }
      seller_update_shipment: {
        Args: {
          p_carrier: string
          p_shipment_id: string
          p_status: Database["public"]["Enums"]["shipment_state"]
          p_tracking_number: string
        }
        Returns: undefined
      }
      set_payos_payment_link: {
        Args: { p_link_id: string; p_order_code: number; p_order_id: string }
        Returns: undefined
      }
      submit_seller_application: {
        Args: {
          p_contact_phone: string
          p_description: string
          p_shop_name: string
        }
        Returns: string
      }
    }
    Enums: {
      order_payment_method: "payos" | "cod" | "sepay"
      payment_state: "pending" | "paid" | "failed" | "cancelled"
      product_kind: "physical" | "digital"
      seller_application_state: "pending" | "approved" | "rejected"
      shipment_state:
        | "pending"
        | "ready_to_ship"
        | "shipped"
        | "delivered"
        | "cancelled"
      user_role: "buyer" | "seller" | "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      order_payment_method: ["payos", "cod", "sepay"],
      payment_state: ["pending", "paid", "failed", "cancelled"],
      product_kind: ["physical", "digital"],
      seller_application_state: ["pending", "approved", "rejected"],
      shipment_state: [
        "pending",
        "ready_to_ship",
        "shipped",
        "delivered",
        "cancelled",
      ],
      user_role: ["buyer", "seller", "admin"],
    },
  },
} as const
