-- ===========================================================================
-- CV CRM: RESERVA DE UNIDADE E TABELA DE PREÇO (A PREPARAÇÃO)
-- ===========================================================================
-- Pedido do dono do POUP (27/10/2026): na integração de cada construtora,
-- dois botões que só o admin liga:
--
--   * "Habilitar reserva": o corretor reserva a unidade no CV a partir do
--     relatório da simulação. O CPF do cliente é a chave com o pré-cadastro
--     no CV, e o CPF do corretor (perfil do POUP) acha o corretor e a
--     imobiliária dele no CV — nunca o usuário da integração.
--   * "Tabela de preço do CV": ligada, o preço dos empreendimentos da
--     construtora vem SÓ da tabela do CV (a enviada à mão fica guardada e
--     volta se desligar).
--
-- O que esta migration traz:
--   1. as chaves na integração (tabela_preco_cv; reserva_habilitada já existe)
--      e a tabela escolhida por empreendimento do CV;
--   2. os corretores do CV, guardados pelo HASH do CPF (sem nome, sem CPF);
--   3. o recibo de cada pedido de reserva (a fonte da verdade é o CV);
--   4. a tabela de preço vinda do CV, com a manual guardada e a trava que
--      impede a troca à mão enquanto a chave estiver ligada;
--   5. as RPCs (admin liga/desliga; as Edge Functions gravam).
--
-- O ENVIO da reserva ao CV fica travado na Edge Function `cvcrm-reserva`
-- até o formulário do CV ser confirmado (docs/CVCRM_RESERVA.md).
--
-- DEPENDE DE: 20261026180000_cvcrm_por_empresa.sql e
--             20260925100000_tabela_modelo_poup.sql.
-- MIGRATION IDEMPOTENTE e sem remover nada.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. AS CHAVES
-- ---------------------------------------------------------------------------

alter table public.cvcrm_integracoes
  add column if not exists tabela_preco_cv boolean not null default false,
  add column if not exists corretores_cursor text,
  add column if not exists corretores_lidos_em timestamptz,
  add column if not exists corretores_erro text,
  add column if not exists tabela_lida_em timestamptz,
  add column if not exists tabela_erro text;

comment on column public.cvcrm_integracoes.reserva_habilitada is
  'Liga o botão "Reservar no CV" nos relatórios dos corretores. Só o admin liga (cvcrm_definir_recursos).';
comment on column public.cvcrm_integracoes.tabela_preco_cv is
  'Ligada: o preço dos empreendimentos da construtora vem só da tabela do CV.';

-- A tabela do CV usada no empreendimento. Nula = a automática (aprovada e
-- vigente; havendo mais de uma, a de vigência mais recente).
alter table public.development_cvcrm_empreendimentos
  add column if not exists cv_tabela integer,
  add column if not exists cv_tabela_nome text,
  add column if not exists tabela_erro text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'development_cvcrm_empreendimentos_cv_tabela_valida') then
    alter table public.development_cvcrm_empreendimentos
      add constraint development_cvcrm_empreendimentos_cv_tabela_valida check (cv_tabela is null or cv_tabela > 0);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. OS CORRETORES DO CV, PELO HASH DO CPF
-- ---------------------------------------------------------------------------
-- Lidos do CVDW (`/cvdw/corretores`). Do corretor, o POUP guarda só o que
-- precisa para achar "quem é este usuário no CV": o hash do CPF (sha256 de
-- "poup-cv:" + os 11 dígitos, calculado na Edge Function), os ids do CV e o
-- nome da imobiliária. Nome, e-mail e CPF do corretor não entram no banco.

create table if not exists public.cvcrm_corretores (
  integracao_id uuid not null references public.cvcrm_integracoes(id) on delete cascade,
  cv_corretor integer not null check (cv_corretor > 0),
  documento_hash text not null check (documento_hash ~ '^[0-9a-f]{64}$'),
  cv_imobiliaria integer,
  imobiliaria text,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  primary key (integracao_id, cv_corretor)
);

create index if not exists cvcrm_corretores_por_documento
  on public.cvcrm_corretores (integracao_id, documento_hash);

comment on table public.cvcrm_corretores is
  'Corretores do CV de cada conta, pelo hash do CPF. Só para achar o corretor e a imobiliária certos na reserva.';

alter table public.cvcrm_corretores enable row level security;
revoke all on public.cvcrm_corretores from public, anon, authenticated;
grant all on public.cvcrm_corretores to service_role;


-- ---------------------------------------------------------------------------
-- 3. O RECIBO DE CADA PEDIDO DE RESERVA
-- ---------------------------------------------------------------------------
-- A reserva é do CV. O POUP guarda quem pediu, quando, para qual unidade e o
-- número que o CV devolveu. Sem CPF e sem o corpo enviado (só o hash dele).

create table if not exists public.cvcrm_reservas (
  id uuid primary key default gen_random_uuid(),
  integracao_id uuid not null references public.cvcrm_integracoes(id) on delete cascade,
  simulation_id uuid,
  unit_id uuid references public.development_units(id) on delete set null,
  cv_unidade integer not null,
  pedido_por uuid not null,
  -- simulação + unidade: o mesmo pedido repetido devolve o mesmo recibo.
  chave_idempotencia text not null unique,
  situacao text not null check (situacao in ('enviando', 'criada', 'recusada', 'erro')),
  cv_reserva integer,
  cv_precadastro integer,
  cv_corretor integer,
  cv_imobiliaria integer,
  erro text,
  corpo_hash text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);

-- Dois pedidos "enviando" para a mesma unidade: nunca.
create unique index if not exists cvcrm_reservas_um_envio_por_unidade
  on public.cvcrm_reservas (integracao_id, cv_unidade) where situacao = 'enviando';
create index if not exists cvcrm_reservas_por_simulacao on public.cvcrm_reservas (simulation_id);

alter table public.cvcrm_reservas enable row level security;
revoke all on public.cvcrm_reservas from public, anon, authenticated;
grant select on public.cvcrm_reservas to authenticated;
grant all on public.cvcrm_reservas to service_role;

-- O corretor lê os próprios recibos; o admin, todos. Só a Edge Function grava.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'cvcrm_reservas' and policyname = 'cvcrm_reservas_select') then
    create policy cvcrm_reservas_select on public.cvcrm_reservas for select to authenticated
      using (pedido_por = auth.uid() or public.is_app_admin());
  end if;
end $$;

-- Abre o pedido (ou devolve o que já existe com a mesma chave).
create or replace function public.cvcrm_reserva_abrir(
  p_integracao uuid, p_simulation uuid, p_unit uuid, p_cv_unidade integer, p_por uuid, p_chave text,
  p_corpo_hash text, p_precadastro integer, p_corretor integer, p_imobiliaria integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.cvcrm_reservas;
begin
  select * into r from public.cvcrm_reservas where chave_idempotencia = p_chave;
  if found then
    return jsonb_build_object('id', r.id, 'novo', false, 'situacao', r.situacao, 'cvReserva', r.cv_reserva);
  end if;
  begin
    insert into public.cvcrm_reservas (integracao_id, simulation_id, unit_id, cv_unidade, pedido_por,
      chave_idempotencia, situacao, corpo_hash, cv_precadastro, cv_corretor, cv_imobiliaria)
    values (p_integracao, p_simulation, p_unit, p_cv_unidade, p_por, p_chave, 'enviando', p_corpo_hash,
      p_precadastro, p_corretor, p_imobiliaria)
    returning * into r;
  exception when unique_violation then
    raise exception 'reserva_em_andamento' using errcode = '23505';
  end;
  return jsonb_build_object('id', r.id, 'novo', true, 'situacao', r.situacao, 'cvReserva', null);
end;
$$;

create or replace function public.cvcrm_reserva_concluir(p_id uuid, p_situacao text, p_cv_reserva integer, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cvcrm_reservas
     set situacao = p_situacao, cv_reserva = p_cv_reserva, erro = left(p_erro, 1000), respondido_em = now()
   where id = p_id and situacao = 'enviando' and p_situacao in ('criada', 'recusada', 'erro');
$$;

revoke all on function public.cvcrm_reserva_abrir(uuid, uuid, uuid, integer, uuid, text, text, integer, integer, integer),
  public.cvcrm_reserva_concluir(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.cvcrm_reserva_abrir(uuid, uuid, uuid, integer, uuid, text, text, integer, integer, integer),
  public.cvcrm_reserva_concluir(uuid, text, integer, text)
  to service_role;


-- ---------------------------------------------------------------------------
-- 4. A TABELA DE PREÇO VINDA DO CV
-- ---------------------------------------------------------------------------

alter table public.development_price_tables
  add column if not exists fonte text not null default 'manual',
  add column if not exists cv_tabela integer,
  add column if not exists manual_guardada jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'development_price_tables_fonte_valida') then
    alter table public.development_price_tables
      add constraint development_price_tables_fonte_valida check (fonte in ('manual', 'cv'));
  end if;
end $$;

comment on column public.development_price_tables.fonte is
  'manual: enviada pelo corretor/admin. cv: lida da tabela de preço do CV da construtora.';
comment on column public.development_price_tables.manual_guardada is
  'A tabela manual de antes do CV assumir. Volta quando a "Tabela de preço do CV" é desligada.';

-- A trava: com a chave ligada, a tabela só muda pelo CV. A gravação do CV
-- avisa por `poup.cvcrm_tabela` (só dentro da própria transação).
create or replace function public.cvcrm_tabela_preco_protegida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('poup.cvcrm_tabela', true), '') = 'on' then
    return new;
  end if;
  if exists (
    select 1 from public.developments d
      join public.cvcrm_integracoes i on i.company_id = d.company_id
     where d.id = new.development_id and i.tabela_preco_cv
  ) then
    raise exception 'tabela_do_cv' using errcode = '42501',
      hint = 'A tabela de preço desta construtora vem do CV. Desligue no cadastro da construtora para enviar à mão.';
  end if;
  new.fonte := 'manual';
  return new;
end;
$$;

create or replace trigger cvcrm_tabela_preco_protegida
  before insert or update on public.development_price_tables
  for each row execute function public.cvcrm_tabela_preco_protegida();

-- Grava a tabela lida do CV no empreendimento. `p_unidades`:
--   [{ "cv_unidade": 35503, "venda": 244780.00, "area_m2": 40.94, "avaliacao": 231900 | null }]
-- Só entram as unidades vinculadas a este empreendimento (pelo vínculo do CV),
-- com o bloco e o código do POUP. Devolve quantas entraram e quantas não
-- tinham vínculo.
create or replace function public.cvcrm_aplicar_tabela_de_preco(
  p_development uuid, p_cv_tabela integer, p_nome text, p_unidades jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_integracao uuid;
  v_precos jsonb;
  v_entraram integer;
  v_lidas integer;
begin
  select i.id into v_integracao
    from public.developments d join public.cvcrm_integracoes i on i.company_id = d.company_id
   where d.id = p_development and i.tabela_preco_cv;
  if v_integracao is null then
    raise exception 'tabela_do_cv_desligada' using errcode = '22023';
  end if;
  if p_unidades is null or jsonb_typeof(p_unidades) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  v_lidas := jsonb_array_length(p_unidades);

  select coalesce(jsonb_agg(jsonb_build_object(
           'bloco', b.nome, 'unidade', du.codigo, 'venda', round((x->>'venda')::numeric, 2),
           'area_m2', nullif(x->>'area_m2', '')::numeric, 'avaliacao', nullif(x->>'avaliacao', '')::numeric,
           'vaga', null)
           order by b.ordem, du.pavimento, du.ordem), '[]'::jsonb),
         count(*)
    into v_precos, v_entraram
    from jsonb_array_elements(p_unidades) x
    join public.development_unit_cvcrm l
      on l.integracao_id = v_integracao and l.cv_unidade = (x->>'cv_unidade')::integer
     and l.development_id = p_development
    join public.development_units du on du.id = l.unit_id
    join public.development_blocks b on b.id = du.block_id
   where (x->>'venda') ~ '^[0-9]+(\.[0-9]+)?$' and (x->>'venda')::numeric > 0;

  if v_entraram = 0 then
    -- Nada casou: não troca a tabela que está valendo.
    update public.development_cvcrm_empreendimentos
       set tabela_erro = 'A tabela do CV não trouxe preço para nenhuma unidade vinculada.'
     where development_id = p_development and integracao_id = v_integracao;
    return jsonb_build_object('entraram', 0, 'lidas', v_lidas);
  end if;

  perform set_config('poup.cvcrm_tabela', 'on', true);
  insert into public.development_price_tables as t
    (development_id, referencia, regras, vagas, precos_unidades, arquivo_path, arquivo_nome,
     atualizado_em, atualizado_por, fonte, cv_tabela, manual_guardada)
  values (p_development, left('CV · ' || coalesce(nullif(btrim(p_nome), ''), 'tabela ' || p_cv_tabela), 60),
          '[]'::jsonb, null, v_precos, null, null, now(), null, 'cv', p_cv_tabela, null)
  on conflict (development_id) do update
     set manual_guardada = case when t.fonte = 'manual'
                                then jsonb_build_object('referencia', t.referencia, 'regras', t.regras, 'vagas', t.vagas,
                                       'precos_unidades', t.precos_unidades, 'arquivo_path', t.arquivo_path,
                                       'arquivo_nome', t.arquivo_nome, 'atualizado_em', t.atualizado_em)
                                else t.manual_guardada end,
         referencia = excluded.referencia,
         regras = '[]'::jsonb,
         vagas = null,
         precos_unidades = excluded.precos_unidades,
         arquivo_path = null,
         arquivo_nome = null,
         atualizado_em = now(),
         atualizado_por = null,
         fonte = 'cv',
         cv_tabela = excluded.cv_tabela;
  perform set_config('poup.cvcrm_tabela', '', true);

  update public.development_cvcrm_empreendimentos
     set cv_tabela_nome = p_nome, tabela_erro = null
   where development_id = p_development and integracao_id = v_integracao;
  return jsonb_build_object('entraram', v_entraram, 'lidas', v_lidas);
end;
$$;

-- Erro ao ler a tabela de um empreendimento (ou da conta, com p_development nulo).
create or replace function public.cvcrm_registrar_erro_tabela(p_integracao uuid, p_development uuid, p_erro text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_development is null then
    update public.cvcrm_integracoes set tabela_erro = left(p_erro, 1000), tabela_lida_em = now()
     where id = p_integracao;
  else
    update public.development_cvcrm_empreendimentos set tabela_erro = left(p_erro, 1000)
     where integracao_id = p_integracao and development_id = p_development;
  end if;
end;
$$;

revoke all on function public.cvcrm_aplicar_tabela_de_preco(uuid, integer, text, jsonb),
  public.cvcrm_registrar_erro_tabela(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cvcrm_aplicar_tabela_de_preco(uuid, integer, text, jsonb),
  public.cvcrm_registrar_erro_tabela(uuid, uuid, text)
  to service_role;


-- ---------------------------------------------------------------------------
-- 5. OS CORRETORES: A EDGE FUNCTION GRAVA
-- ---------------------------------------------------------------------------
-- `p_corretores`: [{ "cv_corretor", "documento_hash", "cv_imobiliaria", "imobiliaria", "ativo" }]
create or replace function public.cvcrm_aplicar_corretores(p_integracao uuid, p_corretores jsonb, p_cursor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if p_corretores is null or jsonb_typeof(p_corretores) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  insert into public.cvcrm_corretores as c
    (integracao_id, cv_corretor, documento_hash, cv_imobiliaria, imobiliaria, ativo, atualizado_em)
  select p_integracao, (x->>'cv_corretor')::integer, x->>'documento_hash',
         nullif(x->>'cv_imobiliaria', '')::integer, left(x->>'imobiliaria', 120),
         coalesce((x->>'ativo')::boolean, true), now()
    from jsonb_array_elements(p_corretores) x
   where (x->>'cv_corretor') ~ '^[0-9]+$' and (x->>'documento_hash') ~ '^[0-9a-f]{64}$'
  on conflict (integracao_id, cv_corretor) do update
     set documento_hash = excluded.documento_hash,
         cv_imobiliaria = excluded.cv_imobiliaria,
         imobiliaria = excluded.imobiliaria,
         ativo = excluded.ativo,
         atualizado_em = now();
  get diagnostics v_n = row_count;
  update public.cvcrm_integracoes
     set corretores_cursor = coalesce(p_cursor, corretores_cursor),
         corretores_lidos_em = now(),
         corretores_erro = null
   where id = p_integracao;
  return jsonb_build_object('gravados', v_n);
end;
$$;

create or replace function public.cvcrm_registrar_erro_corretores(p_integracao uuid, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cvcrm_integracoes set corretores_erro = left(p_erro, 1000), corretores_lidos_em = now()
   where id = p_integracao;
$$;

revoke all on function public.cvcrm_aplicar_corretores(uuid, jsonb, text),
  public.cvcrm_registrar_erro_corretores(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cvcrm_aplicar_corretores(uuid, jsonb, text),
  public.cvcrm_registrar_erro_corretores(uuid, text)
  to service_role;


-- ---------------------------------------------------------------------------
-- 6. O ADMIN LIGA E DESLIGA
-- ---------------------------------------------------------------------------
-- Nulo = não mexe. Ligar exige a conta conectada. Desligar a tabela do CV
-- devolve a tabela manual que estava antes (ou deixa o empreendimento sem
-- tabela, se não havia nenhuma).
create or replace function public.cvcrm_definir_recursos(
  p_company uuid, p_reserva boolean default null, p_tabela_preco boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i public.cvcrm_integracoes;
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into i from public.cvcrm_integracoes where company_id = p_company;
  if not found then
    raise exception 'sem_integracao' using errcode = '22023';
  end if;
  if (coalesce(p_reserva, false) or coalesce(p_tabela_preco, false))
     and not (i.ativo and i.situacao <> 'pendente' and i.token_secret_id is not null) then
    raise exception 'sem_integracao' using errcode = '22023';
  end if;

  update public.cvcrm_integracoes
     set reserva_habilitada = coalesce(p_reserva, reserva_habilitada),
         tabela_preco_cv = coalesce(p_tabela_preco, tabela_preco_cv),
         tabela_erro = case when p_tabela_preco is not null then null else tabela_erro end,
         updated_at = now()
   where id = i.id;

  -- Desligou a tabela do CV: volta a manual (a trava já está desligada).
  if p_tabela_preco is false and i.tabela_preco_cv then
    update public.development_price_tables t
       set referencia = coalesce(t.manual_guardada->>'referencia', ''),
           regras = coalesce(t.manual_guardada->'regras', '[]'::jsonb),
           vagas = case when jsonb_typeof(t.manual_guardada->'vagas') = 'object' then t.manual_guardada->'vagas' end,
           precos_unidades = coalesce(t.manual_guardada->'precos_unidades', '[]'::jsonb),
           arquivo_path = t.manual_guardada->>'arquivo_path',
           arquivo_nome = t.manual_guardada->>'arquivo_nome',
           atualizado_em = now(),
           manual_guardada = null,
           cv_tabela = null
      from public.developments d
     where d.id = t.development_id and d.company_id = p_company and t.fonte = 'cv';
  end if;

  return public.cvcrm_integracao(p_company);
end;
$$;

revoke all on function public.cvcrm_definir_recursos(uuid, boolean, boolean) from public, anon;
grant execute on function public.cvcrm_definir_recursos(uuid, boolean, boolean) to authenticated, service_role;

-- O admin escolhe a tabela do CV de um empreendimento (nula = automática).
create or replace function public.cvcrm_escolher_tabela(p_development uuid, p_cv_tabela integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_cv_tabela is not null and p_cv_tabela <= 0 then
    raise exception 'tabela_invalida' using errcode = '22023';
  end if;
  update public.development_cvcrm_empreendimentos
     set cv_tabela = p_cv_tabela
   where development_id = p_development;
end;
$$;

revoke all on function public.cvcrm_escolher_tabela(uuid, integer) from public, anon;
grant execute on function public.cvcrm_escolher_tabela(uuid, integer) to authenticated, service_role;

-- O admin pede a leitura agora (corretores e tabela): chama a Edge Function
-- `cvcrm-comercial-sync` pelo pg_net, com o segredo do cron (o mesmo da
-- disponibilidade). Volta na hora; a leitura roda em segundo plano.
create or replace function public.cvcrm_ler_comercial_agora(p_company uuid)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_segredo text;
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'cvcrm_project_url';
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'cvcrm_sync_secret';
  if v_url is null or v_segredo is null then
    raise exception 'cron_nao_configurado' using errcode = '22023';
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/cvcrm-comercial-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_segredo),
    body := jsonb_build_object('modo', 'tudo', 'companyId', p_company),
    timeout_milliseconds := 150000);
end;
$$;

revoke all on function public.cvcrm_ler_comercial_agora(uuid) from public, anon;
grant execute on function public.cvcrm_ler_comercial_agora(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 7. O QUE A TELA DA EMPRESA E O PAINEL MOSTRAM
-- ---------------------------------------------------------------------------

create or replace function public.cvcrm_integracao(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
             'companyId', i.company_id, 'url', i.url, 'email', i.email,
             'temToken', i.token_secret_id is not null and i.situacao <> 'pendente',
             'ativo', i.ativo, 'situacao', i.situacao,
             'ultimoTesteEm', i.ultimo_teste_em, 'ultimoErro', i.ultimo_erro, 'ultimoErroEm', i.ultimo_erro_em,
             'ultimaLeveEm', i.ultima_leve_em, 'reservaHabilitada', i.reserva_habilitada,
             'tabelaPrecoCv', i.tabela_preco_cv,
             'corretores', (select count(*) from public.cvcrm_corretores c where c.integracao_id = i.id and c.ativo),
             'corretoresLidosEm', i.corretores_lidos_em, 'corretoresErro', i.corretores_erro,
             'tabelaLidaEm', i.tabela_lida_em, 'tabelaErro', i.tabela_erro,
             'empreendimentos', (select count(*) from public.development_cvcrm_empreendimentos e
                                  where e.integracao_id = i.id and e.ativo))
      from public.cvcrm_integracoes i
     where i.company_id = p_company);
end;
$$;

revoke all on function public.cvcrm_integracao(uuid) from public, anon;
grant execute on function public.cvcrm_integracao(uuid) to authenticated, service_role;

create or replace function public.cvcrm_painel()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'integracoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'companyId', i.company_id, 'empresa', c.name, 'url', i.url, 'email', i.email,
               'temToken', i.token_secret_id is not null and i.situacao <> 'pendente',
               'ativo', i.ativo, 'situacao', i.situacao,
               'ultimoTesteEm', i.ultimo_teste_em, 'ultimoErro', i.ultimo_erro, 'ultimoErroEm', i.ultimo_erro_em,
               'ultimaLeveEm', i.ultima_leve_em, 'reservaHabilitada', i.reserva_habilitada,
               'tabelaPrecoCv', i.tabela_preco_cv,
               'corretores', (select count(*) from public.cvcrm_corretores k where k.integracao_id = i.id and k.ativo),
               'corretoresLidosEm', i.corretores_lidos_em, 'corretoresErro', i.corretores_erro,
               'tabelaLidaEm', i.tabela_lida_em, 'tabelaErro', i.tabela_erro,
               'empreendimentos', (select count(*) from public.development_cvcrm_empreendimentos e
                                    where e.integracao_id = i.id and e.ativo))
               order by c.name)
        from public.cvcrm_integracoes i
        join public.companies c on c.id = i.company_id), '[]'::jsonb),
    'empreendimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cvEmpreendimento', e.cv_empreendimento, 'cvEtapa', e.cv_etapa,
               'nomeNoCv', e.nome_no_cv, 'etapaNoCv', e.etapa_no_cv, 'ativo', e.ativo,
               'companyId', i.company_id,
               'developmentId', e.development_id, 'empreendimento', d.name,
               'ultimoLeveEm', e.ultimo_leve_em, 'ultimoCompletoEm', e.ultimo_completo_em,
               'ultimoErro', e.ultimo_erro, 'ultimoErroEm', e.ultimo_erro_em,
               'cvTabela', e.cv_tabela, 'cvTabelaNome', e.cv_tabela_nome, 'tabelaErro', e.tabela_erro,
               'vinculadas', (
                 select count(*) from public.development_unit_cvcrm l
                   join public.cvcrm_unidades u on u.integracao_id = l.integracao_id and u.cv_unidade = l.cv_unidade
                  where l.development_id = e.development_id
                    and l.integracao_id = e.integracao_id
                    and u.cv_empreendimento = e.cv_empreendimento
                    and (e.cv_etapa is null or u.cv_etapa = e.cv_etapa)),
               'noCv', (
                 select count(*) from public.cvcrm_unidades u
                  where u.integracao_id = e.integracao_id
                    and u.cv_empreendimento = e.cv_empreendimento
                    and (e.cv_etapa is null or u.cv_etapa = e.cv_etapa)
                    and u.ausente_desde is null))
               order by d.name)
        from public.development_cvcrm_empreendimentos e
        join public.cvcrm_integracoes i on i.id = e.integracao_id
        join public.developments d on d.id = e.development_id
       where e.ativo), '[]'::jsonb),
    'situacoesRevisar', coalesce((
      select jsonb_agg(jsonb_build_object('chave', s.chave, 'descricao', s.descricao, 'situacao', s.situacao)
               order by s.chave)
        from public.cvcrm_situacao s where s.revisar), '[]'::jsonb),
    'situacoes', coalesce((
      select jsonb_agg(jsonb_build_object('chave', s.chave, 'descricao', s.descricao,
                                          'situacao', s.situacao, 'revisar', s.revisar)
               order by s.chave)
        from public.cvcrm_situacao s), '[]'::jsonb),
    'leituras', coalesce((
      select jsonb_object_agg(x.modo, jsonb_build_object(
               'iniciadoEm', x.iniciado_em, 'terminadoEm', x.terminado_em, 'ok', x.ok,
               'lidas', x.lidas, 'mudaram', x.mudaram, 'erro', x.erro))
        from public.cvcrm_sync_estado x), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.cvcrm_painel() from public, anon;
grant execute on function public.cvcrm_painel() to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 8. O CORRETOR: A RESERVA ESTÁ LIGADA PARA ESTA SIMULAÇÃO?
-- ---------------------------------------------------------------------------
-- O botão "Reservar no CV" só aparece quando a construtora da simulação tem a
-- reserva ligada e a unidade escolhida tem vínculo com o CV. Devolve também o
-- último recibo da simulação. Sem dado de ninguém além do próprio corretor.
create or replace function public.cvcrm_reserva_da_simulacao(p_simulation uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
  v_unit uuid;
  v_ligada boolean;
  v_vinculo boolean;
  r public.cvcrm_reservas;
begin
  select id, user_id, company_id, development_id, state into s
    from public.simulations where id = p_simulation;
  if not found or not (coalesce(s.user_id = auth.uid(), false) or public.is_app_admin()) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  begin
    v_unit := nullif(s.state->>'unitId', '')::uuid;
  exception when others then
    v_unit := null;
  end;
  select coalesce(bool_or(i.reserva_habilitada and i.ativo and i.situacao <> 'pendente'), false) into v_ligada
    from public.developments d join public.cvcrm_integracoes i on i.company_id = d.company_id
   where d.id = s.development_id;
  v_vinculo := v_unit is not null and exists (
    select 1 from public.development_unit_cvcrm l where l.unit_id = v_unit and l.cv_unidade is not null);
  select * into r from public.cvcrm_reservas
   where simulation_id = p_simulation order by criado_em desc limit 1;
  return jsonb_build_object(
    'habilitada', v_ligada,
    'temVinculo', v_vinculo,
    'ultima', case when r.id is null then null else jsonb_build_object(
      'situacao', r.situacao, 'cvReserva', r.cv_reserva, 'erro', r.erro, 'criadoEm', r.criado_em) end);
end;
$$;

revoke all on function public.cvcrm_reserva_da_simulacao(uuid) from public, anon;
grant execute on function public.cvcrm_reserva_da_simulacao(uuid) to authenticated, service_role;
