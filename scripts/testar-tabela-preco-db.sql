-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-tabela-preco-db.sql
--
-- O que este arquivo prova, na ordem:
--   1. o corretor grava e lê a tabela de preço do empreendimento DELE, e o
--      banco guarda só o formato conhecido;
--   2. outro corretor não lê nem escreve; ninguém escreve direto na tabela;
--   3. o catálogo é lido por todos e escrito só pelo admin;
--   4. formato ruim é recusado com um código que o aplicativo traduz;
--   5. a regra de ventilação do bloco é gravada, mantida e validada;
--   6. o PDF no Storage segue as mesmas permissões, pela pasta do empreendimento;
--   7. ninguém sem login alcança a tabela ou a função.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20260924150000_blocos_e_unidades.sql
\ir ../supabase/migrations/20260924180000_tabela_de_preco.sql

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'corretor-a@example.invalid', '{}'),
  ('b0000000-0000-4000-8000-000000000002', 'corretor-b@example.invalid', '{}'),
  ('c0000000-0000-4000-8000-000000000003', 'admin@example.invalid', '{}');
insert into public.app_admins (user_id) values ('c0000000-0000-4000-8000-000000000003');

insert into public.companies (id, user_id, name, is_catalog) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Construtora do A', false),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Construtora do B', false),
  ('c1000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'Construtora do catálogo', true);

insert into public.developments (id, user_id, company_id, name) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Village do A'),
  ('b2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'Village do B'),
  ('c2000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'Village do catálogo');


-- ===========================================================================
-- 1. O CORRETOR A NO EMPREENDIMENTO DELE
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001', '{
  "referencia": "  Setembro  ",
  "regras": [
    {"pavimento": 1, "ventilacao": "mais", "vaga": "moto", "area_m2": 40.944, "avaliacao": 231900, "venda": 244780, "lixo": "x"},
    {"pavimento": 1, "ventilacao": "menos", "vaga": "carro", "area_m2": 40.94, "avaliacao": 231900, "venda": 250280},
    {"pavimento": null, "ventilacao": null, "vaga": null, "area_m2": null, "avaliacao": null, "venda": 199000}
  ],
  "vagas": {"vaga_da_lista": "moto", "vaga_das_demais": "carro", "extra": 1,
            "unidades": [{"bloco": " 02 ", "unidade": "301"}, {"bloco": "02", "unidade": "302"}]},
  "arquivo": {"path": "a2000000-0000-4000-8000-000000000001/20260924-tabela.pdf", "nome": "TABELA Setembro.pdf"}
}'::jsonb);

do $$
declare t public.development_price_tables;
begin
  select * into t from public.development_price_tables
   where development_id = 'a2000000-0000-4000-8000-000000000001';
  assert t.development_id is not null, 'A deveria ler a tabela que salvou';
  assert t.referencia = 'Setembro', 'a referência sai sem espaços nas pontas';
  assert jsonb_array_length(t.regras) = 3, 'as 3 linhas ficam gravadas';
  assert t.regras->0->>'venda' = '244780.00', 'a venda da 1ª linha é a enviada: ' || (t.regras->0->>'venda');
  assert t.regras->0->>'area_m2' = '40.94', 'a área é arredondada em 2 casas';
  assert not (t.regras->0 ? 'lixo'), 'chave desconhecida não é gravada';
  assert t.regras->2->'pavimento' = 'null'::jsonb, 'a linha "qualquer andar" guarda nulo';
  assert t.vagas->>'vaga_da_lista' = 'moto' and t.vagas->>'vaga_das_demais' = 'carro', 'vagas gravadas';
  assert not (t.vagas ? 'extra'), 'chave desconhecida da lista não é gravada';
  assert t.vagas->'unidades'->0->>'bloco' = '02', 'o bloco da lista sai sem espaços';
  assert jsonb_array_length(t.vagas->'unidades') = 2, 'as 2 unidades da lista ficam gravadas';
  assert t.arquivo_nome = 'TABELA Setembro.pdf', 'o nome do PDF fica gravado';
  assert t.atualizado_por = 'a0000000-0000-4000-8000-000000000001', 'quem atualizou é o corretor A';
end $$;

-- Salvar de novo SUBSTITUI a tabela (é a atualização do mês).
select public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001', '{
  "referencia": "Outubro",
  "regras": [{"pavimento": 1, "ventilacao": "mais", "vaga": "moto", "venda": 250000}]
}'::jsonb);

do $$
declare t public.development_price_tables;
begin
  select * into t from public.development_price_tables
   where development_id = 'a2000000-0000-4000-8000-000000000001';
  assert t.referencia = 'Outubro', 'a tabela do mês novo substitui a anterior';
  assert jsonb_array_length(t.regras) = 1, 'as linhas antigas saem';
  assert t.vagas is null and t.arquivo_path is null, 'sem lista e sem PDF no envio, ficam nulos';
end $$;


-- ===========================================================================
-- 2. OUTRO CORRETOR, E ESCRITA DIRETA
-- ===========================================================================
do $$
begin
  begin
    insert into public.development_price_tables (development_id, regras)
    values ('a2000000-0000-4000-8000-000000000001', '[{"venda": "lixo"}]');
    raise exception 'escrita direta na tabela deveria ser recusada';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.development_price_tables set referencia = 'hack';
    raise exception 'update direto deveria ser recusado';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
begin
  assert (select count(*) from public.development_price_tables) = 0, 'B não pode ver a tabela do A';
  begin
    perform public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001', '{"regras": []}'::jsonb);
    raise exception 'B não deveria salvar a tabela do A';
  exception when others then
    assert sqlerrm = 'sem_permissao', 'B recebe sem_permissao, recebeu: ' || sqlerrm;
  end;
  begin
    perform public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001', null);
    raise exception 'B não deveria apagar a tabela do A';
  exception when others then
    assert sqlerrm = 'sem_permissao', 'apagar também exige permissão';
  end;
end $$;


-- ===========================================================================
-- 3. CATÁLOGO
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.salvar_tabela_de_preco('c2000000-0000-4000-8000-000000000003',
  '{"referencia": "Setembro", "regras": [{"venda": 300000}]}'::jsonb);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.development_price_tables
           where development_id = 'c2000000-0000-4000-8000-000000000003') = 1,
         'o corretor lê a tabela do catálogo';
  begin
    perform public.salvar_tabela_de_preco('c2000000-0000-4000-8000-000000000003', '{"regras": []}'::jsonb);
    raise exception 'o corretor não deveria escrever no catálogo';
  exception when others then
    assert sqlerrm = 'sem_permissao', 'catálogo: sem_permissao, recebeu: ' || sqlerrm;
  end;
end $$;


-- ===========================================================================
-- 4. FORMATO RUIM, CÓDIGO LEGÍVEL
-- ===========================================================================
create temp table casos (nome text, tabela jsonb, erro text) on commit drop;
grant all on casos to authenticated;
insert into casos values
  ('linha repetida', '{"regras": [{"pavimento": 1, "venda": 1}, {"pavimento": 1, "venda": 2}]}', 'regra_repetida'),
  ('"qualquer" repetido', '{"regras": [{"venda": 1}, {"venda": 2}]}', 'regra_repetida'),
  ('venda zero', '{"regras": [{"venda": 0}]}', 'regra_invalida'),
  ('venda ausente', '{"regras": [{"pavimento": 1}]}', 'regra_invalida'),
  ('venda em texto', '{"regras": [{"venda": "abc"}]}', 'regra_invalida'),
  ('pavimento quebrado', '{"regras": [{"pavimento": 1.5, "venda": 1}]}', 'regra_invalida'),
  ('pavimento 0', '{"regras": [{"pavimento": 0, "venda": 1}]}', 'regra_invalida'),
  ('ventilação desconhecida', '{"regras": [{"ventilacao": "arejado", "venda": 1}]}', 'regra_invalida'),
  ('vaga desconhecida', '{"regras": [{"vaga": "bike", "venda": 1}]}', 'regra_invalida'),
  ('avaliação negativa', '{"regras": [{"avaliacao": -1, "venda": 1}]}', 'regra_invalida'),
  ('linha que não é objeto', '{"regras": [1]}', 'regra_invalida'),
  ('regras que não são lista', '{"regras": {"venda": 1}}', 'formato_invalido'),
  ('tabela que não é objeto', '[1]', 'formato_invalido'),
  ('referência longa', jsonb_build_object('referencia', repeat('x', 61)), 'referencia_invalida'),
  ('vaga da lista desconhecida', '{"vagas": {"vaga_da_lista": "bike", "unidades": []}}', 'vagas_invalidas'),
  ('vaga das demais desconhecida', '{"vagas": {"vaga_da_lista": "moto", "vaga_das_demais": "bike", "unidades": []}}', 'vagas_invalidas'),
  ('unidade da lista sem bloco', '{"vagas": {"vaga_da_lista": "moto", "unidades": [{"unidade": "301"}]}}', 'vagas_invalidas'),
  ('PDF de outro empreendimento', '{"arquivo": {"path": "b2000000-0000-4000-8000-000000000002/x.pdf"}}', 'arquivo_invalido'),
  ('PDF fora de pasta', '{"arquivo": {"path": "x.pdf"}}', 'arquivo_invalido'),
  ('PDF com subpasta', '{"arquivo": {"path": "a2000000-0000-4000-8000-000000000001/../b2000000-0000-4000-8000-000000000002/x.pdf"}}', 'arquivo_invalido'),
  ('arquivo que não é PDF', '{"arquivo": {"path": "a2000000-0000-4000-8000-000000000001/x.exe"}}', 'arquivo_invalido');
insert into casos
  select 'linhas demais', jsonb_build_object('regras', jsonb_agg(jsonb_build_object('pavimento', g % 200 + 1, 'vaga', case when g < 200 then 'carro' when g < 400 then 'moto' end, 'ventilacao', case when g >= 400 then 'mais' end, 'venda', 1))), 'regras_demais'
    from generate_series(0, 500) g;

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
  -- Nada do que foi recusado mexeu na tabela do A.
  assert (select referencia from public.development_price_tables
           where development_id = 'a2000000-0000-4000-8000-000000000001') = 'Outubro',
         'um envio recusado não altera a tabela';
end $$;

-- A lista sem "vaga das demais" é válida: quem não está na lista fica sem vaga.
select public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001',
  '{"referencia": "Outubro", "regras": [{"venda": 1}], "vagas": {"vaga_da_lista": "moto", "unidades": [{"bloco": "1", "unidade": "001"}]}}'::jsonb);
do $$
begin
  assert (select vagas->'vaga_das_demais' from public.development_price_tables
           where development_id = 'a2000000-0000-4000-8000-000000000001') = 'null'::jsonb,
         'vaga das demais ausente vira nulo';
end $$;

-- Tabela nula APAGA.
select public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001', null);
do $$
begin
  assert (select count(*) from public.development_price_tables
           where development_id = 'a2000000-0000-4000-8000-000000000001') = 0, 'tabela nula apaga';
end $$;


-- ===========================================================================
-- 5. A REGRA DE VENTILAÇÃO DO BLOCO
-- ===========================================================================
select public.salvar_blocos_empreendimento('a2000000-0000-4000-8000-000000000001', '[
  {"id": null, "nome": "Bloco 1", "ventilacao_mais": [3, 1, 1],
   "unidades": [{"codigo": "001", "pavimento": 1, "ordem": 0}, {"codigo": "002", "pavimento": 1, "ordem": 1}]},
  {"id": null, "nome": "Bloco 2",
   "unidades": [{"codigo": "001", "pavimento": 1, "ordem": 0}]}
]'::jsonb);

do $$
declare b1 uuid; b2 uuid;
begin
  select id into b1 from public.development_blocks where nome = 'Bloco 1';
  select id into b2 from public.development_blocks where nome = 'Bloco 2';
  assert (select terminacoes_mais_ventiladas from public.development_blocks where id = b1) = '{1,3}'::smallint[],
         'a regra é gravada em ordem e sem repetição';
  assert (select terminacoes_mais_ventiladas from public.development_blocks where id = b2) is null,
         'bloco novo sem a chave fica sem regra';

  -- Aplicativo antigo (sem a chave) salva o bloco: a regra continua.
  perform public.salvar_blocos_empreendimento('a2000000-0000-4000-8000-000000000001', jsonb_build_array(
    jsonb_build_object('id', b1, 'nome', 'Bloco 1', 'unidades', '[{"codigo": "001", "pavimento": 1, "ordem": 0}]'::jsonb),
    jsonb_build_object('id', b2, 'nome', 'Bloco 2', 'ventilacao_mais', '[2, 4]'::jsonb,
                       'unidades', '[{"codigo": "001", "pavimento": 1, "ordem": 0}]'::jsonb)));
  assert (select terminacoes_mais_ventiladas from public.development_blocks where id = b1) = '{1,3}'::smallint[],
         'sem a chave, a regra do bloco é mantida';
  assert (select terminacoes_mais_ventiladas from public.development_blocks where id = b2) = '{2,4}'::smallint[],
         'a regra pode ser criada num bloco existente';

  -- Nulo remove a regra.
  perform public.salvar_blocos_empreendimento('a2000000-0000-4000-8000-000000000001', jsonb_build_array(
    jsonb_build_object('id', b1, 'nome', 'Bloco 1', 'ventilacao_mais', null,
                       'unidades', '[{"codigo": "001", "pavimento": 1, "ordem": 0}]'::jsonb),
    jsonb_build_object('id', b2, 'nome', 'Bloco 2',
                       'unidades', '[{"codigo": "001", "pavimento": 1, "ordem": 0}]'::jsonb)));
  assert (select terminacoes_mais_ventiladas from public.development_blocks where id = b1) is null,
         'ventilacao_mais nulo remove a regra';
end $$;

create temp table ventilacoes_ruins (v jsonb) on commit drop;
grant all on ventilacoes_ruins to authenticated;
insert into ventilacoes_ruins values ('[0]'), ('[100]'), ('[1.5]'), ('["1"]'), ('"1,3"'), ('[null]'), ('{"a": 1}');

do $$
declare c record;
begin
  for c in select v from ventilacoes_ruins loop
    begin
      perform public.salvar_blocos_empreendimento('a2000000-0000-4000-8000-000000000001', jsonb_build_array(
        jsonb_build_object('id', null, 'nome', 'Bloco X', 'ventilacao_mais', c.v,
                           'unidades', '[{"codigo": "001", "pavimento": 1, "ordem": 0}]'::jsonb)));
      raise exception 'ventilação % deveria ser recusada', c.v;
    exception when others then
      assert sqlerrm = 'ventilacao_invalida', format('ventilação %s: esperava ventilacao_invalida, recebeu %s', c.v, sqlerrm);
    end;
  end loop;
end $$;


-- ===========================================================================
-- 6. O PDF NO STORAGE
-- ===========================================================================
do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('tabelas-de-preco', 'a2000000-0000-4000-8000-000000000001/20260924-tabela.pdf');

  begin
    insert into storage.objects (bucket_id, name)
    values ('tabelas-de-preco', 'b2000000-0000-4000-8000-000000000002/intruso.pdf');
    raise exception 'A não deveria gravar na pasta do empreendimento do B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('tabelas-de-preco', 'lixo/intruso.pdf');
    raise exception 'pasta que não é empreendimento deveria ser recusada';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name)
    values ('tabelas-de-preco', 'c2000000-0000-4000-8000-000000000003/intruso.pdf');
    raise exception 'o corretor não deveria gravar PDF no catálogo';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into storage.objects (bucket_id, name)
values ('tabelas-de-preco', 'c2000000-0000-4000-8000-000000000003/catalogo.pdf');

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare n integer;
begin
  assert (select count(*) from storage.objects
           where name like 'a2000000-0000-4000-8000-000000000001/%') = 0, 'B não vê o PDF do A';
  assert (select count(*) from storage.objects
           where name = 'c2000000-0000-4000-8000-000000000003/catalogo.pdf') = 1, 'B vê o PDF do catálogo';
  delete from storage.objects where name like 'a2000000-0000-4000-8000-000000000001/%';
  get diagnostics n = row_count;
  assert n = 0, 'B não apaga o PDF do A';
end $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare n integer;
begin
  assert (select count(*) from storage.objects
           where name like 'a2000000-0000-4000-8000-000000000001/%') = 1, 'A vê o próprio PDF';
  delete from storage.objects where name = 'a2000000-0000-4000-8000-000000000001/20260924-tabela.pdf';
  get diagnostics n = row_count;
  assert n = 1, 'A apaga o próprio PDF';
end $$;


-- ===========================================================================
-- 7. SEM LOGIN
-- ===========================================================================
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.development_price_tables;
    raise exception 'anon não deveria ler a tabela';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.salvar_tabela_de_preco('a2000000-0000-4000-8000-000000000001', '{}'::jsonb);
    raise exception 'anon não deveria chamar a função';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'tabela de preço: todas as verificações passaram' as resultado;
rollback;
