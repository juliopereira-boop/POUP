create table if not exists public.lead_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  cor text not null default '#FF751F',
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_stages_user_idx on public.lead_stages (user_id, ordem);

alter table public.lead_stages enable row level security;

drop policy if exists "lead_stages_all_own" on public.lead_stages;
create policy "lead_stages_all_own" on public.lead_stages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists lead_stages_set_updated_at on public.lead_stages;
create trigger lead_stages_set_updated_at
  before update on public.lead_stages
  for each row execute function public.set_updated_at();

alter table public.leads
  add column if not exists stage_id uuid references public.lead_stages (id) on delete set null,
  add column if not exists cpf text,
  add column if not exists income numeric,
  add column if not exists birth_date date,
  add column if not exists notes text;

create index if not exists leads_stage_idx on public.leads (stage_id);
