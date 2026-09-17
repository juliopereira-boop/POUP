-- Dois planos, sem conversão silenciosa de contas de teste nem perda de dados.
-- Se houver Intermed, resolver explicitamente antes de aplicar esta migration.
do $$
begin
  if exists (
    select 1 from public.subscriptions
    where plan_tier is not null and plan_tier not in ('start', 'pro')
  ) then
    raise exception 'Existem assinaturas com plano descontinuado/desconhecido. Revise-as antes de aplicar planos_start_pro.';
  end if;
end;
$$;

alter table public.profiles alter column agency drop not null;
alter table public.profiles alter column cnpj drop not null;

delete from public.ai_limits where plano = 'intermed';

create or replace function public.plano_de_cobranca(p_user uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp stable
as $$
declare
  v_status text;
  v_tier text;
begin
  if p_user is null then return 'nenhum'; end if;
  if exists (select 1 from public.app_admins where user_id = p_user) then return 'admin'; end if;
  select status, plan_tier into v_status, v_tier
    from public.subscriptions where user_id = p_user;
  if v_status = 'trialing' then return 'teste'; end if;
  if v_status = 'active' and v_tier in ('start', 'pro') then return v_tier; end if;
  return 'nenhum';
end;
$$;
revoke all on function public.plano_de_cobranca(uuid) from public, anon, authenticated;
grant execute on function public.plano_de_cobranca(uuid) to service_role;
comment on function public.plano_de_cobranca(uuid) is
  'admin | teste | pro | start | nenhum. Plano desconhecido não concede cota.';

alter table public.subscriptions
  add column if not exists stripe_event_created bigint not null default 0;
comment on column public.subscriptions.stripe_event_created is
  'Timestamp Stripe da última notificação processada; impede regressão por eventos atrasados.';

do $$
begin
  if not exists (select 1 from pg_constraint
    where conname = 'subscriptions_plan_tier_valido' and conrelid = 'public.subscriptions'::regclass) then
    alter table public.subscriptions add constraint subscriptions_plan_tier_valido
      check (plan_tier is null or plan_tier in ('start', 'pro'));
  end if;
end;
$$;

-- Escrita restrita ao webhook com service_role. A ordenação é feita no próprio
-- UPSERT, sob lock da linha: leituras concorrentes no Edge não podem regredir o estado.
create or replace function public.sync_billing_subscription(
  p_user_id uuid,
  p_status text,
  p_price_id text,
  p_tier text,
  p_storage_limit bigint,
  p_customer_id text,
  p_subscription_id text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created bigint
)
returns boolean language plpgsql security invoker
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_user_id is null or p_tier is null or p_tier not in ('start', 'pro')
    or p_status is null or p_status not in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')
    or p_event_created is null or p_event_created <= 0
    or p_price_id is null or p_customer_id is null or p_subscription_id is null
    or p_storage_limit is null or p_storage_limit < 0 then
    raise exception 'Estado de assinatura inválido';
  end if;

  insert into public.subscriptions (
    user_id, status, plan, plan_tier, storage_limit_bytes, stripe_customer_id,
    stripe_subscription_id, current_period_end, cancel_at_period_end, stripe_event_created, updated_at
  ) values (
    p_user_id, p_status, p_price_id, p_tier, p_storage_limit, p_customer_id,
    p_subscription_id, p_period_end, coalesce(p_cancel_at_period_end, false), p_event_created, now()
  ) on conflict (user_id) do update set
    status = excluded.status, plan = excluded.plan, plan_tier = excluded.plan_tier,
    storage_limit_bytes = excluded.storage_limit_bytes,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_event_created = excluded.stripe_event_created, updated_at = now()
  where public.subscriptions.stripe_event_created <= excluded.stripe_event_created;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;
revoke all on function public.sync_billing_subscription(uuid, text, text, text, bigint, text, text, timestamptz, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.sync_billing_subscription(uuid, text, text, text, bigint, text, text, timestamptz, boolean, bigint)
  to service_role;

-- A fila de exclusão existente é uma ferramenta operacional, nunca uma API pública.
grant execute on function public.registrar_exclusao_pendente(uuid, text, text) to service_role;

-- Retém a associação antes do checkout: idempotência Stripe expira, a FK local não.
create or replace function public.assign_billing_customer(p_user_id uuid, p_customer_id text)
returns text language plpgsql security invoker set search_path = ''
as $$
declare v_customer text;
begin
  if p_user_id is null or p_customer_id is null or p_customer_id !~ '^cus_[a-zA-Z0-9]+$' then
    raise exception 'Cliente de cobrança inválido';
  end if;
  insert into public.subscriptions(user_id, stripe_customer_id)
  values(p_user_id, p_customer_id)
  on conflict(user_id) do update
    set stripe_customer_id = coalesce(public.subscriptions.stripe_customer_id, excluded.stripe_customer_id)
  returning stripe_customer_id into v_customer;
  return v_customer;
end;
$$;
revoke all on function public.assign_billing_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.assign_billing_customer(uuid, text) to service_role;
