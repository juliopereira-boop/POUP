-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-planos-db.sql
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/0033_exclusao_pendente.sql
\ir ../supabase/migrations/20260916031259_planos_start_pro.sql

do $$
declare
  u uuid := gen_random_uuid();
  synced boolean;
  fn text := 'public.sync_billing_subscription(uuid,text,text,text,bigint,text,text,timestamptz,boolean,bigint)';
begin
  insert into auth.users(id, email, raw_user_meta_data)
    values (u, u::text || '@example.invalid', '{"full_name":"Teste transacional POUP"}');
  update public.profiles set agency = null, cnpj = null where id = u;
  assert not exists(select 1 from public.ai_limits where plano = 'intermed'), 'Intermed mantém cotas';
  assert not has_function_privilege('anon', fn, 'EXECUTE'), 'RPC exposta a anon';
  assert not has_function_privilege('authenticated', fn, 'EXECUTE'), 'RPC exposta ao usuário';
  assert has_function_privilege('service_role', fn, 'EXECUTE'), 'Webhook sem permissão';
  assert has_function_privilege('service_role', 'public.registrar_exclusao_pendente(uuid,text,text)', 'EXECUTE'), 'Fila inacessível';
  assert not has_function_privilege('authenticated', 'public.assign_billing_customer(uuid,text)', 'EXECUTE'), 'Cliente Stripe alterável pelo app';
  assert public.assign_billing_customer(u, 'cus_first') = 'cus_first', 'Cliente não vinculado';
  assert public.assign_billing_customer(u, 'cus_other') = 'cus_first', 'Concorrência trocou cliente';
  begin
    update public.subscriptions set plan_tier = 'intermed' where user_id = u;
    raise exception 'Plano Intermed aceito';
  exception when check_violation then null;
  end;

  synced := public.sync_billing_subscription(u, 'active', 'price_test_pro', 'pro', 26843545600,
    'cus_test', 'sub_test', now() + interval '1 month', false, 200);
  assert synced, 'Primeiro evento ignorado';
  assert public.plano_de_cobranca(u) = 'pro', 'Pro não reconhecido';

  synced := public.sync_billing_subscription(u, 'active', 'price_test_pro', 'pro', 26843545600,
    'cus_test', 'sub_test', now() + interval '1 month', false, 200);
  assert synced, 'Retry falhou';
  assert (select count(*) from public.subscriptions where user_id = u) = 1, 'Retry duplicou registro';

  synced := public.sync_billing_subscription(u, 'canceled', 'price_test_pro', 'pro', 0,
    'cus_test', 'sub_test', now(), false, 300);
  assert synced, 'Cancelamento ignorado';
  synced := public.sync_billing_subscription(u, 'active', 'price_test_start', 'start', 5368709120,
    'cus_test', 'sub_test', now(), false, 100);
  assert not synced, 'Evento atrasado sobrescreveu cancelamento';
  assert (select status from public.subscriptions where user_id = u) = 'canceled', 'Reativação indevida';
  assert public.plano_de_cobranca(u) = 'nenhum', 'Cancelado conserva cota';

  synced := public.sync_billing_subscription(u, 'active', 'price_test_start', 'start', 5368709120,
    'cus_test', 'sub_test', now(), false, 400);
  assert synced and public.plano_de_cobranca(u) = 'start', 'Start não reconhecido';
  begin
    perform public.sync_billing_subscription(u, 'active', 'price_unknown', 'intermed', 0,
      'cus_test', 'sub_test', now(), false, 500);
    raise exception 'RPC aceitou plano inválido';
  exception when raise_exception then
    if sqlerrm <> 'Estado de assinatura inválido' then raise; end if;
  end;
  assert public.plano_de_cobranca(u) = 'start', 'Erro alterou o plano';
  raise notice 'Regras de planos, campos opcionais, RPC, permissões, retry e ordem: OK';
end;
$$;
rollback;
