-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-unidades-db.sql
--
-- O que este arquivo prova, na ordem:
--   1. o corretor salva, lê e reorganiza os blocos do empreendimento DELE;
--   2. reorganizar NUNCA apaga o preço de uma unidade que continua existindo;
--   3. outro corretor não vê nem escreve nada disso;
--   4. o catálogo é lido por todos e escrito só pelo admin;
--   5. o formato ruim é recusado com um código que o aplicativo traduz;
--   6. ninguém sem login alcança tabela ou função.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20260924150000_blocos_e_unidades.sql

-- Três pessoas e três empreendimentos: um de cada corretor e um do catálogo.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'corretor-a@example.invalid', '{"full_name":"Corretor A"}'),
  ('b0000000-0000-4000-8000-000000000002', 'corretor-b@example.invalid', '{"full_name":"Corretor B"}'),
  ('c0000000-0000-4000-8000-000000000003', 'admin@example.invalid', '{"full_name":"Admin POUP"}');
insert into public.app_admins (user_id) values ('c0000000-0000-4000-8000-000000000003');

insert into public.companies (id, user_id, name, is_catalog) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Construtora do A', false),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'Construtora do B', false),
  ('c1000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'Construtora do catálogo', true);

insert into public.developments (id, user_id, company_id, name) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Residencial do A'),
  ('b2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'Residencial do B'),
  ('c2000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'Residencial do catálogo');


-- ===========================================================================
-- 1 e 2. O CORRETOR A NO EMPREENDIMENTO DELE
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select public.salvar_blocos_empreendimento('a2000000-0000-4000-8000-000000000001', '[
  {"id": null, "nome": "Bloco 1", "unidades": [
    {"codigo": "001", "pavimento": 1, "ordem": 0}, {"codigo": "002", "pavimento": 1, "ordem": 1},
    {"codigo": "101", "pavimento": 2, "ordem": 2}, {"codigo": "102", "pavimento": 2, "ordem": 3}
  ]}
]'::jsonb);

do $$
declare n integer;
begin
  assert (select count(*) from public.development_blocks) = 1, 'A deveria ver o bloco que salvou';
  assert (select count(*) from public.development_units) = 4, 'A deveria ver as 4 unidades';

  -- A tabela de preços grava o valor da unidade 001.
  update public.development_units set valor = 250000, valor_atualizado_em = now() where codigo = '001';
  get diagnostics n = row_count;
  assert n = 1, 'A deveria poder gravar o preço da própria unidade';
end $$;

-- Reorganiza o MESMO bloco: tira a 102, acrescenta o 3º pavimento.
select public.salvar_blocos_empreendimento('a2000000-0000-4000-8000-000000000001', (
  select jsonb_build_array(jsonb_build_object(
    'id', b.id, 'nome', 'Torre A', 'unidades', '[
      {"codigo": "001", "pavimento": 1, "ordem": 0}, {"codigo": "002", "pavimento": 1, "ordem": 1},
      {"codigo": "101", "pavimento": 2, "ordem": 2},
      {"codigo": "201", "pavimento": 3, "ordem": 3}, {"codigo": "202", "pavimento": 3, "ordem": 4}
    ]'::jsonb))
  from public.development_blocks b limit 1));

do $$
begin
  assert (select count(*) from public.development_blocks) = 1, 'Reorganizar criou bloco a mais';
  assert (select nome from public.development_blocks) = 'Torre A', 'O nome do bloco não foi atualizado';
  assert (select count(*) from public.development_units) = 5, 'Deveriam sobrar 5 unidades';
  assert not exists (select 1 from public.development_units where codigo = '102'), 'A 102 deveria ter saído';
  assert (select valor from public.development_units where codigo = '001') = 250000,
    'REORGANIZAR APAGOU O PREÇO DA UNIDADE 001';
  assert (select valor from public.development_units where codigo = '201') is null,
    'Unidade nova nasceu com preço';
  assert (select ordem from public.development_units where codigo = '201') = 3, 'A ordem não foi atualizada';
end $$;

-- Guarda o id do bloco do A para o corretor B tentar alcançá-lo.
reset role;
select set_config('teste.bloco_a', (select id::text from public.development_blocks limit 1), true);


-- ===========================================================================
-- 3. O CORRETOR B NÃO ALCANÇA NADA DO A
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
declare n integer;
begin
  assert (select count(*) from public.development_blocks) = 0, 'B viu bloco do A';
  assert (select count(*) from public.development_units) = 0, 'B viu unidade do A';

  update public.development_units set valor = 1 where development_id = 'a2000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'B alterou preço do A';

  begin
    perform public.salvar_blocos_empreendimento('a2000000-0000-4000-8000-000000000001',
      '[{"id": null, "nome": "Invasão", "unidades": [{"codigo": "001", "pavimento": 1}]}]');
    raise exception 'B salvou blocos no empreendimento do A';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.development_units (block_id, development_id, codigo, pavimento)
    values (current_setting('teste.bloco_a')::uuid, 'a2000000-0000-4000-8000-000000000001', '999', 1);
    raise exception 'B inseriu unidade no bloco do A';
  exception when insufficient_privilege then null;
  end;
end $$;


-- ===========================================================================
-- 4. O CATÁLOGO: TODOS LEEM, SÓ O ADMIN ESCREVE
-- ===========================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.salvar_blocos_empreendimento('c2000000-0000-4000-8000-000000000003',
      '[{"id": null, "nome": "Bloco 1", "unidades": [{"codigo": "001", "pavimento": 1}]}]');
    raise exception 'Corretor escreveu no catálogo';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select public.salvar_blocos_empreendimento('c2000000-0000-4000-8000-000000000003',
  '[{"id": null, "nome": "Bloco 1", "unidades": [{"codigo": "001", "pavimento": 1}, {"codigo": "002", "pavimento": 1}]}]');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare n integer;
begin
  assert (select count(*) from public.development_units
           where development_id = 'c2000000-0000-4000-8000-000000000003') = 2,
    'Corretor não enxerga as unidades do catálogo';
  update public.development_units set valor = 1
   where development_id = 'c2000000-0000-4000-8000-000000000003';
  get diagnostics n = row_count;
  assert n = 0, 'Corretor alterou preço do catálogo';
end $$;


-- ===========================================================================
-- 5. FORMATO RUIM É RECUSADO, COM CÓDIGO LEGÍVEL
-- ===========================================================================
do $$
declare
  dev constant uuid := 'a2000000-0000-4000-8000-000000000001';
  casos text[][] := array[
    array['codigo_repetido', '[{"nome":"B1","unidades":[{"codigo":"001","pavimento":1},{"codigo":"001","pavimento":1}]}]'],
    array['nome_de_bloco_repetido', '[{"nome":"B1","unidades":[{"codigo":"001","pavimento":1}]},{"nome":" b1 ","unidades":[{"codigo":"001","pavimento":1}]}]'],
    array['bloco_sem_unidade', '[{"nome":"B1","unidades":[]}]'],
    array['unidade_invalida', '[{"nome":"B1","unidades":[{"codigo":"001","pavimento":0}]}]'],
    array['nome_de_bloco_invalido', '[{"nome":"  ","unidades":[{"codigo":"001","pavimento":1}]}]'],
    array['formato_invalido', '{"nome":"não é lista"}']
  ];
  i integer;
begin
  for i in 1 .. array_length(casos, 1) loop
    begin
      perform public.salvar_blocos_empreendimento(dev, casos[i][2]::jsonb);
      raise exception 'Aceitou o formato que deveria dar %', casos[i][1];
    exception when invalid_parameter_value then
      assert sqlerrm = casos[i][1], format('Esperava %s, veio %s', casos[i][1], sqlerrm);
    end;
  end loop;

  -- A recusa não pode ter desfeito o que já estava salvo.
  assert (select count(*) from public.development_units where development_id = dev) = 5,
    'Uma recusa apagou unidades';
end $$;

-- Lista vazia remove todos os blocos, e as unidades vão junto.
select public.salvar_blocos_empreendimento('a2000000-0000-4000-8000-000000000001', '[]');
do $$
begin
  assert (select count(*) from public.development_units
           where development_id = 'a2000000-0000-4000-8000-000000000001') = 0,
    'Remover o bloco deixou unidades órfãs';
end $$;


-- ===========================================================================
-- 6. SEM LOGIN, NADA
-- ===========================================================================
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.salvar_blocos_empreendimento(uuid,jsonb)', 'EXECUTE'),
    'anon pode salvar blocos';
  assert not has_table_privilege('anon', 'public.development_units', 'SELECT'), 'anon lê unidades';
  assert not has_table_privilege('anon', 'public.development_blocks', 'SELECT'), 'anon lê blocos';
  assert has_function_privilege('authenticated', 'public.salvar_blocos_empreendimento(uuid,jsonb)', 'EXECUTE'),
    'O aplicativo não consegue salvar blocos';

  -- A chave composta impede unidade apontando para bloco de outro empreendimento.
  begin
    insert into public.development_units (block_id, development_id, codigo, pavimento)
    select b.id, 'b2000000-0000-4000-8000-000000000002', '777', 1
      from public.development_blocks b
     where b.development_id = 'c2000000-0000-4000-8000-000000000003' limit 1;
    raise exception 'Unidade aceitou empreendimento diferente do bloco';
  exception when foreign_key_violation then null;
  end;

  -- Excluir o empreendimento leva blocos e unidades.
  delete from public.developments where id = 'c2000000-0000-4000-8000-000000000003';
  assert not exists (select 1 from public.development_blocks
                      where development_id = 'c2000000-0000-4000-8000-000000000003'),
    'Excluir o empreendimento deixou blocos';
end $$;

\echo 'Blocos e unidades: acesso, preço preservado, recusas e cascata conferidos.'
rollback;
