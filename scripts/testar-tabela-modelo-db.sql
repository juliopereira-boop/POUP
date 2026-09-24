-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-tabela-modelo-db.sql
--
-- O que este arquivo prova (migration 20260925100000, o modelo POUP):
--   1. o preço por unidade é gravado, normalizado e substituído a cada envio;
--   2. formato ruim no preço por unidade é recusado com código legível;
--   3. o CSV do modelo é aceito como arquivo de origem, e o resto continua recusado;
--   4. o bucket passa a aceitar CSV;
--   5. as permissões continuam as mesmas: outro corretor não grava.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20260924150000_blocos_e_unidades.sql
\ir ../supabase/migrations/20260924180000_tabela_de_preco.sql
\ir ../supabase/migrations/20260925100000_tabela_modelo_poup.sql
-- Idempotente: rodar de novo não pode falhar.
\ir ../supabase/migrations/20260925100000_tabela_modelo_poup.sql

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'corretor-a@example.invalid', '{}'),
  ('b0000000-0000-4000-8000-000000000002', 'corretor-b@example.invalid', '{}');
insert into public.companies (id, user_id, name, is_catalog) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Construtora do A', false);
insert into public.developments (id, user_id, company_id, name) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Village do A');

do $$
begin
  assert (select allowed_mime_types from storage.buckets where id = 'tabelas-de-preco')
         @> array['application/pdf', 'text/csv'], 'o bucket aceita PDF e CSV';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1. Tabela só por unidade, vinda do modelo POUP em CSV.
select public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001', '{
  "referencia": "Outubro",
  "regras": [],
  "precos_unidades": [
    {"bloco": " 05 ", "unidade": "104", "vaga": "carro", "area_m2": 40.944, "avaliacao": 236900, "venda": 256280, "lixo": 1},
    {"bloco": "05", "unidade": "001", "vaga": null, "area_m2": null, "avaliacao": null, "venda": "250000.5"}
  ],
  "arquivo": {"path": "a2000000-0000-4000-8000-000000000001/20260925-tabela.csv", "nome": "tabela.csv"}
}'::jsonb);

do $$
declare t public.development_price_tables;
begin
  select * into t from public.development_price_tables where development_id = 'a2000000-0000-4000-8000-000000000001';
  assert jsonb_array_length(t.precos_unidades) = 2, 'as 2 unidades ficam gravadas';
  assert t.precos_unidades->0->>'bloco' = '05', 'o bloco sai sem espaços';
  assert t.precos_unidades->0->>'area_m2' = '40.94', 'a área é arredondada';
  assert t.precos_unidades->0->>'venda' = '256280.00', 'a venda fica como enviada';
  assert t.precos_unidades->1->>'venda' = '250000.50', 'venda em texto numérico é aceita';
  assert not (t.precos_unidades->0 ? 'lixo'), 'chave desconhecida não é gravada';
  assert t.arquivo_path like '%.csv', 'o CSV do modelo é aceito como arquivo de origem';
end $$;

-- Enviar de novo sem preço por unidade LIMPA o preço por unidade (é a tabela inteira).
select public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001',
  '{"referencia": "Novembro", "regras": [{"venda": 1}]}'::jsonb);
do $$
begin
  assert (select precos_unidades from public.development_price_tables
           where development_id = 'a2000000-0000-4000-8000-000000000001') = '[]'::jsonb,
         'sem a chave, o preço por unidade volta a vazio';
end $$;

-- 2 e 3. Recusas.
create temp table casos (nome text, tabela jsonb, erro text) on commit drop;
grant all on casos to authenticated;
insert into casos values
  ('preço por unidade que não é lista', '{"precos_unidades": {"a": 1}}', 'precos_unidades_invalidos'),
  ('item que não é objeto', '{"precos_unidades": [1]}', 'precos_unidades_invalidos'),
  ('sem bloco', '{"precos_unidades": [{"unidade": "101", "venda": 1}]}', 'precos_unidades_invalidos'),
  ('sem unidade', '{"precos_unidades": [{"bloco": "1", "venda": 1}]}', 'precos_unidades_invalidos'),
  ('venda zero', '{"precos_unidades": [{"bloco": "1", "unidade": "101", "venda": 0}]}', 'precos_unidades_invalidos'),
  ('venda em texto', '{"precos_unidades": [{"bloco": "1", "unidade": "101", "venda": "abc"}]}', 'precos_unidades_invalidos'),
  ('vaga desconhecida', '{"precos_unidades": [{"bloco": "1", "unidade": "101", "venda": 1, "vaga": "bike"}]}', 'precos_unidades_invalidos'),
  ('unidade repetida', '{"precos_unidades": [{"bloco": "1", "unidade": "101", "venda": 1}, {"bloco": " 1", "unidade": "101 ", "venda": 2}]}', 'unidade_repetida'),
  ('arquivo .exe', '{"arquivo": {"path": "a2000000-0000-4000-8000-000000000001/x.exe"}}', 'arquivo_invalido'),
  ('CSV de outro empreendimento', '{"arquivo": {"path": "b2000000-0000-4000-8000-000000000002/x.csv"}}', 'arquivo_invalido');
insert into casos
  select 'unidades demais', jsonb_build_object('precos_unidades',
           jsonb_agg(jsonb_build_object('bloco', '1', 'unidade', g::text, 'venda', 1))), 'precos_unidades_demais'
    from generate_series(1, 20001) g;

do $$
declare c record;
begin
  for c in select * from casos loop
    begin
      perform public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001', c.tabela);
      raise exception 'caso "%" deveria ser recusado', c.nome;
    exception when others then
      assert sqlerrm = c.erro, format('caso "%s": esperava %s, recebeu %s', c.nome, c.erro, sqlerrm);
    end;
  end loop;
  assert (select referencia from public.development_price_tables
           where development_id = 'a2000000-0000-4000-8000-000000000001') = 'Novembro',
         'um envio recusado não altera a tabela';
end $$;

-- 4. O CSV no Storage segue a permissão do empreendimento.
insert into storage.objects (bucket_id, name)
values ('tabelas-de-preco', 'a2000000-0000-4000-8000-000000000001/20260925-tabela.csv');

-- 5. Outro corretor.
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001',
      '{"precos_unidades": [{"bloco": "1", "unidade": "101", "venda": 1}]}'::jsonb);
    raise exception 'B não deveria gravar';
  exception when others then
    assert sqlerrm = 'sem_permissao', 'B recebe sem_permissao, recebeu: ' || sqlerrm;
  end;
  assert (select count(*) from storage.objects where name like 'a2000000-%') = 0, 'B não vê o CSV do A';
end $$;

reset role;
select 'modelo POUP: todas as verificações passaram' as resultado;
rollback;
