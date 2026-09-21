-- Assinaturas mobile (App Store/Play Store) conciliadas pelo RevenueCat.
-- Stripe continua sendo o provedor da web; uma única linha segue representando
-- o direito efetivo da conta, independentemente de onde ela assinou.

alter table public.subscriptions
  add column if not exists billing_provider text,
  add column if not exists revenuecat_product_id text,
  add column if not exists revenuecat_original_app_user_id text,
  add column if not exists revenuecat_store text,
  add column if not exists revenuecat_environment text,
  add column if not exists revenuecat_event_timestamp_ms bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscriptions_billing_provider_valido'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_billing_provider_valido
      check (billing_provider is null or billing_provider in ('stripe', 'revenuecat'));
  end if;
end;
$$;

comment on column public.subscriptions.billing_provider is
  'Provedor que atualmente determina o acesso: stripe ou revenuecat.';
comment on column public.subscriptions.revenuecat_event_timestamp_ms is
  'Timestamp do último snapshot RevenueCat aplicado; impede regressão por webhook atrasado.';

update public.subscriptions
set billing_provider = 'stripe'
where stripe_subscription_id is not null and billing_provider is null;

create table if not exists public.billing_webhook_events (
  provider text not null,
  event_id text not null,
  event_timestamp_ms bigint not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id),
  check (provider in ('stripe', 'revenuecat')),
  check (length(event_id) between 1 and 255),
  check (event_timestamp_ms > 0)
);

alter table public.billing_webhook_events enable row level security;
revoke all on table public.billing_webhook_events from public, anon, authenticated;
grant select, insert on table public.billing_webhook_events to service_role;

comment on table public.billing_webhook_events is
  'Deduplicação interna de webhooks de cobrança. Sem acesso pelo aplicativo.';

create or replace function public.sync_revenuecat_subscription(
  p_user_id uuid,
  p_status text,
  p_product_id text,
  p_tier text,
  p_storage_limit bigint,
  p_original_app_user_id text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_store text,
  p_environment text,
  p_event_id text,
  p_event_timestamp_ms bigint
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
  v_rows integer;
begin
  if p_user_id is null
    or p_status not in ('active', 'past_due', 'canceled', 'none')
    or (p_tier is not null and p_tier not in ('start', 'pro'))
    or (p_status = 'active' and (p_tier is null or p_product_id is null))
    or p_storage_limit is null or p_storage_limit < 0
    or p_event_id is null or length(p_event_id) not between 1 and 255
    or p_event_timestamp_ms is null or p_event_timestamp_ms <= 0 then
    raise exception 'Estado RevenueCat inválido';
  end if;

  insert into public.billing_webhook_events(provider, event_id, event_timestamp_ms)
  values ('revenuecat', p_event_id, p_event_timestamp_ms)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return false; end if;

  insert into public.subscriptions (
    user_id, status, plan, plan_tier, storage_limit_bytes,
    billing_provider, revenuecat_product_id, revenuecat_original_app_user_id,
    revenuecat_store, revenuecat_environment, revenuecat_event_timestamp_ms,
    current_period_end, cancel_at_period_end, updated_at
  ) values (
    p_user_id, p_status, p_product_id, p_tier, p_storage_limit,
    'revenuecat', p_product_id, p_original_app_user_id,
    p_store, p_environment, p_event_timestamp_ms,
    p_period_end, coalesce(p_cancel_at_period_end, false), now()
  ) on conflict (user_id) do update set
    status = excluded.status,
    plan = excluded.plan,
    plan_tier = excluded.plan_tier,
    storage_limit_bytes = excluded.storage_limit_bytes,
    billing_provider = excluded.billing_provider,
    revenuecat_product_id = excluded.revenuecat_product_id,
    revenuecat_original_app_user_id = excluded.revenuecat_original_app_user_id,
    revenuecat_store = excluded.revenuecat_store,
    revenuecat_environment = excluded.revenuecat_environment,
    revenuecat_event_timestamp_ms = excluded.revenuecat_event_timestamp_ms,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = now()
  where public.subscriptions.revenuecat_event_timestamp_ms <= excluded.revenuecat_event_timestamp_ms
    and not (
      public.subscriptions.billing_provider = 'stripe'
      and public.subscriptions.status in ('active', 'trialing')
      and excluded.status not in ('active')
    );

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.sync_revenuecat_subscription(
  uuid, text, text, text, bigint, text, timestamptz, boolean, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.sync_revenuecat_subscription(
  uuid, text, text, text, bigint, text, timestamptz, boolean, text, text, text, bigint
) to service_role;

-- Mantém o mesmo campo de origem para assinaturas web novas/atualizadas e
-- impede que um cancelamento antigo do Stripe derrube uma assinatura ativa da loja.
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
declare v_rows integer;
begin
  if p_user_id is null or p_tier not in ('start', 'pro')
    or p_status not in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')
    or p_event_created is null or p_event_created <= 0
    or p_price_id is null or p_customer_id is null or p_subscription_id is null
    or p_storage_limit is null or p_storage_limit < 0 then
    raise exception 'Estado de assinatura inválido';
  end if;

  insert into public.subscriptions (
    user_id, status, plan, plan_tier, storage_limit_bytes, billing_provider,
    stripe_customer_id, stripe_subscription_id, current_period_end,
    cancel_at_period_end, stripe_event_created, updated_at
  ) values (
    p_user_id, p_status, p_price_id, p_tier, p_storage_limit, 'stripe',
    p_customer_id, p_subscription_id, p_period_end,
    coalesce(p_cancel_at_period_end, false), p_event_created, now()
  ) on conflict (user_id) do update set
    status = excluded.status,
    plan = excluded.plan,
    plan_tier = excluded.plan_tier,
    storage_limit_bytes = excluded.storage_limit_bytes,
    billing_provider = excluded.billing_provider,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_event_created = excluded.stripe_event_created,
    updated_at = now()
  where public.subscriptions.stripe_event_created <= excluded.stripe_event_created
    and not (
      public.subscriptions.billing_provider = 'revenuecat'
      and public.subscriptions.status = 'active'
      and excluded.status not in ('active', 'trialing')
    );
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.sync_billing_subscription(
  uuid, text, text, text, bigint, text, text, timestamptz, boolean, bigint
) from public, anon, authenticated;
grant execute on function public.sync_billing_subscription(
  uuid, text, text, text, bigint, text, text, timestamptz, boolean, bigint
) to service_role;
