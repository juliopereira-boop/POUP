-- ===========================================================================
-- 0018: CAMPANHA DE PERIODO DE TESTE (TRIAL) CONTROLADA PELO DONO
-- ===========================================================================
-- O que esta migration faz:
--   1. Cria public.app_admins  -> quem e o dono/admin do app.
--   2. Cria public.trial_campaign (linha unica) -> liga/desliga a campanha e
--      define quantos dias de teste as contas NOVAS recebem.
--   3. Faz o trigger de criacao de usuario (on_auth_user_created) conceder o
--      trial automaticamente quando a campanha esta LIGADA (inclui login com
--      Google, que tambem cria a linha em auth.users no primeiro acesso).
--   4. Quem ja esta em teste continua ate a data dele mesmo que a campanha
--      seja desligada depois (a data fica gravada na propria assinatura).
--
-- Migration idempotente: pode ser executada mais de uma vez sem efeito
-- colateral. Rode inteira no SQL Editor do Supabase.
--
-- >>> DEPOIS DE RODAR, CONFIRA O PASSO "ADMIN" NO FINAL DO ARQUIVO. <<<
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. ADMINS DO APP
-- ---------------------------------------------------------------------------
-- Tabela sem policy de escrita: ninguem se torna admin pelo app.
-- Admin so entra aqui pelo SQL Editor (service role), como no bloco do final.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.app_admins is
  'Contas com poder de administrador (dono do app). Escrita somente via SQL Editor / service role.';

alter table public.app_admins enable row level security;

-- O usuario pode saber apenas se ELE e admin (para o app mostrar o botao).
drop policy if exists "app_admins_select_own" on public.app_admins;
create policy "app_admins_select_own"
  on public.app_admins for select
  to authenticated
  using (auth.uid() = user_id);

-- Sem policies de insert/update/delete => bloqueado para qualquer usuario.

create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_admins a where a.user_id = auth.uid()
  );
$$;

comment on function public.is_app_admin() is
  'true quando o usuario autenticado esta em public.app_admins.';

grant execute on function public.is_app_admin() to authenticated;


-- ---------------------------------------------------------------------------
-- 2. CONFIGURACAO DA CAMPANHA (LINHA UNICA)
-- ---------------------------------------------------------------------------

create table if not exists public.trial_campaign (
  id boolean primary key default true,
  enabled boolean not null default false,
  trial_days integer not null default 7,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.trial_campaign is
  'Linha unica. enabled = campanha de teste gratuito ligada; trial_days = dias concedidos a cada conta nova.';

-- Colunas garantidas mesmo se a tabela já existisse de uma execucao anterior.
alter table public.trial_campaign
  add column if not exists enabled boolean not null default false,
  add column if not exists trial_days integer not null default 7,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Invariantes: linha unica (id sempre true) e 1..90 dias.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trial_campaign_singleton'
  ) then
    alter table public.trial_campaign
      add constraint trial_campaign_singleton check (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'trial_campaign_days_range'
  ) then
    alter table public.trial_campaign
      add constraint trial_campaign_days_range check (trial_days between 1 and 90);
  end if;
end
$$;

-- Estado inicial: campanha DESLIGADA, 7 dias sugeridos.
insert into public.trial_campaign (id, enabled, trial_days)
values (true, false, 7)
on conflict (id) do nothing;

alter table public.trial_campaign enable row level security;

-- Qualquer usuario logado LE (o app precisa saber se a campanha esta ativa).
drop policy if exists "trial_campaign_select_authenticated" on public.trial_campaign;
create policy "trial_campaign_select_authenticated"
  on public.trial_campaign for select
  to authenticated
  using (true);

-- Somente admin ALTERA.
drop policy if exists "trial_campaign_update_admin" on public.trial_campaign;
create policy "trial_campaign_update_admin"
  on public.trial_campaign for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Sem policies de insert/delete => nem admin cria/apaga linha pelo app.
-- Assim a configuracao continua sendo sempre uma unica linha.

grant select, update on public.trial_campaign to authenticated;
grant select on public.app_admins to authenticated;

-- Protege a linha unica e mantem a auditoria de quem mexeu.
create or replace function public.trial_campaign_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id := true;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;

drop trigger if exists trial_campaign_guard on public.trial_campaign;
create trigger trial_campaign_guard
  before update on public.trial_campaign
  for each row execute function public.trial_campaign_guard();


-- ---------------------------------------------------------------------------
-- 3. RASTRO DO TRIAL NA ASSINATURA
-- ---------------------------------------------------------------------------
-- current_period_end e a data em que o teste vence (o app trava o acesso a
-- partir dela). trial_started_at existe para nunca conceder dois trials para
-- a mesma conta.

alter table public.subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_days integer;

comment on column public.subscriptions.trial_started_at is
  'Quando o periodo de teste gratuito foi concedido. Nao nulo = conta ja usou o trial.';
comment on column public.subscriptions.trial_days is
  'Quantidade de dias concedida no trial (foto da campanha no momento do primeiro acesso).';


-- ---------------------------------------------------------------------------
-- 4. CONCESSAO DO TRIAL
-- ---------------------------------------------------------------------------
-- Le a campanha no momento do primeiro acesso. Se estiver LIGADA, grava o
-- vencimento na assinatura. Se estiver DESLIGADA, nao faz nada e a conta cai
-- direto no paywall.

create or replace function public.grant_trial_if_campaign_active(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_days integer;
  v_fallback_limit bigint := 5::bigint * 1024 * 1024 * 1024;
begin
  select tc.enabled, tc.trial_days
    into v_enabled, v_days
  from public.trial_campaign tc
  where tc.id
  limit 1;

  if coalesce(v_enabled, false) is not true then
    return;
  end if;

  v_days := least(90, greatest(1, coalesce(v_days, 7)));

  update public.subscriptions s
  set status = 'trialing',
      plan = 'trial',
      plan_tier = coalesce(s.plan_tier, 'start'),
      -- trial precisa de limite de storage valido, senao o upload quebra.
      storage_limit_bytes = case
        when coalesce(s.storage_limit_bytes, 0) <= 0 then v_fallback_limit
        else s.storage_limit_bytes
      end,
      current_period_end = now() + make_interval(days => v_days),
      cancel_at_period_end = false,
      trial_started_at = now(),
      trial_days = v_days,
      updated_at = now()
  where s.user_id = target
    and s.trial_started_at is null          -- nunca concede dois trials
    and s.status = 'none'                   -- nao mexe em quem ja paga
    and s.stripe_subscription_id is null;   -- nem em quem tem assinatura Stripe
end;
$$;

comment on function public.grant_trial_if_campaign_active(uuid) is
  'Concede o periodo de teste a uma conta nova, se a campanha estiver ligada. Nunca concede duas vezes.';

revoke all on function public.grant_trial_if_campaign_active(uuid) from public;
revoke all on function public.grant_trial_if_campaign_active(uuid) from anon;
revoke all on function public.grant_trial_if_campaign_active(uuid) from authenticated;

-- Trigger de criacao de conta: perfil + assinatura + trial.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, status)
  values (new.id, 'none')
  on conflict (user_id) do nothing;

  -- Periodo de teste do lancamento (se a campanha estiver ligada).
  perform public.grant_trial_if_campaign_active(new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 5. CONTAGEM DE CONTAS EM TESTE (SO ADMIN)
-- ---------------------------------------------------------------------------

create or replace function public.trial_active_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.is_app_admin() then (
      select count(*)::int
      from public.subscriptions s
      where s.status = 'trialing'
        and s.current_period_end is not null
        and s.current_period_end > now()
    )
    else null
  end;
$$;

comment on function public.trial_active_count() is
  'Quantas contas estao em periodo de teste valido agora. Retorna null para quem nao e admin.';

grant execute on function public.trial_active_count() to authenticated;


-- ---------------------------------------------------------------------------
-- 6. SANEAMENTO: TRIAL ANTIGO SEM DATA DE VENCIMENTO
-- ---------------------------------------------------------------------------
-- O app passou a respeitar o vencimento do teste. Linhas legadas com
-- status 'trialing' e current_period_end nulo nao venceriam nunca e, com a
-- nova regra, travariam na hora. Para nao derrubar ninguem de surpresa, elas
-- ganham o prazo da campanha contado de agora.

update public.subscriptions s
set current_period_end = now() + make_interval(
      days => least(90, greatest(1, coalesce(
        (select tc.trial_days from public.trial_campaign tc where tc.id limit 1), 7
      )))
    ),
    trial_started_at = coalesce(s.trial_started_at, now()),
    updated_at = now()
where s.status = 'trialing'
  and s.current_period_end is null;


-- ===========================================================================
-- 7. PASSO OBRIGATORIO: CADASTRAR O DONO COMO ADMIN
-- ===========================================================================
-- O insert abaixo JA RODA e cadastra o e-mail do dono como admin.
-- Se a conta ainda nao existir em auth.users (ou seja, o dono ainda nao fez
-- o primeiro login), ele simplesmente nao cadastra ninguem — nesse caso faca
-- login uma vez no app e rode SO este insert de novo.

insert into public.app_admins (user_id, note)
select u.id, 'dono'
from auth.users u
where lower(u.email) = lower('julio.pereira@sellmyhouse.com.br')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- PARA CADASTRAR OUTRO E-MAIL COMO ADMIN (ou refazer o de cima):
-- copie o bloco abaixo no SQL Editor, TROQUE O E-MAIL entre as aspas e rode.
-- ---------------------------------------------------------------------------
--
-- insert into public.app_admins (user_id, note)
-- select u.id, 'dono'
-- from auth.users u
-- where lower(u.email) = lower('TROQUE_AQUI@seudominio.com.br')
-- on conflict (user_id) do nothing;
--
-- -- Conferir quem e admin hoje:
-- select a.user_id, u.email, a.note, a.created_at
-- from public.app_admins a
-- join auth.users u on u.id = a.user_id;
--
-- -- Remover um admin:
-- delete from public.app_admins
-- where user_id in (
--   select id from auth.users where lower(email) = lower('TROQUE_AQUI@seudominio.com.br')
-- );
--
-- ---------------------------------------------------------------------------
-- LIGAR / DESLIGAR A CAMPANHA PELO BANCO (o normal e fazer pelo app, em
-- Configuracoes > Periodo de teste):
-- ---------------------------------------------------------------------------
--
-- update public.trial_campaign set enabled = true,  trial_days = 7 where id;
-- update public.trial_campaign set enabled = false where id;
-- select * from public.trial_campaign;
--
-- ---------------------------------------------------------------------------
-- DAR O TESTE PARA UMA CONTA QUE JA EXISTIA (opcional)
-- ---------------------------------------------------------------------------
-- O teste e concedido no PRIMEIRO ACESSO. Quem criou a conta antes de a
-- campanha ser ligada nao recebe nada. Para conceder na mao (a campanha
-- precisa estar LIGADA, e nunca concede duas vezes para a mesma conta):
--
-- -- uma conta especifica, por e-mail:
-- select public.grant_trial_if_campaign_active(u.id)
-- from auth.users u
-- where lower(u.email) = lower('TROQUE_AQUI@seudominio.com.br');
--
-- -- todas as contas que ainda nunca tiveram teste nem assinatura:
-- select public.grant_trial_if_campaign_active(s.user_id)
-- from public.subscriptions s
-- where s.status = 'none' and s.trial_started_at is null;
--
-- -- conferir quem esta em teste agora:
-- select u.email, s.trial_days, s.trial_started_at, s.current_period_end
-- from public.subscriptions s
-- join auth.users u on u.id = s.user_id
-- where s.status = 'trialing'
-- order by s.current_period_end;
-- ===========================================================================
