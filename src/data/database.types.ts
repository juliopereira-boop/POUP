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
          cpf: string | null;
          phone: string | null;
          avatar_url: string | null;
          creci: string | null;
          uf: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          agency?: string | null;
          agency_manager?: string | null;
          cnpj?: string | null;
          cpf?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          creci?: string | null;
          uf?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string | null;
          agency?: string | null;
          agency_manager?: string | null;
          cnpj?: string | null;
          cpf?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          creci?: string | null;
          uf?: string | null;
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
          trial_started_at: string | null;
          trial_days: number | null;
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
          trial_started_at?: string | null;
          trial_days?: number | null;
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
          trial_started_at?: string | null;
          trial_days?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_admins: {
        Row: { user_id: string; note: string | null; created_at: string };
        Insert: { user_id: string; note?: string | null; created_at?: string };
        Update: { note?: string | null };
        Relationships: [];
      };
      trial_campaign: {
        Row: {
          id: boolean;
          enabled: boolean;
          trial_days: number;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          enabled?: boolean;
          trial_days?: number;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          trial_days?: number;
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
          /** Empresa do CATÁLOGO DO SISTEMA (cadastrada pelo admin do POUP). */
          is_catalog: boolean;
          /** URL pública da foto redonda, no bucket `catalog`. */
          photo_url: string | null;
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
          is_catalog?: boolean;
          photo_url?: string | null;
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
          is_catalog?: boolean;
          photo_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      /**
       * Quem adotou qual empresa do catálogo.
       *
       * É o VÍNCULO que faz a empresa do admin aparecer nas listas do corretor —
       * não há cópia de dados, então tudo que o admin corrige reflete na hora.
       * `unique(user_id, company_id)` deixa a adoção idempotente.
       */
      company_adoptions: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          created_at?: string;
        };
        // Nada é editável: adotar/desadotar é insert/delete.
        Update: Record<string, never>;
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
          description: string | null;
          delivery_date: string | null;
          manager_name: string | null;
          /** URL pública da foto redonda, no bucket `catalog`. */
          photo_url: string | null;
          uf: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          name: string;
          description?: string | null;
          delivery_date?: string | null;
          manager_name?: string | null;
          photo_url?: string | null;
          uf?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          name?: string;
          description?: string | null;
          delivery_date?: string | null;
          manager_name?: string | null;
          photo_url?: string | null;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_materials: {
        Row: {
          user_id: string;
          company_id: string;
          drive_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          company_id: string;
          drive_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { drive_url?: string | null; updated_at?: string };
        Relationships: [];
      };
      appointment_types: {
        Row: { id: string; nome: string; cor: string; icone: string | null; ordem: number; ativo: boolean };
        Insert: { id: string; nome: string; cor: string; icone?: string | null; ordem?: number; ativo?: boolean };
        Update: { nome?: string; cor?: string; icone?: string | null; ordem?: number; ativo?: boolean };
        Relationships: [];
      };
      appointment_statuses: {
        Row: { id: string; nome: string; cor: string; ordem: number; ativo: boolean };
        Insert: { id: string; nome: string; cor: string; ordem?: number; ativo?: boolean };
        Update: { nome?: string; cor?: string; ordem?: number; ativo?: boolean };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          type_id: string;
          status_id: string;
          lead_id: string | null;
          company_id: string | null;
          development_id: string | null;
          start_at: string;
          end_at: string | null;
          location: string | null;
          priority: string;
          reminder_minutes: number[];
          source: string;
          completed_at: string | null;
          completed_note: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          type_id: string;
          status_id?: string;
          lead_id?: string | null;
          company_id?: string | null;
          development_id?: string | null;
          start_at: string;
          end_at?: string | null;
          location?: string | null;
          priority?: string;
          reminder_minutes?: number[];
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          type_id?: string;
          status_id?: string;
          lead_id?: string | null;
          company_id?: string | null;
          development_id?: string | null;
          start_at?: string;
          end_at?: string | null;
          location?: string | null;
          priority?: string;
          reminder_minutes?: number[];
          completed_at?: string | null;
          completed_note?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointment_history: {
        Row: {
          id: string;
          appointment_id: string;
          user_id: string;
          action: string;
          old_value: string | null;
          new_value: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          user_id: string;
          action: string;
          old_value?: string | null;
          new_value?: string | null;
          created_at?: string;
        };
        Update: { action?: string };
        Relationships: [];
      };
      lead_stages: {
        Row: {
          id: string;
          user_id: string;
          nome: string;
          cor: string;
          ordem: number;
          ativo: boolean;
          is_agendamento: boolean;
          is_simulacao: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          nome: string;
          cor?: string;
          ordem?: number;
          ativo?: boolean;
          is_agendamento?: boolean;
          is_simulacao?: boolean;
        };
        Update: {
          nome?: string;
          cor?: string;
          ordem?: number;
          ativo?: boolean;
          is_agendamento?: boolean;
          is_simulacao?: boolean;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          phone: string;
          email: string | null;
          message: string | null;
          source: string;
          company_id: string | null;
          development_id: string | null;
          status: string;
          stage_id: string | null;
          cpf: string | null;
          income: number | null;
          birth_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          phone: string;
          email?: string | null;
          message?: string | null;
          source?: string;
          company_id?: string | null;
          development_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          phone?: string;
          email?: string | null;
          message?: string | null;
          source?: string;
          company_id?: string | null;
          development_id?: string | null;
          status?: string;
          stage_id?: string | null;
          cpf?: string | null;
          income?: number | null;
          birth_date?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_campaigns: {
        Row: {
          user_id: string;
          titulo: string;
          subtitulo: string;
          descricao: string;
          beneficios: string[];
          convite: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          titulo: string;
          subtitulo: string;
          descricao?: string;
          beneficios?: string[];
          convite: string;
          updated_at?: string;
        };
        Update: {
          titulo?: string;
          subtitulo?: string;
          descricao?: string;
          beneficios?: string[];
          convite?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          user_id: string;
          simulation_id: string | null;
          lead_id: string | null;
          client_name: string;
          client_cpf: string | null;
          /** Gerada pelo banco: só os dígitos de `client_cpf`. Somente leitura. */
          client_cpf_digits: string | null;
          client_phone: string | null;
          client_email: string | null;
          company_id: string | null;
          company_name: string | null;
          development_id: string | null;
          development_name: string | null;
          block: number | null;
          unit: string | null;
          sale_value: number;
          financed_value: number | null;
          subsidy_value: number | null;
          fgts_value: number | null;
          own_resources_value: number | null;
          commission_pct: number | null;
          commission_value: number | null;
          sale_date: string;
          status: string;
          distrato_date: string | null;
          distrato_reason: string | null;
          origin_started_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          simulation_id?: string | null;
          lead_id?: string | null;
          client_name: string;
          client_cpf?: string | null;
          client_phone?: string | null;
          client_email?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          development_id?: string | null;
          development_name?: string | null;
          block?: number | null;
          unit?: string | null;
          sale_value: number;
          financed_value?: number | null;
          subsidy_value?: number | null;
          fgts_value?: number | null;
          own_resources_value?: number | null;
          commission_pct?: number | null;
          commission_value?: number | null;
          sale_date: string;
          status?: string;
          distrato_date?: string | null;
          distrato_reason?: string | null;
          origin_started_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          simulation_id?: string | null;
          lead_id?: string | null;
          client_name?: string;
          client_cpf?: string | null;
          client_phone?: string | null;
          client_email?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          development_id?: string | null;
          development_name?: string | null;
          block?: number | null;
          unit?: string | null;
          sale_value?: number;
          financed_value?: number | null;
          subsidy_value?: number | null;
          fgts_value?: number | null;
          own_resources_value?: number | null;
          commission_pct?: number | null;
          commission_value?: number | null;
          sale_date?: string;
          status?: string;
          distrato_date?: string | null;
          distrato_reason?: string | null;
          origin_started_at?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      commission_rules: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          default_pct: number;
          installments_count: number;
          /** Percentual de cada parcela, na ordem (ex.: `[60, 40]`). Nulo = divide igual. */
          installments_split: Json | null;
          first_payment_days: number;
          interval_days: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          default_pct: number;
          installments_count?: number;
          installments_split?: Json | null;
          first_payment_days?: number;
          interval_days?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          default_pct?: number;
          installments_count?: number;
          installments_split?: Json | null;
          first_payment_days?: number;
          interval_days?: number;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      commission_campaigns: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          name: string;
          pct: number;
          starts_on: string;
          ends_on: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          name: string;
          pct: number;
          starts_on: string;
          ends_on: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          pct?: number;
          starts_on?: string;
          ends_on?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      commissions: {
        Row: {
          id: string;
          user_id: string;
          sale_id: string;
          company_id: string | null;
          company_name: string | null;
          development_name: string | null;
          client_name: string;
          sale_value: number;
          sale_date: string;
          pct: number;
          source: string;
          campaign_name: string | null;
          total_value: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sale_id: string;
          company_id?: string | null;
          company_name?: string | null;
          development_name?: string | null;
          client_name: string;
          sale_value: number;
          sale_date: string;
          pct: number;
          source: string;
          campaign_name?: string | null;
          total_value: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          company_name?: string | null;
          development_name?: string | null;
          client_name?: string;
          sale_value?: number;
          sale_date?: string;
          pct?: number;
          source?: string;
          campaign_name?: string | null;
          total_value?: number;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      commission_installments: {
        Row: {
          id: string;
          user_id: string;
          commission_id: string;
          number: number;
          due_date: string;
          value: number;
          status: string;
          paid_date: string | null;
          paid_value: number | null;
          invoice_status: string;
          invoice_number: string | null;
          invoice_url: string | null;
          invoice_issued_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          commission_id: string;
          number: number;
          due_date: string;
          value: number;
          status?: string;
          paid_date?: string | null;
          paid_value?: number | null;
          invoice_status?: string;
          invoice_number?: string | null;
          invoice_url?: string | null;
          invoice_issued_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          number?: number;
          due_date?: string;
          value?: number;
          status?: string;
          paid_date?: string | null;
          paid_value?: number | null;
          invoice_status?: string;
          invoice_number?: string | null;
          invoice_url?: string | null;
          invoice_issued_at?: string | null;
          notes?: string | null;
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
      is_app_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      trial_active_count: {
        Args: Record<string, never>;
        Returns: number | null;
      };
      /**
       * Concede o período de teste ao PRÓPRIO usuário autenticado.
       * Sem argumentos de propósito: o alvo é sempre `auth.uid()`, então um
       * usuário não consegue conceder trial para outro.
       * Retorna `true` somente quando concedeu agora (o app deve reconsultar
       * a assinatura); `false` quando nada mudou.
       */
      ensure_my_trial: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
