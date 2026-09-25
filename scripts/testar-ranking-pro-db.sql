-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-ranking-pro-db.sql
--
-- O que este arquivo prova (migration 20260925180000, venda e ranking só Pro):
--   1. registrar venda: Pro pago, teste válido e admin sim; Start, teste
--      vencido e Pro cancelado não — nem chamando a API direto;
--   2. quem não pode registrar continua lendo, editando e apagando as suas;
--   3. participar do ranking: só Pro pago (teste e admin ficam de fora),
--      pela função ou editando o perfil direto;
--   4. qualquer um VÊ o ranking; quem deixa de ser Pro some dele sem perder a
--      escolha, e volta ao reassinar;
--   5. sair é sempre permitido; o plano dos outros não vaza.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20260925150000_ranking.sql
\ir ../supabase/migrations/20260925180000_ranking_so_pro.sql
-- Idempotente.
\ir ../supabase/migrations/20260925180000_ranking_so_pro.sql

-- 01=Pro  02=Start  03=teste válido  04=teste vencido  05=Pro cancelado  08=admin
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@example.invalid', '{}'
  from generate_series(1, 8) n;
insert into public.app_admins (user_id) values ('00000000-0000-4000-8000-000000000008');
insert into public.subscriptions (user_id, status, plan_tier, current_period_end) values
  ('00000000-0000-4000-8000-000000000001', 'active', 'pro', now() + interval '20 days'),
  ('00000000-0000-4000-8000-000000000002', 'active', 'start', now() + interval '20 days'),
  ('00000000-0000-4000-8000-000000000003', 'trialing', 'start', now() + interval '5 days'),
  ('00000000-0000-4000-8000-000000000004', 'trialing', 'start', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000005', 'canceled', 'pro', now() - interval '1 day');

insert into public.profiles (id, full_name, cpf, creci, uf, cidade) values
  ('00000000-0000-4000-8000-000000000001', 'Ana Maria Souza', '52601815906', 'CRECI 1', 'MA', 'São Luís'),
  ('00000000-0000-4000-8000-000000000002', 'Bruno Lima', '08301661305', 'CRECI 2', 'MA', 'São Luís'),
  ('00000000-0000-4000-8000-000000000003', 'Carla Dias', '18609139034', 'CRECI 3', 'MA', 'São Luís'),
  ('00000000-0000-4000-8000-000000000004', 'Diego Alves', '99603082430', 'CRECI 4', 'MA', 'São Luís'),
  ('00000000-0000-4000-8000-000000000005', 'Elisa Rocha', '62819482112', 'CRECI 5', 'MA', 'São Luís'),
  ('00000000-0000-4000-8000-000000000008', 'Admin POUP', '54323194897', 'CRECI 8', 'MA', 'São Luís');

-- Uma venda antiga de B (de quando ele era Pro), gravada pelo sistema.
insert into public.sales (id, user_id, client_cpf, development_name, block, unit, sale_value, sale_date)
values ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '57117777427',
        'Condomínio Z', 1, '101', 250000, current_date - 40);

set local role authenticated;

-- 1. Registrar venda --------------------------------------------------------
create temp table quem_registra (u text, pode boolean);
grant all on quem_registra to authenticated;
insert into quem_registra values ('01', true), ('02', false), ('03', true), ('04', false), ('05', false), ('08', true);

do $$
declare
  r record;
  gravou boolean;
begin
  for r in select * from quem_registra loop
    perform set_config('request.jwt.claims', format('{"sub":"00000000-0000-4000-8000-0000000000%s","role":"authenticated"}', r.u), true);
    assert public.pode_registrar_venda() = r.pode, 'pode_registrar_venda de ' || r.u;
    begin
      insert into public.sales (user_id, client_cpf, development_name, block, unit, sale_value, sale_date)
      values (auth.uid(), '56321223360', 'Village X', 1, '1' || r.u, 300000, current_date);
      gravou := true;
    exception when insufficient_privilege then
      gravou := false;
    end;
    assert gravou = r.pode, format('conta %s: registrou=%s, esperado=%s', r.u, gravou, r.pode);
  end loop;
end $$;

-- 2. B (Start) mantém o que já tinha -----------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.sales) = 1, 'B lê a venda antiga (e só a dele)';
  update public.sales set unit = '102' where id = 'b0000000-0000-4000-8000-000000000001';
  assert (select unit from public.sales where id = 'b0000000-0000-4000-8000-000000000001') = '102', 'B edita a venda antiga';
  begin
    update public.sales set user_id = '00000000-0000-4000-8000-000000000001' where id = 'b0000000-0000-4000-8000-000000000001';
    raise exception 'B não passa a venda para outra conta';
  exception when insufficient_privilege then null;
  end;
  delete from public.sales where id = 'b0000000-0000-4000-8000-000000000001';
  assert (select count(*) from public.sales) = 0, 'B apaga a venda antiga';
end $$;

-- 3. Participar do ranking ---------------------------------------------------
create temp table quem_participa (u text, pode boolean);
grant all on quem_participa to authenticated;
insert into quem_participa values ('01', true), ('02', false), ('03', false), ('04', false), ('05', false), ('08', false);

do $$
declare
  r record;
  entrou boolean;
begin
  for r in select * from quem_participa loop
    perform set_config('request.jwt.claims', format('{"sub":"00000000-0000-4000-8000-0000000000%s","role":"authenticated"}', r.u), true);
    begin
      perform public.participar_do_ranking(true);
      entrou := true;
    exception when others then
      assert sqlerrm = 'plano_pro', format('conta %s recusada com %s', r.u, sqlerrm);
      entrou := false;
    end;
    assert entrou = r.pode, format('conta %s: entrou=%s, esperado=%s', r.u, entrou, r.pode);
    assert (select ranking_participa from public.profiles where id = auth.uid()) = r.pode,
           'participação gravada de ' || r.u;

    -- Pelo atalho (editando o perfil direto) dá o mesmo resultado.
    update public.profiles set ranking_participa = false where id = auth.uid();
    update public.profiles set ranking_participa = true where id = auth.uid();
    assert (select ranking_participa from public.profiles where id = auth.uid()) = r.pode,
           'atalho pelo perfil de ' || r.u;
  end loop;
end $$;

-- Sair é sempre permitido.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.participar_do_ranking(false);

-- O plano dos outros não vaza.
do $$
begin
  begin
    perform public.assinante_pro('00000000-0000-4000-8000-000000000001');
    raise exception 'assinante_pro não é pública';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4. Ver o ranking e sumir dele ----------------------------------------------
-- A (Pro) tem duas vendas comprovadas; C (teste) também tem uma, mas não
-- participa. Vendas gravadas pelo sistema.
reset role;
insert into public.sales (user_id, client_cpf, development_name, block, unit, sale_value, sale_date, comprovante_path)
values
  ('00000000-0000-4000-8000-000000000001', '07924402691', 'Residencial Y', 2, '201', 300000, current_date, '00000000-0000-4000-8000-000000000001/v1/c.pdf'),
  ('00000000-0000-4000-8000-000000000001', '85995289047', 'Residencial Y', 2, '202', 300000, current_date, '00000000-0000-4000-8000-000000000001/v2/c.pdf');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare nomes text;
begin
  select string_agg(nome || ':' || vendas || ':' || eu, ', ' order by posicao) into nomes from public.ranking('cidade', 'mes');
  assert nomes = 'Ana Souza:2:false', 'o Start vê o ranking, sem aparecer nele: ' || coalesce(nomes, 'vazio');
end $$;

-- A deixa de ser Pro: some, mas a escolha fica guardada.
reset role;
update public.subscriptions set plan_tier = 'start' where user_id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.ranking('brasil', 'mes')) = 0, 'quem virou Start some do ranking (até para si)';
  update public.profiles set full_name = 'Ana Maria Souza Lima' where id = auth.uid();
  assert (select ranking_participa from public.profiles where id = auth.uid()), 'editar o perfil não apaga a escolha';
  begin
    perform public.participar_do_ranking(true);
    raise exception 'Start não entra de novo pela função';
  exception when others then
    assert sqlerrm = 'plano_pro', 'reentrada: ' || sqlerrm;
  end;
end $$;

-- Reassinou: volta sem fazer nada.
reset role;
update public.subscriptions set plan_tier = 'pro' where user_id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
begin
  assert (select string_agg(nome || ':' || vendas, ', ') from public.ranking('brasil', 'mes')) = 'Ana Lima:2',
         'reassinou e voltou ao ranking';
end $$;

reset role;
select 'ranking só Pro: todas as verificações passaram' as resultado;
rollback;
