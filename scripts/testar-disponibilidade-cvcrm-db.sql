-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-disponibilidade-cvcrm-db.sql
-- (o Postgres local precisa de um esquema `vault` com create_secret/update_secret
--  e a view decrypted_secrets, como o do Supabase)
--
-- O que este arquivo prova, na ordem:
--   1. o identificador e a situação do CV são lidos do jeito que o CV escreve;
--   2. a atualização para "uma conta do CV por empresa" leva junto o que já
--      existia (a integração nasce pendente, e sem credencial não pinta);
--   3. a credencial: URL só do CV, token no Vault, nunca para o aplicativo;
--   4. a leitura completa entra no espelho e o admin vincula as unidades;
--   5. cada situação do CV vira a cor certa; a leitura repetida não regrava nada;
--   6. a leitura leve (histórico do CVDW) pega a mudança, por conta;
--   7. uma leitura quebrada (quase vazia) NÃO vira "tudo fora de venda";
--   8. unidade apagada no CV fica cinza; renomeada fica sem cor;
--   9. situação nova entra cinza para revisar; reclassificar repinta;
--  10. o vínculo é 1 para 1, só com o CV da empresa dona e da etapa certa;
--  11. DUAS contas do CV com os mesmos ids não se misturam;
--  12. corretor lê, não escreve; anônimo não alcança nada;
--  13. apagar a unidade do POUP leva vínculo e cor junto;
--  14. a trava, o segredo do cron, tirar empreendimento e desligar a integração.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20261020120000_disponibilidade_uau.sql
\ir ../supabase/migrations/20261026120000_disponibilidade_cvcrm.sql

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'corretor-a@example.invalid'),
  ('c0000000-0000-4000-8000-000000000003', 'admin@example.invalid');
insert into public.app_admins (user_id) values ('c0000000-0000-4000-8000-000000000003');

insert into public.companies (id, user_id, name, is_catalog, ativa) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Construtora do A', false, true),
  ('c1000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'Canopus', true, true),
  ('d1000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003', 'Outra Construtora', true, true);
insert into public.developments (id, user_id, company_id, name) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Residencial do A'),
  ('c2000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'Village Connect I'),
  ('c2000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'Village Reserva II - Mod II'),
  ('d2000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000004', 'Residencial da Outra');

insert into public.development_blocks (id, development_id, nome, ordem) values
  ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', 'Bloco 1', 0),
  ('c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', 'Bloco 2', 1),
  ('c3000000-0000-4000-8000-000000000009', 'c2000000-0000-4000-8000-000000000004', 'Bloco 27', 0),
  ('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000005', 'Bloco 1', 0);
insert into public.development_units (id, block_id, development_id, codigo, pavimento, ordem) values
  ('c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '001', 1, 0),
  ('c4000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '002', 1, 1),
  ('c4000000-0000-4000-8000-000000000003', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '101', 2, 2),
  ('c4000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', '102', 2, 3),
  ('c4000000-0000-4000-8000-000000000005', 'c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', '001', 1, 0),
  ('c4000000-0000-4000-8000-000000000006', 'c3000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000003', '002', 1, 1),
  ('c4000000-0000-4000-8000-000000000009', 'c3000000-0000-4000-8000-000000000009', 'c2000000-0000-4000-8000-000000000004', '304', 4, 0),
  ('d4000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000005', '001', 1, 0);


-- ===========================================================================
-- 0. COMO ESTAVA EM 26/10 DE MANHÃ: UMA CONTA SÓ, SEM INTEGRAÇÃO POR EMPRESA
-- ===========================================================================
select public.cvcrm_aplicar_leitura(63, null, 'completo', '[
  {"unidade": 1001, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 001", "situacao": "disponível"},
  {"unidade": 1002, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 002", "situacao": "reservada"}
]');
insert into public.development_cvcrm_empreendimentos (development_id, cv_empreendimento, nome_no_cv)
  values ('c2000000-0000-4000-8000-000000000003', 63, 'VILLAGE CONNECT I');
insert into public.development_unit_cvcrm (unit_id, development_id, cv_unidade, identificador_no_vinculo, origem)
  values ('c4000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', 1001, 'Bloco 01 Apto 001', 'automatico');

\ir ../supabase/migrations/20261026180000_cvcrm_por_empresa.sql
-- Idempotente: rodar duas vezes não muda nada.
\ir ../supabase/migrations/20261026180000_cvcrm_por_empresa.sql

-- O id da integração de cada empresa, para os testes.
create temp table _i (nome text primary key, id uuid);
grant all on _i to service_role, authenticated;


-- ===========================================================================
-- 1. O TEXTO DO CV
-- ===========================================================================
do $$
begin
  if public.cvcrm_identificador('Bloco 29', 'Apto 304') <> 'Bloco 29 Apto 304' then
    raise exception 'identificador Bloco + Apto';
  end if;
  if public.cvcrm_identificador('BLOCO 46', 'UNIDADE 304') <> 'BLOCO 46 UNIDADE 304' then
    raise exception 'identificador do Reserva II';
  end if;
  if public.cvcrm_identificador('TORRE 09', 'Torre 09 Apto 702') <> 'Torre 09 Apto 702' then
    raise exception 'identificador do Calhau repetiu a torre';
  end if;
  if public.cvcrm_identificador('QUADRA F', 'Quadra F Casa 19') <> 'Quadra F Casa 19' then
    raise exception 'identificador do Parque Ville repetiu a quadra';
  end if;
  if public.cvcrm_identificador('Bloco 1', 'Unidade 12') <> 'Bloco 1 Unidade 12' then
    raise exception 'UNIDADE confundida com prefixo de bloco';
  end if;
  if public.cvcrm_identificador('BLOCO 01', null) is not null then
    raise exception 'unidade sem nome ganhou identificador';
  end if;
  if public.cvcrm_chave_da_situacao('disponível') <> 'disponivel'
     or public.cvcrm_chave_da_situacao('  EM PROCESSO   DE RESERVA ') <> 'em processo de reserva'
     or public.cvcrm_chave_da_situacao('') is not null then
    raise exception 'chave da situação';
  end if;
end $$;


-- ===========================================================================
-- 2. A ATUALIZAÇÃO LEVOU O QUE JÁ EXISTIA
-- ===========================================================================
do $$
declare v uuid;
begin
  select id into v from public.cvcrm_integracoes
   where company_id = 'c1000000-0000-4000-8000-000000000003' and situacao = 'pendente' and url is null;
  if v is null then raise exception 'A Canopus não ganhou a integração pendente'; end if;
  insert into _i values ('canopus', v);
  if exists (select 1 from public.cvcrm_unidades where integracao_id is distinct from v)
     or exists (select 1 from public.development_unit_cvcrm where integracao_id is distinct from v)
     or exists (select 1 from public.development_cvcrm_empreendimentos where integracao_id is distinct from v) then
    raise exception 'Espelho ou vínculo sem a integração da Canopus';
  end if;
  if (select count(*) from public.cvcrm_integracoes) <> 1 then
    raise exception 'A atualização criou integração para quem não tinha CV';
  end if;
  if (select array_length(conkey, 1) from pg_constraint
       where conrelid = 'public.cvcrm_unidades'::regclass and contype = 'p') <> 2 then
    raise exception 'A chave do espelho não virou (conta, unidade)';
  end if;
end $$;

-- Pendente = sem credencial = sem cor para o corretor.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  if (public.disponibilidade_do_empreendimento('c2000000-0000-4000-8000-000000000003') ->> 'ativa')::boolean then
    raise exception 'Integração pendente pintou unidade';
  end if;
end $$;
reset role;


-- ===========================================================================
-- 3. A CREDENCIAL: URL DO CV, TOKEN NO VAULT, NUNCA PARA O APLICATIVO
-- ===========================================================================
set local role service_role;
do $$
declare r record;
begin
  perform public.cvcrm_salvar_integracao('c1000000-0000-4000-8000-000000000003',
    'https://Canopus.cvcrm.com.br', 'integracao@canopus.example', 'token-da-canopus', 'c0000000-0000-4000-8000-000000000003');
  select * into r from public.cvcrm_credencial((select id from _i where nome = 'canopus'));
  if r.token is distinct from 'token-da-canopus' or r.url <> 'https://canopus.cvcrm.com.br' then
    raise exception 'Credencial não voltou para a Edge Function: %', r;
  end if;
  -- Trocar só o e-mail mantém o token.
  perform public.cvcrm_salvar_integracao('c1000000-0000-4000-8000-000000000003',
    'https://canopus.cvcrm.com.br', 'outro@canopus.example', null, 'c0000000-0000-4000-8000-000000000003');
  select * into r from public.cvcrm_credencial((select id from _i where nome = 'canopus'));
  if r.token is distinct from 'token-da-canopus' or r.email <> 'outro@canopus.example' then
    raise exception 'Trocar o e-mail perdeu o token';
  end if;
  -- O token não fica na tabela da integração.
  if exists (select 1 from public.cvcrm_integracoes i where row_to_json(i)::text like '%token-da-canopus%') then
    raise exception 'O token ficou fora do Vault';
  end if;
  begin
    perform public.cvcrm_salvar_integracao('c1000000-0000-4000-8000-000000000003', 'https://exemplo.com', 'a@b', 'x', null);
    raise exception 'URL fora do CV aceita';
  exception when others then
    if sqlerrm not like '%url_invalida%' then raise; end if;
  end;
  begin
    perform public.cvcrm_salvar_integracao('c1000000-0000-4000-8000-000000000003', 'http://canopus.cvcrm.com.br', 'a@b', 'x', null);
    raise exception 'URL sem TLS aceita';
  exception when others then
    if sqlerrm not like '%url_invalida%' then raise; end if;
  end;
  begin
    perform public.cvcrm_salvar_integracao('c1000000-0000-4000-8000-000000000003', 'https://canopus.cvcrm.com.br.exemplo.com', 'a@b', 'x', null);
    raise exception 'URL que só começa como a do CV aceita';
  exception when others then
    if sqlerrm not like '%url_invalida%' then raise; end if;
  end;
  begin
    perform public.cvcrm_salvar_integracao('d1000000-0000-4000-8000-000000000004', 'https://outra.cvcrm.com.br', 'a@b', null, null);
    raise exception 'Integração nova sem token aceita';
  exception when others then
    if sqlerrm not like '%token_obrigatorio%' then raise; end if;
  end;
  insert into _i values ('outra', public.cvcrm_salvar_integracao('d1000000-0000-4000-8000-000000000004',
    'https://outra.cvcrm.com.br', 'api@outra.example', 'token-da-outra', 'c0000000-0000-4000-8000-000000000003'));
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare r jsonb;
begin
  r := public.cvcrm_integracao('c1000000-0000-4000-8000-000000000003');
  if r ->> 'url' <> 'https://canopus.cvcrm.com.br' or not (r ->> 'temToken')::boolean or r::text like '%token-da-canopus%' then
    raise exception 'O admin viu o token, ou não viu a integração: %', r;
  end if;
  if public.cvcrm_integracao('a1000000-0000-4000-8000-000000000001') is not null then
    raise exception 'Empresa sem CV apareceu integrada';
  end if;
  -- Nem o admin pega a credencial: só as Edge Functions.
  begin
    perform public.cvcrm_credencial((select id from _i where nome = 'canopus'));
    raise exception 'Usuário do app pegou a credencial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cvcrm_salvar_integracao('c1000000-0000-4000-8000-000000000003', 'https://canopus.cvcrm.com.br', 'a@b', 'x', null);
    raise exception 'Usuário do app gravou credencial sem passar pelo teste da Edge Function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.cvcrm_integracoes limit 1;
    raise exception 'Usuário do app leu a tabela das integrações';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;


-- ===========================================================================
-- 4. A LEITURA COMPLETA ENTRA NO ESPELHO; O ADMIN VINCULA
-- ===========================================================================
set local role service_role;
do $$
declare r jsonb; v uuid := (select id from _i where nome = 'canopus');
begin
  r := public.cvcrm_aplicar_leitura(v, 63, null, 'completo', '[
    {"unidade": 1001, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 001", "situacao": "disponível", "documento_bloqueio": "012.345.678-79"},
    {"unidade": 1002, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 002", "situacao": "reservada"},
    {"unidade": 1003, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 101", "situacao": "vendida"},
    {"unidade": 1004, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 102", "situacao": "bloqueada"},
    {"unidade": 1005, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 001", "situacao": "Em processo de reserva"},
    {"unidade": 1006, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 002", "situacao": "disponível"},
    {"unidade": 1007, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 101", "situacao": "disponível"},
    {"unidade": 1008, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 102", "situacao": "disponível"}
  ]');
  if (r ->> 'lidas')::int <> 8 or (r ->> 'novas')::int <> 6 then
    raise exception 'Leitura completa: %', r;
  end if;
  -- Etapas do Reserva II (Módulo I 2263, Módulo II 2264).
  perform public.cvcrm_aplicar_leitura(v, 55, null, 'completo', '[
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
  if (r -> 'cv') @> '[{"cvUnidade": 2001}]' then
    raise exception 'Conferência mostrou unidade de outro empreendimento do CV';
  end if;
  -- Empresa sem integração não vincula CV.
  begin
    perform public.cvcrm_salvar_empreendimento('a2000000-0000-4000-8000-000000000001', 63, null, null, null);
    raise exception 'Empreendimento de empresa sem CV foi vinculado';
  exception when others then
    if sqlerrm not like '%sem_permissao%' and sqlerrm not like '%sem_integracao%' then raise; end if;
  end;
end $$;
reset role;


-- ===========================================================================
-- 5. CADA SITUAÇÃO DO CV VIRA A COR CERTA; REPETIR NÃO REGRAVA
-- ===========================================================================
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
      raise exception 'Unidade % deveria estar % (%)', v.unit_id, v.situacao, v.descricao;
    end if;
  end loop;
end $$;

create temp table _antes as select unit_id, mudou_em from public.development_unit_disponibilidade;
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.cvcrm_aplicar_leitura((select id from _i where nome = 'canopus'), 63, null, 'completo', '[
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
end $$;


-- ===========================================================================
-- 6. A LEITURA LEVE, POR CONTA
-- ===========================================================================
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.cvcrm_aplicar_mudancas((select id from _i where nome = 'canopus'), '[
    {"unidade": 1001, "situacao": "Vendida"},
    {"unidade": 9999, "situacao": "Reservada"}
  ]', '2026-10-26 15:16:06');
  if (r ->> 'mudaram')::int <> 1 then raise exception 'Leve: %', r; end if;
  r := public.cvcrm_aplicar_mudancas((select id from _i where nome = 'canopus'), '[{"unidade": 1001, "situacao": "Vendida"}]', null);
  if (r ->> 'mudaram')::int <> 0 then raise exception 'Leve repetida regravou: %', r; end if;
end $$;
reset role;
do $$
begin
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000001') <> 'vendida' then
    raise exception 'A venda que chegou pela leve não pintou de vermelho';
  end if;
  if (select cvdw_cursor from public.cvcrm_integracoes where company_id = 'c1000000-0000-4000-8000-000000000003') <> '2026-10-26 15:16:06' then
    raise exception 'O cursor da conta não foi guardado (ou a leve sem cursor o apagou)';
  end if;
  if (select cvdw_cursor from public.cvcrm_integracoes where company_id = 'd1000000-0000-4000-8000-000000000004') is not null then
    raise exception 'O cursor de uma conta foi parar na outra';
  end if;
  if not exists (select 1 from public.development_cvcrm_empreendimentos where cv_empreendimento = 63 and ultimo_leve_em is not null) then
    raise exception 'A leve não marcou o frescor';
  end if;
end $$;


-- ===========================================================================
-- 7. LEITURA QUEBRADA NÃO VIRA "TUDO FORA DE VENDA"
-- ===========================================================================
update public.development_cvcrm_empreendimentos set ultimo_completo_em = '2026-01-01' where cv_empreendimento = 63;
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.cvcrm_aplicar_leitura((select id from _i where nome = 'canopus'), 63, null, 'completo', '[
    {"unidade": 1001, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 001", "situacao": "vendida"}
  ]');
  if not (r ->> 'suspeita')::boolean then raise exception 'Leitura cortada não foi marcada suspeita: %', r; end if;
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
-- 8. APAGADA NO CV FICA CINZA; RENOMEADA FICA SEM COR
-- ===========================================================================
set local role service_role;
do $$
declare r jsonb;
begin
  r := public.cvcrm_aplicar_leitura((select id from _i where nome = 'canopus'), 63, null, 'completo', '[
    {"unidade": 1001, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 001", "situacao": "vendida"},
    {"unidade": 1002, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 003", "situacao": "reservada"},
    {"unidade": 1003, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 101", "situacao": "vendida"},
    {"unidade": 1004, "etapa": 2274, "bloco_id": 3322, "bloco": "Bloco 01", "nome": "Apto 102", "situacao": "bloqueada"},
    {"unidade": 1005, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 001", "situacao": "Em processo de reserva"},
    {"unidade": 1007, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 101", "situacao": "disponível"},
    {"unidade": 1008, "etapa": 2274, "bloco_id": 3323, "bloco": "Bloco 02", "nome": "Apto 102", "situacao": "disponível"}
  ]');
  if (r ->> 'sumiram')::int <> 1 then raise exception 'Apagada no CV: %', r; end if;
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
  if exists (select 1 from public.cvcrm_unidades where cv_empreendimento = 55 and ausente_desde is not null) then
    raise exception 'Leitura de um empreendimento marcou unidade de outro';
  end if;
end $$;


-- ===========================================================================
-- 9. SITUAÇÃO NOVA ENTRA CINZA; RECLASSIFICAR REPINTA
-- ===========================================================================
set local role service_role;
select public.cvcrm_aplicar_mudancas((select id from _i where nome = 'canopus'), '[{"unidade": 1007, "situacao": "Em análise de crédito"}]', null);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003',
  '[{"unitId": "c4000000-0000-4000-8000-000000000006", "cvUnidade": 1007, "origem": "manual"}]');
reset role;
do $$
begin
  if not exists (select 1 from public.cvcrm_situacao where chave = 'em analise de credito' and revisar and situacao = 'indisponivel') then
    raise exception 'Situação nova não entrou para revisar';
  end if;
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
end $$;


-- ===========================================================================
-- 10. O VÍNCULO É 1 PARA 1, SÓ COM O CV DA EMPRESA DONA E DA ETAPA CERTA
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
    perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003',
      '[{"unitId": "c4000000-0000-4000-8000-000000000001", "cvUnidade": 2002}]');
    raise exception 'Vinculou unidade de empreendimento do CV de outro';
  exception when others then
    if sqlerrm not like '%vinculo_invalido%' then raise; end if;
  end;
  begin
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
  perform public.cvcrm_salvar_empreendimento('c2000000-0000-4000-8000-000000000004', 55, 2264, 'VILLAGE RESERVA II', 'MODULO II');
  begin
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
-- 11. DUAS CONTAS DO CV COM OS MESMOS IDS NÃO SE MISTURAM
-- ===========================================================================
-- A Outra Construtora também tem um empreendimento 63 e uma unidade 1001 no CV DELA.
set local role service_role;
select public.cvcrm_aplicar_leitura((select id from _i where nome = 'outra'), 63, null, 'completo', '[
  {"unidade": 1001, "etapa": 10, "bloco_id": 20, "bloco": "Bloco 01", "nome": "Apto 001", "situacao": "disponível"}
]');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
begin
  -- O 63 da Outra é outro empreendimento: não conflita com o 63 da Canopus.
  perform public.cvcrm_salvar_empreendimento('d2000000-0000-4000-8000-000000000005', 63, null, 'RESIDENCIAL DA OUTRA', null);
  perform public.cvcrm_salvar_vinculos('d2000000-0000-4000-8000-000000000005',
    '[{"unitId": "d4000000-0000-4000-8000-000000000001", "cvUnidade": 1001, "origem": "automatico"}]');
end $$;
reset role;
do $$
begin
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'd4000000-0000-4000-8000-000000000001') <> 'disponivel' then
    raise exception 'A unidade 1001 da Outra pegou a cor da 1001 da Canopus';
  end if;
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000001') <> 'vendida' then
    raise exception 'A unidade 1001 da Canopus mudou com a leitura da Outra';
  end if;
end $$;
-- Uma venda no CV da Outra não pinta a Canopus.
set local role service_role;
select public.cvcrm_aplicar_mudancas((select id from _i where nome = 'outra'), '[{"unidade": 1003, "situacao": "Disponível"}, {"unidade": 1001, "situacao": "Reservada"}]', null);
reset role;
do $$
begin
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000003') <> 'vendida' then
    raise exception 'A leve da Outra mexeu na unidade da Canopus';
  end if;
  if (select situacao from public.development_unit_disponibilidade where unit_id = 'd4000000-0000-4000-8000-000000000001') <> 'negociacao' then
    raise exception 'A leve da Outra não pintou a unidade dela';
  end if;
end $$;


-- ===========================================================================
-- 12. CORRETOR LÊ, NÃO ESCREVE; ANÔNIMO NÃO ALCANÇA NADA
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
  begin
    perform public.cvcrm_salvar_vinculos('c2000000-0000-4000-8000-000000000003', '[]', '{c4000000-0000-4000-8000-000000000001}');
    raise exception 'Corretor desvinculou';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  begin
    perform public.cvcrm_integracao('c1000000-0000-4000-8000-000000000003');
    raise exception 'Corretor viu a integração';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  begin
    perform public.cvcrm_remover_integracao('c1000000-0000-4000-8000-000000000003');
    raise exception 'Corretor desligou a integração';
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
    perform public.cvcrm_aplicar_mudancas((select id from _i where nome = 'canopus'), '[]', null);
    raise exception 'Corretor gravou leitura do CV';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.disponibilidade_recalcular(array['c4000000-0000-4000-8000-000000000001'::uuid]);
    raise exception 'Corretor recalculou a disponibilidade';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.cvcrm_unidades) or exists (select 1 from public.development_unit_cvcrm) then
    raise exception 'Corretor leu o espelho cru ou os vínculos';
  end if;
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
-- 13. APAGAR A UNIDADE DO POUP LEVA VÍNCULO E COR JUNTO
-- ===========================================================================
delete from public.development_units where id = 'c4000000-0000-4000-8000-000000000005';
do $$
begin
  if exists (select 1 from public.development_unit_cvcrm where unit_id = 'c4000000-0000-4000-8000-000000000005')
     or exists (select 1 from public.development_unit_disponibilidade where unit_id = 'c4000000-0000-4000-8000-000000000005') then
    raise exception 'Unidade apagada deixou vínculo ou cor para trás';
  end if;
end $$;


-- ===========================================================================
-- 14. TRAVA, SEGREDO DO CRON, TIRAR EMPREENDIMENTO, DESLIGAR A INTEGRAÇÃO
-- ===========================================================================
set local role service_role;
do $$
begin
  if not public.cvcrm_sync_iniciar('leve') then raise exception 'Primeira leitura não começou'; end if;
  if public.cvcrm_sync_iniciar('leve') then raise exception 'Duas leituras ao mesmo tempo'; end if;
  perform public.cvcrm_sync_terminar('leve', true, 3, 1, null, '{}'::jsonb, null);
  if not public.cvcrm_sync_iniciar('leve') then raise exception 'A trava não soltou'; end if;
  if public.cvcrm_confere_segredo_do_cron(repeat('a', 40)) then raise exception 'Segredo aceito sem estar no Vault'; end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare n integer; r jsonb;
begin
  n := public.cvcrm_remover_empreendimento('c2000000-0000-4000-8000-000000000004', 55, 2264);
  if n <> 1 then raise exception 'Tirar o Reserva II desvinculou % unidades', n; end if;
  -- Desligar a integração da Canopus: o token sai do Vault e nada da Canopus pinta.
  perform public.cvcrm_remover_integracao('c1000000-0000-4000-8000-000000000003');
  r := public.disponibilidade_do_empreendimento('c2000000-0000-4000-8000-000000000003');
  if (r ->> 'ativa')::boolean or jsonb_array_length(r -> 'unidades') <> 0 then
    raise exception 'Integração desligada continuou pintando: %', r;
  end if;
  -- A da Outra continua.
  if not (public.disponibilidade_do_empreendimento('d2000000-0000-4000-8000-000000000005') ->> 'ativa')::boolean then
    raise exception 'Desligar a Canopus desligou a Outra';
  end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from vault.decrypted_secrets where decrypted_secret = 'token-da-canopus') then
    raise exception 'Desligar a integração deixou o token no Vault';
  end if;
  -- Os vínculos ficam: integrar de novo devolve as cores.
  if (select count(*) from public.development_unit_cvcrm where development_id = 'c2000000-0000-4000-8000-000000000003' and cv_unidade is not null) < 4 then
    raise exception 'Desligar a integração apagou os vínculos';
  end if;
end $$;
set local role service_role;
do $$
begin
  if exists (select 1 from public.cvcrm_credencial((select id from _i where nome = 'canopus'))) then
    raise exception 'Integração desligada ainda entrega credencial';
  end if;
  perform public.cvcrm_salvar_integracao('c1000000-0000-4000-8000-000000000003',
    'https://canopus.cvcrm.com.br', 'integracao@canopus.example', 'token-novo', null);
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  if not (public.disponibilidade_do_empreendimento('c2000000-0000-4000-8000-000000000003') ->> 'ativa')::boolean then
    raise exception 'Integrar de novo não devolveu as cores';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 15. A LIMPEZA DO UAU E DA PRIMEIRA VERSÃO (duas vezes: rodar de novo não faz nada)
-- ---------------------------------------------------------------------------
select vault.create_secret('x', 'uau_sync_secret', 'teste');
\ir ../supabase/migrations/20261027120000_limpar_uau_e_cvcrm_antigo.sql
\ir ../supabase/migrations/20261027120000_limpar_uau_e_cvcrm_antigo.sql
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r'
                and (c.relname like 'uau%' or c.relname like '%\_uau%' or c.relname like '%\_antiga')) then
    raise exception 'Sobrou tabela do UAU ou da primeira versão';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and column_name like '%uau%') then
    raise exception 'Sobrou coluna do UAU';
  end if;
  if (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'uau%')
     is distinct from array['uau_disponibilidade', 'uau_empreendimentos_com_preco'] then
    raise exception 'Funções do UAU: só as duas de compatibilidade podem ficar';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname like 'cvcrm%' and p.prosrc like '%obsoleta%') then
    raise exception 'Sobrou função "obsoleta" da primeira versão';
  end if;
  if exists (select 1 from vault.secrets where name like 'uau%') then
    raise exception 'Sobrou segredo do UAU no Vault';
  end if;
  if not exists (select 1 from vault.secrets where name like 'cvcrm_token_%') then
    raise exception 'A limpeza levou o token do CV junto';
  end if;
end $$;
-- O app 1.0.1 continua vendo as cores do CV pelo nome antigo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
declare
  v jsonb := public.uau_disponibilidade('c2000000-0000-4000-8000-000000000003');
  n jsonb := public.disponibilidade_do_empreendimento('c2000000-0000-4000-8000-000000000003');
begin
  if not (v ->> 'temUau')::boolean or v -> 'unidades' is distinct from n -> 'unidades'
     or v ->> 'fontePreco' <> 'automatico' then
    raise exception 'Compatibilidade da 1.0.1 não devolve as cores do CV: %', v;
  end if;
  if exists (select 1 from public.uau_empreendimentos_com_preco()) then
    raise exception 'Compatibilidade da 1.0.1: nenhum empreendimento usa preço do UAU';
  end if;
  -- E as cores do CV continuam funcionando sem o UAU.
  if jsonb_array_length(n -> 'unidades') = 0 then
    raise exception 'A limpeza apagou as cores do CV';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 16. RESERVA E TABELA DE PREÇO DO CV (20261027130000), duas vezes
-- ---------------------------------------------------------------------------
-- O banco local não tem a tabela de preço nem as simulações: o mínimo delas.
create table if not exists public.development_price_tables (
  development_id uuid primary key references public.developments(id) on delete cascade,
  referencia text not null default '', regras jsonb not null default '[]'::jsonb, vagas jsonb,
  precos_unidades jsonb not null default '[]'::jsonb, arquivo_path text, arquivo_nome text,
  atualizado_em timestamptz not null default now(), atualizado_por uuid);
create table if not exists public.simulations (
  id uuid primary key, user_id uuid, company_id uuid, development_id uuid, state jsonb);
grant all on public.development_price_tables, public.simulations to service_role;
grant select on public.development_price_tables to authenticated;
\ir ../supabase/migrations/20261027130000_cvcrm_reserva_e_tabela.sql
\ir ../supabase/migrations/20261027130000_cvcrm_reserva_e_tabela.sql

-- A tabela manual que já estava valendo.
insert into public.development_price_tables (development_id, referencia, regras)
values ('c2000000-0000-4000-8000-000000000003', 'Setembro/2026', '[{"venda": 200000}]');

-- Corretor não liga; o admin liga; sem integração, não liga.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  begin
    perform public.cvcrm_definir_recursos('c1000000-0000-4000-8000-000000000003', true, true);
    raise exception 'Corretor ligou a reserva';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare v jsonb;
begin
  v := public.cvcrm_definir_recursos('c1000000-0000-4000-8000-000000000003', true, true);
  if not (v ->> 'reservaHabilitada')::boolean or not (v ->> 'tabelaPrecoCv')::boolean then
    raise exception 'O admin não ligou reserva e tabela: %', v;
  end if;
  begin
    perform public.cvcrm_definir_recursos('a1000000-0000-4000-8000-000000000001', true, null);
    raise exception 'Ligou a reserva sem integração';
  exception when others then
    if sqlerrm not like '%sem_integracao%' then raise; end if;
  end;
end $$;
reset role;

-- A trava: com a "Tabela de preço do CV" ligada, à mão não muda.
do $$
begin
  begin
    update public.development_price_tables set referencia = 'à mão'
     where development_id = 'c2000000-0000-4000-8000-000000000003';
    raise exception 'A tabela mudou à mão com a do CV ligada';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A tabela do CV entra pelo vínculo (a unidade sem vínculo fica de fora) e
-- guarda a manual; ler de novo não perde a manual; vazia não troca nada.
set local role service_role;
do $$
declare
  v jsonb;
  n integer;
  t record;
  u jsonb;
begin
  select count(*) into n from public.development_unit_cvcrm
   where development_id = 'c2000000-0000-4000-8000-000000000003' and cv_unidade is not null;
  select jsonb_agg(jsonb_build_object('cv_unidade', x.cv_unidade, 'venda', 250000 + x.cv_unidade, 'area_m2', 40.94))
    into u
    from (select cv_unidade from public.development_unit_cvcrm
           where development_id = 'c2000000-0000-4000-8000-000000000003' and cv_unidade is not null) x;
  u := u || '[{"cv_unidade": 999999, "venda": 1}]'::jsonb;
  v := public.cvcrm_aplicar_tabela_de_preco('c2000000-0000-4000-8000-000000000003', 77, 'Tabela Outubro', u);
  if (v ->> 'entraram')::int <> n or (v ->> 'lidas')::int <> n + 1 then
    raise exception 'Tabela do CV: entraram %, esperado %', v, n;
  end if;
  v := public.cvcrm_aplicar_tabela_de_preco('c2000000-0000-4000-8000-000000000003', 77, 'Tabela Outubro', u);
  select * into t from public.development_price_tables where development_id = 'c2000000-0000-4000-8000-000000000003';
  if t.fonte <> 'cv' or t.cv_tabela <> 77 or t.referencia <> 'CV · Tabela Outubro'
     or jsonb_array_length(t.precos_unidades) <> n or jsonb_array_length(t.regras) <> 0
     or t.manual_guardada ->> 'referencia' <> 'Setembro/2026' then
    raise exception 'A tabela do CV não ficou como devia: %', row_to_json(t);
  end if;
  if not exists (select 1 from jsonb_array_elements(t.precos_unidades) p
                  where p ->> 'bloco' = 'Bloco 1' and p ->> 'unidade' = '001') then
    raise exception 'O preço não saiu com o bloco e o código do POUP: %', t.precos_unidades;
  end if;
  v := public.cvcrm_aplicar_tabela_de_preco('c2000000-0000-4000-8000-000000000003', 78, 'Vazia', '[]');
  if (v ->> 'entraram')::int <> 0
     or (select cv_tabela from public.development_price_tables where development_id = 'c2000000-0000-4000-8000-000000000003') <> 77 then
    raise exception 'Tabela vazia do CV trocou a que estava valendo';
  end if;
end $$;
reset role;

-- Desligar devolve a manual, e à mão volta a poder; o CV não grava mais.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select public.cvcrm_definir_recursos('c1000000-0000-4000-8000-000000000003', null, false);
reset role;
do $$
declare t record;
begin
  select * into t from public.development_price_tables where development_id = 'c2000000-0000-4000-8000-000000000003';
  if t.fonte <> 'manual' or t.referencia <> 'Setembro/2026' or jsonb_array_length(t.regras) <> 1
     or t.manual_guardada is not null then
    raise exception 'Desligar não devolveu a tabela manual: %', row_to_json(t);
  end if;
  update public.development_price_tables set referencia = 'Outubro/2026'
   where development_id = 'c2000000-0000-4000-8000-000000000003';
end $$;
set local role service_role;
do $$
begin
  begin
    perform public.cvcrm_aplicar_tabela_de_preco('c2000000-0000-4000-8000-000000000003', 77, 'x', '[]');
    raise exception 'O CV gravou tabela com a chave desligada';
  exception when others then
    if sqlerrm not like '%tabela_do_cv_desligada%' then raise; end if;
  end;
end $$;
reset role;

-- Corretores: só hash, ids e imobiliária; linha torta não entra; ninguém do app lê.
set local role service_role;
do $$
declare v jsonb;
begin
  v := public.cvcrm_aplicar_corretores((select id from _i where nome = 'canopus'),
    jsonb_build_array(
      jsonb_build_object('cv_corretor', 10, 'documento_hash', repeat('a', 64), 'cv_imobiliaria', 3,
                         'imobiliaria', 'Imob X', 'ativo', true),
      jsonb_build_object('cv_corretor', 11, 'documento_hash', 'nao-e-hash'),
      jsonb_build_object('cv_corretor', 'x', 'documento_hash', repeat('b', 64))),
    '2026-10-27 10:00:00');
  if (v ->> 'gravados')::int <> 1 then raise exception 'Corretores gravados: %', v; end if;
  if (select corretores_cursor from public.cvcrm_integracoes where id = (select id from _i where nome = 'canopus'))
     <> '2026-10-27 10:00:00' then
    raise exception 'O cursor dos corretores não andou';
  end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  begin
    perform 1 from public.cvcrm_corretores limit 1;
    raise exception 'O app leu a tabela de corretores';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- O recibo: o mesmo pedido devolve o mesmo recibo; dois envios da mesma
-- unidade ao mesmo tempo, nunca; concluído, a unidade libera.
insert into public.simulations (id, user_id, company_id, development_id, state) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'c1000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000003',
   jsonb_build_object('unitId', (select unit_id from public.development_unit_cvcrm
                                  where development_id = 'c2000000-0000-4000-8000-000000000003'
                                    and cv_unidade is not null order by cv_unidade limit 1)));
set local role service_role;
do $$
declare
  a jsonb;
  b jsonb;
  i uuid := (select id from _i where nome = 'canopus');
begin
  a := public.cvcrm_reserva_abrir(i, 'e0000000-0000-4000-8000-000000000001', null, 5001,
         'a0000000-0000-4000-8000-000000000001', 'sim-1:5001', 'h', 1, 10, 3);
  b := public.cvcrm_reserva_abrir(i, 'e0000000-0000-4000-8000-000000000001', null, 5001,
         'a0000000-0000-4000-8000-000000000001', 'sim-1:5001', 'h', 1, 10, 3);
  if not (a ->> 'novo')::boolean or (b ->> 'novo')::boolean or a ->> 'id' <> b ->> 'id' then
    raise exception 'Recibo não é idempotente: % %', a, b;
  end if;
  begin
    perform public.cvcrm_reserva_abrir(i, null, null, 5001, 'a0000000-0000-4000-8000-000000000001', 'outro:5001', 'h', 1, 10, 3);
    raise exception 'Dois envios da mesma unidade ao mesmo tempo';
  exception when others then
    if sqlerrm not like '%reserva_em_andamento%' then raise; end if;
  end;
  perform public.cvcrm_reserva_concluir((a ->> 'id')::uuid, 'criada', 777, null);
  perform public.cvcrm_reserva_abrir(i, null, null, 5001, 'c0000000-0000-4000-8000-000000000003', 'outro:5001', 'h', 1, 10, 3);
end $$;
reset role;

-- O corretor vê o botão (reserva ligada, unidade com vínculo) e só os
-- próprios recibos.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
declare v jsonb;
begin
  v := public.cvcrm_reserva_da_simulacao('e0000000-0000-4000-8000-000000000001');
  if not (v ->> 'habilitada')::boolean or not (v ->> 'temVinculo')::boolean
     or v -> 'ultima' ->> 'situacao' <> 'criada' or (v -> 'ultima' ->> 'cvReserva')::int <> 777 then
    raise exception 'Reserva da simulação: %', v;
  end if;
  if (select count(*) from public.cvcrm_reservas) <> 1 then
    raise exception 'O corretor viu recibo de outra pessoa';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 17. O ENVIO DA RESERVA (20261027140000), duas vezes: séries e nova tentativa
-- ---------------------------------------------------------------------------
\ir ../supabase/migrations/20261027140000_cvcrm_reserva_envio.sql
\ir ../supabase/migrations/20261027140000_cvcrm_reserva_envio.sql

-- As séries vistas no CVDW entram (linha torta não); repetir não duplica.
set local role service_role;
do $$
declare v jsonb;
begin
  v := public.cvcrm_aplicar_series((select id from _i where nome = 'canopus'),
    '[{"cv_serie": 12, "nome": "Ato"}, {"cv_serie": 15, "nome": "Mensal"}, {"cv_serie": 15, "nome": "Mensal"},
      {"cv_serie": "x", "nome": "Torta"}, {"cv_serie": 3, "nome": ""}]'::jsonb, '2026-10-27 09:00:00');
  if (v ->> 'gravadas')::int <> 2 then raise exception 'Séries gravadas: %', v; end if;
  if (select count(*) from public.cvcrm_series where integracao_id = (select id from _i where nome = 'canopus')) <> 2 then
    raise exception 'Séries duplicadas ou faltando';
  end if;
end $$;
reset role;

-- O de-para: só o admin; parte desconhecida e id torto são recusados; nulo tira.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  begin
    perform public.cvcrm_definir_series('c1000000-0000-4000-8000-000000000003', '{"ato": 12}');
    raise exception 'Corretor escolheu série';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
do $$
declare v jsonb;
begin
  v := public.cvcrm_definir_series('c1000000-0000-4000-8000-000000000003', '{"ato": 12, "mensal": 15, "anual": null}');
  if v -> 'seriesReserva' <> '{"ato": 12, "mensal": 15}'::jsonb or jsonb_array_length(v -> 'series') <> 2 then
    raise exception 'De-para das séries: %', v;
  end if;
  begin
    perform public.cvcrm_definir_series('c1000000-0000-4000-8000-000000000003', '{"cupom": 12}');
    raise exception 'Aceitou parte desconhecida';
  exception when others then
    if sqlerrm not like '%serie_invalida%' then raise; end if;
  end;
  begin
    perform public.cvcrm_definir_series('c1000000-0000-4000-8000-000000000003', '{"ato": 1.5}');
    raise exception 'Aceitou série quebrada';
  exception when others then
    if sqlerrm not like '%serie_invalida%' then raise; end if;
  end;
end $$;
reset role;

-- O recibo: recusada → nova tentativa no mesmo recibo; criada → não reenvia;
-- enviando sem resposta há 5 min → destrava.
set local role service_role;
do $$
declare
  a jsonb;
  b jsonb;
  i uuid := (select id from _i where nome = 'canopus');
begin
  a := public.cvcrm_reserva_abrir(i, null, null, 6001, 'a0000000-0000-4000-8000-000000000001', 'sim-2:6001', 'h', 1, 10, 3);
  perform public.cvcrm_reserva_concluir((a ->> 'id')::uuid, 'recusada', null, 'Unidade indisponível para reserva.');
  b := public.cvcrm_reserva_abrir(i, null, null, 6001, 'a0000000-0000-4000-8000-000000000001', 'sim-2:6001', 'h2', 1, 10, 3);
  if not (b ->> 'novo')::boolean or b ->> 'id' <> a ->> 'id'
     or (select situacao from public.cvcrm_reservas where id = (a ->> 'id')::uuid) <> 'enviando' then
    raise exception 'Recusada não deixou tentar de novo: %', b;
  end if;
  perform public.cvcrm_reserva_concluir((a ->> 'id')::uuid, 'criada', 888, null);
  b := public.cvcrm_reserva_abrir(i, null, null, 6001, 'a0000000-0000-4000-8000-000000000001', 'sim-2:6001', 'h3', 1, 10, 3);
  if (b ->> 'novo')::boolean or (b ->> 'cvReserva')::int <> 888 then
    raise exception 'Reserva criada foi reenviada: %', b;
  end if;
  -- Um envio que ficou sem resposta.
  a := public.cvcrm_reserva_abrir(i, null, null, 6002, 'a0000000-0000-4000-8000-000000000001', 'sim-3:6002', 'h', 1, 10, 3);
  update public.cvcrm_reservas set criado_em = now() - interval '10 minutes' where id = (a ->> 'id')::uuid;
  b := public.cvcrm_reserva_abrir(i, null, null, 6002, 'a0000000-0000-4000-8000-000000000001', 'sim-3:6002', 'h', 1, 10, 3);
  if not (b ->> 'novo')::boolean then raise exception 'Envio sem resposta não destravou: %', b; end if;
  begin
    perform public.cvcrm_reserva_abrir(i, null, null, 6002, 'a0000000-0000-4000-8000-000000000001', 'sim-3:6002', 'h', 1, 10, 3);
    raise exception 'Dois envios ao mesmo tempo';
  exception when others then
    if sqlerrm not like '%reserva_em_andamento%' then raise; end if;
  end;
end $$;
reset role;

select 'testar-disponibilidade-cvcrm-db: tudo certo' as resultado;
rollback;
