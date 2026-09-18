-- Testes somente locais. Toda alteração, inclusive migrations, é revertida.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/0027_financiamento.sql
\ir ../supabase/migrations/0030_remover_prospeccao.sql
\ir ../supabase/migrations/0031_apple_credenciais.sql
\ir ../supabase/migrations/0032_consentimento_captacao.sql
\ir ../supabase/migrations/0033_exclusao_pendente.sql
\ir ../supabase/migrations/20260916031259_planos_start_pro.sql
\ir ../supabase/migrations/20260916184253_seguranca_compartilhamento_servicos.sql
\ir ../supabase/migrations/20260916185809_restringir_rpcs_internas.sql
select to_regclass('public.apple_reauth_challenges') is null as apple_migration_needed \gset
\if :apple_migration_needed
\ir ../supabase/migrations/20260917182632_apple_reautenticacao_multiplataforma.sql
\endif
\ir ../supabase/migrations/20260917183518_storage_rpc_respeita_rls.sql

do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); s uuid := gen_random_uuid();
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (a,a::text||'@example.invalid','{"full_name":"Teste A"}'),
    (b,b::text||'@example.invalid','{"full_name":"Teste B"}');
  insert into public.financing_simulations(id,user_id,input,result,rules_snapshot,rule_version)
    values(s,b,'{}','{}','{}','teste');
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  set local role authenticated;
  begin
    insert into public.financing_share_tokens(simulation_id,user_id,token_hash,expires_at)
      values(s,a,'foreign-simulation-test',now()+interval '1 day');
    raise exception 'Compartilhamento de terceiro permitido';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  set local role authenticated;
  insert into public.financing_share_tokens(simulation_id,user_id,token_hash,expires_at)
    values(s,b,'own-simulation-test',now()+interval '1 day');
  reset role;
  assert not has_table_privilege('authenticated','public.apple_credentials','SELECT');
  assert not has_table_privilege('authenticated','public.apple_reauth_challenges','SELECT');
  assert not has_table_privilege('anon','public.apple_reauth_challenges','SELECT');
  assert not (select prosecdef from pg_proc where oid='public.user_storage_used(uuid)'::regprocedure);
  assert public.user_storage_used(a)=0;
  assert not has_table_privilege('authenticated','public.financing_simulations','TRUNCATE');
  assert not has_function_privilege('authenticated','public.registrar_exclusao_pendente(uuid,text,text)','EXECUTE');
  assert not has_function_privilege('anon','public.registrar_captacao(uuid,integer)','EXECUTE');
  assert has_function_privilege('service_role','public.registrar_captacao(uuid,integer)','EXECUTE');
  assert not has_function_privilege('authenticated','public.estornar_ia(text,integer)','EXECUTE');
  assert not has_function_privilege('authenticated','public.estornar_ia_servico(uuid,text,integer)','EXECUTE');
  assert has_function_privilege('service_role','public.estornar_ia_servico(uuid,text,integer)','EXECUTE');
  -- Admin com Start não recebe LIA; admin com Pro ativo usa a cota Pro.
  insert into public.app_admins(user_id) values(b);
  update public.subscriptions set plan_tier='start',status='active' where user_id=b;
  assert not (public.consumir_ia('lia_agenda',1)->>'permitido')::boolean;
  update public.subscriptions set plan_tier='pro',status='active' where user_id=b;
  assert (public.consumir_ia('lia_agenda',1)->>'permitido')::boolean;
  perform public.estornar_ia_servico(b,'lia_agenda',1);
  assert (select usados from public.ai_usage where user_id=b and recurso='lia_agenda')=0;
  assert not exists(select 1 from public.ai_limits where plano <> 'pro'
    and recurso in ('lia_escuta','lia_fechamento','lia_agenda') and teto_mes <> 0);
  assert (public.registrar_captacao(a,1)->>'permitido')::boolean;
  assert not (public.registrar_captacao(a,1)->>'permitido')::boolean;
  assert public.registrar_exclusao_pendente(a,'apple','teste') = 1;
  assert public.registrar_exclusao_pendente(a,'apple','teste') = 2;
  raise notice 'Ownership, RLS, privilégios, LIA, captura e fila: OK';
end;
$$;
rollback;
