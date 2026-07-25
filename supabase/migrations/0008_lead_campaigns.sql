create table if not exists public.lead_campaigns (
  user_id uuid primary key references auth.users (id) on delete cascade,
  titulo text not null,
  subtitulo text not null,
  convite text not null,
  updated_at timestamptz not null default now()
);

alter table public.lead_campaigns enable row level security;

create policy "lead_campaigns_all_own" on public.lead_campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
