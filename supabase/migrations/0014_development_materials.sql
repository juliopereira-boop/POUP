create table if not exists public.development_materials (
  user_id uuid not null references auth.users (id) on delete cascade,
  development_id uuid not null references public.developments (id) on delete cascade,
  drive_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, development_id)
);

alter table public.development_materials enable row level security;

drop policy if exists "development_materials_all_own" on public.development_materials;
create policy "development_materials_all_own" on public.development_materials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists development_materials_set_updated_at on public.development_materials;
create trigger development_materials_set_updated_at
  before update on public.development_materials
  for each row execute function public.set_updated_at();
