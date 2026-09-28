-- ===========================================================================
-- MUDANÇAS DE PLANO: POR QUE O CORRETOR QUIS DESCER DE PLANO OU CANCELAR
-- ===========================================================================
-- A tela "Planos" (sempre disponível no app) pede o motivo antes de mudar do
-- Pro para o Start ou de cancelar. O motivo fica AQUI, para o POUP entender o
-- que perde cliente — "está caro" pede uma resposta, "faltou uma função" pede
-- outra.
--
-- É o registro da INTENÇÃO: a troca em si acontece no portal de pagamento
-- (web) ou na loja (iPhone/Android), e a assinatura continua vindo de lá.
--
-- O corretor grava e lê só os dele; o admin do POUP lê todos.
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================

create table if not exists public.mudancas_de_plano (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- De onde saiu: plano pago atual ou o teste gratuito.
  de text not null check (de in ('teste', 'start', 'pro', 'nenhum')),
  -- Para onde quis ir. 'cancelar' = encerrar a assinatura.
  para text not null check (para in ('start', 'pro', 'cancelar')),
  motivo text not null check (motivo in (
    'caro', 'nao_uso_pro', 'pouco_uso', 'faltou_funcao', 'problema_tecnico', 'outro_app', 'outro'
  )),
  comentario text check (comentario is null or char_length(comentario) <= 500),
  plataforma text check (plataforma is null or plataforma in ('web', 'ios', 'android')),
  criada_em timestamptz not null default now(),
  -- "Outro" sem explicar não ajuda ninguém.
  constraint mudancas_de_plano_outro_explica check (motivo <> 'outro' or char_length(btrim(coalesce(comentario, ''))) >= 3)
);

create index if not exists mudancas_de_plano_por_data on public.mudancas_de_plano (criada_em desc);

alter table public.mudancas_de_plano enable row level security;

revoke all on public.mudancas_de_plano from public, anon;
grant select, insert on public.mudancas_de_plano to authenticated;
grant all on public.mudancas_de_plano to service_role;

drop policy if exists "mudancas_de_plano_insert_propria" on public.mudancas_de_plano;
create policy "mudancas_de_plano_insert_propria" on public.mudancas_de_plano
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "mudancas_de_plano_select_propria_ou_admin" on public.mudancas_de_plano;
create policy "mudancas_de_plano_select_propria_ou_admin" on public.mudancas_de_plano
  for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

comment on table public.mudancas_de_plano is
  'Motivo informado pelo corretor ao descer de plano (Pro → Start) ou cancelar, na tela Planos.';

-- ===========================================================================
-- CONFERÊNCIA (como admin)
--   select motivo, count(*) from public.mudancas_de_plano
--    where criada_em > now() - interval '30 days' group by motivo order by 2 desc;
-- ===========================================================================
