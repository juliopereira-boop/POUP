-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-comprovante-db.sql
--
-- O que este arquivo prova (migration 20260928120000, comprovante do sinal):
--   1. anexado e ainda não conferido: 'comprovante_em_analise', não pontua;
--   2. data do pagamento dentro da tolerância e valor = sinal da simulação:
--      pontua; fora da tolerância, um centavo a mais ou texto que não parece
--      comprovante: 'comprovante_nao_confere';
--   3. a conferência acompanha a venda de agora: trocou o arquivo, mudou a data
--      da venda ou o sinal da simulação, o resultado muda;
--   4. venda sem sinal fica em análise (a auditoria decide) e a validação da
--      auditoria passa por cima;
--   5. o corretor não lê nem escreve o que foi lido;
--   6. a auditoria vê o sinal e o que foi lido.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20260925150000_ranking.sql
\ir ../supabase/migrations/20260925180000_ranking_so_pro.sql
\ir ../supabase/migrations/20260928120000_comprovante_do_sinal.sql
-- Idempotente.
\ir ../supabase/migrations/20260928120000_comprovante_do_sinal.sql

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'u1@example.invalid', '{}'),
  ('00000000-0000-4000-8000-000000000008', 'u8@example.invalid', '{}');
insert into public.app_admins (user_id) values ('00000000-0000-4000-8000-000000000008');
insert into public.subscriptions (user_id, status, plan_tier, current_period_end) values
  ('00000000-0000-4000-8000-000000000001', 'active', 'pro', now() + interval '20 days');
insert into public.profiles (id, full_name, cpf, creci, uf, cidade, ranking_participa) values
  ('00000000-0000-4000-8000-000000000001', 'Ana Maria Souza', '52601815906', 'CRECI 1', 'MA', 'São Luís', true),
  ('00000000-0000-4000-8000-000000000008', 'Admin POUP', '54323194897', 'CRECI 8', 'MA', 'São Luís', false);

insert into public.simulations (id, user_id, state) values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '{"ato": "R$ 4.000,00"}'),
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '{"ato": ""}');

-- V1: da simulação 1 (sinal de 4 mil), fechada ontem, com comprovante.
-- V2: da simulação 2 (sem sinal), com comprovante.
insert into public.sales (id, user_id, simulation_id, client_cpf, development_name, block, unit, sale_value, sale_date, comprovante_path)
values
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001',
   '57117777427', 'Village das Estrelas', 1, '101', 250000, current_date - 1,
   '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/1-pix.pdf'),
  ('a1000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002',
   '56321223360', 'Village das Estrelas', 2, '202', 250000, current_date - 1,
   '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002/1-pix.jpg');

create temp view sit as
  select sale_id, situacao from public.ranking_situacao_das_vendas(current_date - 30, current_date);

create or replace function pg_temp.situacao(p uuid) returns text language sql as $$
  select situacao from sit where sale_id = p
$$;

create or replace function pg_temp.ler(p_datas date[], p_valores numeric[], p_parece boolean default true,
                                       p_path text default '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/1-pix.pdf')
returns void language sql as $$
  insert into public.ranking_comprovacoes (sale_id, comprovante_path, origem, parece_comprovante, datas, valores)
  values ('a1000000-0000-4000-8000-000000000001', p_path, 'pdf', p_parece, p_datas, p_valores)
  on conflict (sale_id) do update set comprovante_path = excluded.comprovante_path, parece_comprovante = excluded.parece_comprovante,
    datas = excluded.datas, valores = excluded.valores, lido_em = now();
$$;

do $$
declare v1 uuid := 'a1000000-0000-4000-8000-000000000001';
begin
  -- 1. Anexado, sem conferência.
  assert pg_temp.situacao(v1) = 'comprovante_em_analise', '1: ' || pg_temp.situacao(v1);

  -- 2. Fecha: data do pagamento = data da venda; valor = sinal.
  perform pg_temp.ler(array[current_date - 1], array[4000.00, 12.5]);
  assert pg_temp.situacao(v1) = 'conta', '2a: ' || pg_temp.situacao(v1);
  -- Tolerância: 3 dias antes e 3 depois fecham; 4 não.
  perform pg_temp.ler(array[current_date - 4], array[4000]);
  assert pg_temp.situacao(v1) = 'conta', '2b (3 dias antes): ' || pg_temp.situacao(v1);
  perform pg_temp.ler(array[current_date + 2], array[4000]);
  assert pg_temp.situacao(v1) = 'conta', '2c (3 dias depois): ' || pg_temp.situacao(v1);
  perform pg_temp.ler(array[current_date - 5], array[4000]);
  assert pg_temp.situacao(v1) = 'comprovante_nao_confere', '2d (4 dias): ' || pg_temp.situacao(v1);
  -- Um centavo a mais não é o sinal.
  perform pg_temp.ler(array[current_date - 1], array[4000.01]);
  assert pg_temp.situacao(v1) = 'comprovante_nao_confere', '2e (centavo): ' || pg_temp.situacao(v1);
  -- Data e valor certos em algo que não parece comprovante de pagamento.
  perform pg_temp.ler(array[current_date - 1], array[4000], false);
  assert pg_temp.situacao(v1) = 'comprovante_nao_confere', '2f (não parece): ' || pg_temp.situacao(v1);
  -- Nada lido (foto ilegível): não confere.
  perform pg_temp.ler('{}', '{}');
  assert pg_temp.situacao(v1) = 'comprovante_nao_confere', '2g (vazio): ' || pg_temp.situacao(v1);

  -- 3. A conferência acompanha a venda de agora.
  perform pg_temp.ler(array[current_date - 1], array[4000]);
  assert pg_temp.situacao(v1) = 'conta', '3a';
  update public.sales set comprovante_path = '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/2-outro.pdf'
   where id = v1;
  assert pg_temp.situacao(v1) = 'comprovante_em_analise', '3b (trocou o arquivo): ' || pg_temp.situacao(v1);
  update public.sales set comprovante_path = '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/1-pix.pdf'
   where id = v1;
  update public.sales set sale_date = current_date - 20 where id = v1;
  assert pg_temp.situacao(v1) = 'comprovante_nao_confere', '3c (mudou a data da venda): ' || pg_temp.situacao(v1);
  update public.sales set sale_date = current_date - 1 where id = v1;
  update public.simulations set state = '{"ato": "R$ 5.000,00"}' where id = '51000000-0000-4000-8000-000000000001';
  assert pg_temp.situacao(v1) = 'comprovante_nao_confere', '3d (mudou o sinal): ' || pg_temp.situacao(v1);
  update public.simulations set state = '{"ato": "R$ 4.000,00"}' where id = '51000000-0000-4000-8000-000000000001';
  assert pg_temp.situacao(v1) = 'conta', '3e';
  -- Tirou o comprovante: volta a faltar.
  update public.sales set comprovante_path = null where id = v1;
  assert pg_temp.situacao(v1) = 'sem_comprovante', '3f: ' || pg_temp.situacao(v1);
  update public.sales set comprovante_path = '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/1-pix.pdf'
   where id = v1;

  -- 4. Sem sinal na simulação: em análise, mesmo com leitura.
  insert into public.ranking_comprovacoes (sale_id, comprovante_path, origem, parece_comprovante, datas, valores)
  values ('a1000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002/1-pix.jpg',
          'imagem', true, array[current_date - 1], array[0]);
  assert pg_temp.situacao('a1000000-0000-4000-8000-000000000002') = 'comprovante_em_analise', '4a';
  -- A auditoria valida à mão: passa a contar.
  insert into public.ranking_revisoes (sale_id, decisao, revisado_por)
  values ('a1000000-0000-4000-8000-000000000002', 'valida', '00000000-0000-4000-8000-000000000008');
  assert pg_temp.situacao('a1000000-0000-4000-8000-000000000002') = 'conta', '4b';
  -- Validação também vale para o que não confere.
  perform pg_temp.ler(array[current_date - 1], array[1]);
  assert pg_temp.situacao(v1) = 'comprovante_nao_confere', '4c';
  insert into public.ranking_revisoes (sale_id, decisao, revisado_por)
  values (v1, 'valida', '00000000-0000-4000-8000-000000000008');
  assert pg_temp.situacao(v1) = 'conta', '4d';
  delete from public.ranking_revisoes where sale_id = v1;
end $$;

-- 5. O corretor não lê nem escreve a leitura.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform 1 from public.ranking_comprovacoes;
    raise exception 'corretor leu a leitura';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ranking_comprovacoes (sale_id, comprovante_path, origem, parece_comprovante, datas, valores)
    values ('a1000000-0000-4000-8000-000000000001', 'x', 'pdf', true, array[current_date], array[4000]);
    raise exception 'corretor gravou a leitura';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ranking_conferencia(null, 'x', current_date, 1);
    raise exception 'corretor chamou a regra da conferência';
  exception when insufficient_privilege then null;
  end;
  -- O corretor vê só a situação.
  assert (select situacao from public.meu_ranking('ano') where sale_id = 'a1000000-0000-4000-8000-000000000001')
         = 'comprovante_nao_confere', '5: meu_ranking';
  begin
    perform * from public.ranking_auditoria('mes');
    raise exception 'corretor abriu a auditoria';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 6. A auditoria vê o sinal e o que foi lido.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
do $$
declare a record;
begin
  select * into a from public.ranking_auditoria('ano') where sale_id = 'a1000000-0000-4000-8000-000000000001';
  assert found, '6: venda que não confere entra na auditoria';
  assert a.situacao = 'comprovante_nao_confere', '6: situação';
  assert a.sinal = 4000, '6: sinal da simulação';
  assert a.lido_valores = array[1]::numeric[] and a.lido_datas = array[current_date - 1], '6: o que foi lido';
end $$;

reset role;
rollback;
\echo 'comprovante do sinal: tudo certo'
