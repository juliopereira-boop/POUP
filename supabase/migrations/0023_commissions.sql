-- ===========================================================================
-- 0023: COMISSOES
-- ===========================================================================
-- Quatro tabelas, em dois blocos:
--
-- A) COMO A COMISSAO E CALCULADA (fica junto do cadastro da construtora)
--    - public.commission_rules ....... UMA regra por construtora (percentual
--      padrao + parcelamento). Unique em company_id.
--    - public.commission_campaigns ... N campanhas por construtora. Percentual
--      promocional com prazo, que ganha do padrao dentro do periodo.
--
-- B) O QUE O CORRETOR TEM A RECEBER
--    - public.commissions ............ UMA comissao por venda, com o percentual
--      e o valor CONGELADOS na data da venda.
--    - public.commission_installments  as parcelas dessa comissao, com
--      recebimento e nota fiscal.
--
-- Decisoes importantes:
--
-- 1. commissions.sale_id e "on delete cascade" COM UNIQUE. Diferente de
--    sales.simulation_id (que e "set null" porque a venda sobrevive a exclusao
--    da simulacao), uma comissao NAO existe sem a venda: ela e derivada do
--    valor e da data da venda. Deixar comissao orfa produziria "a receber" sem
--    origem nos KPIs, impossivel de conferir ou corrigir pela tela. Apagar a
--    venda apaga a comissao e, em cascata, as parcelas dela.
--
-- 2. Os nomes de construtora, empreendimento e cliente sao SNAPSHOT na propria
--    comissao, e company_id fica SEM chave estrangeira (mesmo padrao de
--    public.sales e public.simulations): renomear ou excluir o cadastro nao
--    reescreve o historico do que ja foi lancado.
--
-- 3. COERENCIA DO RECEBIMENTO garantida pelo banco: status = 'recebida' exige
--    paid_date preenchida (check installments_paid_date_required). Sem isso o
--    filtro por base "recebimento" e o KPI de recebido no periodo teriam linhas
--    recebidas sem data e simplesmente sumiriam da conta - erro silencioso, o
--    pior tipo aqui. O par disso fica no app: voltar para 'pendente' ou
--    'cancelada' limpa paid_date/paid_value.
--
-- 4. O percentual aplicado (pct) e o valor total ficam gravados na comissao.
--    Mudar a regra da construtora depois NAO altera comissao ja lancada.
--
-- Migration idempotente: pode ser executada mais de uma vez.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------------

-- Regra padrao da construtora: uma por empresa (garantido por unique).
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,

  default_pct numeric not null,
  installments_count integer not null default 1,
  installments_split jsonb,
  first_payment_days integer not null default 30,
  interval_days integer not null default 30,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Campanhas: percentual promocional com prazo. N por construtora.
create table if not exists public.commission_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,

  name text not null,
  pct numeric not null,
  starts_on date not null,
  ends_on date not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A comissao de uma venda. Uma por venda (unique em sale_id).
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,

  company_id uuid,
  company_name text,
  development_name text,
  client_name text not null,

  sale_value numeric not null,
  sale_date date not null,

  pct numeric not null,
  source text not null,
  campaign_name text,
  total_value numeric not null,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Parcelas da comissao: vencimento, recebimento e nota fiscal.
create table if not exists public.commission_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  commission_id uuid not null references public.commissions (id) on delete cascade,

  number integer not null,
  due_date date not null,
  value numeric not null,

  status text not null default 'pendente',
  paid_date date,
  paid_value numeric,

  invoice_status text not null default 'nao_emitida',
  invoice_number text,
  invoice_url text,
  invoice_issued_at timestamptz,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. COMENTARIOS
-- ---------------------------------------------------------------------------

comment on table public.commission_rules is
  'Regra de comissao da construtora: percentual padrao e como as parcelas caem. Uma por empresa.';
comment on column public.commission_rules.default_pct is
  'Percentual sobre o valor da unidade (0 a 100). Ex.: 2 = 2%.';
comment on column public.commission_rules.installments_count is
  'Em quantas parcelas a comissao e paga. 1 = pagamento unico.';
comment on column public.commission_rules.installments_split is
  'Array JSON com o percentual de cada parcela, na ordem (ex.: [60, 40]). Nulo = divide igualmente.';
comment on column public.commission_rules.first_payment_days is
  'Dias apos a data da venda para a 1a parcela vencer.';
comment on column public.commission_rules.interval_days is
  'Dias entre uma parcela e a seguinte.';

comment on table public.commission_campaigns is
  'Percentual promocional com prazo. Ganha do padrao da construtora enquanto estiver valendo.';
comment on column public.commission_campaigns.starts_on is
  'Inicio da campanha. Data pura (sem hora) para a vigencia nao depender de fuso.';
comment on column public.commission_campaigns.ends_on is
  'Fim da campanha, inclusivo. Nunca anterior a starts_on.';

comment on table public.commissions is
  'Comissao de uma venda, com percentual e valor congelados na data da venda. Some junto com a venda.';
comment on column public.commissions.sale_id is
  'Venda que originou a comissao. On delete cascade: comissao sem venda nao existe.';
comment on column public.commissions.company_id is
  'Construtora. Sem FK de proposito: company_name e snapshot e o historico nao muda se o cadastro sair.';
comment on column public.commissions.company_name is
  'Snapshot do nome da construtora no momento do lancamento.';
comment on column public.commissions.development_name is
  'Snapshot do nome do empreendimento no momento do lancamento.';
comment on column public.commissions.sale_value is
  'Valor da venda usado como base do calculo (snapshot).';
comment on column public.commissions.sale_date is
  'Data da venda. Data pura (sem hora) para o filtro por periodo nao depender de fuso.';
comment on column public.commissions.pct is
  'Percentual efetivamente aplicado (0 a 100). Congelado: mudar a regra depois nao reescreve isto.';
comment on column public.commissions.source is
  'padrao | campanha | manual - de onde saiu o percentual aplicado.';
comment on column public.commissions.campaign_name is
  'Nome da campanha aplicada, quando source = campanha.';
comment on column public.commissions.total_value is
  'Valor total da comissao em reais. A soma das parcelas deve fechar com este valor.';

comment on table public.commission_installments is
  'Parcelas da comissao: previsto, recebido e nota fiscal.';
comment on column public.commission_installments.number is
  'Ordem de vencimento: 1, 2, 3... Unica dentro da comissao.';
comment on column public.commission_installments.due_date is
  'Vencimento previsto. Data pura (sem hora): parcela vencida e due_date < hoje.';
comment on column public.commission_installments.value is
  'Valor previsto da parcela.';
comment on column public.commission_installments.status is
  'pendente | recebida | cancelada. recebida exige paid_date.';
comment on column public.commission_installments.paid_date is
  'Data do recebimento. Base do filtro por recebimento e do KPI de recebido no periodo.';
comment on column public.commission_installments.paid_value is
  'Valor que entrou de fato. Pode divergir do previsto.';
comment on column public.commission_installments.invoice_status is
  'nao_emitida | emitida | cancelada. A emissao automatica entra depois.';

-- ---------------------------------------------------------------------------
-- 3. VALIDACOES
-- ---------------------------------------------------------------------------
-- Constraints nomeadas e criadas com guarda, para a migration poder rodar de
-- novo sobre tabelas que ja existem.

do $$
begin
  -- commission_rules -------------------------------------------------------
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_rules_default_pct_range'
      and conrelid = 'public.commission_rules'::regclass
  ) then
    alter table public.commission_rules
      add constraint commission_rules_default_pct_range
      check (default_pct between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_rules_installments_count_range'
      and conrelid = 'public.commission_rules'::regclass
  ) then
    alter table public.commission_rules
      add constraint commission_rules_installments_count_range
      check (installments_count between 1 and 24);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_rules_first_payment_days_range'
      and conrelid = 'public.commission_rules'::regclass
  ) then
    alter table public.commission_rules
      add constraint commission_rules_first_payment_days_range
      check (first_payment_days between 0 and 365);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_rules_interval_days_range'
      and conrelid = 'public.commission_rules'::regclass
  ) then
    alter table public.commission_rules
      add constraint commission_rules_interval_days_range
      check (interval_days between 0 and 365);
  end if;

  -- commission_campaigns ---------------------------------------------------
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_campaigns_pct_range'
      and conrelid = 'public.commission_campaigns'::regclass
  ) then
    alter table public.commission_campaigns
      add constraint commission_campaigns_pct_range check (pct between 0 and 100);
  end if;

  -- Campanha que termina antes de comecar nunca vale para nenhuma venda.
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_campaigns_period_valid'
      and conrelid = 'public.commission_campaigns'::regclass
  ) then
    alter table public.commission_campaigns
      add constraint commission_campaigns_period_valid check (ends_on >= starts_on);
  end if;

  -- commissions ------------------------------------------------------------
  if not exists (
    select 1 from pg_constraint
    where conname = 'commissions_pct_range'
      and conrelid = 'public.commissions'::regclass
  ) then
    alter table public.commissions
      add constraint commissions_pct_range check (pct between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commissions_sale_value_non_negative'
      and conrelid = 'public.commissions'::regclass
  ) then
    alter table public.commissions
      add constraint commissions_sale_value_non_negative check (sale_value >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commissions_total_value_non_negative'
      and conrelid = 'public.commissions'::regclass
  ) then
    alter table public.commissions
      add constraint commissions_total_value_non_negative check (total_value >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commissions_source_valid'
      and conrelid = 'public.commissions'::regclass
  ) then
    alter table public.commissions
      add constraint commissions_source_valid
      check (source in ('padrao', 'campanha', 'manual'));
  end if;

  -- commission_installments ------------------------------------------------
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_installments_number_positive'
      and conrelid = 'public.commission_installments'::regclass
  ) then
    alter table public.commission_installments
      add constraint commission_installments_number_positive check (number >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_installments_value_non_negative'
      and conrelid = 'public.commission_installments'::regclass
  ) then
    alter table public.commission_installments
      add constraint commission_installments_value_non_negative check (value >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_installments_paid_value_non_negative'
      and conrelid = 'public.commission_installments'::regclass
  ) then
    alter table public.commission_installments
      add constraint commission_installments_paid_value_non_negative
      check (paid_value is null or paid_value >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_installments_status_valid'
      and conrelid = 'public.commission_installments'::regclass
  ) then
    alter table public.commission_installments
      add constraint commission_installments_status_valid
      check (status in ('pendente', 'recebida', 'cancelada'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_installments_invoice_status_valid'
      and conrelid = 'public.commission_installments'::regclass
  ) then
    alter table public.commission_installments
      add constraint commission_installments_invoice_status_valid
      check (invoice_status in ('nao_emitida', 'emitida', 'cancelada'));
  end if;

  -- Parcela recebida SEM data de recebimento sairia do filtro por recebimento
  -- e do total recebido no periodo: dinheiro que entrou e nao aparece em lugar
  -- nenhum. O banco recusa esse estado.
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_installments_paid_date_required'
      and conrelid = 'public.commission_installments'::regclass
  ) then
    alter table public.commission_installments
      add constraint commission_installments_paid_date_required
      check (status <> 'recebida' or paid_date is not null);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. INDICES
-- ---------------------------------------------------------------------------

-- Uma regra por construtora: o app faz upsert por company_id.
create unique index if not exists commission_rules_company_unique
  on public.commission_rules (company_id);

-- Campanhas da construtora em ordem de vigencia (tela do cadastro).
create index if not exists commission_campaigns_user_company_start_idx
  on public.commission_campaigns (user_id, company_id, starts_on);

-- Uma comissao por venda: a criacao a partir da venda e idempotente.
create unique index if not exists commissions_sale_unique
  on public.commissions (sale_id);

create index if not exists commissions_user_sale_date_idx
  on public.commissions (user_id, sale_date desc);
create index if not exists commissions_user_company_idx
  on public.commissions (user_id, company_id);

-- Numeracao das parcelas nao repete dentro da comissao.
create unique index if not exists commission_installments_number_unique
  on public.commission_installments (commission_id, number);

-- Desenhados para os filtros da tela de Comissoes (base vencimento, status e
-- base recebimento, nessa ordem de uso).
create index if not exists commission_installments_commission_idx
  on public.commission_installments (commission_id);
create index if not exists commission_installments_user_due_idx
  on public.commission_installments (user_id, due_date);
create index if not exists commission_installments_user_status_idx
  on public.commission_installments (user_id, status);
create index if not exists commission_installments_user_paid_idx
  on public.commission_installments (user_id, paid_date);

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
-- Cada corretor le e escreve apenas as proprias linhas, nas quatro tabelas.
-- O user_id e gravado no insert pelo app e conferido pelo with check.

alter table public.commission_rules enable row level security;
alter table public.commission_campaigns enable row level security;
alter table public.commissions enable row level security;
alter table public.commission_installments enable row level security;

drop policy if exists "commission_rules_all_own" on public.commission_rules;
create policy "commission_rules_all_own"
  on public.commission_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "commission_campaigns_all_own" on public.commission_campaigns;
create policy "commission_campaigns_all_own"
  on public.commission_campaigns for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "commissions_all_own" on public.commissions;
create policy "commissions_all_own"
  on public.commissions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "commission_installments_all_own" on public.commission_installments;
create policy "commission_installments_all_own"
  on public.commission_installments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. TRIGGERS
-- ---------------------------------------------------------------------------

drop trigger if exists commission_rules_set_updated_at on public.commission_rules;
create trigger commission_rules_set_updated_at
  before update on public.commission_rules
  for each row execute function public.set_updated_at();

drop trigger if exists commission_campaigns_set_updated_at on public.commission_campaigns;
create trigger commission_campaigns_set_updated_at
  before update on public.commission_campaigns
  for each row execute function public.set_updated_at();

drop trigger if exists commissions_set_updated_at on public.commissions;
create trigger commissions_set_updated_at
  before update on public.commissions
  for each row execute function public.set_updated_at();

drop trigger if exists commission_installments_set_updated_at on public.commission_installments;
create trigger commission_installments_set_updated_at
  before update on public.commission_installments
  for each row execute function public.set_updated_at();
