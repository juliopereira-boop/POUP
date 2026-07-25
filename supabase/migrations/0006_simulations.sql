create table if not exists public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  client_name text,
  company_id uuid,
  company_name text,
  development_id uuid,
  development_name text,
  monthly_value numeric,
  risk_pct numeric,
  within_risk boolean,
  unit_value numeric,

  delivery_date date,
  manager_name text,
  proposal_date date,

  state jsonb not null,

  status text not null default 'simulacao',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists simulations_user_idx on public.simulations (user_id);
create index if not exists simulations_created_idx on public.simulations (created_at desc);
create index if not exists simulations_company_idx on public.simulations (company_id);
create index if not exists simulations_development_idx on public.simulations (development_id);

comment on table public.simulations is
  'Simulações concluídas exibidas em Relatórios. O PDF não é armazenado — é regerado a partir de "state".';
comment on column public.simulations.state is 'SimuladorState completo (JSON) para reabrir/editar e regerar o PDF.';
comment on column public.simulations.proposal_date is 'Data usada como "hoje" na geração original da proposta.';
comment on column public.simulations.status is 'Ciclo de vida: simulacao | venda_realizada (uso futuro).';

alter table public.simulations enable row level security;
drop policy if exists "simulations_all_own" on public.simulations;
create policy "simulations_all_own"
  on public.simulations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists simulations_set_updated_at on public.simulations;
create trigger simulations_set_updated_at
  before update on public.simulations
  for each row execute function public.set_updated_at();
