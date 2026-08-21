export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      /*
       * TELEMETRIA DO PRODUTO (0029).
       *
       * Repare no que NÃO existe aqui: nenhuma coluna de texto livre. `etapa` e
       * `resultado` são rótulos curtos do nosso vocabulário e `ref_id` é um
       * uuid do nosso banco. Não há onde um nome de cliente cair, e é de
       * propósito — ver `src/features/analytics/eventos.ts`.
       *
       * Sem `Update`: telemetria que pode ser editada não serve de prova de
       * nada, e o RLS não dá update a ninguém.
       */
      analytics_events: {
        Row: {
          id: number;
          user_id: string;
          evento: string;
          etapa: string | null;
          resultado: string | null;
          duracao_ms: number | null;
          ref_id: string | null;
          criado_em: string;
        };
        Insert: {
          user_id: string;
          evento: string;
          etapa?: string | null;
          resultado?: string | null;
          duracao_ms?: number | null;
          ref_id?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      /*
       * RECADOS DO CORRETOR (0029). Aqui o texto livre é o ponto: é ele
       * descrevendo o problema com as palavras dele, sabendo que está mandando
       * para o suporte. `situacao` só o admin muda.
       */
      feedback: {
        Row: {
          id: string;
          user_id: string;
          tela: string | null;
          etapa: string | null;
          mensagem: string;
          situacao: string;
          criado_em: string;
        };
        Insert: {
          user_id: string;
          tela?: string | null;
          etapa?: string | null;
          mensagem: string;
          situacao?: string;
        };
        Update: { situacao?: string };
        Relationships: [];
      };
      /*
       * TETOS DE USO DE IA (0028). Só leitura pelo app: não existe policy de
       * escrita, então ninguém aumenta o próprio teto pelo aplicativo.
       */
      ai_limits: {
        Row: {
          plano: string;
          recurso: string;
          teto_mes: number;
          teto_minuto: number;
          observacao: string | null;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      /*
       * CONSUMO DE IA (0028). Só leitura, e só do próprio usuário (ou tudo, se
       * admin). A escrita passa obrigatoriamente por `consumir_ia()` — se o
       * dono da linha pudesse escrever, ele zeraria a própria cota.
       */
      ai_usage: {
        Row: {
          user_id: string;
          recurso: string;
          ciclo: string;
          usados: number;
          janela_inicio: string;
          janela_usados: number;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
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
          unit_value_from: number | null;
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
          unit_value_from?: number | null;
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
          unit_value_from?: number | null;
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
      /**
       * Regras de financiamento, versionadas e globais.
       * Leitura para todo autenticado; escrita só para o admin do app (RLS).
       */
      financing_rule_versions: {
        Row: {
          id: string;
          version: string;
          effective_from: string;
          effective_to: string | null;
          status: string;
          payload: Json;
          source: string | null;
          source_url: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          version: string;
          effective_from: string;
          effective_to?: string | null;
          status?: string;
          payload: Json;
          source?: string | null;
          source_url?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          version?: string;
          effective_from?: string;
          effective_to?: string | null;
          status?: string;
          payload?: Json;
          source?: string | null;
          source_url?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      financing_rule_audit: {
        Row: {
          id: string;
          version_id: string | null;
          version: string;
          campo: string;
          valor_anterior: Json | null;
          valor_novo: Json | null;
          motivo: string | null;
          changed_by: string | null;
          changed_at: string;
        };
        Insert: {
          id?: string;
          version_id?: string | null;
          version: string;
          campo: string;
          valor_anterior?: Json | null;
          valor_novo?: Json | null;
          motivo?: string | null;
          changed_by?: string | null;
          changed_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      /**
       * Simulações de financiamento. `rules_snapshot` congela a versão de
       * regras que produziu a linha — mudar a taxa depois não a recalcula.
       */
      financing_simulations: {
        Row: {
          id: string;
          user_id: string;
          lead_id: string | null;
          company_id: string | null;
          development_id: string | null;
          block: number | null;
          unit: string | null;
          client_name: string | null;
          development_name: string | null;
          input: Json;
          result: Json;
          rules_snapshot: Json;
          rule_version: string;
          property_value: number | null;
          financed_value: number | null;
          first_installment: number | null;
          term_months: number | null;
          amortization: string | null;
          eligible: boolean | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          lead_id?: string | null;
          company_id?: string | null;
          development_id?: string | null;
          block?: number | null;
          unit?: string | null;
          client_name?: string | null;
          development_name?: string | null;
          input: Json;
          result: Json;
          rules_snapshot: Json;
          rule_version: string;
          property_value?: number | null;
          financed_value?: number | null;
          first_installment?: number | null;
          term_months?: number | null;
          amortization?: string | null;
          eligible?: boolean | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          lead_id?: string | null;
          company_id?: string | null;
          development_id?: string | null;
          block?: number | null;
          unit?: string | null;
          client_name?: string | null;
          development_name?: string | null;
          input?: Json;
          result?: Json;
          rules_snapshot?: Json;
          rule_version?: string;
          property_value?: number | null;
          financed_value?: number | null;
          first_installment?: number | null;
          term_months?: number | null;
          amortization?: string | null;
          eligible?: boolean | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      financing_share_tokens: {
        Row: {
          id: string;
          simulation_id: string;
          user_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at: string | null;
          views: number;
          last_viewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          simulation_id: string;
          user_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at?: string | null;
          views?: number;
          last_viewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          revoked_at?: string | null;
          views?: number;
          last_viewed_at?: string | null;
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
      /**
       * A versão de regras de financiamento vigente hoje, ou `null`.
       * Devolvendo `null`, o app cai na versão de fábrica (REGRAS_PADRAO),
       * que traz os parâmetros oficiais marcados como pendentes.
       */
      financing_active_rules: {
        Args: Record<string, never>;
        Returns: Json | null;
      };
      /*
       * COTA DE USO DE IA (0028). Nenhuma delas recebe o TETO como argumento:
       * quem descobre o plano e o limite é o próprio banco, por `auth.uid()`.
       * Ver `supabase/functions/_shared/cota.ts`.
       */
      consumir_ia: {
        Args: { p_recurso: string; p_peso?: number };
        Returns: Json;
      };
      estornar_ia: {
        Args: { p_recurso: string; p_peso?: number };
        Returns: undefined;
      };
      /** Consumo do mês e teto do plano, por recurso, para o próprio usuário. */
      meu_uso_ia: {
        Args: Record<string, never>;
        Returns: { recurso: string; usados: number; teto: number }[];
      };
      ciclo_ia_atual: {
        Args: Record<string, never>;
        Returns: string;
      };
      /** Soma leads na cota do período. Soma — não grava um total escolhido. */
      registrar_prospeccao: {
        Args: { p_dia: string; p_periodo: string; p_quantidade: number };
        Returns: number;
      };

      /* RASTREABILIDADE (0029). Todas só respondem para admin. */
      painel_eventos: {
        Args: { p_dias?: number };
        Returns: {
          evento: string;
          total: number;
          pessoas: number;
          erros: number;
          duracao_mediana: number | null;
        }[];
      };
      painel_funil: {
        Args: { p_dias?: number };
        Returns: { marco: string; pessoas: number; ordem: number }[];
      };
      painel_consumo_ia: {
        Args: Record<string, never>;
        Returns: { recurso: string; total: number; pessoas: number; maior: number }[];
      };
      podar_analytics: {
        Args: { p_dias?: number };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
