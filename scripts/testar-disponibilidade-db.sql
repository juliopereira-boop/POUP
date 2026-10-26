-- OBSOLETO desde 20261026120000_disponibilidade_cvcrm.sql: o UAU não pinta mais
-- (as verificações de cor abaixo falham por isso). O teste que vale agora é
-- scripts/testar-disponibilidade-cvcrm-db.sql. Sai junto com o UAU.
--
-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-disponibilidade-db.sql
--
-- O que este arquivo prova, na ordem:
--   1. a leitura do UAU entra no espelho e o admin vincula as unidades;
--   2. cada status do UAU vira a situação certa (verde/amarelo/vermelho/cinza);
--   3. a leitura repetida não regrava nada (sem evento no Realtime);
--   4. a leitura leve pega a venda (unidade que saiu do conjunto não vendido);
--   5. uma leitura quebrada (vazia) NÃO vira "tudo vendido";
--   6. unidade apagada no UAU fica cinza; renumerada fica sem cor;
--   7. status novo entra cinza para revisar; reclassificar repinta;
--   8. o vínculo é 1 para 1, só com obra do próprio empreendimento;
--   9. corretor lê, não escreve; anônimo não alcança nada;
--  10. apagar a unidade do POUP leva vínculo e disponibilidade junto;
--  11. a trava de uma leitura por vez;
--  12. o valor do UAU chega ao corretor só pelo vínculo válido, e a fonte do
--      preço (automático / tabela / UAU) é escolha do admin.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20261020120000_disponibilidade_uau.sql
-- Idempotente: rodar duas vezes não muda nada.
\ir ../supabase/migrations/20261020120000_disponibilidade_uau.sql

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'corretor-a@example.invalid'),
  ('c0000000-0000-4000-8000-000000000003', 'admin@example.invalid');
insert into public.app_admins (user_id) values ('c0000000-0000-4000-8000-000000000003');

insert into public.companies (id, user_id, name, is_catalog, ativa) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Construtora do A', false, true),
  ('c1000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'Canopus', true, true);
insert into public.developments (id, user_id, company_id, name) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Residencial do A'),
  ('c2000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'Village Connect I'),
  ('c2000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'Outro do catálogo');

-- Dois blocos do Connect, como o gerador do POUP numera.
insert into public.development_blocks (id, development_id, nome, ordem) values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', 'Bloco 1', 0),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', 'Bloco 2', 1),
  ('c3000000-0000-4000-8000-000000000009', 'c2000000-0000-4000-8000-000000000004', 'Bloco 1', 0);
insert into public.development_units (id, block_id, development_id, codigo, pavimento, ordem) values
  ('c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '001', 1, 0),
  ('c4000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '002', 1, 1),
  ('c4000000-0000-4000-8000-000000000003', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '101', 2, 2),
  ('c4000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '102', 2, 3),
  ('c4000000-0000-4000-8000-000000000005', 'c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', '001', 1, 0),
  ('c4000000-0000-4000-8000-000000000006', 'c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', '002', 1, 1),
  ('c4000000-0000-4000-8000-000000000009', 'c3000000-0000-4000-8000-000000000009', 'c2000000-0000-4000-8000-000000000004', '001', 1, 0);


-- ===========================================================================
-- 1. A LEITURA COMPLETA ENTRA NO ESPELHO; O ADMIN VINCULA
-- ===========================================================================
set local role service_role;

do $$
declare r jsonb;
begin
  r := public.uau_aplicar_leitura(1, '259V', 'completo', '[
    {"produto": 366, "num_per": 1, "identificador": "Bloco 01 Apto 001", "status": 0, "descricao": "Disponível", "planta": "2VR03", "valor": 231500},
    {"produto": 366, "num_per": 2, "identificador": "Bloco 01 Apto 002", "status": 1, "descricao": "Vendida", "valor": 236500, "num_venda": 12},
    {"produto": 366, "num_per": 3, "identificador": "Bloco 01 Apto 101", "status": 0, "descricao": "Disponível"},
    {"produto": 366, "num_per": 4, "identificador": "Bloco 01 Apto 102", "status": 2, "descricao": "Reservado"},
    {"produto": 366, "num_per": 5, "identificador": "Bloco 02 Apto 001", "status": 3, "descricao": "Proposta"},
    {"produto": 366, "num_per": 6, "identificador": "Bloco 02 Apto 002", "status": 8, "descricao": "Fora de venda"},
    {"produto": 366, "num_per": 7, "identificador": "Bloco 02 Apto 101", "status": 4, "descricao": "Quitado"}
  ]'::jsonb);
  assert (r->>'lidas')::int = 7 and (r->>'novas')::int = 7, 'A leitura completa não entrou inteira: ' || r;
  assert (select count(*) from public.uau_unidades where uau_obra = '259V') = 7, 'Espelho sem as 7 unidades';
  assert not exists (select 1 from public.development_unit_disponibilidade), 'Disponibilidade nasceu sem vínculo';
end $$;

-- Uma obra de outro empreendimento, para provar que o vínculo não cruza.
select public.uau_aplicar_leitura(1, '264V', 'completo',
  '[{"produto": 400, "num_per": 1, "identificador": "Bloco 01 Apto 001", "status": 0}]'::jsonb);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select public.uau_salvar_obra('c2000000-0000-4000-8000-000000000003', 1, '259v');
select public.uau_salvar_obra('c2000000-0000-4000-8000-000000000004', 1, '264V');

do $$
declare c jsonb; r jsonb;
begin
  c := public.uau_conferencia('c2000000-0000-4000-8000-000000000003');
  assert jsonb_array_length(c->'poup') = 6, 'Conferência sem as 6 unidades do POUP';
  assert jsonb_array_length(c->'uau') = 7, 'Conferência sem as 7 unidades do UAU (obra 259V, gravada em maiúscula)';
  assert jsonb_array_length(c->'vinculos') = 0, 'Vínculo antes de vincular';

  -- Os pares que a tela sugeriu (chaveUau.ts) e o admin confirmou. A 7
  -- (Bloco 02 Apto 101) não existe no POUP: fica de fora.
  r := public.uau_salvar_vinculos('c2000000-0000-4000-8000-000000000003', '[
    {"unitId": "c4000000-0000-4000-8000-000000000001", "empresa": 1, "produto": 366, "numPer": 1, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000002", "empresa": 1, "produto": 366, "numPer": 2, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000003", "empresa": 1, "produto": 366, "numPer": 3, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000004", "empresa": 1, "produto": 366, "numPer": 4, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000005", "empresa": 1, "produto": 366, "numPer": 5, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000006", "empresa": 1, "produto": 366, "numPer": 6, "origem": "manual"}
  ]'::jsonb);
  assert (r->>'gravados')::int = 6, 'Vínculos não gravados: ' || r;
end $$;


-- ===========================================================================
-- 2. CADA STATUS VIRA A SITUAÇÃO CERTA
-- ===========================================================================
reset role;
do $$
begin
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000001') = 'disponivel', 'Disponível ≠ verde';
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000002') = 'vendida', 'Vendida ≠ vermelho';
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000004') = 'negociacao', 'Reservado ≠ amarelo';
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000005') = 'negociacao', 'Proposta ≠ amarelo';
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000006') = 'indisponivel', 'Fora de venda ≠ cinza';
  assert (select status_descricao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000005') = 'Proposta', 'Descrição do UAU perdida';
end $$;


-- ===========================================================================
-- 3. A MESMA LEITURA DE NOVO NÃO REGRAVA NADA
-- ===========================================================================
create temp table _antes as select unit_id, ctid::text as x, mudou_em from public.development_unit_disponibilidade;
create temp table _espelho_antes as select uau_num_per, ctid::text as x from public.uau_unidades where uau_obra = '259V';

set local role service_role;
do $$
declare r jsonb;
begin
  r := public.uau_aplicar_leitura(1, '259V', 'completo', '[
    {"produto": 366, "num_per": 1, "identificador": "Bloco 01 Apto 001", "status": 0, "descricao": "Disponível", "planta": "2VR03", "valor": 231500},
    {"produto": 366, "num_per": 2, "identificador": "Bloco 01 Apto 002", "status": 1, "descricao": "Vendida", "valor": 236500, "num_venda": 12},
    {"produto": 366, "num_per": 3, "identificador": "Bloco 01 Apto 101", "status": 0, "descricao": "Disponível"},
    {"produto": 366, "num_per": 4, "identificador": "Bloco 01 Apto 102", "status": 2, "descricao": "Reservado"},
    {"produto": 366, "num_per": 5, "identificador": "Bloco 02 Apto 001", "status": 3, "descricao": "Proposta"},
    {"produto": 366, "num_per": 6, "identificador": "Bloco 02 Apto 002", "status": 8, "descricao": "Fora de venda"},
    {"produto": 366, "num_per": 7, "identificador": "Bloco 02 Apto 101", "status": 4, "descricao": "Quitado"}
  ]'::jsonb);
  assert (r->>'mudaram')::int = 0, 'Leitura igual regravou o espelho: ' || r;
end $$;
reset role;
do $$
begin
  assert not exists (
    select 1 from public.development_unit_disponibilidade d join _antes a using (unit_id) where d.ctid::text <> a.x
  ), 'Leitura igual regravou a disponibilidade (geraria evento no Realtime)';
  assert not exists (
    select 1 from public.uau_unidades u join _espelho_antes a using (uau_num_per) where u.uau_obra = '259V' and u.ctid::text <> a.x
  ), 'Leitura igual regravou o espelho';
end $$;


-- ===========================================================================
-- 4. A LEITURA LEVE: PROPOSTA NOVA E VENDA
-- ===========================================================================
-- Só as não vendidas (Vendido_unid NOT IN (1,4)). A 001 virou Proposta; a 101
-- não veio — saiu do conjunto não vendido, logo foi vendida.
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.uau_aplicar_leitura(1, '259V', 'leve', '[
    {"produto": 366, "num_per": 1, "identificador": "Bloco 01 Apto 001", "status": 3},
    {"produto": 366, "num_per": 4, "identificador": "Bloco 01 Apto 102", "status": 2},
    {"produto": 366, "num_per": 5, "identificador": "Bloco 02 Apto 001", "status": 3},
    {"produto": 366, "num_per": 6, "identificador": "Bloco 02 Apto 002", "status": 8}
  ]'::jsonb, public.uau_codigos_vendidos());
  assert (r->>'mudaram')::int = 1, 'A leve deveria mudar só a 001: ' || r;
  assert (r->>'sumiram')::int = 1 and (r->>'suspeita')::boolean = false, 'A 101 deveria sair como vendida: ' || r;
end $$;
reset role;
do $$
begin
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000001') = 'negociacao', 'Proposta nova não ficou amarela';
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000003') = 'vendida', 'Venda pela leve não ficou vermelha';
  assert (select status_descricao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000001') = 'Proposta', 'A leve não trouxe a descrição do status';
  -- Só as duas que mudaram foram regravadas.
  assert (select count(*) from public.development_unit_disponibilidade d join _antes a using (unit_id) where d.ctid::text <> a.x) = 2,
    'A leve regravou unidade que não mudou';
  assert (select ultimo_leve_em from public.development_uau_obras where uau_obra = '259V') is not null, 'Frescor da leve não registrado';
end $$;


-- 4b. O "conferir agora" (pontual): uma unidade só, sem efeito colateral.
create temp table _obra_antes as select ctid::text as x from public.development_uau_obras where uau_obra = '259V';
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.uau_aplicar_leitura(1, '259V', 'pontual',
    '[{"produto": 366, "num_per": 5, "identificador": "Bloco 02 Apto 001", "status": 1, "descricao": "Vendida"}]'::jsonb);
  assert (r->>'mudaram')::int = 1 and (r->>'sumiram')::int = 0, 'Pontual: ' || r;
  assert (select count(*) from public.uau_unidades where uau_obra = '259V' and ausente_desde is not null) = 0,
    'O conferir de UMA unidade marcou as outras como sumidas';
end $$;
reset role;
do $$
begin
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000005') = 'vendida',
    'O conferir agora não pintou a venda';
  assert (select ctid::text from public.development_uau_obras where uau_obra = '259V') = (select x from _obra_antes),
    'O conferir de uma unidade mexeu no frescor da obra inteira';
end $$;


-- ===========================================================================
-- 5. UMA LEITURA QUEBRADA NÃO VIRA "TUDO VENDIDO"
-- ===========================================================================
set local role service_role;
select public.uau_aplicar_leitura(1, '901V', 'completo', (
  select jsonb_agg(jsonb_build_object('produto', 9, 'num_per', g, 'identificador', 'Bloco 01 Apto 00' || g, 'status', 0))
    from generate_series(1, 8) g));
do $$
declare r jsonb;
begin
  r := public.uau_aplicar_leitura(1, '901V', 'leve', '[]'::jsonb, public.uau_codigos_vendidos());
  assert (r->>'suspeita')::boolean, 'Leitura vazia não foi marcada como suspeita: ' || r;
  assert not exists (select 1 from public.uau_unidades where uau_obra = '901V' and status_codigo <> 0),
    'LEITURA VAZIA MARCOU UNIDADE COMO VENDIDA';
  r := public.uau_aplicar_leitura(1, '901V', 'completo', '[]'::jsonb);
  assert (r->>'suspeita')::boolean, 'Completa vazia não foi suspeita: ' || r;
  assert not exists (select 1 from public.uau_unidades where uau_obra = '901V' and ausente_desde is not null),
    'COMPLETA VAZIA MARCOU UNIDADE COMO APAGADA';
end $$;
reset role;


-- ===========================================================================
-- 6. APAGADA NO UAU FICA CINZA; RENUMERADA FICA SEM COR
-- ===========================================================================
set local role service_role;
do $$
declare r jsonb;
begin
  -- A 002 sumiu da completa; a 102 foi renumerada no UAU para "Apto 103".
  r := public.uau_aplicar_leitura(1, '259V', 'completo', '[
    {"produto": 366, "num_per": 1, "identificador": "Bloco 01 Apto 001", "status": 3, "descricao": "Proposta"},
    {"produto": 366, "num_per": 3, "identificador": "Bloco 01 Apto 101", "status": 1, "descricao": "Vendida"},
    {"produto": 366, "num_per": 4, "identificador": "Bloco 01 Apto 103", "status": 2, "descricao": "Reservado"},
    {"produto": 366, "num_per": 5, "identificador": "Bloco 02 Apto 001", "status": 3, "descricao": "Proposta"},
    {"produto": 366, "num_per": 6, "identificador": "Bloco 02 Apto 002", "status": 8, "descricao": "Fora de venda"},
    {"produto": 366, "num_per": 7, "identificador": "Bloco 02 Apto 101", "status": 4, "descricao": "Quitado"}
  ]'::jsonb);
  assert (r->>'sumiram')::int = 1, 'A 002 deveria sumir: ' || r;
end $$;
reset role;
do $$
begin
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000002') = 'indisponivel', 'Unidade apagada no UAU não ficou cinza';
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000004') = 'sem_vinculo',
    'UNIDADE RENUMERADA NO UAU CONTINUOU COM COR — poderia ser a cor de outra';
end $$;


-- ===========================================================================
-- 7. STATUS NOVO ENTRA CINZA; RECLASSIFICAR REPINTA
-- ===========================================================================
set local role service_role;
select public.uau_aplicar_leitura(1, '259V', 'leve', '[
  {"produto": 366, "num_per": 1, "identificador": "Bloco 01 Apto 001", "status": 9, "descricao": "Em acerto"},
  {"produto": 366, "num_per": 4, "identificador": "Bloco 01 Apto 103", "status": 2},
  {"produto": 366, "num_per": 5, "identificador": "Bloco 02 Apto 001", "status": 3},
  {"produto": 366, "num_per": 6, "identificador": "Bloco 02 Apto 002", "status": 8}
]'::jsonb, public.uau_codigos_vendidos());
reset role;
do $$
begin
  assert (select revisar and situacao = 'indisponivel' from public.uau_status_situacao where status_codigo = 9), 'Status novo não entrou cinza/revisar';
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000001') = 'indisponivel', 'Status desconhecido pintou de cor';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.uau_classificar_status(9::smallint, 'negociacao');
reset role;
do $$
begin
  assert (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000001') = 'negociacao', 'Reclassificar não repintou';
end $$;


-- ===========================================================================
-- 8. O VÍNCULO É 1 PARA 1, SÓ COM OBRA DO PRÓPRIO EMPREENDIMENTO
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.uau_salvar_vinculos('c2000000-0000-4000-8000-000000000003',
      '[{"unitId": "c4000000-0000-4000-8000-000000000001", "empresa": 1, "produto": 366, "numPer": 7},
        {"unitId": "c4000000-0000-4000-8000-000000000003", "empresa": 1, "produto": 366, "numPer": 7}]');
    raise exception 'A mesma unidade do UAU foi vinculada a duas do POUP';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.uau_salvar_vinculos('c2000000-0000-4000-8000-000000000003',
      '[{"unitId": "c4000000-0000-4000-8000-000000000001", "empresa": 1, "produto": 400, "numPer": 1}]');
    raise exception 'Vinculou unidade de obra de outro empreendimento';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.uau_salvar_vinculos('c2000000-0000-4000-8000-000000000004',
      '[{"unitId": "c4000000-0000-4000-8000-000000000009", "empresa": 1, "produto": 366, "numPer": 1}]');
    raise exception 'Vinculou a unidade do Connect num empreendimento que não tem a obra 259V';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.uau_salvar_obra('c2000000-0000-4000-8000-000000000004', 1, '259V');
    raise exception 'A mesma obra foi para dois empreendimentos';
  exception when unique_violation then null;
  end;

  begin
    perform public.uau_salvar_obra('c2000000-0000-4000-8000-000000000003', 1, '259V'' OR 1=1 --');
    raise exception 'Código de obra com aspas foi aceito (iria para o WHERE do UAU)';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;


-- ===========================================================================
-- 9. O CORRETOR LÊ, NÃO ESCREVE; O ANÔNIMO NÃO ALCANÇA NADA
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare d jsonb;
begin
  d := public.uau_disponibilidade('c2000000-0000-4000-8000-000000000003');
  assert (d->>'temUau')::boolean, 'Corretor não vê que o empreendimento tem UAU';
  assert jsonb_array_length(d->'unidades') = 5, 'Corretor não recebeu as 5 unidades com cor: ' || (d->'unidades');
  assert d->>'atualizadoEm' is not null, 'Sem a hora da última leitura';
  assert (select count(*) from public.development_unit_disponibilidade) = 6, 'Corretor não lê a disponibilidade do catálogo pela tabela (Realtime)';

  assert (select count(*) from public.uau_unidades) = 0, 'Corretor leu o espelho cru do UAU';
  assert (select count(*) from public.development_unit_uau) = 0, 'Corretor leu os vínculos';

  begin
    perform public.uau_salvar_vinculos('c2000000-0000-4000-8000-000000000003', '[]');
    raise exception 'Corretor salvou vínculo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.uau_aplicar_leitura(1, '259V', 'leve', '[]');
    raise exception 'Corretor gravou leitura do UAU';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.development_unit_disponibilidade set situacao = 'disponivel';
    raise exception 'Corretor pintou unidade';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.uau_classificar_status(1::smallint, 'disponivel');
    raise exception 'Corretor reclassificou status';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.uau_disponibilidade('a2000000-0000-4000-8000-000000000001');
  exception when insufficient_privilege then
    raise exception 'O dono não leu a disponibilidade do próprio empreendimento';
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform public.uau_disponibilidade('c2000000-0000-4000-8000-000000000003');
    raise exception 'Anônimo leu disponibilidade';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.development_unit_disponibilidade;
    raise exception 'Anônimo leu a tabela';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;


-- ===========================================================================
-- 12. O VALOR DO UAU E A FONTE DO PREÇO
-- ===========================================================================
-- A completa traz o preço da tabela do dia no ERP (`ValorTotal`). Ele vai ao
-- corretor só pela RPC, só da unidade com vínculo válido.
set local role service_role;
select public.uau_aplicar_leitura(1, '259V', 'pontual',
  '[{"produto": 366, "num_per": 1, "identificador": "Bloco 01 Apto 001", "status": 9, "descricao": "Em acerto", "valor": 231500}]'::jsonb);
select public.uau_aplicar_leitura(1, '259V', 'pontual',
  '[{"produto": 366, "num_per": 4, "identificador": "Bloco 01 Apto 103", "status": 2, "descricao": "Reservado", "valor": 240000}]'::jsonb);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare d jsonb; u jsonb;
begin
  d := public.uau_disponibilidade('c2000000-0000-4000-8000-000000000003');
  assert d->>'fontePreco' = 'automatico', 'Fonte do preço não nasceu automática: ' || coalesce(d->>'fontePreco', 'nula');
  select x into u from jsonb_array_elements(d->'unidades') x where x->>'unitId' = 'c4000000-0000-4000-8000-000000000001';
  assert (u->>'valorUau')::numeric = 231500, 'Valor do UAU não chegou ao corretor: ' || coalesce(u::text, 'sem a unidade');
  -- A renumerada (102 → 103) está sem vínculo válido: nem cor, nem preço.
  assert not exists (select 1 from jsonb_array_elements(d->'unidades') x where x->>'unitId' = 'c4000000-0000-4000-8000-000000000004'),
    'UNIDADE RENUMERADA LEVOU O PREÇO DE OUTRA';
  assert exists (select 1 from public.uau_empreendimentos_com_preco() where development_id = 'c2000000-0000-4000-8000-000000000003'),
    'O empreendimento com valor do UAU não aparece para o simulador';
  assert not exists (select 1 from public.uau_empreendimentos_com_preco() where development_id = 'c2000000-0000-4000-8000-000000000004'),
    'Empreendimento sem valor do UAU apareceu como se tivesse';
  begin
    perform public.uau_definir_fonte_preco('c2000000-0000-4000-8000-000000000003', 'uau');
    raise exception 'Corretor mudou a fonte do preço';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.uau_painel();
    raise exception 'Corretor abriu o painel do UAU';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare p jsonb;
begin
  perform public.uau_definir_fonte_preco('c2000000-0000-4000-8000-000000000003', 'tabela');
  assert not exists (select 1 from public.uau_empreendimentos_com_preco() where development_id = 'c2000000-0000-4000-8000-000000000003'),
    'Com "só tabela", o valor do UAU continuou sendo oferecido';
  assert (public.uau_disponibilidade('c2000000-0000-4000-8000-000000000003')->>'fontePreco') = 'tabela', 'Fonte não gravou';
  begin
    perform public.uau_definir_fonte_preco('c2000000-0000-4000-8000-000000000003', 'qualquer');
    raise exception 'Fonte inválida aceita';
  exception when invalid_parameter_value then null;
  end;
  perform public.uau_definir_fonte_preco('c2000000-0000-4000-8000-000000000003', 'automatico');

  p := public.uau_painel();
  assert exists (
    select 1 from jsonb_array_elements(p->'obras') o
     where o->>'obra' = '259V' and (o->>'vinculadas')::int = 6 and o->>'empreendimento' = 'Village Connect I'
  ), 'Painel sem a obra 259V e os 6 vínculos: ' || (p->'obras');
  assert jsonb_array_length(p->'status') >= 7, 'Painel sem a tabela de status';
end $$;
reset role;


-- ===========================================================================
-- 12b. O SEGREDO DO CRON (Vault)
-- ===========================================================================
set local role service_role;
do $$
begin
  assert not public.uau_confere_segredo_do_cron(null), 'Segredo nulo passou';
  assert not public.uau_confere_segredo_do_cron('curto'), 'Segredo curto passou';
  assert not public.uau_confere_segredo_do_cron(repeat('x', 64)), 'Segredo qualquer passou (sem Vault ou sem o segredo guardado)';
end $$;
reset role;
do $$
begin
  -- Com o segredo no Vault (no Supabase, `vault.create_secret`), só ele passa.
  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is not null
     or to_regprocedure('vault.create_secret(text,text)') is not null then
    perform vault.create_secret(repeat('s', 64), 'uau_sync_secret');
    assert public.uau_confere_segredo_do_cron(repeat('s', 64)), 'O segredo certo não passou';
    assert not public.uau_confere_segredo_do_cron(repeat('s', 63) || 't'), 'Segredo quase igual passou';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.uau_confere_segredo_do_cron(repeat('s', 64));
    raise exception 'Usuário do app consultou o segredo do cron';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ===========================================================================
-- 10. APAGAR A UNIDADE DO POUP LEVA VÍNCULO E DISPONIBILIDADE; TIRAR A OBRA
--     DEIXA SEM COR
-- ===========================================================================
delete from public.development_units where id = 'c4000000-0000-4000-8000-000000000006';
do $$
begin
  assert not exists (select 1 from public.development_unit_uau where unit_id = 'c4000000-0000-4000-8000-000000000006'), 'Vínculo sobreviveu à unidade';
  assert not exists (select 1 from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000006'), 'Disponibilidade sobreviveu à unidade';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.uau_remover_obra('c2000000-0000-4000-8000-000000000003', 1, '259V');
reset role;
do $$
begin
  assert not exists (select 1 from public.development_unit_uau where development_id = 'c2000000-0000-4000-8000-000000000003'), 'Vínculos sobreviveram à obra';
  assert not exists (
    select 1 from public.development_unit_disponibilidade
     where development_id = 'c2000000-0000-4000-8000-000000000003' and situacao <> 'sem_vinculo'
  ), 'Unidade continuou com cor depois de tirar a obra';
end $$;


-- ===========================================================================
-- 11. UMA LEITURA POR VEZ
-- ===========================================================================
set local role service_role;
do $$
begin
  assert public.uau_sync_iniciar('leve'), 'A primeira leitura não começou';
  assert not public.uau_sync_iniciar('leve'), 'Duas leituras leves ao mesmo tempo';
  perform public.uau_sync_terminar('leve');
  assert public.uau_sync_iniciar('leve'), 'Depois de terminar, a próxima não começou';
end $$;
reset role;

\echo 'testar-disponibilidade-db: tudo certo'
rollback;
