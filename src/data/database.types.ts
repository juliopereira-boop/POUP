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
          agency: string | null;
          agency_manager: string | null;
          cnpj: string | null;
          phone: string | null;
          avatar_url: string | null;
          creci: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          agency?: string | null;
          agency_manager?: string | null;
          cnpj?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          creci?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          agency?: string | null;
          agency_manager?: string | null;
          cnpj?: string | null;
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
          max_installments: number | null;
          max_semiannual: number | null;
          max_annual: number | null;
          coincide_installments: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          risk?: number | null;
          max_installments?: number | null;
          max_semiannual?: number | null;
          max_annual?: number | null;
          coincide_installments?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          risk?: number | null;
          max_installments?: number | null;
          max_semiannual?: number | null;
          max_annual?: number | null;
          coincide_installments?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      correspondents: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          name: string;
          created_at?: string;
        };
        Update: { name?: string };
        Relationships: [];
      };
      developments: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          name: string;
          delivery_date: string | null;
          manager_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          name: string;
          delivery_date?: string | null;
          manager_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          name?: string;
          delivery_date?: string | null;
          manager_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      simulations: {
        Row: {
          id: string;
          user_id: string;
          client_name: string | null;
          company_id: string | null;
          company_name: string | null;
          development_id: string | null;
          development_name: string | null;
          monthly_value: number | null;
          risk_pct: number | null;
          within_risk: boolean | null;
          unit_value: number | null;
          delivery_date: string | null;
          manager_name: string | null;
          proposal_date: string | null;
          state: Json;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_name?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          development_id?: string | null;
          development_name?: string | null;
          monthly_value?: number | null;
          risk_pct?: number | null;
          within_risk?: boolean | null;
          unit_value?: number | null;
          delivery_date?: string | null;
          manager_name?: string | null;
          proposal_date?: string | null;
          state: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          client_name?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          development_id?: string | null;
          development_name?: string | null;
          monthly_value?: number | null;
          risk_pct?: number | null;
          within_risk?: boolean | null;
          unit_value?: number | null;
          delivery_date?: string | null;
          manager_name?: string | null;
          proposal_date?: string | null;
          state?: Json;
          status?: string;
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
