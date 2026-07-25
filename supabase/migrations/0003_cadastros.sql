create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  risk numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.companies.risk is
  'Risco da poupança da construtora — parâmetro de cálculo do Simulador.';

create index if not exists companies_user_id_idx on public.companies (user_id);

create table if not exists public.developments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists developments_user_id_idx on public.developments (user_id);
create index if not exists developments_company_id_idx on public.developments (company_id);

alter table public.companies enable row level security;
alter table public.developments enable row level security;

drop policy if exists "companies_all_own" on public.companies;
create policy "companies_all_own"
  on public.companies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "developments_all_own" on public.developments;
create policy "developments_all_own"
  on public.developments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

drop trigger if exists developments_set_updated_at on public.developments;
create trigger developments_set_updated_at
  before update on public.developments
  for each row execute function public.set_updated_at();
