-- ===========================================================================
-- DISPONIBILIDADE DO UAU NA TABELA DE PREÇO
-- ===========================================================================
-- O corretor escolhe bloco e unidade na tabela de preço; a partir daqui cada
-- unidade ganha a situação que o UAU (o ERP da construtora) dá a ela:
--
--     verde    disponivel    UAU: Disponível
--     amarelo  negociacao    UAU: Proposta, Reservado
--     vermelho vendida       UAU: Vendida, Quitado
--     cinza    indisponivel  UAU: Fora de venda, ou status desconhecido
--     (nada)   sem_vinculo   unidade que o admin ainda não vinculou
--
-- COMO OS DOIS LADOS SE ENCONTRAM — UNIDADE X COM UNIDADE X
-- ---------------------------------------------------------------------------
-- O UAU identifica a unidade por (empresa, produto, número da personalização)
-- — `Empresa_unid`, `Prod_unid`, `NumPer_unid` no Espelho de vendas. O POUP,
-- por `development_units.id`. O vínculo entre os dois é gravado UMA vez, pelo
-- admin, em `development_unit_uau`, e depois NUNCA mais por nome: a situação é
-- lida pela chave. A sugestão de pares (mesma chave da tabela de preço,
-- "Bloco 01 Apto 001" = "Bloco 1"/"001") é feita no aplicativo
-- (`src/features/disponibilidade/chaveUau.ts`) e conferida de novo aqui.
--
-- Se o UAU renumerar a unidade (o identificador do vínculo deixa de bater com o
-- atual), a unidade volta a `sem_vinculo` até o admin confirmar: na dúvida,
-- sem cor — nunca a cor de outra unidade.
--
-- QUEM ESCREVE
-- ---------------------------------------------------------------------------
--   * o espelho (`uau_unidades`): só a Edge Function, com service role, pela
--     RPC `uau_aplicar_leitura`;
--   * os vínculos e as obras: só o admin do POUP, pelas RPCs `uau_salvar_*`;
--   * a disponibilidade (`development_unit_disponibilidade`): só o banco, por
--     gatilho. É a tabela que o aplicativo lê e assina pelo Realtime.
--
-- O UAU É SÓ LIDO. Nada aqui (nem nas Edge Functions) altera o ERP: as
-- funções do UAU-disponibilidade têm uma lista fechada de rotas de CONSULTA e
-- recusam qualquer outra antes de abrir conexão. O POUP só sinaliza
-- disponibilidade e mostra o valor de venda — e só isso.
--
-- O PREÇO (seção 12): o admin escolhe, por empreendimento, de onde vem o valor
-- de venda — `automatico` (a tabela de preço enviada, se houver; senão o valor
-- do UAU), `tabela` ou `uau`.
--
-- DEPENDE DE: 20260924150000_blocos_e_unidades.sql (development_units,
--             pode_ler_empreendimento, pode_editar_empreendimento) e de
--             is_app_admin (0018).
-- MIGRATION IDEMPOTENTE. Rode inteira no SQL Editor do Supabase.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A OBRA DO UAU DE CADA EMPREENDIMENTO
-- ---------------------------------------------------------------------------
-- Uma obra do UAU pertence a um empreendimento só: o índice único impede que
-- dois empreendimentos do catálogo leiam a mesma obra (e mostrem a mesma
-- unidade como sendo de dois lugares).

create table if not exists public.development_uau_obras (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  uau_empresa integer not null check (uau_empresa between 1 and 9999),
  -- O código vai dentro de um WHERE do UAU: só letra maiúscula e número, sem
  -- aspas possíveis (ver a Edge Function).
  uau_obra text not null check (uau_obra ~ '^[A-Z0-9]{1,10}$'),
  ativo boolean not null default true,
  ultimo_leve_em timestamptz,
  ultimo_completo_em timestamptz,
  ultimo_erro text,
  ultimo_erro_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists development_uau_obras_unica
  on public.development_uau_obras (uau_empresa, uau_obra);
create index if not exists development_uau_obras_por_empreendimento
  on public.development_uau_obras (development_id);

comment on table public.development_uau_obras is
  'Obra do UAU (empresa/obra) de onde vem a disponibilidade de um empreendimento. Escrita só por uau_salvar_obra (admin).';


-- ---------------------------------------------------------------------------
-- 2. O ESPELHO DO UAU
-- ---------------------------------------------------------------------------
-- Uma linha por unidade do UAU, como a API a devolve. Só é REGRAVADA quando
-- algo muda: uma leitura por minuto que regravasse todas as linhas encheria o
-- banco de escrita sem notícia nenhuma (foi exatamente o que derrubou o
-- ALPHA em 13/10/2026 — um campo que mudava a cada leitura).

create table if not exists public.uau_unidades (
  uau_empresa integer not null,
  uau_produto integer not null,
  uau_num_per integer not null,
  uau_obra text not null,
  identificador text,
  status_codigo smallint,
  status_descricao text,
  codigo_planta text,
  valor_tabela numeric(14, 2),
  num_venda integer,
  data_entrega_chaves date,
  espelho_top integer,
  espelho_left integer,
  -- Quando o status mudou pela última vez (o que a tela pode mostrar: "vendida
  -- há 3 min"). `visto_em` não existe de propósito: atualizar a cada leitura é
  -- regravar a linha a cada leitura. O frescor mora na obra.
  status_mudou_em timestamptz not null default now(),
  -- Sumiu da leitura COMPLETA da obra (unidade apagada no UAU).
  ausente_desde timestamptz,
  atualizado_em timestamptz not null default now(),
  -- Última conferência PEDIDA (o "conferir agora" do corretor). Só é gravada
  -- nesse caso, que é raro; serve de freio para o toque repetido.
  conferido_em timestamptz,
  primary key (uau_empresa, uau_produto, uau_num_per)
);

alter table public.uau_unidades add column if not exists conferido_em timestamptz;

create index if not exists uau_unidades_por_obra on public.uau_unidades (uau_empresa, uau_obra);

comment on table public.uau_unidades is
  'Espelho das unidades do UAU (Espelho de vendas). Chave = Empresa_unid/Prod_unid/NumPer_unid. Escrita só por uau_aplicar_leitura (service role).';


-- ---------------------------------------------------------------------------
-- 3. O QUE CADA STATUS DO UAU SIGNIFICA AQUI
-- ---------------------------------------------------------------------------
-- Códigos e nomes conferidos no UAU da Canopus (20/10/2026). Status novo que
-- aparecer numa leitura entra sozinho como `indisponivel` com `revisar = true`
-- — cinza até o admin classificar, e não verde por padrão.

create table if not exists public.uau_status_situacao (
  status_codigo smallint primary key,
  descricao text not null default '',
  situacao text not null check (situacao in ('disponivel', 'negociacao', 'vendida', 'indisponivel')),
  revisar boolean not null default false,
  atualizado_em timestamptz not null default now()
);

insert into public.uau_status_situacao (status_codigo, descricao, situacao) values
  (0, 'Disponível', 'disponivel'),
  (1, 'Vendida', 'vendida'),
  (2, 'Reservado', 'negociacao'),
  (3, 'Proposta', 'negociacao'),
  (4, 'Quitado', 'vendida'),
  (8, 'Fora de venda', 'indisponivel')
on conflict (status_codigo) do nothing;

comment on table public.uau_status_situacao is
  'Status do UAU (Vendido_unid) → situação do POUP. O admin reclassifica; status novo entra como indisponivel/revisar.';


-- ---------------------------------------------------------------------------
-- 4. O VÍNCULO UNIDADE DO POUP ↔ UNIDADE DO UAU
-- ---------------------------------------------------------------------------
-- 1 para 1 nos dois sentidos: a chave primária (unit_id) e o único da chave do
-- UAU. Unidade do POUP apagada ou recriada (código mudou no cadastro de
-- blocos) leva o vínculo junto, pelo cascade — e volta para a lista de "só no
-- POUP" da conferência, em vez de herdar a cor de outra.

create table if not exists public.development_unit_uau (
  unit_id uuid primary key references public.development_units(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  uau_empresa integer not null,
  uau_produto integer not null,
  uau_num_per integer not null,
  -- O identificador do UAU no momento do vínculo. Se o UAU renumerar, o
  -- vínculo fica suspenso até o admin confirmar de novo.
  identificador_no_vinculo text not null,
  origem text not null check (origem in ('automatico', 'manual', 'criado_do_uau')),
  vinculado_por uuid,
  vinculado_em timestamptz not null default now(),
  unique (uau_empresa, uau_produto, uau_num_per),
  foreign key (uau_empresa, uau_produto, uau_num_per)
    references public.uau_unidades (uau_empresa, uau_produto, uau_num_per) on delete cascade
);

create index if not exists development_unit_uau_por_empreendimento
  on public.development_unit_uau (development_id);


-- ---------------------------------------------------------------------------
-- 5. A DISPONIBILIDADE QUE O APLICATIVO LÊ (E ASSINA)
-- ---------------------------------------------------------------------------
-- Pequena de propósito: só o que pinta a célula. É a única tabela desta
-- migration no Realtime, e ela só recebe escrita quando a situação MUDA — o
-- corretor recebe um evento por venda, não um por leitura.
--
-- Desvincular não apaga a linha: vira `sem_vinculo`. Um DELETE não pode ser
-- filtrado por empreendimento no Realtime; um UPDATE pode.

create table if not exists public.development_unit_disponibilidade (
  unit_id uuid primary key references public.development_units(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  situacao text not null
    check (situacao in ('disponivel', 'negociacao', 'vendida', 'indisponivel', 'sem_vinculo')),
  status_descricao text,
  mudou_em timestamptz not null default now()
);

create index if not exists development_unit_disponibilidade_por_empreendimento
  on public.development_unit_disponibilidade (development_id);


-- ---------------------------------------------------------------------------
-- 6. REGISTRO DAS LEITURAS E A TRAVA DE UMA LEITURA POR VEZ
-- ---------------------------------------------------------------------------

create table if not exists public.uau_sync_log (
  id bigint generated always as identity primary key,
  modo text not null,
  iniciado_em timestamptz not null default now(),
  terminado_em timestamptz,
  ok boolean,
  obras integer,
  lidas integer,
  mudaram integer,
  erro text,
  detalhe jsonb
);

create index if not exists uau_sync_log_recentes on public.uau_sync_log (iniciado_em desc);

-- O cron chama de minuto em minuto; uma leitura lenta do UAU não pode se
-- sobrepor à seguinte (as duas gravariam a mesma obra ao mesmo tempo).
create table if not exists public.uau_sync_trava (
  modo text primary key,
  desde timestamptz not null
);


-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------

alter table public.development_uau_obras enable row level security;
alter table public.uau_unidades enable row level security;
alter table public.uau_status_situacao enable row level security;
alter table public.development_unit_uau enable row level security;
alter table public.development_unit_disponibilidade enable row level security;
alter table public.uau_sync_log enable row level security;
alter table public.uau_sync_trava enable row level security;

revoke all on public.development_uau_obras, public.uau_unidades, public.uau_status_situacao,
  public.development_unit_uau, public.development_unit_disponibilidade, public.uau_sync_log,
  public.uau_sync_trava
  from public, anon, authenticated;

grant all on public.development_uau_obras, public.uau_unidades, public.uau_status_situacao,
  public.development_unit_uau, public.development_unit_disponibilidade, public.uau_sync_log,
  public.uau_sync_trava
  to service_role;

-- Leitura. Escrita de authenticated: nenhuma direta — só pelas RPCs abaixo.
grant select on public.development_uau_obras, public.development_unit_disponibilidade,
  public.uau_status_situacao, public.uau_unidades, public.development_unit_uau, public.uau_sync_log
  to authenticated;

-- Quem lê o empreendimento vê de onde vem a disponibilidade e quando foi lida
-- (o "atualizado há 40 s" da tela).
drop policy if exists "uau_obras_select" on public.development_uau_obras;
create policy "uau_obras_select" on public.development_uau_obras for select to authenticated
  using (public.pode_ler_empreendimento(development_id));

drop policy if exists "disponibilidade_select" on public.development_unit_disponibilidade;
create policy "disponibilidade_select" on public.development_unit_disponibilidade for select to authenticated
  using (public.pode_ler_empreendimento(development_id));

drop policy if exists "uau_status_select" on public.uau_status_situacao;
create policy "uau_status_select" on public.uau_status_situacao for select to authenticated
  using (true);

-- O espelho cru, os vínculos e o registro: só o admin.
drop policy if exists "uau_unidades_select_admin" on public.uau_unidades;
create policy "uau_unidades_select_admin" on public.uau_unidades for select to authenticated
  using (public.is_app_admin());

drop policy if exists "unit_uau_select_admin" on public.development_unit_uau;
create policy "unit_uau_select_admin" on public.development_unit_uau for select to authenticated
  using (public.is_app_admin());

drop policy if exists "uau_sync_log_select_admin" on public.uau_sync_log;
create policy "uau_sync_log_select_admin" on public.uau_sync_log for select to authenticated
  using (public.is_app_admin());


-- ---------------------------------------------------------------------------
-- 8. RECALCULAR A DISPONIBILIDADE DE UNIDADES
-- ---------------------------------------------------------------------------
-- O único lugar que escreve em development_unit_disponibilidade. Só grava o
-- que mudou (`where ... is distinct from`): sem mudança, sem evento.

create or replace function public.uau_mesmo_identificador(a text, b text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select upper(regexp_replace(btrim(coalesce(a, '')), '\s+', ' ', 'g'))
       = upper(regexp_replace(btrim(coalesce(b, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.uau_recalcular_disponibilidade(p_units uuid[])
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
             when v.unit_id is null then 'sem_vinculo'
             -- Renumerado no UAU: suspenso até o admin confirmar.
             when not public.uau_mesmo_identificador(v.identificador_no_vinculo, u.identificador) then 'sem_vinculo'
             when u.ausente_desde is not null then 'indisponivel'
             else coalesce(s.situacao, 'indisponivel')
           end as situacao,
           case
             when v.unit_id is null then null
             when not public.uau_mesmo_identificador(v.identificador_no_vinculo, u.identificador) then null
             else coalesce(nullif(u.status_descricao, ''), s.descricao)
           end as descricao
      from public.development_units du
      left join public.development_unit_uau v on v.unit_id = du.id
      left join public.uau_unidades u
        on u.uau_empresa = v.uau_empresa and u.uau_produto = v.uau_produto and u.uau_num_per = v.uau_num_per
      left join public.uau_status_situacao s on s.status_codigo = u.status_codigo
     where du.id = any (p_units)
  )
  insert into public.development_unit_disponibilidade as d (unit_id, development_id, situacao, status_descricao, mudou_em)
  select a.unit_id, a.development_id, a.situacao, a.descricao, now()
    from alvo a
   -- Unidade que nunca teve vínculo não ganha linha: a tela já a trata como
   -- "sem dado". Linha só nasce quando há o que mostrar.
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

revoke all on function public.uau_recalcular_disponibilidade(uuid[]) from public, anon, authenticated;
grant execute on function public.uau_recalcular_disponibilidade(uuid[]) to service_role;

-- O espelho mudou → as unidades vinculadas às linhas que mudaram. Gatilho de
-- comando (uma vez por leitura), não de linha: uma leitura completa toca
-- centenas de unidades de uma vez.
create or replace function public.uau_trg_unidades_mudaram()
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
    join antigos o
      on o.uau_empresa = n.uau_empresa and o.uau_produto = n.uau_produto and o.uau_num_per = n.uau_num_per
    join public.development_unit_uau l
      on l.uau_empresa = n.uau_empresa and l.uau_produto = n.uau_produto and l.uau_num_per = n.uau_num_per
   where n.status_codigo is distinct from o.status_codigo
      or n.status_descricao is distinct from o.status_descricao
      or n.ausente_desde is distinct from o.ausente_desde
      or n.identificador is distinct from o.identificador;
  perform public.uau_recalcular_disponibilidade(v);
  return null;
end;
$$;

drop trigger if exists uau_unidades_mudaram on public.uau_unidades;
create trigger uau_unidades_mudaram
  after update on public.uau_unidades
  referencing old table as antigos new table as novos
  for each statement execute function public.uau_trg_unidades_mudaram();

-- O admin reclassificou um status (ex.: "Reservado" passa a ser vermelho) →
-- todas as unidades com esse status.
create or replace function public.uau_trg_status_mudou()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.situacao is distinct from old.situacao or new.descricao is distinct from old.descricao then
    perform public.uau_recalcular_disponibilidade(array(
      select l.unit_id
        from public.development_unit_uau l
        join public.uau_unidades u
          on u.uau_empresa = l.uau_empresa and u.uau_produto = l.uau_produto and u.uau_num_per = l.uau_num_per
       where u.status_codigo = new.status_codigo
    ));
  end if;
  return null;
end;
$$;

drop trigger if exists uau_status_mudou on public.uau_status_situacao;
create trigger uau_status_mudou
  after update on public.uau_status_situacao
  for each row execute function public.uau_trg_status_mudou();


-- ---------------------------------------------------------------------------
-- 9. A LEITURA DO UAU ENTRA AQUI (SÓ A EDGE FUNCTION)
-- ---------------------------------------------------------------------------
-- p_modo:
--   'completo' — todas as unidades da obra. Atualiza tudo; quem não veio é
--                marcado ausente (apagado no UAU).
--   'leve'     — só as NÃO vendidas (`Vendido_unid NOT IN p_codigos_fora`),
--                de minuto em minuto. Quem estava fora desse conjunto e
--                sumiu dele foi vendido: vira p_codigo_vendida até a próxima
--                leitura completa dizer se é Vendida ou Quitado (os dois são
--                vermelhos).
--   'pontual'  — uma ou poucas unidades (o "conferir agora" do corretor,
--                antes de fechar a proposta). Atualiza só o que veio; não
--                marca ninguém como sumido e não mexe no frescor da obra.
--
-- A TRAVA CONTRA A LEITURA QUEBRADA: uma resposta vazia ou cortada do UAU não
-- pode virar "tudo vendido". Se mais de 30% das unidades (e mais de 5)
-- sumirem de uma vez, nada é marcado e a leitura volta `suspeita` — a próxima
-- completa decide.
--
-- p_unidades: [{ "produto": 366, "num_per": 1, "identificador": "Bloco 01 Apto 001",
--                "status": 0, "descricao": "Disponível" | null, "planta": "2VR03" | null,
--                "valor": 231500 | null, "num_venda": 53 | null,
--                "entrega_chaves": "2028-09-28" | null, "top": 22050 | null, "left": 5700 | null }]

create or replace function public.uau_aplicar_leitura(
  p_empresa integer,
  p_obra text,
  p_modo text,
  p_unidades jsonb,
  p_codigos_fora smallint[] default '{1,4}',
  p_codigo_vendida smallint default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lidas integer;
  v_mudaram integer := 0;
  v_novas integer := 0;
  v_sumiram integer := 0;
  v_base integer;
  v_suspeita boolean := false;
begin
  if p_empresa is null or p_obra is null or p_obra !~ '^[A-Z0-9]{1,10}$' then
    raise exception 'obra_invalida' using errcode = '22023';
  end if;
  if p_modo is null or p_modo not in ('leve', 'completo', 'pontual') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if p_unidades is null or jsonb_typeof(p_unidades) <> 'array' then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;

  create temp table if not exists _uau_leitura (
    produto integer, num_per integer, identificador text, status smallint, descricao text,
    planta text, valor numeric(14, 2), num_venda integer, entrega_chaves date, top integer, "left" integer
  ) on commit drop;
  -- `if not exists` + reaproveitamento na mesma transação: esvazia antes.
  delete from _uau_leitura where true;

  insert into _uau_leitura
  select distinct on (x.produto, x.num_per)
         x.produto, x.num_per, nullif(btrim(x.identificador), ''), x.status, nullif(btrim(x.descricao), ''),
         nullif(btrim(x.planta), ''), x.valor, x.num_venda, x.entrega_chaves, x.top, x."left"
    from jsonb_to_recordset(p_unidades) as x(
           produto integer, num_per integer, identificador text, status smallint, descricao text,
           planta text, valor numeric, num_venda integer, entrega_chaves date, top integer, "left" integer)
   where x.produto is not null and x.num_per is not null;
  get diagnostics v_lidas = row_count;

  -- Status que o banco ainda não conhece: entra cinza, para revisar.
  insert into public.uau_status_situacao (status_codigo, descricao, situacao, revisar)
  select distinct l.status, coalesce(l.descricao, ''), 'indisponivel', true
    from _uau_leitura l
   where l.status is not null
  on conflict (status_codigo) do nothing;

  -- Unidades novas no espelho.
  insert into public.uau_unidades as u (
    uau_empresa, uau_produto, uau_num_per, uau_obra, identificador, status_codigo, status_descricao,
    codigo_planta, valor_tabela, num_venda, data_entrega_chaves, espelho_top, espelho_left)
  select p_empresa, l.produto, l.num_per, p_obra, l.identificador, l.status,
         coalesce(l.descricao, (select s.descricao from public.uau_status_situacao s where s.status_codigo = l.status)),
         l.planta, l.valor, l.num_venda, l.entrega_chaves, l.top, l."left"
    from _uau_leitura l
  on conflict (uau_empresa, uau_produto, uau_num_per) do nothing;
  get diagnostics v_novas = row_count;

  -- Unidades que mudaram. A leve não traz preço nem descrição (rota sem
  -- `data_tabela_preco`): ela só mexe no status e no identificador, e a
  -- descrição acompanha o status pela tabela de situações.
  if p_modo in ('completo', 'pontual') then
    update public.uau_unidades u
       set uau_obra = p_obra,
           identificador = l.identificador,
           status_codigo = l.status,
           status_descricao = coalesce(l.descricao, s.descricao),
           codigo_planta = l.planta,
           valor_tabela = l.valor,
           num_venda = l.num_venda,
           data_entrega_chaves = l.entrega_chaves,
           espelho_top = l.top,
           espelho_left = l."left",
           ausente_desde = null,
           status_mudou_em = case when u.status_codigo is distinct from l.status then now() else u.status_mudou_em end,
           atualizado_em = now()
      from _uau_leitura l
      left join public.uau_status_situacao s on s.status_codigo = l.status
     where u.uau_empresa = p_empresa and u.uau_produto = l.produto and u.uau_num_per = l.num_per
       and (u.uau_obra, u.identificador, u.status_codigo, u.status_descricao, u.codigo_planta, u.valor_tabela,
            u.num_venda, u.data_entrega_chaves, u.espelho_top, u.espelho_left, u.ausente_desde)
           is distinct from
           (p_obra, l.identificador, l.status, coalesce(l.descricao, s.descricao), l.planta, l.valor,
            l.num_venda, l.entrega_chaves, l.top, l."left", null::timestamptz);
  else
    update public.uau_unidades u
       set identificador = l.identificador,
           status_codigo = l.status,
           status_descricao = case when u.status_codigo is distinct from l.status then s.descricao else u.status_descricao end,
           ausente_desde = null,
           status_mudou_em = case when u.status_codigo is distinct from l.status then now() else u.status_mudou_em end,
           atualizado_em = now()
      from _uau_leitura l
      left join public.uau_status_situacao s on s.status_codigo = l.status
     where u.uau_empresa = p_empresa and u.uau_produto = l.produto and u.uau_num_per = l.num_per
       and (u.identificador, u.status_codigo, u.ausente_desde) is distinct from (l.identificador, l.status, null::timestamptz);
  end if;
  get diagnostics v_mudaram = row_count;

  -- Quem sumiu da leitura. A base é o conjunto que DEVIA ter vindo.
  if p_modo = 'pontual' then
    v_base := 0;
    v_sumiram := 0;
    update public.uau_unidades u
       set conferido_em = now()
      from _uau_leitura l
     where u.uau_empresa = p_empresa and u.uau_produto = l.produto and u.uau_num_per = l.num_per;
  elsif p_modo = 'completo' then
    select count(*) into v_base
      from public.uau_unidades u
     where u.uau_empresa = p_empresa and u.uau_obra = p_obra and u.ausente_desde is null;
    select count(*) into v_sumiram
      from public.uau_unidades u
     where u.uau_empresa = p_empresa and u.uau_obra = p_obra and u.ausente_desde is null
       and not exists (select 1 from _uau_leitura l where l.produto = u.uau_produto and l.num_per = u.uau_num_per);
  else
    select count(*) into v_base
      from public.uau_unidades u
     where u.uau_empresa = p_empresa and u.uau_obra = p_obra and u.ausente_desde is null
       and not (coalesce(u.status_codigo, -1) = any (p_codigos_fora));
    select count(*) into v_sumiram
      from public.uau_unidades u
     where u.uau_empresa = p_empresa and u.uau_obra = p_obra and u.ausente_desde is null
       and not (coalesce(u.status_codigo, -1) = any (p_codigos_fora))
       and not exists (select 1 from _uau_leitura l where l.produto = u.uau_produto and l.num_per = u.uau_num_per);
  end if;

  v_suspeita := v_sumiram > 5 and v_sumiram > v_base * 0.3;

  if v_sumiram > 0 and not v_suspeita then
    if p_modo = 'completo' then
      update public.uau_unidades u
         set ausente_desde = now(), atualizado_em = now()
       where u.uau_empresa = p_empresa and u.uau_obra = p_obra and u.ausente_desde is null
         and not exists (select 1 from _uau_leitura l where l.produto = u.uau_produto and l.num_per = u.uau_num_per);
    else
      update public.uau_unidades u
         set status_codigo = p_codigo_vendida,
             status_descricao = (select s.descricao from public.uau_status_situacao s where s.status_codigo = p_codigo_vendida),
             status_mudou_em = now(),
             atualizado_em = now()
       where u.uau_empresa = p_empresa and u.uau_obra = p_obra and u.ausente_desde is null
         and not (coalesce(u.status_codigo, -1) = any (p_codigos_fora))
         and not exists (select 1 from _uau_leitura l where l.produto = u.uau_produto and l.num_per = u.uau_num_per);
    end if;
  end if;

  if p_modo <> 'pontual' then
    update public.development_uau_obras o
       set ultimo_leve_em = case when p_modo = 'leve' then now() else o.ultimo_leve_em end,
           -- A completa também é uma leitura fresca do status: o frescor que a
           -- tela mostra é o maior dos dois.
           ultimo_completo_em = case when p_modo = 'completo' then now() else o.ultimo_completo_em end,
           ultimo_erro = null,
           ultimo_erro_em = null,
           updated_at = now()
     where o.uau_empresa = p_empresa and o.uau_obra = p_obra;
  end if;

  return jsonb_build_object(
    'lidas', v_lidas, 'novas', v_novas, 'mudaram', v_mudaram,
    'sumiram', v_sumiram, 'suspeita', v_suspeita);
end;
$$;

revoke all on function public.uau_aplicar_leitura(integer, text, text, jsonb, smallint[], smallint)
  from public, anon, authenticated;
grant execute on function public.uau_aplicar_leitura(integer, text, text, jsonb, smallint[], smallint)
  to service_role;

-- Os códigos que a leitura leve deixa de fora (os "vendidos"), e o código que
-- ela usa para quem saiu do conjunto. Do banco, para a Edge Function e esta
-- migration nunca discordarem.
create or replace function public.uau_codigos_vendidos()
returns smallint[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(status_codigo order by status_codigo), '{1,4}')
    from public.uau_status_situacao
   where situacao = 'vendida';
$$;

revoke all on function public.uau_codigos_vendidos() from public, anon, authenticated;
grant execute on function public.uau_codigos_vendidos() to service_role;

create or replace function public.uau_registrar_erro(p_empresa integer, p_obra text, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.development_uau_obras
     set ultimo_erro = left(p_erro, 1000), ultimo_erro_em = now(), updated_at = now()
   where uau_empresa = p_empresa and uau_obra = p_obra;
$$;

revoke all on function public.uau_registrar_erro(integer, text, text) from public, anon, authenticated;
grant execute on function public.uau_registrar_erro(integer, text, text) to service_role;

-- Uma leitura de cada modo por vez. Devolve false se outra começou há menos
-- de p_prazo (e ainda não terminou).
create or replace function public.uau_sync_iniciar(p_modo text, p_prazo interval default interval '3 minutes')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  insert into public.uau_sync_trava as t (modo, desde) values (p_modo, now())
  on conflict (modo) do update set desde = now()
   where t.desde < now() - p_prazo
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.uau_sync_terminar(p_modo text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.uau_sync_trava set desde = '-infinity' where modo = p_modo;
$$;

revoke all on function public.uau_sync_iniciar(text, interval), public.uau_sync_terminar(text)
  from public, anon, authenticated;
grant execute on function public.uau_sync_iniciar(text, interval), public.uau_sync_terminar(text)
  to service_role;


-- ---------------------------------------------------------------------------
-- 10. O ADMIN: OBRA, CONFERÊNCIA E VÍNCULOS
-- ---------------------------------------------------------------------------
-- Security definer porque as tabelas não têm escrita para authenticated; a
-- permissão é conferida primeiro, com as mesmas funções das policies. Erros
-- saem como código, como em `salvar_blocos_empreendimento`.

create or replace function public.uau_exigir_admin(p_development uuid)
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

revoke all on function public.uau_exigir_admin(uuid) from public, anon;
grant execute on function public.uau_exigir_admin(uuid) to authenticated, service_role;

create or replace function public.uau_salvar_obra(
  p_development uuid, p_empresa integer, p_obra text, p_ativo boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_obra text := upper(btrim(coalesce(p_obra, '')));
  v_id uuid;
  v_dono uuid;
begin
  perform public.uau_exigir_admin(p_development);
  if p_empresa is null or p_empresa not between 1 and 9999 or v_obra !~ '^[A-Z0-9]{1,10}$' then
    raise exception 'obra_invalida' using errcode = '22023';
  end if;

  select development_id into v_dono
    from public.development_uau_obras where uau_empresa = p_empresa and uau_obra = v_obra;
  if v_dono is not null and v_dono <> p_development then
    raise exception 'obra_de_outro_empreendimento' using errcode = '23505';
  end if;

  insert into public.development_uau_obras as o (development_id, uau_empresa, uau_obra, ativo)
  values (p_development, p_empresa, v_obra, coalesce(p_ativo, true))
  on conflict (uau_empresa, uau_obra) do update
     set ativo = excluded.ativo, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Tira a obra do empreendimento: os vínculos das unidades dela saem junto, e
-- as células voltam a `sem_vinculo` (evento de UPDATE para quem está olhando).
create or replace function public.uau_remover_obra(p_development uuid, p_empresa integer, p_obra text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_units uuid[];
begin
  perform public.uau_exigir_admin(p_development);
  select array_agg(l.unit_id) into v_units
    from public.development_unit_uau l
    join public.uau_unidades u
      on u.uau_empresa = l.uau_empresa and u.uau_produto = l.uau_produto and u.uau_num_per = l.uau_num_per
   where l.development_id = p_development and u.uau_empresa = p_empresa and u.uau_obra = upper(btrim(p_obra));

  delete from public.development_unit_uau where unit_id = any (coalesce(v_units, '{}'));
  delete from public.development_uau_obras
   where development_id = p_development and uau_empresa = p_empresa and uau_obra = upper(btrim(p_obra));
  perform public.uau_recalcular_disponibilidade(v_units);
  return coalesce(cardinality(v_units), 0);
end;
$$;

-- Tudo que a tela de conferência precisa, numa chamada: as unidades do POUP,
-- as do UAU (das obras deste empreendimento) e os vínculos de hoje.
create or replace function public.uau_conferencia(p_development uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.uau_exigir_admin(p_development);
  return jsonb_build_object(
    'obras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'empresa', o.uau_empresa, 'obra', o.uau_obra, 'ativo', o.ativo,
               'ultimoLeveEm', o.ultimo_leve_em, 'ultimoCompletoEm', o.ultimo_completo_em,
               'ultimoErro', o.ultimo_erro, 'ultimoErroEm', o.ultimo_erro_em) order by o.uau_empresa, o.uau_obra)
        from public.development_uau_obras o where o.development_id = p_development), '[]'::jsonb),
    'poup', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', du.id, 'bloco', b.nome, 'codigo', du.codigo, 'pavimento', du.pavimento)
               order by b.ordem, du.pavimento, du.ordem)
        from public.development_units du
        join public.development_blocks b on b.id = du.block_id
       where du.development_id = p_development), '[]'::jsonb),
    'uau', coalesce((
      select jsonb_agg(jsonb_build_object(
               'empresa', u.uau_empresa, 'produto', u.uau_produto, 'numPer', u.uau_num_per, 'obra', u.uau_obra,
               'identificador', u.identificador, 'statusCodigo', u.status_codigo,
               'statusDescricao', u.status_descricao, 'ausente', u.ausente_desde is not null)
               order by u.uau_obra, u.uau_produto, u.uau_num_per)
        from public.uau_unidades u
        join public.development_uau_obras o on o.uau_empresa = u.uau_empresa and o.uau_obra = u.uau_obra
       where o.development_id = p_development), '[]'::jsonb),
    'vinculos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'unitId', l.unit_id,
               'chave', l.uau_empresa || '/' || l.uau_produto || '/' || l.uau_num_per,
               'identificadorNoVinculo', l.identificador_no_vinculo,
               'identificadorAtual', u.identificador,
               'origem', l.origem, 'vinculadoEm', l.vinculado_em))
        from public.development_unit_uau l
        join public.uau_unidades u
          on u.uau_empresa = l.uau_empresa and u.uau_produto = l.uau_produto and u.uau_num_per = l.uau_num_per
       where l.development_id = p_development), '[]'::jsonb)
  );
end;
$$;

-- Grava os pares confirmados pelo admin. Confere TUDO de novo: a unidade é
-- deste empreendimento; a unidade do UAU existe no espelho e é de uma obra
-- deste empreendimento; nenhum dos dois lados fica com dois pares.
--
--   p_vinculos: [{ "unitId": "<uuid>", "empresa": 1, "produto": 366, "numPer": 1,
--                  "origem": "automatico" | "manual" | "criado_do_uau" }]
--   p_remover:  unit_ids a desvincular.
create or replace function public.uau_salvar_vinculos(p_development uuid, p_vinculos jsonb, p_remover uuid[] default '{}')
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
  v_afetadas uuid[];
begin
  perform public.uau_exigir_admin(p_development);
  if p_vinculos is null or jsonb_typeof(p_vinculos) <> 'array' or jsonb_array_length(p_vinculos) > 5000 then
    raise exception 'formato_invalido' using errcode = '22023';
  end if;

  create temp table if not exists _vinc (
    unit_id uuid, empresa integer, produto integer, num_per integer, origem text
  ) on commit drop;
  delete from _vinc where true;

  begin
    insert into _vinc
    select x."unitId", x.empresa, x.produto, x."numPer", coalesce(x.origem, 'manual')
      from jsonb_to_recordset(p_vinculos) as x("unitId" uuid, empresa integer, produto integer, "numPer" integer, origem text);
  exception when invalid_text_representation or datatype_mismatch then
    raise exception 'formato_invalido' using errcode = '22023';
  end;
  select count(*) into v_qtd from _vinc;

  select count(*) into v_validos
    from _vinc v
    join public.development_units du on du.id = v.unit_id and du.development_id = p_development
    join public.uau_unidades u on u.uau_empresa = v.empresa and u.uau_produto = v.produto and u.uau_num_per = v.num_per
    join public.development_uau_obras o
      on o.development_id = p_development and o.uau_empresa = u.uau_empresa and o.uau_obra = u.uau_obra
   where v.origem in ('automatico', 'manual', 'criado_do_uau');
  if v_validos <> v_qtd then
    raise exception 'vinculo_invalido' using errcode = '22023';
  end if;
  if (select count(distinct unit_id) from _vinc) <> v_qtd
     or (select count(distinct (empresa, produto, num_per)) from _vinc) <> v_qtd then
    raise exception 'vinculo_repetido' using errcode = '22023';
  end if;

  select array_agg(distinct x) into v_afetadas
    from (select unit_id as x from _vinc union select unnest(coalesce(p_remover, '{}'))) t;

  delete from public.development_unit_uau
   where development_id = p_development
     and (unit_id = any (coalesce(p_remover, '{}')) or unit_id in (select unit_id from _vinc));
  get diagnostics v_removidos = row_count;

  begin
    insert into public.development_unit_uau
      (unit_id, development_id, uau_empresa, uau_produto, uau_num_per, identificador_no_vinculo, origem, vinculado_por)
    select v.unit_id, p_development, v.empresa, v.produto, v.num_per, coalesce(u.identificador, ''), v.origem, auth.uid()
      from _vinc v
      join public.uau_unidades u on u.uau_empresa = v.empresa and u.uau_produto = v.produto and u.uau_num_per = v.num_per;
    get diagnostics v_gravados = row_count;
  exception when unique_violation then
    -- A unidade do UAU já está vinculada a outra unidade (de outro bloco ou
    -- de outro empreendimento). Nada é gravado: o admin decide qual vale.
    raise exception 'unidade_uau_ja_vinculada' using errcode = '23505';
  end;

  perform public.uau_recalcular_disponibilidade(v_afetadas);
  return jsonb_build_object('gravados', v_gravados, 'removidos', v_removidos);
end;
$$;

revoke all on function public.uau_salvar_obra(uuid, integer, text, boolean),
  public.uau_remover_obra(uuid, integer, text),
  public.uau_conferencia(uuid),
  public.uau_salvar_vinculos(uuid, jsonb, uuid[])
  from public, anon;
grant execute on function public.uau_salvar_obra(uuid, integer, text, boolean),
  public.uau_remover_obra(uuid, integer, text),
  public.uau_conferencia(uuid),
  public.uau_salvar_vinculos(uuid, jsonb, uuid[])
  to authenticated, service_role;

-- O admin reclassifica um status ("Reservado" passa a ser vermelho, um código
-- novo que entrou cinza vira amarelo).
create or replace function public.uau_classificar_status(p_codigo smallint, p_situacao text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_situacao not in ('disponivel', 'negociacao', 'vendida', 'indisponivel') then
    raise exception 'situacao_invalida' using errcode = '22023';
  end if;
  update public.uau_status_situacao
     set situacao = p_situacao, revisar = false, atualizado_em = now()
   where status_codigo = p_codigo;
  if not found then
    raise exception 'status_desconhecido' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.uau_classificar_status(smallint, text) from public, anon;
grant execute on function public.uau_classificar_status(smallint, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 11. O CORRETOR: A FOTO INICIAL
-- ---------------------------------------------------------------------------
-- Uma chamada ao abrir o empreendimento; depois, o Realtime manda só o que
-- muda. `atualizadoEm` é a leitura MAIS ANTIGA entre as obras ativas: se uma
-- delas parou, a tela avisa — a média esconderia.

create or replace function public.uau_disponibilidade(p_development uuid)
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
    'temUau', exists (select 1 from public.development_uau_obras o where o.development_id = p_development and o.ativo),
    'atualizadoEm', (
      select min(greatest(o.ultimo_leve_em, o.ultimo_completo_em))
        from public.development_uau_obras o where o.development_id = p_development and o.ativo),
    'fontePreco', (select d.uau_fonte_preco from public.developments d where d.id = p_development),
    -- O valor do UAU vai junto, pela MESMA chave do vínculo e só quando a
    -- situação também iria (vínculo válido): unidade sem cor, sem preço do UAU.
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object(
               'unitId', d.unit_id, 'situacao', d.situacao,
               'statusDescricao', d.status_descricao, 'mudouEm', d.mudou_em,
               'valorUau', u.valor_tabela))
        from public.development_unit_disponibilidade d
        left join public.development_unit_uau l on l.unit_id = d.unit_id
        left join public.uau_unidades u
          on u.uau_empresa = l.uau_empresa and u.uau_produto = l.uau_produto and u.uau_num_per = l.uau_num_per
       where d.development_id = p_development and d.situacao <> 'sem_vinculo'), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.uau_disponibilidade(uuid) from public, anon;
grant execute on function public.uau_disponibilidade(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 12. DE ONDE VEM O VALOR DE VENDA
-- ---------------------------------------------------------------------------
--   automatico  a tabela de preço enviada (PDF/modelo POUP), se houver; senão
--               o valor do UAU. É o padrão: enviar a tabela passa a valer.
--   tabela      só a tabela de preço (sem tabela, sem preço).
--   uau         só o valor do UAU (`ValorTotal` da tabela do dia no ERP).
-- Quem aplica a regra é o aplicativo (ele já tem a tabela em mãos); o banco
-- guarda a escolha e entrega o valor do UAU pela RPC acima.

alter table public.developments
  add column if not exists uau_fonte_preco text not null default 'automatico';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'developments_uau_fonte_preco_valida') then
    alter table public.developments
      add constraint developments_uau_fonte_preco_valida
      check (uau_fonte_preco in ('automatico', 'tabela', 'uau'));
  end if;
end $$;

create or replace function public.uau_definir_fonte_preco(p_development uuid, p_fonte text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.uau_exigir_admin(p_development);
  if p_fonte is null or p_fonte not in ('automatico', 'tabela', 'uau') then
    raise exception 'fonte_invalida' using errcode = '22023';
  end if;
  update public.developments set uau_fonte_preco = p_fonte where id = p_development;
end;
$$;

revoke all on function public.uau_definir_fonte_preco(uuid, text) from public, anon;
grant execute on function public.uau_definir_fonte_preco(uuid, text) to authenticated, service_role;

-- Os empreendimentos que o corretor LÊ e que têm valor do UAU para oferecer
-- (alguma unidade vinculada com valor, e a fonte não é "só tabela"). É o que
-- põe no "Usar tabela de preço" do simulador um empreendimento sem PDF.
create or replace function public.uau_empreendimentos_com_preco()
returns table (development_id uuid, fonte_preco text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.uau_fonte_preco
    from public.developments d
   where d.uau_fonte_preco <> 'tabela'
     and public.pode_ler_empreendimento(d.id)
     and exists (select 1 from public.development_uau_obras o where o.development_id = d.id and o.ativo)
     and exists (
       select 1
         from public.development_unit_uau l
         join public.uau_unidades u
           on u.uau_empresa = l.uau_empresa and u.uau_produto = l.uau_produto and u.uau_num_per = l.uau_num_per
        where l.development_id = d.id and u.valor_tabela is not null
          and public.uau_mesmo_identificador(l.identificador_no_vinculo, u.identificador));
$$;

revoke all on function public.uau_empreendimentos_com_preco() from public, anon;
grant execute on function public.uau_empreendimentos_com_preco() to authenticated, service_role;

-- O painel do admin: as obras vinculadas, com a saúde de cada uma, e os
-- status do UAU que ainda precisam de classificação.
create or replace function public.uau_painel()
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
    'obras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'empresa', o.uau_empresa, 'obra', o.uau_obra, 'ativo', o.ativo,
               'developmentId', o.development_id, 'empreendimento', d.name,
               'fontePreco', d.uau_fonte_preco,
               'ultimoLeveEm', o.ultimo_leve_em, 'ultimoCompletoEm', o.ultimo_completo_em,
               'ultimoErro', o.ultimo_erro, 'ultimoErroEm', o.ultimo_erro_em,
               'vinculadas', (select count(*) from public.development_unit_uau l where l.development_id = o.development_id),
               'noUau', (select count(*) from public.uau_unidades u
                          where u.uau_empresa = o.uau_empresa and u.uau_obra = o.uau_obra and u.ausente_desde is null))
               order by d.name)
        from public.development_uau_obras o
        join public.developments d on d.id = o.development_id), '[]'::jsonb),
    'statusRevisar', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', s.status_codigo, 'descricao', s.descricao, 'situacao', s.situacao)
               order by s.status_codigo)
        from public.uau_status_situacao s where s.revisar), '[]'::jsonb),
    'status', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', s.status_codigo, 'descricao', s.descricao,
                                          'situacao', s.situacao, 'revisar', s.revisar)
               order by s.status_codigo)
        from public.uau_status_situacao s), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.uau_painel() from public, anon;
grant execute on function public.uau_painel() to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 13. REALTIME
-- ---------------------------------------------------------------------------
-- Só a tabela pequena. O Realtime confere a policy de leitura para cada
-- assinante: o corretor só recebe evento de empreendimento que ele lê.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public'
          and tablename = 'development_unit_disponibilidade'
     ) then
    execute 'alter publication supabase_realtime add table public.development_unit_disponibilidade';
  end if;
end $$;


-- ===========================================================================
-- CONFERÊNCIA
-- ===========================================================================
--   select o.uau_empresa || '/' || o.uau_obra as obra, d.name, o.ultimo_leve_em, o.ultimo_completo_em, o.ultimo_erro,
--          (select count(*) from public.development_unit_uau l where l.development_id = o.development_id) as vinculadas
--     from public.development_uau_obras o join public.developments d on d.id = o.development_id;
--
--   select situacao, count(*) from public.development_unit_disponibilidade group by 1;
--   select * from public.uau_status_situacao where revisar;
--   select * from public.uau_sync_log order by id desc limit 20;
--   select uau_fonte_preco, count(*) from public.developments group by 1;
-- ===========================================================================
