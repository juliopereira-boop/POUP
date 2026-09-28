-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-documento-db.sql
--
-- O que este arquivo prova (migration 20260928150000, documento do cliente):
--   1. comprovante confere mas falta o documento: 'sem_documento';
--   2. documento anexado sem conferência: 'documento_em_analise';
--   3. o CPF lido é o CPF da venda: pontua; outro CPF, ou algo que não parece
--      documento: 'documento_nao_confere';
--   4. acompanha a venda de agora: trocou o arquivo ou editou o CPF do cliente;
--   5. o hash do banco é o mesmo da Edge Function (sha256 dos 11 dígitos);
--   6. a validação da auditoria passa por cima;
--   7. o corretor não lê a leitura; a auditoria vê "confere" e quantos CPFs,
--      nunca o número.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20260925150000_ranking.sql
\ir ../supabase/migrations/20260925180000_ranking_so_pro.sql
\ir ../supabase/migrations/20260928120000_comprovante_do_sinal.sql
\ir ../supabase/migrations/20260928150000_documento_do_cliente.sql
-- Idempotente.
\ir ../supabase/migrations/20260928150000_documento_do_cliente.sql

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
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '{"ato": "R$ 4.000,00"}');

-- A venda, com o comprovante do sinal já conferido (fecha data e valor).
insert into public.sales (id, user_id, simulation_id, client_cpf, development_name, block, unit, sale_value, sale_date, comprovante_path)
values ('a1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001',
        '571.177.774-27', 'Village das Estrelas', 1, '101', 250000, current_date - 1,
        '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/1-pix.pdf');
insert into public.ranking_comprovacoes (sale_id, comprovante_path, origem, parece_comprovante, datas, valores)
values ('a1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/1-pix.pdf',
        'pdf', true, array[current_date - 1], array[4000]);

create temp view sit as
  select sale_id, situacao from public.ranking_situacao_das_vendas(current_date - 30, current_date);
create or replace function pg_temp.situacao() returns text language sql as $$
  select situacao from sit where sale_id = 'a1000000-0000-4000-8000-000000000001'
$$;
create or replace function pg_temp.ler(p_hashes text[], p_parece boolean default true,
                                       p_path text default '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/1-rg.jpg')
returns void language sql as $$
  insert into public.ranking_documentos (sale_id, documento_path, origem, parece_documento, cpfs_hash)
  values ('a1000000-0000-4000-8000-000000000001', p_path, 'imagem', p_parece, p_hashes)
  on conflict (sale_id) do update set documento_path = excluded.documento_path, parece_documento = excluded.parece_documento,
    cpfs_hash = excluded.cpfs_hash, lido_em = now();
$$;

do $$
declare
  -- sha256 hex de '57117777427' (calculado fora do banco, igual ao da Edge Function).
  h_cliente text := '44961411458b988c648750acaaf17a12db4135b40480c8beaef753b30e5aedb7';
  h_outro text := 'fce61d5af487267ebf5866484758a77ddaafb98c527e568e6a73559601c6c911'; -- '56321223360'
  v uuid := 'a1000000-0000-4000-8000-000000000001';
begin
  -- 5. O mesmo hash dos dois lados.
  assert public.ranking_hash_cpf('57117777427') = h_cliente, '5: hash diferente da Edge Function';
  assert public.ranking_hash_cpf('5711777742') is null, '5: menos de 11 dígitos não tem hash';

  -- 1. Comprovante confere, falta o documento.
  assert pg_temp.situacao() = 'sem_documento', '1: ' || pg_temp.situacao();

  -- 2. Documento anexado, sem conferência.
  update public.sales set documento_path = '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/1-rg.jpg' where id = v;
  assert pg_temp.situacao() = 'documento_em_analise', '2: ' || pg_temp.situacao();

  -- 3. O CPF do documento é o do cliente (no meio de outros CPFs válidos): pontua.
  perform pg_temp.ler(array[h_outro, h_cliente]);
  assert pg_temp.situacao() = 'conta', '3a: ' || pg_temp.situacao();
  perform pg_temp.ler(array[h_outro]);
  assert pg_temp.situacao() = 'documento_nao_confere', '3b (outro CPF): ' || pg_temp.situacao();
  perform pg_temp.ler(array[h_cliente], false);
  assert pg_temp.situacao() = 'documento_nao_confere', '3c (não parece documento): ' || pg_temp.situacao();
  perform pg_temp.ler('{}');
  assert pg_temp.situacao() = 'documento_nao_confere', '3d (nenhum CPF): ' || pg_temp.situacao();

  -- 4. Acompanha a venda de agora.
  perform pg_temp.ler(array[h_cliente]);
  assert pg_temp.situacao() = 'conta', '4a';
  update public.sales set documento_path = '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/2-cnh.pdf' where id = v;
  assert pg_temp.situacao() = 'documento_em_analise', '4b (trocou o arquivo): ' || pg_temp.situacao();
  update public.sales set documento_path = '00000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/1-rg.jpg',
                          client_cpf = '563.212.233-60' where id = v;
  assert pg_temp.situacao() = 'documento_nao_confere', '4c (editou o CPF do cliente): ' || pg_temp.situacao();
  update public.sales set client_cpf = '571.177.774-27' where id = v;
  assert pg_temp.situacao() = 'conta', '4d';

  -- O comprovante continua valendo antes do documento: sem ele, é o comprovante que falta.
  update public.ranking_comprovacoes set valores = array[1] where sale_id = v;
  assert pg_temp.situacao() = 'comprovante_nao_confere', '4e: ' || pg_temp.situacao();
  update public.ranking_comprovacoes set valores = array[4000] where sale_id = v;

  -- 6. A auditoria valida à mão.
  perform pg_temp.ler(array[h_outro]);
  insert into public.ranking_revisoes (sale_id, decisao, revisado_por) values (v, 'valida', '00000000-0000-4000-8000-000000000008');
  assert pg_temp.situacao() = 'conta', '6';
  delete from public.ranking_revisoes where sale_id = v;
end $$;

-- 7. Corretor: não lê a leitura nem chama a regra; vê só a situação.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform 1 from public.ranking_documentos;
    raise exception 'corretor leu a leitura do documento';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ranking_documentos (sale_id, documento_path, origem, parece_documento, cpfs_hash)
    values ('a1000000-0000-4000-8000-000000000001', 'x', 'pdf', true, '{}');
    raise exception 'corretor gravou a leitura do documento';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ranking_hash_cpf('57117777427');
    raise exception 'corretor chamou o hash';
  exception when insufficient_privilege then null;
  end;
  assert (select situacao from public.meu_ranking('ano') where sale_id = 'a1000000-0000-4000-8000-000000000001')
         = 'documento_nao_confere', '7: meu_ranking';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
do $$
declare a record;
begin
  select * into a from public.ranking_auditoria('ano') where sale_id = 'a1000000-0000-4000-8000-000000000001';
  assert found, '7: documento que não confere entra na auditoria';
  assert a.situacao = 'documento_nao_confere' and a.documento_conferencia = 'nao_confere', '7: situação';
  assert a.documento_cpfs_encontrados = 1 and a.documento_parece, '7: quantos CPFs e se parece documento';
  assert a.sinal = 4000, '7: o que já existia continua (sinal)';
end $$;

reset role;
rollback;
\echo 'documento do cliente: tudo certo'
