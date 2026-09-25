-- Somente PostgreSQL local/homologação. Toda alteração é revertida ao final.
-- psql <URL_LOCAL> -X -v ON_ERROR_STOP=1 -f scripts/testar-ranking-db.sql
--
-- O que este arquivo prova (migration 20260925150000, o ranking):
--   1. só venda comprovada, com dados que se conferem, pontua — e cada venda
--      que não pontua diz por quê;
--   2. a mesma unidade em duas contas fica em disputa para as duas, e a
--      auditoria resolve;
--   3. desempate pelo VGV; cidade, estado e Brasil separados;
--   4. o teto de 20 por mês, liberável pela auditoria;
--   5. participar exige perfil completo, inclusive editando o perfil direto;
--   6. quem não participa ou foi bloqueado não aparece;
--   7. denúncia com limites; auditoria só para o admin; nada vaza;
--   8. o comprovante mora na pasta do dono.
\set ON_ERROR_STOP on
begin;
\ir ../supabase/migrations/20260925150000_ranking.sql
-- Idempotente.
\ir ../supabase/migrations/20260925150000_ranking.sql

-- Pessoas: A e B em São Luís, C em Imperatriz, D em São Paulo, E não participa,
-- F será bloqueado, G tem perfil incompleto, X é o admin, P1..P5 para o limite
-- de denúncias.
insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@example.invalid', '{}'
  from generate_series(1, 20) n;
-- 01=A 02=B 03=C 04=D 05=E 06=F 07=G 08=X 11..15=P1..P5
insert into public.app_admins (user_id) values ('00000000-0000-4000-8000-000000000008');

insert into public.profiles (id, full_name, agency, cpf, creci, uf, cidade) values
  ('00000000-0000-4000-8000-000000000001', 'Ana Maria Souza', 'Imob A', '52601815906', 'CRECI 1', 'MA', 'São Luís'),
  ('00000000-0000-4000-8000-000000000002', 'Bruno Lima', null, '08301661305', 'CRECI 2', 'MA', 'SAO  LUIS'),
  ('00000000-0000-4000-8000-000000000003', 'Carla Dias', null, '18609139034', 'CRECI 3', 'MA', 'Imperatriz'),
  ('00000000-0000-4000-8000-000000000004', 'Diego Alves', null, '99603082430', 'CRECI 4', 'SP', 'São Paulo'),
  ('00000000-0000-4000-8000-000000000005', 'Elisa Rocha', null, '62819482112', 'CRECI 5', 'MA', 'São Luís'),
  ('00000000-0000-4000-8000-000000000006', 'Fábio Nunes', null, '99351819019', 'CRECI 6', 'MA', 'São Luís'),
  ('00000000-0000-4000-8000-000000000007', 'Gabi', null, '93786579741', null, 'MA', null),
  ('00000000-0000-4000-8000-000000000008', 'Admin POUP', null, '54323194897', 'CRECI 8', 'MA', 'São Luís');
insert into public.profiles (id, full_name, cpf, creci, uf, cidade, ranking_participa)
select ('00000000-0000-4000-8000-0000000000' || n)::uuid, 'Pessoa ' || n,
       (array['75749118606','25276018987','55597971115','47104974601','50752917080'])[n - 10],
       'CRECI', 'MA', 'Caxias', true
  from generate_series(11, 15) n;

-- Participação: A, B, C, D, F entram pela função (como no aplicativo).
do $$
declare u text;
begin
  foreach u in array array['01', '02', '03', '04', '06'] loop
    perform set_config('request.jwt.claims', format('{"sub":"00000000-0000-4000-8000-0000000000%s","role":"authenticated"}', u), true);
    perform public.participar_do_ranking(true);
  end loop;
end $$;

-- O primeiro dia do mês corrente (sempre dentro do mês e nunca no futuro).
create temp table dia as select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as d;

-- Vendas (inseridas como sistema, com o dono certo).
insert into public.sales (id, user_id, client_cpf, development_name, block, unit, sale_value, sale_date, status, comprovante_path)
select v.id::uuid, v.u::uuid, v.cpf, v.emp, v.bl, v.uni, v.val, (select d from dia) + v.dias, v.st,
       case when v.comp then v.u || '/' || v.id || '/contrato.pdf' end
  from (values
    -- A: três comprovadas, e uma de cada motivo para não contar
    ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '56321223360', 'Village X', 1, '101', 300000, 0, 'ativa', true),
    ('a0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '07924402691', 'Village X', 1, '102', 300000, 0, 'ativa', true),
    ('a0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '85995289047', 'Residencial Y', 2, '201', 300000, 0, 'ativa', true),
    ('a0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '78666617667', 'Village X', 1, '103', 300000, 0, 'ativa', false),
    ('a0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', '11111111111', 'Village X', 1, '104', 300000, 0, 'ativa', true),
    ('a0000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', '03137215994', 'Village X', 1, '201', 300000, 400, 'ativa', true),
    ('a0000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001', '01092815945', 'Village X', 1, '202', 300000, 0, 'distratada', true),
    ('a0000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000001', '56321223360', 'village x', 1, '101', 300000, 0, 'ativa', true),
    ('a0000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000001', '01396245979', 'Village X', 1, '105', 5000, 0, 'ativa', true),
    -- B: três comprovadas (VGV menor) e uma que disputa a unidade 101 do Village X com A
    ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '57117777427', 'Condomínio Z', 1, '101', 250000, 0, 'ativa', true),
    ('b0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', '12154728030', 'Condomínio Z', 1, '102', 250000, 0, 'ativa', true),
    ('b0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '38528084132', 'Condomínio Z', 1, '103', 250000, 0, 'ativa', true),
    ('b0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', '48525388831', ' VILLAGE  X ', 1, '101', 250000, 0, 'ativa', true),
    -- C: uma
    ('c0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '53933633893', 'Vila Imperial', 1, '001', 200000, 0, 'ativa', true),
    -- E (não participa) e F (vai ser bloqueado): muitas vendas boas
    ('e0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', '75004743932', 'Torre E', 1, '001', 900000, 0, 'ativa', true),
    ('f0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000006', '57551313761', 'Torre F', 1, '001', 900000, 0, 'ativa', true)
  ) as v(id, u, cpf, emp, bl, uni, val, dias, st, comp);

-- D: 25 vendas comprovadas em São Paulo (o teto é 20).
insert into public.sales (user_id, client_cpf, development_name, block, unit, sale_value, sale_date, comprovante_path)
select '00000000-0000-4000-8000-000000000004', '35379907580', 'Paulista ' || n, 1, '101', 200000,
       (select d from dia), '00000000-0000-4000-8000-000000000004/d' || n || '/contrato.pdf'
  from generate_series(1, 25) n;


-- ===========================================================================
-- 1. O QUE CONTA E O QUE NÃO CONTA (visto pela própria A)
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare
  m jsonb;
begin
  select jsonb_object_agg(sale_id::text, situacao) into m from public.meu_ranking('mes');
  assert m->>'a0000000-0000-4000-8000-000000000002' = 'conta', 'a2 comprovada conta';
  assert m->>'a0000000-0000-4000-8000-000000000003' = 'conta', 'a3 comprovada conta';
  assert m->>'a0000000-0000-4000-8000-000000000001' = 'em_disputa', 'a1 disputa a unidade com B: ' || coalesce(m->>'a0000000-0000-4000-8000-000000000001', 'nulo');
  assert m->>'a0000000-0000-4000-8000-000000000004' = 'sem_comprovante', 'a4 sem comprovante';
  assert m->>'a0000000-0000-4000-8000-000000000005' = 'dados_incompletos', 'a5 CPF inválido';
  assert m->>'a0000000-0000-4000-8000-000000000007' = 'distratada', 'a7 distratada';
  assert m->>'a0000000-0000-4000-8000-000000000008' = 'duplicada', 'a8 é a mesma unidade de a1, na mesma conta';
  assert m->>'a0000000-0000-4000-8000-000000000009' = 'dados_incompletos', 'a9 valor fora da faixa';
  assert not (m ? 'a0000000-0000-4000-8000-000000000006'), 'a6 (data futura) nem entra no período';
  assert not (m ? 'b0000000-0000-4000-8000-000000000001'), 'A não vê a situação das vendas de B';
end $$;


-- ===========================================================================
-- 2 e 3. OS RANKINGS
-- ===========================================================================
do $$
declare
  nomes text;
  a record;
  b record;
begin
  select string_agg(nome || ':' || vendas || ':' || vgv::bigint, ', ' order by posicao) into nomes
    from public.ranking('cidade', 'mes');
  assert nomes = 'Bruno Lima:3:750000, Ana Souza:2:600000, Fábio Nunes:1:900000',
         'ranking de São Luís (nome = primeiro + último): ' || nomes;
  select * into a from public.ranking('cidade', 'mes') where eu;
  assert a.nome = 'Ana Souza' and a.posicao = 2, 'a linha de quem pergunta vem marcada';
  select * into b from public.ranking('cidade', 'mes') where nome = 'Bruno Lima';
  assert not b.eu and b.imobiliaria is null, 'os outros sem a marca';

  select string_agg(nome, ', ' order by posicao) into nomes from public.ranking('estado', 'mes');
  -- Carla e Fábio empatam em 1 venda: Fábio (R$ 900 mil) vem antes pelo VGV.
  assert nomes = 'Bruno Lima, Ana Souza, Fábio Nunes, Carla Dias', 'Maranhão: ' || nomes;

  select string_agg(nome || ':' || vendas, ', ' order by posicao) into nomes from public.ranking('brasil', 'mes');
  assert nomes = 'Diego Alves:20, Bruno Lima:3, Ana Souza:2, Fábio Nunes:1, Carla Dias:1',
         'Brasil (D limitado a 20): ' || nomes;

  select string_agg(nome, ', ' order by posicao) into nomes from public.ranking('brasil', 'ano');
  assert nomes like 'Diego Alves, Bruno Lima, Ana Souza%', 'o ano inclui o mês: ' || nomes;
end $$;

-- Quem não tem cidade no perfil não tem ranking da cidade (a tela pede para completar).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.ranking('cidade', 'mes')) = 0, 'sem cidade, sem ranking da cidade';
  assert (select count(*) from public.ranking('brasil', 'mes')) = 5, 'mas vê o Brasil';
  begin
    perform public.ranking('planeta', 'mes');
    raise exception 'escopo inválido deveria ser recusado';
  exception when others then
    assert sqlerrm = 'parametro_invalido', 'parâmetro inválido: ' || sqlerrm;
  end;
end $$;


-- ===========================================================================
-- 5. PARTICIPAR EXIGE PERFIL COMPLETO
-- ===========================================================================
do $$
begin
  begin
    perform public.participar_do_ranking(true);
    raise exception 'G (sem CRECI e sem cidade) não deveria entrar';
  exception when others then
    assert sqlerrm = 'perfil_incompleto', 'perfil incompleto: ' || sqlerrm;
  end;
  -- Pelo atalho (editando o perfil direto): o banco desliga sozinho.
  update public.profiles set ranking_participa = true where id = auth.uid();
  assert not (select ranking_participa from public.profiles where id = auth.uid()),
         'editar o perfil não contorna a exigência';
end $$;


-- ===========================================================================
-- 7. NADA VAZA E A AUDITORIA É SÓ DO ADMIN
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform 1 from public.ranking_revisoes;
    raise exception 'corretor não lê as revisões';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.ranking_situacao_das_vendas('2000-01-01', '2100-01-01');
    raise exception 'corretor não chama a função interna';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.ranking_auditoria('mes');
    raise exception 'corretor não vê a auditoria';
  exception when others then
    assert sqlerrm = 'sem_permissao', 'auditoria: ' || sqlerrm;
  end;
  begin
    perform public.ranking_revisar_venda('a0000000-0000-4000-8000-000000000001', 'valida');
    raise exception 'corretor não se autovalida';
  exception when others then
    assert sqlerrm = 'sem_permissao', 'revisar: ' || sqlerrm;
  end;
  assert (select count(*) from public.sales) = 9, 'A continua vendo só as vendas dela';
end $$;

-- Denúncias: A contesta B; repetir, a si mesma e em massa são recusados.
do $$
declare u text;
begin
  perform public.denunciar_no_ranking('00000000-0000-4000-8000-000000000002', 'Três vendas no mesmo dia, estranho.');
  begin
    perform public.denunciar_no_ranking('00000000-0000-4000-8000-000000000002', 'De novo o mesmo.');
    raise exception 'denúncia repetida deveria ser recusada';
  exception when others then assert sqlerrm = 'denuncia_repetida', sqlerrm;
  end;
  begin
    perform public.denunciar_no_ranking(auth.uid(), 'Eu mesma.');
    raise exception 'denunciar a si mesma deveria ser recusado';
  exception when others then assert sqlerrm = 'alvo_invalido', sqlerrm;
  end;
  begin
    perform public.denunciar_no_ranking('00000000-0000-4000-8000-000000000005', 'Não participa.');
    raise exception 'denunciar quem não participa deveria ser recusado';
  exception when others then assert sqlerrm = 'alvo_invalido', sqlerrm;
  end;
  foreach u in array array['11', '12', '13', '14'] loop
    perform public.denunciar_no_ranking(('00000000-0000-4000-8000-0000000000' || u)::uuid, 'Motivo qualquer.');
  end loop;
  begin
    perform public.denunciar_no_ranking('00000000-0000-4000-8000-000000000015', 'A sexta do dia.');
    raise exception 'a sexta denúncia do dia deveria ser recusada';
  exception when others then assert sqlerrm = 'denuncias_demais', sqlerrm;
  end;
end $$;


-- ===========================================================================
-- 2, 4 e 6. A AUDITORIA RESOLVE
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
do $$
declare
  n integer;
  nomes text;
begin
  select count(*) into n from public.ranking_auditoria('mes') where situacao = 'em_disputa';
  assert n = 2, 'a auditoria vê as duas vendas em disputa (a1 e b4): ' || n;
  select count(*) into n from public.ranking_auditoria('mes') where situacao = 'acima_do_teto';
  assert n = 5, 'e as 5 excedentes do teto de D: ' || n;
  select max(denuncias) into n from public.ranking_auditoria('mes') where corretor = '00000000-0000-4000-8000-000000000002';
  assert n = 1, 'e a denúncia contra B';
  assert (select comprovante_path from public.ranking_auditoria('mes') where sale_id = 'a0000000-0000-4000-8000-000000000001')
         like '00000000-0000-4000-8000-000000000001/%', 'com o caminho do comprovante para abrir';

  -- A unidade 101 era da A: valida a1, invalida b4.
  perform public.ranking_revisar_venda('a0000000-0000-4000-8000-000000000001', 'valida', 'Contrato conferido.');
  perform public.ranking_revisar_venda('b0000000-0000-4000-8000-000000000004', 'invalida', 'Unidade de outro corretor.');
  -- Libera uma excedente de D.
  perform public.ranking_revisar_venda(
    (select sale_id from public.ranking_auditoria('mes') where situacao = 'acima_do_teto' limit 1), 'valida');
  -- F fraudou: fora do ranking.
  perform public.ranking_bloquear('00000000-0000-4000-8000-000000000006', 'Comprovantes falsos.');
  -- B foi conferido: denúncia arquivada.
  perform public.ranking_arquivar_denuncias('00000000-0000-4000-8000-000000000002');

  select string_agg(nome || ':' || vendas || ':' || vgv::bigint, ', ' order by posicao) into nomes
    from public.ranking('cidade', 'mes');
  assert nomes = 'Ana Souza:3:900000, Bruno Lima:3:750000',
         'São Luís depois da auditoria: empate em 3, A na frente pelo VGV; F saiu; o admin não participa: ' || nomes;
  select string_agg(nome || ':' || vendas, ', ' order by posicao) into nomes from public.ranking('brasil', 'mes');
  assert nomes like 'Diego Alves:21, Ana Souza:3, Bruno Lima:3, Carla Dias:1%', 'D com a excedente liberada: ' || nomes;
  assert (select max(denuncias) from public.ranking_auditoria('mes') where corretor = '00000000-0000-4000-8000-000000000002') = 0,
         'denúncia arquivada';

  -- Desfazer a validação de a1: como b4 foi invalidada, não há mais disputa
  -- e a1 continua contando por si.
  perform public.ranking_revisar_venda('a0000000-0000-4000-8000-000000000001', null);
  assert (select situacao from public.ranking_auditoria('mes') where sale_id = 'a0000000-0000-4000-8000-000000000001') = 'conta',
         'venda invalidada não disputa: a1 conta sem precisar de validação';
end $$;


-- ===========================================================================
-- 8. O COMPROVANTE MORA NA PASTA DO DONO
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    update public.sales set comprovante_path = '00000000-0000-4000-8000-000000000002/x/contrato.pdf'
     where id = 'a0000000-0000-4000-8000-000000000004';
    raise exception 'apontar para a pasta de outra conta deveria ser recusado';
  exception when check_violation then null;
  end;
  update public.sales set comprovante_path = '00000000-0000-4000-8000-000000000001/a4/contrato.pdf'
   where id = 'a0000000-0000-4000-8000-000000000004';
  assert (select situacao from public.meu_ranking('mes') where sale_id = 'a0000000-0000-4000-8000-000000000004') = 'conta',
         'anexou o comprovante: a venda passa a contar';

  insert into storage.objects (bucket_id, name) values ('comprovantes-venda', '00000000-0000-4000-8000-000000000001/a4/contrato.pdf');
  begin
    insert into storage.objects (bucket_id, name) values ('comprovantes-venda', '00000000-0000-4000-8000-000000000002/x/intruso.pdf');
    raise exception 'A não grava na pasta de B';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'comprovantes-venda') = 0, 'B não vê o comprovante de A';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'comprovantes-venda') = 1, 'a auditoria abre o comprovante de A';
end $$;

reset role;
select 'ranking: todas as verificações passaram' as resultado;
rollback;
