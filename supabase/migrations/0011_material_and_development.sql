alter table public.developments
  add column if not exists description text;

create table if not exists public.company_materials (
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  drive_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

alter table public.company_materials enable row level security;

create policy "company_materials_all_own" on public.company_materials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger company_materials_set_updated_at
  before update on public.company_materials
  for each row execute function public.set_updated_at();
