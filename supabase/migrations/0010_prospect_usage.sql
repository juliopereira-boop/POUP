-- Controle de uso da Prospecção Ativa: limita quantos leads o corretor pode
-- puxar por período (manhã/tarde) por dia. Um registro por (usuário, dia,
-- período), com o total já usado.
--
-- Rode DEPOIS da migration 0009.

create table if not exists public.prospect_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  dia date not null,
  periodo text not null, -- 'manha' | 'tarde'
  usados integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, dia, periodo)
);

alter table public.prospect_usage enable row level security;

create policy "prospect_usage_all_own" on public.prospect_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
