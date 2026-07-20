-- =============================================================================
-- POUP — Regras de Negócio (empresa e empreendimento) + campos de perfil
--
-- Rode DEPOIS do 0004. (SQL Editor > cole > Run)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Empresa: regras de negócio
-- (risco já existe em companies.risk — passa a ser exibido nesta seção)
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists max_installments integer,
  add column if not exists max_semiannual integer,
  add column if not exists max_annual integer,
  add column if not exists coincide_installments boolean not null default true;

comment on column public.companies.max_installments is 'Qtd máxima de parcelas mensais.';
comment on column public.companies.max_semiannual is 'Qtd máxima de parcelas semestrais.';
comment on column public.companies.max_annual is 'Qtd máxima de parcelas anuais.';
comment on column public.companies.coincide_installments is
  'Se true, semestrais/anuais podem coincidir com as mensais; se false, pulam um mês.';

-- ---------------------------------------------------------------------------
-- Correspondentes da empresa (1:N)
-- ---------------------------------------------------------------------------
create table if not exists public.correspondents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists correspondents_company_idx on public.correspondents (company_id);
create index if not exists correspondents_user_idx on public.correspondents (user_id);

alter table public.correspondents enable row level security;
drop policy if exists "correspondents_all_own" on public.correspondents;
create policy "correspondents_all_own"
  on public.correspondents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Empreendimento: regras de negócio
-- ---------------------------------------------------------------------------
alter table public.developments
  add column if not exists delivery_date date,
  add column if not exists manager_name text;

comment on column public.developments.delivery_date is 'Data de entrega do empreendimento.';
comment on column public.developments.manager_name is 'Gerente responsável (facultativo).';

-- ---------------------------------------------------------------------------
-- Perfil: gerente da imobiliária
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists agency_manager text;

comment on column public.profiles.agency_manager is 'Gerente da imobiliária do corretor.';
