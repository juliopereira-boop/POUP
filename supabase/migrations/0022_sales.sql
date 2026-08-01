-- ===========================================================================
-- 0022: VENDAS REALIZADAS
-- ===========================================================================
-- Historico de vendas fechadas do corretor. A venda nasce de uma simulacao
-- (botao "Venda realizada" no relatorio) ou de um cadastro manual.
--
-- Duas decisoes importantes:
--
-- 1. O HISTORICO NAO PODE SUMIR. As referencias para simulacao e lead sao
--    "on delete set null": apagar a simulacao nao apaga a venda. Os nomes de
--    empresa e empreendimento sao gravados como snapshot na propria venda, por
--    isso company_id/development_id ficam SEM chave estrangeira (mesmo padrao
--    de public.simulations) - o relatorio de vendas antigas continua correto
--    mesmo depois de o cadastro ser renomeado ou removido.
--
-- 2. UMA SIMULACAO GERA NO MAXIMO UMA VENDA, garantido por indice unico
--    parcial em simulation_id (vendas manuais tem simulation_id nulo e nao
--    conflitam entre si).
--
-- O status da simulacao de origem ('venda_realizada') e atualizado pelo APP,
-- nao por esta migration.
--
-- Migration idempotente: pode ser executada mais de uma vez.
-- ===========================================================================

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  simulation_id uuid references public.simulations (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,

  client_name text not null,
  client_cpf text,
  -- Coluna gerada: so os digitos do CPF. Existe para a busca funcionar tanto
  -- com o CPF digitado formatado quanto sem pontuacao.
  client_cpf_digits text generated always as (
    nullif(regexp_replace(coalesce(client_cpf, ''), '[^0-9]+', '', 'g'), '')
  ) stored,
  client_phone text,
  client_email text,

  company_id uuid,
  company_name text,
  development_id uuid,
  development_name text,
  block integer,
  unit text,

  sale_value numeric not null,
  financed_value numeric,
  subsidy_value numeric,
  fgts_value numeric,
  own_resources_value numeric,

  commission_pct numeric,
  commission_value numeric,

  sale_date date not null,
  status text not null default 'ativa',
  distrato_date date,
  distrato_reason text,

  origin_started_at timestamptz,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1. COMENTARIOS
-- ---------------------------------------------------------------------------

comment on table public.sales is
  'Vendas realizadas (VGV, comissao, distratos). Sobrevive a exclusao da simulacao e do lead de origem.';
comment on column public.sales.simulation_id is
  'Simulacao que gerou a venda. Nulo quando a venda foi cadastrada a mao ou a simulacao foi apagada.';
comment on column public.sales.lead_id is
  'Lead de origem, quando houver. Nulo se o lead for apagado - a venda permanece.';
comment on column public.sales.client_cpf_digits is
  'Gerada: client_cpf sem pontuacao. Usada na busca por CPF (o usuario pode digitar com ou sem pontos).';
comment on column public.sales.company_id is
  'Construtora. Sem FK de proposito: company_name e snapshot e o historico nao muda se o cadastro sair.';
comment on column public.sales.development_id is
  'Empreendimento. Sem FK de proposito, mesmo motivo de company_id.';
comment on column public.sales.block is
  'Quadra/bloco da unidade vendida.';
comment on column public.sales.sale_value is
  'Valor total da venda (VGV desta unidade). Base de todos os KPIs.';
comment on column public.sales.own_resources_value is
  'Recursos proprios: ato + parcelas pagas direto a construtora.';
comment on column public.sales.commission_pct is
  'Percentual de comissao (0 a 100). O valor em reais fica em commission_value.';
comment on column public.sales.sale_date is
  'Data do fechamento. Data pura (sem hora) para o filtro de periodo nao depender de fuso.';
comment on column public.sales.status is
  'ativa | distratada. Venda distratada sai dos KPIs de venda e entra na taxa de distrato.';
comment on column public.sales.distrato_date is
  'Data do distrato. Preenchida ao marcar status = distratada e limpa ao voltar para ativa.';
comment on column public.sales.origin_started_at is
  'Inicio do atendimento (criacao do lead ou da simulacao). Base do ciclo medio de venda.';

-- ---------------------------------------------------------------------------
-- 2. VALIDACOES
-- ---------------------------------------------------------------------------
-- Constraints nomeadas e criadas com guarda, para a migration poder rodar de
-- novo sobre uma tabela que ja existe.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_sale_value_non_negative'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_sale_value_non_negative check (sale_value >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_commission_pct_range'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_commission_pct_range
      check (commission_pct is null or commission_pct between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_status_valid'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_status_valid check (status in ('ativa', 'distratada'));
  end if;
end
$$;

-- Os demais valores monetarios seguem a mesma regra: nulo ou >= 0.
do $$
declare
  col text;
begin
  foreach col in array array[
    'financed_value',
    'subsidy_value',
    'fgts_value',
    'own_resources_value',
    'commission_value'
  ]
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = 'sales_' || col || '_non_negative'
        and conrelid = 'public.sales'::regclass
    ) then
      execute format(
        'alter table public.sales add constraint %I check (%I is null or %I >= 0)',
        'sales_' || col || '_non_negative', col, col
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. INDICES
-- ---------------------------------------------------------------------------
-- Uma simulacao gera no maximo uma venda. Parcial: vendas manuais (sem
-- simulacao) nao disputam a unicidade.

create unique index if not exists sales_simulation_unique
  on public.sales (simulation_id)
  where simulation_id is not null;

-- Desenhados para os filtros da tela de Vendas Realizadas.
create index if not exists sales_user_date_idx on public.sales (user_id, sale_date desc);
create index if not exists sales_user_company_idx on public.sales (user_id, company_id);
create index if not exists sales_user_development_idx on public.sales (user_id, development_id);
create index if not exists sales_user_status_idx on public.sales (user_id, status);
create index if not exists sales_user_cpf_digits_idx on public.sales (user_id, client_cpf_digits);
create index if not exists sales_lead_idx on public.sales (lead_id);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- Cada corretor le e escreve apenas as proprias vendas.

alter table public.sales enable row level security;

drop policy if exists "sales_all_own" on public.sales;
create policy "sales_all_own"
  on public.sales for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists sales_set_updated_at on public.sales;
create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();
