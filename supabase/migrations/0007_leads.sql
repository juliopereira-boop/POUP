create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  message text,
  source text not null default 'manual',
  company_id uuid references public.companies (id) on delete set null,
  development_id uuid references public.developments (id) on delete set null,
  status text not null default 'novo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_user_idx on public.leads (user_id);
create index if not exists leads_created_idx on public.leads (created_at desc);

comment on table public.leads is 'Leads captados (gestão + prospecção). Inserts públicos só via Edge Function (service role).';
comment on column public.leads.source is 'landing | whatsapp | meta | manual';
comment on column public.leads.status is 'novo | em_contato | convertido | perdido';

alter table public.leads enable row level security;
drop policy if exists "leads_all_own" on public.leads;
create policy "leads_all_own"
  on public.leads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create table if not exists public.meta_lead_integrations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  page_id text not null,
  page_access_token text not null,
  verify_token text not null,
  company_id uuid references public.companies (id) on delete set null,
  development_id uuid references public.developments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.meta_lead_integrations is
  'Config por usuário para receber leads via webhook do Meta Lead Ads (Page ID/token/verify token).';

alter table public.meta_lead_integrations enable row level security;
drop policy if exists "meta_lead_integrations_all_own" on public.meta_lead_integrations;
create policy "meta_lead_integrations_all_own"
  on public.meta_lead_integrations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists meta_lead_integrations_set_updated_at on public.meta_lead_integrations;
create trigger meta_lead_integrations_set_updated_at
  before update on public.meta_lead_integrations
  for each row execute function public.set_updated_at();
