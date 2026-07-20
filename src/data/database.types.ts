/**
 * Tipos do banco (formato compatível com `supabase gen types typescript`).
 *
 * Mantido à mão por enquanto (projeto Supabase gerenciado manualmente).
 * Quando conectarmos o CLI do Supabase, regenere com:
 *   supabase gen types typescript --project-id <ref> > src/data/database.types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          creci: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          creci?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          creci?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          status: string;
          plan: string | null;
          plan_tier: string | null;
          storage_limit_bytes: number;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: string;
          plan?: string | null;
          plan_tier?: string | null;
          storage_limit_bytes?: number;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          plan?: string | null;
          plan_tier?: string | null;
          storage_limit_bytes?: number;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          risk: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          risk?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          risk?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      developments: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      user_storage_used: {
        Args: { uid: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
