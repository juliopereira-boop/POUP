-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-disponibilidade-cvcrm-db.sql
--
-- O que este arquivo prova, na ordem:
--   1. o identificador e a situação do CV são lidos do jeito que o CV escreve;
--   2. a leitura completa entra no espelho e o admin vincula as unidades;
--   3. cada situação do CV vira a cor certa; a leitura repetida não regrava nada;
--   4. a leitura leve (histórico do CVDW) pega a mudança e refresca tudo;
--   5. uma leitura quebrada (quase vazia) NÃO vira "tudo fora de venda";
--   6. unidade apagada no CV fica cinza; renomeada fica sem cor;
--   7. situação nova entra cinza para revisar; reclassificar repinta;
--   8. o vínculo é 1 para 1, só com empreendimento/etapa do próprio POUP;
--   9. corretor lê, não escreve; anônimo não alcança nada;
--  10. apagar a unidade do POUP leva vínculo e disponibilidade junto;
--  11. a trava de uma leitura por vez e o segredo do cron;
--  12. tirar o empreendimento do CV deixa as unidades sem cor (sem apagar);
--  13. o UAU não pinta mais nada.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20261020120000_disponibilidade_uau.sql
\ir ../supabase/migrations/20261026120000_disponibilidade_cvcrm.sql
-- Idempotente: rodar duas vezes não muda nada.
\ir ../supabase/migrations/20261026120000_disponibilidade_cvcrm.sql

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
  ('c2000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'Village Reserva II - Mod II');

insert into public.development_blocks (id, development_id, nome, ordem) values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', 'Bloco 1', 0),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', 'Bloco 2', 1),
  ('c3000000-0000-4000-8000-000000000009', 'c2000000-0000-4000-8000-000000000004', 'Bloco 27', 0);
insert into public.development_units (id, block_id, development_id, codigo, pavimento, ordem) values
  ('c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '001', 1, 0),
  ('c4000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '002', 1, 1),
  ('c4000000-0000-4000-8000-000000000003', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '101', 2, 2),
  ('c4000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '102', 2, 3),
  ('c4000000-0000-4000-8000-000000000005', 'c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', '001', 1, 0),
  ('c4000000-0000-4000-8000-000000000006', 'c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', '002', 1, 1),
  ('c4000000-0000-4000-8000-000000000009', 'c3000000-0000-4000-8000-000000000009', 'c2000000-0000-4000-8000-000000000004', '304', 4, 0);


-- ===========================================================================
-- 1. O TEXTO DO CV
-- ===========================================================================
do $$
begin
  if public.cvcrm_identificador('Bloco 29', 'Apto 304') <> 'Bloco 29 Apto 304' then
    raise exception 'identificador Bloco + Apto: %', public.cvcrm_identificador('Bloco 29', 'Apto 304');
  end if;
  if public.cvcrm_identificador('BLOCO 46', 'UNIDADE 304') <> 'BLOCO 46 UNIDADE 304' then
    raise exception 'identificador do Reserva II';
  end if;
  -- O nome já traz o bloco: não repete.
  if public.cvcrm_identificador('TORRE 09', 'Torre 09 Apto 702') <> 'Torre 09 Apto 702' then
    raise exception 'identificador do Calhau repetiu a torre';
  end if;
  if public.cvcrm_identificador('QUADRA F', 'Quadra F Casa 19') <> 'Quadra F Casa 19' then
    raise exception 'identificador do Parque Ville repetiu a quadra';
  end if;
  if public.cvcrm_identificador('Bloco 03', 'Bloco 03 Apto. 003') <> 'Bloco 03 Apto. 003' then
    raise exception 'identificador com "Apto." repetiu o bloco';
  end if;
  -- "UNIDADE" tem "DE", não "ED" com fronteira: não é prefixo de bloco.
  if public.cvcrm_identificador('Bloco 1', 'Unidade 12') <> 'Bloco 1 Unidade 12' then
    raise exception 'UNIDADE confundida com prefixo de bloco';
  end if;
  if public.cvcrm_identificador('BLOCO 01', null) is not null then
    raise exception 'unidade sem nome ganhou identificador';
  end if;
  if public.cvcrm_chave_da_situacao('disponível') <> 'disponivel'
     or public.cvcrm_chave_da_situacao('Disponível') <> 'disponivel'
     or public.cvcrm_chave_da_situacao('  EM PROCESSO   DE RESERVA ') <> 'em processo de reserva'
     or public.cvcrm_chave_da_situacao('') is not null then
    raise exception 'chave da situação';
  end if;
  if public.cvcrm_descricao('reservada') <> 'Reservada' then
    raise exception 'descrição da situação';
  end if;
end $$;


-- ===========================================================================
-- 2. A LEITURA COMPLETA ENTRA NO ESPELHO; O ADMIN VINCULA
-- ===========================================================================
set local role service_role;

do $$
declare r jsonb;
begin
  -- O mapa do CV traz nome de cliente e documento do bloqueio; a Edge Function
  -- descarta, e mesmo que viessem a RPC não tem onde guardar.
  r := public.cvcrm_aplicar_leitura(63, null, 'completo', '[
    {"unidade": 1001, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 001", "situacao": "disponível", "documento_bloqueio": "012.345.678-79"},
    {"unidade": 1002, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 002", "situacao": "reservada"},
    {"unidade": 1003, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 101", "situacao": "vendida"},
    {"unidade": 1004, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 102", "situacao": "bloqueada"},
    {"unidade": 1005, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 001", "situacao": "Em processo de reserva"},
    {"unidade": 1006, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 002", "situacao": "disponível"},
    {"unidade": 1007, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 101", "situacao": "disponível"},
    {"unidade": 1008, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 102", "situacao": "disponível"}
  ]');
  if (r ->> 'lidas')::int <> 8 or (r ->> 'novas')::int <> 8 then
    raise exception 'Leitura completa: %', r;
  end if;
  if not exists (select 1 from public.cvcrm_unidades where cv_unidade = 1001 and identificador = 'Bloco 01 Apto 001'
                   and situacao_chave = 'disponivel' and situacao_descricao = 'Disponível') then
    raise exception 'Espelho sem o identificador ou a situação certa';
  end if;
  -- Nada vinculado ainda: nenhuma cor.
  if exists (select 1 from public.development_unit_disponibilidade) then
    raise exception 'Pintou unidade sem vínculo';
  end if;
  -- Etapa de outro módulo (Reserva II: Módulo I 2263, Módulo II 2264).
  r := public.cvcrm_aplicar_leitura(55, null, 'completo', '[
    {"unidade": 2001, "etapa": 2263, "bloco_id": 3126, "bloco": "BLOCO 15", "nome": "UNIDADE 304", "situacao": "vendida"},
    {"unidade": 2002, "etapa": 2264, "bloco_id": 3138, "bloco": "BLOCO 27", "nome": "UNIDADE 304", "situacao": "reservada"}
  ]');
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';

do $$
declare r jsonb;
begin
  perform public.cvcrm_salvar_empreendimento('c2000000-0000-4000-8000-000000000003', 63, null, 'VILLAGE CONNECT I', null);
  r := public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003', '[
    {"unitId": "c4000000-0000-4000-8000-000000000001", "cvUnidade": 1001, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000002", "cvUnidade": 1002, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000003", "cvUnidade": 1003, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000004", "cvUnidade": 1004, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000005", "cvUnidade": 1005, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000006", "cvUnidade": 1006, "origem": "manual"}
  ]');
  if (r ->> 'gravados')::int <> 6 then
    raise exception 'Vínculos: %', r;
  end if;
  r := public.cvcrm_conferencia('c2000000-0000-4000-8000-000000000003');
  if jsonb_array_length(r -> 'poup') <> 6 or jsonb_array_length(r -> 'cv') <> 8 or jsonb_array_length(r -> 'vinculos') <> 6 then
    raise exception 'Conferência: %', r;
  end if;
  -- O espelho do Reserva II não aparece na conferência do Connect.
  if (r -> 'cv') @> '[{"cvUnidade": 2001}]' then
    raise exception 'Conferência mostrou unidade de outro empreendimento do CV';
  end if;
end $$;


-- ===========================================================================
-- 3. CADA SITUAÇÃO DO CV VIRA A COR CERTA
-- ===========================================================================
reset role;
do $$
declare v record;
begin
  for v in
    select * from (values
      ('c4000000-0000-4000-8000-000000000001'::uuid, 'disponivel', 'Disponível'),
      ('c4000000-0000-4000-8000-000000000002'::uuid, 'negociacao', 'Reservada'),
      ('c4000000-0000-4000-8000-000000000003'::uuid, 'vendida', 'Vendida'),
      ('c4000000-0000-4000-8000-000000000004'::uuid, 'indisponivel', 'Bloqueada'),
      ('c4000000-0000-4000-8000-000000000005'::uuid, 'negociacao', 'Em processo de reserva'),
      ('c4000000-0000-4000-8000-000000000006'::uuid, 'disponivel', 'Disponível')
    ) as t(unit_id, situacao, descricao)
  loop
    if not exists (select 1 from public.development_unit_disponibilidade d
                    where d.unit_id = v.unit_id and d.situacao = v.situacao and d.status_descricao = v.descricao) then
      raise exception 'Unidade % deveria estar % (%), está %', v.unit_id, v.situacao, v.descricao,
        (select row(d.situacao, d.status_descricao) from public.development_unit_disponibilidade d where d.unit_id = v.unit_id);
    end if;
  end loop;
end $$;

-- A mesma leitura de novo: nada regravado (sem evento no Realtime).
create temp table _antes as select unit_id, mudou_em from public.development_unit_disponibilidade;
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.cvcrm_aplicar_leitura(63, null, 'completo', '[
    {"unidade": 1001, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 001", "situacao": "disponível"},
    {"unidade": 1002, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 002", "situacao": "reservada"},
    {"unidade": 1003, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 101", "situacao": "vendida"},
    {"unidade": 1004, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 102", "situacao": "bloqueada"},
    {"unidade": 1005, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 001", "situacao": "Em processo de reserva"},
    {"unidade": 1006, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 002", "situacao": "disponível"},
    {"unidade": 1007, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 101", "situacao": "disponível"},
    {"unidade": 1008, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 102", "situacao": "disponível"}
  ]');
  if (r ->> 'mudaram')::int <> 0 or (r ->> 'novas')::int <> 0 then
    raise exception 'Leitura repetida regravou: %', r;
  end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.development_unit_disponibilidade d join _antes a using (unit_id) where d.mudou_em <> a.mudou_em) then
    raise exception 'Leitura repetida mexeu na disponibilidade';
  end if;
  if not exists (select 1 from public.development_cvcrm_empreendimentos where cv_empreendimento = 63 and ultimo_completo_em is not null) then
    raise exception 'Leitura completa não marcou o frescor';
  end if;
end $$;


-- ===========================================================================
-- 4. A LEITURA LEVE (HISTÓRICO DO CVDW)
-- ===========================================================================
set local role service_role;
do $$
declare r jsonb;
begin
  -- 1001 foi reservada e vendida no mesmo minuto: chega só a última.
  -- 9999 não está no espelho (outro empreendimento): ignorada.
  r := public.cvcrm_aplicar_mudancas('[
    {"unidade": 1001, "situacao": "Vendida"},
    {"unidade": 9999, "situacao": "Reservada"}
  ]');
  if (r ->> 'mudaram')::int <> 1 then
    raise exception 'Leve: %', r;
  end if;
  -- De novo: nada muda.
  r := public.cvcrm_aplicar_mudancas('[{"unidade": 1001, "situacao": "Vendida"}]');
  if (r ->> 'mudaram')::int <> 0 then
    raise exception 'Leve repetida regravou: %', r;
  end if;
end $$;
reset role;
do $$
begin
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000001') <> 'vendida' then
    raise exception 'A venda que chegou pela leve não pintou de vermelho';
  end if;
  if exists (select 1 from public.cvcrm_unidades where cv_unidade = 9999) then
    raise exception 'A leve criou unidade no espelho';
  end if;
  if not exists (select 1 from public.development_cvcrm_empreendimentos where cv_empreendimento = 63 and ultimo_leve_em is not null) then
    raise exception 'A leve não marcou o frescor';
  end if;
end $$;


-- ===========================================================================
-- 5. LEITURA QUEBRADA NÃO VIRA "TUDO FORA DE VENDA"
-- ===========================================================================
update public.development_cvcrm_empreendimentos set ultimo_completo_em = '2026-01-01' where cv_empreendimento = 63;
set local role service_role;
do $$
declare r jsonb;
begin
  -- 8 no espelho, 1 na resposta: 7 sumiriam (> 5 e > 30%).
  r := public.cvcrm_aplicar_leitura(63, null, 'completo', '[
    {"unidade": 1001, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 001", "situacao": "vendida"}
  ]');
  if not (r ->> 'suspeita')::boolean then
    raise exception 'Leitura cortada não foi marcada suspeita: %', r;
  end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.cvcrm_unidades where ausente_desde is not null) then
    raise exception 'Leitura suspeita marcou unidade como apagada';
  end if;
  if (select ultimo_completo_em from public.development_cvcrm_empreendimentos where cv_empreendimento = 63) > '2026-01-02' then
    raise exception 'Leitura suspeita contou como leitura fresca';
  end if;
end $$;


-- ===========================================================================
-- 6. APAGADA NO CV FICA CINZA; RENOMEADA FICA SEM COR
-- ===========================================================================
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.cvcrm_aplicar_leitura(63, null, 'completo', '[
    {"unidade": 1001, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 001", "situacao": "vendida"},
    {"unidade": 1002, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 003", "situacao": "reservada"},
    {"unidade": 1003, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 101", "situacao": "vendida"},
    {"unidade": 1004, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 102", "situacao": "bloqueada"},
    {"unidade": 1005, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 001", "situacao": "Em processo de reserva"},
    {"unidade": 1007, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 101", "situacao": "disponível"},
    {"unidade": 1008, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 102", "situacao": "disponível"}
  ]');
  if (r ->> 'sumiram')::int <> 1 then
    raise exception 'Apagada no CV: %', r;
  end if;
end $$;
reset role;
do $$
begin
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000006') <> 'indisponivel' then
    raise exception 'Unidade apagada no CV não ficou cinza';
  end if;
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000002') <> 'sem_vinculo' then
    raise exception 'Unidade renomeada no CV continuou com cor';
  end if;
  -- A apagada só no Reserva II não mexe no Connect, e vice-versa.
  if exists (select 1 from public.cvcrm_unidades where cv_empreendimento = 55 and ausente_desde is not null) then
    raise exception 'Leitura de um empreendimento marcou unidade de outro';
  end if;
end $$;


-- ===========================================================================
-- 7. SITUAÇÃO NOVA ENTRA CINZA; RECLASSIFICAR REPINTA
-- ===========================================================================
set local role service_role;
select public.cvcrm_aplicar_mudancas('[{"unidade": 1007, "situacao": "Em análise de crédito"}]');
reset role;
do $$
begin
  if not exists (select 1 from public.cvcrm_situacao where chave = 'em analise de credito' and revisar and situacao = 'indisponivel') then
    raise exception 'Situação nova não entrou para revisar';
  end if;
end $$;
-- 1007 não tem vínculo: vincular agora (Bloco 2 / 101 não existe no POUP; usa a 002 que ficou sem par).
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003',
  '[{"unitId": "c4000000-0000-4000-8000-000000000006", "cvUnidade": 1007, "origem": "manual"}]');
reset role;
do $$
begin
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000006') <> 'indisponivel' then
    raise exception 'Situação desconhecida não ficou cinza';
  end if;
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select public.cvcrm_classificar_situacao('em analise de credito', 'negociacao');
reset role;
do $$
begin
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000006') <> 'negociacao' then
    raise exception 'Reclassificar não repintou';
  end if;
  if exists (select 1 from public.cvcrm_situacao where chave = 'em analise de credito' and revisar) then
    raise exception 'Reclassificada continuou para revisar';
  end if;
end $$;


-- ===========================================================================
-- 8. O VÍNCULO É 1 PARA 1, SÓ COM O CV DO PRÓPRIO EMPREENDIMENTO
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
begin
  begin
    perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003', '[
      {"unitId": "c4000000-0000-4000-8000-000000000001", "cvUnidade": 1008},
      {"unitId": "c4000000-0000-4000-8000-000000000003", "cvUnidade": 1008}]');
    raise exception 'A mesma unidade do CV foi vinculada a duas do POUP';
  exception when others then
    if sqlerrm not like '%vinculo_repetido%' then raise; end if;
  end;
  begin
    -- 2002 é do Reserva II, que não é do Connect.
    perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003',
      '[{"unitId": "c4000000-0000-4000-8000-000000000001", "cvUnidade": 2002}]');
    raise exception 'Vinculou unidade de empreendimento do CV de outro';
  exception when others then
    if sqlerrm not like '%vinculo_invalido%' then raise; end if;
  end;
  begin
    -- A 1003 já é da unidade 101 do Bloco 1.
    perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003',
      '[{"unitId": "c4000000-0000-4000-8000-000000000005", "cvUnidade": 1003}]');
    raise exception 'Unidade do CV ficou com dois pares';
  exception when others then
    if sqlerrm not like '%unidade_cv_ja_vinculada%' then raise; end if;
  end;
  begin
    perform public.cvcrm_salvar_empreendimento('c2000000-0000-4000-8000-000000000004', 63, 2274, 'VILLAGE CONNECT I', null);
    raise exception 'O mesmo empreendimento do CV foi para dois do POUP';
  exception when others then
    if sqlerrm not like '%empreendimento_de_outro%' then raise; end if;
  end;
  -- Etapa: o Reserva II Mod II é a etapa 2264 do CV 55.
  perform public.cvcrm_salvar_empreendimento('c2000000-0000-4000-8000-000000000004', 55, 2264, 'VILLAGE RESERVA II', 'MODULO II');
  begin
    -- 2001 é do Módulo I.
    perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000004',
      '[{"unitId": "c4000000-0000-4000-8000-000000000009", "cvUnidade": 2001}]');
    raise exception 'Vinculou unidade de outra etapa do CV';
  exception when others then
    if sqlerrm not like '%vinculo_invalido%' then raise; end if;
  end;
  perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000004',
    '[{"unitId": "c4000000-0000-4000-8000-000000000009", "cvUnidade": 2002, "origem": "automatico"}]');
  -- Trocar duas unidades de par num só pedido não esbarra no índice único.
  perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003', '[
    {"unitId": "c4000000-0000-4000-8000-000000000003", "cvUnidade": 1004, "origem": "manual"},
    {"unitId": "c4000000-0000-4000-8000-000000000004", "cvUnidade": 1003, "origem": "manual"}]');
  perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003', '[
    {"unitId": "c4000000-0000-4000-8000-000000000003", "cvUnidade": 1003, "origem": "automatico"},
    {"unitId": "c4000000-0000-4000-8000-000000000004", "cvUnidade": 1004, "origem": "automatico"}]');
  begin
    perform public.cvcrm_salvar_empreendimento('c2000000-0000-4000-8000-000000000003', 0, null, null, null);
    raise exception 'Empreendimento do CV inválido aceito';
  exception when others then
    if sqlerrm not like '%empreendimento_invalido%' then raise; end if;
  end;
end $$;
reset role;
do $$
begin
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000009') <> 'negociacao' then
    raise exception 'Reserva II Mod II (etapa) não pintou';
  end if;
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000003') <> 'vendida' then
    raise exception 'A troca de pares não voltou ao lugar';
  end if;
end $$;


-- ===========================================================================
-- 9. CORRETOR LÊ, NÃO ESCREVE; ANÔNIMO NÃO ALCANÇA NADA
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
declare r jsonb;
begin
  r := public.disponibilidade_do_empreendimento('c2000000-0000-4000-8000-000000000003');
  if not (r ->> 'ativa')::boolean or jsonb_array_length(r -> 'unidades') < 5 then
    raise exception 'Corretor não leu a disponibilidade do catálogo: %', r;
  end if;
  if (r -> 'unidades') @> '[{"situacao": "sem_vinculo"}]' then
    raise exception 'A foto do corretor trouxe sem_vinculo';
  end if;
  if (select count(*) from public.development_unit_disponibilidade where development_id = 'c2000000-0000-4000-8000-000000000003') < 5 then
    raise exception 'Corretor não lê a tabela que o Realtime assina';
  end if;
  begin
    perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003', '[]', '{c4000000-0000-4000-8000-000000000001}');
    raise exception 'Corretor desvinculou';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  begin
    perform public.cvcrm_salvar_empreendimento('c2000000-0000-4000-8000-000000000003', 63, null, null, null);
    raise exception 'Corretor vinculou empreendimento do CV';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  begin
    perform public.cvcrm_classificar_situacao('reservada', 'disponivel');
    raise exception 'Corretor reclassificou situação';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  begin
    perform public.cvcrm_painel();
    raise exception 'Corretor abriu o painel do CV';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  begin
    perform public.cvcrm_conferencia('c2000000-0000-4000-8000-000000000003');
    raise exception 'Corretor abriu a conferência';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  begin
    perform public.cvcrm_aplicar_mudancas('[{"unidade": 1003, "situacao": "Disponível"}]');
    raise exception 'Corretor gravou leitura do CV';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.disponibilidade_recalcular(array['c4000000-0000-4000-8000-000000000001'::uuid]);
    raise exception 'Corretor recalculou a disponibilidade';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cvcrm_confere_segredo_do_cron(repeat('x', 40));
    raise exception 'Usuário do app consultou o segredo do cron';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.cvcrm_unidades) or exists (select 1 from public.development_unit_cvcrm)
     or exists (select 1 from public.cvcrm_sync_estado) then
    raise exception 'Corretor leu o espelho cru, os vínculos ou o estado das leituras';
  end if;
  -- Empreendimento que ele não lê: nem a foto.
  begin
    perform public.disponibilidade_do_empreendimento(gen_random_uuid());
    raise exception 'Leu empreendimento que não existe';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.development_unit_disponibilidade limit 1;
    raise exception 'Anônimo leu disponibilidade';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.disponibilidade_do_empreendimento('c2000000-0000-4000-8000-000000000003');
    raise exception 'Anônimo chamou a foto do corretor';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;


-- ===========================================================================
-- 10. APAGAR A UNIDADE DO POUP LEVA VÍNCULO E COR JUNTO
-- ===========================================================================
delete from public.development_units where id = 'c4000000-0000-4000-8000-000000000005';
do $$
begin
  if exists (select 1 from public.development_unit_cvcrm where unit_id = 'c4000000-0000-4000-8000-000000000005')
     or exists (select 1 from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000005') then
    raise exception 'Unidade apagada deixou vínculo ou cor para trás';
  end if;
  -- A unidade do CV continua no espelho e pode ser vinculada de novo.
  if not exists (select 1 from public.cvcrm_unidades where cv_unidade = 1005) then
    raise exception 'Apagar a unidade do POUP mexeu no espelho do CV';
  end if;
end $$;


-- ===========================================================================
-- 11. A TRAVA E O SEGREDO DO CRON
-- ===========================================================================
set local role service_role;
do $$
begin
  if not public.cvcrm_sync_iniciar('leve') then raise exception 'Primeira leitura não começou'; end if;
  if public.cvcrm_sync_iniciar('leve') then raise exception 'Duas leituras ao mesmo tempo'; end if;
  if not public.cvcrm_sync_iniciar('completo') then raise exception 'A trava de um modo segurou o outro'; end if;
  perform public.cvcrm_sync_terminar('leve', true, 3, 1, null, '{}'::jsonb, '2026-10-26 15:16:06');
  if not public.cvcrm_sync_iniciar('leve') then raise exception 'A trava não soltou'; end if;
  perform public.cvcrm_sync_terminar('leve', true, 0, 0, null, '{}'::jsonb, null);
  if (select cursor from public.cvcrm_sync_estado where modo = 'leve') <> '2026-10-26 15:16:06' then
    raise exception 'Leitura sem mudança apagou o cursor do CVDW';
  end if;
  if public.cvcrm_confere_segredo_do_cron(repeat('a', 40)) then
    raise exception 'Segredo aceito sem estar no Vault';
  end if;
end $$;
reset role;
insert into vault.secrets (name, secret) values ('cvcrm_sync_secret', repeat('s', 48));
set local role service_role;
do $$
begin
  if not public.cvcrm_confere_segredo_do_cron(repeat('s', 48)) then raise exception 'Segredo certo recusado'; end if;
  if public.cvcrm_confere_segredo_do_cron(repeat('s', 47) || 'x') then raise exception 'Segredo errado aceito'; end if;
  if public.cvcrm_confere_segredo_do_cron('curto') then raise exception 'Segredo curto aceito'; end if;
end $$;
reset role;


-- ===========================================================================
-- 12. TIRAR O EMPREENDIMENTO DO CV: SEM COR, SEM APAGAR
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare n integer; r jsonb;
begin
  n := public.cvcrm_remover_empreendimento('c2000000-0000-4000-8000-000000000003', 63, null);
  if n < 4 then raise exception 'Remover desvinculou só % unidades', n; end if;
  r := public.disponibilidade_do_empreendimento('c2000000-0000-4000-8000-000000000003');
  if (r ->> 'ativa')::boolean or jsonb_array_length(r -> 'unidades') <> 0 then
    raise exception 'Empreendimento sem CV continuou pintado: %', r;
  end if;
  -- Agora o Connect do CV está livre para outro empreendimento do POUP.
  perform public.cvcrm_salvar_empreendimento('c2000000-0000-4000-8000-000000000004', 63, null, null, null);
  perform public.cvcrm_remover_empreendimento('c2000000-0000-4000-8000-000000000004', 63, null);
  -- E volta para o Connect.
  perform public.cvcrm_salvar_empreendimento('c2000000-0000-4000-8000-000000000003', 63, null, null, null);
end $$;
reset role;
do $$
begin
  if (select count(*) from public.development_unit_cvcrm where development_id = 'c2000000-0000-4000-8000-000000000003') < 4 then
    raise exception 'Remover apagou a linha do vínculo (devia só ficar nula)';
  end if;
  if exists (select 1 from public.development_unit_cvcrm where development_id = 'c2000000-0000-4000-8000-000000000003' and cv_unidade is not null) then
    raise exception 'Remover deixou vínculo ativo';
  end if;
  if (select count(*) from public.development_cvcrm_empreendimentos where cv_empreendimento = 63) <> 1 then
    raise exception 'Vincular de novo criou linha duplicada';
  end if;
end $$;


-- ===========================================================================
-- 13. O UAU NÃO PINTA MAIS NADA
-- ===========================================================================
set local role service_role;
do $$
begin
  perform public.uau_aplicar_leitura(1, '259V', 'completo', '[
    {"produto": 366, "num_per": 1, "identificador": "Bloco 01 Apto 001", "status": 0, "descricao": "Disponível"}]');
end $$;
reset role;
insert into public.development_uau_obras (development_id, uau_empresa, uau_obra)
  values ('c2000000-0000-4000-8000-000000000003', 1, '259V');
insert into public.development_unit_uau (unit_id, development_id, uau_empresa, uau_produto, uau_num_per, identificador_no_vinculo, origem)
  values ('c4000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', 1, 366, 1, 'Bloco 01 Apto 001', 'manual');
set local role service_role;
do $$
begin
  perform public.uau_recalcular_disponibilidade(array['c4000000-0000-4000-8000-000000000001'::uuid]);
  perform public.uau_aplicar_leitura(1, '259V', 'completo', '[
    {"produto": 366, "num_per": 1, "identificador": "Bloco 01 Apto 001", "status": 2, "descricao": "Reservado"}]');
end $$;
reset role;
do $$
begin
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000001') <> 'sem_vinculo' then
    raise exception 'O UAU pintou a unidade';
  end if;
end $$;

select 'testar-disponibilidade-cvcrm-db: tudo certo' as resultado;
rollback;
