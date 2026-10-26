-- ===========================================================================
-- DISPONIBILIDADE DO CV CRM NA TABELA DE PREÇO (no lugar do UAU)
-- ===========================================================================
-- A situação de cada unidade passa a vir do CV CRM (o CRM de vendas da
-- Canopus), e não mais do UAU. As cores e a tabela que o aplicativo lê e
-- assina continuam as mesmas (`development_unit_disponibilidade`):
--
--     verde    disponivel    CV: Disponível
--     amarelo  negociacao    CV: Reservada, Em processo de reserva
--     vermelho vendida       CV: Vendida
--     cinza    indisponivel  CV: Bloqueada, ou situação desconhecida
--     (nada)   sem_vinculo   unidade que o admin ainda não vinculou
--
-- COMO OS DOIS LADOS SE ENCONTRAM — UNIDADE X COM UNIDADE X
-- ---------------------------------------------------------------------------
-- O CV identifica a unidade por `idunidade` (o id do banco dele; o
-- `idunidade_int` NÃO serve: no Calhau ele é "79" ou "302", sem padrão). O
-- POUP, por `development_units.id`. O vínculo é gravado UMA vez, pelo admin,
-- em `development_unit_cvcrm`, e depois a situação é lida pela chave. A
-- sugestão de pares ("Bloco 29" + "Apto 304" = "Bloco 29"/"304") é feita no
-- aplicativo (`src/features/disponibilidade/vinculo.ts`) e conferida aqui.
--
-- Se o CV renomear a unidade (o identificador do vínculo deixa de bater com o
-- atual), ela volta a `sem_vinculo` até o admin confirmar: na dúvida, sem cor
-- — nunca a cor de outra unidade.
--
-- QUEM ESCREVE
-- ---------------------------------------------------------------------------
--   * o espelho (`cvcrm_unidades`): só as Edge Functions, com service role,
--     pelas RPCs `cvcrm_aplicar_leitura` e `cvcrm_aplicar_mudancas`;
--   * os vínculos e os empreendimentos do CV: só o admin do POUP, pelas RPCs
--     `cvcrm_salvar_*` / `cvcrm_remover_empreendimento`;
--   * a disponibilidade: só o banco (`disponibilidade_recalcular`).
--
-- O CV É SÓ LIDO. As Edge Functions têm uma lista fechada de três rotas GET
-- (lista de empreendimentos, mapa de disponibilidade e o histórico de
-- situação do CVDW) e recusam qualquer outra antes de abrir conexão. O POUP
-- só sinaliza disponibilidade — e só isso. Nome de cliente, documento e motivo
-- de bloqueio que o CV devolve são descartados na função: nada disso entra
-- no banco.
--
-- O PREÇO não vem do CV (o `valor` da unidade lá é "0.00"): continua o da
-- tabela de preço enviada.
--
-- NADA DE APAGAR AQUI. Desvincular é gravar o vínculo como nulo, tirar um
-- empreendimento do CV é pausá-lo, e a unidade que some do CV ganha
-- `ausente_desde`. O histórico fica, e esta migration roda inteira pelo
-- conector do Supabase.
--
-- DEPENDE DE: 20261020120000_disponibilidade_uau.sql (a tabela
--             `development_unit_disponibilidade`, as policies e o Realtime
--             dela), 20260924150000_blocos_e_unidades.sql e is_app_admin.
-- MIGRATION IDEMPOTENTE.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. O EMPREENDIMENTO DO CV DE CADA EMPREENDIMENTO DO POUP
-- ---------------------------------------------------------------------------
-- Um empreendimento do CV pode ter mais de um módulo (etapa): o "VILLAGE
-- RESERVA II" do CV tem o Módulo I e o Módulo II, e o POUP cadastra cada
-- módulo como um empreendimento. `cv_etapa` nula = o empreendimento do CV
-- inteiro. O mesmo pedaço do CV não pinta dois empreendimentos do POUP (o
-- índice abaixo, e a conferência de sobreposição em cvcrm_salvar_empreendimento).

create table if not exists public.development_cvcrm_empreendimentos (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  cv_empreendimento integer not null check (cv_empreendimento > 0),
  cv_etapa integer check (cv_etapa is null or cv_etapa > 0),
  nome_no_cv text,
  etapa_no_cv text,
  ativo boolean not null default true,
  -- A leitura leve (o histórico do CVDW, de minuto em minuto) e a completa
  -- (o mapa de disponibilidade, que confere tudo).
  ultimo_leve_em timestamptz,
  ultimo_completo_em timestamptz,
  ultimo_erro text,
  ultimo_erro_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists development_cvcrm_empreendimentos_unico
  on public.development_cvcrm_empreendimentos (cv_empreendimento, (coalesce(cv_etapa, 0)));
create index if not exists development_cvcrm_empreendimentos_por_empreendimento
  on public.development_cvcrm_empreendimentos (development_id);

comment on table public.development_cvcrm_empreendimentos is
  'Empreendimento (e etapa) do CV CRM de onde vem a disponibilidade de um empreendimento do POUP. Escrita só pelas RPCs do admin.';


-- ---------------------------------------------------------------------------
-- 2. O ESPELHO DO CV
-- ---------------------------------------------------------------------------
-- Uma linha por unidade do CV, só com o que identifica a unidade e a situação
-- dela. Só é REGRAVADA quando algo muda (uma leitura que regravasse tudo a
-- cada minuto encheria o banco de escrita sem notícia nenhuma).

create table if not exists public.cvcrm_unidades (
  cv_unidade integer primary key check (cv_unidade > 0),
  cv_empreendimento integer not null,
  cv_etapa integer,
  cv_bloco integer,
  bloco text,
  unidade text,
  -- "Bloco 29 Apto 304": o bloco + o nome da unidade, ou só o nome quando
  -- ele já traz o bloco ("Torre 09 Apto 702"). Ver cvcrm_identificador.
  identificador text,
  -- A situação do CV reduzida (minúscula, sem acento): 'disponivel',
  -- 'reservada'... É a chave de cvcrm_situacao.
  situacao_chave text,
  -- Como o CV escreve ("Reservada").
  situacao_descricao text,
  status_mudou_em timestamptz not null default now(),
  -- Sumiu da leitura COMPLETA (unidade apagada no CV).
  ausente_desde timestamptz,
  atualizado_em timestamptz not null default now(),
  -- Última conferência PEDIDA pelo corretor (freio para o toque repetido).
  conferido_em timestamptz
);

create index if not exists cvcrm_unidades_por_empreendimento
  on public.cvcrm_unidades (cv_empreendimento, cv_etapa);

comment on table public.cvcrm_unidades is
  'Espelho das unidades do CV CRM (mapa de disponibilidade). Chave = idunidade do CV. Escrita só pelas RPCs de leitura (service role). Sem dado de cliente.';


-- ---------------------------------------------------------------------------
-- 3. O QUE CADA SITUAÇÃO DO CV SIGNIFICA AQUI
-- ---------------------------------------------------------------------------
-- Situação nova que aparecer numa leitura entra sozinha como `indisponivel`
-- com `revisar = true` — cinza até o admin classificar, e não verde por padrão.

create table if not exists public.cvcrm_situacao (
  chave text primary key check (chave ~ '^[a-z0-9 ]{1,80}$'),
  descricao text not null default '',
  situacao text not null check (situacao in ('disponivel', 'negociacao', 'vendida', 'indisponivel')),
  revisar boolean not null default false,
  atualizado_em timestamptz not null default now()
);

insert into public.cvcrm_situacao (chave, descricao, situacao) values
  ('disponivel', 'Disponível', 'disponivel'),
  ('reservada', 'Reservada', 'negociacao'),
  ('em processo de reserva', 'Em processo de reserva', 'negociacao'),
  ('vendida', 'Vendida', 'vendida'),
  ('bloqueada', 'Bloqueada', 'indisponivel')
on conflict (chave) do nothing;

comment on table public.cvcrm_situacao is
  'Situação do CV CRM (texto reduzido) → situação do POUP. O admin reclassifica; situação nova entra como indisponivel/revisar.';


-- ---------------------------------------------------------------------------
-- 4. O VÍNCULO UNIDADE DO POUP ↔ UNIDADE DO CV
-- ---------------------------------------------------------------------------
-- 1 para 1 nos dois sentidos: a chave primária (unit_id) e o índice único
-- de cv_unidade. `cv_unidade` nula = desvinculada (a linha fica, com o
-- histórico). Unidade do POUP apagada ou recriada leva o vínculo junto.

create table if not exists public.development_unit_cvcrm (
  unit_id uuid primary key references public.development_units(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  cv_unidade integer references public.cvcrm_unidades (cv_unidade),
  -- O identificador do CV no momento do vínculo. Se o CV renomear a unidade,
  -- o vínculo fica suspenso até o admin confirmar de novo.
  identificador_no_vinculo text,
  origem text not null check (origem in ('automatico', 'manual', 'criado_do_cv')),
  vinculado_por uuid,
  vinculado_em timestamptz not null default now()
);

create unique index if not exists development_unit_cvcrm_unidade_unica
  on public.development_unit_cvcrm (cv_unidade) where cv_unidade is not null;
create index if not exists development_unit_cvcrm_por_empreendimento
  on public.development_unit_cvcrm (development_id);


-- ---------------------------------------------------------------------------
-- 5. O ESTADO DAS LEITURAS (UMA LINHA POR MODO) E A TRAVA
-- ---------------------------------------------------------------------------
-- Uma linha por modo, regravada a cada rodada: o painel do admin mostra a
-- última, e a tabela não cresce. `cursor` é a última `referencia_data` do
-- CVDW já aplicada (só a leve usa), no relógio do próprio CV.

create table if not exists public.cvcrm_sync_estado (
  modo text primary key check (modo in ('leve', 'completo')),
  em_andamento_desde timestamptz,
  iniciado_em timestamptz,
  terminado_em timestamptz,
  ok boolean,
  lidas integer,
  mudaram integer,
  erro text,
  detalhe jsonb,
  cursor text,
  atualizado_em timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.development_cvcrm_empreendimentos enable row level security;
alter table public.cvcrm_unidades enable row level security;
alter table public.cvcrm_situacao enable row level security;
alter table public.development_unit_cvcrm enable row level security;
alter table public.cvcrm_sync_estado enable row level security;

revoke all on public.development_cvcrm_empreendimentos, public.cvcrm_unidades, public.cvcrm_situacao,
  public.development_unit_cvcrm, public.cvcrm_sync_estado
  from public, anon, authenticated;

grant all on public.development_cvcrm_empreendimentos, public.cvcrm_unidades, public.cvcrm_situacao,
  public.development_unit_cvcrm, public.cvcrm_sync_estado
  to service_role;

-- Leitura. Escrita de authenticated: nenhuma direta — só pelas RPCs abaixo.
grant select on public.development_cvcrm_empreendimentos, public.cvcrm_unidades, public.cvcrm_situacao,
  public.development_unit_cvcrm, public.cvcrm_sync_estado
  to authenticated;

do $$
begin
  -- Quem lê o empreendimento vê de onde vem a disponibilidade e quando foi lida.
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'development_cvcrm_empreendimentos' and policyname = 'cvcrm_empreendimentos_select') then
    create policy "cvcrm_empreendimentos_select" on public.development_cvcrm_empreendimentos
      for select to authenticated using (public.pode_ler_empreendimento(development_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'cvcrm_situacao' and policyname = 'cvcrm_situacao_select') then
    create policy "cvcrm_situacao_select" on public.cvcrm_situacao
      for select to authenticated using (true);
  end if;
  -- O espelho cru, os vínculos e o estado das leituras: só o admin.
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'cvcrm_unidades' and policyname = 'cvcrm_unidades_select_admin') then
    create policy "cvcrm_unidades_select_admin" on public.cvcrm_unidades
      for select to authenticated using (public.is_app_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'development_unit_cvcrm' and policyname = 'unit_cvcrm_select_admin') then
    create policy "unit_cvcrm_select_admin" on public.development_unit_cvcrm
      for select to authenticated using (public.is_app_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'cvcrm_sync_estado' and policyname = 'cvcrm_sync_estado_select_admin') then
    create policy "cvcrm_sync_estado_select_admin" on public.cvcrm_sync_estado
      for select to authenticated using (public.is_app_admin());
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 7. TEXTO: SITUAÇÃO E IDENTIFICADOR
-- ---------------------------------------------------------------------------
-- Um lugar só para cada regra, usado pela leitura e pela conferência.

-- Maiúsculas, sem acento, espaços comuns.
create or replace function public.disponibilidade_texto_normal(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(btrim(regexp_replace(
           translate(coalesce(p_texto, ''),
                     'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇºª',
                     'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUCoa'),
           '\s+', ' ', 'g')));
$$;

create or replace function public.disponibilidade_mesmo_identificador(a text, b text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.disponibilidade_texto_normal(a) = public.disponibilidade_texto_normal(b);
$$;

-- "Disponível" / "disponível" / "DISPONIVEL" → 'disponivel'. Vazio → nulo.
create or replace function public.cvcrm_chave_da_situacao(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(lower(btrim(regexp_replace(
           regexp_replace(public.disponibilidade_texto_normal(p_texto), '[^A-Z0-9 ]', '', 'g'),
           '\s+', ' ', 'g'))), '');
$$;

-- "reservada" → "Reservada" (o mapa escreve em minúscula; o CVDW, não).
create or replace function public.cvcrm_descricao(p_texto text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when nullif(btrim(coalesce(p_texto, '')), '') is null then null
              else upper(left(btrim(p_texto), 1)) || substr(btrim(p_texto), 2) end;
$$;

-- O identificador da unidade: bloco + nome, ou só o nome quando ele já traz o
-- bloco. Formatos reais do CV da Canopus (26/10/2026):
--   bloco "Bloco 29",  nome "Apto 304"           → "Bloco 29 Apto 304"
--   bloco "BLOCO 46",  nome "UNIDADE 304"        → "BLOCO 46 UNIDADE 304"
--   bloco "TORRE 09",  nome "Torre 09 Apto 702"  → "Torre 09 Apto 702"
--   bloco "QUADRA F",  nome "Quadra F Casa 19"   → "Quadra F Casa 19"
create or replace function public.cvcrm_identificador(p_bloco text, p_nome text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_nome, '')), '') is null then null
    when nullif(btrim(coalesce(p_bloco, '')), '') is null then regexp_replace(btrim(p_nome), '\s+', ' ', 'g')
    when public.disponibilidade_texto_normal(p_nome) ~ '(^|[^A-Z])(BLOCO|BL|TORRE|TR|QUADRA|QD|EDIFICIO|ED)\.?\s*[A-Z0-9]'
      then regexp_replace(btrim(p_nome), '\s+', ' ', 'g')
    else regexp_replace(btrim(p_bloco) || ' ' || btrim(p_nome), '\s+', ' ', 'g')
  end;
$$;

-- A leitura que a Edge Function entrega, já limpa. Uma unidade por id.
--   [{ "unidade": 35503, "etapa": 2274, "bloco_id": 3350, "bloco": "Bloco 29",
--      "nome": "Apto 304", "situacao": "disponível" }]
create or replace function public.cvcrm_ler_unidades(p_unidades jsonb)
returns table (cv_unidade integer, cv_etapa integer, cv_bloco integer, bloco text, nome text,
               identificador text, chave text, descricao text)
language sql
immutable
set search_path = public
as $$
  select distinct on (x.unidade)
         x.unidade, x.etapa, x.bloco_id, nullif(btrim(x.bloco), ''), nullif(btrim(x.nome), ''),
         public.cvcrm_identificador(x.bloco, x.nome),
         public.cvcrm_chave_da_situacao(x.situacao),
         public.cvcrm_descricao(x.situacao)
    from jsonb_to_recordset(coalesce(p_unidades, '[]'::jsonb))
           as x(unidade integer, etapa integer, bloco_id integer, bloco text, nome text, situacao text)
   where x.unidade is not null and x.unidade > 0
   order by x.unidade;
$$;

revoke all on function public.cvcrm_ler_unidades(jsonb) from public, anon, authenticated;
grant execute on function public.cvcrm_ler_unidades(jsonb) to service_role;


-- ---------------------------------------------------------------------------
-- 8. RECALCULAR A DISPONIBILIDADE DE UNIDADES
-- ---------------------------------------------------------------------------
-- O único lugar que escreve em development_unit_disponibilidade. Só grava o
-- que mudou: sem mudança, sem evento no Realtime.

create or replace function public.disponibilidade_recalcular(p_units uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mudaram integer;
begin
  if p_units is null or cardinality(p_units) = 0 then
    return 0;
  end if;

  with alvo as (
    select du.id as unit_id,
           du.development_id,
           case
             when v.cv_unidade is null or u.cv_unidade is null then 'sem_vinculo'
             -- Renomeada no CV: suspensa até o admin confirmar.
             when not public.disponibilidade_mesmo_identificador(v.identificador_no_vinculo, u.identificador) then 'sem_vinculo'
             when u.ausente_desde is not null then 'indisponivel'
             else coalesce(s.situacao, 'indisponivel')
           end as situacao,
           case
             when v.cv_unidade is null or u.cv_unidade is null then null
             when not public.disponibilidade_mesmo_identificador(v.identificador_no_vinculo, u.identificador) then null
             else coalesce(nullif(s.descricao, ''), u.situacao_descricao)
           end as descricao
      from public.development_units du
      left join public.development_unit_cvcrm v on v.unit_id = du.id
      left join public.cvcrm_unidades u on u.cv_unidade = v.cv_unidade
      left join public.cvcrm_situacao s on s.chave = u.situacao_chave
     where du.id = any (p_units)
  )
  insert into public.development_unit_disponibilidade as d (unit_id, development_id, situacao, status_descricao, mudou_em)
  select a.unit_id, a.development_id, a.situacao, a.descricao, now()
    from alvo a
   -- Unidade que nunca teve cor não ganha linha: a tela já a trata como "sem
   -- dado". Linha só nasce quando há o que mostrar.
   where a.situacao <> 'sem_vinculo'
      or exists (select 1 from public.development_unit_disponibilidade x where x.unit_id = a.unit_id)
  on conflict (unit_id) do update
     set situacao = excluded.situacao,
         status_descricao = excluded.status_descricao,
         development_id = excluded.development_id,
         mudou_em = now()
   where d.situacao is distinct from excluded.situacao
      or d.status_descricao is distinct from excluded.status_descricao;

  get diagnostics v_mudaram = row_count;
  return v_mudaram;
end;
$$;

revoke all on function public.disponibilidade_recalcular(uuid[]) from public, anon, authenticated;
grant execute on function public.disponibilidade_recalcular(uuid[]) to service_role;

-- O espelho mudou → as unidades vinculadas às linhas que mudaram. Gatilho de
-- comando (uma vez por leitura), não de linha.
create or replace function public.cvcrm_trg_unidades_mudaram()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v uuid[];
begin
  select array_agg(l.unit_id) into v
    from novos n
    join antigos o on o.cv_unidade = n.cv_unidade
    join public.development_unit_cvcrm l on l.cv_unidade = n.cv_unidade
   where n.situacao_chave is distinct from o.situacao_chave
      or n.situacao_descricao is distinct from o.situacao_descricao
      or n.ausente_desde is distinct from o.ausente_desde
      or n.identificador is distinct from o.identificador;
  perform public.disponibilidade_recalcular(v);
  return null;
end;
$$;

create or replace trigger cvcrm_unidades_mudaram
  after update on public.cvcrm_unidades
  referencing old table as antigos new table as novos
  for each statement execute function public.cvcrm_trg_unidades_mudaram();

-- O admin reclassificou uma situação → todas as unidades com ela.
create or replace function public.cvcrm_trg_situacao_mudou()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.situacao is distinct from old.situacao or new.descricao is distinct from old.descricao then
    perform public.disponibilidade_recalcular(array(
      select l.unit_id
        from public.development_unit_cvcrm l
        join public.cvcrm_unidades u on u.cv_unidade = l.cv_unidade
       where u.situacao_chave = new.chave
    ));
  end if;
  return null;
end;
$$;

create or replace trigger cvcrm_situacao_mudou
  after update on public.cvcrm_situacao
  for each row execute function public.cvcrm_trg_situacao_mudou();

-- Funções de gatilho: só o próprio gatilho as chama (nada pela API).
revoke all on function public.cvcrm_trg_unidades_mudaram(), public.cvcrm_trg_situacao_mudou()
  from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 9. A LEITURA DO CV ENTRA AQUI (SÓ AS EDGE FUNCTIONS)
-- ---------------------------------------------------------------------------
-- cvcrm_aplicar_leitura — o MAPA de disponibilidade de um empreendimento
-- (ou de uma etapa dele):
--   'completo' — todas as unidades. Atualiza tudo; quem não veio é marcado
--                ausente (apagada no CV).
--   'pontual'  — um bloco (o "conferir agora" do corretor, antes de fechar a
--                proposta). Atualiza só o que veio; não marca ninguém como
--                sumido e não mexe no frescor.
--
-- A TRAVA CONTRA A LEITURA QUEBRADA: uma resposta vazia ou cortada não pode
-- virar "tudo fora de venda". Se mais de 30% das unidades (e mais de 5)
-- sumirem de uma vez, nada é marcado e a leitura volta `suspeita`.

create or replace function public.cvcrm_aplicar_leitura(
  p_cv_empreendimento integer,
  p_cv_etapa integer,
  p_modo text,
  p_unidades jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
  v_lidas integer;
  v_novas integer := 0;
  v_mudaram integer := 0;
  v_sumiram integer := 0;
  v_base integer := 0;
  v_suspeita boolean := false;
begin
  if p_cv_empreendimento is null or p_cv_empreendimento <= 0 or (p_cv_etapa is not null and p_cv_etapa <= 0) then
    raise exception 'empreendimento_invalido' using errcode = '22023';
  end if;
  if p_modo is null or p_modo not in ('completo', 'pontual') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if p_unidades is null or jsonb_typeof(p_unidades) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;

  v_ids := array(select l.cv_unidade from public.cvcrm_ler_unidades(p_unidades) l);
  v_lidas := cardinality(v_ids);

  -- Situação que o banco ainda não conhece: entra cinza, para revisar.
  insert into public.cvcrm_situacao (chave, descricao, situacao, revisar)
  select distinct on (l.chave) l.chave, coalesce(l.descricao, ''), 'indisponivel', true
    from public.cvcrm_ler_unidades(p_unidades) l
   where l.chave is not null and l.chave ~ '^[a-z0-9 ]{1,80}$'
  on conflict (chave) do nothing;

  -- Unidades novas no espelho.
  insert into public.cvcrm_unidades (
    cv_unidade, cv_empreendimento, cv_etapa, cv_bloco, bloco, unidade, identificador,
    situacao_chave, situacao_descricao)
  select l.cv_unidade, p_cv_empreendimento, l.cv_etapa, l.cv_bloco, l.bloco, l.nome, l.identificador,
         l.chave, l.descricao
    from public.cvcrm_ler_unidades(p_unidades) l
  on conflict (cv_unidade) do nothing;
  get diagnostics v_novas = row_count;

  -- Unidades que mudaram.
  update public.cvcrm_unidades u
     set cv_empreendimento = p_cv_empreendimento,
         cv_etapa = l.cv_etapa,
         cv_bloco = l.cv_bloco,
         bloco = l.bloco,
         unidade = l.nome,
         identificador = l.identificador,
         situacao_chave = l.chave,
         situacao_descricao = l.descricao,
         ausente_desde = null,
         status_mudou_em = case when u.situacao_chave is distinct from l.chave then now() else u.status_mudou_em end,
         atualizado_em = now()
    from public.cvcrm_ler_unidades(p_unidades) l
   where u.cv_unidade = l.cv_unidade
     and (u.cv_empreendimento, u.cv_etapa, u.cv_bloco, u.bloco, u.unidade, u.identificador,
          u.situacao_chave, u.situacao_descricao, u.ausente_desde)
         is distinct from
         (p_cv_empreendimento, l.cv_etapa, l.cv_bloco, l.bloco, l.nome, l.identificador,
          l.chave, l.descricao, null::timestamptz);
  get diagnostics v_mudaram = row_count;

  if p_modo = 'pontual' then
    update public.cvcrm_unidades u set conferido_em = now() where u.cv_unidade = any (v_ids);
  else
    -- Quem sumiu da leitura. A base é o conjunto que DEVIA ter vindo.
    select count(*),
           count(*) filter (where not (u.cv_unidade = any (v_ids)))
      into v_base, v_sumiram
      from public.cvcrm_unidades u
     where u.cv_empreendimento = p_cv_empreendimento
       and (p_cv_etapa is null or u.cv_etapa = p_cv_etapa)
       and u.ausente_desde is null;

    v_suspeita := v_sumiram > 5 and v_sumiram > v_base * 0.3;

    if v_sumiram > 0 and not v_suspeita then
      update public.cvcrm_unidades u
         set ausente_desde = now(), atualizado_em = now()
       where u.cv_empreendimento = p_cv_empreendimento
         and (p_cv_etapa is null or u.cv_etapa = p_cv_etapa)
         and u.ausente_desde is null
         and not (u.cv_unidade = any (v_ids));
    end if;

    if not v_suspeita then
      update public.development_cvcrm_empreendimentos e
         set ultimo_completo_em = now(), ultimo_erro = null, ultimo_erro_em = null, updated_at = now()
       where e.cv_empreendimento = p_cv_empreendimento
         and (p_cv_etapa is null or e.cv_etapa = p_cv_etapa);
    end if;
  end if;

  return jsonb_build_object(
    'lidas', v_lidas, 'novas', v_novas, 'mudaram', v_mudaram,
    'sumiram', case when v_suspeita then 0 else v_sumiram end, 'suspeita', v_suspeita);
end;
$$;

revoke all on function public.cvcrm_aplicar_leitura(integer, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.cvcrm_aplicar_leitura(integer, integer, text, jsonb) to service_role;

-- cvcrm_aplicar_mudancas — a leitura LEVE, de minuto em minuto: o histórico
-- de situação do CVDW (todas as mudanças do CV desde a última leitura, de
-- todos os empreendimentos, numa chamada só). Só mexe na situação de
-- unidades que já estão no espelho; unidade nova entra pela completa.
--   p_mudancas: [{ "unidade": 37405, "situacao": "Reservada" }]
--   (a ÚLTIMA mudança de cada unidade; a função escolhe uma se vier repetida)
create or replace function public.cvcrm_aplicar_mudancas(p_mudancas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lidas integer;
  v_mudaram integer := 0;
begin
  if p_mudancas is null or jsonb_typeof(p_mudancas) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;
  v_lidas := jsonb_array_length(p_mudancas);

  insert into public.cvcrm_situacao (chave, descricao, situacao, revisar)
  select distinct on (k.chave) k.chave, coalesce(k.descricao, ''), 'indisponivel', true
    from (select public.cvcrm_chave_da_situacao(x.situacao) as chave, public.cvcrm_descricao(x.situacao) as descricao
            from jsonb_to_recordset(p_mudancas) as x(unidade integer, situacao text)) k
   where k.chave is not null and k.chave ~ '^[a-z0-9 ]{1,80}$'
  on conflict (chave) do nothing;

  update public.cvcrm_unidades u
     set situacao_chave = l.chave,
         situacao_descricao = l.descricao,
         status_mudou_em = now(),
         atualizado_em = now()
    from (select distinct on (x.unidade) x.unidade,
                 public.cvcrm_chave_da_situacao(x.situacao) as chave,
                 public.cvcrm_descricao(x.situacao) as descricao
            from jsonb_to_recordset(p_mudancas) as x(unidade integer, situacao text)
           where x.unidade is not null and public.cvcrm_chave_da_situacao(x.situacao) is not null) l
   where u.cv_unidade = l.unidade
     and (u.situacao_chave, u.situacao_descricao) is distinct from (l.chave, l.descricao);
  get diagnostics v_mudaram = row_count;

  -- A leve cobre TODOS os empreendimentos: todos ficam frescos.
  update public.development_cvcrm_empreendimentos
     set ultimo_leve_em = now(), updated_at = now()
   where ativo;

  return jsonb_build_object('lidas', v_lidas, 'mudaram', v_mudaram);
end;
$$;

revoke all on function public.cvcrm_aplicar_mudancas(jsonb) from public, anon, authenticated;
grant execute on function public.cvcrm_aplicar_mudancas(jsonb) to service_role;

create or replace function public.cvcrm_registrar_erro(p_cv_empreendimento integer, p_cv_etapa integer, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.development_cvcrm_empreendimentos
     set ultimo_erro = left(p_erro, 1000), ultimo_erro_em = now(), updated_at = now()
   where cv_empreendimento = p_cv_empreendimento and cv_etapa is not distinct from p_cv_etapa;
$$;

revoke all on function public.cvcrm_registrar_erro(integer, integer, text) from public, anon, authenticated;
grant execute on function public.cvcrm_registrar_erro(integer, integer, text) to service_role;

-- Uma leitura de cada modo por vez. Devolve false se outra começou há menos
-- de p_prazo (e ainda não terminou).
create or replace function public.cvcrm_sync_iniciar(p_modo text, p_prazo interval default interval '3 minutes')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  insert into public.cvcrm_sync_estado as t (modo, em_andamento_desde, iniciado_em)
  values (p_modo, now(), now())
  on conflict (modo) do update
     set em_andamento_desde = now(), iniciado_em = now(), atualizado_em = now()
   where t.em_andamento_desde is null or t.em_andamento_desde < now() - p_prazo
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.cvcrm_sync_terminar(
  p_modo text, p_ok boolean, p_lidas integer, p_mudaram integer, p_erro text, p_detalhe jsonb,
  p_cursor text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.cvcrm_sync_estado
     set em_andamento_desde = null,
         terminado_em = now(),
         ok = p_ok,
         lidas = p_lidas,
         mudaram = p_mudaram,
         erro = left(p_erro, 1000),
         detalhe = p_detalhe,
         cursor = coalesce(p_cursor, cursor),
         atualizado_em = now()
   where modo = p_modo;
$$;

revoke all on function public.cvcrm_sync_iniciar(text, interval),
  public.cvcrm_sync_terminar(text, boolean, integer, integer, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.cvcrm_sync_iniciar(text, interval),
  public.cvcrm_sync_terminar(text, boolean, integer, integer, text, jsonb, text)
  to service_role;

-- O SEGREDO DO CRON mora só no Vault (`cvcrm_sync_secret`), gerado no próprio
-- banco: ninguém digita, ninguém vê. A função do cron confere o cabeçalho
-- `x-sync-secret` contra ele por aqui (service role).
create or replace function public.cvcrm_confere_segredo_do_cron(p_segredo text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_segredo text;
begin
  if p_segredo is null or length(p_segredo) < 32 then
    return false;
  end if;
  begin
    select s.decrypted_secret into v_segredo
      from vault.decrypted_secrets s
     where s.name = 'cvcrm_sync_secret'
     limit 1;
  exception when others then
    return false;
  end;
  return v_segredo is not null and v_segredo = p_segredo;
end;
$$;

revoke all on function public.cvcrm_confere_segredo_do_cron(text) from public, anon, authenticated;
grant execute on function public.cvcrm_confere_segredo_do_cron(text) to service_role;


-- ---------------------------------------------------------------------------
-- 10. O ADMIN: EMPREENDIMENTO DO CV, CONFERÊNCIA E VÍNCULOS
-- ---------------------------------------------------------------------------
-- Security definer porque as tabelas não têm escrita para authenticated; a
-- permissão é conferida primeiro. Erros saem como código.

create or replace function public.disponibilidade_exigir_admin(p_development uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_development is null
     or not public.is_app_admin()
     or not public.pode_editar_empreendimento(p_development) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.disponibilidade_exigir_admin(uuid) from public, anon;
grant execute on function public.disponibilidade_exigir_admin(uuid) to authenticated, service_role;

create or replace function public.cvcrm_salvar_empreendimento(
  p_development uuid,
  p_cv_empreendimento integer,
  p_cv_etapa integer default null,
  p_nome text default null,
  p_etapa_nome text default null,
  p_ativo boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_outro uuid;
begin
  perform public.disponibilidade_exigir_admin(p_development);
  if p_cv_empreendimento is null or p_cv_empreendimento <= 0 or (p_cv_etapa is not null and p_cv_etapa <= 0) then
    raise exception 'empreendimento_invalido' using errcode = '22023';
  end if;

  -- O mesmo pedaço do CV não pinta dois empreendimentos do POUP. "O CV
  -- inteiro" sobrepõe qualquer etapa dele.
  select e.development_id into v_outro
    from public.development_cvcrm_empreendimentos e
   where e.cv_empreendimento = p_cv_empreendimento
     and e.ativo
     and e.development_id <> p_development
     and (e.cv_etapa is null or p_cv_etapa is null or e.cv_etapa = p_cv_etapa)
   limit 1;
  if v_outro is not null then
    raise exception 'empreendimento_de_outro' using errcode = '23505';
  end if;

  insert into public.development_cvcrm_empreendimentos as e
    (development_id, cv_empreendimento, cv_etapa, nome_no_cv, etapa_no_cv, ativo)
  values (p_development, p_cv_empreendimento, p_cv_etapa, nullif(btrim(p_nome), ''),
          nullif(btrim(p_etapa_nome), ''), coalesce(p_ativo, true))
  on conflict (cv_empreendimento, (coalesce(cv_etapa, 0))) do update
     set development_id = excluded.development_id,
         nome_no_cv = coalesce(excluded.nome_no_cv, e.nome_no_cv),
         etapa_no_cv = coalesce(excluded.etapa_no_cv, e.etapa_no_cv),
         ativo = excluded.ativo,
         updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Tira o empreendimento do CV (pausa a linha): os vínculos das unidades dele
-- ficam nulos, e as células voltam a `sem_vinculo` (evento de UPDATE para
-- quem está olhando).
create or replace function public.cvcrm_remover_empreendimento(
  p_development uuid, p_cv_empreendimento integer, p_cv_etapa integer default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_units uuid[];
begin
  perform public.disponibilidade_exigir_admin(p_development);
  select array_agg(l.unit_id) into v_units
    from public.development_unit_cvcrm l
    join public.cvcrm_unidades u on u.cv_unidade = l.cv_unidade
   where l.development_id = p_development
     and u.cv_empreendimento = p_cv_empreendimento
     and (p_cv_etapa is null or u.cv_etapa = p_cv_etapa);

  update public.development_unit_cvcrm
     set cv_unidade = null, vinculado_por = auth.uid(), vinculado_em = now()
   where unit_id = any (coalesce(v_units, '{}'));
  update public.development_cvcrm_empreendimentos
     set ativo = false, updated_at = now()
   where development_id = p_development
     and cv_empreendimento = p_cv_empreendimento
     and cv_etapa is not distinct from p_cv_etapa;
  perform public.disponibilidade_recalcular(v_units);
  return coalesce(cardinality(v_units), 0);
end;
$$;

-- Tudo que a tela de conferência precisa, numa chamada: as unidades do POUP,
-- as do CV (dos empreendimentos/etapas vinculados) e os vínculos de hoje.
create or replace function public.cvcrm_conferencia(p_development uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.disponibilidade_exigir_admin(p_development);
  return jsonb_build_object(
    'empreendimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cvEmpreendimento', e.cv_empreendimento, 'cvEtapa', e.cv_etapa,
               'nomeNoCv', e.nome_no_cv, 'etapaNoCv', e.etapa_no_cv, 'ativo', e.ativo,
               'ultimoLeveEm', e.ultimo_leve_em, 'ultimoCompletoEm', e.ultimo_completo_em,
               'ultimoErro', e.ultimo_erro, 'ultimoErroEm', e.ultimo_erro_em)
               order by e.cv_empreendimento, e.cv_etapa)
        from public.development_cvcrm_empreendimentos e
       where e.development_id = p_development and e.ativo), '[]'::jsonb),
    'poup', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', du.id, 'bloco', b.nome, 'codigo', du.codigo, 'pavimento', du.pavimento)
               order by b.ordem, du.pavimento, du.ordem)
        from public.development_units du
        join public.development_blocks b on b.id = du.block_id
       where du.development_id = p_development), '[]'::jsonb),
    'cv', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cvUnidade', u.cv_unidade, 'empreendimento', u.cv_empreendimento, 'etapa', u.cv_etapa,
               'bloco', u.bloco, 'nome', u.unidade, 'identificador', u.identificador,
               'situacao', u.situacao_descricao, 'ausente', u.ausente_desde is not null)
               order by u.cv_empreendimento, u.cv_etapa, u.cv_bloco, u.cv_unidade)
        from public.cvcrm_unidades u
       where exists (
               select 1 from public.development_cvcrm_empreendimentos e
                where e.development_id = p_development and e.ativo
                  and e.cv_empreendimento = u.cv_empreendimento
                  and (e.cv_etapa is null or e.cv_etapa = u.cv_etapa))), '[]'::jsonb),
    'vinculos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'unitId', l.unit_id,
               'cvUnidade', l.cv_unidade,
               'identificadorNoVinculo', l.identificador_no_vinculo,
               'identificadorAtual', u.identificador,
               'origem', l.origem, 'vinculadoEm', l.vinculado_em))
        from public.development_unit_cvcrm l
        join public.cvcrm_unidades u on u.cv_unidade = l.cv_unidade
       where l.development_id = p_development), '[]'::jsonb)
  );
end;
$$;

-- Os pares que o admin confirmou, lidos do JSON.
--   [{ "unitId": "<uuid>", "cvUnidade": 35503, "origem": "automatico" | "manual" | "criado_do_cv" }]
create or replace function public.cvcrm_ler_vinculos(p_vinculos jsonb)
returns table (unit_id uuid, cv_unidade integer, origem text)
language sql
immutable
set search_path = public
as $$
  select x."unitId", x."cvUnidade", coalesce(x.origem, 'manual')
    from jsonb_to_recordset(coalesce(p_vinculos, '[]'::jsonb)) as x("unitId" uuid, "cvUnidade" integer, origem text);
$$;

revoke all on function public.cvcrm_ler_vinculos(jsonb) from public, anon, authenticated;
grant execute on function public.cvcrm_ler_vinculos(jsonb) to service_role;

-- Grava os pares confirmados pelo admin. Confere TUDO de novo: a unidade é
-- deste empreendimento; a unidade do CV existe no espelho e é de um
-- empreendimento/etapa do CV vinculado a ele; nenhum dos dois lados fica com
-- dois pares. `p_remover`: unit_ids a desvincular.
create or replace function public.cvcrm_salvar_vinculos(p_development uuid, p_vinculos jsonb, p_remover uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
  v_validos integer;
  v_gravados integer := 0;
  v_removidos integer := 0;
  v_novos uuid[];
  v_afetadas uuid[];
begin
  perform public.disponibilidade_exigir_admin(p_development);
  if p_vinculos is null or jsonb_typeof(p_vinculos) <> 'array' or jsonb_array_length(p_vinculos) > 5000 then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;

  begin
    v_novos := array(select v.unit_id from public.cvcrm_ler_vinculos(p_vinculos) v);
  exception when invalid_text_representation or datatype_mismatch then
    raise exception 'formato_invalido' using errcode = '22023';
  end;
  v_qtd := cardinality(v_novos);

  select count(*) into v_validos
    from public.cvcrm_ler_vinculos(p_vinculos) v
    join public.development_units du on du.id = v.unit_id and du.development_id = p_development
    join public.cvcrm_unidades u on u.cv_unidade = v.cv_unidade
   where v.origem in ('automatico', 'manual', 'criado_do_cv')
     and exists (
           select 1 from public.development_cvcrm_empreendimentos e
            where e.development_id = p_development and e.ativo
              and e.cv_empreendimento = u.cv_empreendimento
              and (e.cv_etapa is null or e.cv_etapa = u.cv_etapa));
  if v_validos <> v_qtd then
    raise exception 'vinculo_invalido' using errcode = '22023';
  end if;
  if (select count(distinct v.unit_id) from public.cvcrm_ler_vinculos(p_vinculos) v) <> v_qtd
     or (select count(distinct v.cv_unidade) from public.cvcrm_ler_vinculos(p_vinculos) v) <> v_qtd then
    raise exception 'vinculo_repetido' using errcode = '22023';
  end if;

  v_afetadas := array(
    select distinct x from unnest(v_novos || coalesce(p_remover, '{}'::uuid[])) as x where x is not null);

  -- Desvincular é gravar nulo: a linha (e quem vinculou) fica.
  update public.development_unit_cvcrm
     set cv_unidade = null, vinculado_por = auth.uid(), vinculado_em = now()
   where development_id = p_development and cv_unidade is not null
     and unit_id = any (coalesce(p_remover, '{}'::uuid[]))
     and not (unit_id = any (v_novos));
  get diagnostics v_removidos = row_count;
  -- Quem vai ganhar par novo solta o antigo antes (senão o índice único
  -- recusaria uma troca entre duas unidades do mesmo empreendimento).
  update public.development_unit_cvcrm
     set cv_unidade = null
   where development_id = p_development and cv_unidade is not null and unit_id = any (v_novos);

  begin
    insert into public.development_unit_cvcrm as l
      (unit_id, development_id, cv_unidade, identificador_no_vinculo, origem, vinculado_por, vinculado_em)
    select v.unit_id, p_development, v.cv_unidade, coalesce(u.identificador, ''), v.origem, auth.uid(), now()
      from public.cvcrm_ler_vinculos(p_vinculos) v
      join public.cvcrm_unidades u on u.cv_unidade = v.cv_unidade
    on conflict (unit_id) do update
       set development_id = excluded.development_id,
           cv_unidade = excluded.cv_unidade,
           identificador_no_vinculo = excluded.identificador_no_vinculo,
           origem = excluded.origem,
           vinculado_por = excluded.vinculado_por,
           vinculado_em = now();
    get diagnostics v_gravados = row_count;
  exception when unique_violation then
    -- A unidade do CV já está vinculada a outra unidade do POUP (de outro
    -- bloco ou de outro empreendimento). Nada é gravado: o admin decide.
    raise exception 'unidade_cv_ja_vinculada' using errcode = '23505';
  end;

  perform public.disponibilidade_recalcular(v_afetadas);
  return jsonb_build_object('gravados', v_gravados, 'removidos', v_removidos);
end;
$$;

revoke all on function public.cvcrm_salvar_empreendimento(uuid, integer, integer, text, text, boolean),
  public.cvcrm_remover_empreendimento(uuid, integer, integer),
  public.cvcrm_conferencia(uuid),
  public.cvcrm_salvar_vinculos(uuid, jsonb, uuid[])
  from public, anon;
grant execute on function public.cvcrm_salvar_empreendimento(uuid, integer, integer, text, text, boolean),
  public.cvcrm_remover_empreendimento(uuid, integer, integer),
  public.cvcrm_conferencia(uuid),
  public.cvcrm_salvar_vinculos(uuid, jsonb, uuid[])
  to authenticated, service_role;

-- O admin reclassifica uma situação (uma nova que entrou cinza vira amarela).
create or replace function public.cvcrm_classificar_situacao(p_chave text, p_situacao text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_situacao is null or p_situacao not in ('disponivel', 'negociacao', 'vendida', 'indisponivel') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;
  update public.cvcrm_situacao
     set situacao = p_situacao, revisar = false, atualizado_em = now()
   where chave = p_chave;
  if not found then
    raise exception 'situacao_desconhecida' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.cvcrm_classificar_situacao(text, text) from public, anon;
grant execute on function public.cvcrm_classificar_situacao(text, text) to authenticated, service_role;

-- O painel do admin: os empreendimentos vinculados, com a saúde de cada um,
-- o estado das duas leituras e as situações que precisam de classificação.
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
    'empreendimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cvEmpreendimento', e.cv_empreendimento, 'cvEtapa', e.cv_etapa,
               'nomeNoCv', e.nome_no_cv, 'etapaNoCv', e.etapa_no_cv, 'ativo', e.ativo,
               'developmentId', e.development_id, 'empreendimento', d.name,
               'ultimoLeveEm', e.ultimo_leve_em, 'ultimoCompletoEm', e.ultimo_completo_em,
               'ultimoErro', e.ultimo_erro, 'ultimoErroEm', e.ultimo_erro_em,
               'vinculadas', (
                 select count(*) from public.development_unit_cvcrm l
                   join public.cvcrm_unidades u on u.cv_unidade = l.cv_unidade
                  where l.development_id = e.development_id
                    and u.cv_empreendimento = e.cv_empreendimento
                    and (e.cv_etapa is null or u.cv_etapa = e.cv_etapa)),
               'noCv', (
                 select count(*) from public.cvcrm_unidades u
                  where u.cv_empreendimento = e.cv_empreendimento
                    and (e.cv_etapa is null or u.cv_etapa = e.cv_etapa)
                    and u.ausente_desde is null))
               order by d.name)
        from public.development_cvcrm_empreendimentos e
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
-- 11. O CORRETOR: A FOTO INICIAL
-- ---------------------------------------------------------------------------
-- Uma chamada ao abrir o empreendimento; depois, o Realtime manda só o que
-- muda. `atualizadoEm` é a leitura MAIS ANTIGA entre os vínculos ativos: se
-- um deles parou, a tela avisa — a média esconderia.

create or replace function public.disponibilidade_do_empreendimento(p_development uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_development is null or not public.pode_ler_empreendimento(p_development) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ativa', exists (
      select 1 from public.development_cvcrm_empreendimentos e
       where e.development_id = p_development and e.ativo),
    'atualizadoEm', (
      select min(greatest(e.ultimo_leve_em, e.ultimo_completo_em))
        from public.development_cvcrm_empreendimentos e
       where e.development_id = p_development and e.ativo),
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object(
               'unitId', d.unit_id, 'situacao', d.situacao,
               'statusDescricao', d.status_descricao, 'mudouEm', d.mudou_em))
        from public.development_unit_disponibilidade d
       where d.development_id = p_development and d.situacao <> 'sem_vinculo'), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.disponibilidade_do_empreendimento(uuid) from public, anon;
grant execute on function public.disponibilidade_do_empreendimento(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 12. O UAU DEIXA DE PINTAR
-- ---------------------------------------------------------------------------
-- O recálculo do UAU passa a ser o de cima: o que ainda chegar do UAU (uma
-- leitura pedida por uma versão antiga do aplicativo) não pinta mais nada.
-- As tabelas e funções do UAU ficam até o dono do POUP confirmar a remoção.

create or replace function public.uau_recalcular_disponibilidade(p_units uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.disponibilidade_recalcular(p_units);
end;
$$;

revoke all on function public.uau_recalcular_disponibilidade(uuid[]) from public, anon, authenticated;
grant execute on function public.uau_recalcular_disponibilidade(uuid[]) to service_role;


-- ===========================================================================
-- CONFERÊNCIA
-- ===========================================================================
--   select e.cv_empreendimento, e.cv_etapa, d.name, e.ultimo_leve_em, e.ultimo_completo_em, e.ultimo_erro
--     from public.development_cvcrm_empreendimentos e join public.developments d on d.id = e.development_id;
--
--   select situacao, count(*) from public.development_unit_disponibilidade group by 1;
--   select * from public.cvcrm_situacao where revisar;
--   select modo, terminado_em, ok, lidas, mudaram, erro, cursor from public.cvcrm_sync_estado;
-- ===========================================================================
